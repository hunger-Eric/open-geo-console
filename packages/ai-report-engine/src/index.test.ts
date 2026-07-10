import { describe, expect, it, vi } from "vitest";
import {
  AI_WEBSITE_REPORT_VERSION,
  OpenAiCompatibleClient,
  ReportValidationError,
  analyzePageBatch,
  planPagesWithRecovery,
  parseAiWebsiteReportV1,
  planPages,
  preparePlanningCandidates,
  synthesizeWebsiteReport,
  validateEvidenceCitation,
  verifyReportEvidence,
  type AiWebsiteReportV1,
  type ExtractedPage,
  type JsonCompletionClient,
  type JsonCompletionResult
} from "./index";

function mockClient(values: unknown[], modelId = "mock-model"): JsonCompletionClient {
  let call = 0;
  return {
    configuredModel: modelId,
    completeJson: vi.fn(async (): Promise<JsonCompletionResult> => {
      const value = values[Math.min(call, values.length - 1)];
      call += 1;
      return { value, modelId, rawContent: JSON.stringify(value) };
    })
  };
}

const page: ExtractedPage = {
  url: "https://example.com/",
  pageType: "home",
  title: "Example",
  text: "Example builds evidence-first website reports for modern product teams. Trusted by Acme."
};

function reportModelOutput(findingCount = 1): Record<string, unknown> {
  const evidence = [{ url: page.url, quote: "Example builds evidence-first website reports" }];
  const dimensions = [
    "organizationClarity",
    "informationArchitecture",
    "contentCitability",
    "trustEvidence",
    "entityConsistency",
    "geoUnderstandability"
  ].map((dimension) => ({ dimension, score: 70, explanation: "Grounded explanation", confidence: "high", evidence }));
  return {
    organizationProfile: {
      organizationName: "Example",
      brandNames: ["Example"],
      summary: "Example builds website reports.",
      businessModel: "Software",
      productsAndServices: ["Website reports"],
      targetAudiences: ["Product teams"],
      marketsAndRegions: [],
      legalEntity: null,
      identityConsistency: "The sampled page uses one brand name.",
      ownershipVerification: "verified",
      confidence: "high",
      evidence
    },
    executiveSummary: {
      overview: "The site clearly introduces the product.",
      strengths: ["Clear product statement"],
      keyRisks: ["Limited trust detail"],
      topPriorities: ["Add sourced proof"]
    },
    dimensionScores: dimensions,
    pageTypeAnalyses: [{
      pageType: "home",
      sampledUrls: [page.url],
      strengths: ["Clear opening"],
      commonIssues: ["Few details"],
      recommendations: ["Add specifics"],
      evidence
    }],
    findings: Array.from({ length: findingCount }, (_, index) => ({
      id: `finding-${index}`,
      title: `Finding ${index}`,
      severity: index === 0 ? "critical" : index === 1 ? "warning" : "opportunity",
      impact: "Readers need more evidence.",
      evidence,
      recommendation: "Add evidence.",
      confidence: "high"
    })),
    roadmap: {
      immediate: [{ title: "Add evidence", rationale: "Improve trust", actions: ["Add sources"], relatedFindingIds: ["finding-0"] }],
      nextPhase: [],
      ongoing: []
    }
  };
}

function validReport(): AiWebsiteReportV1 {
  return {
    ...(reportModelOutput() as Omit<AiWebsiteReportV1, "version" | "tier" | "targetUrl" | "coverage" | "provenance">),
    version: AI_WEBSITE_REPORT_VERSION,
    tier: "free",
    targetUrl: page.url,
    organizationProfile: {
      ...(reportModelOutput().organizationProfile as AiWebsiteReportV1["organizationProfile"]),
      ownershipVerification: "not-performed"
    },
    coverage: {
      discoveredPages: 1,
      plannedPages: 1,
      analyzedPages: 1,
      failedPages: 0,
      samplingMethod: "Representative page",
      pageTypesCovered: ["home"],
      limitations: []
    },
    provenance: {
      reportVersion: 1,
      modelId: "mock-model",
      promptVersion: "ai-website-report-v1",
      locale: "en",
      generatedAt: "2026-07-10T00:00:00.000Z",
      contentHash: "abc"
    }
  };
}

describe("OpenAI-compatible client", () => {
  it("calls a /v1 endpoint and parses fenced JSON", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      return new Response(JSON.stringify({
        model: "served-model",
        choices: [{ message: { content: "```json\n{\"ok\":true}\n```" } }]
      }), { status: 200, headers: { "x-request-id": "request-1" } });
    });
    const client = new OpenAiCompatibleClient({
      baseUrl: "https://models.example/v1",
      apiKey: "secret",
      model: "configured-model",
      fetch: fetchMock as typeof fetch
    });

    const result = await client.completeJson({ messages: [{ role: "user", content: "JSON" }] });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://models.example/v1/chat/completions",
      expect.any(Object)
    );
    expect(result).toMatchObject({ value: { ok: true }, modelId: "served-model", requestId: "request-1" });
  });
});

describe("page planning", () => {
  it("uses the homepage without a model planning call for free and enforces the deep limit", async () => {
    const candidates = Array.from({ length: 60 }, (_, index) => ({
      url: index === 0 ? "https://example.com/" : `https://example.com/blog/${index}`,
      title: `Page ${index}`
    }));
    candidates.push({ url: "https://example.com/#duplicate", title: "Duplicate" });
    expect(preparePlanningCandidates(candidates)).toHaveLength(60);

    const freeClient = mockClient([{ selected: candidates.map((candidate) => ({ url: candidate.url, reason: "Representative" })) }]);
    const deepClient = mockClient([{ selected: candidates.map((candidate) => ({ url: candidate.url, reason: "Representative" })) }]);

    const deep = await planPages(deepClient, { tier: "deep", locale: "en", targetUrl: page.url, candidates });
    expect(deep.selected).toHaveLength(50);
    const free = await planPages(freeClient, { tier: "free", locale: "en", targetUrl: page.url, candidates });
    expect(free.selected).toEqual([expect.objectContaining({ url: page.url, pageType: "home" })]);
    expect(freeClient.completeJson).not.toHaveBeenCalled();
  });

  it("retries planning and then uses the deterministic fallback", async () => {
    const client = mockClient([]);
    vi.mocked(client.completeJson).mockRejectedValue(new Error("rate limited"));
    const result = await planPagesWithRecovery(client, {
      tier: "deep",
      locale: "en",
      targetUrl: page.url,
      candidates: [{ url: page.url }, { url: "https://example.com/about" }]
    }, { maxAttempts: 2, delay: async () => undefined });

    expect(client.completeJson).toHaveBeenCalledTimes(2);
    expect(result.fallbackUsed).toBe(true);
    expect(result.selected.map(({ url }) => url)).toEqual([page.url, "https://example.com/about"]);
  });

  it("fills an invalid model plan with deterministic representative pages", async () => {
    const result = await planPages(mockClient([{ selected: [{ url: "https://attacker.example/" }] }]), {
      tier: "deep",
      locale: "en",
      targetUrl: page.url,
      candidates: [{ url: page.url }, { url: "https://example.com/about" }]
    });
    expect(result.fallbackUsed).toBe(true);
    expect(result.selected.map((item) => item.url)).toEqual([page.url, "https://example.com/about"]);
  });
});

describe("batch analysis and evidence", () => {
  it("keeps only findings with exact fetched-page evidence", async () => {
    const client = mockClient([{ analyses: [{
      url: page.url,
      summary: "Summary",
      organizationSignals: ["Example"],
      strengths: ["Clear"],
      findings: [
        {
          title: "Supported",
          severity: "warning",
          impact: "Impact",
          evidence: [{ url: page.url, quote: "evidence-first website reports" }],
          recommendation: "Improve",
          confidence: "high"
        },
        {
          title: "Hallucinated",
          severity: "critical",
          impact: "Impact",
          evidence: [{ url: page.url, quote: "This quote does not exist" }],
          recommendation: "Improve",
          confidence: "low"
        }
      ]
    }] }]);

    const result = await analyzePageBatch(client, { pages: [page], locale: "en" });
    expect(result.analyses[0]?.findings).toHaveLength(1);
    expect(result.analyses[0]?.findings[0]?.title).toBe("Supported");
  });

  it("rejects unknown URLs and unsupported quotes from a completed report", () => {
    expect(validateEvidenceCitation({ url: page.url, quote: "modern product teams" }, [page]).valid).toBe(true);
    const report = validReport();
    report.findings.push({
      ...report.findings[0]!,
      id: "bad",
      evidence: [{ url: "https://example.com/missing", quote: "not fetched" }]
    });
    const verified = verifyReportEvidence(report, [page]);
    expect(verified.rejectedFindingIds).toEqual(["bad"]);
    expect(verified.report.findings.map((finding) => finding.id)).not.toContain("bad");
  });

  it("retries only the failed analysis batch and preserves completed analyses", async () => {
    const second = { ...page, url: "https://example.com/about", pageType: "about" as const };
    const third = { ...page, url: "https://example.com/contact", pageType: "contact" as const };
    const client = mockClient([]);
    vi.mocked(client.completeJson)
      .mockResolvedValueOnce({ value: { analyses: [{ url: page.url, summary: "one" }] }, modelId: "mock", rawContent: "{}" })
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ value: { analyses: [{ url: second.url, summary: "two" }] }, modelId: "mock", rawContent: "{}" })
      .mockResolvedValueOnce({ value: { analyses: [{ url: third.url, summary: "three" }] }, modelId: "mock", rawContent: "{}" });
    const completed: string[][] = [];

    const result = await analyzePageBatch(client, {
      pages: [page, second, third],
      locale: "en",
      batchSize: 1,
      maxAttempts: 2,
      retryDelay: async () => undefined,
      onBatchComplete: async (analyses) => {
        completed.push(analyses.map(({ url }) => url));
      }
    });

    expect(client.completeJson).toHaveBeenCalledTimes(4);
    expect(result.analyses.map(({ url }) => url)).toEqual([page.url, second.url, third.url]);
    expect(completed).toEqual([[page.url], [second.url], [third.url]]);
  });

  it("skips analysis calls for matching completed page analyses", async () => {
    const existing = { url: page.url, pageType: page.pageType, summary: "saved", organizationSignals: [], strengths: [], findings: [] };
    const client = mockClient([]);
    const result = await analyzePageBatch(client, {
      pages: [page],
      locale: "en",
      completedAnalyses: [existing]
    });
    expect(client.completeJson).not.toHaveBeenCalled();
    expect(result.analyses).toEqual([existing]);
  });
});

describe("report validation and synthesis", () => {
  it("rejects a malformed report contract", () => {
    expect(() => parseAiWebsiteReportV1({ version: 1 })).toThrow(ReportValidationError);
  });

  it("creates server-owned provenance and limits free reports to one finding", async () => {
    const result = await synthesizeWebsiteReport(mockClient([reportModelOutput(4)], "served-model"), {
      targetUrl: page.url,
      tier: "free",
      locale: "en",
      pages: [page],
      pageAnalyses: [],
      coverage: {
        discoveredPages: 1,
        plannedPages: 1,
        analyzedPages: 1,
        failedPages: 0,
        samplingMethod: "Representative page",
        pageTypesCovered: ["home"],
        limitations: []
      },
      generatedAt: "2026-07-10T00:00:00.000Z"
    });

    expect(result.report.findings).toHaveLength(1);
    expect(result.report.organizationProfile.ownershipVerification).toBe("not-performed");
    expect(result.report.provenance).toMatchObject({
      reportVersion: 1,
      modelId: "served-model",
      promptVersion: "ai-website-report-v1",
      locale: "en",
      generatedAt: "2026-07-10T00:00:00.000Z"
    });
    expect(result.report.provenance.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("normalizes nullable optional strings and duplicate model finding IDs", async () => {
    const output = reportModelOutput(2);
    const findings = output.findings as Array<Record<string, unknown>>;
    findings[1]!.id = findings[0]!.id;
    findings[1]!.rewriteExample = null;
    const evidence = findings[1]!.evidence as Array<Record<string, unknown>>;
    evidence[0]!.pageElement = null;

    const result = await synthesizeWebsiteReport(mockClient([output]), {
      targetUrl: page.url,
      tier: "deep",
      locale: "en",
      pages: [page],
      pageAnalyses: [],
      coverage: {
        discoveredPages: 1,
        plannedPages: 1,
        analyzedPages: 1,
        failedPages: 0,
        samplingMethod: "Representative page",
        pageTypesCovered: ["home"],
        limitations: []
      }
    });

    expect(new Set(result.report.findings.map((finding) => finding.id)).size).toBe(2);
    expect(result.report.findings[1]?.rewriteExample).toBeUndefined();
    expect(result.report.findings[1]?.evidence[0]?.pageElement).toBeUndefined();
  });
});

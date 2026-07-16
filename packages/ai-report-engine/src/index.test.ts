import { describe, expect, it, vi } from "vitest";
import {
  AI_WEBSITE_REPORT_VERSION,
  AI_REPORT_PROMPT_VERSION,
  COMBINED_GEO_REPORT_CONTRACT,
  COMBINED_GEO_REPORT_V2_CONTRACT,
  COMBINED_GEO_REPORT_V3_CONTRACT,
  COMBINED_GEO_REPORT_V4_CONTRACT,
  MODEL_PROFILE_OPERATIONS,
  OpenAiCompatibleClient,
  ReportLanguageValidationError,
  ReportValidationError,
  analyzePageBatch,
  evaluateModelTokenBudget,
  planPagesWithRecovery,
  parseAiWebsiteReportV1,
  parseCombinedGeoReportV1,
  parseCombinedGeoReportV2,
  parseCombinedGeoReportV3,
  parseCombinedGeoReportV4,
  parseModelProfile,
  parseReportV4CustomerProseProfile,
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput,
  parseReportV4QuestionAnswerInput,
  parseReportV4SiteSynthesisInput,
  planPages,
  preparePlanningCandidates,
  runWithModelTokenBudget,
  synthesizeWebsiteReport,
  synthesizeWebsiteReportWithRecovery,
  validateReportV4CustomerProse,
  validateEvidenceCitation,
  verifyReportEvidence,
  type AiWebsiteReportV1,
  type ExtractedPage,
  type JsonCompletionClient,
  type JsonCompletionResult,
  type ReportSynthesisInput
} from "./index";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-LEGACY-01
describe("combined report public exports", () => {
  it("adds V4 without removing or widening the historical V1-V3 exports", () => {
    expect([
      COMBINED_GEO_REPORT_CONTRACT,
      COMBINED_GEO_REPORT_V2_CONTRACT,
      COMBINED_GEO_REPORT_V3_CONTRACT,
      COMBINED_GEO_REPORT_V4_CONTRACT
    ]).toEqual([
      "combined_geo_report_v1",
      "combined_geo_report_v2",
      "combined_geo_report_v3",
      "combined_geo_report_v4"
    ]);
    expect([parseCombinedGeoReportV1, parseCombinedGeoReportV2, parseCombinedGeoReportV3, parseCombinedGeoReportV4])
      .toEqual([expect.any(Function), expect.any(Function), expect.any(Function), expect.any(Function)]);
  });

  it("exports the V4 model, budget, bounded-input, diagnosis, and customer-prose primitives from the package root", () => {
    expect(MODEL_PROFILE_OPERATIONS).toEqual(["pageAnalysis", "websiteSynthesis", "questionAnswer", "sourceDiagnosis"]);
    expect([
      parseModelProfile,
      evaluateModelTokenBudget,
      runWithModelTokenBudget,
      parseReportV4SiteSynthesisInput,
      parseReportV4QuestionAnswerInput,
      parseReportV4DiagnosisInput,
      parseReportV4DiagnosisOutput,
      parseReportV4CustomerProseProfile,
      validateReportV4CustomerProse
    ]).toEqual(Array.from({ length: 9 }, () => expect.any(Function)));
  });
});

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
      promptVersion: AI_REPORT_PROMPT_VERSION,
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
    expect(JSON.stringify(vi.mocked(client.completeJson).mock.calls[0]?.[0])).toContain("Write all report prose in English");
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

  it("corrects Chinese page prose once while preserving source-original evidence", async () => {
    const english = { analyses: [{
      url: page.url,
      summary: "The page clearly explains the product for modern teams.",
      organizationSignals: ["The organization is presented consistently."],
      strengths: ["The opening statement is easy to understand."],
      findings: [{
        title: "The trust evidence needs more detail.", severity: "warning", impact: "Readers cannot verify every claim.",
        evidence: [{ url: page.url, quote: "Example builds evidence-first website reports" }],
        recommendation: "Add named sources beside each important claim.", confidence: "high"
      }]
    }] };
    const corrections = { corrections: [
      { path: "analyses[0].summary", text: "该页面清楚介绍了 example 产品及其目标用户。" },
      { path: "analyses[0].organizationSignals[0]", text: "组织名称与产品说明保持一致。" },
      { path: "analyses[0].strengths[0]", text: "开头说明容易理解。" },
      { path: "analyses[0].findings[0].title", text: "信任证据需要更具体" },
      { path: "analyses[0].findings[0].impact", text: "读者目前难以核验重要主张。" },
      { path: "analyses[0].findings[0].recommendation", text: "在重要主张旁补充具名来源。" }
    ] };
    const client = mockClient([english, corrections]);

    const result = await analyzePageBatch(client, { pages: [page], locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined });

    expect(result.analyses[0]?.summary).toContain("该页面");
    expect(client.completeJson).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(client.completeJson).mock.calls) {
      expect(JSON.stringify(call[0])).toContain("Simplified Chinese");
    }
    expect(JSON.stringify(vi.mocked(client.completeJson).mock.calls[1]?.[0]))
      .toContain("keep verbatim source text only inside evidence quote fields");
    const correctionPayload = JSON.parse(vi.mocked(client.completeJson).mock.calls[1]![0].messages[1]!.content);
    expect(correctionPayload.pages).toBeUndefined();
    expect(correctionPayload.draft).toBeUndefined();
    expect(correctionPayload.fieldsToCorrect).toEqual([
      { path: "analyses[0].summary", text: "The page clearly explains the product for modern teams." },
      { path: "analyses[0].organizationSignals[0]", text: "The organization is presented consistently." },
      { path: "analyses[0].strengths[0]", text: "The opening statement is easy to understand." },
      { path: "analyses[0].findings[0].title", text: "The trust evidence needs more detail." },
      { path: "analyses[0].findings[0].impact", text: "Readers cannot verify every claim." },
      { path: "analyses[0].findings[0].recommendation", text: "Add named sources beside each important claim." }
    ]);
    expect(correctionPayload.allowedOriginalTerms).toEqual(["example.com", "example"]);
    expect(correctionPayload.rules).toContain("Translate or omit every other Latin-script word outside evidence quote fields.");
    expect(correctionPayload.rules).toContain("Treat allowedOriginalTerms as the complete and exclusive list of Latin-script text permitted in Chinese replacements.");
    expect(result.analyses[0]?.findings[0]?.evidence).toEqual(english.analyses[0]!.findings[0]!.evidence);
  });

  it("retries a well-formed correction that still leaks English without re-analyzing the page", async () => {
    const invalid = { analyses: [{
      url: page.url,
      summary: "The page clearly explains the product for modern teams.",
      organizationSignals: [],
      strengths: [],
      findings: []
    }] };
    const stillEnglish = { corrections: [{
      path: "analyses[0].summary",
      text: "Rewrite the summary in Chinese for modern teams."
    }] };
    const corrected = { corrections: [{
      path: "analyses[0].summary",
      text: "该页面清楚说明了产品及其目标用户。"
    }] };
    const client = mockClient([invalid, stillEnglish, corrected]);

    const result = await analyzePageBatch(client, {
      pages: [page], locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined
    });

    expect(result.analyses[0]?.summary).toBe("该页面清楚说明了产品及其目标用户。");
    expect(client.completeJson).toHaveBeenCalledTimes(3);
    const retryPayload = JSON.parse(vi.mocked(client.completeJson).mock.calls[2]![0].messages[1]!.content);
    expect(retryPayload.pages).toBeUndefined();
    expect(retryPayload.fieldsToCorrect).toEqual([{
      path: "analyses[0].summary",
      text: "Rewrite the summary in Chinese for modern teams."
    }]);
  });

  it("corrects legacy SEO terminology in page analysis using the existing single correction", async () => {
    const analysis = (summary: string) => ({ analyses: [{
      url: page.url, summary, organizationSignals: [], strengths: [], findings: []
    }] });
    const client = mockClient([analysis("Improve SEO visibility."), {
      corrections: [{ path: "analyses[0].summary", text: "Improve GEO visibility." }]
    }]);

    const result = await analyzePageBatch(client, { pages: [page], locale: "en", maxAttempts: 3, retryDelay: async () => undefined });

    expect(result.analyses[0]?.summary).toContain("GEO");
    expect(client.completeJson).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(client.completeJson).mock.calls[1]?.[0])).toContain("legacy_seo_terminology");
  });

  it("fails page analysis after one legacy terminology correction", async () => {
    const invalid = { analyses: [{ url: page.url, summary: "Improve SEO visibility.", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([invalid]);
    await expect(analyzePageBatch(client, { pages: [page], locale: "en", maxAttempts: 3, retryDelay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it("fails page analysis after one language correction", async () => {
    const invalid = { analyses: [{ url: page.url, summary: "The page clearly explains the product for modern teams.", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([invalid]);
    await expect(analyzePageBatch(client, { pages: [page], locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it.each([
    { name: "missing", correction: { corrections: [] } },
    { name: "extra", correction: { corrections: [
      { path: "analyses[0].summary", text: "该页面说明清楚。" },
      { path: "analyses[0].strengths[0]", text: "不得新增路径。" }
    ] } },
    { name: "duplicate", correction: { corrections: [
      { path: "analyses[0].summary", text: "该页面说明清楚。" },
      { path: "analyses[0].summary", text: "重复路径。" }
    ] } },
    { name: "evidence", correction: { corrections: [
      { path: "analyses[0].findings[0].evidence[0].quote", text: "不得修改证据。" }
    ] } }
  ])("rejects a $name field-level language correction", async ({ correction }) => {
    const invalid = { analyses: [{ url: page.url, summary: "The page clearly explains the product.", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([invalid, correction]);
    await expect(analyzePageBatch(client, { pages: [page], locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it("does not allowlist one-off title prose in page analysis", async () => {
    const titledPage = { ...page, title: "Customer Growth Strategy" };
    const invalid = { analyses: [{ url: page.url, summary: "Customer Growth Strategy", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([invalid]);
    await expect(analyzePageBatch(client, { pages: [titledPage], locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it("allows source-grounded Latin brands and acronyms directly joined to Chinese text", async () => {
    const mixedPage = { ...page, text: "提供FBA头程服务，并支持Shopee虾皮店铺。" };
    const output = { analyses: [{
      url: page.url,
      summary: "页面提供FBA头程服务，并支持Shopee虾皮店铺。",
      organizationSignals: [], strengths: [], findings: []
    }] };
    const client = mockClient([output]);

    await expect(analyzePageBatch(client, { pages: [mixedPage], locale: "zh-CN", retryDelay: async () => undefined }))
      .resolves.toMatchObject({ analyses: [{ summary: output.analyses[0]!.summary }] });
    expect(client.completeJson).toHaveBeenCalledTimes(1);
  });

  it("removes Latin brands invented by the model during Chinese correction", async () => {
    const invalid = { analyses: [{ url: page.url, summary: "建议增加 Google Reviews 和 Trustpilot。", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([invalid, {
      corrections: [{ path: "analyses[0].summary", text: "建议增加 Google Reviews 和 Trustpilot。" }]
    }]);

    await expect(analyzePageBatch(client, { pages: [page], locale: "zh-CN", retryDelay: async () => undefined }))
      .resolves.toMatchObject({ analyses: [{ summary: "建议增加 英文术语 和 英文术语。" }] });
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it.each(["grow your customer base quickly", "Customer Growth Strategy", "AI Customer Growth Strategy", "customer-growth strategy"])(
    "does not promote repeated ordinary title prose: %s",
    async (title) => {
      const second = { ...page, url: "https://example.com/about", pageType: "about" as const, title };
      const pages = [{ ...page, title }, second];
      const invalid = { analyses: pages.map((item) => ({ url: item.url, summary: title, organizationSignals: [], strengths: [], findings: [] })) };
      const client = mockClient([invalid]);
      await expect(analyzePageBatch(client, { pages, locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined }))
        .rejects.toThrow(ReportLanguageValidationError);
      expect(client.completeJson).toHaveBeenCalledTimes(2);
    }
  );

  it("does not treat site-name metadata prose as language authority", async () => {
    const metadataPage = { ...page, metadata: { siteName: "Customer Growth Strategy" } };
    const invalid = { analyses: [{ url: page.url, summary: "Customer Growth Strategy", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([invalid]);
    await expect(analyzePageBatch(client, { pages: [metadataPage], locale: "zh-CN", maxAttempts: 3, retryDelay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it("allows only a bounded hostname label for a one-page site identity", async () => {
    const localized = { analyses: [{ url: page.url, summary: "example 提供清晰的网站分析服务。", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([localized]);
    await expect(analyzePageBatch(client, { pages: [page], locale: "zh-CN", maxAttempts: 1 }))
      .resolves.toMatchObject({ analyses: [{ summary: expect.stringContaining("example") }] });
  });

  it("allows an official name owned by structured website metadata", async () => {
    const officialPage = { ...page, metadata: { officialNames: ["Google Analytics"] } };
    const localized = { analyses: [{ url: page.url, summary: "该页面介绍 Google Analytics 产品。", organizationSignals: [], strengths: [], findings: [] }] };
    const client = mockClient([localized]);
    await expect(analyzePageBatch(client, { pages: [officialPage], locale: "zh-CN", maxAttempts: 1 }))
      .resolves.toMatchObject({ analyses: [{ summary: expect.stringContaining("Google Analytics") }] });
  });
});

describe("report validation and synthesis", () => {
  it("rejects a malformed report contract", () => {
    expect(() => parseAiWebsiteReportV1({ version: 1 })).toThrow(ReportValidationError);
  });

  it("creates server-owned provenance and limits free reports to one finding", async () => {
    const client = mockClient([reportModelOutput(4)], "served-model");
    const result = await synthesizeWebsiteReport(client, {
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
      promptVersion: AI_REPORT_PROMPT_VERSION,
      locale: "en",
      generatedAt: "2026-07-10T00:00:00.000Z"
    });
    expect(result.report.provenance.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(vi.mocked(client.completeJson).mock.calls[0]?.[0])).toContain("Write all report prose in English");
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

  it("corrects Chinese report prose once and keeps English evidence quotes", async () => {
    const invalid = chineseReportModelOutput();
    (invalid.executiveSummary as Record<string, unknown>).overview = "The website clearly introduces the product.";
    const client = mockClient([invalid, {
      corrections: [{ path: "executiveSummary.overview", text: "网站清楚介绍了产品。" }]
    }]);

    const result = await synthesizeWebsiteReportWithRecovery(client, synthesisInput("zh-CN"), { maxAttempts: 3, delay: async () => undefined });

    expect(result.report.executiveSummary.overview).toContain("网站");
    expect(result.report.findings[0]?.evidence[0]?.quote).toBe("Example builds evidence-first website reports");
    expect(client.completeJson).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(client.completeJson).mock.calls) {
      expect(JSON.stringify(call[0])).toContain("Simplified Chinese");
    }
    const correctionPayload = JSON.parse(vi.mocked(client.completeJson).mock.calls[1]![0].messages[1]!.content);
    expect(correctionPayload.fieldsToCorrect).toEqual([
      { path: "executiveSummary.overview", text: "The website clearly introduces the product." }
    ]);
    expect(correctionPayload.pageEvidence).toBeUndefined();
  });

  it("corrects legacy SEO terminology in synthesis using the existing single correction", async () => {
    const invalid = reportModelOutput(1);
    (invalid.executiveSummary as Record<string, unknown>).overview = "Improve SEO visibility with clearer evidence.";
    const client = mockClient([invalid, {
      corrections: [{ path: "executiveSummary.overview", text: "Improve GEO visibility with clearer evidence." }]
    }]);

    const result = await synthesizeWebsiteReportWithRecovery(client, synthesisInput("en"), { maxAttempts: 3, delay: async () => undefined });

    expect(result.report.executiveSummary.overview).toContain("GEO");
    expect(client.completeJson).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(client.completeJson).mock.calls[1]?.[0])).toContain("legacy_seo_terminology");
  });

  it("fails synthesis after one legacy terminology correction", async () => {
    const invalid = reportModelOutput(1);
    (invalid.executiveSummary as Record<string, unknown>).overview = "Improve SEO visibility with clearer evidence.";
    const client = mockClient([invalid]);
    await expect(synthesizeWebsiteReportWithRecovery(client, synthesisInput("en"), { maxAttempts: 3, delay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it("does not gate server-owned English coverage during Chinese model correction", async () => {
    const client = mockClient([chineseReportModelOutput()]);
    const input = synthesisInput("zh-CN");
    input.coverage.samplingMethod = "Production representative page sampling";
    input.coverage.limitations = ["Only fetched pages are included in this deterministic coverage note."];
    await expect(synthesizeWebsiteReportWithRecovery(client, input, { maxAttempts: 3, delay: async () => undefined }))
      .resolves.toMatchObject({ report: { executiveSummary: { overview: expect.stringContaining("网站") } } });
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it.each([
    ["businessModel", "Consulting services"],
    ["productsAndServices", ["Consulting services"]],
    ["capabilities", ["Delivers strategic consulting services"]],
    ["targetAudiences", ["Global enterprise buyers"]],
    ["marketsAndRegions", ["North American markets"]]
  ] as const)("rejects English leakage in organizationProfile.%s", async (field, value) => {
    const output = chineseReportModelOutput();
    (output.organizationProfile as Record<string, unknown>)[field] = value;
    await expect(synthesizeWebsiteReport(mockClient([output]), synthesisInput("zh-CN")))
      .rejects.toThrow(ReportLanguageValidationError);
  });

  it("does not allowlist arbitrary one-off title prose during website synthesis", async () => {
    const output = chineseReportModelOutput();
    (output.organizationProfile as Record<string, unknown>).summary = "该网站采用 Rapid Customer Growth 方法提供服务。";
    const input = synthesisInput("zh-CN");
    input.pages = [{ ...page, title: "Rapid Customer Growth" }];
    await expect(synthesizeWebsiteReport(mockClient([output]), input)).rejects.toThrow(ReportLanguageValidationError);
  });

  it.each([
    ["organizationName", "AI Customer Growth Strategy"],
    ["brandNames", ["Grow Revenue in 30 Days"]],
    ["legalEntity", "cloud-first-growth"]
  ] as const)("does not let model-controlled organizationProfile.%s authorize prose", async (field, value) => {
    const output = chineseReportModelOutput();
    const profile = output.organizationProfile as Record<string, unknown>;
    profile[field] = value;
    const leaked = Array.isArray(value) ? value[0]! : value;
    const input = synthesisInput("zh-CN");
    input.pages = [{ ...page, text: `${page.text} ${leaked}` }];
    await expect(synthesizeWebsiteReport(mockClient([output]), input)).rejects.toThrow(ReportLanguageValidationError);
  });

  it("does not let a model-controlled Chinese brand authorize Chinese prose in English", async () => {
    const output = reportModelOutput(1);
    const profile = output.organizationProfile as Record<string, unknown>;
    profile.brandNames = ["快速增长客户收入"];
    const input = synthesisInput("en");
    input.pages = [{ ...page, text: `${page.text} 快速增长客户收入` }];
    await expect(synthesizeWebsiteReport(mockClient([output]), input)).rejects.toThrow(ReportLanguageValidationError);
  });

  it("allows an exact source-grounded brand even when it is also a product", async () => {
    const output = chineseReportModelOutput();
    const profile = output.organizationProfile as Record<string, unknown>;
    profile.brandNames = ["Example", "Google Analytics"];
    profile.productsAndServices = ["Google Analytics"];
    profile.summary = "Example 为客户提供 Google Analytics 产品。";
    const input = synthesisInput("zh-CN");
    input.pages = [{ ...page, metadata: { officialNames: ["Example", "Google Analytics"] } }];
    await expect(synthesizeWebsiteReport(mockClient([output]), input))
      .resolves.toMatchObject({ report: { organizationProfile: { productsAndServices: ["Google Analytics"] } } });
  });

  it.each(["freight forwarding and customs clearance", "Customer Growth Strategy", "Product One", "Google Analytics", "Cloudflare Workers"])(
    "rejects source-grounded generic product prose in Chinese: %s",
    async (product) => {
      const output = chineseReportModelOutput();
      const profile = output.organizationProfile as Record<string, unknown>;
      profile.productsAndServices = [product];
      profile.summary = `Example 提供 ${product} 服务。`;
      const input = synthesisInput("zh-CN");
      input.pages = [{ ...page, text: `${page.text} ${product}` }];
      await expect(synthesizeWebsiteReport(mockClient([output]), input)).rejects.toThrow(ReportLanguageValidationError);
    }
  );

  it("fails website synthesis after one language correction", async () => {
    const client = mockClient([reportModelOutput(1)]);
    await expect(synthesizeWebsiteReportWithRecovery(client, synthesisInput("zh-CN"), { maxAttempts: 3, delay: async () => undefined }))
      .rejects.toThrow(ReportLanguageValidationError);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });
});

function synthesisInput(locale: string): ReportSynthesisInput {
  return {
    targetUrl: page.url,
    tier: "deep" as const,
    locale,
    organizationHints: ["Example"],
    pages: [{ ...page, metadata: { officialNames: ["Example"] } }],
    pageAnalyses: [],
    coverage: {
      discoveredPages: 1, plannedPages: 1, analyzedPages: 1, failedPages: 0,
      samplingMethod: locale.startsWith("zh") ? "选取代表性页面" : "Representative page",
      pageTypesCovered: ["home" as const], limitations: []
    }
  };
}

function chineseReportModelOutput(): Record<string, unknown> {
  const output = reportModelOutput(1);
  const profile = output.organizationProfile as Record<string, unknown>;
  profile.summary = "Example 为产品团队提供网站分析报告。";
  profile.businessModel = "软件服务";
  profile.productsAndServices = ["网站分析报告"];
  profile.targetAudiences = ["产品团队"];
  profile.identityConsistency = "抽样页面使用一致的组织名称。";
  output.executiveSummary = { overview: "网站清楚介绍了产品。", strengths: ["产品说明清晰"], keyRisks: ["信任细节不足"], topPriorities: ["补充来源证据"] };
  for (const item of output.dimensionScores as Array<Record<string, unknown>>) item.explanation = "结论来自已核验页面证据。";
  output.pageTypeAnalyses = [{ pageType: "home", sampledUrls: [page.url], strengths: ["开头说明清晰"], commonIssues: ["细节较少"], recommendations: ["补充具体信息"], evidence: [{ url: page.url, quote: "Example builds evidence-first website reports" }] }];
  output.findings = [{ id: "finding-0", title: "补充信任证据", severity: "warning", impact: "读者需要更多证据。", evidence: [{ url: page.url, quote: "Example builds evidence-first website reports" }], recommendation: "补充来源证据。", confidence: "high" }];
  output.roadmap = { immediate: [{ title: "补充证据", rationale: "提高可信度", actions: ["添加来源"], relatedFindingIds: ["finding-0"] }], nextPhase: [], ongoing: [] };
  return output;
}

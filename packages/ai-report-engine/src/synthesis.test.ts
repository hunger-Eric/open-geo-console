import { describe, expect, it, vi } from "vitest";
import { buildSynthesisPrompt, synthesizeWebsiteReport, synthesizeWebsiteReportWithRecovery } from "./synthesis";
import { AiClientError, type JsonCompletionClient, type JsonCompletionRequest } from "./client";
import type { ExtractedPage, ReportSynthesisInput } from "./types";

const page: ExtractedPage = {
  url: "https://target.example/",
  pageType: "home",
  title: "Target Brand",
  text: "Target Brand 提供 FBA 头程服务，并使用 Cloudflare Workers。",
  metadata: { officialNames: ["Target Brand"] }
};

function input(): ReportSynthesisInput {
  return {
    targetUrl: page.url,
    tier: "deep",
    locale: "zh-CN",
    pages: [page],
    pageAnalyses: [],
    coverage: {
      discoveredPages: 1,
      plannedPages: 1,
      analyzedPages: 1,
      failedPages: 0,
      samplingMethod: "代表性页面抽样",
      pageTypesCovered: ["home"],
      limitations: []
    },
    generatedAt: "2026-07-23T00:00:00.000Z"
  };
}

function modelOutput(): Record<string, unknown> {
  const evidence = [{ url: page.url, quote: "Target Brand 提供 FBA 头程服务" }];
  return {
    organizationProfile: {
      organizationName: "Target Brand",
      brandNames: ["Target Brand"],
      summary: "Target Brand provides FBA first-mile services with Cloudflare Workers。",
      businessModel: "B2B logistics",
      productsAndServices: ["FBA 头程"],
      capabilities: ["Cloudflare Workers integration"],
      targetAudiences: ["跨境卖家"],
      marketsAndRegions: [],
      legalEntity: null,
      identityConsistency: "品牌身份一致。",
      ownershipVerification: "not-performed",
      confidence: "high",
      evidence
    },
    executiveSummary: {
      overview: "Target Brand offers API-first FBA logistics。",
      strengths: ["Cloudflare Workers integration"],
      keyRisks: ["证据范围有限。"],
      topPriorities: ["补充可核验事实。"]
    },
    dimensionScores: [
      "organizationClarity", "informationArchitecture", "contentCitability",
      "trustEvidence", "entityConsistency", "geoUnderstandability"
    ].map((dimension) => ({ dimension, score: 70, explanation: "基于页面证据。", confidence: "high", evidence })),
    pageTypeAnalyses: [{
      pageType: "home",
      sampledUrls: [page.url],
      strengths: ["品牌清晰。"],
      commonIssues: ["细节有限。"],
      recommendations: ["补充事实。"],
      evidence
    }],
    findings: [],
    roadmap: { immediate: [], nextPhase: [], ongoing: [] }
  };
}

function clientReturning(value: unknown, requests: JsonCompletionRequest[] = []): JsonCompletionClient {
  return {
    configuredModel: "mock-model",
    completeJson: vi.fn(async (request) => {
      requests.push(request);
      return { value, modelId: "mock-model", rawContent: JSON.stringify(value) };
    })
  };
}

describe("website synthesis semantic-validation seam", () => {
  it("anchors date reasoning to the persisted report timestamp", () => {
    const prompt = JSON.parse(buildSynthesisPrompt(input())) as { reportAsOf: string; rules: string[] };
    expect(prompt.reportAsOf).toBe("2026-07-23T00:00:00.000Z");
    expect(prompt.rules).toContain("Use reportAsOf as the authoritative time reference. Never describe an observed date on or before reportAsOf as future-dated.");
    expect(prompt.rules).toContain("Distinguish publication dates from other page dates. If a date's meaning is ambiguous, state that uncertainty instead of inferring that it is in the future.");
  });

  it("rejects model prose that calls a date before reportAsOf future", async () => {
    const output = modelOutput();
    (output.executiveSummary as { overview: string }).overview = "页面中的 2026-05-26 属于未来时间，发布日期存在异常。";
    const dated = input();
    dated.generatedAt = "2026-08-04T00:00:00.000Z";

    await expect(synthesizeWebsiteReport(clientReturning(output), dated, undefined, [], "deferred"))
      .rejects.toThrow(/temporal|2026-05-26|future|未来/i);
  });

  it("rejects model prose that calls a date after reportAsOf already past", async () => {
    const output = modelOutput();
    (output.executiveSummary as { overview: string }).overview = "页面中的 2026-08-05 已经发生，属于过去时间。";
    const dated = input();
    dated.generatedAt = "2026-08-04T00:00:00.000Z";

    await expect(synthesizeWebsiteReport(clientReturning(output), dated, undefined, [], "deferred"))
      .rejects.toThrow(/temporal|2026-08-05|past|过去/i);
  });

  it("does not retry a deterministic temporal contradiction", async () => {
    const output = modelOutput();
    (output.executiveSummary as { overview: string }).overview = "页面中的 2026-05-26 属于未来时间。";
    const dated = input();
    dated.generatedAt = "2026-08-04T00:00:00.000Z";
    const client = clientReturning(output);

    await expect(synthesizeWebsiteReportWithRecovery(client, dated, {
      maxAttempts: 3, semanticValidation: "deferred", delay: async () => undefined
    })).rejects.toThrow(/temporal/i);
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("rejects a referential contradiction in the following sentence", async () => {
    const output = modelOutput();
    (output.executiveSummary as { overview: string }).overview = "页面日期为 2026-05-26。该日期属于未来时间。";
    const dated = input();
    dated.generatedAt = "2026-08-04T00:00:00.000Z";
    await expect(synthesizeWebsiteReport(clientReturning(output), dated, undefined, [], "deferred"))
      .rejects.toThrow(/temporal|2026-05-26/i);
  });

  it("handles English dates without assigning another clause's future relation to the as-of date", async () => {
    const output = modelOutput();
    (output.executiveSummary as { overview: string }).overview = "As of August 4, 2026, August 5, 2026 is upcoming.";
    const dated = input();
    dated.locale = "en";
    dated.generatedAt = "2026-08-04T00:00:00.000Z";
    await expect(synthesizeWebsiteReport(clientReturning(output), dated, undefined, [], "deferred"))
      .resolves.toMatchObject({ report: { executiveSummary: { overview: expect.stringContaining("August 5, 2026") } } });

    (output.executiveSummary as { overview: string }).overview = "May 26, 2026 is future-dated.";
    await expect(synthesizeWebsiteReport(clientReturning(output), dated, undefined, [], "deferred"))
      .rejects.toThrow(/temporal|May 26, 2026/i);
  });

  it("revalidates temporal truth after model-authored language correction", async () => {
    const output = modelOutput();
    Object.assign(output.organizationProfile as Record<string, unknown>, {
      organizationName: null, brandNames: [], summary: "提供头程服务。", businessModel: "企业物流",
      productsAndServices: ["头程服务"], capabilities: ["系统集成"]
    });
    Object.assign(output.executiveSummary as Record<string, unknown>, {
      overview: "This sentence contains unsupported English prose that must be corrected instead of returned.",
      strengths: ["服务信息清晰。"]
    });
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn()
        .mockResolvedValueOnce({ value: output, modelId: "mock-model", rawContent: JSON.stringify(output) })
        .mockResolvedValueOnce({
          value: { corrections: [{ path: "executiveSummary.overview", text: "页面中的 2026-05-26 属于未来时间。" }] },
          modelId: "mock-model", rawContent: "{}"
        })
    };
    const dated = input();
    dated.generatedAt = "2026-08-04T00:00:00.000Z";

    await expect(synthesizeWebsiteReportWithRecovery(client, dated, {
      maxAttempts: 3, semanticValidation: "legacy", delay: async () => undefined
    })).rejects.toThrow(/temporal|2026-05-26/i);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
  });

  it("keeps omitted and explicit legacy prompts and failures identical", async () => {
    const omittedRequests: JsonCompletionRequest[] = [];
    const explicitRequests: JsonCompletionRequest[] = [];
    await expect(synthesizeWebsiteReport(clientReturning(modelOutput(), omittedRequests), input())).rejects.toThrow();
    await expect(synthesizeWebsiteReport(clientReturning(modelOutput(), explicitRequests), input(), undefined, [], "legacy")).rejects.toThrow();
    expect(explicitRequests).toEqual(omittedRequests);
    expect(buildSynthesisPrompt(input(), [], "legacy")).toBe(buildSynthesisPrompt(input()));
  });

  it("retains mixed-language brands and professional terms in deferred mode with one model call", async () => {
    const client = clientReturning(modelOutput());
    const result = await synthesizeWebsiteReport(client, input(), undefined, [], "deferred");
    expect(result.report.executiveSummary.overview).toBe("Target Brand offers API-first FBA logistics。");
    expect(result.report.organizationProfile.capabilities).toEqual(["Cloudflare Workers integration"]);
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("accepts a valid subset of dimensions in one Direct model call", async () => {
    const partial = modelOutput();
    (partial.dimensionScores as unknown[]).pop();
    const client = clientReturning(partial);
    const result = await synthesizeWebsiteReportWithRecovery(client, input(), {
      maxAttempts: 3,
      semanticValidation: "free_direct",
      delay: async () => undefined
    });
    expect(result.report.dimensionScores).toHaveLength(5);
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("normalizes missing optional containers and discards malformed optional rows", async () => {
    const drifted = modelOutput();
    Object.assign(drifted.organizationProfile as Record<string, unknown>, {
      brandNames: undefined, productsAndServices: undefined, capabilities: undefined,
      targetAudiences: undefined, marketsAndRegions: undefined, evidence: undefined
    });
    Object.assign(drifted.executiveSummary as Record<string, unknown>, {
      strengths: undefined, keyRisks: undefined, topPriorities: undefined
    });
    drifted.dimensionScores = [
      (modelOutput().dimensionScores as unknown[])[0],
      { dimension: "organizationClarity", score: "bad" },
      { dimension: "unknown", score: 80 }
    ];
    drifted.pageTypeAnalyses = [{ pageType: "unknown", sampledUrls: "bad" }, null];
    drifted.findings = [{ title: "missing required finding fields" }];
    delete drifted.roadmap;

    const result = await synthesizeWebsiteReport(clientReturning(drifted), input(), undefined, [], "deferred");
    expect(result.report).toMatchObject({
      organizationProfile: {
        brandNames: [], productsAndServices: [], capabilities: [],
        targetAudiences: [], marketsAndRegions: [], evidence: []
      },
      executiveSummary: { strengths: [], keyRisks: [], topPriorities: [] },
      pageTypeAnalyses: [], findings: [],
      roadmap: { immediate: [], nextPhase: [], ongoing: [] }
    });
    expect(result.report.dimensionScores.map(({ dimension }) => dimension)).toEqual(["organizationClarity"]);
  });

  it("recovers Direct website synthesis from one transient invalid-JSON response", async () => {
    const requests: JsonCompletionRequest[] = [];
    const undatedInput = input();
    delete undatedInput.generatedAt;
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn(async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          throw new AiClientError("The model returned invalid JSON.", { code: "invalid_json" });
        }
        const value = modelOutput();
        return { value, modelId: "mock-model", rawContent: JSON.stringify(value) };
      })
    };

    const result = await synthesizeWebsiteReportWithRecovery(client, undatedInput, {
      maxAttempts: 3, semanticValidation: "free_direct", delay: async () => undefined
    });

    expect(result.report.organizationProfile.organizationName).toBe("Target Brand");
    expect(client.completeJson).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual(requests[0]);
    const prompt = JSON.parse(requests[0]!.messages[1]!.content) as { reportAsOf: string };
    expect(prompt.reportAsOf).toBe(result.report.provenance.generatedAt);
  });

  it("stops Direct website synthesis after three transient failures", async () => {
    const finalCause = new AiClientError("truncated", { code: "output_truncated", finishReason: "length", responseChars: 100 });
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn()
        .mockRejectedValueOnce(new AiClientError("invalid", { code: "invalid_json" }))
        .mockRejectedValueOnce(new AiClientError("empty", { code: "empty_content" }))
        .mockRejectedValueOnce(finalCause)
    };

    await expect(synthesizeWebsiteReportWithRecovery(client, input(), {
      maxAttempts: 3, semanticValidation: "free_direct", delay: async () => undefined
    })).rejects.toBe(finalCause);
    expect(client.completeJson).toHaveBeenCalledTimes(3);
  });

  it("does not retry Direct authentication failures", async () => {
    const failure = new AiClientError("unauthorized", { status: 401, code: "authentication" });
    const client: JsonCompletionClient = { configuredModel: "mock-model", completeJson: vi.fn().mockRejectedValue(failure) };
    await expect(synthesizeWebsiteReportWithRecovery(client, input(), {
      maxAttempts: 3, semanticValidation: "free_direct", delay: async () => undefined
    })).rejects.toBe(failure);
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("still requires core prose and filters unbound evidence", async () => {
    for (const field of ["summary", "identityConsistency"] as const) {
      const invalid = modelOutput();
      delete (invalid.organizationProfile as Record<string, unknown>)[field];
      await expect(synthesizeWebsiteReport(clientReturning(invalid), input(), undefined, [], "deferred"))
        .rejects.toThrow();
    }
    const missingOverview = modelOutput();
    delete (missingOverview.executiveSummary as Record<string, unknown>).overview;
    await expect(synthesizeWebsiteReport(clientReturning(missingOverview), input(), undefined, [], "deferred"))
      .rejects.toThrow();

    const unbound = modelOutput();
    ((unbound.dimensionScores as Array<Record<string, unknown>>)[0]!.evidence as Array<Record<string, unknown>>)[0]!.quote = "not on page";
    const result = await synthesizeWebsiteReport(clientReturning(unbound), input(), undefined, [], "deferred");
    expect(result.report.dimensionScores[0]!.evidence).toEqual([]);
  });
});

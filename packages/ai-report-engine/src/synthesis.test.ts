import { describe, expect, it, vi } from "vitest";
import { buildSynthesisPrompt, synthesizeWebsiteReport, synthesizeWebsiteReportWithRecovery } from "./synthesis";
import type { JsonCompletionClient, JsonCompletionRequest } from "./client";
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

  it("keeps Direct website synthesis to one call and fails malformed structure closed", async () => {
    const invalid = modelOutput();
    (invalid.dimensionScores as unknown[]).pop();
    const client = clientReturning(invalid);
    await expect(synthesizeWebsiteReportWithRecovery(client, input(), {
      maxAttempts: 3,
      semanticValidation: "free_direct",
      delay: async () => undefined
    })).rejects.toThrow();
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("still rejects malformed deferred structure and unbound evidence", async () => {
    const invalid = modelOutput();
    (invalid.dimensionScores as unknown[]).pop();
    await expect(synthesizeWebsiteReport(clientReturning(invalid), input(), undefined, [], "deferred"))
      .rejects.toThrow();

    const unbound = modelOutput();
    ((unbound.dimensionScores as Array<Record<string, unknown>>)[0]!.evidence as Array<Record<string, unknown>>)[0]!.quote = "not on page";
    const result = await synthesizeWebsiteReport(clientReturning(unbound), input(), undefined, [], "deferred");
    expect(result.report.dimensionScores[0]!.evidence).toEqual([]);
  });
});

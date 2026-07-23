import { describe, expect, it, vi } from "vitest";
import { analyzePageBatch } from "./analysis";
import type { JsonCompletionClient, JsonCompletionRequest } from "./client";
import type { ExtractedPage } from "./types";

const page: ExtractedPage = {
  url: "https://target.example/",
  pageType: "home",
  title: "Target Brand",
  text: "Target Brand 提供 FBA 头程服务，并使用 Cloudflare Workers 处理边缘请求。",
  metadata: { officialNames: ["Target Brand"] }
};

const mixedLanguageAnalysis = {
  analyses: [{
    url: page.url,
    pageType: page.pageType,
    summary: "Target Brand 提供 FBA 头程与 Cloudflare Workers integration services。",
    organizationSignals: ["Target Brand"],
    strengths: ["API-first workflow"],
    findings: []
  }]
};

function clientReturning(value: unknown, requests: JsonCompletionRequest[] = []): JsonCompletionClient {
  return {
    configuredModel: "mock-model",
    completeJson: vi.fn(async (request) => {
      requests.push(request);
      return { value, modelId: "mock-model", rawContent: JSON.stringify(value) };
    })
  };
}

describe("analyzePageBatch semantic-validation seam", () => {
  it("keeps omitted and explicit legacy prompts and failures identical", async () => {
    const omittedRequests: JsonCompletionRequest[] = [];
    const explicitRequests: JsonCompletionRequest[] = [];
    await expect(analyzePageBatch(clientReturning(mixedLanguageAnalysis, omittedRequests), {
      pages: [page], locale: "zh-CN", maxAttempts: 1
    })).rejects.toThrow();
    await expect(analyzePageBatch(clientReturning(mixedLanguageAnalysis, explicitRequests), {
      pages: [page], locale: "zh-CN", maxAttempts: 1, semanticValidation: "legacy"
    })).rejects.toThrow();
    expect(explicitRequests).toEqual(omittedRequests);
  });

  it("preserves mixed-language brands and professional terms in deferred mode without a correction call", async () => {
    const client = clientReturning(mixedLanguageAnalysis);
    const result = await analyzePageBatch(client, {
      pages: [page],
      locale: "zh-CN",
      maxAttempts: 2,
      semanticValidation: "deferred"
    });
    expect(result.analyses[0]).toMatchObject({
      summary: mixedLanguageAnalysis.analyses[0]!.summary,
      strengths: ["API-first workflow"]
    });
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("still rejects malformed deferred output and preserves exact page ownership", async () => {
    await expect(analyzePageBatch(clientReturning({ analyses: [{ ...mixedLanguageAnalysis.analyses[0], url: "https://other.example/" }] }), {
      pages: [page],
      locale: "zh-CN",
      maxAttempts: 1,
      semanticValidation: "deferred"
    })).rejects.toThrow(/required page analyses/u);
  });
});

import { describe, expect, it, vi } from "vitest";
import { PageAnalysisBatchError, PageAnalysisContractError, analyzePageBatch } from "./analysis";
import { AiClientError, type AiClientErrorCode, type JsonCompletionClient, type JsonCompletionRequest } from "./client";
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
  it("uses the caller's locked page-analysis output budget", async () => {
    const requests: JsonCompletionRequest[] = [];
    await analyzePageBatch(clientReturning(mixedLanguageAnalysis, requests), {
      pages: [page], locale: "zh-CN", maxAttempts: 1,
      semanticValidation: "deferred", maxOutputTokens: 4_096
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.maxTokens).toBe(4_096);
  });

  it("normalizes presentation-only page fields without another model call", async () => {
    const validFinding = {
      title: "Grounded finding",
      severity: "opportunity",
      impact: "The page states a concrete service.",
      evidence: [{ url: page.url, quote: page.text.slice(0, 20) }],
      recommendation: "Keep the service statement easy to cite.",
      confidence: "medium"
    };
    const drifted = {
      analyses: [{
        ...mixedLanguageAnalysis.analyses[0],
        summary: "x".repeat(601),
        organizationSignals: { value: "not-an-array" },
        strengths: ["one", "", 2, "x".repeat(161), "two", "three", "four"],
        findings: [validFinding, { ...validFinding, evidence: [{ url: page.url, quote: "not on the page" }] }]
      }]
    };
    const client = clientReturning(drifted);
    const result = await analyzePageBatch(client, {
      pages: [page], locale: "en", maxAttempts: 1, semanticValidation: "deferred"
    });
    expect(result.analyses[0]).toMatchObject({
      summary: "x".repeat(600),
      organizationSignals: [],
      strengths: ["one", "two", "three"],
      findings: [expect.objectContaining({ title: "Grounded finding" })]
    });
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it.each([
    [{ analysis: mixedLanguageAnalysis.analyses }, "$.analyses", "analyses_missing_or_invalid"],
    [{ analyses: [{ ...mixedLanguageAnalysis.analyses[0], url: "https://unowned.example/private-value" }] }, "$.analyses[0].url", "url_not_owned"],
    [{ analyses: [{ ...mixedLanguageAnalysis.analyses[0], summary: "" }] }, "$.analyses[0].summary", "summary_invalid"]
  ] as const)("retains only the bounded rejection reason %s", async (value, path, reason) => {
    let rejected: unknown;
    try {
      await analyzePageBatch(clientReturning(value), {
        pages: [page], locale: "zh-CN", maxAttempts: 1, semanticValidation: "deferred"
      });
    } catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(PageAnalysisBatchError);
    const contract = (rejected as Error & { cause?: unknown }).cause;
    expect(contract).toBeInstanceOf(PageAnalysisContractError);
    expect(contract).toMatchObject({
      code: "page_analysis_contract_invalid",
      expectedCount: 1,
      acceptedCount: 0,
      issues: [{ path, reason }]
    });
    expect((contract as Error).message).not.toContain("private-value");
    expect((contract as Error).message.length).toBeLessThan(1_000);
  });

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

  it("keeps Direct semantic-contract failures to one call even when the caller requests retries", async () => {
    const client = clientReturning({
      analyses: [{ ...mixedLanguageAnalysis.analyses[0], url: "https://other.example/" }]
    });
    await expect(analyzePageBatch(client, {
      pages: [page], locale: "zh-CN", maxAttempts: 3, semanticValidation: "free_direct"
    })).rejects.toThrow(/required page analyses/u);
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("retries the identical Direct page-analysis request after transient invalid JSON", async () => {
    const requests: JsonCompletionRequest[] = [];
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn(async (request) => {
        requests.push(request);
        if (requests.length === 1) {
          throw new AiClientError("The model returned invalid JSON.", { code: "invalid_json", responseChars: 17 });
        }
        return { value: mixedLanguageAnalysis, modelId: "mock-model", rawContent: JSON.stringify(mixedLanguageAnalysis) };
      })
    };

    const result = await analyzePageBatch(client, {
      pages: [page], locale: "zh-CN", maxAttempts: 3, semanticValidation: "free_direct",
      retryDelay: async () => undefined
    });

    expect(result.analyses).toHaveLength(1);
    expect(client.completeJson).toHaveBeenCalledTimes(2);
    expect(requests[1]).toEqual(requests[0]);
  });

  it.each(["non_json_response", "empty_content", "output_truncated", "timeout", "network", "rate_limited", "temporary_provider"] as AiClientErrorCode[])(
    "retries the other approved Direct transient condition %s",
    async (code) => {
      const client = clientReturning(mixedLanguageAnalysis);
      vi.mocked(client.completeJson).mockRejectedValueOnce(new AiClientError(code, { code }));
      await expect(analyzePageBatch(client, {
        pages: [page], locale: "zh-CN", maxAttempts: 3, semanticValidation: "free_direct", retryDelay: async () => undefined
      })).resolves.toMatchObject({ analyses: [expect.objectContaining({ url: page.url })] });
      expect(client.completeJson).toHaveBeenCalledTimes(2);
    }
  );

  it("exhausts three Direct transient failures and preserves the final typed cause", async () => {
    const finalCause = new AiClientError("The model returned invalid JSON.", { code: "invalid_json", responseChars: 23 });
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn()
        .mockRejectedValueOnce(new AiClientError("The model returned invalid JSON.", { code: "invalid_json" }))
        .mockRejectedValueOnce(new AiClientError("The model returned invalid JSON.", { code: "invalid_json" }))
        .mockRejectedValueOnce(finalCause)
    };

    const promise = analyzePageBatch(client, {
      pages: [page], locale: "zh-CN", maxAttempts: 3, semanticValidation: "free_direct",
      retryDelay: async () => undefined
    });
    await expect(promise).rejects.toMatchObject({ name: "PageAnalysisBatchError", cause: finalCause });
    await promise.catch((error: unknown) => expect(error).toBeInstanceOf(PageAnalysisBatchError));
    expect(client.completeJson).toHaveBeenCalledTimes(3);
  });

  it.each([
    new AiClientError("unauthorized", { status: 401, code: "authentication" }),
    new AiClientError("bad request", { status: 400, code: "request_rejected" }),
    new AiClientError("configuration", { code: "configuration" }),
    new AiClientError("deadline aborted", { code: "aborted" })
  ])("does not retry a non-transient Direct client failure", async (failure) => {
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn().mockRejectedValue(failure)
    };
    await expect(analyzePageBatch(client, {
      pages: [page], locale: "zh-CN", maxAttempts: 3, semanticValidation: "free_direct",
      retryDelay: async () => undefined
    })).rejects.toMatchObject({ cause: failure });
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("does not start another Direct call when the hard-deadline signal aborts between attempts", async () => {
    const controller = new AbortController();
    const client: JsonCompletionClient = {
      configuredModel: "mock-model",
      completeJson: vi.fn().mockRejectedValue(new AiClientError("temporary", { code: "temporary_provider", status: 503 }))
    };
    await expect(analyzePageBatch(client, {
      pages: [page], locale: "zh-CN", maxAttempts: 3, semanticValidation: "free_direct", signal: controller.signal,
      retryDelay: async () => controller.abort(new Error("hard deadline"))
    })).rejects.toMatchObject({ name: "PageAnalysisBatchError" });
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("R6-shaped foundation summary is not rejected by language gate when deferred for Free semantic review", async () => {
    // Mirrors protected-staging R6: language validation failed at analyses[0].summary
    // under legacy gates; deferred Free foundation must survive until ReportSemanticReview.
    const r6Shaped = {
      analyses: [{
        url: page.url,
        pageType: page.pageType,
        summary: "凌顺（Shun Express）提供 FBA 头程与跨境物流服务，并保留 brand and product names in mixed form。",
        organizationSignals: ["凌顺", "Shun Express"],
        strengths: ["FBA 头程", "API integration"],
        findings: [{
          title: "Organization clarity",
          severity: "opportunity",
          impact: "Buyers may need clearer entity wording on the homepage.",
          evidence: [{ url: page.url, quote: "Target Brand 提供 FBA 头程服务" }],
          recommendation: "Keep verified brand names; let semantic review own final zh customer prose.",
          confidence: "medium"
        }]
      }]
    };
    const legacyClient = clientReturning(r6Shaped);
    await expect(analyzePageBatch(legacyClient, {
      pages: [page],
      locale: "zh-CN",
      maxAttempts: 1,
      semanticValidation: "legacy"
    })).rejects.toThrow(/language validation failed|unexpected_english|Report language/i);

    const deferredClient = clientReturning(r6Shaped);
    const deferred = await analyzePageBatch(deferredClient, {
      pages: [page],
      locale: "zh-CN",
      maxAttempts: 1,
      semanticValidation: "deferred"
    });
    expect(deferred.analyses[0]!.summary).toBe(r6Shaped.analyses[0]!.summary);
    expect(deferredClient.completeJson).toHaveBeenCalledOnce();
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

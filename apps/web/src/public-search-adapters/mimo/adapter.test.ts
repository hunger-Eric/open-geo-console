import { describe, expect, it, vi } from "vitest";
import { type PublicSearchSurfaceAuthority, type SearchQueryVariant } from "@open-geo-console/public-search-observer";
import { createMiMoPublicSearchAdapter, createMiMoPublicSearchAdapterFactory, MIMO_PUBLIC_SEARCH_ADAPTER_VERSION } from "./adapter";
import type { MiMoPublicSearchConfig } from "./config";
import { MIMO_SUCCESS_RESPONSE } from "./fixtures";

const config: MiMoPublicSearchConfig = {
  baseUrl: "https://search.example.test/v1",
  apiKey: "test-search-key",
  model: "mimo-v2.5-pro",
  locale: "zh-CN",
  region: "CN"
};

const surface = {
  surfaceId: "mimo-native-web-search",
  providerId: "xiaomi-mimo",
  productId: "native-web-search",
  surfaceKind: "documented_api" as const,
  contractVersion: "public-search-surface-v1",
  surfaceVersion: "mimo-native-web-search-v1",
  adapterVersion: MIMO_PUBLIC_SEARCH_ADAPTER_VERSION,
  locale: "zh-CN",
  region: "CN"
};

const authority: PublicSearchSurfaceAuthority = {
  authorityId: "mimo-authority",
  environment: "test",
  surface,
  active: true,
  certifiedAt: "2026-07-13T00:00:00.000Z",
  evidenceReference: "fixture://mimo",
  supportedLocales: ["zh-CN"],
  supportedRegions: ["CN"]
};

const query: SearchQueryVariant = {
  id: "query-mimo-1",
  questionId: "question-1",
  fanoutVersion: "public-search-fanout-v1",
  locale: "zh-CN",
  region: "CN",
  exactQuery: "international LCL freight supplier",
  derivationRuleId: "fixture",
  resultDepth: 10
};

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("MiMo public-search adapter", () => {
  it("builds the exact factory identity without report-model configuration", () => {
    const identity = createMiMoPublicSearchAdapterFactory().resolveIdentity({
      environment: {
        OGC_PUBLIC_SEARCH_MIMO_BASE_URL: config.baseUrl,
        OGC_PUBLIC_SEARCH_MIMO_API_KEY: config.apiKey,
        OGC_PUBLIC_SEARCH_MIMO_MODEL: config.model
      },
      locale: "zh-CN",
      region: "CN"
    });
    expect(identity).toMatchObject({ adapterId: "mimo", providerId: "xiaomi-mimo", productId: "native-web-search", modelId: config.model, adapterVersion: MIMO_PUBLIC_SEARCH_ADAPTER_VERSION, surface });
  });

  it("forces search and normalizes only structured annotations with contiguous output", async () => {
    const fetch = vi.fn(async () => response({
      ...MIMO_SUCCESS_RESPONSE,
      choices: [{
        ...MIMO_SUCCESS_RESPONSE.choices[0],
        message: {
          ...MIMO_SUCCESS_RESPONSE.choices[0]!.message,
          annotations: [
            ...MIMO_SUCCESS_RESPONSE.choices[0]!.message.annotations,
            { ...MIMO_SUCCESS_RESPONSE.choices[0]!.message.annotations[0], url: "https://www.dsv.com/zh-cn/our-solutions/modes-of-transport/sea-freight/less-than-container-load/#duplicate" }
          ]
        }
      }]
    }));
    const adapter = createMiMoPublicSearchAdapter({ config, authority, fetch });
    const observation = await adapter.search({ surface, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal });

    expect(fetch).toHaveBeenCalledWith("https://search.example.test/v1/chat/completions", expect.objectContaining({
      method: "POST", signal: expect.any(AbortSignal), headers: expect.objectContaining({ Authorization: "Bearer test-search-key" })
    }));
    expect(JSON.parse((fetch.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual(expect.objectContaining({
      model: config.model,
      tools: [{ type: "web_search", max_keyword: 1, force_search: true, limit: 10 }],
      stream: false,
      temperature: 0.1,
      thinking: { type: "disabled" }
    }));
    expect(observation).toMatchObject({ status: "complete", results: [{ surfaceResultOrder: 1, displayedHost: "www.dsv.com" }], usage: { requestCount: 3, resultCount: 1, costUncertain: true } });
    expect((observation as { observationId: string }).observationId).toMatch(/^observation-/);
    expect(JSON.stringify(observation)).not.toContain("Generated prose is not evidence.");
    expect(JSON.stringify(observation)).not.toContain(config.apiKey);
  });

  it("returns malformed without prose fallback for missing or unsafe annotations", async () => {
    const contentOnly = createMiMoPublicSearchAdapter({ config, authority, fetch: async () => response({ choices: [{ finish_reason: "stop", message: { content: "https://unsafe.example/answer" } }], usage: { web_search_usage: { tool_usage: 1, page_usage: 1 } } }) });
    const unsafe = createMiMoPublicSearchAdapter({ config, authority, fetch: async () => response({ ...MIMO_SUCCESS_RESPONSE, choices: [{ ...MIMO_SUCCESS_RESPONSE.choices[0], message: { ...MIMO_SUCCESS_RESPONSE.choices[0]!.message, annotations: [{ ...MIMO_SUCCESS_RESPONSE.choices[0]!.message.annotations[0], url: "https://user:pass@unsafe.example/path" }] } }] }) });
    const incompleteUsage = createMiMoPublicSearchAdapter({ config, authority, fetch: async () => response({ ...MIMO_SUCCESS_RESPONSE, usage: { web_search_usage: { tool_usage: 1 } } }) });

    await expect(contentOnly.search({ surface, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal })).resolves.toMatchObject({ status: "malformed", results: [] });
    await expect(unsafe.search({ surface, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal })).resolves.toMatchObject({ status: "malformed", results: [] });
    await expect(incompleteUsage.search({ surface, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal })).resolves.toMatchObject({ status: "malformed", results: [] });
  });

  it("classifies HTTP and transport errors without exposing raw provider data", async () => {
    const adapter = createMiMoPublicSearchAdapter({ config, authority, fetch: async () => response({ error: { message: "secret payload" } }, 401) });
    await expect(adapter.search({ surface, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal })).rejects.toMatchObject({ errorClass: "authentication" });
    expect(adapter.classifyError?.({ errorClass: "authentication" })).toBe("authentication");
    expect(adapter.classifyError?.({ errorClass: "unsupported" })).toBe("unsupported");
    expect(adapter.classifyError?.({ errorClass: "rate_limited" })).toBe("rate_limited");
    expect(adapter.classifyError?.(new DOMException("abort", "AbortError"))).toBe("aborted");
    expect(adapter.classifyError?.(new Error("Authorization: Bearer test-search-key"))).toBe("unavailable");
  });
});

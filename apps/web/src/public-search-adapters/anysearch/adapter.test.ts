import { describe, expect, it, vi } from "vitest";
import type { PublicSearchSurfaceAuthority, SearchQueryVariant } from "@open-geo-console/public-search-observer";
import { ANYSEARCH_PUBLIC_SEARCH_ADAPTER_VERSION, createAnySearchPublicSearchAdapter, createAnySearchPublicSearchAdapterFactory, parseAnySearchResults } from "./adapter";
import type { AnySearchPublicSearchConfig } from "./config";

const config: AnySearchPublicSearchConfig = { endpoint: "https://api.anysearch.com/v1/search", apiKey: "search-key", locale: "zh-CN", region: "CN", zone: "cn" };
const surface = { surfaceId: "anysearch-unified-search", providerId: "anysearch", productId: "unified-search", surfaceKind: "documented_api" as const, contractVersion: "public-search-surface-v1", surfaceVersion: "anysearch-unified-search-v1", adapterVersion: ANYSEARCH_PUBLIC_SEARCH_ADAPTER_VERSION, locale: "zh-CN", region: "CN" };
const authority: PublicSearchSurfaceAuthority = { authorityId: "anysearch-authority", environment: "test", surface, active: true, certifiedAt: "2030-01-01T00:00:00.000Z", evidenceReference: "fixture://anysearch", supportedLocales: ["zh-CN"], supportedRegions: ["CN"] };
const query: SearchQueryVariant = { id: "query-1", questionId: "question-1", fanoutVersion: "public-search-fanout-v1", locale: "zh-CN", region: "CN", exactQuery: "国际物流供应商", derivationRuleId: "fixture", resultDepth: 10 };
const payload = { code: 0, data: { results: [{ title: "服务说明", url: "https://provider.example/services/#fragment", snippet: "提供国际物流服务", content: "provider content must never be retained" }] } };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

describe("AnySearch public-search adapter", () => {
  it("builds an exact fixed identity", () => {
    expect(createAnySearchPublicSearchAdapterFactory().resolveIdentity({ environment: { OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: config.endpoint, OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: config.apiKey }, locale: "zh-CN", region: "CN" }))
      .toMatchObject({ adapterId: "anysearch", providerId: "anysearch", productId: "unified-search", modelId: "anysearch-unified-search-v1", surface });
  });

  it("posts locale and zone, deduplicates URLs, and excludes provider content", async () => {
    const transport = vi.fn(async () => response({ code: 0, data: { results: [...payload.data.results, { ...payload.data.results[0], url: "https://provider.example/services" }] } }));
    const observation = await createAnySearchPublicSearchAdapter({ config, authority, fetch: transport }).search({ surface, query, budget: { maxRequests: 1, maxResults: 10, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal });
    const request = transport.mock.calls[0]![1] as RequestInit;
    expect(transport).toHaveBeenCalledWith(config.endpoint, expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Authorization: "Bearer search-key" }) }));
    expect(JSON.parse(String(request.body))).toEqual({ query: query.exactQuery, max_results: 10, zone: "cn", language: "zh-CN", format: "json" });
    expect(observation).toMatchObject({ status: "complete", results: [{ surfaceResultOrder: 1, url: "https://provider.example/services", displayedHost: "provider.example" }], usage: { requestCount: 1, resultCount: 1, costUncertain: true } });
    expect(JSON.stringify(observation)).not.toContain("provider content");
    expect(JSON.stringify(observation)).not.toContain(config.apiKey);
  });

  it("fails closed on unsafe or malformed results", async () => {
    const unsafe = createAnySearchPublicSearchAdapter({ config, authority, fetch: async () => response({ code: 0, data: { results: [{ title: "private", url: "http://127.0.0.1/x", snippet: "private" }] } }) });
    await expect(unsafe.search({ surface, query, budget: { maxRequests: 1, maxResults: 3, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal })).resolves.toMatchObject({ status: "malformed", results: [] });
    expect(() => parseAnySearchResults({ code: 0, data: { results: [{ title: "x", url: "https://example.com", snippet: 1 }] } }, 3)).toThrow(/invalid/i);
  });

  it.each([[401, "authentication"], [429, "rate_limited"], [400, "unsupported"], [503, "unavailable"]])("classifies HTTP %i as %s", async (status, errorClass) => {
    const adapter = createAnySearchPublicSearchAdapter({ config, authority, fetch: async () => response({}, status) });
    await expect(adapter.search({ surface, query, budget: { maxRequests: 1, maxResults: 3, timeoutMs: 100, maxCostMicros: 1_000 }, signal: new AbortController().signal })).rejects.toMatchObject({ errorClass });
  });
});

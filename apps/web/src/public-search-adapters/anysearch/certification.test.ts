import { describe, expect, it } from "vitest";
import { finalizeAnySearchPublicSearchCertification, runAnySearchPublicSearchProbe } from "./certification";

const environment = { OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: "https://api.anysearch.com/v1/search", OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: "search-key" };
const result = (url = "https://www.w3.org/") => ({ title: "Official result", url, snippet: "Public source" });

describe("AnySearch public-search certification", () => {
  it("runs exactly three fixed live cases and deterministic typed failure checks", async () => {
    let liveCalls = 0;
    const transport: typeof fetch = async (_url, init) => {
      const query = JSON.parse(String(init?.body)).query as string;
      liveCalls += 1;
      return new Response(JSON.stringify({ code: 0, data: { results: [
        result(query.includes("gov.cn") ? "https://www.gov.cn/zhengce/" : query.includes("Consortium") ? "https://www.w3.org/" : "https://logistics.example/services")
      ] } }), { status: 200 });
    };
    const probe = await runAnySearchPublicSearchProbe({ environment, locale: "zh-CN", region: "CN", fetch: transport });
    expect(liveCalls).toBe(3);
    expect(probe.cases).toHaveLength(3);
    expect(probe.cases.every(({ passed }) => passed)).toBe(true);
    expect(probe.failureSemantics).toEqual({ authentication: true, rateLimited: true, timedOut: true, malformed: true });
  });

  it("fails artifact creation until quality, failure semantics, and review gates pass", async () => {
    const transport: typeof fetch = async (_url, init) => {
      const query = JSON.parse(String(init?.body)).query as string;
      return new Response(JSON.stringify({ code: 0, data: { results: [result(query.includes("gov.cn") ? "https://www.gov.cn/" : query.includes("Consortium") ? "https://www.w3.org/" : "https://logistics.example/")] } }), { status: 200 });
    };
    const probe = await runAnySearchPublicSearchProbe({ environment, locale: "zh-CN", region: "CN", fetch: transport });
    const base = { probe, locale: "zh-CN", region: "CN", reviewedBy: "operator", reviewedAt: "2030-01-01T00:00:00.000Z", review: { termsReviewReference: "terms", commercialUseReviewReference: "commercial", storageDisplayReviewReference: "storage" }, signing: { secret: "test-signing-secret-with-more-than-32-bytes", keyId: "test-key", version: "v1" as const } };
    expect(finalizeAnySearchPublicSearchCertification(base)).toMatchObject({ adapterId: "anysearch", installable: true, provenanceSemantics: expect.stringContaining("content is excluded") });
    expect(() => finalizeAnySearchPublicSearchCertification({ ...base, probe: { ...probe, cases: probe.cases.map((item, index) => index ? item : { ...item, passed: false }) } })).toThrow(/quality/i);
    expect(() => finalizeAnySearchPublicSearchCertification({ ...base, review: { ...base.review, termsReviewReference: "" } })).toThrow(/terms/i);
  });
});

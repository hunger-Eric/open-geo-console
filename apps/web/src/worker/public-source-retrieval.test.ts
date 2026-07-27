import { describe, expect, it } from "vitest";
import { createPublicSourceRetrievalRequest, normalizePublicSourceRetrievalResult } from "./public-source-retrieval";

describe("public source retrieval boundary", () => {
  it("creates a bounded safe-fetch request without performing network work", () => {
    const request = createPublicSourceRetrievalRequest({
      observationId: "obs-1",
      queryId: "query-1",
      resultUrl: "https://source.example/path#fragment"
    });
    expect(request).toMatchObject({ maxBytes: 2_097_152, maxRedirects: 5, requireRobotsAtEveryOrigin: true });
    expect(request.resultUrl).toBe("https://source.example/path");
  });

  it("normalizes extractor output into data-only evidence facts", () => {
    const result = normalizePublicSourceRetrievalResult({
      request: createPublicSourceRetrievalRequest({ observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/path" }),
      finalUrl: "https://source.example/path",
      retrievalState: "available",
      robotsAllowed: true,
      publiclyRoutable: true,
      accessBarrier: "none",
      robotsCheckedOrigins: ["https://source.example"],
      contentBytes: 120,
      normalizedText: "  A documented freight route.  ",
      verifiedExcerpt: "A documented freight route."
    });
    expect(result).toMatchObject({ retrievalState: "available", normalizedText: "A documented freight route." });
    expect(result.normalizedContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result).not.toHaveProperty("body");
    expect(result).not.toHaveProperty("html");
  });

  it("fails closed when extractor state contradicts the safe boundary", () => {
    expect(() => normalizePublicSourceRetrievalResult({
      request: createPublicSourceRetrievalRequest({ observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/path" }),
      retrievalState: "available",
      robotsAllowed: false,
      publiclyRoutable: true,
      accessBarrier: "none",
      robotsCheckedOrigins: ["https://source.example"],
      contentBytes: 10,
      normalizedText: "text"
    })).toThrow(/safe retrieval/i);
  });

  it("requires robots evidence for every redirect origin", () => {
    const request = createPublicSourceRetrievalRequest({ observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/path" });
    const base = {
      request,
      finalUrl: "https://publisher.example/article",
      redirectChain: ["https://redirector.example/go"],
      retrievalState: "available" as const,
      robotsAllowed: true,
      publiclyRoutable: true,
      accessBarrier: "none" as const,
      contentBytes: 10,
      normalizedText: "public article"
    };
    expect(() => normalizePublicSourceRetrievalResult({
      ...base,
      robotsCheckedOrigins: ["https://source.example", "https://publisher.example"]
    })).toThrow(/safe retrieval/i);
    expect(() => normalizePublicSourceRetrievalResult({
      ...base,
      robotsCheckedOrigins: ["https://source.example", "https://redirector.example", "https://publisher.example"]
    })).not.toThrow();
  });

  it("rejects extracted content for inaccessible results", () => {
    expect(() => normalizePublicSourceRetrievalResult({
      request: createPublicSourceRetrievalRequest({ observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/path" }),
      retrievalState: "paywalled",
      robotsAllowed: true,
      publiclyRoutable: true,
      accessBarrier: "paywall",
      robotsCheckedOrigins: ["https://source.example"],
      contentBytes: 10,
      normalizedText: "subscriber-only text"
    })).toThrow(/must not retain/i);
  });

  it("requires byte accounting, bounded redirects, and an excerpt inside normalized text", () => {
    const request = createPublicSourceRetrievalRequest({ observationId: "obs-1", queryId: "query-1", resultUrl: "https://source.example/path" });
    const base = {
      request, retrievalState: "available" as const, robotsAllowed: true, publiclyRoutable: true,
      accessBarrier: "none" as const, robotsCheckedOrigins: ["https://source.example"], normalizedText: "bounded public text"
    };
    expect(() => normalizePublicSourceRetrievalResult(base)).toThrow(/safe retrieval/i);
    expect(() => normalizePublicSourceRetrievalResult({
      ...base, contentBytes: 10, redirectChain: Array.from({ length: 6 }, () => "https://source.example/next")
    })).toThrow(/redirect limit/i);
    expect(() => normalizePublicSourceRetrievalResult({
      ...base, contentBytes: 10, verifiedExcerpt: "text not present"
    })).toThrow(/must match/i);
  });
});

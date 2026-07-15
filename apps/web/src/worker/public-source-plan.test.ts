import { describe, expect, it } from "vitest";
import type { MarketSearchObservation } from "@open-geo-console/public-search-observer";
import { createPublicSourceRetrievalPlan } from "./public-source-plan";

describe("public source retrieval plan", () => {
  it("deduplicates canonical URLs and caps each domain deterministically", () => {
    const plan = createPublicSourceRetrievalPlan([
      observation("q1", ["https://a.example/path?utm_source=x", "https://a.example/second", "https://a.example/third"]),
      observation("q2", ["https://a.example/path", "https://b.example/one"])
    ]);
    expect(plan.map(({ canonicalUrl }) => canonicalUrl)).toEqual([
      "https://a.example/path",
      "https://a.example/second",
      "https://b.example/one"
    ]);
  });

  it("caps a question at twelve planned sources", () => {
    const urls = Array.from({ length: 20 }, (_, index) => `https://source-${index}.example/page`);
    expect(createPublicSourceRetrievalPlan([observation("q", urls)])).toHaveLength(12);
  });

  it("uses the fixed budget on diverse retrievable pages before PDF and download candidates", () => {
    const plan = createPublicSourceRetrievalPlan([
      observation("q1", ["https://a.example/brochure.pdf", "https://a.example/services"]),
      observation("q2", ["https://b.example/report.pdf", "https://b.example/warehouse"]),
      observation("q3", ["https://c.example/download?id=1", "https://c.example/logistics"])
    ], { maxSources: 3, maxPerDomain: 2 });

    expect(plan.map(({ canonicalUrl }) => canonicalUrl)).toEqual([
      "https://a.example/services",
      "https://b.example/warehouse",
      "https://c.example/logistics"
    ]);
  });
});

function observation(queryId: string, urls: string[]): MarketSearchObservation {
  return {
    observationId: `observation-${queryId}`,
    surface: { surfaceId: "fixture", providerId: "fixture", productId: "fixture", surfaceKind: "documented_api", contractVersion: "public-search-surface-v1", surfaceVersion: "v1", adapterVersion: "v1", locale: "en", region: "US" },
    queryId,
    exactQuery: queryId,
    requestedAt: "2030-01-01T00:00:00.000Z",
    completedAt: "2030-01-01T00:00:01.000Z",
    status: "complete",
    results: urls.map((url, index) => ({ surfaceResultOrder: index + 1, url, title: url, snippet: "", displayedHost: new URL(url).hostname })),
    usage: { requestCount: 1, resultCount: urls.length, estimatedCostMicros: 1, costUncertain: false }
  };
}

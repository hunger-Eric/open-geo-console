import { describe, expect, it } from "vitest";
import {
  fanoutQueryIds,
  hasExtraObservedQueryIds,
  isProperSubsetOfPlan,
  observationQueryIds,
  projectFanoutsToObservedQueryIds,
  queryIdSetsEqual,
  uniqueSortedIds
} from "./public-source-query-coverage";
import type { SearchQueryFanout } from "@open-geo-console/public-search-observer";

const surface = {
  surfaceId: "s",
  providerId: "p",
  productId: "prod",
  surfaceKind: "documented_api" as const,
  contractVersion: "public-search-surface-v1",
  surfaceVersion: "v1",
  adapterVersion: "a1",
  locale: "zh-CN",
  region: "CN"
};

function fanout(questionId: string, queryIds: string[]): SearchQueryFanout {
  return {
    questionId,
    questionSetVersion: "qs-v1",
    fanoutVersion: "public-search-fanout-v1",
    surface,
    budget: { maxRequests: 1, maxResults: 3, timeoutMs: 30_000, maxCostMicros: 100_000 },
    queries: queryIds.map((id, index) => ({
      id,
      questionId,
      fanoutVersion: "public-search-fanout-v1",
      locale: "zh-CN",
      region: "CN",
      exactQuery: `query text ${index}`,
      derivationRuleId: `rule-${index}`,
      resultDepth: 3
    }))
  };
}

describe("public-source query coverage helpers", () => {
  it("detects set equality and proper subsets", () => {
    expect(queryIdSetsEqual(["b", "a"], ["a", "b"])).toBe(true);
    expect(queryIdSetsEqual(["a"], ["a", "b"])).toBe(false);
    expect(isProperSubsetOfPlan(["a"], ["a", "b", "c"])).toBe(true);
    expect(isProperSubsetOfPlan(["a", "b", "c"], ["a", "b", "c"])).toBe(false);
    expect(isProperSubsetOfPlan(["x"], ["a", "b"])).toBe(false);
    expect(hasExtraObservedQueryIds(["a", "x"], ["a", "b"])).toBe(true);
  });

  it("projects fanouts to observed query ids only", () => {
    const full = [fanout("q1", ["q1-a", "q1-b", "q1-c"]), fanout("q2", ["q2-a", "q2-b"])];
    const projected = projectFanoutsToObservedQueryIds(full, new Set(["q1-a", "q1-b", "q2-a"]));
    expect(fanoutQueryIds(projected)).toEqual(uniqueSortedIds(["q1-a", "q1-b", "q2-a"]));
    expect(projected[0]!.queries).toHaveLength(2);
    expect(projected[1]!.queries).toHaveLength(1);
  });

  it("reads observation query ids", () => {
    expect(observationQueryIds([{ queryId: "b" }, { queryId: "a" }, { queryId: "a" }])).toEqual(["a", "b"]);
  });
});

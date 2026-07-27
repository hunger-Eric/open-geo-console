import type { MarketSearchObservation, PublicSearchCoverage, SnapshotFreshness } from "./types";

export function classifyPublicSearchCoverage(input: {
  expectedQueryCount: number;
  observations: readonly MarketSearchObservation[];
}): PublicSearchCoverage {
  if (!Number.isSafeInteger(input.expectedQueryCount) || input.expectedQueryCount < 1) throw new TypeError("expectedQueryCount must be positive");
  const usable = input.observations.filter(({ status }) => status === "complete" || status === "partial");
  const completedQueryCount = new Set(usable.map(({ queryId }) => queryId)).size;
  const observedResultCount = usable.reduce((sum, item) => sum + item.results.length, 0);
  const domains = new Set(usable.flatMap((item) => item.results.map((result) => result.displayedHost.toLocaleLowerCase())));
  const status = completedQueryCount === input.expectedQueryCount && observedResultCount > 0
    ? "complete" : completedQueryCount > 0 && observedResultCount > 0 ? "partial" : "insufficient";
  return {
    status, completedQueryCount, expectedQueryCount: input.expectedQueryCount, observedResultCount,
    surfaceDomainCount: domains.size,
    reasons: status === "complete" ? [] : [status === "partial" ? "Only part of the exact query family produced observable public results." : "No usable public-search result observation was available."]
  };
}

export function classifySnapshotFreshness(completedAt: string, evidenceCutoff: string): SnapshotFreshness {
  const completed = Date.parse(completedAt);
  const cutoff = Date.parse(evidenceCutoff);
  if (!Number.isFinite(completed) || !Number.isFinite(cutoff) || cutoff < completed) throw new TypeError("freshness timestamps are invalid");
  const ageDays = (cutoff - completed) / 86_400_000;
  return ageDays <= 7 ? "fresh" : ageDays <= 30 ? "stale" : "expired";
}

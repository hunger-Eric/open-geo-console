import { createHash } from "node:crypto";
import type { CanonicalBuyerQuestion, MarketSnapshotIdentity, PublicSearchSurface, SearchQueryFanout } from "./types";

export function deterministicId(namespace: string, parts: readonly string[]): string {
  return `${namespace}-${createHash("sha256").update(JSON.stringify(parts.map((part) => part.normalize("NFC")))).digest("hex")}`;
}

export function createMarketSnapshotIdentity(input: {
  question: CanonicalBuyerQuestion;
  surface: PublicSearchSurface;
  fanout: Pick<SearchQueryFanout, "fanoutVersion" | "queries" | "budget">;
}): MarketSnapshotIdentity {
  const planIdentity = JSON.stringify({
    fanoutVersion: input.fanout.fanoutVersion.trim().normalize("NFKC"),
    queries: input.fanout.queries.map(({ exactQuery, derivationRuleId, resultDepth }) => ({
      exactQuery: exactQuery.trim().normalize("NFKC"),
      derivationRuleId: derivationRuleId.trim().normalize("NFKC"),
      resultDepth
    })),
    budget: {
      maxRequests: input.fanout.budget.maxRequests,
      maxResults: input.fanout.budget.maxResults,
      timeoutMs: input.fanout.budget.timeoutMs,
      maxCostMicros: input.fanout.budget.maxCostMicros
    }
  });
  const queryPlanHash = createHash("sha256").update(planIdentity).digest("hex");
  const dimensions = [
    input.question.normalizedText,
    input.question.locale,
    input.question.region,
    input.surface.surfaceId,
    input.surface.surfaceVersion,
    input.fanout.fanoutVersion,
    queryPlanHash
  ].map((value) => value.trim().normalize("NFKC"));
  return {
    id: deterministicId("market", dimensions),
    normalizedQuestion: dimensions[0]!, locale: dimensions[1]!, region: dimensions[2]!,
    surfaceId: dimensions[3]!, surfaceVersion: dimensions[4]!, fanoutVersion: dimensions[5]!, queryPlanHash: dimensions[6]!
  };
}

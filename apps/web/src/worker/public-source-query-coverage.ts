import { parseSearchQueryFanout, type SearchQueryFanout } from "@open-geo-console/public-search-observer";

/** Stable ordered unique IDs. */
export function uniqueSortedIds(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

export function fanoutQueryIds(fanouts: readonly SearchQueryFanout[]): string[] {
  return uniqueSortedIds(fanouts.flatMap((fanout) => fanout.queries.map(({ id }) => id)));
}

export function observationQueryIds(observations: readonly { readonly queryId: string }[]): string[] {
  return uniqueSortedIds(observations.map(({ queryId }) => queryId));
}

/** True when A and B contain exactly the same elements. */
export function queryIdSetsEqual(left: readonly string[], right: readonly string[]): boolean {
  const a = uniqueSortedIds(left);
  const b = uniqueSortedIds(right);
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * True when every observed id is in the plan and the plan has at least one
 * id that was never observed (strict subset of plan coverage).
 */
export function isProperSubsetOfPlan(observedIds: readonly string[], planIds: readonly string[]): boolean {
  const plan = new Set(planIds);
  const observed = uniqueSortedIds(observedIds);
  if (observed.length === 0) return plan.size > 0;
  if (observed.some((id) => !plan.has(id))) return false;
  return observed.length < plan.size;
}

/**
 * Project each fanout down to queries that appear in the observed set.
 * Preserves fanout identity fields; fails closed if a fanout would become empty.
 */
export function projectFanoutsToObservedQueryIds(
  fanouts: readonly SearchQueryFanout[],
  observedIds: ReadonlySet<string>
): SearchQueryFanout[] {
  return fanouts.map((fanout) => {
    const queries = fanout.queries.filter(({ id }) => observedIds.has(id));
    if (queries.length === 0) {
      throw new TypeError(
        `$.fanouts: Question ${fanout.questionId} has no observed query variants after coverage projection.`
      );
    }
    return parseSearchQueryFanout({
      questionId: fanout.questionId,
      questionSetVersion: fanout.questionSetVersion,
      fanoutVersion: fanout.fanoutVersion,
      surface: fanout.surface,
      queries,
      budget: fanout.budget
    });
  });
}

export function hasExtraObservedQueryIds(observedIds: readonly string[], planIds: readonly string[]): boolean {
  const plan = new Set(planIds);
  return uniqueSortedIds(observedIds).some((id) => !plan.has(id));
}

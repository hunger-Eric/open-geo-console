export const PUBLIC_SOURCE_FRESH_MS = 7 * 24 * 60 * 60 * 1_000;
export const PUBLIC_SOURCE_MAX_HISTORICAL_MS = 30 * 24 * 60 * 60 * 1_000;

export interface PublicSourceQuestionCoverage {
  questionId: string;
  ageMs: number;
  sufficientlyEvidenced: boolean;
  refreshAttempted: boolean;
  refreshFailed: boolean;
}

export interface PublicSourceCommercialDecision {
  outcome: "completed" | "completed_limited" | "failed";
  settlement: "settle" | "refund";
  usableQuestionCount: number;
  refreshRequiredQuestionIds: string[];
  historicalQuestionIds: string[];
  reasons: string[];
}

export function decidePublicSourceCommercialCoverage(input: {
  questions: readonly PublicSourceQuestionCoverage[];
  authorityReady: boolean;
  evidenceIsolated: boolean;
  artifactReady: boolean;
  costCapExceeded?: boolean;
}): PublicSourceCommercialDecision {
  if (!input.authorityReady || !input.evidenceIsolated || !input.artifactReady || input.costCapExceeded) {
    return failed(0, [!input.authorityReady ? "authority_unavailable" : !input.evidenceIsolated ? "evidence_isolation_failed" :
      !input.artifactReady ? "artifact_unavailable" : "cost_cap_exceeded"]);
  }
  const refreshRequired = input.questions.filter(({ ageMs }) => ageMs > PUBLIC_SOURCE_FRESH_MS).map(({ questionId }) => questionId);
  const unresolvedRefresh = input.questions.filter(({ ageMs, refreshAttempted, refreshFailed }) =>
    ageMs > PUBLIC_SOURCE_FRESH_MS && (!refreshAttempted || !refreshFailed));
  if (unresolvedRefresh.length > 0) return failed(0, ["refresh_required"]);
  if (input.questions.some(({ ageMs, refreshFailed }) => ageMs > PUBLIC_SOURCE_MAX_HISTORICAL_MS && refreshFailed)) {
    return failed(0, ["expired_refresh_failed"]);
  }
  const usable = input.questions.filter(({ ageMs, sufficientlyEvidenced, refreshFailed }) =>
    sufficientlyEvidenced && (ageMs <= PUBLIC_SOURCE_FRESH_MS || (ageMs <= PUBLIC_SOURCE_MAX_HISTORICAL_MS && refreshFailed)));
  const historical = usable.filter(({ ageMs }) => ageMs > PUBLIC_SOURCE_FRESH_MS).map(({ questionId }) => questionId);
  if (usable.length >= 3 && historical.length === 0) return {
    outcome: "completed", settlement: "settle", usableQuestionCount: usable.length,
    refreshRequiredQuestionIds: refreshRequired, historicalQuestionIds: [], reasons: []
  };
  if (usable.length >= 2) return {
    outcome: "completed_limited", settlement: "refund", usableQuestionCount: usable.length,
    refreshRequiredQuestionIds: refreshRequired, historicalQuestionIds: historical,
    reasons: historical.length ? ["historical_after_refresh_failure"] : ["partial_question_coverage"]
  };
  return failed(usable.length, ["insufficient_question_coverage"], refreshRequired, historical);
}

function failed(count: number, reasons: string[], refreshRequiredQuestionIds: string[] = [], historicalQuestionIds: string[] = []): PublicSourceCommercialDecision {
  return { outcome: "failed", settlement: "refund", usableQuestionCount: count, refreshRequiredQuestionIds, historicalQuestionIds, reasons };
}

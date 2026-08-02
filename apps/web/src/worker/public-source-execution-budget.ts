import { JobError } from "./job-errors";

export interface PublicSourceAttemptBudget {
  searchMs: 180_000;
  retrievalMs: 180_000;
  artifactReserveMs: 180_000;
  cleanupMarginMs: 60_000;
}

export class PublicSourceAttemptDeferredError extends JobError {
  constructor() {
    super(
      "The persisted website foundation will resume in a fresh Worker attempt with a complete public-source budget.",
      "public_source_attempt_deferred",
      "transient"
    );
  }
}

export function createPublicSourceAttemptBudget(
  remainingMs: number,
  options: { semanticValidation?: "legacy" | "deferred" | "free_direct" } = {}
): PublicSourceAttemptBudget {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) throw new PublicSourceAttemptDeferredError();
  if (options.semanticValidation !== "free_direct" && remainingMs < 600_000) {
    throw new PublicSourceAttemptDeferredError();
  }
  return { searchMs: 180_000, retrievalMs: 180_000, artifactReserveMs: 180_000, cleanupMarginMs: 60_000 };
}

/** Splits a propagated sub-budget into the per-query/per-source deadline each unit receives. */
export function splitPublicSourceSubBudgetMs(totalMs: number, units: number): number {
  if (!Number.isSafeInteger(totalMs) || totalMs < 1 || totalMs > 60 * 60_000) throw new TypeError("Public-source sub-budget is invalid.");
  if (!Number.isSafeInteger(units) || units < 1) throw new TypeError("Public-source sub-budget unit count is invalid.");
  return Math.max(1, Math.floor(totalMs / units));
}

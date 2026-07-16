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

export function createPublicSourceAttemptBudget(remainingMs: number): PublicSourceAttemptBudget {
  if (!Number.isFinite(remainingMs) || remainingMs < 600_000) throw new PublicSourceAttemptDeferredError();
  return { searchMs: 180_000, retrievalMs: 180_000, artifactReserveMs: 180_000, cleanupMarginMs: 60_000 };
}

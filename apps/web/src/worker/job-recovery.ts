import type { JobCheckpoint, ScanJobRow } from "@/db/schema";
import { CheckpointValidationError } from "./job-errors";
import { recoveryEnvelope, type ScanJobPhase } from "./job-state";

export function validateRecoveryCheckpoint(input: {
  job: Pick<ScanJobRow, "id" | "reportId" | "productContract" | "fulfillmentMethodology" | "locale" | "checkpointRevision" | "currentPhase">;
  checkpoint: JobCheckpoint;
  phase: ScanJobPhase;
  inputHash: string;
}): void {
  const recovery = recoveryEnvelope(input.checkpoint);
  if (!recovery) throw new CheckpointValidationError("The job checkpoint has no recoverable envelope.");
  if (recovery.identity.jobId !== input.job.id || recovery.identity.reportId !== input.job.reportId ||
      recovery.identity.productContract !== input.job.productContract || recovery.identity.methodology !== input.job.fulfillmentMethodology ||
      recovery.identity.locale !== input.job.locale) {
    throw new CheckpointValidationError("The checkpoint identity does not match the queued job.");
  }
  if (recovery.revision !== input.job.checkpointRevision || recovery.phase !== input.phase || recovery.inputHash !== input.inputHash) {
    throw new CheckpointValidationError("The checkpoint revision, phase, or input identity is stale.");
  }
}


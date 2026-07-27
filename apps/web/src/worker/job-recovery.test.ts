import { describe, expect, it } from "vitest";
import { validateRecoveryCheckpoint } from "./job-recovery";

const job = { id: "job-1", reportId: "report-1", productContract: "recommendation_forensics_v1", fulfillmentMethodology: "public_search_source_forensics_v1", locale: "zh", checkpointRevision: 2, currentPhase: "public_source_preflight" } as const;
const checkpoint = { recovery: { schemaVersion: 1 as const, phase: "public_source_preflight" as const, revision: 2, phaseAttempt: 0, resumeGeneration: 1,
  identity: { jobId: "job-1", reportId: "report-1", productContract: "recommendation_forensics_v1", methodology: "public_search_source_forensics_v1", locale: "zh", authorityId: "authority-1" },
  inputHash: "input-1", completedArtifacts: ["website-foundation"], remainingWork: ["public-source"], priorTransitionId: "transition-1" } };

describe("checkpoint recovery validation", () => {
  it("accepts only the same job identity, revision, phase and input hash", () => {
    expect(() => validateRecoveryCheckpoint({ job, checkpoint, phase: "public_source_preflight", inputHash: "input-1" })).not.toThrow();
    expect(() => validateRecoveryCheckpoint({ job, checkpoint, phase: "public_source_preflight", inputHash: "other" })).toThrow(/stale/i);
    expect(() => validateRecoveryCheckpoint({ job: { ...job, checkpointRevision: 3 }, checkpoint, phase: "public_source_preflight", inputHash: "input-1" })).toThrow(/stale/i);
  });
});

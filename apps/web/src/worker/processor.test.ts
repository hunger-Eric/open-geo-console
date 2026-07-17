import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { ScanJobRow } from "@/db/schema";

const boundaryMocks = vi.hoisted(() => ({
  getScanJob: vi.fn(),
  failScanJob: vi.fn(),
  recordPaidJobOutcome: vi.fn()
}));
vi.mock("@/db/jobs", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/jobs")>(),
  getScanJob: boundaryMocks.getScanJob,
  failScanJob: boundaryMocks.failScanJob
}));
vi.mock("@/db/commercial-refunds", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/commercial-refunds")>(),
  recordPaidJobOutcome: boundaryMocks.recordPaidJobOutcome
}));
import {
  dispatchReportV4ProductionJob,
  isTerminalScanJob,
  processScanJob,
  resolveRecommendationFulfillmentTarget,
  resolveReportV4ProductionTarget,
  type ReportV4ProductionRunnerInput
} from "./processor";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
// @requirement GEO-V4-COMMERCE-01

const processorSource = readFileSync(new URL("./processor.ts", import.meta.url), "utf8");

describe("strict Report V4 processor routing", () => {
  it("keeps pre-admission before V4 production and legacy fulfillment dispatch", () => {
    const preAdmission = processorSource.indexOf("processReportV4PreAdmissionJob({");
    const v4 = processorSource.indexOf("reportV4ProductionTarget = resolveReportV4ProductionTarget(job)");
    const legacy = processorSource.indexOf("const fulfillmentTarget = resolveRecommendationFulfillmentTarget(job)");
    expect(preAdmission).toBeGreaterThan(-1);
    expect(v4).toBeGreaterThan(preAdmission);
    expect(legacy).toBeGreaterThan(v4);
  });

  it("routes only exact core and enhancement identities", () => {
    expect(resolveReportV4ProductionTarget(v4Job())).toBe("core");
    expect(resolveReportV4ProductionTarget(v4Job({ reason: "v4_diagnosis_enhancement", siteSnapshotId: null, creditReservationId: null }))).toBe("enhancement");
  });

  it.each([
    { name: "missing snapshot", patch: { siteSnapshotId: null } },
    { name: "missing credit", patch: { creditReservationId: null } },
    { name: "wrong artifact", patch: { artifactContract: "combined_geo_report_v3" } },
    { name: "wrong version", patch: { recommendationReportVersion: 2 } },
    { name: "wrong methodology", patch: { fulfillmentMethodology: "public_search_source_forensics_v1" } },
    { name: "enhancement with snapshot", patch: { reason: "v4_diagnosis_enhancement", creditReservationId: null } },
    { name: "enhancement with credit", patch: { reason: "v4_diagnosis_enhancement", siteSnapshotId: null } },
    { name: "correction collision", patch: { correctionId: "correction-1" } }
  ])("fails closed for partial or mixed V4 lineage: $name", ({ patch }) => {
    expect(() => resolveReportV4ProductionTarget(v4Job(patch as Partial<ScanJobRow>))).toThrow(/V4|lineage|lane/i);
  });

  it("does not change legacy, V1 or V2 fulfillment resolution", () => {
    const legacy = { productContract: "legacy_website_audit_v1" as const, fulfillmentMethodology: null, recommendationReportVersion: null };
    const v1 = { productContract: "recommendation_forensics_v1" as const, fulfillmentMethodology: "answer_engine_recommendation_forensics_v1" as const, recommendationReportVersion: 1 as const };
    const v2 = { productContract: "recommendation_forensics_v1" as const, fulfillmentMethodology: "public_search_source_forensics_v1" as const, recommendationReportVersion: 2 as const };
    expect(resolveReportV4ProductionTarget(v4Job({ ...legacy, artifactContract: null, reason: "standard", siteSnapshotId: null, creditReservationId: null, businessQuestionSetId: null }))).toBeNull();
    expect(resolveReportV4ProductionTarget(v4Job({ ...v1, artifactContract: null, reason: "standard", siteSnapshotId: null, creditReservationId: null, businessQuestionSetId: null }))).toBeNull();
    expect(resolveReportV4ProductionTarget(v4Job({ ...v2, artifactContract: null, reason: "standard", siteSnapshotId: null, creditReservationId: null, businessQuestionSetId: null }))).toBeNull();
    expect(resolveRecommendationFulfillmentTarget(legacy)).toBe("legacy");
    expect(resolveRecommendationFulfillmentTarget(v1)).toBe("recommendation_v1");
    expect(resolveRecommendationFulfillmentTarget(v2)).toBe("recommendation_v2");
  });

  it("dispatches exactly one selected runner and returns", async () => {
    const core = vi.fn(async () => undefined);
    const enhancement = vi.fn(async () => undefined);
    const input = runnerInput(v4Job());
    await dispatchReportV4ProductionJob("core", input, { reportV4CoreRunner: core, reportV4EnhancementRunner: enhancement });
    expect(core).toHaveBeenCalledExactlyOnceWith(input);
    expect(enhancement).not.toHaveBeenCalled();
    await dispatchReportV4ProductionJob("enhancement", input, { reportV4CoreRunner: core, reportV4EnhancementRunner: enhancement });
    expect(enhancement).toHaveBeenCalledExactlyOnceWith(input);
  });

  it("fails closed when the selected production runner is absent", async () => {
    await expect(dispatchReportV4ProductionJob("core", runnerInput(v4Job()), {})).rejects.toThrow(/core runner.*not configured/i);
  });

  it("processScanJob rethrows a non-terminal V4 runner error without generic failure or commerce writes", async () => {
    const job = v4Job();
    const failure = new Error("recoverable runner interruption");
    boundaryMocks.getScanJob.mockResolvedValue(job);
    try {
      await expect(processScanJob(job, "worker-1", {
        reportV4CoreRunner: vi.fn(async () => { throw failure; })
      })).rejects.toBe(failure);
      expect(boundaryMocks.getScanJob).toHaveBeenCalledWith(job.id);
      expect(boundaryMocks.failScanJob).not.toHaveBeenCalled();
      expect(boundaryMocks.recordPaidJobOutcome).not.toHaveBeenCalled();
    } finally {
      vi.clearAllMocks();
    }
  });

  it("recognizes terminal V4 ownership", () => {
    const running = v4Job({ executionState: "running", stage: "synthesizing", leaseOwner: "worker-1", leaseExpiresAt: new Date("2099-01-01T00:00:00.000Z") });
    expect(isTerminalScanJob({ ...running, stage: "completed", executionState: "completed" })).toBe(true);
  });
});

function v4Job(patch: Partial<ScanJobRow> = {}): ScanJobRow {
  return {
    id: "job-1", reportId: "report-1", siteSnapshotId: "snapshot-1", tier: "deep",
    productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4", correctionId: null,
    replacementFulfillmentId: null, businessQuestionSetId: "questions-1", locale: "en", reason: "standard",
    stage: "synthesizing", executionState: "running", currentPhase: "website_synthesis", checkpointRevision: 0,
    phaseAttempt: 0, resumeGeneration: 0, retryNotBefore: null, repairReasonCode: null, repairDeadlineAt: null,
    progress: 50, checkpoint: {}, plannedPages: 1, successfulPages: 1, failedPages: 0, attempts: 1,
    maxAttempts: 3, leaseOwner: "worker-1", leaseExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
    errorCode: null, publicError: null, creditReservationId: "credit-1", createdAt: new Date(), updatedAt: new Date(),
    ...patch
  };
}

function runnerInput(job: ScanJobRow): ReportV4ProductionRunnerInput {
  return {
    job, workerId: "worker-1", signal: new AbortController().signal, remainingMs: () => 10_000,
    checkpointJob: async () => job
  };
}

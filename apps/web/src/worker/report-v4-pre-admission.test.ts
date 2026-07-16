import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ReportV4PreAdmissionRuntimeUnavailableError,
  processReportV4PreAdmissionJob
} from "./report-v4-pre-admission";

// @requirement GEO-V4-CRAWL-04
describe("V4 pre-admission processor boundary", () => {
  it("runs only the injected admission runtime and terminalizes its coverage", async () => {
    const runner = vi.fn(async () => ({ plannedPages: 3, successfulPages: 2, failedPages: 1 }));
    const terminalizeJob = vi.fn(async () => undefined);
    const job = admissionJob();
    const signal = new AbortController().signal;

    await expect(processReportV4PreAdmissionJob({
      job,
      workerId: "worker-1",
      signal,
      remainingMs: () => 10_000,
      runner,
      terminalizeJob
    })).resolves.toBe(true);

    expect(runner).toHaveBeenCalledWith({ job, signal, remainingMs: expect.any(Function) });
    expect(terminalizeJob).toHaveBeenCalledWith("admission-job", "worker-1", {
      stage: "completed",
      coverage: { plannedPages: 3, successfulPages: 2, failedPages: 1 }
    });
  });

  it("fails closed without a configured runner and never terminalizes success", async () => {
    const terminalizeJob = vi.fn();
    await expect(processReportV4PreAdmissionJob({
      job: admissionJob(),
      workerId: "worker-1",
      signal: new AbortController().signal,
      remainingMs: () => 10_000,
      terminalizeJob
    })).rejects.toBeInstanceOf(ReportV4PreAdmissionRuntimeUnavailableError);
    expect(terminalizeJob).not.toHaveBeenCalled();
  });

  it("permanently fails closed when the runner returns impossible coverage", async () => {
    const terminalizeJob = vi.fn();
    await expect(processReportV4PreAdmissionJob({
      job: admissionJob(),
      workerId: "worker-1",
      signal: new AbortController().signal,
      remainingMs: () => 10_000,
      runner: vi.fn(async () => ({ plannedPages: 1, successfulPages: 1, failedPages: 1 })),
      terminalizeJob
    })).rejects.toMatchObject({
      code: "report_v4_pre_admission_coverage_invalid",
      classification: "permanent"
    });
    expect(terminalizeJob).not.toHaveBeenCalled();
  });

  it("refuses malformed admission identities before invoking the runner", async () => {
    const runner = vi.fn();
    await expect(processReportV4PreAdmissionJob({
      job: { ...admissionJob(), tier: "free" },
      workerId: "worker-1",
      signal: new AbortController().signal,
      remainingMs: () => 10_000,
      runner,
      terminalizeJob: vi.fn()
    })).rejects.toThrow(/exact prospective V4 identity/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not claim non-admission jobs", async () => {
    const runner = vi.fn();
    const terminalizeJob = vi.fn();
    await expect(processReportV4PreAdmissionJob({
      job: { ...admissionJob(), reason: "standard" },
      workerId: "worker-1",
      signal: new AbortController().signal,
      remainingMs: () => 10_000,
      runner,
      terminalizeJob
    })).resolves.toBe(false);
    expect(runner).not.toHaveBeenCalled();
    expect(terminalizeJob).not.toHaveBeenCalled();
  });

  it("keeps the admission branch before every legacy preview/provider/PDF entry point", () => {
    const source = readFileSync(new URL("./processor.ts", import.meta.url), "utf8");
    const admissionBranch = source.indexOf("if (await processReportV4PreAdmissionJob(");
    expect(admissionBranch).toBeGreaterThan(-1);
    for (const legacyEntry of [
      "resolveRecommendationFulfillmentTarget(job)",
      "await purgeExpiredCrawlContent()",
      "await getGeoReport(job.reportId)"
    ]) {
      expect(admissionBranch).toBeLessThan(source.indexOf(legacyEntry));
    }
    expect(source).toContain('job.reason !== "v4_pre_admission"');
  });
});

function admissionJob() {
  return {
    id: "admission-job",
    reportId: "report-1",
    siteSnapshotId: null,
    tier: "deep" as const,
    productContract: "recommendation_forensics_v1" as const,
    fulfillmentMethodology: "two_stage_geo_report_v4" as const,
    recommendationReportVersion: 4 as const,
    artifactContract: "combined_geo_report_v4" as const,
    correctionId: null,
    replacementFulfillmentId: null,
    businessQuestionSetId: null,
    locale: "zh" as const,
    reason: "v4_pre_admission" as const,
    stage: "queued" as const,
    executionState: "running" as const,
    currentPhase: "admission" as const,
    checkpointRevision: 0,
    phaseAttempt: 1,
    resumeGeneration: 0,
    retryNotBefore: null,
    repairReasonCode: null,
    repairDeadlineAt: null,
    progress: 0,
    checkpoint: {},
    plannedPages: 0,
    successfulPages: 0,
    failedPages: 0,
    attempts: 1,
    maxAttempts: 3,
    leaseOwner: "worker-1",
    leaseExpiresAt: new Date("2030-01-01T00:10:00.000Z"),
    errorCode: null,
    publicError: null,
    creditReservationId: null,
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-01T00:00:00.000Z")
  };
}

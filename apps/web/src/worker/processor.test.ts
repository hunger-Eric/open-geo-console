import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanJobRow } from "@/db/schema";

const boundaryMocks = vi.hoisted(() => ({
  getScanJob: vi.fn(),
  failScanJob: vi.fn(),
  terminalizeScanJob: vi.fn(),
  recordPaidJobOutcome: vi.fn(),
  createReportV4AcceptanceObserver: vi.fn(),
  getGeoReport: vi.fn(),
  fetchPlannedPagesWithRecovery: vi.fn()
}));
const rerunGuardHarness = vi.hoisted(() => {
  const state = {
    blockedSite: null as string | null,
    guardSites: [] as string[],
    delegatedSites: [] as string[]
  };
  const blocked = new Error("blocked by Report V4 rerun test guard");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});
vi.mock("@/db/jobs", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/jobs")>(),
  getScanJob: boundaryMocks.getScanJob,
  failScanJob: boundaryMocks.failScanJob,
  terminalizeScanJob: boundaryMocks.terminalizeScanJob
}));
vi.mock("@/db/commercial-refunds", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/commercial-refunds")>(),
  recordPaidJobOutcome: boundaryMocks.recordPaidJobOutcome
}));
vi.mock("@/db/reports", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/reports")>(),
  getGeoReport: boundaryMocks.getGeoReport
}));
vi.mock("./report-v4-acceptance-observer", async (importOriginal) => ({
  ...await importOriginal<typeof import("./report-v4-acceptance-observer")>(),
  createReportV4AcceptanceObserver: boundaryMocks.createReportV4AcceptanceObserver
}));
vi.mock("./recovery", async (importOriginal) => ({
  ...await importOriginal<typeof import("./recovery")>(),
  fetchPlannedPagesWithRecovery: boundaryMocks.fetchPlannedPagesWithRecovery
}));
vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: rerunGuardHarness.run
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

beforeEach(() => {
  rerunGuardHarness.state.blockedSite = null;
  rerunGuardHarness.state.guardSites.length = 0;
  rerunGuardHarness.state.delegatedSites.length = 0;
  rerunGuardHarness.run.mockClear();
});

describe("strict Report V4 processor routing", () => {
  it("does not create an acceptance observer or change dispatch when the session env is absent", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    delete process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    const core = vi.fn(async () => undefined);
    try {
      await processScanJob(v4Job(), "worker-1", { reportV4CoreRunner: core });
      expect(boundaryMocks.createReportV4AcceptanceObserver).not.toHaveBeenCalled();
      expect(core).toHaveBeenCalledTimes(1);
      expect(rerunGuardHarness.state.guardSites).toEqual([]);
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("blocks a legacy full-report rerun before page recovery or crawl side effects", async () => {
    const job = legacyFullRerunJob();
    const previousAi = configureTestAi();
    rerunGuardHarness.state.blockedSite = "full_report_rerun";
    boundaryMocks.getGeoReport.mockResolvedValueOnce({
      id: job.reportId,
      url: "https://example.com/",
      technicalStatus: "completed"
    });
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await processScanJob(job, "worker-1");

      expect(rerunGuardHarness.state.guardSites).toEqual(["full_report_rerun"]);
      expect(rerunGuardHarness.state.delegatedSites).toEqual([]);
      expect(boundaryMocks.fetchPlannedPagesWithRecovery).not.toHaveBeenCalled();
    } finally {
      restoreTestAi(previousAi);
      vi.clearAllMocks();
    }
  });

  it("delegates a legacy full-report rerun exactly once when no guard context is active", async () => {
    const job = legacyFullRerunJob();
    const previousAi = configureTestAi();
    const rerunStopped = new Error("stop after proving the rerun side effect");
    boundaryMocks.getGeoReport.mockResolvedValueOnce({
      id: job.reportId,
      url: "https://example.com/",
      technicalStatus: "completed"
    });
    boundaryMocks.fetchPlannedPagesWithRecovery.mockRejectedValueOnce(rerunStopped);
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await processScanJob(job, "worker-1");

      expect(rerunGuardHarness.state.guardSites).toEqual(["full_report_rerun"]);
      expect(rerunGuardHarness.state.delegatedSites).toEqual(["full_report_rerun"]);
      expect(boundaryMocks.fetchPlannedPagesWithRecovery).toHaveBeenCalledTimes(1);
    } finally {
      restoreTestAi(previousAi);
      vi.clearAllMocks();
    }
  });

  it.each([
    {
      name: "legacy",
      patch: {
        productContract: "legacy_website_audit_v1",
        fulfillmentMethodology: null,
        recommendationReportVersion: null,
        artifactContract: null,
        businessQuestionSetId: null,
        siteSnapshotId: null,
        creditReservationId: null
      }
    },
    {
      name: "V2",
      patch: {
        fulfillmentMethodology: "public_search_source_forensics_v1",
        recommendationReportVersion: 2,
        artifactContract: null,
        businessQuestionSetId: null,
        siteSnapshotId: null,
        creditReservationId: null
      }
    }
  ])("keeps a $name job on its original path with zero observer access when the session env is configured", async ({ patch }) => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const job = v4Job(patch as Partial<ScanJobRow>);
    boundaryMocks.getGeoReport.mockResolvedValueOnce(null);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ stage: "failed" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await processScanJob(job, "worker-1");
      expect(boundaryMocks.createReportV4AcceptanceObserver).not.toHaveBeenCalled();
      expect(boundaryMocks.getGeoReport).toHaveBeenCalledExactlyOnceWith(job.reportId);
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("creates the exact job observer before V4 business dispatch and records one idempotent dispatch", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const order: string[] = [];
    const observe = vi.fn(async () => {
      order.push("dispatch-event");
      return { event: {}, inserted: true } as never;
    });
    boundaryMocks.createReportV4AcceptanceObserver.mockImplementationOnce(async (input: { jobId: string }) => {
      order.push(`observer:${input.jobId}`);
      return { observe } as never;
    });
    const core = vi.fn(async () => { order.push("core-runner"); });
    try {
      await processScanJob(v4Job(), "worker-1", { reportV4CoreRunner: core });
      expect(order).toEqual(["observer:job-1", "dispatch-event", "core-runner"]);
      expect(observe).toHaveBeenCalledExactlyOnceWith({
        kind: "v4_dispatch",
        operation: "v4_dispatch",
        unitId: "job-1",
        attempt: 0,
        phase: "observed",
        details: {}
      });
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("fails closed before V4 business execution when observer routing rejects the exact job", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const routingError = new Error("acceptance job lineage mismatch");
    boundaryMocks.createReportV4AcceptanceObserver.mockRejectedValueOnce(routingError);
    const core = vi.fn();
    try {
      await expect(processScanJob(v4Job(), "worker-1", { reportV4CoreRunner: core })).rejects.toBe(routingError);
      expect(boundaryMocks.createReportV4AcceptanceObserver).toHaveBeenCalledExactlyOnceWith({ jobId: "job-1" });
      expect(core).not.toHaveBeenCalled();
      expect(boundaryMocks.failScanJob).not.toHaveBeenCalled();
      expect(boundaryMocks.recordPaidJobOutcome).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("fails closed when a configured acceptance session does not produce an observer", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    boundaryMocks.createReportV4AcceptanceObserver.mockResolvedValueOnce(null);
    const core = vi.fn();
    try {
      await expect(processScanJob(v4Job(), "worker-1", { reportV4CoreRunner: core }))
        .rejects.toThrow(/configured Report V4 acceptance session.*observer/i);
      expect(core).not.toHaveBeenCalled();
      expect(boundaryMocks.failScanJob).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("records pre-admission dispatch only after its exact identity is accepted", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const order: string[] = [];
    const observe = vi.fn(async () => {
      order.push("dispatch-event");
      return { event: {}, inserted: false } as never;
    });
    boundaryMocks.createReportV4AcceptanceObserver.mockResolvedValueOnce({ observe } as never);
    boundaryMocks.terminalizeScanJob.mockImplementationOnce(async () => { order.push("terminalize"); });
    const runner = vi.fn(async () => {
      order.push("admission-runner");
      return { plannedPages: 1, successfulPages: 1, failedPages: 0 };
    });
    try {
      await processScanJob(v4Job({
        id: "admission-job",
        reason: "v4_pre_admission",
        businessQuestionSetId: null,
        siteSnapshotId: null,
        creditReservationId: null
      }), "worker-1", { reportV4PreAdmissionRunner: runner });
      expect(order).toEqual(["dispatch-event", "admission-runner", "terminalize"]);
      expect(observe).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        kind: "v4_dispatch",
        unitId: "admission-job",
        phase: "observed"
      }));
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("does not record pre-admission dispatch for a malformed V4 identity", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const observe = vi.fn();
    const runner = vi.fn();
    boundaryMocks.createReportV4AcceptanceObserver.mockResolvedValueOnce({ observe } as never);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ stage: "failed" });
    try {
      await processScanJob(v4Job({
        id: "malformed-admission-job",
        reason: "v4_pre_admission",
        businessQuestionSetId: "forbidden-question-set",
        siteSnapshotId: null,
        creditReservationId: null
      }), "worker-1", { reportV4PreAdmissionRunner: runner });
      expect(boundaryMocks.createReportV4AcceptanceObserver)
        .toHaveBeenCalledExactlyOnceWith({ jobId: "malformed-admission-job" });
      expect(runner).not.toHaveBeenCalled();
      expect(observe).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("keeps pre-admission before V4 production and legacy fulfillment dispatch", () => {
    const preAdmission = processorSource.indexOf("processReportV4PreAdmissionJob({");
    const v4 = processorSource.indexOf("reportV4ProductionTarget = resolveReportV4ProductionTarget(job)");
    const legacy = processorSource.indexOf("const fulfillmentTarget = resolveRecommendationFulfillmentTarget(job)");
    expect(preAdmission).toBeGreaterThan(-1);
    expect(v4).toBeGreaterThan(preAdmission);
    expect(legacy).toBeGreaterThan(v4);
  });

  it("threads the process-scoped protected-Staging drill only into the selected V4 production runner", () => {
    expect(processorSource).toContain("options.liveDrill");
    expect(processorSource).toContain("createReportV4CoreProduction({ environment, liveDrill })");
    expect(processorSource).toContain("createReportV4EnhancementProduction({ environment, liveDrill })");
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

function legacyFullRerunJob(): ScanJobRow {
  const url = "https://example.com/";
  const planned = { url, pageType: "homepage", priority: 100, reason: "checkpoint" };
  return v4Job({
    productContract: "legacy_website_audit_v1",
    fulfillmentMethodology: null,
    recommendationReportVersion: null,
    artifactContract: null,
    businessQuestionSetId: null,
    siteSnapshotId: null,
    creditReservationId: null,
    checkpoint: {
      discoverySnapshot: {
        targetUrl: url,
        candidates: [planned],
        robotsPolicy: { allowed: true },
        estimatedPages: 1
      },
      targetPageCount: 1,
      rankedCandidates: [planned],
      rankedCandidateUrls: [url],
      effectivePlan: [planned],
      effectivePlannedUrls: [url],
      planningCompleted: true,
      completedCrawlUrls: [url],
      completedPageAnalyses: [{
        url,
        contentHash: "checkpoint-hash",
        analysis: { url, pageType: "homepage" }
      }]
    }
  } as Partial<ScanJobRow>);
}

function configureTestAi(): Record<string, string | undefined> {
  const previous = {
    OGC_AI_BASE_URL: process.env.OGC_AI_BASE_URL,
    OGC_AI_API_KEY: process.env.OGC_AI_API_KEY,
    OGC_AI_MODEL: process.env.OGC_AI_MODEL
  };
  process.env.OGC_AI_BASE_URL = "https://model.example/v1";
  process.env.OGC_AI_API_KEY = "test-api-key";
  process.env.OGC_AI_MODEL = "test-model";
  return previous;
}

function restoreTestAi(previous: Record<string, string | undefined>): void {
  for (const [name, value] of Object.entries(previous)) restoreEnvironment(name, value);
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

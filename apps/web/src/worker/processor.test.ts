import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanJobRow } from "@/db/schema";

const boundaryMocks = vi.hoisted(() => ({
  getScanJob: vi.fn(), failScanJob: vi.fn(), terminalizeScanJob: vi.fn(),
  checkpointScanJob: vi.fn(), heartbeatScanJob: vi.fn(), recordPaidJobOutcome: vi.fn(),
  createReportV4AcceptanceObserver: vi.fn(), getGeoReport: vi.fn(),
  fetchPlannedPagesWithRecovery: vi.fn(), calculateEffectiveCoverage: vi.fn(),
  analyzePageBatch: vi.fn(), synthesizeWebsiteReportWithRecovery: vi.fn(),
  saveAiReport: vi.fn(), purgeExpiredCrawlContent: vi.fn(), auditSite: vi.fn(), captureVisualEvidence: vi.fn(),
  hasPriorJobErrorFingerprint: vi.fn(async () => false)
}));
const evidenceGateMocks = vi.hoisted(() => ({
  generateFreeTeaser: vi.fn(async () => ({})),
  getAiReport: vi.fn(),
  loadReportV4PreAdmissionSnapshot: vi.fn(async () => ({ snapshot: { id: "admission-1" } })),
  createProductionReportV4AdmissionRunner: vi.fn(() => async () => ({ plannedPages: 1, successfulPages: 1, failedPages: 0 }))
}));
const rerunGuardHarness = vi.hoisted(() => {
  const state = { blockedSite: null as string | null, guardSites: [] as string[], delegatedSites: [] as string[] };
  const blocked = new Error("blocked by Report V4 rerun test guard");
  return {
    state, blocked,
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
  getScanJob: boundaryMocks.getScanJob, failScanJob: boundaryMocks.failScanJob,
  terminalizeScanJob: boundaryMocks.terminalizeScanJob,
  checkpointScanJob: boundaryMocks.checkpointScanJob, heartbeatScanJob: boundaryMocks.heartbeatScanJob
}));
vi.mock("./job-errors", async (importOriginal) => ({
  ...await importOriginal<typeof import("./job-errors")>(),
  hasPriorJobErrorFingerprint: boundaryMocks.hasPriorJobErrorFingerprint
}));
vi.mock("@/db/commercial-refunds", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/commercial-refunds")>(),
  recordPaidJobOutcome: boundaryMocks.recordPaidJobOutcome
}));
vi.mock("@/db/reports", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/reports")>(), getGeoReport: boundaryMocks.getGeoReport
}));
vi.mock("@/db/ai-reports", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/ai-reports")>(),
  getAiReport: evidenceGateMocks.getAiReport, saveAiReport: boundaryMocks.saveAiReport
}));
vi.mock("./report-v4-free-teaser", async (importOriginal) => ({
  ...await importOriginal<typeof import("./report-v4-free-teaser")>(), generateFreeTeaser: evidenceGateMocks.generateFreeTeaser
}));
vi.mock("@/db/report-v4-site-snapshots", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/report-v4-site-snapshots")>(), loadReportV4PreAdmissionSnapshot: evidenceGateMocks.loadReportV4PreAdmissionSnapshot
}));
vi.mock("./report-v4-admission-production", async (importOriginal) => ({
  ...await importOriginal<typeof import("./report-v4-admission-production")>(), createProductionReportV4AdmissionRunner: evidenceGateMocks.createProductionReportV4AdmissionRunner
}));
vi.mock("@/db/crawl-evidence", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/crawl-evidence")>(),
  purgeExpiredCrawlContent: boundaryMocks.purgeExpiredCrawlContent
}));
vi.mock("@open-geo-console/geo-auditor", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-geo-console/geo-auditor")>(), auditSite: boundaryMocks.auditSite
}));
vi.mock("./visual-evidence", async (importOriginal) => ({
  ...await importOriginal<typeof import("./visual-evidence")>(), captureReportVisualEvidence: boundaryMocks.captureVisualEvidence
}));
vi.mock("./report-v4-acceptance-observer", async (importOriginal) => ({
  ...await importOriginal<typeof import("./report-v4-acceptance-observer")>(),
  createReportV4AcceptanceObserver: boundaryMocks.createReportV4AcceptanceObserver
}));
vi.mock("./recovery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recovery")>();
  return {
    ...actual,
    fetchPlannedPagesWithRecovery: boundaryMocks.fetchPlannedPagesWithRecovery,
    calculateEffectiveCoverage: (...args: Parameters<typeof actual.calculateEffectiveCoverage>) => {
      boundaryMocks.calculateEffectiveCoverage(...args);
      return actual.calculateEffectiveCoverage(...args);
    }
  };
});
vi.mock("@open-geo-console/ai-report-engine", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-geo-console/ai-report-engine")>(),
  analyzePageBatch: boundaryMocks.analyzePageBatch,
  synthesizeWebsiteReportWithRecovery: boundaryMocks.synthesizeWebsiteReportWithRecovery
}));
const diagnosisEnhancerMock = vi.hoisted(() => ({ enhance: vi.fn() }));
vi.mock("./report-v4-diagnosis-enhancer", async (importOriginal) => ({
  ...await importOriginal<typeof import("./report-v4-diagnosis-enhancer")>(),
  enhanceReportV4QuestionDiagnosis: (...args: unknown[]) => diagnosisEnhancerMock.enhance(...args)
}));
vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: rerunGuardHarness.run
}));
import {
  deferredPageAnalysisAuthority,
  dispatchReportV4ProductionJob,
  composeReportV4AcceptanceProductionRunner,
  createPaidV3DiagnosisIncompleteError,
  enhanceV3AnswerCardsWithDiagnosis,
  hashSynthesisInput,
  isTerminalScanJob,
  mergeCompletedAnalyses,
  paidV3SemanticSourceCatalogEligibility,
  PaidV3DiagnosisIncompleteError,
  processScanJob,
  resolveRecommendationFulfillmentTarget,
  resolveReportV4ProductionTarget,
  resolveRequiredDeferredPageAnalysisAuthority,
  resolveWebsiteAnalysisSemanticValidation,
  type ReportV4AcceptanceProductionRunnerTestOnlyDependencies,
  type ReportV4ProductionRunnerInput
} from "./processor";
import {
  selectReusableCompletedPageAnalyses,
  type CompletedPageAnalysis
} from "./recovery";
import { PublicSourceSnapshotUnavailableError } from "./public-source-snapshot-resolver";
import { PAID_V3_DIRECT_DEBUG_TRACE_PREFIX } from "./paid-v3-direct-debug-trace";

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
  boundaryMocks.hasPriorJobErrorFingerprint.mockReset().mockResolvedValue(false);
});

describe("strict Report V4 processor routing", () => {
  it("returns the unchanged base runner outside acceptance and invokes it exactly once", async () => {
    const base = vi.fn(async () => undefined);
    const dependencies = acceptanceRunnerDependencies();
    const runner = composeReportV4AcceptanceProductionRunner("core", base, { NODE_ENV: "test" }, dependencies);
    expect(runner).toBe(base);
    await runner(runnerInput(v4Job()));
    expect(base).toHaveBeenCalledTimes(1);
    expect(dependencies.createObserver).not.toHaveBeenCalled();
    expect(dependencies.runAcceptanceStage).not.toHaveBeenCalled();
  });

  it("rejects test dependency injection when only the untrusted environment argument claims test", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => composeReportV4AcceptanceProductionRunner(
        "core",
        vi.fn(async () => undefined),
        acceptanceEnvironment(),
        acceptanceRunnerDependencies()
      )).toThrow(/test-only/iu);
    } finally {
      restoreEnvironment("NODE_ENV", previousNodeEnv);
    }
  });

  it("wraps Core acceptance with exact terminal inspection while leaving baseline capture to the inner runner", async () => {
    const order: string[] = [];
    const base = vi.fn(async () => { order.push("base-core"); });
    const dependencies = acceptanceRunnerDependencies({ order, run: true });
    const job = v4Job();
    const runner = composeReportV4AcceptanceProductionRunner("core", base, acceptanceEnvironment(), dependencies);

    await runner(runnerInput(job));

    expect(order).toEqual(["inspect", "base-core"]);
    expect(dependencies.inspectTerminal).toHaveBeenCalledExactlyOnceWith({
      sql: expect.anything(), sessionId: ACCEPTANCE_SESSION_ID, scenarioId: ACCEPTANCE_SCENARIO_ID,
      coreJobId: job.id, currentJobId: job.id, target: "core"
    });
    const stageInput = vi.mocked(dependencies.runAcceptanceStage).mock.calls[0]![0];
    expect(stageInput.workerGitSha).toBe("a".repeat(40));
    expect(stageInput.isTerminalResult(undefined)).toBe(false);
  });

  it("uses the observer Core job identity when wrapping an enhancement job", async () => {
    const enhancement = v4Job({ id: "enhancement-job", reason: "v4_diagnosis_enhancement", siteSnapshotId: null, creditReservationId: null });
    const base = vi.fn(async () => undefined);
    const dependencies = acceptanceRunnerDependencies({ run: true, coreJobId: "core-job" });
    const runner = composeReportV4AcceptanceProductionRunner("enhancement", base, acceptanceEnvironment(), dependencies);

    await runner(runnerInput(enhancement));

    expect(dependencies.inspectTerminal).toHaveBeenCalledWith(expect.objectContaining({
      coreJobId: "core-job", currentJobId: "enhancement-job", target: "enhancement"
    }));
    expect(base).toHaveBeenCalledTimes(1);
  });

  it.each(["existing final", "completed guard"])("does not invoke the base runner for %s", async () => {
    const base = vi.fn(async () => undefined);
    const dependencies = acceptanceRunnerDependencies({ run: false });
    const runner = composeReportV4AcceptanceProductionRunner("core", base, acceptanceEnvironment(), dependencies);
    await runner(runnerInput(v4Job()));
    expect(base).not.toHaveBeenCalled();
  });

  it("propagates the wrapped production runner error", async () => {
    const failure = new Error("core runner failed");
    const base = vi.fn(async () => { throw failure; });
    const dependencies = acceptanceRunnerDependencies({ run: true });
    const runner = composeReportV4AcceptanceProductionRunner("core", base, acceptanceEnvironment(), dependencies);
    await expect(runner(runnerInput(v4Job()))).rejects.toBe(failure);
  });

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

  it("escalates a recurrent transient fingerprint to permanent instead of consuming further attempts", async () => {
    const job = legacyFullRerunJob();
    const previousAi = configureTestAi();
    const recurrent = new Error("stop after proving the rerun side effect");
    boundaryMocks.getGeoReport.mockResolvedValueOnce({
      id: job.reportId,
      url: "https://example.com/",
      technicalStatus: "completed"
    });
    boundaryMocks.fetchPlannedPagesWithRecovery.mockRejectedValueOnce(recurrent);
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.hasPriorJobErrorFingerprint.mockResolvedValueOnce(true);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await processScanJob(job, "worker-1");

      expect(boundaryMocks.hasPriorJobErrorFingerprint).toHaveBeenCalledTimes(1);
      expect(boundaryMocks.failScanJob).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({
        retryable: false,
        internalError: expect.objectContaining({ classification: "permanent", retryableAt: null })
      }));
    } finally {
      restoreTestAi(previousAi);
      vi.clearAllMocks();
    }
  });

  it("defers a public-source provider outage without consuming the phase attempt budget", async () => {
    const job = legacyFullRerunJob();
    const previousAi = configureTestAi();
    const outage = new PublicSourceSnapshotUnavailableError("search_execution");
    boundaryMocks.getGeoReport.mockResolvedValueOnce({
      id: job.reportId,
      url: "https://example.com/",
      technicalStatus: "completed"
    });
    boundaryMocks.fetchPlannedPagesWithRecovery.mockRejectedValueOnce(outage);
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, executionState: "retry_wait" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await processScanJob(job, "worker-1");

      // The outage defers instead of entering fingerprint escalation, and the
      // retry does not burn the attempt this claim consumed.
      expect(boundaryMocks.hasPriorJobErrorFingerprint).not.toHaveBeenCalled();
      expect(boundaryMocks.failScanJob).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({
        retryable: true,
        defer: true,
        internalError: expect.objectContaining({ classification: "transient", code: "public_source_snapshot_search_execution" })
      }));
    } finally {
      restoreTestAi(previousAi);
      vi.clearAllMocks();
    }
  });

  it("does not defer a transient V4 pre-admission failure into another direct-model run", async () => {
    const job = v4Job({
      reason: "v4_pre_admission",
      businessQuestionSetId: null,
      siteSnapshotId: null,
      creditReservationId: null,
      checkpoint: { freeDirectSemanticsVersion: "free-v4-direct-semantics-v1" },
      maxAttempts: 1
    });
    const outage = new PublicSourceSnapshotUnavailableError("search_execution");
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, stage: "failed", executionState: "failed" });
    try {
      await processScanJob(job, "worker-1", {
        reportV4PreAdmissionRunner: vi.fn(async () => { throw outage; })
      });

      expect(boundaryMocks.failScanJob).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({
        retryable: false,
        internalError: expect.objectContaining({ classification: "transient", code: "public_source_snapshot_search_execution" })
      }));
      expect(boundaryMocks.failScanJob.mock.calls[0]?.[2]).not.toHaveProperty("defer");
    } finally {
      vi.clearAllMocks();
    }
  });

  it("still fails fast on a recurrent deterministic public-source failure instead of deferring", async () => {
    const job = legacyFullRerunJob();
    const previousAi = configureTestAi();
    const deterministic = new PublicSourceSnapshotUnavailableError("observation_persistence");
    boundaryMocks.getGeoReport.mockResolvedValueOnce({
      id: job.reportId,
      url: "https://example.com/",
      technicalStatus: "completed"
    });
    boundaryMocks.fetchPlannedPagesWithRecovery.mockRejectedValueOnce(deterministic);
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.hasPriorJobErrorFingerprint.mockResolvedValueOnce(true);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await processScanJob(job, "worker-1");

      expect(boundaryMocks.hasPriorJobErrorFingerprint).toHaveBeenCalledTimes(1);
      expect(boundaryMocks.failScanJob).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({
        retryable: false,
        internalError: expect.objectContaining({ classification: "permanent", code: "public_source_snapshot_observation_persistence" })
      }));
      expect(boundaryMocks.failScanJob.mock.calls[0]?.[2]).not.toHaveProperty("defer");
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

  it("threads the env-gated semantic-review evidence sink into the Free teaser call site", async () => {
    const previousEvidencePath = process.env.OGC_SEMANTIC_REVIEW_EVIDENCE_PATH;
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    delete process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    delete process.env.OGC_SEMANTIC_REVIEW_EVIDENCE_PATH;
    const evidencePath = join(mkdtempSync(join(tmpdir(), "ogc-processor-evidence-")), "evidence.jsonl");
    const job = v4Job({
      id: "evidence-job", reportId: "evidence-report", reason: "v4_pre_admission",
      siteSnapshotId: null, creditReservationId: null, businessQuestionSetId: null, checkpoint: {}
    });
    boundaryMocks.getGeoReport.mockResolvedValue({ url: "https://target.example/" } as never);
    evidenceGateMocks.getAiReport.mockResolvedValue({ payload: {} } as never);
    boundaryMocks.getScanJob.mockResolvedValue(job);
    try {
      await processScanJob(job, "worker-1");
      expect(evidenceGateMocks.generateFreeTeaser).toHaveBeenCalledTimes(1);
      expect(evidenceGateMocks.generateFreeTeaser.mock.calls[0]![0].onSemanticReviewBatchEvidence).toBeUndefined();

      process.env.OGC_SEMANTIC_REVIEW_EVIDENCE_PATH = evidencePath;
      evidenceGateMocks.generateFreeTeaser.mockClear();
      await processScanJob(job, "worker-1");
      const sink = evidenceGateMocks.generateFreeTeaser.mock.calls[0]![0].onSemanticReviewBatchEvidence as
        (evidence: unknown) => void;
      expect(sink).toBeTypeOf("function");
      sink({
        batchId: "B_obs", inputIdentities: ["o1/r1"], requestSha256: "b".repeat(64),
        requestBytes: 10, responseRowCount: 1, responseIdentities: ["o1/r1"], durationMs: 1, errorClass: null
      });
      const line = JSON.parse(readFileSync(evidencePath, "utf8").trim()) as Record<string, unknown>;
      expect(line).toMatchObject({ jobId: "evidence-job", reportId: "evidence-report", batchId: "B_obs" });
      expect(typeof line.recordedAt).toBe("string");
    } finally {
      restoreEnvironment("OGC_SEMANTIC_REVIEW_EVIDENCE_PATH", previousEvidencePath);
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      rmSync(evidencePath, { force: true });
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

  it("reads the exact root semantic-review marker once and threads it into Free V4 without deriving activation from nested state", () => {
    const currentJobRead = processorSource.indexOf("const currentJob = await getScanJob(runInput.job.id)");
    const markerRead = processorSource.indexOf("const semanticReviewContractVersion = readSemanticReviewContractVersion(currentCheckpoint)");
    const freeTeaserCall = processorSource.indexOf("await generateFreeTeaser({", markerRead);
    expect(currentJobRead).toBeGreaterThan(-1);
    expect(markerRead).toBeGreaterThan(currentJobRead);
    expect(freeTeaserCall).toBeGreaterThan(markerRead);
    expect(processorSource.slice(freeTeaserCall, freeTeaserCall + 700)).toContain("semanticReviewContractVersion,");
    expect(processorSource.match(/readSemanticReviewContractVersion\(currentCheckpoint\)/gu)).toHaveLength(1);
  });

  it("keeps the complete Paid report inputs while Direct bypasses the legacy diagnosis and semantic-review boundary", () => {
    const directStart = processorSource.indexOf('if (semanticValidation === "free_direct")');
    const legacyStart = processorSource.indexOf('if (!("answerCards" in answerResult))', directStart);
    expect(directStart).toBeGreaterThan(-1);
    expect(legacyStart).toBeGreaterThan(directStart);

    const directBranch = processorSource.slice(directStart, legacyStart);
    for (const retainedInput of [
      "technicalReport: input.technicalReport",
      "aiReport: input.websiteFoundation",
      "evidenceAssets,",
      "businessQuestionSet,",
      "answerCards: answerResult.answerCards",
      "sourceSelectionDiagnosis,",
      "publicSourceForensics: forensicResult.report",
      "providerDiscovery: providerResult.providerDiscovery"
    ]) {
      expect(directBranch).toContain(retainedInput);
    }
    expect(directBranch).toContain("buildPaidV3DirectSemantics({");
    expect(directBranch).not.toContain("enhanceV3AnswerCardsWithDiagnosis({");
    expect(directBranch).not.toContain("runPaidV3SemanticReview({");
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

  it("keeps retired reasons on non-V2 and legacy resolver paths", () => {
    expect(resolveRecommendationFulfillmentTarget({ productContract: "legacy_website_audit_v1", fulfillmentMethodology: null, recommendationReportVersion: null, reason: "paid_report_correction" })).toBe("legacy");
    expect(resolveRecommendationFulfillmentTarget({ productContract: "recommendation_forensics_v1", fulfillmentMethodology: "answer_engine_recommendation_forensics_v1", recommendationReportVersion: 1, reason: "replacement_fulfillment" })).toBe("recommendation_v1");
  });

  it.each(["replacement_fulfillment", "paid_report_correction", "staging_artifact_refresh"] as const)("fails closed before execution for retired %s V2 fulfillment", async (reason) => {
    const job = v4Job({ fulfillmentMethodology: "public_search_source_forensics_v1", recommendationReportVersion: 2, artifactContract: null, businessQuestionSetId: null, siteSnapshotId: null, creditReservationId: null, reason });
    const runner = vi.fn(async () => undefined);
    boundaryMocks.getScanJob.mockResolvedValueOnce(job);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.recordPaidJobOutcome.mockResolvedValueOnce(undefined);
    try {
      await expect(processScanJob(job, "worker-1", { reportV4CoreRunner: runner })).resolves.toBeUndefined();
      expect(boundaryMocks.getGeoReport).not.toHaveBeenCalled();
      expect(boundaryMocks.fetchPlannedPagesWithRecovery).not.toHaveBeenCalled();
      expect(boundaryMocks.analyzePageBatch).not.toHaveBeenCalled();
      expect(boundaryMocks.synthesizeWebsiteReportWithRecovery).not.toHaveBeenCalled();
      expect(boundaryMocks.saveAiReport).not.toHaveBeenCalled();
      expect(runner).not.toHaveBeenCalled();
    } finally { vi.clearAllMocks(); }
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

  it("persists a non-terminal V4 runner error through the job state machine without legacy commerce writes", async () => {
    const job = v4Job();
    const failure = new Error("OGC_TOKEN_HASH_SECRET key is missing");
    boundaryMocks.getScanJob.mockResolvedValue(job);
    boundaryMocks.failScanJob.mockResolvedValueOnce({ ...job, executionState: "repair_wait" });
    try {
      await expect(processScanJob(job, "worker-1", {
        reportV4CoreRunner: vi.fn(async () => { throw failure; })
      })).resolves.toBeUndefined();
      expect(boundaryMocks.getScanJob).toHaveBeenCalledWith(job.id);
      expect(boundaryMocks.failScanJob).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({
        code: "unexpected_internal_error",
        classification: "operator_repairable",
        retryable: false,
        phase: job.currentPhase,
        internalError: expect.objectContaining({
          classification: "operator_repairable",
          message: failure.message
        })
      }));
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

const ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ACCEPTANCE_SCENARIO_ID = "21111111-1111-4111-8111-111111111111";

function acceptanceEnvironment(): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", OGC_REPORT_V4_ACCEPTANCE_SESSION_ID: ACCEPTANCE_SESSION_ID };
}

function acceptanceRunnerDependencies(options: {
  readonly order?: string[];
  readonly run?: boolean;
  readonly coreJobId?: string;
} = {}): ReportV4AcceptanceProductionRunnerTestOnlyDependencies {
  const sql = { begin: vi.fn() } as never;
  const observer = {
    session: {
      sessionId: ACCEPTANCE_SESSION_ID,
      environment: "protected_staging",
      state: "collecting",
      workerGitSha: "a".repeat(40),
      terminalAt: null
    },
    scenario: {
      sessionId: ACCEPTANCE_SESSION_ID,
      scenarioId: ACCEPTANCE_SCENARIO_ID,
      state: "collecting",
      coreJobId: options.coreJobId ?? "job-1",
      terminalAt: null
    }
  } as never;
  const inspectTerminal = vi.fn(async () => {
    options.order?.push("inspect");
    return false;
  });
  return {
    createObserver: vi.fn(async () => observer),
    ensureDatabase: vi.fn(async () => undefined),
    getSql: vi.fn(() => sql),
    inspectTerminal,
    runAcceptanceStage: vi.fn(async (stageInput) => {
      if (options.run) {
        await stageInput.inspectDurableTerminal();
        await stageInput.runStage();
      }
      return { result: null, final: null, guardState: "completed" as const };
    }) as never
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

describe("marker-present page analysis authority and resume identity", () => {
  const url = "https://example.com/";
  const other = "https://example.com/about";
  const marker = "report-semantic-review-v1";
  const analysis = { url, pageType: "home" as const, summary: "same summary text", organizationSignals: [] as string[], strengths: [] as string[], findings: [] as never[] };
  const pageEvidence = { page: { url, pageType: "home" as const, title: "Home", text: "body" }, httpStatus: 200, contentHash: "content-home" };
  const otherEvidence = { page: { ...pageEvidence.page, url: other, pageType: "about" as const, title: "About" }, httpStatus: 200, contentHash: "content-about" };
  const coverage = { discoveredPages: 2, plannedPages: 2, analyzedPages: 1, failedPages: 0 };
  const free = { tier: "free", artifactContract: null, recommendationReportVersion: null, reason: "staging_regeneration" } as never;
  const evidence = (u: string, hash: string) => new Map([[u, { contentHash: hash }]]);
  const deferred = (version = marker) => ({ mode: "deferred" as const, semanticContractVersion: version });

  it("marker-absent: does not stamp identity; missing authority reuses on URL+hash only", () => {
    expect(resolveWebsiteAnalysisSemanticValidation(free, {})).toBe("legacy");
    expect(resolveRequiredDeferredPageAnalysisAuthority("legacy", {})).toBeNull();
    const merged = mergeCompletedAnalyses([], [analysis], new Map([[url, pageEvidence]]));
    expect(merged[0]!.analysisAuthority).toBeUndefined();
    const stored: CompletedPageAnalysis = { url, contentHash: "content-home", analysis };
    expect(selectReusableCompletedPageAnalyses([stored], {
      evidenceByUrl: evidence(url, "content-home"), canonicalUrl: (value) => value, requiredDeferredAuthority: null
    })).toEqual([stored]);
    expect(hashSynthesisInput([pageEvidence], [analysis], coverage))
      .toBe(hashSynthesisInput([pageEvidence], [analysis], coverage, { requiredDeferredAuthority: null }));
  });

  it("fresh marker-present: stamps deferred + current root contract version", () => {
    const checkpoint = { semanticReviewContractVersion: marker } as never;
    expect(resolveWebsiteAnalysisSemanticValidation(free, checkpoint)).toBe("deferred");
    expect(resolveRequiredDeferredPageAnalysisAuthority("deferred", checkpoint)).toEqual(deferred());
    expect(mergeCompletedAnalyses([], [analysis], new Map([[url, pageEvidence]]), deferredPageAnalysisAuthority(marker))[0]!.analysisAuthority)
      .toEqual(deferred());
  });

  it("keeps a Paid Direct root marker in Direct mode for page analysis and synthesis", () => {
    const direct = {
      tier: "deep",
      artifactContract: "combined_geo_report_v3",
      recommendationReportVersion: 3,
      reason: "standard"
    } as never;
    const checkpoint = { freeDirectSemanticsVersion: "free-v4-direct-semantics-v1" } as never;
    expect(resolveWebsiteAnalysisSemanticValidation(direct, checkpoint)).toBe("free_direct");
    expect(resolveRequiredDeferredPageAnalysisAuthority("free_direct", checkpoint)).toBeNull();
  });

  it("separates the coarse 85 percent bracket into synthesis, visual, and persistence trace spans", async () => {
    const planned = { url, pageType: "home" as const, priority: 100, reason: "checkpoint" };
    const job = v4Job({
      fulfillmentMethodology: "public_search_source_forensics_v1",
      recommendationReportVersion: 3,
      artifactContract: "combined_geo_report_v3",
      siteSnapshotId: null,
      currentPhase: "page_analysis",
      stage: "analyzing",
      maxAttempts: 1,
      checkpoint: {
        freeDirectSemanticsVersion: "free-v4-direct-semantics-v1",
        discoverySnapshot: { targetUrl: url, candidates: [planned], robotsPolicy: { allowed: true }, estimatedPages: 1 },
        targetPageCount: 1, rankedCandidates: [planned], rankedCandidateUrls: [url],
        effectivePlan: [planned], effectivePlannedUrls: [url], planningCompleted: true,
        completedCrawlUrls: [url], completedPageAnalyses: []
      }
    } as Partial<ScanJobRow>);
    const crawlPage = { page: { url, pageType: "home" as const, title: "Home", text: "body" }, httpStatus: 200, contentHash: "content-home" };
    const persistError = new Error("sentinel persistence failure");
    const previousAi = configureTestAi();
    const previousTrace = process.env.OGC_PAID_V3_DEBUG_TRACE;
    process.env.OGC_PAID_V3_DEBUG_TRACE = "1";
    const traceLines: string[] = [];
    const consoleInfo = vi.spyOn(console, "info").mockImplementation((line) => { traceLines.push(String(line)); });
    boundaryMocks.getGeoReport.mockReset().mockResolvedValue({ id: job.reportId, url, technicalStatus: "completed", siteKey: "example.com" });
    boundaryMocks.getScanJob.mockReset().mockResolvedValue(job);
    boundaryMocks.failScanJob.mockReset().mockResolvedValue({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.heartbeatScanJob.mockReset().mockResolvedValue(true);
    boundaryMocks.fetchPlannedPagesWithRecovery.mockReset().mockResolvedValue({
      pages: [crawlPage], checkpoint: { ...job.checkpoint, completedCrawlUrls: [url] }, exhaustedTransientUrls: []
    });
    boundaryMocks.auditSite.mockReset().mockResolvedValue({ url, pages: [] });
    boundaryMocks.analyzePageBatch.mockReset().mockResolvedValue({ analyses: [analysis], modelId: "fixture" });
    boundaryMocks.synthesizeWebsiteReportWithRecovery.mockReset().mockResolvedValue({
      report: { tier: "deep", targetUrl: url, findings: [], organizationProfile: {}, provenance: {} },
      rejectedFindingIds: [], rejectedEvidence: []
    });
    boundaryMocks.captureVisualEvidence.mockReset().mockResolvedValue(undefined);
    boundaryMocks.saveAiReport.mockReset().mockRejectedValue(persistError);
    let revision = 0;
    boundaryMocks.checkpointScanJob.mockReset().mockImplementation(async (_id, _workerId, input) => ({
      ...job, stage: input.stage, progress: input.progress, checkpoint: input.checkpoint ?? job.checkpoint,
      checkpointRevision: ++revision, currentPhase: input.phase ?? "website_synthesis", phaseAttempt: 0,
      resumeGeneration: job.resumeGeneration, plannedPages: input.plannedPages ?? 1,
      successfulPages: input.successfulPages ?? 1, failedPages: input.failedPages ?? 0
    }));
    try {
      await expect(processScanJob(job, "worker-1")).resolves.toBeUndefined();
      const events = traceLines.filter((line) => line.startsWith(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX))
        .map((line) => JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as { kind: string; step: string });
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "step_succeeded", step: "website_synthesis" }),
        expect.objectContaining({ kind: "step_succeeded", step: "visual_evidence" }),
        expect.objectContaining({ kind: "step_failed", step: "ai_report_persist" })
      ]));
      expect(boundaryMocks.failScanJob).toHaveBeenCalledTimes(1);
      expect(traceLines.join("\n")).not.toContain(persistError.message);
    } finally {
      consoleInfo.mockRestore();
      restoreTestAi(previousAi);
      restoreEnvironment("OGC_PAID_V3_DEBUG_TRACE", previousTrace);
      vi.clearAllMocks();
    }
  });

  it("marker-present partial legacy checkpoint: incompatible entries are not reusable", () => {
    const required = deferred();
    const legacy: CompletedPageAnalysis = { url, contentHash: "content-home", analysis, analysisAuthority: { mode: "legacy", semanticContractVersion: null } };
    const missing: CompletedPageAnalysis = { url: other, contentHash: "content-about", analysis: { ...analysis, url: other, pageType: "about" } };
    expect(selectReusableCompletedPageAnalyses([legacy, missing], {
      evidenceByUrl: new Map([[url, { contentHash: "content-home" }], [other, { contentHash: "content-about" }]]),
      canonicalUrl: (value) => value, requiredDeferredAuthority: required
    })).toEqual([]);
  });

  it("mixed checkpoint: reuses only fully matching deferred identity", () => {
    const required = deferred();
    const match: CompletedPageAnalysis = { url, contentHash: "content-home", analysis, analysisAuthority: deferred() };
    const mismatch: CompletedPageAnalysis = {
      url: other, contentHash: "content-about", analysis: { ...analysis, url: other, pageType: "about" },
      analysisAuthority: deferred("report-semantic-review-v0")
    };
    const reusable = selectReusableCompletedPageAnalyses([match, mismatch], {
      evidenceByUrl: new Map([[url, { contentHash: "content-home" }], [other, { contentHash: "content-about" }]]),
      canonicalUrl: (value) => value, requiredDeferredAuthority: required
    });
    expect(reusable).toEqual([match]);
    const rewritten = mergeCompletedAnalyses(
      reusable, [{ ...analysis, url: other, pageType: "about" }],
      new Map([[url, pageEvidence], [other, otherEvidence]]), deferredPageAnalysisAuthority(marker)
    );
    expect(rewritten).toHaveLength(2);
    expect(rewritten.every((entry) => entry.analysisAuthority?.mode === "deferred" && entry.analysisAuthority.semanticContractVersion === marker)).toBe(true);
  });

  it("contract version mismatch with same deferred mode is not reused", () => {
    const entry: CompletedPageAnalysis = { url, contentHash: "content-home", analysis, analysisAuthority: deferred("report-semantic-review-v0") };
    expect(selectReusableCompletedPageAnalyses([entry], {
      evidenceByUrl: evidence(url, "content-home"), canonicalUrl: (value) => value, requiredDeferredAuthority: deferred()
    })).toEqual([]);
  });

  it("idempotent resume: full identity match reuses without rewrite", () => {
    const entry: CompletedPageAnalysis = { url, contentHash: "content-home", analysis, analysisAuthority: deferred() };
    expect(selectReusableCompletedPageAnalyses([entry], {
      evidenceByUrl: evidence(url, "content-home"), canonicalUrl: (value) => value, requiredDeferredAuthority: deferred()
    })).toEqual([entry]);
  });

  it("synthesis hash binds analysis authority; same text different authority must diverge", () => {
    const entries: CompletedPageAnalysis[] = [{ url, contentHash: "content-home", analysis, analysisAuthority: deferred() }];
    const legacyHash = hashSynthesisInput([pageEvidence], [analysis], coverage);
    const deferredHash = hashSynthesisInput([pageEvidence], [analysis], coverage, { requiredDeferredAuthority: deferred(), completedEntries: entries });
    const otherVersionHash = hashSynthesisInput([pageEvidence], [analysis], coverage, {
      requiredDeferredAuthority: deferred("report-semantic-review-v0"),
      completedEntries: [{ ...entries[0]!, analysisAuthority: deferred("report-semantic-review-v0") }]
    });
    expect(deferredHash).not.toBe(legacyHash);
    expect(otherVersionHash).not.toBe(deferredHash);
    expect(hashSynthesisInput([pageEvidence], [analysis], coverage, { requiredDeferredAuthority: deferred(), completedEntries: entries })).toBe(deferredHash);
  });

  it("marker-present incompatible analysis reanalysis failure fail-closes without coverage, synthesis, or AI report", async () => {
    const planned = { url, pageType: "home" as const, priority: 100, reason: "checkpoint" };
    const job = v4Job({
      tier: "free", productContract: "legacy_website_audit_v1", fulfillmentMethodology: null,
      recommendationReportVersion: null, artifactContract: null, businessQuestionSetId: null,
      siteSnapshotId: null, creditReservationId: null, reason: "staging_regeneration",
      stage: "analyzing", currentPhase: "page_analysis", checkpointRevision: 0,
      checkpoint: {
        semanticReviewContractVersion: marker,
        discoverySnapshot: { targetUrl: url, candidates: [planned], robotsPolicy: { allowed: true }, estimatedPages: 1 },
        targetPageCount: 1, rankedCandidates: [planned], rankedCandidateUrls: [url],
        effectivePlan: [planned], effectivePlannedUrls: [url], planningCompleted: true,
        completedCrawlUrls: [url],
        completedPageAnalyses: [
          { url, contentHash: "content-home", analysis }, // missing identity
          { url, contentHash: "content-home", analysis, analysisAuthority: { mode: "legacy", semanticContractVersion: null } },
          { url, contentHash: "content-home", analysis, analysisAuthority: { mode: "deferred", semanticContractVersion: "report-semantic-review-v0" } }
        ]
      }
    } as Partial<ScanJobRow>);
    const previousAi = configureTestAi();
    const reanalysisError = new Error("reanalysis failed for incompatible deferred identity");
    const crawlPage = { page: { url, pageType: "home" as const, title: "Home", text: "body" }, httpStatus: 200, contentHash: "content-home" };
    boundaryMocks.getGeoReport.mockResolvedValue({ id: job.reportId, url, technicalStatus: "completed", siteKey: "example.com" });
    boundaryMocks.getScanJob.mockResolvedValue(job);
    boundaryMocks.failScanJob.mockResolvedValue({ ...job, stage: "failed", executionState: "failed" });
    boundaryMocks.heartbeatScanJob.mockResolvedValue(true);
    boundaryMocks.purgeExpiredCrawlContent.mockResolvedValue(0);
    boundaryMocks.checkpointScanJob.mockImplementation(async (_id, _workerId, input) => ({
      ...job, stage: input.stage, progress: input.progress, checkpoint: input.checkpoint ?? job.checkpoint,
      checkpointRevision: (input.expectedCheckpointRevision ?? 0) + 1,
      currentPhase: input.phase ?? "page_analysis", phaseAttempt: 0, resumeGeneration: job.resumeGeneration,
      plannedPages: input.plannedPages ?? job.plannedPages, successfulPages: input.successfulPages ?? job.successfulPages,
      failedPages: input.failedPages ?? job.failedPages
    }));
    boundaryMocks.fetchPlannedPagesWithRecovery.mockResolvedValue({
      pages: [crawlPage], checkpoint: { ...job.checkpoint, completedCrawlUrls: [url] }, exhaustedTransientUrls: []
    });
    boundaryMocks.analyzePageBatch.mockRejectedValue(reanalysisError);
    boundaryMocks.synthesizeWebsiteReportWithRecovery.mockResolvedValue({ report: { findings: [] }, rejectedFindingIds: [] });
    boundaryMocks.saveAiReport.mockResolvedValue(undefined);
    try {
      await expect(processScanJob(job, "worker-1")).resolves.toBeUndefined();
      expect(boundaryMocks.analyzePageBatch).toHaveBeenCalledTimes(1);
      const analyzeInput = boundaryMocks.analyzePageBatch.mock.calls[0]![1] as {
        completedAnalyses: unknown[]; pages: Array<{ url: string }>; semanticValidation?: string;
      };
      expect(analyzeInput.completedAnalyses).toEqual([]);
      expect(analyzeInput.pages.map((item) => item.url)).toEqual([url]);
      expect(analyzeInput.semanticValidation).toBe("deferred");
      expect(boundaryMocks.failScanJob).toHaveBeenCalledTimes(1);
      expect(boundaryMocks.failScanJob).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({
        internalError: expect.objectContaining({ message: reanalysisError.message })
      }));
      expect(boundaryMocks.terminalizeScanJob).not.toHaveBeenCalled();
      expect(boundaryMocks.calculateEffectiveCoverage).not.toHaveBeenCalled();
      expect(boundaryMocks.synthesizeWebsiteReportWithRecovery).not.toHaveBeenCalled();
      expect(boundaryMocks.saveAiReport).not.toHaveBeenCalled();
    } finally {
      restoreTestAi(previousAi);
      vi.clearAllMocks();
    }
  });
});

describe("Paid V3 diagnosis failure transparency", () => {
  it("carries questionId and the failure stage/code/parserPath in the thrown message", () => {
    const error = createPaidV3DiagnosisIncompleteError("question-2", {
      providerAttempts: 2,
      failure: { stage: "semantic_contract", code: "invalid_correction", parserPath: "$diagnosisOutput.fields[3]" }
    });
    expect(error.message).toContain("Paid V3 per-question diagnosis did not complete.");
    expect(error.message).toContain("questionId=question-2");
    expect(error.message).toContain("stage=semantic_contract");
    expect(error.message).toContain("code=invalid_correction");
    expect(error.message).toContain("parserPath=$diagnosisOutput.fields[3]");
  });

  it("omits the parserPath segment when the failure has none", () => {
    const error = createPaidV3DiagnosisIncompleteError("question-1", {
      providerAttempts: 1,
      failure: { stage: "provider", code: "provider_timeout", parserPath: null }
    });
    expect(error.message).toContain("questionId=question-1");
    expect(error.message).toContain("stage=provider");
    expect(error.message).toContain("code=provider_timeout");
    expect(error.message).not.toContain("parserPath");
  });

  it("exposes the structured failure for typed-boundary job classification", () => {
    const failure = { stage: "input_validation" as const, code: "invalid_input", parserPath: "$diagnosisInput.sources" };
    const error = createPaidV3DiagnosisIncompleteError("question-3", { providerAttempts: 0, failure });
    expect(error).toBeInstanceOf(PaidV3DiagnosisIncompleteError);
    expect(error.name).toBe("PaidV3DiagnosisIncompleteError");
    expect((error as PaidV3DiagnosisIncompleteError).failure).toEqual(failure);
    expect((error as PaidV3DiagnosisIncompleteError).providerAttempts).toBe(0);
  });
});

describe("paidV3SemanticSourceCatalogEligibility (W4 rule 1)", () => {
  it("marks verified body and search_source_only as eligible, inaccessible as not", () => {
    expect(paidV3SemanticSourceCatalogEligibility({
      retrievalStatus: "verified_body",
      auditRetrievalReady: true,
      auditExactExcerpt: "exact body excerpt"
    })).toEqual({ eligible: true, evidenceMode: "verified_body" });

    expect(paidV3SemanticSourceCatalogEligibility({
      retrievalStatus: "search_source_only",
      auditRetrievalReady: false,
      auditExactExcerpt: null
    })).toEqual({ eligible: true, evidenceMode: "search_summary_only" });

    expect(paidV3SemanticSourceCatalogEligibility({
      retrievalStatus: "inaccessible",
      auditRetrievalReady: false,
      auditExactExcerpt: null
    })).toEqual({ eligible: false, evidenceMode: "unavailable" });

    expect(paidV3SemanticSourceCatalogEligibility({
      retrievalStatus: "verified_body",
      auditRetrievalReady: false,
      auditExactExcerpt: null
    })).toEqual({ eligible: false, evidenceMode: "unavailable" });
  });
});

describe("enhanceV3AnswerCardsWithDiagnosis packet orchestration", () => {
  const iso = "2026-07-31T12:00:00.000Z";
  const hash = "a".repeat(64);
  function diagnosisFor(sourceId: string, questionId: string) {
    const targetRef = `${questionId}:target:page-1`;
    return {
      selectionSummary: "公开来源给出可核验的服务线索。",
      targetGap: "目标站缺少对应服务条件说明。",
      observableFactors: [
        { kind: "problem_match" as const, observation: "问题匹配充分。", evidenceRefs: [sourceId, targetRef] },
        { kind: "factual_specificity" as const, observation: "事实具体可核。", evidenceRefs: [sourceId] },
        { kind: "entity_clarity" as const, observation: "主体识别清晰。", evidenceRefs: [targetRef] }
      ],
      recommendedActions: [
        { priority: 1 as const, action: "补充服务条件。", evidenceRefs: [targetRef] },
        { priority: 2 as const, action: "对齐买家问题。", evidenceRefs: [sourceId, targetRef] },
        { priority: 3 as const, action: "维护公开事实。", evidenceRefs: [targetRef] }
      ],
      detailedEvidenceRefs: [sourceId, targetRef]
    };
  }

  function genCard(questionId: string, sourceId: string, withDiagnosis = false) {
    return {
      answerMode: "generative_search_v1" as const,
      questionId,
      exactQuestion: `Exact ${questionId}`,
      answerText: `Answer for ${questionId}`,
      status: "answered" as const,
      sources: [{
        sourceId,
        title: sourceId,
        canonicalUrl: `https://${sourceId}.example/`,
        registrableDomain: `${sourceId}.example`,
        citedText: "cited",
        providerResultOrder: 0,
        retrievalStatus: "search_source_only" as const,
        ownershipCategory: "company_owned" as const
      }],
      ...(withDiagnosis ? { diagnosis: diagnosisFor(sourceId, questionId) } : {}),
      provenance: {
        answerHash: hash,
        sourceHash: hash,
        searchedAt: iso,
        completedAt: iso,
        providerResponseId: "resp"
      },
      refusal: null
    };
  }

  function admission() {
    return {
      snapshot: {
        id: "admission-1",
        contentIdentityHash: hash,
        siteKey: "example.com"
      },
      pages: [{
        id: "page-1",
        analyzable: true,
        summary: "Target page summary with enough characters for diagnosis evidence.",
        normalizedUrl: "https://example.com/",
        contentHash: hash
      }]
    } as const;
  }

  function baseCheckpoint(cards: ReturnType<typeof genCard>[]) {
    return {
      version: "answer-first-v3-checkpoint-v2" as const,
      stage: "answers_collected" as const,
      identityHash: hash,
      questionSetIdentity: "qs-1",
      providerId: "xiaomi-mimo",
      model: "mimo-v2.5-pro",
      searchMode: "web",
      promptVersion: "generative-search-answer-v1" as const,
      locale: "zh-CN",
      region: "CN",
      answerHash: hash,
      sourceHash: hash,
      engineProvenance: {
        engineId: "open-geo-engine",
        searchSurface: "xiaomi-mimo:web",
        queryPlanVersion: "v1",
        passageSelectorVersion: "v1",
        synthesisModel: "mimo-v2.5-pro",
        synthesisPromptVersion: "v1",
        locale: "zh-CN",
        region: "CN",
        searchedAt: "2026-07-31T11:00:00.000Z",
        evidenceCutoffAt: "2026-07-31T11:30:00.000Z",
        synthesizedAt: iso,
        inputHash: hash,
        evidenceHash: hash,
        answerHash: hash
      },
      answerResults: cards.map((card) => ({
        questionId: card.questionId,
        answerText: card.answerText,
        sources: card.sources,
        refusal: null,
        searchedAt: iso,
        completedAt: iso,
        providerResponseId: "r"
      }))
    };
  }

  it("runs Q2/Q3 diagnosis with overlapping start and keeps Q2 when Q3 fails", async () => {
    const q1 = genCard("question-1", "source-1", true);
    const q2 = genCard("question-2", "source-2");
    const q3 = genCard("question-3", "source-3");
    const saves: unknown[] = [];
    let q2Started = 0;
    let q3Started = 0;
    diagnosisEnhancerMock.enhance.mockImplementation(async (input: { question: { questionId: string } }) => {
      if (input.question.questionId === "question-2") {
        q2Started = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 30));
        return {
          status: "completed",
          question: input.question,
          diagnosis: diagnosisFor("source-2", "question-2"),
          providerAttempts: 1
        };
      }
      q3Started = Date.now();
      await new Promise((resolve) => setTimeout(resolve, 5));
      return {
        status: "failed",
        question: input.question,
        providerAttempts: 1,
        failure: { stage: "provider", code: "provider_timeout", parserPath: null }
      };
    });
    let caught: unknown;
    try {
      await enhanceV3AnswerCardsWithDiagnosis({
        answerCards: [q1, q2, q3] as never,
        checkpoint: baseCheckpoint([q1, q2, q3]) as never,
        questionSetIdentity: "qs-1",
        admission: admission() as never,
        locale: "zh-CN",
        provider: { generate: vi.fn() } as never,
        modelRuntime: {
          modelProfile: { operations: { sourceDiagnosis: { model: "mimo", maxOutputTokens: 1, maxInputTokens: 1, contextWindowTokens: 1, tokenizer: "t" } } },
          tokenEstimators: { resolve: () => ({ estimateTokens: () => 1 }) }
        } as never,
        semanticValidation: "deferred",
        saveCheckpoint: async (checkpoint) => {
          saves.push(structuredClone(checkpoint));
        }
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeTruthy();
    expect(String((caught as Error).message)).toMatch(/question-3|diagnosis/i);
    expect(saves.length).toBeGreaterThan(0);
    const last = [...saves].reverse().find((row) => {
      const packets = (row as { packetsByQuestion?: Record<string, unknown> }).packetsByQuestion;
      return packets && packets["question-2"] && packets["question-3"];
    }) as {
      packetsByQuestion: Record<string, { status: string; providerAttempts: number; failureClassification: string | null; completedAt: string | null }>;
      paidV3DiagnosisStageTimings?: Record<string, string | number>;
    };
    expect(last).toBeTruthy();
    expect(last.packetsByQuestion["question-2"]!.status).toBe("completed");
    // Orchestration records at most one step call (enhancer internal attempts are capped to 1).
    expect(last.packetsByQuestion["question-2"]!.providerAttempts).toBe(1);
    expect(last.packetsByQuestion["question-3"]!.status).toBe("failed");
    expect(last.packetsByQuestion["question-3"]!.providerAttempts).toBe(1);
    expect(last.packetsByQuestion["question-3"]!.failureClassification).toBeTruthy();
    expect(last.packetsByQuestion["question-3"]!.completedAt).toBeTruthy();
    expect(last.packetsByQuestion["question-1"]!.providerAttempts).toBe(0);
    // Completion stamps must ride with the packet save (not only a later success-only write).
    expect(last.paidV3DiagnosisStageTimings?.q2DiagnosisCompletedAt).toBeTruthy();
    expect(last.paidV3DiagnosisStageTimings?.q3DiagnosisCompletedAt).toBeTruthy();
    expect(last.paidV3DiagnosisStageTimings?.q2DiagnosisStartedAt).toBeTruthy();
    expect(String(last.paidV3DiagnosisStageTimings?.sourceCollectionStartedAt)).not.toBe(
      String(last.paidV3DiagnosisStageTimings?.sourceCollectionCompletedAt)
    );
    expect(q2Started).toBeGreaterThan(0);
    expect(q3Started).toBeGreaterThan(0);
    expect(Math.abs(q2Started - q3Started)).toBeLessThan(50);
  });

  it("invokes the diagnosis enhancer exactly once per paid question (no orchestration retry)", async () => {
    const q1 = genCard("question-1", "source-1", true);
    const q2 = genCard("question-2", "source-2");
    const q3 = genCard("question-3", "source-3");
    const calls: string[] = [];
    diagnosisEnhancerMock.enhance.mockImplementation(async (input: { question: { questionId: string } }) => {
      calls.push(input.question.questionId);
      return {
        status: "completed",
        question: input.question,
        diagnosis: diagnosisFor(
          input.question.questionId === "question-2" ? "source-2" : "source-3",
          input.question.questionId
        ),
        providerAttempts: 1
      };
    });
    await enhanceV3AnswerCardsWithDiagnosis({
      answerCards: [q1, q2, q3] as never,
      checkpoint: baseCheckpoint([q1, q2, q3]) as never,
      questionSetIdentity: "qs-1",
      admission: admission() as never,
      locale: "zh-CN",
      provider: { generate: vi.fn() } as never,
      modelRuntime: {
        modelProfile: { operations: { sourceDiagnosis: { model: "mimo", maxOutputTokens: 1, maxInputTokens: 1, contextWindowTokens: 1, tokenizer: "t" } } },
        tokenEstimators: { resolve: () => ({ estimateTokens: () => 1 }) }
      } as never,
      semanticValidation: "deferred",
      saveCheckpoint: async () => undefined
    });
    expect(calls.sort()).toEqual(["question-2", "question-3"]);
    expect(calls).toHaveLength(2);
  });

  it("does not overwrite a completed packet when a concurrent failed write arrives later (lost-update guard)", async () => {
    const { mergePaidV3PacketsByQuestion, buildPaidV3AnswerPacketFromGenerativeCard } = await import("./paid-v3-answer-packet");
    const completed = buildPaidV3AnswerPacketFromGenerativeCard({
      card: genCard("question-2", "source-2", true) as never,
      authorityHash: hash,
      status: "completed",
      attemptCount: 1,
      providerAttempts: 1,
      startedAt: iso,
      completedAt: iso
    });
    const failed = buildPaidV3AnswerPacketFromGenerativeCard({
      card: genCard("question-2", "source-2") as never,
      authorityHash: hash,
      status: "failed",
      attemptCount: 1,
      providerAttempts: 1,
      startedAt: iso,
      completedAt: iso,
      failure: { classification: "timeout", retryable: true, reason: "late fail" }
    });
    const merged = mergePaidV3PacketsByQuestion(
      mergePaidV3PacketsByQuestion(undefined, completed),
      failed
    );
    expect(merged["question-2"]!.status).toBe("completed");
  });
});

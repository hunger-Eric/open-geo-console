import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CheckpointScanJobInput } from "@/db/jobs";
import type {
  FinalizeReportV4PreAdmissionSnapshotInput,
  ReportV4SiteSnapshotBundle,
  ReportV4SiteSnapshotRecord
} from "@/db/report-v4-site-snapshots";
import type { JobCheckpoint, ScanJobRow } from "@/db/schema";
import {
  createProductionReportV4AdmissionRunner,
  deriveReportV4AdmissionIdentity
} from "./report-v4-admission-production";
import type { ReportV4SiteCandidate } from "./report-v4-site-collector";
import { selectReportV4PreAdmissionRunner } from "./processor";

// @requirement GEO-V4-CRAWL-01
// @requirement GEO-V4-CRAWL-02
// @requirement GEO-V4-CRAWL-03
// @requirement GEO-V4-CRAWL-04

describe("production V4 pre-admission composition", () => {
  it("derives frozen identity from the authoritative report and immutable job creation time", async () => {
    const harness = productionHarness([candidate(1)]);
    const coverage = await harness.run();

    expect(coverage).toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
    expect(harness.getReport).toHaveBeenCalledWith("report-1");
    expect(harness.discover).toHaveBeenCalledWith("https://authoritative.example/", expect.any(AbortSignal));
    const expected = deriveReportV4AdmissionIdentity({
      reportId: "report-1",
      targetUrl: "https://authoritative.example/path?submitted=1",
      capturedAt: new Date("2030-01-01T00:00:00.000Z")
    });
    expect(harness.begunIdentity).toEqual(expected);
    expect(expected.id).toBe(deriveReportV4AdmissionIdentity({
      reportId: "report-1",
      targetUrl: "https://authoritative.example/other",
      capturedAt: new Date("2030-01-01T00:00:00.000Z")
    }).id);
    expect(expected.collectorConfigIdentityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.currentJob.checkpoint).toMatchObject({
      reportV4Admission: {
        version: 1,
        runtime: expect.objectContaining({ reportId: "report-1", capturedAt: "2030-01-01T00:00:00.000Z" }),
        robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] }
      }
    });
  });

  it("resumes persisted queue/page checkpoints without rediscovery or refetching successful URLs", async () => {
    const harness = productionHarness([candidate(1), candidate(2)]);
    let interrupt = true;
    harness.writeCheckpoint.mockImplementation(async (input) => {
      harness.persist(input);
      const runtime = (input.checkpoint?.reportV4Admission as { runtime?: { pages?: unknown[] } } | undefined)?.runtime;
      if (interrupt && runtime?.pages?.length === 1) {
        interrupt = false;
        throw new Error("worker interrupted after durable checkpoint");
      }
      return harness.currentJob;
    });

    await expect(harness.run()).rejects.toThrow("worker interrupted after durable checkpoint");
    await expect(harness.run()).resolves.toEqual({ plannedPages: 2, successfulPages: 2, failedPages: 0 });

    expect(harness.discover).toHaveBeenCalledTimes(1);
    expect(harness.rawReads.filter((url) => url.endsWith("/page-1"))).toHaveLength(1);
    expect(harness.rawReads.filter((url) => url.endsWith("/page-2"))).toHaveLength(1);
  });

  it("uses one total createdAt deadline across resume instead of resetting the window", async () => {
    const harness = productionHarness([candidate(1), candidate(2)]);
    harness.setNow("2030-01-01T00:09:59.000Z");
    let interrupt = true;
    harness.writeCheckpoint.mockImplementation(async (input) => {
      harness.persist(input);
      const runtime = (input.checkpoint?.reportV4Admission as { runtime?: { pages?: unknown[] } } | undefined)?.runtime;
      if (interrupt && runtime?.pages?.length === 1) {
        interrupt = false;
        throw new Error("interrupt at the persisted page boundary");
      }
      return harness.currentJob;
    });

    await expect(harness.run()).rejects.toThrow("interrupt at the persisted page boundary");
    harness.setNow("2030-01-01T00:10:00.000Z");
    await expect(harness.run()).resolves.toEqual({ plannedPages: 2, successfulPages: 1, failedPages: 1 });

    expect(harness.discover).toHaveBeenCalledTimes(1);
    expect(harness.rawReads).toEqual(["https://authoritative.example/page-1"]);
    expect(harness.finalized?.status).toBe("completed_limited");
    expect(harness.finalized?.pages).toEqual([
      expect.objectContaining({ normalizedUrl: "https://authoritative.example/page-1", analyzable: true }),
      expect.objectContaining({ normalizedUrl: "https://authoritative.example/page-2", exclusionReason: "deadline_exceeded" })
    ]);
  });

  it("terminalizes an expired-before-start deadline without discovery, page, or browser reads", async () => {
    const harness = productionHarness([candidate(1)]);
    harness.setNow("2030-01-01T00:10:00.000Z");

    await expect(harness.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 0, failedPages: 1 });
    expect(harness.discover).not.toHaveBeenCalled();
    expect(harness.rawReads).toEqual([]);
    expect(harness.browserReads).toEqual([]);
    expect(harness.currentJob.checkpoint).toMatchObject({
      reportV4Admission: {
        runtime: {
          deadlineAt: "2030-01-01T00:10:00.000Z",
          queue: [],
          pages: [expect.objectContaining({ exclusionReason: "deadline_exceeded" })]
        }
      }
    });
    expect(harness.finalized?.status).toBe("unavailable");
  });

  it("classifies only the exact product-deadline discovery abort and propagates caller or infrastructure failures", async () => {
    const deadline = productionHarness([candidate(1)]);
    deadline.discover.mockImplementation(async (_target, signal) => new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
      deadline.fireProductDeadline();
    }));
    await expect(deadline.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 0, failedPages: 1 });
    expect(deadline.rawReads).toEqual([]);
    expect(deadline.browserReads).toEqual([]);
    expect(deadline.finalized?.status).toBe("unavailable");

    const caller = productionHarness([candidate(1)]);
    const callerController = new AbortController();
    const callerReason = new Error("worker lease caller abort");
    callerController.abort(callerReason);
    await expect(caller.run(caller.currentJob, callerController.signal)).rejects.toBe(callerReason);
    expect(caller.discover).not.toHaveBeenCalled();
    expect(caller.finalized).toBeNull();

    const infrastructure = productionHarness([candidate(1)]);
    const infrastructureError = new Error("sitemap repository unavailable");
    infrastructure.discover.mockImplementation(async () => {
      infrastructure.fireProductDeadline();
      throw infrastructureError;
    });
    await expect(infrastructure.run()).rejects.toBe(infrastructureError);
    expect(infrastructure.rawReads).toEqual([]);
    expect(infrastructure.finalized).toBeNull();
  });

  it("reuses a terminal snapshot without discovery, checkpoint writes, or page reads", async () => {
    const harness = productionHarness([candidate(1)]);
    await harness.run();
    harness.discover.mockClear();
    harness.writeCheckpoint.mockClear();
    harness.rawReads.length = 0;

    await expect(harness.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
    expect(harness.discover).not.toHaveBeenCalled();
    expect(harness.writeCheckpoint).not.toHaveBeenCalled();
    expect(harness.rawReads).toEqual([]);
  });

  it("never constructs production reads for non-admission jobs and preflights PDF before raw/provider legacy paths", async () => {
    const harness = productionHarness([
      candidate(1, { url: "https://authoritative.example/file.pdf", contentType: "application/pdf" }),
      candidate(2)
    ]);
    await expect(harness.run({ ...admissionJob(), reason: "standard" })).rejects.toThrow(/exact.*admission/i);
    expect(harness.getReport).not.toHaveBeenCalled();

    await expect(harness.run()).resolves.toEqual({ plannedPages: 2, successfulPages: 1, failedPages: 1 });
    expect(harness.rawReads).toEqual(["https://authoritative.example/page-2"]);
  });

  it("keeps persistent and batch deep workers on the shared processScanJob default composition while preserving injection override", () => {
    const processor = readFileSync(new URL("./processor.ts", import.meta.url), "utf8");
    const persistent = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    const batch = readFileSync(new URL("../scripts/batch-drain.ts", import.meta.url), "utf8");

    expect(persistent).toContain("processScanJob(job, owner");
    expect(batch).toContain("processScanJob(job, workerId)");
    expect(persistent).not.toContain("createProductionReportV4AdmissionRunner");
    expect(batch).not.toContain("createProductionReportV4AdmissionRunner");
    expect(processor).toContain("createProductionReportV4AdmissionRunner");
    expect(processor).toContain("selectReportV4PreAdmissionRunner(");
    expect(processor.indexOf("createProductionReportV4AdmissionRunner")).toBeLessThan(
      processor.indexOf("resolveRecommendationFulfillmentTarget(job)")
    );

    const productionRunner = vi.fn(async () => ({ plannedPages: 0, successfulPages: 0, failedPages: 0 }));
    const injectedRunner = vi.fn(async () => ({ plannedPages: 1, successfulPages: 1, failedPages: 0 }));
    const createDefault = vi.fn(() => productionRunner);
    expect(selectReportV4PreAdmissionRunner({ ...admissionJob(), reason: "standard" }, undefined, createDefault))
      .toBeUndefined();
    expect(createDefault).not.toHaveBeenCalled();
    expect(selectReportV4PreAdmissionRunner(admissionJob(), undefined, createDefault)).toBe(productionRunner);
    expect(createDefault).toHaveBeenCalledTimes(1);
    createDefault.mockClear();
    expect(selectReportV4PreAdmissionRunner(admissionJob(), injectedRunner, createDefault)).toBe(injectedRunner);
    expect(createDefault).not.toHaveBeenCalled();
  });
});

function productionHarness(initialCandidates: ReportV4SiteCandidate[]) {
  let collecting: ReportV4SiteSnapshotRecord | null = null;
  let terminal: ReportV4SiteSnapshotBundle | null = null;
  const rawReads: string[] = [];
  const browserReads: string[] = [];
  let now = new Date("2030-01-01T00:00:01.000Z");
  let scheduledProductDeadline: (() => void) | null = null;
  const getReport = vi.fn(async () => ({
    id: "report-1",
    url: "https://authoritative.example/path?submitted=1",
    siteKey: "authoritative.example"
  }));
  const discover = vi.fn(async () => ({
    targetUrl: "https://authoritative.example/",
    siteKey: "authoritative.example",
    candidates: initialCandidates,
    robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] }
  }));
  const harness: {
    currentJob: ScanJobRow;
    begunIdentity: unknown;
    finalized: FinalizeReportV4PreAdmissionSnapshotInput | null;
    rawReads: string[];
    browserReads: string[];
    getReport: typeof getReport;
    discover: typeof discover;
    writeCheckpoint: ReturnType<typeof vi.fn<(input: CheckpointScanJobInput) => Promise<ScanJobRow>>>;
    persist(input: CheckpointScanJobInput): void;
    setNow(value: string): void;
    fireProductDeadline(): void;
    run(job?: ScanJobRow, signal?: AbortSignal): Promise<{ plannedPages: number; successfulPages: number; failedPages: number }>;
  } = {
    currentJob: admissionJob(),
    begunIdentity: null,
    finalized: null,
    rawReads,
    browserReads,
    getReport,
    discover,
    writeCheckpoint: vi.fn(),
    persist(input) {
      harness.currentJob = {
        ...harness.currentJob,
        checkpoint: { ...harness.currentJob.checkpoint, ...input.checkpoint } as JobCheckpoint,
        checkpointRevision: harness.currentJob.checkpointRevision + 1
      };
    },
    setNow(value) {
      now = new Date(value);
    },
    fireProductDeadline() {
      now = new Date("2030-01-01T00:10:00.000Z");
      const fire = scheduledProductDeadline;
      if (!fire) throw new Error("No product deadline is scheduled.");
      fire();
    },
    async run(job = harness.currentJob, signal = new AbortController().signal) {
      const runner = createProductionReportV4AdmissionRunner({
        checkpointJob: harness.writeCheckpoint,
        dependencies: {
          getReport,
          discover,
          createCollectorDependencies: () => ({
            readRawHtml: async (value) => {
              rawReads.push(value.url);
              return { url: value.url, networkSafety: "public", access: "public", contentType: "text/html", html: `Readable ${value.url}` };
            },
            renderBrowserHtml: async (url) => {
              browserReads.push(url);
              throw new Error("browser not expected");
            },
            extractAnalyzableText: (value) => value.html,
            discoverCandidates: async () => []
          }),
          loadSnapshot: async () => terminal ?? (collecting ? { snapshot: collecting, pages: [] } : null),
          beginSnapshot: async (identity) => {
            harness.begunIdentity = identity;
            collecting ??= {
              ...identity,
              status: "collecting",
              completedAt: null,
              contentIdentityHash: null,
              candidateUrlCount: 0,
              analyzablePageCount: 0,
              excludedPageCount: 0,
              createdAt: identity.capturedAt
            };
            return collecting;
          },
          finalizeSnapshot: async (input) => {
            harness.finalized = structuredClone(input);
            terminal = terminalBundle(input);
            return terminal;
          },
          now: () => new Date(now),
          scheduleProductDeadline: (callback) => {
            scheduledProductDeadline = callback;
            return () => {
              if (scheduledProductDeadline === callback) scheduledProductDeadline = null;
            };
          }
        }
      });
      return runner({ job, signal, remainingMs: () => 60_000 });
    }
  };
  harness.writeCheckpoint.mockImplementation(async (input) => {
    harness.persist(input);
    return harness.currentJob;
  });
  return harness;
}

function terminalBundle(input: FinalizeReportV4PreAdmissionSnapshotInput): ReportV4SiteSnapshotBundle {
  const analyzablePageCount = input.pages.filter((page) => page.analyzable).length;
  return {
    snapshot: {
      ...input,
      analyzablePageCount,
      excludedPageCount: input.pages.length - analyzablePageCount,
      createdAt: input.capturedAt
    },
    pages: input.pages.map((page) => ({ ...page, snapshotId: input.id, createdAt: input.capturedAt }))
  };
}

function candidate(index: number, overrides: Partial<ReportV4SiteCandidate> = {}): ReportV4SiteCandidate {
  return {
    siteUrl: "https://authoritative.example/",
    url: `https://authoritative.example/page-${index}`,
    networkSafety: "public",
    access: "public",
    contentType: "text/html",
    ...overrides
  };
}

function admissionJob(): ScanJobRow {
  return {
    id: "admission-job",
    reportId: "report-1",
    siteSnapshotId: null,
    tier: "deep",
    productContract: "recommendation_forensics_v1",
    fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4,
    artifactContract: "combined_geo_report_v4",
    correctionId: null,
    replacementFulfillmentId: null,
    businessQuestionSetId: null,
    locale: "zh",
    reason: "v4_pre_admission",
    stage: "queued",
    executionState: "running",
    currentPhase: "admission",
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

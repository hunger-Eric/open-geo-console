import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { CheckpointScanJobInput } from "@/db/jobs";
import type {
  FinalizeReportV4PreAdmissionSnapshotInput,
  ReportV4SiteSnapshotBundle,
  ReportV4SiteSnapshotRecord
} from "@/db/report-v4-site-snapshots";
import type { JobCheckpoint, ScanJobRow } from "@/db/schema";
const acceptanceMocks = vi.hoisted(() => ({
  createReportV4AcceptanceObserver: vi.fn()
}));
vi.mock("./report-v4-acceptance-observer", async (importOriginal) => ({
  ...await importOriginal<typeof import("./report-v4-acceptance-observer")>(),
  createReportV4AcceptanceObserver: acceptanceMocks.createReportV4AcceptanceObserver
}));
import {
  createProductionReportV4AdmissionRunner,
  deriveReportV4AdmissionIdentity
} from "./report-v4-admission-production";
import {
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserver
} from "./report-v4-acceptance-observer";
import type { ReportV4SiteCandidate } from "./report-v4-site-collector";
import { selectReportV4PreAdmissionRunner } from "./processor";

// @requirement GEO-V4-CRAWL-01
// @requirement GEO-V4-CRAWL-02
// @requirement GEO-V4-CRAWL-03
// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-TOKEN-02

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
    expect(expected.collectorConfigIdentityHash).not.toBe(sha(JSON.stringify({
      version: "report-v4-site-collector-config-v1",
      networkBoundary: "safe-fetch-pinned-dns-and-redirect-v1",
      discovery: "robots-sitemap-and-same-site-html-links-v1",
      readOrder: "raw-then-single-browser-on-empty-v1",
      admissionLimit: 50,
      customServiceThreshold: 51,
      deadlineMs: 10 * 60 * 1_000
    })));
    expect(harness.currentJob.checkpoint).toMatchObject({
      reportV4Admission: {
        version: 1,
        runtime: expect.objectContaining({ reportId: "report-1", capturedAt: "2030-01-01T00:00:00.000Z" }),
        robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] }
      }
    });
    expect(harness.finalized?.pages[0]).toMatchObject({
      retainedText: "Readable https://authoritative.example/page-1",
      contentHash: sha("Readable https://authoritative.example/page-1")
    });
    expect(acceptanceMocks.createReportV4AcceptanceObserver).not.toHaveBeenCalled();
  });

  it("claims one crawl before discovery and records terminal counts from the persisted snapshot", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const harness = productionHarness([candidate(1)]);
    const order: string[] = [];
    const observer = acceptanceObserver({
      claimExternalIo: vi.fn(async () => {
        order.push("crawl-claim");
        return { event: {}, inserted: true } as never;
      }),
      finishExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never)
    });
    acceptanceMocks.createReportV4AcceptanceObserver.mockImplementationOnce(async ({ jobId }) => {
      order.push(`observer:${jobId}`);
      return observer;
    });
    harness.discover.mockImplementationOnce(async () => {
      order.push("discover");
      return discovery([candidate(1)]);
    });
    try {
      await expect(harness.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
      expect(order).toEqual(["observer:admission-job", "crawl-claim", "discover"]);
      expect(observer.claimExternalIo).toHaveBeenCalledExactlyOnceWith({
        kind: "crawl_run",
        operation: "crawl",
        unitId: "pre-admission-crawl:admission-job",
        attempt: 0,
        phase: "started",
        details: { candidatePages: 0, analyzablePages: 0, excludedPages: 0, jsDependentPages: 0 }
      });
      expect(observer.finishExternalIo).toHaveBeenCalledExactlyOnceWith({
        kind: "crawl_run",
        operation: "crawl",
        unitId: "pre-admission-crawl:admission-job",
        attempt: 0,
        phase: "completed",
        details: { candidatePages: 1, analyzablePages: 1, excludedPages: 0, jsDependentPages: 0 }
      });
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("forbids discovery and all page reads when the crawl started claim already exists", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const harness = productionHarness([candidate(1)]);
    const indeterminate = new ReportV4AcceptanceIndeterminateOperationError();
    const observer = acceptanceObserver({
      claimExternalIo: vi.fn(async () => { throw indeterminate; })
    });
    acceptanceMocks.createReportV4AcceptanceObserver.mockResolvedValueOnce(observer);
    try {
      expect(harness.currentJob.checkpoint).toEqual({});
      await expect(harness.run()).rejects.toBe(indeterminate);
      expect(harness.discover).not.toHaveBeenCalled();
      expect(harness.rawReads).toEqual([]);
      expect(harness.browserReads).toEqual([]);
      expect(observer.finishExternalIo).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
  });

  it("records a failed crawl terminal and idempotently recovers an existing completed terminal", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const failed = productionHarness([candidate(1)]);
    const failure = new Error("discovery transport failed");
    failed.discover.mockRejectedValueOnce(failure);
    const failedObserver = acceptanceObserver();
    acceptanceMocks.createReportV4AcceptanceObserver.mockResolvedValueOnce(failedObserver);
    try {
      await expect(failed.run()).rejects.toBe(failure);
      expect(failedObserver.finishExternalIo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        kind: "crawl_run",
        phase: "failed",
        details: { candidatePages: 0, analyzablePages: 0, excludedPages: 0, jsDependentPages: 0 }
      }));

      vi.clearAllMocks();
      const recovered = productionHarness([candidate(1)]);
      const recoveredObserver = acceptanceObserver({
        finishExternalIo: vi.fn(async () => ({ event: {}, inserted: false }) as never)
      });
      acceptanceMocks.createReportV4AcceptanceObserver.mockResolvedValue(recoveredObserver);
      await recovered.run();
      vi.mocked(recoveredObserver.claimExternalIo).mockClear();
      vi.mocked(recoveredObserver.finishExternalIo).mockClear();
      recovered.discover.mockClear();
      recovered.rawReads.length = 0;

      await expect(recovered.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
      expect(recoveredObserver.claimExternalIo).not.toHaveBeenCalled();
      expect(recovered.discover).not.toHaveBeenCalled();
      expect(recovered.rawReads).toEqual([]);
      expect(recoveredObserver.finishExternalIo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        kind: "crawl_run",
        phase: "completed",
        details: { candidatePages: 1, analyzablePages: 1, excludedPages: 0, jsDependentPages: 0 }
      }));
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
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

  it("continues a previously authorized crawl from its durable checkpoint without reclaiming the crawl wrapper", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const harness = productionHarness([candidate(1), candidate(2)]);
    const processTerminated = new Error("process terminated before crawl terminal append");
    const observer = acceptanceObserver({
      finishExternalIo: vi.fn(async (event) => {
        if (event.phase === "failed") throw processTerminated;
        return { event: {}, inserted: true } as never;
      })
    });
    acceptanceMocks.createReportV4AcceptanceObserver.mockResolvedValue(observer);
    let interrupt = true;
    harness.writeCheckpoint.mockImplementation(async (input) => {
      harness.persist(input);
      const runtime = (input.checkpoint?.reportV4Admission as { runtime?: { pages?: unknown[] } } | undefined)?.runtime;
      if (interrupt && runtime?.pages?.length === 1) {
        interrupt = false;
        throw new Error("worker crashed after durable page checkpoint");
      }
      return harness.currentJob;
    });

    await expect(harness.run()).rejects.toBe(processTerminated);
    expect(observer.claimExternalIo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      kind: "crawl_run",
      phase: "started"
    }));
    expect(harness.rawReads).toEqual(["https://authoritative.example/page-1"]);
    vi.mocked(observer.claimExternalIo).mockClear();
    vi.mocked(observer.finishExternalIo).mockClear();
    harness.discover.mockClear();

    try {
      await expect(harness.run()).resolves.toEqual({ plannedPages: 2, successfulPages: 2, failedPages: 0 });
      expect(vi.mocked(observer.claimExternalIo).mock.calls.filter(([event]) => event.kind === "crawl_run"))
        .toHaveLength(0);
      expect(harness.discover).not.toHaveBeenCalled();
      expect(harness.rawReads.filter((url) => url.endsWith("/page-1"))).toHaveLength(1);
      expect(harness.rawReads.filter((url) => url.endsWith("/page-2"))).toHaveLength(1);
      expect(observer.finishExternalIo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        kind: "crawl_run",
        phase: "completed",
        details: { candidatePages: 2, analyzablePages: 2, excludedPages: 0, jsDependentPages: 0 }
      }));
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
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
    deadline.discover.mockImplementation(async (_target, signal) => new Promise<ReturnType<typeof discovery>>((_, reject) => {
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

  it("never enters the admission network path for a paid core job even when acceptance is configured", async () => {
    const previousSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
    process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID = "11111111-1111-4111-8111-111111111111";
    const harness = productionHarness([candidate(1)]);
    const observer = acceptanceObserver();
    acceptanceMocks.createReportV4AcceptanceObserver.mockResolvedValueOnce(observer);
    try {
      await expect(harness.run({
        ...admissionJob(),
        reason: "standard",
        siteSnapshotId: "paid-snapshot",
        businessQuestionSetId: "paid-question-set",
        creditReservationId: "paid-credit"
      })).rejects.toThrow(/exact.*admission/i);
      expect(harness.getReport).not.toHaveBeenCalled();
      expect(harness.discover).not.toHaveBeenCalled();
      expect(harness.rawReads).toEqual([]);
      expect(harness.browserReads).toEqual([]);
      expect(observer.claimExternalIo).not.toHaveBeenCalled();
    } finally {
      restoreEnvironment("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID", previousSessionId);
      vi.clearAllMocks();
    }
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
  const discover = vi.fn(async (
    targetUrl: string,
    signal?: AbortSignal,
    acceptanceObserver?: ReportV4AcceptanceObserver | null
  ) => {
    void targetUrl;
    void signal;
    void acceptanceObserver;
    return discovery(initialCandidates);
  });
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

function acceptanceObserver(
  overrides: Partial<ReportV4AcceptanceObserver> = {}
): ReportV4AcceptanceObserver {
  return {
    session: {} as never,
    scenario: {} as never,
    observe: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    claimExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    finishExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    ...overrides
  };
}

function discovery(candidates: ReportV4SiteCandidate[]) {
  return {
    targetUrl: "https://authoritative.example/",
    siteKey: "authoritative.example",
    candidates,
    robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] }
  };
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
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
    pages: input.pages.map((page) => ({
      ...page,
      retainedText: page.retainedText ?? null,
      snapshotId: input.id,
      createdAt: input.capturedAt
    }))
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

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
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

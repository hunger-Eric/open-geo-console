import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ScanJobRow } from "@/db/schema";
import type {
  FinalizeReportV4PreAdmissionSnapshotInput,
  ReportV4SiteSnapshotBundle,
  ReportV4SiteSnapshotIdentityInput
} from "@/db/report-v4-site-snapshots";
import {
  createReportV4AdmissionRunner,
  type ReportV4AdmissionCheckpoint,
  type ReportV4AdmissionRuntimeDependencies
} from "./report-v4-admission-runtime";
import type {
  ReportV4HtmlRead,
  ReportV4SiteCandidate,
  ReportV4SiteCollectorDependencies
} from "./report-v4-site-collector";

// @requirement GEO-V4-CRAWL-01
// @requirement GEO-V4-CRAWL-02
// @requirement GEO-V4-CRAWL-03
// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-TOKEN-02

describe("recoverable V4 admission runtime", () => {
  it("checkpoints and finalizes exact cleaned text while keeping the customer-safe preview at 1,000 characters", async () => {
    const retainedText = `${"Exact cleaned evidence ".repeat(80)}tail`;
    const harness = runtimeHarness([candidate(1)], {
      extractAnalyzableText: () => retainedText
    });

    await expect(harness.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
    expect(harness.persistedCheckpoint!.pages[0]).toMatchObject({
      retainedText,
      contentHash: sha(retainedText),
      summary: retainedText.replace(/\s+/g, " ").trim().slice(0, 1_000)
    });
    expect(harness.finalized!.pages[0]).toMatchObject({ retainedText, contentHash: sha(retainedText) });
  });
  it("propagates an exact caller abort that lands between the preflight check and operation listener setup", async () => {
    const callerReason = new Error("caller lease aborted in setup race");
    let abortedReads = 0;
    const callerSignal = {
      get aborted() {
        abortedReads += 1;
        return abortedReads > 1;
      },
      reason: callerReason,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as AbortSignal;
    const harness = runtimeHarness([candidate(1)], {
      readRawHtml: vi.fn(async (value, signal) => {
        if (signal?.aborted) throw signal.reason;
        return readable(value);
      })
    });

    await expect(harness.run(callerSignal)).rejects.toBe(callerReason);
    expect(harness.snapshots.finalize).not.toHaveBeenCalled();
  });

  it("rejects an admission deadline longer than the approved ten-minute maximum", () => {
    expect(() => runtimeHarness([candidate(1)], {}, { deadlineMs: 10 * 60 * 1_000 + 1 }))
      .toThrow(/deadline.*at most.*10 minutes/i);
  });

  it.each([
    ["duplicate queue URLs", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      queue: [candidate(1), candidate(1)],
      knownUrlKeys: ["https://example.com/page-1"]
    })],
    ["duplicate known URLs", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      knownUrlKeys: ["https://example.com/page-1", "https://example.com/page-1"]
    })],
    ["non-normalized visited URLs", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      queue: [],
      visitedUrlKeys: ["https://EXAMPLE.com/page-1#fragment"]
    })],
    ["a queue URL outside known URLs", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      knownUrlKeys: ["https://example.com/page-2"]
    })],
    ["a queue URL already visited", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      visitedUrlKeys: ["https://example.com/page-1"]
    })],
    ["non-contiguous page ordinals", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      queue: [],
      pages: [checkpointPage(2)],
      knownUrlKeys: ["https://example.com/page-1"]
    })],
    ["a page URL outside known URLs", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      queue: [],
      pages: [checkpointPage(1, "https://example.com/page-2")]
    })],
    ["a page URL overlapping the queue", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      pages: [checkpointPage(1)]
    })],
    ["more than 51 analyzable pages", (checkpoint: ReportV4AdmissionCheckpoint) => ({
      ...checkpoint,
      queue: [],
      knownUrlKeys: Array.from({ length: 52 }, (_, index) => `https://example.com/page-${index + 1}`),
      pages: Array.from({ length: 52 }, (_, index) => checkpointPage(index + 1, `https://example.com/page-${index + 1}`))
    })]
  ])("fails closed on a corrupt checkpoint containing %s", async (_label, corrupt) => {
    const harness = runtimeHarness([candidate(1)]);
    harness.persistedCheckpoint = corrupt(checkpointFixture());

    await expect(harness.run()).rejects.toThrow(/checkpoint/i);
    expect(harness.readRawHtml).not.toHaveBeenCalled();
    expect(harness.snapshots.finalize).not.toHaveBeenCalled();
  });

  it("begins once, checkpoints each successful page, and resumes without refetching it", async () => {
    const harness = runtimeHarness([candidate(1), candidate(2)]);
    let interruptAfterDurableSave = true;
    harness.checkpoints.save.mockImplementation(async (_jobId, checkpoint) => {
      harness.persistedCheckpoint = structuredClone(checkpoint);
      if (checkpoint.pages.some((page) => page.normalizedUrl.endsWith("/page-1")) && interruptAfterDurableSave) {
        interruptAfterDurableSave = false;
        throw new Error("worker interrupted after checkpoint");
      }
    });

    await expect(harness.run()).rejects.toThrow("worker interrupted after checkpoint");
    expect(harness.persistedCheckpoint?.pages).toHaveLength(1);
    await expect(harness.run()).resolves.toEqual({ plannedPages: 2, successfulPages: 2, failedPages: 0 });

    expect(harness.snapshots.begin).toHaveBeenCalledTimes(2);
    expect(harness.readRawHtml.mock.calls.filter(([value]) => value.url.endsWith("/page-1"))).toHaveLength(1);
    expect(harness.readRawHtml.mock.calls.filter(([value]) => value.url.endsWith("/page-2"))).toHaveLength(1);
    expect(harness.snapshots.finalize).toHaveBeenCalledTimes(1);
  });

  it("deduplicates the dynamic queue and only raw-reads public same-site analyzable HTML candidates", async () => {
    const unsafe = candidate(9, { networkSafety: "unsafe" });
    const crossSite = candidate(10, { url: "https://elsewhere.test/page-10" });
    const pdf = candidate(11, { url: "https://example.com/file.pdf", contentType: "application/pdf" });
    const duplicate = candidate(2, { url: "https://EXAMPLE.com/page-2#fragment" });
    const harness = runtimeHarness([candidate(1)], {
      discoverCandidates: vi.fn(async () => [candidate(2), duplicate, unsafe, crossSite, pdf])
    });

    await expect(harness.run()).resolves.toEqual({ plannedPages: 5, successfulPages: 2, failedPages: 3 });
    expect(harness.readRawHtml).toHaveBeenCalledTimes(2);
    expect(harness.readRawHtml.mock.calls.map(([value]) => value.url)).toEqual([
      "https://example.com/page-1",
      "https://example.com/page-2"
    ]);
    expect(harness.finalized?.status).toBe("completed_limited");
  });

  it("binds every queued candidate to the trusted target site instead of trusting a forged candidate siteUrl", async () => {
    const forged = candidate(1, {
      siteUrl: "https://elsewhere.test/",
      url: "https://elsewhere.test/private-page"
    });
    const harness = runtimeHarness([forged]);

    await expect(harness.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 0, failedPages: 1 });
    expect(harness.readRawHtml).not.toHaveBeenCalled();
    expect(harness.finalized?.pages).toEqual([
      expect.objectContaining({ normalizedUrl: "https://elsewhere.test/private-page", exclusionReason: "cross_site" })
    ]);
  });

  it("terminalizes the ten-minute deadline as limited with evidence or unavailable with none", async () => {
    const limited = runtimeHarness([candidate(1), candidate(2), candidate(3)]);
    limited.now.mockReturnValueOnce(new Date("2030-01-01T00:00:01.000Z"));
    limited.now.mockReturnValue(new Date("2030-01-01T00:10:00.000Z"));
    await expect(limited.run()).resolves.toEqual({ plannedPages: 3, successfulPages: 1, failedPages: 2 });
    expect(limited.finalized).toMatchObject({
      status: "completed_limited",
      pages: [
        expect.objectContaining({ normalizedUrl: "https://example.com/page-1", analyzable: true }),
        expect.objectContaining({ normalizedUrl: "https://example.com/page-2", exclusionReason: "deadline_exceeded" }),
        expect.objectContaining({ normalizedUrl: "https://example.com/page-3", exclusionReason: "deadline_exceeded" })
      ]
    });

    const unavailable = runtimeHarness([candidate(1), candidate(2), candidate(3)]);
    unavailable.now.mockReturnValue(new Date("2030-01-01T00:10:00.000Z"));
    await expect(unavailable.run()).resolves.toEqual({ plannedPages: 3, successfulPages: 0, failedPages: 3 });
    expect(unavailable.finalized?.status).toBe("unavailable");
    expect(unavailable.finalized?.pages.map(({ normalizedUrl, exclusionReason }) => ({ normalizedUrl, exclusionReason })))
      .toEqual([1, 2, 3].map((index) => ({
        normalizedUrl: `https://example.com/page-${index}`,
        exclusionReason: "deadline_exceeded"
      })));
  });

  it("does not turn an independent infrastructure error into a product deadline when the timer also expires", async () => {
    const infrastructureError = new Error("discovery infrastructure unavailable");
    const harness = runtimeHarness([candidate(1)], {
      discoverCandidates: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw infrastructureError;
      })
    }, { deadlineMs: 1 });
    harness.now.mockReturnValue(new Date("2030-01-01T00:00:00.000Z"));

    await expect(harness.run()).rejects.toBe(infrastructureError);
    expect(harness.snapshots.finalize).not.toHaveBeenCalled();
  });

  it("terminalizes a discovery AbortError using the admission deadline controller's exact reason", async () => {
    const harness = runtimeHarness([candidate(1)], {
      discoverCandidates: vi.fn(async (_read, _candidate, signal) => new Promise((_, reject) => {
        const rejectAbort = () => reject(new DOMException("The operation was aborted", "AbortError"));
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener("abort", rejectAbort, { once: true });
      }))
    }, { deadlineMs: 1 });
    harness.now.mockReturnValue(new Date("2030-01-01T00:00:00.000Z"));

    await expect(harness.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 0, failedPages: 1 });
    expect(harness.finalized?.status).toBe("unavailable");
    expect(harness.finalized?.pages).toEqual([
      expect.objectContaining({ normalizedUrl: "https://example.com/page-1", exclusionReason: "deadline_exceeded" })
    ]);
  });

  it("retains the fifty-first page as custom-service evidence and never reads the fifty-second", async () => {
    const harness = runtimeHarness(Array.from({ length: 52 }, (_, index) => candidate(index + 1)));

    await expect(harness.run()).resolves.toEqual({ plannedPages: 52, successfulPages: 51, failedPages: 0 });
    expect(harness.finalized).toMatchObject({ status: "custom_service" });
    expect(harness.finalized?.pages).toHaveLength(51);
    expect(harness.finalized?.pages[50]).toMatchObject({ normalizedUrl: "https://example.com/page-51" });
    expect(harness.readRawHtml).toHaveBeenCalledTimes(51);
    expect(harness.readRawHtml.mock.calls.some(([value]) => value.url.endsWith("/page-52"))).toBe(false);
  });

  it("propagates repository failures for job retry and persists terminal snapshot before returning coverage", async () => {
    const failed = runtimeHarness([candidate(1)]);
    failed.snapshots.finalize.mockRejectedValueOnce(new Error("postgres unavailable"));
    await expect(failed.run()).rejects.toThrow("postgres unavailable");

    const ordered = runtimeHarness([candidate(1)]);
    let terminalPersisted = false;
    ordered.snapshots.finalize.mockImplementation(async (input) => {
      terminalPersisted = true;
      ordered.finalized = structuredClone(input);
      ordered.terminalBundle = terminalBundle(input);
      return ordered.terminalBundle;
    });
    await ordered.run().then((coverage) => {
      expect(terminalPersisted).toBe(true);
      expect(coverage).toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
    });

    ordered.snapshots.begin.mockClear();
    await expect(ordered.run()).resolves.toEqual({ plannedPages: 1, successfulPages: 1, failedPages: 0 });
    expect(ordered.snapshots.begin).not.toHaveBeenCalled();
    expect(ordered.readRawHtml).toHaveBeenCalledTimes(1);
  });
});

function runtimeHarness(
  initialCandidates: ReportV4SiteCandidate[],
  collectorOverrides: Partial<ReportV4SiteCollectorDependencies> = {},
  options: { deadlineMs?: number } = {}
) {
  const identity: ReportV4SiteSnapshotIdentityInput = {
    id: "snapshot-1",
    reportId: "report-1",
    siteKey: "example.com",
    collectorConfigIdentityHash: sha("collector-config"),
    capturedAt: new Date("2030-01-01T00:00:00.000Z")
  };
  const readRawHtml = vi.fn(async (value: ReportV4SiteCandidate): Promise<ReportV4HtmlRead> => ({
    url: value.url,
    networkSafety: value.networkSafety,
    access: value.access,
    contentType: value.contentType ?? "text/html",
    html: `Readable evidence for ${value.url}`
  }));
  const collector: ReportV4SiteCollectorDependencies = {
    readRawHtml,
    renderBrowserHtml: vi.fn(async () => { throw new Error("browser should not be needed"); }),
    extractAnalyzableText: (value) => value.html,
    ...collectorOverrides
  };
  const checkpoints = {
    load: vi.fn(async () => harness.persistedCheckpoint),
    save: vi.fn(async (_jobId: string, checkpoint: ReportV4AdmissionCheckpoint) => {
      harness.persistedCheckpoint = structuredClone(checkpoint);
    })
  };
  const snapshots = {
    load: vi.fn(async () => harness.terminalBundle),
    begin: vi.fn(async () => ({ ...identity, status: "collecting" as const })),
    finalize: vi.fn(async (input: FinalizeReportV4PreAdmissionSnapshotInput) => {
      harness.finalized = structuredClone(input);
      harness.terminalBundle = terminalBundle(input);
      return harness.terminalBundle;
    })
  };
  const now = vi.fn(() => new Date("2030-01-01T00:00:01.000Z"));
  const dependencies: ReportV4AdmissionRuntimeDependencies = { checkpoints, snapshots, collector, now };
  const runner = createReportV4AdmissionRunner({
    identity,
    targetUrl: "https://example.com/",
    initialCandidates,
    ...(options.deadlineMs ? { deadlineMs: options.deadlineMs } : {})
  }, dependencies);
  const harness: {
    persistedCheckpoint?: ReportV4AdmissionCheckpoint;
    finalized?: FinalizeReportV4PreAdmissionSnapshotInput;
    terminalBundle?: ReportV4SiteSnapshotBundle;
    checkpoints: typeof checkpoints;
    snapshots: typeof snapshots;
    readRawHtml: typeof readRawHtml;
    now: typeof now;
    run: (signal?: AbortSignal) => ReturnType<typeof runner>;
  } = {
    checkpoints,
    snapshots,
    readRawHtml,
    now,
    run: (signal = new AbortController().signal) => runner({ job: admissionJob(), signal, remainingMs: () => 60_000 })
  };
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
    siteUrl: "https://example.com/",
    url: `https://example.com/page-${index}`,
    networkSafety: "public",
    access: "public",
    contentType: "text/html",
    ...overrides
  };
}

function readable(value: ReportV4SiteCandidate): ReportV4HtmlRead {
  return {
    url: value.url,
    networkSafety: value.networkSafety,
    access: value.access,
    contentType: value.contentType ?? "text/html",
    html: `Readable evidence for ${value.url}`
  };
}

function checkpointFixture(): ReportV4AdmissionCheckpoint {
  return {
    version: 1,
    snapshotId: "snapshot-1",
    reportId: "report-1",
    siteKey: "example.com",
    collectorConfigIdentityHash: sha("collector-config"),
    capturedAt: "2030-01-01T00:00:00.000Z",
    targetUrl: "https://example.com/",
    deadlineAt: "2030-01-01T00:10:00.000Z",
    queue: [candidate(1)],
    knownUrlKeys: ["https://example.com/page-1"],
    visitedUrlKeys: [],
    pages: []
  };
}

function checkpointPage(ordinal: number, normalizedUrl = "https://example.com/page-1") {
  return {
    id: `checkpoint-page-${ordinal}`,
    ordinal,
    normalizedUrl,
    analyzable: true,
    readMode: "direct_readable" as const,
    summary: `Checkpoint page ${ordinal}`,
    retainedText: `checkpoint-page-${ordinal}`,
    contentHash: sha(`checkpoint-page-${ordinal}`),
    exclusionReason: null
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

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

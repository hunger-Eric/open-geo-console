import { createHash } from "node:crypto";
import { createSiteKey, type RobotsPolicy } from "@open-geo-console/site-crawler";
import type { CheckpointScanJobInput, ScanJobCoverage } from "@/db/jobs";
import {
  beginReportV4PreAdmissionSnapshot,
  finalizeReportV4PreAdmissionSnapshot,
  loadReportV4PreAdmissionSnapshot,
  type FinalizeReportV4PreAdmissionSnapshotInput,
  type ReportV4SiteSnapshotBundle,
  type ReportV4SiteSnapshotIdentityInput,
  type ReportV4SiteSnapshotRecord
} from "@/db/report-v4-site-snapshots";
import { getGeoReport } from "@/db/reports";
import type { JobCheckpoint, ScanJobRow } from "@/db/schema";
import {
  createReportV4AdmissionRunner,
  type ReportV4AdmissionCheckpoint
} from "./report-v4-admission-runtime";
import {
  createReportV4AdmissionCollectorDependencies,
  discoverReportV4AdmissionSite,
  type ReportV4AdmissionDiscovery
} from "./crawler-runtime";
import type { ReportV4PreAdmissionRunner } from "./report-v4-pre-admission";
import type { ReportV4SiteCollectorDependencies } from "./report-v4-site-collector";

const SNAPSHOT_ID_CONTRACT = "report-v4-site-snapshot-id-v2";
const PRODUCT_DEADLINE_MS = 10 * 60 * 1_000;
const COLLECTOR_CONFIG_CONTRACT = Object.freeze({
  version: "report-v4-site-collector-config-v2",
  networkBoundary: "safe-fetch-pinned-dns-and-redirect-v1",
  discovery: "robots-sitemap-and-same-site-html-links-v1",
  readOrder: "raw-then-single-browser-on-empty-v1",
  admissionLimit: 50,
  customServiceThreshold: 51,
  deadlineMs: PRODUCT_DEADLINE_MS,
  retainedText: Object.freeze({
    policy: "exact-cleaned-analyzable-text-v1",
    maxCharactersPerPage: 100_000,
    contentHash: "sha256-utf8-exact",
    excludedPages: "null"
  })
});
const CHECKPOINT_FIELD = "reportV4Admission";

interface PersistedReportV4Admission {
  version: 1;
  runtime: ReportV4AdmissionCheckpoint;
  robotsPolicy: RobotsPolicy;
}

export interface ReportV4AdmissionProductionDependencies {
  getReport(reportId: string): Promise<{ url: string } | null>;
  discover(targetUrl: string, signal?: AbortSignal): Promise<ReportV4AdmissionDiscovery>;
  createCollectorDependencies(input: {
    targetUrl: string;
    robotsPolicy: RobotsPolicy;
  }): ReportV4SiteCollectorDependencies;
  loadSnapshot(identity: ReportV4SiteSnapshotIdentityInput): Promise<ReportV4SiteSnapshotBundle | null>;
  beginSnapshot(identity: ReportV4SiteSnapshotIdentityInput): Promise<ReportV4SiteSnapshotRecord | unknown>;
  finalizeSnapshot(input: FinalizeReportV4PreAdmissionSnapshotInput): Promise<ReportV4SiteSnapshotBundle>;
  now(): Date;
  scheduleProductDeadline(callback: () => void, delayMs: number): () => void;
}

export function deriveReportV4AdmissionIdentity(input: {
  reportId: string;
  targetUrl: string;
  capturedAt: Date;
}): ReportV4SiteSnapshotIdentityInput {
  const targetUrl = canonicalSiteRoot(input.targetUrl);
  const capturedAt = validDate(input.capturedAt, "admission job createdAt");
  const reportId = input.reportId.trim();
  if (!reportId) throw new Error("A V4 admission report identity is required.");
  return {
    id: `report-v4-site-${sha(`${SNAPSHOT_ID_CONTRACT}\n${reportId}\n${targetUrl}\n${capturedAt.toISOString()}`)}`,
    reportId,
    siteKey: createSiteKey(targetUrl),
    collectorConfigIdentityHash: sha(JSON.stringify(COLLECTOR_CONFIG_CONTRACT)),
    capturedAt
  };
}

export function createProductionReportV4AdmissionRunner(input: {
  checkpointJob: (checkpoint: CheckpointScanJobInput) => Promise<ScanJobRow>;
  dependencies?: Partial<ReportV4AdmissionProductionDependencies>;
}): ReportV4PreAdmissionRunner {
  const dependencies: ReportV4AdmissionProductionDependencies = {
    getReport: getGeoReport,
    discover: discoverReportV4AdmissionSite,
    createCollectorDependencies: createReportV4AdmissionCollectorDependencies,
    loadSnapshot: loadReportV4PreAdmissionSnapshot,
    beginSnapshot: beginReportV4PreAdmissionSnapshot,
    finalizeSnapshot: finalizeReportV4PreAdmissionSnapshot,
    now: () => new Date(),
    scheduleProductDeadline(callback, delayMs) {
      const timer = setTimeout(callback, delayMs);
      return () => clearTimeout(timer);
    },
    ...input.dependencies
  };

  return async (runInput): Promise<ScanJobCoverage> => {
    assertExactAdmissionJob(runInput.job);
    const report = await dependencies.getReport(runInput.job.reportId);
    if (!report) throw new Error("The authoritative V4 admission scan report was not found.");
    const targetUrl = canonicalSiteRoot(report.url);
    const identity = deriveReportV4AdmissionIdentity({
      reportId: runInput.job.reportId,
      targetUrl: report.url,
      capturedAt: runInput.job.createdAt
    });
    const existingSnapshot = await dependencies.loadSnapshot(identity);
    if (existingSnapshot && existingSnapshot.snapshot.status !== "collecting") {
      return coverage(existingSnapshot);
    }

    let currentCheckpoint = runInput.job.checkpoint;
    let persisted = readPersistedAdmission(currentCheckpoint);
    let discovery: ReportV4AdmissionDiscovery | null = null;
    if (!persisted) {
      runInput.signal.throwIfAborted();
      const deadlineRemainingMs = identity.capturedAt.getTime() + PRODUCT_DEADLINE_MS - dependencies.now().getTime();
      if (deadlineRemainingMs <= 0) {
        discovery = deadlineFallback(targetUrl, identity.siteKey);
      } else {
        const operation = productDeadlineSignal(
          runInput.signal,
          deadlineRemainingMs,
          dependencies.scheduleProductDeadline
        );
        try {
          discovery = await dependencies.discover(targetUrl, operation.signal);
        } catch (error) {
          if (!operation.isProductDeadlineAbort(error)) throw error;
          discovery = deadlineFallback(targetUrl, identity.siteKey);
        } finally {
          operation.dispose();
        }
      }
      if (canonicalSiteRoot(discovery.targetUrl) !== targetUrl || discovery.siteKey !== identity.siteKey) {
        throw new Error("The V4 admission discovery identity does not match the authoritative report target.");
      }
    }
    const robotsPolicy = persisted?.robotsPolicy ?? discovery!.robotsPolicy;
    const collector = dependencies.createCollectorDependencies({ targetUrl, robotsPolicy });
    const runner = createReportV4AdmissionRunner({
      identity,
      targetUrl,
      initialCandidates: persisted ? [] : discovery!.candidates
    }, {
      checkpoints: {
        async load(jobId) {
          if (jobId !== runInput.job.id) throw new Error("The V4 admission checkpoint job identity does not match.");
          persisted = readPersistedAdmission(currentCheckpoint);
          return persisted?.runtime ?? null;
        },
        async save(jobId, runtime) {
          if (jobId !== runInput.job.id) throw new Error("The V4 admission checkpoint job identity does not match.");
          const field: PersistedReportV4Admission = { version: 1, runtime, robotsPolicy };
          const analyzable = runtime.pages.filter((page) => page.analyzable).length;
          const updated = await input.checkpointJob({
            stage: "discovering",
            phase: "admission",
            progress: admissionProgress(runtime),
            checkpoint: { [CHECKPOINT_FIELD]: field } as JobCheckpoint,
            plannedPages: runtime.knownUrlKeys.length,
            successfulPages: analyzable,
            failedPages: runtime.pages.length - analyzable
          });
          currentCheckpoint = updated.checkpoint;
          persisted = readPersistedAdmission(currentCheckpoint);
        }
      },
      snapshots: {
        load: dependencies.loadSnapshot,
        begin: dependencies.beginSnapshot,
        finalize: dependencies.finalizeSnapshot
      },
      collector,
      now: dependencies.now
    });
    return runner(runInput);
  };
}

function deadlineFallback(targetUrl: string, siteKey: string): ReportV4AdmissionDiscovery {
  const robotsPolicy: RobotsPolicy = { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] };
  return {
    targetUrl,
    siteKey,
    robotsPolicy,
    candidates: [{
      siteUrl: targetUrl,
      url: targetUrl,
      networkSafety: "public",
      access: "public",
      contentType: "text/html"
    }]
  };
}

function productDeadlineSignal(
  callerSignal: AbortSignal,
  remainingMs: number,
  schedule: (callback: () => void, delayMs: number) => () => void
): {
  signal: AbortSignal;
  isProductDeadlineAbort: (error: unknown) => boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  const deadlineReason = new Error("The Report V4 product deadline expired.");
  const abortFromCaller = () => controller.abort(callerSignal.reason);
  callerSignal.addEventListener("abort", abortFromCaller, { once: true });
  if (callerSignal.aborted) abortFromCaller();
  const cancelDeadline = schedule(() => controller.abort(deadlineReason), remainingMs);
  return {
    signal: controller.signal,
    isProductDeadlineAbort: (error) => controller.signal.reason === deadlineReason && error === deadlineReason,
    dispose() {
      cancelDeadline();
      callerSignal.removeEventListener("abort", abortFromCaller);
    }
  };
}

function readPersistedAdmission(checkpoint: JobCheckpoint): PersistedReportV4Admission | null {
  const value = checkpoint[CHECKPOINT_FIELD];
  if (value == null) return null;
  if (!value || typeof value !== "object") throw new Error("The persisted V4 admission checkpoint envelope is invalid.");
  const candidate = value as Partial<PersistedReportV4Admission>;
  if (candidate.version !== 1 || !candidate.runtime || !validRobotsPolicy(candidate.robotsPolicy)) {
    throw new Error("The persisted V4 admission checkpoint envelope is invalid.");
  }
  return structuredClone(candidate as PersistedReportV4Admission);
}

function validRobotsPolicy(value: unknown): value is RobotsPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Partial<RobotsPolicy>;
  return typeof policy.userAgent === "string" && Array.isArray(policy.rules) && Array.isArray(policy.sitemaps);
}

function assertExactAdmissionJob(job: ScanJobRow): void {
  if (job.reason !== "v4_pre_admission" || job.tier !== "deep" ||
      job.productContract !== "recommendation_forensics_v1" ||
      job.fulfillmentMethodology !== "two_stage_geo_report_v4" ||
      job.recommendationReportVersion !== 4 || job.artifactContract !== "combined_geo_report_v4") {
    throw new Error("The production V4 runner requires the exact pre-admission job identity.");
  }
}

function canonicalSiteRoot(value: string): string {
  const root = new URL(value);
  if (root.protocol !== "http:" && root.protocol !== "https:") throw new Error("The authoritative V4 admission target must be HTTP(S).");
  root.pathname = "/";
  root.search = "";
  root.hash = "";
  return root.toString();
}

function admissionProgress(checkpoint: ReportV4AdmissionCheckpoint): number {
  const completed = checkpoint.visitedUrlKeys.length;
  const total = Math.max(1, checkpoint.knownUrlKeys.length);
  return Math.min(90, 5 + Math.round((completed / total) * 80));
}

function coverage(bundle: ReportV4SiteSnapshotBundle): ScanJobCoverage {
  return {
    plannedPages: bundle.snapshot.candidateUrlCount,
    successfulPages: bundle.snapshot.analyzablePageCount,
    failedPages: bundle.snapshot.excludedPageCount
  };
}

function validDate(value: Date, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`A valid ${field} is required.`);
  return date;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

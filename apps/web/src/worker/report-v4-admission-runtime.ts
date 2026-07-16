import { createHash } from "node:crypto";
import type { ScanJobCoverage } from "@/db/jobs";
import type {
  FinalizeReportV4PreAdmissionSnapshotInput,
  ReportV4SiteSnapshotBundle,
  ReportV4SiteSnapshotIdentityInput,
  ReportV4SiteSnapshotPageInput,
  ReportV4SiteSnapshotRecord
} from "@/db/report-v4-site-snapshots";
import type { ReportV4PreAdmissionRunner } from "./report-v4-pre-admission";
import {
  collectReportV4Site,
  type ReportV4SiteCandidate,
  type ReportV4SiteCollectionResult,
  type ReportV4SiteCollectorDependencies
} from "./report-v4-site-collector";

const DEFAULT_DEADLINE_MS = 10 * 60 * 1_000;
const CUSTOM_SERVICE_PAGE_COUNT = 51;
const SUMMARY_LIMIT = 1_000;
const RETAINED_TEXT_LIMIT = 100_000;

export interface ReportV4AdmissionRuntimeConfig {
  readonly identity: ReportV4SiteSnapshotIdentityInput;
  readonly targetUrl: string;
  readonly initialCandidates: ReadonlyArray<ReportV4SiteCandidate>;
  readonly deadlineMs?: number;
}

export interface ReportV4AdmissionCheckpoint {
  readonly version: 1;
  readonly snapshotId: string;
  readonly reportId: string;
  readonly siteKey: string;
  readonly collectorConfigIdentityHash: string;
  readonly capturedAt: string;
  readonly targetUrl: string;
  readonly deadlineAt: string;
  readonly queue: ReportV4SiteCandidate[];
  readonly knownUrlKeys: string[];
  readonly visitedUrlKeys: string[];
  readonly pages: ReportV4SiteSnapshotPageInput[];
}

export interface ReportV4AdmissionRuntimeDependencies {
  readonly checkpoints: {
    load(jobId: string): Promise<ReportV4AdmissionCheckpoint | null | undefined>;
    save(jobId: string, checkpoint: ReportV4AdmissionCheckpoint): Promise<void>;
  };
  readonly snapshots: {
    load(identity: ReportV4SiteSnapshotIdentityInput): Promise<ReportV4SiteSnapshotBundle | null>;
    begin(identity: ReportV4SiteSnapshotIdentityInput): Promise<ReportV4SiteSnapshotRecord | unknown>;
    finalize(input: FinalizeReportV4PreAdmissionSnapshotInput): Promise<ReportV4SiteSnapshotBundle>;
  };
  readonly collector: ReportV4SiteCollectorDependencies;
  readonly now?: () => Date;
}

export function createReportV4AdmissionRunner(
  config: ReportV4AdmissionRuntimeConfig,
  dependencies: ReportV4AdmissionRuntimeDependencies
): ReportV4PreAdmissionRunner {
  const normalizedConfig = validateConfig(config);
  const now = dependencies.now ?? (() => new Date());

  return async ({ job, signal, remainingMs }): Promise<ScanJobCoverage> => {
    if (job.reportId !== normalizedConfig.identity.reportId) {
      throw new Error("The V4 admission job and snapshot report identity do not match.");
    }

    const existing = await dependencies.snapshots.load(normalizedConfig.identity);
    if (existing && existing.snapshot.status !== "collecting") return coverageFromBundle(existing);
    await dependencies.snapshots.begin(normalizedConfig.identity);

    let checkpoint = await dependencies.checkpoints.load(job.id);
    if (checkpoint) {
      checkpoint = validateCheckpoint(checkpoint, normalizedConfig);
    } else {
      checkpoint = initialCheckpoint(normalizedConfig);
      await dependencies.checkpoints.save(job.id, checkpoint);
    }

    while (checkpoint.queue.length > 0) {
      throwIfExecutionInterrupted(signal, remainingMs);
      const deadlineAt = Date.parse(checkpoint.deadlineAt);
      const deadlineRemainingMs = deadlineAt - now().getTime();
      if (deadlineRemainingMs <= 0) {
        checkpoint = appendDeadlineGaps(checkpoint);
        await dependencies.checkpoints.save(job.id, checkpoint);
        return finalizeAndReturn(checkpoint, normalizedConfig.identity, dependencies, now);
      }

      const [candidate, ...remainingQueue] = checkpoint.queue;
      const key = candidateKey(candidate!.url);
      const operation = deadlineBoundSignal(signal, deadlineRemainingMs);
      let result: ReportV4SiteCollectionResult;
      try {
        result = await collectReportV4Site([candidate!], dependencies.collector, operation.signal);
      } catch (error) {
        if (!operation.isDeadlineAbort(error)) throw error;
        checkpoint = appendDeadlineGaps(checkpoint);
        await dependencies.checkpoints.save(job.id, checkpoint);
        return finalizeAndReturn(checkpoint, normalizedConfig.identity, dependencies, now);
      } finally {
        operation.dispose();
      }
      checkpoint = appendCollectionResult(
        { ...checkpoint, queue: remainingQueue, visitedUrlKeys: unique([...checkpoint.visitedUrlKeys, key]) },
        result,
        normalizedConfig.identity.id
      );
      checkpoint = enqueueDiscovered(checkpoint, result.discoveredCandidates);
      await dependencies.checkpoints.save(job.id, checkpoint);

      if (analyzableCount(checkpoint.pages) === CUSTOM_SERVICE_PAGE_COUNT) {
        return finalizeAndReturn(checkpoint, normalizedConfig.identity, dependencies, now, "custom_service");
      }
    }

    return finalizeAndReturn(checkpoint, normalizedConfig.identity, dependencies, now);
  };
}

function validateConfig(config: ReportV4AdmissionRuntimeConfig): Required<ReportV4AdmissionRuntimeConfig> {
  const targetUrl = normalizedHttpUrl(config.targetUrl);
  if (!targetUrl) throw new Error("A normalized HTTP(S) V4 admission target URL is required.");
  const deadlineMs = config.deadlineMs ?? DEFAULT_DEADLINE_MS;
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1) throw new Error("A positive V4 admission deadline is required.");
  if (deadlineMs > DEFAULT_DEADLINE_MS) throw new Error("The V4 admission deadline must be at most 10 minutes.");
  return { ...config, targetUrl, deadlineMs };
}

function initialCheckpoint(config: Required<ReportV4AdmissionRuntimeConfig>): ReportV4AdmissionCheckpoint {
  let checkpoint: ReportV4AdmissionCheckpoint = {
    version: 1,
    snapshotId: config.identity.id,
    reportId: config.identity.reportId,
    siteKey: config.identity.siteKey,
    collectorConfigIdentityHash: config.identity.collectorConfigIdentityHash,
    capturedAt: config.identity.capturedAt.toISOString(),
    targetUrl: config.targetUrl,
    deadlineAt: new Date(config.identity.capturedAt.getTime() + config.deadlineMs).toISOString(),
    queue: [],
    knownUrlKeys: [],
    visitedUrlKeys: [],
    pages: []
  };
  checkpoint = enqueueDiscovered(checkpoint, config.initialCandidates);
  return checkpoint;
}

function validateCheckpoint(
  checkpoint: ReportV4AdmissionCheckpoint,
  config: Required<ReportV4AdmissionRuntimeConfig>
): ReportV4AdmissionCheckpoint {
  const expectedDeadline = new Date(config.identity.capturedAt.getTime() + config.deadlineMs).toISOString();
  if (checkpoint.version !== 1 || checkpoint.snapshotId !== config.identity.id ||
      checkpoint.reportId !== config.identity.reportId || checkpoint.siteKey !== config.identity.siteKey ||
      checkpoint.collectorConfigIdentityHash !== config.identity.collectorConfigIdentityHash ||
      checkpoint.capturedAt !== config.identity.capturedAt.toISOString() || checkpoint.targetUrl !== config.targetUrl ||
      checkpoint.deadlineAt !== expectedDeadline || !Array.isArray(checkpoint.queue) ||
      !Array.isArray(checkpoint.knownUrlKeys) || !Array.isArray(checkpoint.visitedUrlKeys) ||
      !Array.isArray(checkpoint.pages)) {
    throw new Error("The V4 admission checkpoint identity or shape is invalid.");
  }
  assertCheckpointInvariants(checkpoint);
  return structuredClone(checkpoint);
}

function assertCheckpointInvariants(checkpoint: ReportV4AdmissionCheckpoint): void {
  const known = normalizedUniqueUrlSet(checkpoint.knownUrlKeys, "known URL");
  const visited = normalizedUniqueUrlSet(checkpoint.visitedUrlKeys, "visited URL");
  const queueUrls = checkpoint.queue.map((candidate) => {
    if (!candidate || typeof candidate.url !== "string" || candidate.siteUrl !== checkpoint.targetUrl) {
      throw new Error("The V4 admission checkpoint queue identity is invalid.");
    }
    const key = candidateKeyOrNull(candidate.url);
    if (!key || key !== candidate.url) throw new Error("The V4 admission checkpoint queue URL is not normalized HTTP(S).");
    return key;
  });
  assertUniqueCheckpointValues(queueUrls, "queue URL");
  const queue = new Set(queueUrls);
  for (const key of queue) {
    if (!known.has(key) || visited.has(key)) throw new Error("The V4 admission checkpoint queue lineage is invalid.");
  }
  for (const key of visited) {
    if (!known.has(key)) throw new Error("The V4 admission checkpoint visited lineage is invalid.");
  }

  const pageUrls: string[] = [];
  let analyzablePages = 0;
  checkpoint.pages.forEach((page, index) => {
    if (!page || page.ordinal !== index + 1 || typeof page.normalizedUrl !== "string") {
      throw new Error("The V4 admission checkpoint page ordinal lineage is invalid.");
    }
    const key = candidateKeyOrNull(page.normalizedUrl);
    if (!key || key !== page.normalizedUrl || !known.has(key) || queue.has(key)) {
      throw new Error("The V4 admission checkpoint page URL lineage is invalid.");
    }
    pageUrls.push(key);
    if (page.analyzable) {
      analyzablePages += 1;
      if (typeof page.retainedText !== "string" || !page.retainedText.trim() ||
          page.retainedText.length > RETAINED_TEXT_LIMIT || page.contentHash !== sha(page.retainedText) ||
          typeof page.summary !== "string" || page.summary.length > SUMMARY_LIMIT) {
        throw new Error("The V4 admission checkpoint retained-text evidence is invalid.");
      }
    } else if (page.retainedText != null) {
      throw new Error("An excluded V4 admission checkpoint page cannot retain cleaned text.");
    }
  });
  assertUniqueCheckpointValues(pageUrls, "page URL");
  if (analyzablePages > CUSTOM_SERVICE_PAGE_COUNT) {
    throw new Error("The V4 admission checkpoint exceeds the 51-page analyzable threshold.");
  }
}

function normalizedUniqueUrlSet(values: readonly string[], field: string): Set<string> {
  const normalized = values.map((value) => {
    const key = typeof value === "string" ? candidateKeyOrNull(value) : null;
    if (!key || key !== value) throw new Error(`The V4 admission checkpoint ${field} is not normalized HTTP(S).`);
    return key;
  });
  assertUniqueCheckpointValues(normalized, field);
  return new Set(normalized);
}

function assertUniqueCheckpointValues(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`The V4 admission checkpoint ${field} values are not unique.`);
}

function enqueueDiscovered(
  checkpoint: ReportV4AdmissionCheckpoint,
  candidates: ReadonlyArray<ReportV4SiteCandidate>
): ReportV4AdmissionCheckpoint {
  const known = new Set(checkpoint.knownUrlKeys);
  const visited = new Set(checkpoint.visitedUrlKeys);
  const queue = [...checkpoint.queue];
  for (const candidate of candidates) {
    const key = candidateKeyOrNull(candidate.url);
    if (!key || known.has(key) || visited.has(key)) continue;
    known.add(key);
    queue.push({ ...candidate, siteUrl: checkpoint.targetUrl, url: key });
  }
  return { ...checkpoint, queue, knownUrlKeys: [...known] };
}

function appendCollectionResult(
  checkpoint: ReportV4AdmissionCheckpoint,
  result: ReportV4SiteCollectionResult,
  snapshotId: string
): ReportV4AdmissionCheckpoint {
  const pages = [...checkpoint.pages];
  const persistedUrls = new Set(pages.map((page) => page.normalizedUrl));
  for (const page of result.pages) {
    const normalizedUrl = normalizedHttpUrl(page.normalizedUrl);
    if (!normalizedUrl || persistedUrls.has(normalizedUrl)) continue;
    persistedUrls.add(normalizedUrl);
    pages.push({
      id: pageId(snapshotId, normalizedUrl),
      ordinal: pages.length + 1,
      normalizedUrl,
      analyzable: true,
      readMode: page.readability,
      summary: summarize(page.analyzableText),
      retainedText: page.analyzableText,
      contentHash: sha(page.analyzableText),
      exclusionReason: null
    });
  }
  for (const exclusion of result.exclusions) {
    const normalizedUrl = normalizedHttpUrl(exclusion.normalizedUrl ?? exclusion.url);
    if (!normalizedUrl || persistedUrls.has(normalizedUrl)) continue;
    persistedUrls.add(normalizedUrl);
    pages.push({
      id: pageId(snapshotId, normalizedUrl),
      ordinal: pages.length + 1,
      normalizedUrl,
      analyzable: false,
      readMode: null,
      summary: null,
      retainedText: null,
      contentHash: null,
      exclusionReason: exclusion.reason
    });
  }
  const evidenceUrls = new Set(pages.map((page) => page.normalizedUrl));
  return {
    ...checkpoint,
    queue: checkpoint.queue.filter(({ url }) => !evidenceUrls.has(candidateKey(url))),
    knownUrlKeys: unique([...checkpoint.knownUrlKeys, ...evidenceUrls]),
    pages
  };
}

function appendDeadlineGaps(checkpoint: ReportV4AdmissionCheckpoint): ReportV4AdmissionCheckpoint {
  const persistedUrls = new Set(checkpoint.pages.map((page) => page.normalizedUrl));
  const pages = [...checkpoint.pages];
  for (const candidate of checkpoint.queue) {
    const normalizedUrl = normalizedHttpUrl(candidate.url);
    if (!normalizedUrl || persistedUrls.has(normalizedUrl)) continue;
    persistedUrls.add(normalizedUrl);
    pages.push({
      id: pageId(checkpoint.snapshotId, normalizedUrl),
      ordinal: pages.length + 1,
      normalizedUrl,
      analyzable: false,
      readMode: null,
      summary: null,
      retainedText: null,
      contentHash: null,
      exclusionReason: "deadline_exceeded"
    });
  }
  return {
    ...checkpoint,
    queue: checkpoint.queue.filter(({ url }) => !persistedUrls.has(candidateKey(url))),
    pages
  };
}

async function finalizeAndReturn(
  checkpoint: ReportV4AdmissionCheckpoint,
  identity: ReportV4SiteSnapshotIdentityInput,
  dependencies: ReportV4AdmissionRuntimeDependencies,
  now: () => Date,
  forcedStatus?: FinalizeReportV4PreAdmissionSnapshotInput["status"]
): Promise<ScanJobCoverage> {
  const analyzable = analyzableCount(checkpoint.pages);
  const excluded = checkpoint.pages.length - analyzable;
  const status = forcedStatus ?? (analyzable === 0
    ? "unavailable"
    : excluded > 0 ? "completed_limited" : "completed");
  const input: FinalizeReportV4PreAdmissionSnapshotInput = {
    ...identity,
    status,
    completedAt: now(),
    contentIdentityHash: sha(JSON.stringify({
      status,
      candidateUrlCount: checkpoint.knownUrlKeys.length,
      pages: checkpoint.pages
    })),
    candidateUrlCount: checkpoint.knownUrlKeys.length,
    pages: checkpoint.pages
  };
  const persisted = await dependencies.snapshots.finalize(input);
  return coverageFromBundle(persisted);
}

function coverageFromBundle(bundle: ReportV4SiteSnapshotBundle): ScanJobCoverage {
  return {
    plannedPages: bundle.snapshot.candidateUrlCount,
    successfulPages: bundle.snapshot.analyzablePageCount,
    failedPages: bundle.snapshot.excludedPageCount
  };
}

function analyzableCount(pages: readonly ReportV4SiteSnapshotPageInput[]): number {
  return pages.filter(({ analyzable }) => analyzable).length;
}

function summarize(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, SUMMARY_LIMIT);
}

function pageId(snapshotId: string, normalizedUrl: string): string {
  return `v4-page-${sha(`${snapshotId}\n${normalizedUrl}`)}`;
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function candidateKey(value: string): string {
  const key = candidateKeyOrNull(value);
  if (!key) throw new Error("A queued V4 admission candidate must be HTTP(S).");
  return key;
}

function candidateKeyOrNull(value: string): string | null {
  const normalized = normalizedHttpUrl(value);
  if (!normalized) return null;
  const parsed = new URL(normalized);
  parsed.hash = "";
  return parsed.toString();
}

function normalizedHttpUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function throwIfExecutionInterrupted(signal: AbortSignal, remainingMs: () => number): void {
  if (signal.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("V4 admission was aborted.");
  if (remainingMs() <= 0) throw new Error("The worker lease expired during V4 admission.");
}

function deadlineBoundSignal(callerSignal: AbortSignal, remainingMs: number): {
  signal: AbortSignal;
  isDeadlineAbort: (error: unknown) => boolean;
  dispose: () => void;
} {
  const controller = new AbortController();
  const deadlineReason = new Error("The V4 admission collection deadline expired.");
  const onCallerAbort = () => controller.abort(callerSignal.reason);
  callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  if (callerSignal.aborted) onCallerAbort();
  const timer = setTimeout(() => {
    controller.abort(deadlineReason);
  }, remainingMs);
  return {
    signal: controller.signal,
    isDeadlineAbort: (error) => controller.signal.aborted && controller.signal.reason === deadlineReason && error === deadlineReason,
    dispose: () => {
      clearTimeout(timer);
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  };
}

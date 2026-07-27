import { createHash } from "node:crypto";
import {
  createReportV4AdmissionCollectorDependencies,
  discoverReportV4AdmissionSite,
  type ReportV4AdmissionDiscovery
} from "../worker/crawler-runtime";
import {
  createReportV4AdmissionRunner,
  type ReportV4AdmissionCheckpoint,
  type ReportV4AdmissionRuntimeDependencies
} from "../worker/report-v4-admission-runtime";
import type { ReportV4SiteCollectorDependencies } from "../worker/report-v4-site-collector";
import type { RobotsPolicy } from "@open-geo-console/site-crawler";
import { createSafeFetch, type SafeFetchOptions } from "../server/safe-fetch";

type FinalSnapshotInput = Parameters<ReportV4AdmissionRuntimeDependencies["snapshots"]["finalize"]>[0];
type TerminalBundle = Awaited<ReturnType<ReportV4AdmissionRuntimeDependencies["snapshots"]["finalize"]>>;

export interface StagingV4AdmissionProbeInput {
  targetUrl: string;
  expectedSiteKey: string;
  expectedText: string;
  expectedAnalyzablePages: number;
  maxReads: number;
  maxElapsedMs: number;
}

interface ProbeObservation {
  status: string;
  candidateCount: number;
  analyzablePages: number;
  excludedPages: number;
  distinctContentHashes: number;
  rawHttpReads: number;
  browserReads: number;
  expectedTextMatched: boolean;
  siteKey?: string;
}

export function createReadBudget(maxReads: number) {
  let rawHttpReads = 0; let browserReads = 0;
  const claim = () => {
    if (rawHttpReads + browserReads >= maxReads) throw new Error("The no-commerce probe read budget was exhausted.");
  };
  return {
    beforeRawRequest: () => { claim(); rawHttpReads += 1; },
    wrapBrowser: <T>(render: (url: string, signal?: AbortSignal) => Promise<T>) => async (url: string, signal?: AbortSignal) => {
      claim(); browserReads += 1; return render(url, signal);
    },
    counts: () => ({ rawHttpReads, browserReads })
  };
}

export interface StagingV4AdmissionProbeDependencies {
  nowMs: () => number;
  scheduleTimeout: (callback: () => void, delayMs: number) => () => void;
  createSafeFetch: (options: Pick<SafeFetchOptions, "beforeRequest">) => typeof fetch;
  discover: (targetUrl: string, signal: AbortSignal, fetchImpl?: typeof fetch) => Promise<ReportV4AdmissionDiscovery>;
  createCollector: (input: { targetUrl: string; robotsPolicy: RobotsPolicy; fetchImpl: typeof fetch }) => ReportV4SiteCollectorDependencies;
  runAdmission: (input: { discovery: ReportV4AdmissionDiscovery; collector: ReportV4SiteCollectorDependencies; expectedText: string; nowMs: () => number; signal: AbortSignal; startedAt: number; maxElapsedMs: number }) => Promise<ProbeObservation>;
}

export function assertProbeEnvironment(env: Record<string, string | undefined>): void {
  if ("DATABASE_URL" in env || env.OGC_DEPLOYMENT_PROFILE !== "staging" ||
      env.VERCEL_ENV !== "preview" || env.COMMERCE_MODE !== "test") {
    throw new Error("The no-commerce probe requires staging, preview, test commerce mode, and no DATABASE_URL.");
  }
}

export async function runStagingV4AdmissionNoCommerceProbe(
  input: StagingV4AdmissionProbeInput,
  dependencies: StagingV4AdmissionProbeDependencies = createDefaultProbeDependencies()
): Promise<ProbeObservation & { ok: true; siteKey: string; elapsedMs: number }> {
  validateInput(input);
  const startedAt = dependencies.nowMs();
  const controller = new AbortController();
  const cancelTimeout = dependencies.scheduleTimeout(() => controller.abort(new Error("The no-commerce probe timed out.")), input.maxElapsedMs);
  const reads = createReadBudget(input.maxReads);
  try {
    const safeFetch = dependencies.createSafeFetch({ beforeRequest: reads.beforeRawRequest });
    const discovery = await dependencies.discover(input.targetUrl, controller.signal, safeFetch);
    const baseCollector = dependencies.createCollector({ targetUrl: discovery.targetUrl, robotsPolicy: discovery.robotsPolicy, fetchImpl: safeFetch });
    const collector = { ...baseCollector, renderBrowserHtml: reads.wrapBrowser(baseCollector.renderBrowserHtml) };
    const observed = await dependencies.runAdmission({ discovery, collector, expectedText: input.expectedText, nowMs: dependencies.nowMs, signal: controller.signal, startedAt, maxElapsedMs: input.maxElapsedMs });
    const elapsedMs = dependencies.nowMs() - startedAt;
    const counted = reads.counts();
    const result = { ...observed, rawHttpReads: counted.rawHttpReads || observed.rawHttpReads, browserReads: counted.browserReads || observed.browserReads, siteKey: observed.siteKey ?? discovery.siteKey, elapsedMs, ok: true as const };
    assertProbeExpectations(input, result);
    return result;
  } finally {
    cancelTimeout();
  }
}

export function createDefaultProbeDependencies(): StagingV4AdmissionProbeDependencies {
  return {
    nowMs: Date.now,
    scheduleTimeout: (callback, delayMs) => { const timer = setTimeout(callback, delayMs); return () => clearTimeout(timer); },
    createSafeFetch,
    discover: (targetUrl, signal, fetchImpl) => discoverReportV4AdmissionSite(targetUrl, signal, fetchImpl),
    createCollector: createReportV4AdmissionCollectorDependencies,
    async runAdmission({ discovery, collector, expectedText, nowMs, signal, startedAt, maxElapsedMs }) {
      let checkpoint: ReportV4AdmissionCheckpoint | undefined;
      let terminal: TerminalBundle | undefined;
      const capturedAt = new Date(startedAt);
      const identity = {
        id: "staging-v4-admission-no-commerce-probe",
        reportId: "staging-v4-admission-no-commerce-probe",
        siteKey: discovery.siteKey,
        collectorConfigIdentityHash: createHash("sha256").update("staging-v4-admission-no-commerce-probe/v1").digest("hex"),
        capturedAt
      };
      const runner = createReportV4AdmissionRunner({
        identity,
        targetUrl: discovery.targetUrl,
        initialCandidates: discovery.candidates,
        deadlineMs: maxElapsedMs
      }, {
        checkpoints: {
          load: async () => checkpoint ?? null,
          save: async (_id, value) => { checkpoint = structuredClone(value); }
        },
        snapshots: {
          load: async () => terminal ? { snapshot: terminal.snapshot, pages: terminal.pages } : null,
          begin: async () => ({ ...identity, status: "collecting" as const }),
          finalize: async (value: FinalSnapshotInput) => {
            const analyzablePageCount = value.pages.filter((page) => page.analyzable).length;
            terminal = {
              snapshot: {
                ...value,
                analyzablePageCount,
                excludedPageCount: value.pages.length - analyzablePageCount,
                createdAt: value.capturedAt
              },
              pages: value.pages.map((page) => ({ ...page, snapshotId: value.id, retainedText: page.retainedText ?? null, createdAt: value.capturedAt }))
            };
            return terminal;
          }
        },
        collector,
        now: () => new Date(nowMs())
      });
      await runner({
        job: { id: "staging-v4-admission-no-commerce-probe", reportId: identity.reportId } as never,
        signal,
        remainingMs: () => Math.max(0, maxElapsedMs - (nowMs() - startedAt))
      });
      if (!terminal) throw new Error("The no-commerce probe did not produce an in-memory terminal snapshot.");
      const hashes = new Set(terminal.pages.flatMap((page) => page.analyzable && page.contentHash ? [page.contentHash] : []));
      return {
        status: terminal.snapshot.status,
        candidateCount: terminal.snapshot.candidateUrlCount,
        analyzablePages: terminal.snapshot.analyzablePageCount,
        excludedPages: terminal.snapshot.excludedPageCount,
        distinctContentHashes: hashes.size,
        rawHttpReads: 0,
        browserReads: 0,
        expectedTextMatched: terminal.pages.some((page) => page.retainedText?.includes(expectedText))
      };
    }
  };
}

function assertProbeExpectations(input: StagingV4AdmissionProbeInput, result: ProbeObservation & { siteKey: string; elapsedMs: number }): void {
  if (result.status !== "completed" || result.siteKey !== input.expectedSiteKey ||
      result.analyzablePages !== input.expectedAnalyzablePages ||
      result.distinctContentHashes !== input.expectedAnalyzablePages || !result.expectedTextMatched ||
      result.candidateCount > input.maxReads || result.rawHttpReads + result.browserReads > input.maxReads || result.elapsedMs > input.maxElapsedMs) {
    throw new Error("The no-commerce probe expectation did not match the bounded admission result.");
  }
}

function validateInput(input: StagingV4AdmissionProbeInput): void {
  if (!/^https:\/\//.test(input.targetUrl) || !input.expectedSiteKey || !input.expectedText ||
      !Number.isInteger(input.expectedAnalyzablePages) || input.expectedAnalyzablePages < 1 ||
      !Number.isInteger(input.maxReads) || input.maxReads < 1 || !Number.isInteger(input.maxElapsedMs) || input.maxElapsedMs < 1) {
    throw new Error("The no-commerce probe CLI expectations are invalid.");
  }
}

function parseCli(argv: readonly string[]): StagingV4AdmissionProbeInput {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values.has(key)) throw new Error("The no-commerce probe CLI arguments are invalid.");
    values.set(key, value);
  }
  const text = (key: string) => values.get(key) ?? "";
  return {
    targetUrl: text("--target"), expectedSiteKey: text("--expected-site-key"), expectedText: text("--expected-text"),
    expectedAnalyzablePages: Number(text("--expected-analyzable-pages")), maxReads: Number(text("--max-reads")), maxElapsedMs: Number(text("--max-elapsed-ms"))
  };
}

export async function executeProbeCli(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  write: (line: string) => void,
  dependencies?: StagingV4AdmissionProbeDependencies
): Promise<void> {
  try {
    assertProbeEnvironment(env);
    const result = await runStagingV4AdmissionNoCommerceProbe(parseCli(argv), dependencies);
    write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    write(`${JSON.stringify({ ok: false, error: "probe_failed" })}\n`);
    throw error;
  }
}

if (process.argv[1]?.endsWith("staging-v4-admission-no-commerce-probe.ts")) {
  executeProbeCli(process.argv.slice(2), process.env, (line) => process.stdout.write(line)).catch(() => {
    process.exitCode = 1;
  });
}

import type { ReportV4PageAnalysisContext, ReportV4PageSummary } from "@open-geo-console/ai-report-engine";
import { createHash } from "node:crypto";
import {
  loadReportV4PageSummaryByExactLineage,
  type ReportV4PageSummaryRepository,
  type LoadReportV4PageSummaryByLineageInput
} from "../db/report-v4-page-summaries";
import {
  createReportV4MimoSiteSynthesisProvider,
  ReportV4MimoSiteSynthesisOutputError,
  type ReportV4MimoSiteSynthesisProvider
} from "../report-v4/mimo-site-synthesis-provider";
import {
  MIMO_CONTENT_FILTERED_CODE,
  MIMO_INVALID_RESPONSE_CODE,
  MIMO_OUTPUT_TRUNCATED_CODE,
  MIMO_TIMEOUT_CODE,
  ReportV4MimoProviderError,
  type ProviderDependencies
} from "../report-v4/mimo-provider";

export interface ReportV4ProductionPageAnalysisInput {
  readonly reportId: string;
  readonly siteSnapshotId: string;
  readonly pageId: string;
  readonly url: string;
  readonly contentHash: string;
  readonly readability: "direct_readable" | "js_dependent";
  readonly sourceLength: number;
  readonly retainedText: string;
  readonly snapshotContentIdentityHash: string;
  readonly signal: AbortSignal;
}

export interface ReportV4ProductionPageAnalysisDependencies {
  readonly repository: ReportV4PageSummaryRepository;
  readonly provider: Pick<ReportV4MimoSiteSynthesisProvider, "analyzePage">;
  readonly loadExactSummary?: (input: LoadReportV4PageSummaryByLineageInput) => Promise<ReportV4PageSummary | null>;
  readonly persist?: ReportV4PageSummaryRepository["persist"];
}

export interface ReportV4ProductionPageAnalysisResult {
  readonly summary: ReportV4PageSummary;
  readonly providerCalls: 0 | 1 | 2;
  readonly reused: boolean;
}

const MAX_PAGE_ANALYSIS_PROVIDER_ATTEMPTS = 2;

export class ReportV4PageAnalysisUnavailableError extends Error {
  readonly providerCalls: 1 | 2;

  constructor(providerCalls: 1 | 2, cause: unknown) {
    super("The V4 page-analysis provider was unavailable after its configured attempts.", { cause });
    this.name = "ReportV4PageAnalysisUnavailableError";
    this.providerCalls = providerCalls;
  }
}

export function createReportV4ProductionPageAnalysis(
  dependencies: ReportV4ProductionPageAnalysisDependencies
) {
  const loadExact = dependencies.loadExactSummary ?? ((input) => loadReportV4PageSummaryByExactLineage(input, dependencies.repository));
  const persist = dependencies.persist ?? dependencies.repository.persist.bind(dependencies.repository);
  return async function run(input: ReportV4ProductionPageAnalysisInput): Promise<ReportV4ProductionPageAnalysisResult> {
    validateInput(input);
    input.signal.throwIfAborted();
    const existing = await loadExact({ reportId: input.reportId, snapshotId: input.siteSnapshotId, pageUrl: input.url, contentHash: input.contentHash, snapshotContentIdentityHash: input.snapshotContentIdentityHash });
    input.signal.throwIfAborted();
    if (existing) return Object.freeze({ summary: existing, providerCalls: 0, reused: true });

    const context: ReportV4PageAnalysisContext = {
      pageId: input.pageId,
      url: input.url,
      contentHash: input.contentHash,
      readability: input.readability,
      sourceLength: input.sourceLength
    };
    let analyzed: ReportV4PageSummary | null = null;
    let providerCalls: 0 | 1 | 2 = 0;
    for (let attempt = 1; attempt <= MAX_PAGE_ANALYSIS_PROVIDER_ATTEMPTS; attempt += 1) {
      input.signal.throwIfAborted();
      providerCalls = attempt as 1 | 2;
      try {
        analyzed = await dependencies.provider.analyzePage({ context, retainedText: input.retainedText }, input.signal);
        break;
      } catch (error) {
        input.signal.throwIfAborted();
        if (!isPageAnalysisProviderFailure(error)) {
          throw error;
        }
        if (attempt === MAX_PAGE_ANALYSIS_PROVIDER_ATTEMPTS) {
          throw new ReportV4PageAnalysisUnavailableError(providerCalls, error);
        }
      }
    }
    if (!analyzed) throw new Error("The V4 page-analysis provider returned no validated output.");
    input.signal.throwIfAborted();
    if (analyzed.pageId !== input.pageId || analyzed.url !== input.url || analyzed.contentHash !== input.contentHash
      || analyzed.readability !== input.readability || analyzed.sourceLength !== input.sourceLength) {
      throw new Error("The V4 page-analysis provider returned drifted page identity.");
    }
    const canonicalChunks = analyzed.chunks.map((chunk) => Object.freeze({
      ...chunk,
      sourceLocations: Object.freeze(chunk.sourceLocations.map((location, locationIndex) => Object.freeze({
        ...location,
        locationId: canonicalLocationId(input.pageId, chunk.order, locationIndex + 1)
      })))
    }));
    const persisted = await persist({
      reportId: input.reportId,
      snapshotId: input.siteSnapshotId,
      pageId: input.pageId,
      url: input.url,
      contentHash: input.contentHash,
      readability: input.readability,
      sourceLength: input.sourceLength,
      output: { chunks: canonicalChunks }
    });
    return Object.freeze({ summary: persisted.summary, providerCalls, reused: false });
  };
}

function isPageAnalysisProviderFailure(error: unknown): boolean {
  if (error instanceof ReportV4MimoSiteSynthesisOutputError) return true;
  if (!(error instanceof ReportV4MimoProviderError)) return false;
  return error.code === "transport"
    || error.code === "rate_limited"
    || error.code === "temporary_provider"
    || error.code === MIMO_INVALID_RESPONSE_CODE
    || error.code === MIMO_OUTPUT_TRUNCATED_CODE
    || error.code === MIMO_CONTENT_FILTERED_CODE
    || error.code === MIMO_TIMEOUT_CODE;
}

function canonicalLocationId(pageId: string, chunkOrder: number, locationOrder: number): string {
  const pageIdentity = createHash("sha256").update(pageId).digest("hex");
  return `location-${pageIdentity}-${chunkOrder}-${locationOrder}`;
}

export function createReportV4ProductionPageAnalysisWithLockedProfile(input: {
  readonly environment: NodeJS.ProcessEnv;
  readonly lockedModelProfile: unknown;
  readonly repository: ReportV4PageSummaryRepository;
}): ReturnType<typeof createReportV4ProductionPageAnalysis> {
  const providerDependencies: ProviderDependencies = {
    environment: input.environment,
    lockedModelProfile: input.lockedModelProfile
  };
  return createReportV4ProductionPageAnalysis({
    repository: input.repository,
    provider: createReportV4MimoSiteSynthesisProvider(providerDependencies)
  });
}

function validateInput(input: ReportV4ProductionPageAnalysisInput): void {
  if (!input || typeof input !== "object") throw new TypeError("V4 page analysis input is required.");
  for (const [key, value] of [["reportId", input.reportId], ["siteSnapshotId", input.siteSnapshotId], ["pageId", input.pageId], ["url", input.url], ["contentHash", input.contentHash], ["snapshotContentIdentityHash", input.snapshotContentIdentityHash]] as const) {
    if (typeof value !== "string" || !value.trim() || value.length > 512) throw new TypeError(`${key} must be bounded text.`);
  }
  if (!/^https?:\/\//u.test(input.url) || !/^[a-f0-9]{64}$/u.test(input.contentHash) || !/^[a-f0-9]{64}$/u.test(input.snapshotContentIdentityHash)) {
    throw new TypeError("V4 page analysis identity is invalid.");
  }
  if (!Number.isSafeInteger(input.sourceLength) || input.sourceLength < 1 || input.sourceLength > 100_000 || input.retainedText.length !== input.sourceLength) {
    throw new TypeError("V4 retained page text length is invalid.");
  }
  if (!input.retainedText.trim()) throw new TypeError("V4 retained page text is required.");
  if (input.readability !== "direct_readable" && input.readability !== "js_dependent") throw new TypeError("V4 readability is invalid.");
  if (!(input.signal instanceof AbortSignal)) throw new TypeError("V4 abort signal is required.");
}

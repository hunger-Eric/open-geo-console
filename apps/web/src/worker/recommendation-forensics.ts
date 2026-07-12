import { createHash } from "node:crypto";
import {
  classifyCommercialCoverage,
  createAnswerEngineSurfaceKey,
  createAnswerSnapshotRunId,
  generatePurchaseQuestions,
  observeAnswerMatrix,
  type AnswerEngineAdapter,
  type AnswerEngineRegistry,
  type AnswerExecutionCheckpoint,
  type AnswerExecutionStateLedger,
  type AnswerSnapshotCell,
  type AnswerSnapshotRunContract,
  type CertificationAuthoritySnapshot,
  type CommercialCoverageDecision,
  type ProviderExecutionBudget
} from "@open-geo-console/answer-engine-observer";
import { assessEvidenceGrade, categorizeSource } from "@open-geo-console/citation-intelligence";
import {
  extractReadableText,
  isAllowedByRobots,
  parseRobotsTxt,
  type HostnameResolver
} from "@open-geo-console/site-crawler";
import type {
  AiWebsiteReportV1,
  RecommendationForensicReportV1,
  SourceClassificationAuthoritySnapshot
} from "@open-geo-console/ai-report-engine";
import {
  compareAndSwapAnswerExecutionCheckpoint,
  getAnswerExecutionCheckpoint,
  getRecommendationForensicReportForJob,
  saveRecommendationForensicReport
} from "@/db/recommendation-authority";
import {
  createAnswerSnapshotRun,
  getAnswerSnapshotBundleForJob,
  saveCitationSourceEvidenceImmutable,
  type AnswerSnapshotBundleForJob,
  type CitationSourceEvidenceInput
} from "@/db/recommendation-forensics";
import { createSafeFetch } from "@/server/safe-fetch";
import { recommendationRuntimeMatchesAuthority } from "@/recommendation-forensics/product-availability";

export interface RecommendationReportBuilderInput {
  reportId: string;
  jobId: string;
  targetUrl: string;
  websiteFoundation: AiWebsiteReportV1;
  questions: ReturnType<typeof generatePurchaseQuestions>;
  snapshotBundle: AnswerSnapshotBundleForJob;
  coverage: CommercialCoverageDecision;
  certificationAuthority: CertificationAuthoritySnapshot;
  sourceClassificationAuthority: SourceClassificationAuthoritySnapshot;
}

export interface RecommendationReportBuilder {
  build(input: RecommendationReportBuilderInput): Promise<unknown>;
}

export interface RecommendationForensicsDependencies {
  adapters: AnswerEngineAdapter[];
  registry: AnswerEngineRegistry;
  certificationAuthority: CertificationAuthoritySnapshot;
  sourceClassificationAuthority: SourceClassificationAuthoritySnapshot;
  builder: RecommendationReportBuilder;
  budgets?: Record<string, ProviderExecutionBudget>;
  retrieveSource?: typeof retrieveCitationSource;
  persistence?: {
    createRun: typeof createAnswerSnapshotRun;
    getBundle: typeof getAnswerSnapshotBundleForJob;
    getCheckpoint: typeof getAnswerExecutionCheckpoint;
    compareAndSwap: (checkpoint: AnswerExecutionCheckpoint) => Promise<AnswerExecutionStateLedger>;
    saveEvidence: (input: CitationSourceEvidenceInput) => Promise<unknown>;
    getReport: (jobId: string) => Promise<RecommendationForensicReportV1 | null>;
    saveReport: (input: unknown) => Promise<RecommendationForensicReportV1>;
  };
}

export interface RecommendationForensicsPipelineResult {
  coverage: CommercialCoverageDecision;
  report: RecommendationForensicReportV1;
  runId: string;
}

export async function runRecommendationForensicsPipeline(input: {
  reportId: string;
  jobId: string;
  locale: "en" | "zh";
  region: string;
  targetUrl: string;
  websiteFoundation: AiWebsiteReportV1;
  dependencies: RecommendationForensicsDependencies;
}): Promise<RecommendationForensicsPipelineResult> {
  const persist = input.dependencies.persistence ?? defaultPersistence;
  const persistedReport = await persist.getReport(input.jobId);
  if (persistedReport) {
    return {
      coverage: persistedReport.answerSnapshotMatrix.commercialCoverage,
      report: persistedReport,
      runId: persistedReport.answerSnapshotMatrix.run.id
    };
  }
  if (input.dependencies.adapters.length === 0) throw new RecommendationRuntimeUnavailableError("No answer-engine adapter is installed.");
  assertAdaptersMatchAuthority(
    input.dependencies.registry, input.dependencies.adapters, input.dependencies.certificationAuthority
  );
  const profile = input.websiteFoundation.organizationProfile;
  if (!profile.organizationName) throw new RecommendationQuestionGenerationError();
  const questions = generatePurchaseQuestions({
    locale: input.locale,
    organizationName: profile.organizationName,
    brandAliases: profile.brandNames,
    categories: profile.productsAndServices,
    capabilities: profile.productsAndServices,
    audiences: profile.targetAudiences,
    useCases: profile.businessModel ? [profile.businessModel] : [],
    sourceUrls: profile.evidence.map(({ url }) => url)
  });
  if (questions.confidence === "low") throw new RecommendationQuestionGenerationError();
  const run: AnswerSnapshotRunContract = {
    id: createAnswerSnapshotRunId({
      reportId: input.reportId, jobId: input.jobId, locale: input.locale, region: input.region,
      questionSetVersion: questions.version, runKey: "recommendation-forensics-v1"
    }),
    reportId: input.reportId, jobId: input.jobId, locale: input.locale, region: input.region,
    questionSetVersion: questions.version, startedAt: stableRunStartedAt(input.jobId)
  };
  await persist.createRun(run);
  const existingBundle = await persist.getBundle(input.jobId);
  const existingRun = existingBundle?.runs.find(({ run: candidate }) => candidate.id === run.id);
  const existingCells = (existingRun?.cells ?? []).map(stripStoredSourceFields);
  const checkpoint = await persist.getCheckpoint(run.id);
  const observed = await observeAnswerMatrix({
    run, questions: questions.questions, adapters: input.dependencies.adapters,
    existingCells, existingExecutionState: checkpoint ?? undefined,
    expectedCheckpointRevision: checkpoint?.checkpointRevision ?? 0,
    budgets: input.dependencies.budgets,
    persistCheckpoint: async (next) => { await persist.compareAndSwap(next); }
  });
  if (observed.pendingCellIds.length > 0) throw new RecommendationObservationIncompleteError();
  await persistMissingSourceEvidence(
    observed.cells, existingBundle, input.dependencies.sourceClassificationAuthority,
    input.dependencies.retrieveSource ?? retrieveCitationSource, persist.saveEvidence
  );
  const bundle = await persist.getBundle(input.jobId);
  if (!bundle) throw new RecommendationObservationIncompleteError();
  const coverage = classifyCommercialCoverage(
    questions.questions, observed.cells, input.dependencies.certificationAuthority
  );
  const proposed = await input.dependencies.builder.build({
    reportId: input.reportId, jobId: input.jobId, targetUrl: input.targetUrl,
    websiteFoundation: input.websiteFoundation, questions, snapshotBundle: bundle, coverage,
    certificationAuthority: input.dependencies.certificationAuthority,
    sourceClassificationAuthority: input.dependencies.sourceClassificationAuthority
  });
  const report = await persist.saveReport(proposed);
  if (report.jobId !== input.jobId || report.reportId !== input.reportId ||
      report.answerSnapshotMatrix.commercialCoverage.outcome !== coverage.outcome) {
    throw new RecommendationReportOutcomeMismatchError();
  }
  return { coverage, report, runId: run.id };
}

export async function retrieveCitationSource(url: string, options: {
  fetchImpl?: typeof fetch;
  resolver?: HostnameResolver;
} = {}): Promise<{
  retrievalState: "available" | "inaccessible";
  excerpt: string | null;
  excerptHash: string | null;
  contentHash: string | null;
}> {
  try {
    const robotsFetch = createSafeFetch({
      fetchImpl: options.fetchImpl, resolver: options.resolver, maxBytes: 256_000, timeoutMs: 10_000
    });
    const policies = new Map<string, ReturnType<typeof parseRobotsTxt>>();
    const response = await createSafeFetch({
      fetchImpl: options.fetchImpl, resolver: options.resolver, maxBytes: 512_000, timeoutMs: 10_000,
      beforeRequest: async (target) => {
        const origin = target.origin;
        let policy = policies.get(origin);
        if (!policy) {
          const robotsUrl = new URL("/robots.txt", origin);
          const robots = await robotsFetch(robotsUrl, { headers: { "user-agent": CITATION_CRAWLER_USER_AGENT } }).catch(() => null);
          policy = parseRobotsTxt(robots?.ok ? await robots.text() : "", robotsUrl, "OpenGeoConsoleBot");
          policies.set(origin, policy);
        }
        if (!isAllowedByRobots(target, policy)) throw new Error("robots.txt disallows this citation source.");
      }
    })(url, {
      headers: { accept: "text/html,text/plain,application/xhtml+xml;q=0.9", "user-agent": CITATION_CRAWLER_USER_AGENT }
    });
    if (!response.ok) return unavailableRetrieval();
    const raw = await response.text();
    const text = extractReadableText(raw, 20_000).replace(/\s+/g, " ").trim();
    if (!text) return unavailableRetrieval();
    const excerpt = text.slice(0, 1_000);
    return {
      retrievalState: "available", excerpt,
      excerptHash: sha256(excerpt), contentHash: sha256(text)
    };
  } catch {
    return unavailableRetrieval();
  }
}

async function persistMissingSourceEvidence(
  cells: AnswerSnapshotCell[],
  existingBundle: AnswerSnapshotBundleForJob | null,
  authority: SourceClassificationAuthoritySnapshot,
  retrieve: typeof retrieveCitationSource,
  save: (input: CitationSourceEvidenceInput) => Promise<unknown>
): Promise<void> {
  const existingSourceIds = new Set(
    (existingBundle?.runs ?? []).flatMap(({ cells: stored }) => stored.flatMap((cell) =>
      cell.status === "succeeded" ? cell.sources.filter(({ evidence }) => evidence).map(({ id }) => id) : []
    ))
  );
  for (const cell of cells) {
    if (cell.status !== "succeeded") continue;
    for (const source of cell.sources) {
      const sourceId = sha256([cell.id, source.url].join("\0"));
      if (existingSourceIds.has(sourceId)) continue;
      const retrieval = await retrieve(source.url);
      const category = categorizeSource(source.url, authority.context);
      const grade = assessEvidenceGrade({
        evidenceId: sha256([sourceId, "evidence-v1"].join("\0")), cellId: cell.id,
        sourceUrl: source.url, providerReturned: true, retrievalState: retrieval.retrievalState,
        verifiedExcerpt: retrieval.excerpt ?? undefined, directSupport: false, preciseMapping: false,
        relevantEntityEvidence: false, entityAmbiguous: false
      });
      const retrievedAt = new Date().toISOString();
      await save({
        id: sha256([sourceId, "evidence-v1"].join("\0")), sourceId, category,
        retrievalState: retrieval.retrievalState, excerpt: retrieval.excerpt,
        excerptHash: retrieval.excerptHash, contentHash: retrieval.contentHash, grade,
        retrievedAt, expiresAt: new Date(Date.parse(retrievedAt) + 30 * 24 * 60 * 60 * 1_000).toISOString()
      });
    }
  }
}

function stripStoredSourceFields(cell: AnswerSnapshotCell): AnswerSnapshotCell {
  if (cell.status !== "succeeded") return cell;
  return { ...cell, sources: cell.sources.map(({ url, title, providerOrder, providerMetadata }) => ({ url, title, providerOrder, providerMetadata })) };
}

function stableRunStartedAt(jobId: string): string {
  const seconds = Number.parseInt(sha256(jobId).slice(0, 8), 16);
  return new Date(Date.UTC(2020, 0, 1) + seconds * 1_000).toISOString();
}

function assertAdaptersMatchAuthority(
  registry: AnswerEngineRegistry,
  adapters: AnswerEngineAdapter[],
  authority: CertificationAuthoritySnapshot
): void {
  const certifiedKeys = new Set(authority.certifications.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  const adapterKeys = new Set(adapters.map(({ surface }) => createAnswerEngineSurfaceKey(surface)));
  if (!recommendationRuntimeMatchesAuthority(registry, authority) || adapterKeys.size !== certifiedKeys.size ||
      adapters.some(({ surface }) => surface.certificationState !== "certified" ||
        !certifiedKeys.has(createAnswerEngineSurfaceKey(surface)))) {
    throw new RecommendationRuntimeUnavailableError("The answer-engine runtime does not match its persisted certification authority.");
  }
}

function unavailableRetrieval() {
  return { retrievalState: "inaccessible" as const, excerpt: null, excerptHash: null, contentHash: null };
}

function sha256(value: string): string { return createHash("sha256").update(value).digest("hex"); }

const defaultPersistence = {
  createRun: createAnswerSnapshotRun,
  getBundle: getAnswerSnapshotBundleForJob,
  getCheckpoint: getAnswerExecutionCheckpoint,
  compareAndSwap: compareAndSwapAnswerExecutionCheckpoint,
  saveEvidence: saveCitationSourceEvidenceImmutable,
  getReport: getRecommendationForensicReportForJob,
  saveReport: saveRecommendationForensicReport
};

const CITATION_CRAWLER_USER_AGENT = "OpenGeoConsoleBot/1.0 (+https://github.com/open-geo-console)";

export class RecommendationRuntimeUnavailableError extends Error {}
export class RecommendationQuestionGenerationError extends Error {}
export class RecommendationObservationIncompleteError extends Error {}
export class RecommendationReportOutcomeMismatchError extends Error {
  constructor() { super("The recommendation report builder returned a mismatched product outcome."); }
}

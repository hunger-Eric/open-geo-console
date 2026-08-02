import {
  AI_REPORT_PROMPT_VERSION,
  REPORT_TIER_LIMITS,
  PageAnalysisBatchError,
  ReportValidationError,
  analyzePageBatch,
  combinedBusinessQuestionAnswerInputHash,
  createOpenAiCompatibleClient,
  hashReportSemanticReviewValue,
  inferPageType,
  planPagesWithRecovery,
  preparePlanningCandidates,
  parseCombinedBusinessQuestionAnswers,
  parseReportV4DiagnosisOutputForQuestion,
  reportSemanticTextHash,
  SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION,
  SOURCE_SELECTION_FACTOR_ANALYZER_VERSION,
  SOURCE_SELECTION_TARGET_COMPARATOR_VERSION,
  synthesizeCombinedBusinessQuestionAnswers,
  synthesizeGroundedBusinessAnswersV2,
  synthesizeWebsiteReportWithRecovery,
  type AiWebsiteReportV1,
  type CombinedBusinessQuestionAnswers,
  type CombinedGeoReportV3,
  type GroundedAnswerEvidence,
  type AppliedReportSemanticField,
  type PaidV3ReportSemanticReviewReceipt,
  type PaidV3SemanticAnswerCardDraft,
  type PaidV3SourceSelectionCatalogSeed,
  type PaidV3DraftManifestFieldOverride,
  type ReportSemanticAnnotations,
  type ReportSemanticAnswerAnnotation,
  type ReportSemanticReviewAuthorityBindings,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewOutput,
  type RecommendationForensicReportV2,
  type ExtractedPage,
  type PageAnalysis,
  type PlannedPage
} from "@open-geo-console/ai-report-engine";
import { auditSite, type GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { RobotsPolicy } from "@open-geo-console/site-crawler";
import { toCanonicalBuyerQuestionSet, type CanonicalBuyerQuestion, type ConfirmedBusinessQuestionSet, type PublicSearchSurfaceAdapter, type PublicSearchSurfaceAuthority, type SearchQueryFanout } from "@open-geo-console/public-search-observer";
import { createHash } from "node:crypto";
import { checkpointScanJob, failScanJob, getScanJob, heartbeatScanJob, isBillableCoverage, terminalizeScanJob, type CheckpointScanJobInput } from "@/db/jobs";
import { recordPaidJobOutcome } from "@/db/commercial-refunds";
import { terminalizePaidPublicSourceReport } from "@/db/public-source-commerce";
import { getSourceForensicReportForJob, saveSourceForensicReport } from "@/db/source-forensic-reports";
import {
  completeGeoReportTechnical,
  failGeoReportTechnical,
  getGeoReport,
  markGeoReportTechnicalProcessing
} from "@/db/reports";
import { getAiReport, saveAiReport } from "@/db/ai-reports";
import { getConfirmedBusinessQuestionSet } from "@/db/business-questions";
import { getReportV4PreAdmissionJob } from "@/db/report-v4-admission-jobs";
import {
  readFreeDirectSemanticsVersion,
  readSemanticReviewContractVersion
} from "@/db/report-semantic-review-activation";
import { loadReportV4PreAdmissionSnapshot } from "@/db/report-v4-site-snapshots";
import { getActivePublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import { listEvidenceAssets } from "@/db/evidence-assets";
import { terminalizePaidCombinedReport } from "@/db/combined-correction-terminalization";
import { getPendingPaidCombinedContext } from "@/db/combined-reports";
import { buildReadyCombinedArtifact, buildReadyCombinedArtifactV2, buildReadyCombinedArtifactV3, materializePreparedCombinedArtifactV3, prepareCombinedGeoReportV3SemanticDraft } from "@/report/combined-artifact-readiness";
import { createEvidenceStorage } from "@/evidence/storage";
import {
  getCrawlEvidence,
  getReusableCrawlEvidence,
  purgeExpiredCrawlContent,
  saveCrawlEvidence
} from "@/db/crawl-evidence";
import type { JobCheckpoint, ReportEvidenceAssetRow, ScanJobRow } from "@/db/schema";
import { projectFreeAiReport } from "@/report/visibility";
import { createSafeFetch } from "@/server/safe-fetch";
import { captureReportVisualEvidence } from "./visual-evidence";
import { createProductionPublicSourceForensicsDependencies, resolveGenerativeSearchAnswerProvider, resolveProductionPublicSearchRuntime } from "@/public-source-forensics/production-runtime";
import { createPublicSourceArtifactReadinessGate } from "@/public-source-forensics/artifact-readiness";
import { exportCanonicalArtifactHtmlPdf } from "@/report/pdf-export";
import { PublicSourceAuthorityUnavailableError, runPublicSourceForensicsPipeline, type ArtifactReadinessGate, type PublicSourceCommercialSnapshotRef, type PublicSourceForensicsDependencies, type PublicSourcePipelineCheckpoint } from "./public-source-forensics";
import { discoverSite, fetchEvidencePage, type DiscoveredSite } from "./crawler-runtime";
import { executePublicSourceRetrieval } from "./public-source-retriever";
import { JobExecutionLease, configuredJobHardDeadlineMs } from "./job-execution";
import { escalateFingerprintRecurrence, hasPriorJobErrorFingerprint, normalizeJobError, OrchestrationInvariantError } from "./job-errors";
import { assertStagingCommandEnvironment } from "@/security/deployment-policy";
import { createPublicSourceAttemptBudget, type PublicSourceAttemptBudget } from "./public-source-execution-budget";
import { phaseForStage, recoveryEnvelope } from "./job-state";
import type { StagingLiveDrill } from "./staging-live-drill";
import { resolvePublicSourceSnapshot, isDeferrablePublicSourceOutage, type InjectedPublicSourceRetrieval, type PublicSourceRetriever } from "./public-source-snapshot-resolver";
import { createProductionProviderDiscoveryContext } from "./provider-discovery-production";
import {
  identityFromProviderDiscoveryCheckpoint,
  runProviderDiscoveryPipeline,
  stableJsonHash,
  type ProviderDiscoveryCheckpointV1
} from "./provider-discovery-pipeline";
import { resolveGenerativeAnswerFirstV3, type AnswerFirstV3Checkpoint, type AnswerFirstV3CheckpointV2, type AnswerFirstV3StoredSource, type DeferredGenerativeAnswerFirstV3, type ResolvedGenerativeAnswerFirstV3 } from "./answer-first-v3";
import {
  calculateEffectiveCoverage,
  determineResumeStage,
  fetchPlannedPagesWithRecovery,
  selectReusableCompletedPageAnalyses,
  type CompletedPageAnalysis,
  type DeferredPageAnalysisAuthority,
  type PageAnalysisAuthority,
  type RecoveryCheckpoint
} from "./recovery";
import {
  processReportV4PreAdmissionJob,
  type ReportV4PreAdmissionRunner
} from "./report-v4-pre-admission";
import { createProductionReportV4AdmissionRunner, deriveReportV4AdmissionIdentity } from "./report-v4-admission-production";
import { createReportV4CoreProduction } from "./report-v4-core-production";
import { createReportV4EnhancementProduction } from "./report-v4-enhancement-production";
import { runReportV4GuardedOperation } from "@/report-v4/prohibited-operation-guard-runtime";
import {
  createReportV4AcceptanceObserver,
  type ReportV4AcceptanceObserver
} from "./report-v4-acceptance-observer";
import { ensureDatabase, getSqlClient } from "@/db";
import { runReportV4AcceptanceStage } from "./report-v4-acceptance-runner";
import { inspectReportV4AcceptanceDurableTerminal } from "./report-v4-acceptance-terminal-state";
import type { ReportV4CommerceAuthoritySnapshotSql } from "@/db/report-v4-commerce-authority-snapshot";
import { enhanceReportV4QuestionDiagnosis, formatReportV4DiagnosisFailure, type ReportV4DiagnosisFailure, type ReportV4DiagnosisProvider } from "./report-v4-diagnosis-enhancer";
import { buildReportV4MimoDiagnosisTokenBudget, createReportV4MimoDiagnosisProvider, createReportV4MimoStructuredInvoker } from "@/report-v4/mimo-provider";
import { loadReportV4ModelRuntimeConfig } from "@/report-v4/model-runtime-config";
import type { CombinedGeoReportV4Question, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerProvider, OpenGeoAnswerCardV3 } from "@open-geo-console/ai-report-engine";
import {
  buildFreeTeaserDiagnosisTargetPages,
  freeTeaserCheckpointFromJobCheckpoint,
  freeTeaserSeededQ1,
  generateFreeTeaser
} from "./report-v4-free-teaser";
import { createSemanticReviewBatchEvidenceSink } from "./semantic-review-evidence-sink";
import { sourceSelectionTargetFoundationHash } from "./source-selection-diagnosis";
import { runPaidV3SemanticReview, verifyPersistedPaidV3SemanticReview } from "./paid-v3-semantic-review";
import {
  buildPaidV3AnswerPacketFromGenerativeCard,
  classifyPaidV3PacketError,
  mergePaidV3PacketsByQuestion
} from "./paid-v3-answer-packet";
import {
  buildPaidV3SourceDictionary,
  slimOriginalTextPlaceholder
} from "./paid-v3-compact-review-input";
import { buildPaidV3DirectSemantics } from "./paid-v3-direct-semantics";
import { createPaidV3DirectDebugTrace, tracePaidV3DirectStep, type PaidV3DirectDebugTrace, type PaidV3DirectDebugTraceDetails } from "./paid-v3-direct-debug-trace";

interface StoredPageEvidence {
  page: ExtractedPage;
  canonicalUrl?: string;
  httpStatus: number;
  contentHash: string;
}

interface PaidV3SemanticReviewCheckpointProjection {
  readonly version: "report-semantic-review-v1";
  readonly input: ReportSemanticReviewInput;
  readonly output: ReportSemanticReviewOutput;
  readonly applied: {
    readonly fields: readonly AppliedReportSemanticField[];
    readonly annotations: ReportSemanticAnnotations;
    readonly receipt: PaidV3ReportSemanticReviewReceipt;
  };
  readonly finalReviewedReportProjectionHash: string;
}

interface DiscoverySnapshot {
  targetUrl: string;
  candidates: DiscoveredSite["candidates"];
  robotsPolicy: RobotsPolicy;
  estimatedPages: number;
}

interface WorkerCheckpoint extends RecoveryCheckpoint {
  contractVersion?: 1 | 2;
  websiteFoundation?: { completed: boolean; synthesisInputHash?: string };
  recommendationForensics?: { runId?: string; questionsGenerated?: boolean; reportSaved?: boolean };
  publicSourceForensics?: PublicSourcePipelineCheckpoint;
  pendingArtifactVerification?: {
    report: RecommendationForensicReportV2 | CombinedGeoReportV3;
    commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
    semanticReview?: PaidV3SemanticReviewCheckpointProjection;
  };
  providerDiscovery?: ProviderDiscoveryCheckpointV1;
  answerFirstV3?: AnswerFirstV3Checkpoint;
  paidV3Review?: {
    transportMetrics?: import("./paid-v3-compact-review-input").PaidV3TransportTokenBreakdown;
    stageTimings?: Record<string, string | number>;
  };
  combinedQuestionAnswers?: CombinedBusinessQuestionAnswers;
  discoverySnapshot?: DiscoverySnapshot;
  pageAnalysisContentHashes?: Record<string, string>;
  aiEnabled?: boolean;
  aiSkipReason?: string;
  technicalCompleted?: boolean;
}

export type ReportV4ProductionTarget = "core" | "enhancement";

export interface ReportV4ProductionRunnerInput {
  readonly job: ScanJobRow;
  readonly workerId: string;
  readonly signal: AbortSignal;
  readonly remainingMs: () => number;
  readonly checkpointJob: (input: CheckpointScanJobInput) => Promise<ScanJobRow>;
}

export type ReportV4ProductionRunner = (input: ReportV4ProductionRunnerInput) => Promise<void>;

export interface ReportV4ProductionRunners {
  readonly reportV4CoreRunner?: ReportV4ProductionRunner;
  readonly reportV4EnhancementRunner?: ReportV4ProductionRunner;
}

export async function processScanJob(job: ScanJobRow, workerId: string, options: {
  liveDrill?: StagingLiveDrill;
  reportV4PreAdmissionRunner?: ReportV4PreAdmissionRunner;
  reportV4CoreRunner?: ReportV4ProductionRunner;
  reportV4EnhancementRunner?: ReportV4ProductionRunner;
} = {}): Promise<void> {
  const acceptanceSessionId = process.env.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
  const acceptanceRequired = acceptanceSessionId !== undefined && acceptanceSessionId !== "" &&
    (job.reason === "v4_pre_admission" || hasReportV4ProductionMarker(job));
  const acceptanceObserver = acceptanceRequired
    ? await createReportV4AcceptanceObserver({ jobId: job.id })
    : null;
  if (acceptanceRequired && !acceptanceObserver) {
    throw new Error("A configured Report V4 acceptance session must produce an exact job observer.");
  }
  const execution = new JobExecutionLease({
    hardDeadlineMs: configuredJobHardDeadlineMs(),
    heartbeat: () => heartbeatScanJob(job.id, workerId)
  });
  execution.start();
  const writeRecoveryCheckpoint = createRecoveryCheckpointWriter({ job, workerId });
  const checkpointJob = async (input: CheckpointScanJobInput) => {
    execution.throwIfAborted();
    const updated = await writeRecoveryCheckpoint(input);
    execution.checkpointed();
    return updated;
  };
  const saveCheckpoint = async (
    stage: "discovering" | "planning" | "fetching" | "analyzing" | "synthesizing",
    progress: number,
    nextCheckpoint: WorkerCheckpoint,
    coverage: { plannedPages?: number; successfulPages?: number; failedPages?: number } = {}
  ) => {
    await checkpointJob({ stage, progress, checkpoint: nextCheckpoint as JobCheckpoint, ...coverage });
  };
  let checkpoint = normalizeCheckpoint(job.checkpoint);
  const websiteAnalysisSemanticValidation = resolveWebsiteAnalysisSemanticValidation(job, checkpoint);
  const directTrace = job.tier === "deep" && job.artifactContract === "combined_geo_report_v3" &&
      websiteAnalysisSemanticValidation === "free_direct"
    ? createPaidV3DirectDebugTrace({ jobId: job.id, reportId: job.reportId, remainingMs: () => execution.remainingMs() })
    : null;
  directTrace?.emit("job_started", "job_admission", { phase: job.currentPhase });
  const requiredDeferredPageAnalysisAuthority = resolveRequiredDeferredPageAnalysisAuthority(
    websiteAnalysisSemanticValidation,
    checkpoint
  );
  let reportV4ProductionTarget: ReportV4ProductionTarget | null = null;
  let reportV4ProductionRoutingAttempted = false;
  try {
    const reportV4PreAdmissionRunner = selectReportV4PreAdmissionRunner(
      job,
      options.reportV4PreAdmissionRunner,
      () => createProductionReportV4AdmissionRunner({ checkpointJob })
    );
    const observedReportV4PreAdmissionRunner = acceptanceObserver && reportV4PreAdmissionRunner
      ? instrumentReportV4PreAdmissionDispatch(reportV4PreAdmissionRunner, acceptanceObserver)
      : reportV4PreAdmissionRunner;
    const freeTeaserAdmissionRunner = observedReportV4PreAdmissionRunner &&
        job.reason === "v4_pre_admission" && !options.reportV4PreAdmissionRunner
      ? withFreeTeaserAfterAdmission(observedReportV4PreAdmissionRunner, checkpointJob)
      : observedReportV4PreAdmissionRunner;
    if (await processReportV4PreAdmissionJob({
      job,
      workerId,
      signal: execution.controller.signal,
      remainingMs: () => execution.remainingMs(),
      runner: freeTeaserAdmissionRunner,
      terminalizeJob: terminalizeScanJob
    })) return;
    reportV4ProductionRoutingAttempted = hasReportV4ProductionMarker(job);
    reportV4ProductionTarget = resolveReportV4ProductionTarget(job);
    if (reportV4ProductionTarget) {
      const configuredRunner = reportV4ProductionTarget === "core"
        ? options.reportV4CoreRunner
        : options.reportV4EnhancementRunner;
      const selectedRunner = configuredRunner ?? createDefaultReportV4ProductionRunner(
        reportV4ProductionTarget,
        process.env,
        options.liveDrill
      );
      if (acceptanceObserver) await observeReportV4Dispatch(acceptanceObserver, job.id);
      await dispatchReportV4ProductionJob(reportV4ProductionTarget, {
        job,
        workerId,
        signal: execution.controller.signal,
        remainingMs: () => execution.remainingMs(),
        checkpointJob
      }, {
        ...options,
        ...(reportV4ProductionTarget === "core"
          ? { reportV4CoreRunner: selectedRunner }
          : {}),
        ...(reportV4ProductionTarget === "enhancement"
          ? { reportV4EnhancementRunner: selectedRunner }
          : {})
      });
      return;
    }
    const fulfillmentTarget = resolveRecommendationFulfillmentTarget(job);
    if (fulfillmentTarget === "recommendation_v1") throw new HistoricalRecommendationRuntimeRetiredError();
    // Retention cleanup is housekeeping, not a prerequisite for a paid
    // delivery. Keep it on the free lane so a broad historical scan cannot
    // delay a deep job after its payment has been verified.
    if (job.tier === "free") await purgeExpiredCrawlContent();
    let storedReport = await getGeoReport(job.reportId);
    if (!storedReport) throw new Error("The source technical report no longer exists.");
    if (fulfillmentTarget !== "legacy" && job.productContract === "recommendation_forensics_v1" && checkpoint.contractVersion === 2 &&
        checkpoint.websiteFoundation?.completed) {
      const existingFoundation = await getAiReport(job.reportId, "deep", job.productContract);
      const canonicalTarget = resolveRecommendationFoundationTarget(checkpoint, existingFoundation, storedReport.url);
      if (isMatchingRecommendationWebsiteFoundation(job, canonicalTarget, existingFoundation)) {
        await finalizeRecommendationJob({
          job, workerId, checkpoint, websiteFoundation: existingFoundation.payload,
          technicalReport: existingFoundation.technicalPayload!,
          targetUrl: canonicalTarget,
          coverage: { plannedPages: job.plannedPages, successfulPages: job.successfulPages, failedPages: job.failedPages },
          fulfillmentTarget, checkpointJob, liveDrill: options.liveDrill,
          signal: execution.controller.signal, remainingMs: execution.remainingMs(), trace: directTrace ?? undefined
        });
        return;
      }
    }
    if (job.tier === "free" && storedReport.technicalStatus !== "completed") {
      await checkpointJob({ stage: "discovering", progress: 5 });
      await markGeoReportTechnicalProcessing(job.reportId);
      const technicalReport = await auditSite(storedReport.url, {
        fetchImpl: fetchWithSignal(createSafeFetch(), execution.controller.signal),
        pageLimit: 1
      });
      const completed = await completeGeoReportTechnical(job.reportId, {
        url: technicalReport.url,
        siteKey: storedReport.siteKey ?? new URL(technicalReport.url).hostname,
        report: technicalReport
      });
      if (!completed) throw new Error("The technical report shell no longer exists.");
      storedReport = completed;
      checkpoint = { ...checkpoint, technicalCompleted: true };
      await saveCheckpoint("discovering", 10, checkpoint, {
        plannedPages: 1,
        successfulPages: 1,
        failedPages: 0
      });
    }
    if (job.tier === "free" && checkpoint.aiEnabled === false) {
      await terminalizeScanJob(job.id, workerId, {
        stage: "completed",
        coverage: { plannedPages: 1, successfulPages: 1, failedPages: 0 }
      });
      return;
    }
    let client;
    try {
      client = createConfiguredClient();
    } catch (error) {
      if (job.tier !== "free" || storedReport.technicalStatus !== "completed") throw error;
      checkpoint = { ...checkpoint, aiEnabled: false, aiSkipReason: "model_not_configured" };
      await checkpointJob({ stage: "discovering", progress: 10, checkpoint });
      await terminalizeScanJob(job.id, workerId, {
        stage: "completed",
        coverage: { plannedPages: 1, successfulPages: 1, failedPages: 0 }
      });
      return;
    }

    let resumeStage = determineResumeStage(checkpoint, {
      requiredDeferredAuthority: requiredDeferredPageAnalysisAuthority
    });
    let discovery = checkpoint.discoverySnapshot;
    if (resumeStage === "discovering" || !discovery) {
      await checkpointJob({ stage: "discovering", progress: 10 });
      const discovered = await tracePaidV3DirectStep(directTrace, "discovery", { phase: "discovery" },
        () => discoverSite(storedReport.url, job.tier, createSafeFetch(), execution.controller.signal));
      discovery = snapshotDiscovery(discovered);
      const rankedCandidates = rankCandidates(discovered.candidates, []);
      checkpoint = {
        ...checkpoint,
        discoverySnapshot: discovery,
        targetPageCount: Math.min(REPORT_TIER_LIMITS[job.tier], rankedCandidates.length),
        rankedCandidates,
        rankedCandidateUrls: rankedCandidates.map(({ url }) => url)
      };
      await saveCheckpoint("planning", 25, checkpoint);
      resumeStage = "planning";
    }

    if (resumeStage === "planning" || !checkpoint.effectivePlan?.length) {
      const planningClient = directTrace?.wrapJsonClient("page_planning_provider_call", client, 3) ?? client;
      const pagePlan = await tracePaidV3DirectStep(directTrace, "page_planning", {
        phase: "planning", pageCount: discovery.candidates.length
      }, () => planPagesWithRecovery(planningClient, {
        tier: job.tier,
        locale: job.locale,
        targetUrl: discovery.targetUrl,
        candidates: discovery.candidates,
        signal: execution.controller.signal
      }));
      if (pagePlan.selected.length === 0) {
        throw new Error("No public representative pages could be planned.");
      }
      const rankedCandidates = rankCandidates(discovery.candidates, pagePlan.selected);
      checkpoint = {
        ...checkpoint,
        targetPageCount: pagePlan.selected.length,
        rankedCandidates,
        rankedCandidateUrls: rankedCandidates.map(({ url }) => url),
        effectivePlan: [...pagePlan.selected],
        effectivePlannedUrls: pagePlan.selected.map(({ url }) => url),
        planningCompleted: true
      };
      resumeStage = "fetching";
    }

    // A paid deep job can inherit a durable page plan from its technical
    // foundation.  It still needs a fetching checkpoint before any page I/O,
    // otherwise recovery (and the protected staging crawl drill) has no
    // durable boundary to resume from.
    if (resumeStage === "fetching") {
      await saveCheckpoint("fetching", 35, checkpoint);
      options.liveDrill?.inject({ jobId: job.id, fault: "crawl" });
    }

    const crawl = await tracePaidV3DirectStep(directTrace, "page_fetch", {
      phase: "fetching", pageCount: checkpoint.effectivePlan?.length ?? 0
    }, () => runReportV4GuardedOperation({
      guardSite: "full_report_rerun",
      delegate: () => fetchPlannedPagesWithRecovery<StoredPageEvidence>({
        targetPageCount: checkpoint.targetPageCount!,
        rankedCandidates: checkpoint.rankedCandidates!,
        effectivePlan: checkpoint.effectivePlan!,
        checkpoint,
        loadCompleted: (planned) => loadCompletedEvidence(job, planned),
        fetchPage: (planned) => loadOrFetchEvidence(job, planned, discovery.robotsPolicy, execution.controller.signal),
        saveCheckpoint: async (next) => {
          checkpoint = { ...checkpoint, ...next };
          await saveCheckpoint("fetching", crawlProgress(checkpoint), checkpoint, {
            plannedPages: checkpoint.effectivePlan?.length ?? 0,
            successfulPages: checkpoint.completedCrawlUrls?.length ?? 0,
            failedPages: failureCount(checkpoint)
          });
        },
        signal: execution.controller.signal
      })
    }));
    checkpoint = { ...checkpoint, ...crawl.checkpoint };
    for (const failure of checkpoint.permanentFailures ?? []) {
      const planned = checkpoint.rankedCandidates?.find(({ url }) => url === failure.url);
      await saveFailedEvidence(job, failure.url, planned?.pageType ?? "other");
    }
    for (const url of crawl.exhaustedTransientUrls) {
      const planned = checkpoint.rankedCandidates?.find((candidate) => candidate.url === url);
      await saveFailedEvidence(job, url, planned?.pageType ?? "other");
    }
    if (crawl.pages.length === 0) throw new Error("No planned page returned readable evidence.");

    const technicalReport = job.tier === "deep"
      ? await tracePaidV3DirectStep(directTrace, "technical_audit", {
          phase: "technical_audit", pageCount: checkpoint.effectivePlan!.length
        }, () => auditSite(discovery.targetUrl, {
          fetchImpl: fetchWithSignal(createSafeFetch(), execution.controller.signal),
          pageUrls: checkpoint.effectivePlan!.map(({ url }) => url)
        }))
      : undefined;

    const evidenceByUrl = new Map(crawl.pages.map((page) => [canonicalUrl(page.page.url), page]));
    // Crawl-success is independent of analysis authority filtering.
    const crawlSuccessCount = crawl.pages.length;
    const writeAuthority = requiredDeferredPageAnalysisAuthority
      ? deferredPageAnalysisAuthority(requiredDeferredPageAnalysisAuthority.semanticContractVersion)
      : undefined;
    // Marker-present: only deferred+current-marker entries count as analysis-complete.
    // Marker-absent: URL+contentHash only (missing identity remains legal).
    checkpoint.completedPageAnalyses = selectReusableCompletedPageAnalyses(
      checkpoint.completedPageAnalyses ?? [],
      {
        evidenceByUrl,
        canonicalUrl,
        requiredDeferredAuthority: requiredDeferredPageAnalysisAuthority
      }
    );
    await tracePaidV3DirectStep(directTrace, "page_analysis_initial_checkpoint", {
      phase: "page_analysis", progress: 65, pageCount: crawl.pages.length
    }, () => saveCheckpoint("analyzing", 65, checkpoint, {
      plannedPages: checkpoint.effectivePlan!.length,
      successfulPages: crawlSuccessCount,
      failedPages: failureCount(checkpoint)
    }));
    options.liveDrill?.inject({ jobId: job.id, fault: "model" });

    let analyzed;
    let pageAnalysisBatchOrdinal = 0;
    try {
      const analysisClient = directTrace?.wrapJsonClient("page_analysis_provider_call", client, 3) ?? client;
      analyzed = await tracePaidV3DirectStep(directTrace, "page_analysis", {
        phase: "page_analysis", pageCount: crawl.pages.length, batchCount: Math.ceil(crawl.pages.length / 4)
      }, () => analyzePageBatch(analysisClient, {
        pages: crawl.pages.map(({ page }) => page),
        locale: job.locale,
        ...(websiteAnalysisSemanticValidation !== "legacy"
          ? { semanticValidation: websiteAnalysisSemanticValidation }
          : {}),
        ...(websiteAnalysisSemanticValidation === "free_direct" ? { maxAttempts: 3 } : {}),
        batchSize: 4,
        maxCharactersPerPage: 30_000,
        signal: execution.controller.signal,
        completedAnalyses: (checkpoint.completedPageAnalyses ?? []).map(({ analysis }) => analysis),
        onBatchComplete: async (batch) => {
          pageAnalysisBatchOrdinal += 1;
          checkpoint.completedPageAnalyses = mergeCompletedAnalyses(
            checkpoint.completedPageAnalyses ?? [],
            batch,
            evidenceByUrl,
            writeAuthority
          );
          const completedAnalysisCount = checkpoint.completedPageAnalyses.length;
          const progress = analysisProgress(completedAnalysisCount, crawl.pages.length);
          await tracePaidV3DirectStep(directTrace, "page_analysis_batch_checkpoint", {
            phase: "page_analysis", progress, batchOrdinal: pageAnalysisBatchOrdinal,
            completedCount: completedAnalysisCount, pageCount: crawl.pages.length
          }, () => saveCheckpoint("analyzing", progress, checkpoint, {
            plannedPages: checkpoint.effectivePlan!.length,
            // Analysis-derived success only; crawl success was recorded above.
            successfulPages: completedAnalysisCount,
            failedPages: failureCount(checkpoint)
          }));
        }
      }));
    } catch (error) {
      if (error instanceof PageAnalysisBatchError) {
        checkpoint.completedPageAnalyses = mergeCompletedAnalyses(
          checkpoint.completedPageAnalyses ?? [],
          error.completedAnalyses,
          evidenceByUrl,
          writeAuthority
        );
        const progress = analysisProgress(checkpoint.completedPageAnalyses.length, crawl.pages.length);
        await tracePaidV3DirectStep(directTrace, "page_analysis_partial_failure_checkpoint", {
          phase: "page_analysis", progress, completedCount: checkpoint.completedPageAnalyses.length,
          pageCount: crawl.pages.length, disposition: "partial_analysis_saved"
        }, () => saveCheckpoint("analyzing", progress, checkpoint));
      }
      // Fail closed: do not synthesize a mixed/partial foundation after reanalysis failure.
      throw error;
    }

    checkpoint.completedPageAnalyses = mergeCompletedAnalyses(
      checkpoint.completedPageAnalyses ?? [],
      analyzed.analyses,
      evidenceByUrl,
      writeAuthority
    );
    const effectiveCoverage = calculateEffectiveCoverage({
      discoveredCandidateCount: discovery.estimatedPages,
      effectivePlannedUrls: checkpoint.effectivePlan!.map(({ url }) => url),
      // Coverage analyzedPages is analysis-derived (compatible completed only).
      completedCrawlUrls: analyzed.analyses.map(({ url }) => url),
      permanentFailures: checkpoint.permanentFailures ?? [],
      exhaustedTransientUrls: crawl.exhaustedTransientUrls
    });
    const limitations = coverageLimitations(checkpoint, crawl.exhaustedTransientUrls);
    const coverage = {
      discoveredPages: effectiveCoverage.discoveredPages,
      plannedPages: effectiveCoverage.effectivePlannedPages,
      analyzedPages: effectiveCoverage.analyzedPages,
      failedPages: effectiveCoverage.exhaustedTransientPages,
      samplingMethod: job.tier === "free"
        ? "Homepage-only preview. Other detected URLs were estimated but their content was not fetched or analyzed."
        : "Site-wide discovery followed by page-type clustering, automatic invalid-page replacement, and representative-page analysis.",
      pageTypesCovered: [...new Set(crawl.pages.map(({ page }) => page.pageType))],
      limitations
    };
    const synthesisInputHash = hashSynthesisInput(crawl.pages, analyzed.analyses, coverage, {
      requiredDeferredAuthority: requiredDeferredPageAnalysisAuthority,
      completedEntries: checkpoint.completedPageAnalyses
    });
    checkpoint.synthesisInputHash = synthesisInputHash;
    await tracePaidV3DirectStep(directTrace, "website_synthesis_checkpoint", {
      phase: "website_synthesis", progress: 85, completedCount: checkpoint.completedPageAnalyses.length
    }, () => saveCheckpoint("synthesizing", 85, checkpoint));

    const synthesisClient = directTrace?.wrapJsonClient("website_synthesis_provider_call", client, 3) ?? client;
    const synthesis = await tracePaidV3DirectStep(directTrace, "website_synthesis", {
      phase: "website_synthesis", pageCount: crawl.pages.length
    }, () => synthesizeWebsiteReportWithRecovery(synthesisClient, {
      targetUrl: discovery.targetUrl,
      tier: job.tier,
      locale: job.locale,
      pages: crawl.pages.map(({ page }) => page),
      pageAnalyses: analyzed.analyses,
      coverage
    }, {
      signal: execution.controller.signal,
      ...(websiteAnalysisSemanticValidation !== "legacy"
        ? { semanticValidation: websiteAnalysisSemanticValidation }
        : {}),
      ...(websiteAnalysisSemanticValidation === "free_direct" ? { maxAttempts: 3 } : {})
    }));
    const reportToPersist = job.tier === "free" ? projectFreeAiReport(synthesis.report) : synthesis.report;
    if (job.tier === "deep") {
      await tracePaidV3DirectStep(directTrace, "visual_evidence", {
        phase: "website_synthesis",
        citationCount: reportToPersist.findings.reduce((count, finding) => count + finding.evidence.length, 0),
        uniqueUrlCount: new Set(reportToPersist.findings.flatMap((finding) => finding.evidence.map(({ url }) => canonicalUrl(url)))).size
      }, () => captureReportVisualEvidence({
        reportId: job.reportId,
        jobId: job.id,
        report: reportToPersist,
        pages: crawl.pages.map((evidence) => ({
          url: evidence.page.url,
          contentHash: evidence.contentHash
        })),
        ...(directTrace ? { trace: directTrace } : {})
      })).catch((error) => {
        directTrace?.degraded("visual_evidence_summary", {
          phase: "visual_evidence", progress: 90, disposition: "continued_without_visual_evidence"
        }, error);
        console.error("Visual evidence capture unavailable.", { reportId: job.reportId, jobId: job.id });
      });
    }
    await tracePaidV3DirectStep(directTrace, "ai_report_persist", { phase: "website_synthesis" },
      () => persistAiReport(job, reportToPersist, crawl.pages, technicalReport));

    if (fulfillmentTarget !== "legacy") {
      checkpoint = {
        ...checkpoint,
        contractVersion: 2,
        websiteFoundation: { completed: true, synthesisInputHash }
      };
      const preflightCheckpoint = await tracePaidV3DirectStep(directTrace, "public_source_preflight_checkpoint", {
        phase: "public_source_preflight", progress: 90
      }, () => checkpointJob({ stage: "synthesizing", phase: "public_source_preflight", progress: 90, checkpoint: checkpoint as JobCheckpoint,
          plannedPages: effectiveCoverage.effectivePlannedPages,
          successfulPages: effectiveCoverage.analyzedPages,
          failedPages: failureCount(checkpoint)
        }));
      checkpoint = normalizeCheckpoint(preflightCheckpoint.checkpoint);
      await finalizeRecommendationJob({
        job, workerId, checkpoint, websiteFoundation: reportToPersist, targetUrl: discovery.targetUrl,
        technicalReport: technicalReport!,
        fulfillmentTarget, coverage: {
          plannedPages: effectiveCoverage.effectivePlannedPages,
          successfulPages: effectiveCoverage.analyzedPages,
          failedPages: failureCount(checkpoint)
        },
        signal: execution.controller.signal, remainingMs: execution.remainingMs(), checkpointJob, liveDrill: options.liveDrill,
        trace: directTrace ?? undefined
      });
      return;
    }

    const homepageUrl = new URL(discovery.targetUrl).href;
    const homepageSucceeded = crawl.pages.some(({ page }) => canonicalUrl(page.url) === canonicalUrl(homepageUrl));
    const evidenceValidated = synthesis.rejectedFindingIds.length === 0 || synthesis.report.findings.length > 0;
    const terminalCandidate = await getScanJob(job.id);
    const terminalFreeTeaser = freeTeaserCheckpointFromJobCheckpoint(terminalCandidate?.checkpoint);
    const directAnalysisIncomplete = readFreeDirectSemanticsVersion(terminalCandidate?.checkpoint ?? {}) !== null &&
      terminalFreeTeaser?.stage === "ready" && terminalFreeTeaser.directAnalysisStatus === "incomplete";
    const billable = !directAnalysisIncomplete && isBillableCoverage({
      plannedPages: effectiveCoverage.effectivePlannedPages,
      successfulPages: effectiveCoverage.analyzedPages,
      homepageSucceeded,
      evidenceValidated
    });
    const terminalJob = await terminalizeScanJob(job.id, workerId, {
      stage: billable ? "completed" : "completed_limited",
      coverage: {
        plannedPages: effectiveCoverage.effectivePlannedPages,
        successfulPages: effectiveCoverage.analyzedPages,
        failedPages: failureCount(checkpoint)
      }
    });
    if (job.tier === "deep") {
      await recordCommercialOutcomeSafely(job.id, terminalJob.stage as "completed" | "completed_limited", directTrace ?? undefined);
    }
  } catch (error) {
    if (error instanceof ReportValidationError) {
      console.error("AI report validation issues:", error.issues);
    }
    const currentJob = await getScanJob(job.id);
    if (reportV4ProductionRoutingAttempted && isTerminalScanJob(currentJob)) return;
    const phase = currentJob?.currentPhase ?? phaseForStage(currentJob?.stage ?? job.stage);
    let normalized = normalizeJobError(error, {
      jobId: job.id, phase, phaseAttempt: currentJob?.phaseAttempt ?? job.phaseAttempt ?? 0,
      resumeGeneration: currentJob?.resumeGeneration ?? job.resumeGeneration ?? 0,
      configuredSecrets: [process.env.OGC_AI_API_KEY ?? "", process.env.OGC_PUBLIC_SEARCH_MIMO_API_KEY ?? ""]
    });
    directTrace?.emit("job_failed", "terminal_failure", {
      phase,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorCode: normalized.code
    });
    // A recurring transient fingerprint in the same job+phase is deterministic:
    // escalate to permanent instead of burning the remaining attempts. A
    // deferrable provider outage instead retries without consuming the attempt
    // budget, bounded by the existing hard deadline/SLA.
    const deferPhaseAttempt = readFreeDirectSemanticsVersion(job.checkpoint) === null &&
      normalized.classification === "transient" && isDeferrablePublicSourceOutage(error);
    const directPaidOneShot = job.tier === "deep" && readFreeDirectSemanticsVersion(job.checkpoint) !== null;
    if (!deferPhaseAttempt && normalized.classification === "transient" && await hasPriorJobErrorFingerprint(job.id, normalized.fingerprint)) {
      normalized = escalateFingerprintRecurrence(normalized);
    }
    // V4 owns commercial terminalization, but ordinary runner failures still
    // belong to the canonical job state machine so the original error is
    // durable immediately instead of being replaced later by lease_exhausted.
    const failedJob = await tracePaidV3DirectStep(directTrace, "failure_state_persist", {
      phase, errorCode: normalized.code, failureClassification: normalized.classification,
      resumeGeneration: currentJob?.resumeGeneration ?? job.resumeGeneration ?? 0
    }, () => failScanJob(job.id, workerId, {
      code: normalized.code, publicMessage: "The analysis is temporarily unavailable.",
      retryable: !directPaidOneShot && normalized.classification === "transient",
      classification: directPaidOneShot ? undefined : normalized.classification === "operator_repairable" ? "operator_repairable" : normalized.classification === "target_limitation" ? "target_limitation" : undefined,
      internalError: normalized, phase, ...(deferPhaseAttempt ? { defer: true as const } : {})
    }));
    if (job.tier === "free" && failedJob.stage === "failed") {
      const report = await getGeoReport(job.reportId);
      if (report && report.technicalStatus !== "completed") {
        await failGeoReportTechnical(job.reportId, {
          code: error instanceof Error ? error.name : "scan_failed",
          publicMessage: publicFailure(error)
        });
      }
    }
    if (!reportV4ProductionRoutingAttempted && job.tier === "deep" && job.reason !== "v4_pre_admission" && failedJob.stage === "failed") {
      await recordCommercialOutcomeSafely(job.id, "failed", directTrace ?? undefined);
    }
  } finally {
    directTrace?.emit("job_stopped", "job_execution");
    execution.stop();
  }
}

function withFreeTeaserAfterAdmission(
  runner: ReportV4PreAdmissionRunner,
  checkpointJob: WorkerCheckpointWriter
): ReportV4PreAdmissionRunner {
  return async (runInput) => {
    const coverage = await runner(runInput);
    const report = await getGeoReport(runInput.job.reportId);
    const foundation = await getAiReport(
      runInput.job.reportId,
      "free",
      "legacy_website_audit_v1"
    );
    if (!report || !foundation) {
      throw new Error("Free teaser requires the completed free technical and website reports.");
    }
    const admissionIdentity = deriveReportV4AdmissionIdentity({
      reportId: runInput.job.reportId,
      targetUrl: report.url,
      capturedAt: runInput.job.createdAt
    });
    const admission = await loadReportV4PreAdmissionSnapshot(admissionIdentity);
    if (!admission) throw new Error("Free teaser Admission snapshot is unavailable.");
    const currentJob = await getScanJob(runInput.job.id);
    if (!currentJob) throw new Error("Free teaser pre-admission job disappeared.");
    let currentCheckpoint = currentJob.checkpoint;
    const semanticReviewContractVersion = readSemanticReviewContractVersion(currentCheckpoint);
    const freeDirectSemanticsVersion = readFreeDirectSemanticsVersion(currentCheckpoint);
    await generateFreeTeaser({
      reportId: runInput.job.reportId,
      jobId: runInput.job.id,
      targetUrl: report.url,
      foundation: foundation.payload,
      locale: runInput.job.locale,
      admission,
      checkpoint: freeTeaserCheckpointFromJobCheckpoint(currentCheckpoint),
      semanticReviewContractVersion,
      freeDirectSemanticsVersion,
      onSemanticReviewBatchEvidence: createSemanticReviewBatchEvidenceSink({
        context: { jobId: runInput.job.id, reportId: runInput.job.reportId }
      }),
      signal: runInput.signal,
      saveCheckpoint: async (freeTeaser, phase) => {
        const updated = await checkpointJob({
          stage: "synthesizing",
          phase,
          progress: freeTeaser.stage === "ready" ? 99 : 96,
          checkpoint: { ...currentCheckpoint, freeTeaser } as JobCheckpoint,
          plannedPages: coverage.plannedPages,
          successfulPages: coverage.successfulPages,
          failedPages: coverage.failedPages
        });
        currentCheckpoint = updated.checkpoint;
      }
    });
    return coverage;
  };
}

function instrumentReportV4PreAdmissionDispatch(
  runner: ReportV4PreAdmissionRunner,
  observer: ReportV4AcceptanceObserver
): ReportV4PreAdmissionRunner {
  return async (input) => {
    await observeReportV4Dispatch(observer, input.job.id);
    return runner(input);
  };
}

function observeReportV4Dispatch(
  observer: ReportV4AcceptanceObserver,
  jobId: string
) {
  return observer.observe({
    kind: "v4_dispatch",
    operation: "v4_dispatch",
    unitId: jobId,
    attempt: 0,
    phase: "observed",
    details: {}
  });
}

export function resolveReportV4ProductionTarget(job: Pick<ScanJobRow,
  "tier" | "productContract" | "fulfillmentMethodology" | "recommendationReportVersion" | "artifactContract" |
  "businessQuestionSetId" | "correctionId" | "replacementFulfillmentId" | "reason" | "siteSnapshotId" | "creditReservationId"
>): ReportV4ProductionTarget | null {
  if (!hasReportV4ProductionMarker(job)) return null;
  if (job.tier !== "deep" || job.productContract !== "recommendation_forensics_v1" ||
      job.fulfillmentMethodology !== "two_stage_geo_report_v4" || job.recommendationReportVersion !== 4 ||
      job.artifactContract !== "combined_geo_report_v4" || !job.businessQuestionSetId?.trim() ||
      job.correctionId !== null || job.replacementFulfillmentId !== null) {
    throw new Error("The claimed Report V4 production routing lineage is incomplete or mixed.");
  }
  if (job.reason === "standard" && job.siteSnapshotId?.trim() && job.creditReservationId?.trim()) return "core";
  if (job.reason === "v4_diagnosis_enhancement" && job.siteSnapshotId === null && job.creditReservationId === null) return "enhancement";
  throw new Error("The claimed Report V4 production job does not match one exact core or enhancement lane.");
}

export function hasReportV4ProductionMarker(job: Pick<ScanJobRow,
  "fulfillmentMethodology" | "recommendationReportVersion" | "artifactContract" | "reason"
>): boolean {
  return job.fulfillmentMethodology === "two_stage_geo_report_v4" || job.recommendationReportVersion === 4 ||
    job.artifactContract === "combined_geo_report_v4" || job.reason === "v4_diagnosis_enhancement";
}

export async function dispatchReportV4ProductionJob(
  target: ReportV4ProductionTarget,
  input: ReportV4ProductionRunnerInput,
  runners: ReportV4ProductionRunners
): Promise<void> {
  const runner = target === "core" ? runners.reportV4CoreRunner : runners.reportV4EnhancementRunner;
  if (!runner) throw new Error(`The production Report V4 ${target} runner is not configured.`);
  await runner(input);
}

export function createDefaultReportV4ProductionRunner(
  target: ReportV4ProductionTarget,
  environment: NodeJS.ProcessEnv,
  liveDrill?: StagingLiveDrill
): ReportV4ProductionRunner {
  let baseRunner: ReportV4ProductionRunner;
  if (target === "core") {
    const run = createReportV4CoreProduction({ environment, liveDrill });
    baseRunner = async ({ job, workerId, signal, remainingMs }) => {
      await run({ coreJobId: job.id, workerId, leaseMs: Math.max(1, remainingMs()), signal });
    };
  } else {
    const run = createReportV4EnhancementProduction({ environment, liveDrill });
    baseRunner = async ({ job, workerId, signal }) => {
      await run({ job, workerId, signal });
    };
  }
  return composeReportV4AcceptanceProductionRunner(target, baseRunner, environment);
}

export interface ReportV4AcceptanceProductionRunnerTestOnlyDependencies {
  readonly createObserver: typeof createReportV4AcceptanceObserver;
  readonly ensureDatabase: typeof ensureDatabase;
  readonly getSql: () => ReportV4CommerceAuthoritySnapshotSql;
  readonly inspectTerminal: typeof inspectReportV4AcceptanceDurableTerminal;
  readonly runAcceptanceStage: typeof runReportV4AcceptanceStage;
}

export function composeReportV4AcceptanceProductionRunner(
  target: ReportV4ProductionTarget,
  baseRunner: ReportV4ProductionRunner,
  environment: NodeJS.ProcessEnv,
  testOnlyDependencies?: ReportV4AcceptanceProductionRunnerTestOnlyDependencies
): ReportV4ProductionRunner {
  if (testOnlyDependencies && process.env.NODE_ENV !== "test") {
    throw new Error("Report V4 acceptance production-runner dependencies are test-only.");
  }
  const sessionId = environment.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
  if (sessionId === undefined || sessionId === "") return baseRunner;
  const dependencies = testOnlyDependencies ?? productionAcceptanceRunnerDependencies;
  return async (input) => {
    await dependencies.ensureDatabase();
    const observer = await dependencies.createObserver({ jobId: input.job.id, environment });
    if (!observer || observer.session.sessionId !== sessionId || observer.session.environment !== "protected_staging"
        || observer.session.state !== "collecting" || observer.session.terminalAt !== null
        || observer.scenario.sessionId !== sessionId || observer.scenario.state !== "collecting"
        || observer.scenario.terminalAt !== null) {
      throw new Error("An active Report V4 acceptance observer is required for the production stage runner.");
    }
    const coreJobId = observer.scenario.coreJobId;
    if (!coreJobId || coreJobId.trim() !== coreJobId || (target === "core" && coreJobId !== input.job.id)) {
      throw new Error("The acceptance production stage requires the observer's exact Core job identity.");
    }
    const sql = dependencies.getSql();
    await dependencies.runAcceptanceStage({
      sql,
      observer,
      sessionId: observer.session.sessionId,
      scenarioId: observer.scenario.scenarioId,
      coreJobId,
      workerGitSha: observer.session.workerGitSha,
      inspectDurableTerminal: () => dependencies.inspectTerminal({
        sql,
        sessionId: observer.session.sessionId,
        scenarioId: observer.scenario.scenarioId,
        coreJobId,
        currentJobId: input.job.id,
        target
      }),
      runStage: async () => { await baseRunner(input); },
      isTerminalResult: () => false
    });
  };
}

const productionAcceptanceRunnerDependencies: ReportV4AcceptanceProductionRunnerTestOnlyDependencies = {
  createObserver: createReportV4AcceptanceObserver,
  ensureDatabase,
  getSql: getSqlClient,
  inspectTerminal: inspectReportV4AcceptanceDurableTerminal,
  runAcceptanceStage: runReportV4AcceptanceStage
};

export function isTerminalScanJob(job: ScanJobRow | null): boolean {
  return Boolean(job && (job.stage === "completed" || job.stage === "completed_limited" || job.stage === "failed"));
}

export function selectReportV4PreAdmissionRunner(
  job: Pick<ScanJobRow, "reason">,
  injected: ReportV4PreAdmissionRunner | undefined,
  createDefault: () => ReportV4PreAdmissionRunner
): ReportV4PreAdmissionRunner | undefined {
  if (injected) return injected;
  return job.reason === "v4_pre_admission" ? createDefault() : undefined;
}

export function resolveRecommendationFulfillmentTarget(
  job: Pick<ScanJobRow, "productContract" | "fulfillmentMethodology" | "recommendationReportVersion"> & { reason?: ScanJobRow["reason"] }
): "legacy" | "recommendation_v1" | "recommendation_v2" {
  if (job.productContract === "recommendation_forensics_v1" &&
      job.fulfillmentMethodology === "public_search_source_forensics_v1" &&
      (job.recommendationReportVersion === 2 || job.recommendationReportVersion === 3) &&
      (job.reason === "replacement_fulfillment" || job.reason === "paid_report_correction" || job.reason === "staging_artifact_refresh")) {
    throw new HistoricalRecommendationRuntimeRetiredError();
  }
  if (job.productContract === "legacy_website_audit_v1") {
    if (job.fulfillmentMethodology !== null || job.recommendationReportVersion !== null) {
      throw new Error("Legacy jobs cannot carry a recommendation methodology or report version.");
    }
    return "legacy";
  }
  if (job.fulfillmentMethodology === "answer_engine_recommendation_forensics_v1" && job.recommendationReportVersion === 1) return "recommendation_v1";
  if (job.fulfillmentMethodology === "public_search_source_forensics_v1" && (job.recommendationReportVersion === 2 || job.recommendationReportVersion === 3)) return "recommendation_v2";
  throw new Error("Recommendation jobs require a recognized persisted methodology and matching report version.");
}

export function isMatchingRecommendationWebsiteFoundation(
  job: ScanJobRow,
  targetUrl: string,
  foundation: Awaited<ReturnType<typeof getAiReport>>
): foundation is NonNullable<Awaited<ReturnType<typeof getAiReport>>> {
  return Boolean(foundation && job.productContract === "recommendation_forensics_v1" &&
    foundation.jobId === job.id && foundation.reportId === job.reportId && foundation.locale === job.locale &&
    foundation.tier === "deep" && foundation.payload.tier === "deep" && foundation.payload.targetUrl === targetUrl);
}

export function resolveRecommendationFoundationTarget(
  checkpoint: Pick<WorkerCheckpoint, "discoverySnapshot">,
  foundation: Awaited<ReturnType<typeof getAiReport>>,
  submittedUrl: string
): string {
  return checkpoint.discoverySnapshot?.targetUrl ?? foundation?.payload.targetUrl ?? submittedUrl;
}

export function publicSourceArtifactVerificationResume(checkpoint: WorkerCheckpoint): {
  report: RecommendationForensicReportV2;
  checkpoint: PublicSourcePipelineCheckpoint;
  commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
} | null {
  const phase=recoveryEnvelope(checkpoint)?.phase;
  if(!["artifact_verification","terminalization"].includes(phase ?? "") || !checkpoint.pendingArtifactVerification || !checkpoint.publicSourceForensics) return null;
  const report=checkpoint.pendingArtifactVerification.report;
  if(isCombinedGeoReportV3(report)) return null;
  return { report,checkpoint:checkpoint.publicSourceForensics,
    commercialSnapshotRefs:checkpoint.pendingArtifactVerification.commercialSnapshotRefs };
}

export function publicSourceSynthesisResume(checkpoint: WorkerCheckpoint): {
  report: RecommendationForensicReportV2;
  checkpoint: PublicSourcePipelineCheckpoint;
  commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
} | null {
  const recovery = recoveryEnvelope(checkpoint);
  const prepared = checkpoint.pendingArtifactVerification;
  if (!recovery || !["grounded_answer_synthesis", "artifact_verification", "terminalization"].includes(recovery.phase)
    || !prepared || !checkpoint.publicSourceForensics || isCombinedGeoReportV3(prepared.report)) return null;
  if (prepared.report.jobId !== recovery.identity.jobId || prepared.report.reportId !== recovery.identity.reportId) return null;
  const reportSnapshotIds = new Set(prepared.report.snapshotRefs.map(({ snapshotId }) => snapshotId));
  const commercialSnapshotIds = new Set(prepared.commercialSnapshotRefs.map(({ snapshotId }) => snapshotId));
  if (!reportSnapshotIds.size || reportSnapshotIds.size !== commercialSnapshotIds.size
    || [...reportSnapshotIds].some((snapshotId) => !commercialSnapshotIds.has(snapshotId))) return null;
  return {
    report: prepared.report,
    checkpoint: checkpoint.publicSourceForensics,
    commercialSnapshotRefs: prepared.commercialSnapshotRefs
  };
}

export function combinedV3ArtifactVerificationResume(checkpoint: WorkerCheckpoint): {
  report: CombinedGeoReportV3;
  checkpoint: AnswerFirstV3Checkpoint;
  commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
  semanticReview?: PaidV3SemanticReviewCheckpointProjection;
} | null {
  const phase=recoveryEnvelope(checkpoint)?.phase;
  const report=checkpoint.pendingArtifactVerification?.report;
  if(!["artifact_verification","terminalization"].includes(phase ?? "") || !isCombinedGeoReportV3(report) || !checkpoint.answerFirstV3) return null;
  return {
    report,
    checkpoint: checkpoint.answerFirstV3,
    commercialSnapshotRefs: checkpoint.pendingArtifactVerification!.commercialSnapshotRefs,
    ...(checkpoint.pendingArtifactVerification!.semanticReview
      ? { semanticReview: checkpoint.pendingArtifactVerification!.semanticReview }
      : {})
  };
}

export function assertPaidV3ResumeSemanticAuthority(
  semanticValidation: "legacy" | "deferred" | "free_direct",
  resumed: NonNullable<ReturnType<typeof combinedV3ArtifactVerificationResume>>
): void {
  if (semanticValidation === "legacy" &&
      (resumed.semanticReview !== undefined || resumed.report.semanticReviewReceipt !== undefined)) {
    throw new Error("A Paid V3 semantic projection or receipt cannot resume without its immutable root marker.");
  }
  if (semanticValidation === "deferred" &&
      (resumed.semanticReview === undefined || resumed.report.semanticReviewReceipt === undefined)) {
    throw new Error("Reviewed Paid V3 resume requires its complete root-bound semantic projection and receipt.");
  }
  if (semanticValidation === "free_direct" &&
      (resumed.semanticReview !== undefined || resumed.report.semanticReviewReceipt !== undefined || !resumed.report.directSemantics)) {
    throw new Error("Direct Paid V3 resume requires its Direct question semantics and forbids legacy semantic review.");
  }
}

async function verifyReviewedPaidV3CheckpointProjection(input: {
  report: CombinedGeoReportV3;
  checkpoint: AnswerFirstV3Checkpoint;
  semanticReview?: PaidV3SemanticReviewCheckpointProjection;
  reviewedFreeQ1: Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>;
  reviewedFreeQ1Annotation: ReportSemanticAnswerAnnotation;
  expectedAuthorityBindings: ReportSemanticReviewAuthorityBindings;
}): Promise<void> {
  if (input.checkpoint.version !== "answer-first-v3-checkpoint-v2" || !input.semanticReview) {
    throw new Error("Reviewed Paid V3 resume requires its complete answer and semantic projection.");
  }
  const receipt = input.report.semanticReviewReceipt;
  if (!receipt ||
      input.semanticReview.version !== "report-semantic-review-v1" ||
      input.semanticReview.finalReviewedReportProjectionHash !== receipt.finalReviewedReportProjectionHash ||
      hashReportSemanticReviewValue(input.semanticReview.applied.receipt) !== hashReportSemanticReviewValue(receipt) ||
      hashReportSemanticReviewValue(input.semanticReview.applied.annotations) !== hashReportSemanticReviewValue(input.semanticReview.output.annotations)) {
    throw new Error("Reviewed Paid V3 checkpoint receipt or projection binding is invalid.");
  }
  await verifyPersistedPaidV3SemanticReview({
    report: input.report,
    rawInput: input.semanticReview.input,
    rawReview: input.semanticReview.output,
    appliedFields: input.semanticReview.applied.fields,
    answerResults: input.checkpoint.answerResults,
    reviewedFreeQ1: input.reviewedFreeQ1,
    reviewedFreeQ1Annotation: input.reviewedFreeQ1Annotation,
    expectedAuthorityBindings: input.expectedAuthorityBindings
  });
}

function paidV3ReviewedFreeQ1Annotation(
  checkpoint: NonNullable<ReturnType<typeof freeTeaserCheckpointFromJobCheckpoint>>
): ReportSemanticAnswerAnnotation {
  const questionId = checkpoint.q1AnswerCard?.questionId;
  const annotations = checkpoint.semanticReview?.output.annotations.answers
    .filter((annotation) => annotation.questionId === questionId) ?? [];
  if (!questionId || annotations.length !== 1) {
    throw new Error("Reviewed Paid V3 requires the exact accepted Free Q1 semantic annotation.");
  }
  return annotations[0]!;
}

function buildPaidV3ReviewAuthorityBindings(input: {
  rootMarker: "report-semantic-review-v1";
  artifactIdentity: unknown;
  reviewedFreeCheckpoint: NonNullable<ReturnType<typeof freeTeaserCheckpointFromJobCheckpoint>>;
  answerCheckpoint: AnswerFirstV3Checkpoint;
  commercialSnapshotRefs: readonly PublicSourceCommercialSnapshotRef[];
  publicSourceForensics: unknown;
  providerDiscovery: unknown;
  technicalFoundation: GeoAuditReport;
  aiFoundation: AiWebsiteReportV1;
  evidenceAssets: readonly ReportEvidenceAssetRow[];
}): ReportSemanticReviewAuthorityBindings {
  return {
    rootMarker: input.rootMarker,
    artifactIdentityHash: hashReportSemanticReviewValue(input.artifactIdentity),
    reviewedFreeAuthorityHash: hashReportSemanticReviewValue(input.reviewedFreeCheckpoint),
    answerCheckpointHash: hashReportSemanticReviewValue(input.answerCheckpoint),
    commercialSnapshotsHash: hashReportSemanticReviewValue(input.commercialSnapshotRefs),
    publicSourceHash: hashReportSemanticReviewValue(input.publicSourceForensics),
    providerDiscoveryHash: hashReportSemanticReviewValue(input.providerDiscovery),
    technicalFoundationHash: hashReportSemanticReviewValue(input.technicalFoundation),
    aiFoundationHash: hashReportSemanticReviewValue(input.aiFoundation),
    evidenceAssetsHash: hashReportSemanticReviewValue(input.evidenceAssets)
  };
}

function paidV3ArtifactIdentity(report: {
  artifactContract: string;
  artifactRevisionId: string;
  artifactRevision: number;
  reportId: string;
  orderId: string;
  jobId: string;
  originalPaidJobId: string;
  targetUrl: string;
  locale: string;
  businessQuestionSet: CombinedGeoReportV3["businessQuestionSet"];
}): unknown {
  return {
    artifactContract: report.artifactContract,
    artifactRevisionId: report.artifactRevisionId,
    artifactRevision: report.artifactRevision,
    reportId: report.reportId,
    orderId: report.orderId,
    jobId: report.jobId,
    originalPaidJobId: report.originalPaidJobId,
    targetUrl: report.targetUrl,
    locale: report.locale,
    questionSetId: report.businessQuestionSet.id,
    questionSetContentHash: report.businessQuestionSet.contentHash
  };
}

export async function executeReviewedPaidV3ArtifactBoundary<TReady extends { report: CombinedGeoReportV3 }>(input: {
  persistedReport: CombinedGeoReportV3;
  persistCheckpoint?: () => Promise<void>;
  verifyProjection(report: CombinedGeoReportV3): Promise<void>;
  materialize(): Promise<TReady>;
  terminalize(ready: TReady): Promise<void>;
}): Promise<TReady> {
  await input.persistCheckpoint?.();
  await input.verifyProjection(input.persistedReport);
  const ready = await input.materialize();
  await input.verifyProjection(ready.report);
  if (hashReportSemanticReviewValue(ready.report) !== hashReportSemanticReviewValue(input.persistedReport)) {
    throw new Error("Reviewed Paid V3 materialization changed the persisted report.");
  }
  await input.terminalize(ready);
  return ready;
}

export function resolvePaidV3SemanticValidation(
  job: Pick<ScanJobRow, "artifactContract" | "recommendationReportVersion" | "reason">,
  checkpoint: JobCheckpoint
): "legacy" | "deferred" | "free_direct" {
  if (job.artifactContract !== "combined_geo_report_v3" || job.recommendationReportVersion !== 3) {
    return "legacy";
  }
  const version = readSemanticReviewContractVersion(checkpoint);
  const directVersion = readFreeDirectSemanticsVersion(checkpoint);
  if (version !== null && directVersion !== null) throw new Error("Paid V3 cannot carry both legacy and Direct semantic authority.");
  if (version === null && directVersion === null) return "legacy";
  if (job.reason !== "standard") {
    throw new Error("Semantic-reviewed Paid V3 is allowed only for the ordinary immutable Paid lineage.");
  }
  return directVersion ? "free_direct" : "deferred";
}

/**
 * Website analysis prose gates:
 * - Paid marker-present: deferred (existing Paid V3 path).
 * - Free: deferred only when the job root checkpoint already carries the approved
 *   semantic-review marker; marker-absent Free keeps legacy language gates.
 */
export function resolveWebsiteAnalysisSemanticValidation(
  job: Pick<ScanJobRow, "tier" | "artifactContract" | "recommendationReportVersion" | "reason">,
  checkpoint: JobCheckpoint
): "legacy" | "deferred" | "free_direct" {
  const paidMode = resolvePaidV3SemanticValidation(job, checkpoint);
  if (paidMode !== "legacy") return paidMode;
  if (job.tier === "free" && readSemanticReviewContractVersion(checkpoint) !== null) {
    return "deferred";
  }
  return "legacy";
}

/** Marker-present deferred write/reuse identity; null keeps marker-absent URL+hash semantics. */
export function resolveRequiredDeferredPageAnalysisAuthority(
  websiteAnalysisSemanticValidation: "legacy" | "deferred" | "free_direct",
  checkpoint: JobCheckpoint
): DeferredPageAnalysisAuthority | null {
  if (websiteAnalysisSemanticValidation !== "deferred") return null;
  const version = readSemanticReviewContractVersion(checkpoint);
  if (version === null) return null;
  return { mode: "deferred", semanticContractVersion: version };
}

export function deferredPageAnalysisAuthority(
  semanticContractVersion: string
): PageAnalysisAuthority {
  return { mode: "deferred", semanticContractVersion };
}

async function resolveCombinedQuestionAnswers(input: {
  checkpoint: WorkerCheckpoint;
  questionSet: ConfirmedBusinessQuestionSet;
  forensic: RecommendationForensicReportV2;
  checkpointJob: WorkerCheckpointWriter;
  coverage: { plannedPages?: number; successfulPages?: number; failedPages?: number };
  signal?: AbortSignal;
}): Promise<{ answers: CombinedBusinessQuestionAnswers; checkpoint: WorkerCheckpoint }> {
  const inputHash=await combinedBusinessQuestionAnswerInputHash(input.questionSet,input.forensic);
  if(input.checkpoint.combinedQuestionAnswers?.synthesis.inputHash===inputHash){
    try {
      return {answers:parseCombinedBusinessQuestionAnswers(input.checkpoint.combinedQuestionAnswers,input.questionSet,input.forensic),checkpoint:input.checkpoint};
    } catch { /* stale or invalid answer checkpoints are safely regenerated */ }
  }
  input.signal?.throwIfAborted();
  const answers=await synthesizeCombinedBusinessQuestionAnswers(createConfiguredClient(),{
    questionSet:input.questionSet,forensic:input.forensic,signal:input.signal
  });
  const next={...input.checkpoint,combinedQuestionAnswers:answers};
  const updated=await input.checkpointJob({stage:"synthesizing",phase:"artifact_verification",progress:99,
    checkpoint:next as JobCheckpoint,...input.coverage});
  return {answers,checkpoint:normalizeCheckpoint(updated.checkpoint)};
}

async function assertReusableEvidenceAssets(assets: ReportEvidenceAssetRow[]): Promise<void> {
  const required=assets.filter((asset)=>asset.status==="ready");
  if(required.length===0 || assets.some((asset)=>asset.status!=="ready" || !asset.storageKey || !asset.contentHash)) {
    throw new Error("The correction screenshot foundation failed completeness or retention validation.");
  }
  const storage=createEvidenceStorage();
  for(const asset of required){
    const object=await storage.get(asset.storageKey!);
    if(!object?.body.byteLength) throw new Error("A retained correction screenshot is no longer readable.");
  }
}
async function areReusableEvidenceAssets(assets: ReportEvidenceAssetRow[]): Promise<boolean> {
  try { await assertReusableEvidenceAssets(assets); return true; }
  catch { return false; }
}
function sameTarget(left:string,right:string):boolean{try{const a=new URL(left),b=new URL(right);a.hash="";b.hash="";a.pathname=a.pathname.replace(/\/$/,"")||"/";b.pathname=b.pathname.replace(/\/$/,"")||"/";return a.href===b.href;}catch{return false;}}

async function finalizeRecommendationJob(input: {
  job: ScanJobRow;
  workerId: string;
  checkpoint: WorkerCheckpoint;
  websiteFoundation: AiWebsiteReportV1;
  technicalReport: GeoAuditReport;
  targetUrl: string;
  coverage: { plannedPages: number; successfulPages: number; failedPages: number };
  fulfillmentTarget: "recommendation_v1" | "recommendation_v2";
  checkpointJob: WorkerCheckpointWriter;
  signal?: AbortSignal;
  remainingMs: number;
  liveDrill?: StagingLiveDrill;
  trace?: PaidV3DirectDebugTrace;
}): Promise<void> {
  if (input.fulfillmentTarget === "recommendation_v2") {
    if (input.job.artifactContract === "combined_geo_report_v2" || input.job.artifactContract === "combined_geo_report_v3") {
      await finalizeProviderDiscoveryCombinedJob(input);
      return;
    }
    let checkpoint = input.checkpoint;
    const artifactReadiness = input.job.artifactContract === "combined_geo_report_v1"
      ? { async verify() { /* canonical combined readiness runs after public-source synthesis */ } }
      : createWorkerPublicSourceArtifactReadinessGate();
    const checkpointPhase = () => recoveryEnvelope(checkpoint)?.phase;
    const terminalize = async (report: RecommendationForensicReportV2, snapshotRefs: PublicSourceCommercialSnapshotRef[]) => {
      if (checkpointPhase() !== "terminalization") {
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "terminalization", progress: 99,
          checkpoint: checkpoint as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
      input.liveDrill?.inject({ jobId: input.job.id, fault: "terminalization" });
      await terminalizePaidPublicSourceReport({ report, workerId: input.workerId,
        checkpointIdentityHash: checkpoint.publicSourceForensics?.identityHash ?? "", coverage: input.coverage, snapshotRefs });
    };
    if (input.job.artifactContract !== "combined_geo_report_v1" && ["artifact_verification", "terminalization"].includes(checkpointPhase() ?? "") && checkpoint.pendingArtifactVerification && !isCombinedGeoReportV3(checkpoint.pendingArtifactVerification.report)) {
      input.signal?.throwIfAborted();
      await artifactReadiness.verify(checkpoint.pendingArtifactVerification.report);
      input.signal?.throwIfAborted();
      await terminalize(checkpoint.pendingArtifactVerification.report, checkpoint.pendingArtifactVerification.commercialSnapshotRefs);
      return;
    }
    const businessQuestionSet = input.job.businessQuestionSetId
      ? await getConfirmedBusinessQuestionSet(input.job.reportId, input.job.businessQuestionSetId)
      : null;
    if (input.job.businessQuestionSetId && !businessQuestionSet) throw new Error("The job-bound business question set is unavailable or unlocked.");
    const resumedPublicSource = input.job.artifactContract === "combined_geo_report_v1"
      ? publicSourceArtifactVerificationResume(checkpoint)
      : null;
    const result = resumedPublicSource ?? await (async () => {
      if (checkpointPhase() === "public_source_preflight") input.liveDrill?.inject({ jobId: input.job.id, fault: "v2_runtime" });
      const publicSourceBudget = createPublicSourceAttemptBudget(input.remainingMs);
      const dependencies = await createProductionPublicSourceForensicsDependencies(process.env, {
        createDependencies: async (runtime) => createWorkerPublicSourceForensicsDependencies({
          job: input.job,
          workerId: input.workerId,
          coverage: input.coverage,
          readCheckpoint: () => checkpoint,
          onCheckpointSaved: async (next) => { checkpoint = next; },
          checkpointJob: input.checkpointJob,
          retrieveSource: createWorkerPublicSourceRetriever(),
          publicSourceBudget,
          // This verifies the canonical V2 HTML and a real Chromium PDF before the
          // atomic terminalization boundary; it never persists a report itself.
          artifactReadiness,
          liveDrill: input.liveDrill,
          signal: input.signal
        }, runtime)
      });
      return runPublicSourceForensicsPipeline({ reportId: input.job.reportId, jobId: input.job.id,
        ...resolvePublicSourceRunScope(dependencies),
        targetUrl: input.targetUrl, websiteFoundation: input.websiteFoundation, businessQuestionSet: businessQuestionSet ?? undefined,
        dependencies, signal: input.signal });
    })();
    if(input.job.artifactContract==="combined_geo_report_v1"&&result.report.commercialOutcome==="completed"){
      const context=await getPendingPaidCombinedContext(input.job.id);
      const questions=input.job.businessQuestionSetId?await getConfirmedBusinessQuestionSet(input.job.reportId,input.job.businessQuestionSetId):null;
      if(!context||!questions)throw new Error("The pending paid combined artifact identity is unavailable.");
      const evidenceAssets=await listEvidenceAssets(input.job.reportId,input.job.id);await assertReusableEvidenceAssets(evidenceAssets);
      const resolvedAnswers=await resolveCombinedQuestionAnswers({checkpoint,questionSet:questions,forensic:result.report,
        checkpointJob:input.checkpointJob,coverage:input.coverage,signal:input.signal});
      checkpoint=resolvedAnswers.checkpoint;
      const ready=await buildReadyCombinedArtifact({artifactRevisionId:context.artifactRevisionId,artifactRevision:context.artifactRevision,
        reportId:input.job.reportId,orderId:context.orderId,jobId:input.job.id,originalPaidJobId:input.job.id,targetUrl:input.targetUrl,
        technicalReport:input.technicalReport,aiReport:input.websiteFoundation,evidenceAssets,businessQuestionSet:questions,
        businessQuestionAnswers:resolvedAnswers.answers,publicSourceForensics:result.report});
      await terminalizePaidCombinedReport({report:ready.report,workerId:input.workerId,checkpointIdentityHash:result.checkpoint.identityHash,
        snapshotRefs:result.commercialSnapshotRefs,htmlSha256:ready.htmlSha256,pdfSha256:ready.pdfSha256,pdfStorageKey:ready.pdfStorageKey,pageCount:ready.pageCount});
      return;
    }
    await terminalize(result.report, result.commercialSnapshotRefs);
    return;
  }
  throw new HistoricalRecommendationRuntimeRetiredError();
}

async function resolveProspectiveV3TeaserContext(
  reportId: string,
  targetUrl: string,
  questionSet: ConfirmedBusinessQuestionSet,
  semanticValidation: "legacy" | "deferred" | "free_direct"
): Promise<{
  seededQ1: ReturnType<typeof freeTeaserSeededQ1>;
  reviewedFreeQ1: Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>;
  reviewedFreeCheckpoint: NonNullable<ReturnType<typeof freeTeaserCheckpointFromJobCheckpoint>>;
  admission: NonNullable<Awaited<ReturnType<typeof loadReportV4PreAdmissionSnapshot>>>;
}> {
  const preAdmissionJob = await getReportV4PreAdmissionJob(reportId);
  if (!preAdmissionJob || !["completed", "completed_limited"].includes(preAdmissionJob.stage)) {
    throw new Error("Prospective Paid V3 requires one completed free teaser job.");
  }
  const teaserCheckpoint = freeTeaserCheckpointFromJobCheckpoint(preAdmissionJob.checkpoint);
  if (!teaserCheckpoint) throw new Error("Prospective Paid V3 free teaser checkpoint is unavailable.");
  const admissionIdentity = deriveReportV4AdmissionIdentity({
    reportId,
    targetUrl,
    capturedAt: preAdmissionJob.createdAt
  });
  const admission = await loadReportV4PreAdmissionSnapshot(admissionIdentity);
  if (!admission || admission.snapshot.id !== teaserCheckpoint.admissionSnapshotId ||
      admission.snapshot.contentIdentityHash !== teaserCheckpoint.admissionContentIdentityHash) {
    throw new Error("Prospective Paid V3 Admission evidence does not match the free teaser.");
  }
  const directVersion = readFreeDirectSemanticsVersion(preAdmissionJob.checkpoint);
  const seededQ1 = freeTeaserSeededQ1(teaserCheckpoint, questionSet, directVersion
    ? { freeDirectSemanticsVersion: directVersion }
    : semanticValidation === "deferred"
      ? { semanticReviewContractVersion: "report-semantic-review-v1" }
      : {});
  const q1Core = teaserCheckpoint.q1AnswerDraft ?? teaserCheckpoint.q1AnswerCard;
  if (!q1Core || q1Core.answerMode !== "generative_search_v1") {
    throw new Error("Prospective Paid V3 reviewed Free Q1 is unavailable.");
  }
  return {
    seededQ1,
    reviewedFreeQ1: q1Core as Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>,
    reviewedFreeCheckpoint: teaserCheckpoint,
    admission
  };
}

async function finalizeProviderDiscoveryCombinedJob(input: {
  job: ScanJobRow;
  workerId: string;
  checkpoint: WorkerCheckpoint;
  websiteFoundation: AiWebsiteReportV1;
  technicalReport: GeoAuditReport;
  targetUrl: string;
  coverage: { plannedPages: number; successfulPages: number; failedPages: number };
  checkpointJob: WorkerCheckpointWriter;
  signal?: AbortSignal;
  remainingMs: number;
  liveDrill?: StagingLiveDrill;
  evidenceAssets?: ReportEvidenceAssetRow[];
  artifactContext?: { orderId: string; artifactRevisionId: string; artifactRevision: number };
  originalPaidJobId?: string;
  forceSnapshotRefreshAfter?: string;
  trace?: PaidV3DirectDebugTrace;
}): Promise<void> {
  let checkpoint = input.checkpoint;
  const businessQuestionSet = await tracePaidV3DirectStep(input.trace, "combined_question_context_load", {
    phase: "public_source_preflight"
  }, () => input.job.businessQuestionSetId
    ? getConfirmedBusinessQuestionSet(input.job.reportId, input.job.businessQuestionSetId)
    : Promise.resolve(null));
  const pending = input.artifactContext ?? await tracePaidV3DirectStep(input.trace, "combined_artifact_context_load", {
    phase: "public_source_preflight"
  }, () => getPendingPaidCombinedContext(input.job.id));
  if (!businessQuestionSet || !pending) throw new Error("The combined job requires its exact locked questions and pending artifact revision.");
  const semanticValidation = tracePaidV3DirectGate(input.trace, "combined_semantic_mode", {
    phase: "public_source_preflight"
  }, () => resolvePaidV3SemanticValidation(input.job, checkpoint));
  input.trace?.emit("gate_result", "combined_semantic_mode", {
    phase: "public_source_preflight", disposition: semanticValidation
  });
  const evidenceAssets = input.evidenceAssets ?? await tracePaidV3DirectStep(input.trace, "combined_evidence_asset_load", {
    phase: "public_source_preflight"
  }, () => listEvidenceAssets(input.job.reportId, input.job.id));
  await tracePaidV3DirectStep(input.trace, "combined_evidence_asset_guard", {
    phase: "public_source_preflight", assetCount: evidenceAssets.length
  }, () => assertReusableEvidenceAssets(evidenceAssets));
  const prospectiveTeaser = input.job.recommendationReportVersion === 3
    ? await tracePaidV3DirectStep(input.trace, "combined_free_lineage_load", {
        phase: "public_source_preflight"
      }, () => resolveProspectiveV3TeaserContext(input.job.reportId, input.targetUrl, businessQuestionSet, semanticValidation))
    : null;
  const resumedV3 = tracePaidV3DirectGate(input.trace, "combined_resume_decision", {
    phase: "artifact_verification", resumeGeneration: input.job.resumeGeneration
  }, () => input.job.artifactContract === "combined_geo_report_v3" ? combinedV3ArtifactVerificationResume(checkpoint) : null);
  if (resumedV3) {
    tracePaidV3DirectGate(input.trace, "combined_resume_authority", {
      phase: "artifact_verification", resumeGeneration: input.job.resumeGeneration, disposition: "resume"
    }, () => assertPaidV3ResumeSemanticAuthority(semanticValidation, resumedV3));
    if (semanticValidation === "deferred") {
      if (!prospectiveTeaser) throw new Error("Reviewed Paid V3 resume requires its reviewed Free lineage.");
      const reviewedFreeQ1Annotation = paidV3ReviewedFreeQ1Annotation(prospectiveTeaser.reviewedFreeCheckpoint);
      const expectedAuthorityBindings = buildPaidV3ReviewAuthorityBindings({
        rootMarker: "report-semantic-review-v1",
        artifactIdentity: paidV3ArtifactIdentity(resumedV3.report),
        reviewedFreeCheckpoint: prospectiveTeaser.reviewedFreeCheckpoint,
        answerCheckpoint: resumedV3.checkpoint,
        commercialSnapshotRefs: resumedV3.commercialSnapshotRefs,
        publicSourceForensics: resumedV3.report.publicSourceForensics,
        providerDiscovery: resumedV3.report.providerDiscovery,
        technicalFoundation: input.technicalReport,
        aiFoundation: input.websiteFoundation,
        evidenceAssets
      });
      await executeReviewedPaidV3ArtifactBoundary({
        persistedReport: resumedV3.report,
        verifyProjection: (report) => verifyReviewedPaidV3CheckpointProjection({
          ...resumedV3,
          report,
          reviewedFreeQ1: prospectiveTeaser.reviewedFreeQ1,
          reviewedFreeQ1Annotation,
          expectedAuthorityBindings
        }),
        materialize: () => materializePreparedCombinedArtifactV3(
          resumedV3.report,
          evidenceAssets,
          { semanticValidation: "deferred", reviewedReceiptVerified: true }
        ),
        terminalize: (ready) => terminalizeReadyCombinedArtifact(
          input,
          ready,
          resumedV3.checkpoint.identityHash,
          resumedV3.commercialSnapshotRefs,
          "deferred"
        )
      });
      return;
    }
    const ready = await tracePaidV3DirectStep(input.trace, "combined_artifact_resume_materialization", {
      phase: "artifact_verification", progress: 99, resumeGeneration: input.job.resumeGeneration
    }, () => materializePreparedCombinedArtifactV3(
      resumedV3.report,
      evidenceAssets,
      semanticValidation === "free_direct" ? { semanticValidation: "free_direct", trace: input.trace } : {}
    ));
    await tracePaidV3DirectStep(input.trace, "terminalization", {
      phase: "terminalization", artifactState: "ready", resumeGeneration: input.job.resumeGeneration
    }, () => terminalizeReadyCombinedArtifact(input, ready, resumedV3.checkpoint.identityHash, resumedV3.commercialSnapshotRefs, semanticValidation));
    return;
  }
  const publicSourceBudget = await tracePaidV3DirectStep(input.trace, "public_source_budget_admission", {
    phase: "public_source_preflight"
  }, async () => createPublicSourceAttemptBudget(input.remainingMs, { semanticValidation }));
  const configuredClient = createConfiguredClient();
  const client = input.trace?.wrapJsonClient("provider_claim_extraction_provider_call", configuredClient, 3) ?? configuredClient;
  let generativeCheckpoint: AnswerFirstV3CheckpointV2 | null = null;
  if (input.job.artifactContract === "combined_geo_report_v3") {
    const provider = traceGenerativeAnswerProvider(resolveGenerativeSearchAnswerProvider(process.env, {
      locale: businessQuestionSet.locale,
      region: businessQuestionSet.region
    }), input.trace, "initial_answer_provider_call");
    const collected = await tracePaidV3DirectStep(input.trace, "initial_answer_collection", {
      phase: "grounded_answer_synthesis", configuredMaxAttempts: 1
    }, () => resolveGenerativeAnswerFirstV3({
      questionSet: businessQuestionSet,
      provider,
      locale: businessQuestionSet.locale,
      region: businessQuestionSet.region,
      targetUrl: input.targetUrl,
      targetAliases: businessQuestionSet.identityExclusions,
      seededQ1: prospectiveTeaser?.seededQ1,
      checkpoint: checkpoint.answerFirstV3,
      trace: input.trace,
      ...(semanticValidation === "deferred"
        ? { semanticValidation: "deferred" as const }
        : semanticValidation === "free_direct"
          ? { semanticValidation: "free_direct" as const }
          : {}),
      signal: input.signal,
      saveCheckpoint: async (answerFirstV3) => {
        const next = { ...checkpoint, answerFirstV3 };
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "grounded_answer_synthesis", progress: 90, checkpoint: next as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
    }));
    input.trace?.emit("checkpoint_observed", "initial_answer_collection", {
      phase: "grounded_answer_synthesis",
      providerCallCount: collected.checkpoint.answerResults?.slice(1).filter(Boolean).length ?? 0
    });
    generativeCheckpoint = collected.checkpoint;
  }
  // Public-search authority and retrieval belong to the audit sidecar. Resolve
  // them only after the ordinary answers have been safely checkpointed.
  const runtime = await tracePaidV3DirectStep(input.trace, "public_search_runtime_resolution", {
    phase: "public_source_preflight"
  }, () => resolveProductionPublicSearchRuntime({ environment: process.env, getAuthority: getActivePublicSearchSurfaceAuthority }));
  const priorProviderDiscovery = checkpoint.providerDiscovery ?? null;
  // Mid-job resume freezes identity from the checkpoint so JSON round-trips of the
  // website foundation cannot invalidate already-completed discovery stages.
  const evidenceCutoffAt = priorProviderDiscovery?.evidenceCutoffAt ?? new Date().toISOString();
  const websiteFoundationHash = priorProviderDiscovery?.websiteFoundationHash ?? stableJsonHash(input.websiteFoundation);
  const providerContext = createProductionProviderDiscoveryContext({
    runtime,
    questionSet: businessQuestionSet,
    artifactContract: input.job.artifactContract === "combined_geo_report_v3" ? "combined_geo_report_v3" : "combined_geo_report_v2",
    websiteCategories: [input.websiteFoundation.organizationProfile.businessModel ?? "", ...input.websiteFoundation.organizationProfile.productsAndServices].filter(Boolean),
    websiteFoundationHash,
    workerId: `provider-discovery:${input.job.id}:${input.workerId}`,
    evidenceCutoffAt,
    extractionClient: client,
    extractionModel: client.configuredModel,
    trace: input.trace,
    forceSnapshotRefreshAfter: input.forceSnapshotRefreshAfter,
    getCheckpoint: async () => checkpoint.providerDiscovery ?? null,
    saveCheckpoint: async (providerDiscovery) => {
      input.trace?.emit("phase_transition", "provider_discovery", { phase: providerDiscovery.phase });
      const next = { ...checkpoint, providerDiscovery };
      const updated = await input.checkpointJob({ stage: "synthesizing", phase: providerDiscovery.phase === "complete" ? "grounded_answer_synthesis" : providerDiscovery.phase, progress: providerPhaseProgress(providerDiscovery.phase), checkpoint: next as JobCheckpoint, ...input.coverage });
      checkpoint = normalizeCheckpoint(updated.checkpoint);
    }
  });
  const providerDiscoveryIdentity = priorProviderDiscovery
    ? identityFromProviderDiscoveryCheckpoint(priorProviderDiscovery)
    : providerContext.identity;
  const providerResult = await tracePaidV3DirectStep(input.trace, "provider_discovery", {
    phase: "provider_discovery_search"
  }, () => runProviderDiscoveryPipeline({
    identity: providerDiscoveryIdentity,
    dependencies: providerContext.dependencies,
    hardDeadlineAt: new Date(Date.now() + Math.max(1_000, input.remainingMs)).toISOString(),
    signal: input.signal,
    trace: input.trace
  }));
  input.signal?.throwIfAborted();
  const dependencies = createWorkerPublicSourceForensicsDependencies({
    job: input.job,
    workerId: input.workerId,
    coverage: input.coverage,
    readCheckpoint: () => checkpoint,
    onCheckpointSaved: async (next) => { checkpoint = next; },
    checkpointJob: input.checkpointJob,
    retrieveSource: createWorkerPublicSourceRetriever(),
    artifactReadiness: { async verify() { /* canonical combined V2 readiness runs below */ } },
    publicSourceBudget,
    forceSnapshotRefreshAfter: input.forceSnapshotRefreshAfter,
    liveDrill: input.liveDrill,
    semanticValidation: semanticValidation === "deferred" ? "deferred" : "legacy",
    signal: input.signal,
    collaborators: { resolveSnapshot: providerContext.resolveForensicSnapshot, getReport: getSourceForensicReportForJob, saveReport: saveSourceForensicReport }
  }, runtime);
  const forensicResult = publicSourceSynthesisResume(checkpoint) ?? await tracePaidV3DirectStep(input.trace, "public_source_forensics", {
    phase: "source_retrieval"
  }, () => runPublicSourceForensicsPipeline({
      reportId: input.job.reportId,
      jobId: input.job.id,
      ...resolvePublicSourceRunScope(dependencies),
      targetUrl: input.targetUrl,
      websiteFoundation: input.websiteFoundation,
      businessQuestionSet,
      dependencies,
      fanoutOverrides: new Map([[providerContext.discoveryFanout.questionId, providerContext.discoveryFanout]]),
      ...(semanticValidation === "deferred" ? { semanticValidation: "deferred" as const } : {}),
      trace: input.trace,
      signal: input.signal
    }));
  if (input.job.artifactContract === "combined_geo_report_v2" && forensicResult.report.commercialOutcome !== "completed") throw new Error("V2 combined activation requires complete claim-bound public-source coverage.");
  if (input.job.artifactContract === "combined_geo_report_v3") {
    const verificationSnapshotId = providerResult.checkpoint.verificationSnapshotId;
    if (!verificationSnapshotId) throw new OrchestrationInvariantError("V3 provider verification snapshot is unavailable before answer synthesis.");
    const storedSources = await tracePaidV3DirectStep(input.trace, "answer_evidence_source_load", {
      phase: "grounded_answer_synthesis", snapshotCount: forensicResult.report.snapshotRefs.length + 1
    }, () => loadAnswerFirstV3StoredSources([
      verificationSnapshotId,
      ...forensicResult.report.snapshotRefs.map(({ snapshotId }) => snapshotId)
    ]));
    const provider = traceGenerativeAnswerProvider(resolveGenerativeSearchAnswerProvider(process.env, {
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region
    }), input.trace, "grounded_answer_provider_call");
    const answerInput = {
      questionSet: businessQuestionSet,
      provider,
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region,
      targetUrl: input.targetUrl,
      targetAliases: businessQuestionSet.identityExclusions,
      competitors: forensicResult.report.sourceGraph.entities
        .filter(({ status }) => status === "resolved")
        .map(({ entityId, canonicalName }) => ({ entityId, aliases: [canonicalName] })),
      auditSources: storedSources,
      targetPages: input.technicalReport.pages,
      seededQ1: prospectiveTeaser?.seededQ1,
      checkpoint: generativeCheckpoint ?? checkpoint.answerFirstV3,
      trace: input.trace,
      signal: input.signal,
      saveCheckpoint: async (answerFirstV3: AnswerFirstV3CheckpointV2) => {
        const next = { ...checkpoint, answerFirstV3 };
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "grounded_answer_synthesis", progress: 98, checkpoint: next as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
    };
    // resolveGenerativeAnswerFirstV3 is overloaded; keep runtime selection and only time/log the call.
    const answerResult = await tracePaidV3DirectStep(input.trace, "grounded_answer_collection", {
      phase: "grounded_answer_synthesis", configuredMaxAttempts: semanticValidation === "free_direct" ? 1 : undefined
    }, async (): Promise<DeferredGenerativeAnswerFirstV3 | ResolvedGenerativeAnswerFirstV3> => {
      if (semanticValidation === "deferred") {
        return resolveGenerativeAnswerFirstV3({ ...answerInput, semanticValidation: "deferred" });
      }
      if (semanticValidation === "free_direct") {
        return resolveGenerativeAnswerFirstV3({ ...answerInput, semanticValidation: "free_direct" });
      }
      return resolveGenerativeAnswerFirstV3(answerInput);
    });
    input.trace?.emit("checkpoint_observed", "grounded_answer_collection", {
      phase: "grounded_answer_synthesis",
      providerCallCount: answerResult.checkpoint.answerResults?.slice(1).filter(Boolean).length ?? 0
    });
    const snapshotRefs = await tracePaidV3DirectStep(input.trace, "commercial_snapshot_binding", {
      phase: "grounded_answer_synthesis", snapshotCount: 4
    }, async () => {
      const verificationRef = await providerVerificationCommercialRef(verificationSnapshotId);
      const values = uniqueSnapshotRefs([...forensicResult.commercialSnapshotRefs, verificationRef]);
      if (values.length !== 4) throw new OrchestrationInvariantError("V3 combined reports require exactly four immutable market snapshots.");
      return values;
    });
    if (semanticValidation === "deferred") {
      const deferredAnswerResult = answerResult as DeferredGenerativeAnswerFirstV3;
      if (!prospectiveTeaser || !Array.isArray(deferredAnswerResult.answerCardDrafts) ||
          deferredAnswerResult.answerCardDrafts.length !== 3) {
        throw new OrchestrationInvariantError("Reviewed Paid V3 requires deferred answer drafts and its reviewed Free lineage.");
      }
      const reviewDraftCards = [
        prospectiveTeaser.reviewedFreeQ1,
        deferredAnswerResult.answerCardDrafts[1],
        deferredAnswerResult.answerCardDrafts[2]
      ] as const;
      const modelRuntime = loadReportV4ModelRuntimeConfig(process.env);
      const diagnosisResult = await enhanceV3AnswerCardsWithDiagnosis({
        answerCards: reviewDraftCards,
        checkpoint: answerResult.checkpoint,
        questionSetIdentity: businessQuestionSet.contentHash,
        admission: prospectiveTeaser.admission,
        locale: runtime.authority.surface.locale,
        provider: createReportV4MimoDiagnosisProvider({ environment: process.env }),
        modelRuntime,
        semanticValidation: "deferred",
        signal: input.signal,
        saveCheckpoint: async (answerFirstV3) => {
          const next = { ...checkpoint, answerFirstV3 };
          const updated = await input.checkpointJob({
            stage: "synthesizing",
            phase: "grounded_answer_synthesis",
            progress: 98,
            checkpoint: next as JobCheckpoint,
            ...input.coverage
          });
          checkpoint = normalizeCheckpoint(updated.checkpoint);
        }
      });
      const semanticDraft = prepareCombinedGeoReportV3SemanticDraft({
        artifactRevisionId: pending.artifactRevisionId,
        artifactRevision: pending.artifactRevision,
        reportId: input.job.reportId,
        orderId: pending.orderId,
        jobId: input.job.id,
        originalPaidJobId: input.originalPaidJobId ?? input.job.id,
        targetUrl: input.targetUrl,
        technicalReport: input.technicalReport,
        aiReport: input.websiteFoundation,
        evidenceAssets,
        businessQuestionSet,
        answerCards: diagnosisResult.answerCards,
        engineProvenance: diagnosisResult.checkpoint.engineProvenance,
        publicSourceForensics: forensicResult.report,
        providerDiscovery: providerResult.providerDiscovery
      });
      const semanticAuthorities = buildPaidV3SemanticAuthorities({
        answerCards: diagnosisResult.answerCards,
        questionSet: businessQuestionSet,
        targetUrl: input.targetUrl,
        foundation: input.websiteFoundation,
        admission: prospectiveTeaser.admission,
        targetPages: input.technicalReport.pages,
        storedSources,
        sourceHash: diagnosisResult.checkpoint.sourceHash,
        modelId: modelRuntime.modelProfile.operations.websiteSynthesis.model
      });
      const reviewedFreeQ1Annotation = paidV3ReviewedFreeQ1Annotation(
        prospectiveTeaser.reviewedFreeCheckpoint
      );
      const authorityBindings = buildPaidV3ReviewAuthorityBindings({
        rootMarker: "report-semantic-review-v1",
        artifactIdentity: paidV3ArtifactIdentity(semanticDraft),
        reviewedFreeCheckpoint: prospectiveTeaser.reviewedFreeCheckpoint,
        answerCheckpoint: diagnosisResult.checkpoint,
        commercialSnapshotRefs: snapshotRefs,
        publicSourceForensics: semanticDraft.publicSourceForensics,
        providerDiscovery: semanticDraft.providerDiscovery,
        technicalFoundation: input.technicalReport,
        aiFoundation: input.websiteFoundation,
        evidenceAssets
      });
      const structuredReviewer = createReportV4MimoStructuredInvoker({
        environment: process.env,
        lockedRuntime: modelRuntime
      });
      const stageTimings: Record<string, string | number> = {
        ...(diagnosisResult.checkpoint.paidV3DiagnosisStageTimings ?? {}),
        finalSynthesisStartedAt: new Date().toISOString()
      };
      const writePaidV3Meta = async (
        metrics: import("./paid-v3-compact-review-input").PaidV3TransportTokenBreakdown | undefined,
        timings: Record<string, string | number>
      ) => {
        const updated = await input.checkpointJob({
          stage: "synthesizing",
          phase: "grounded_answer_synthesis",
          progress: 98,
          checkpoint: {
            ...checkpoint,
            answerFirstV3: diagnosisResult.checkpoint,
            paidV3Review: {
              ...(metrics ? { transportMetrics: metrics } : {}),
              ...(checkpoint.paidV3Review?.transportMetrics && !metrics
                ? { transportMetrics: checkpoint.paidV3Review.transportMetrics }
                : {}),
              stageTimings: timings
            }
          } as JobCheckpoint,
          ...input.coverage
        });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      };
      let reviewed: Awaited<ReturnType<typeof runPaidV3SemanticReview>>;
      try {
        reviewed = await runPaidV3SemanticReview({
          report: semanticDraft,
          manifest: { ...semanticAuthorities.manifest, authorityBindings },
          sourceSelectionContext: semanticAuthorities.sourceSelectionContext,
          answerResults: diagnosisResult.checkpoint.answerResults,
          reviewedFreeQ1: prospectiveTeaser.reviewedFreeQ1,
          reviewedFreeQ1Annotation,
          sourceDictionary: semanticAuthorities.sourceDictionary,
          packets: diagnosisResult.checkpoint.packetsByQuestion ?? {},
          onTransportMetrics: (metrics) => writePaidV3Meta(metrics, {
            ...stageTimings,
            finalSynthesisBudgetCheckedAt: new Date().toISOString()
          }),
          reviewer: {
            review: ({ systemText, inputText, signal }) => structuredReviewer.invoke({
              operation: "websiteSynthesis",
              systemText,
              inputText,
              signal: signal ?? new AbortController().signal
            })
          },
          signal: input.signal
        });
      } catch (error) {
        stageTimings.finalSynthesisCompletedAt = new Date().toISOString();
        await writePaidV3Meta(checkpoint.paidV3Review?.transportMetrics, stageTimings);
        throw error;
      }
      stageTimings.finalSynthesisCompletedAt = new Date().toISOString();
      await writePaidV3Meta(reviewed.transportMetrics, stageTimings);
      const receipt = reviewed.report.semanticReviewReceipt;
      if (!receipt) throw new OrchestrationInvariantError("Reviewed Paid V3 report receipt is unavailable.");
      const semanticReview: PaidV3SemanticReviewCheckpointProjection = {
        version: "report-semantic-review-v1",
        input: reviewed.input,
        output: reviewed.output,
        applied: {
          fields: reviewed.applied.fields,
          annotations: reviewed.applied.annotations,
          receipt
        },
        finalReviewedReportProjectionHash: receipt.finalReviewedReportProjectionHash
      };
      const pendingArtifactVerification = {
        report: reviewed.report,
        commercialSnapshotRefs: snapshotRefs,
        semanticReview
      };
      await executeReviewedPaidV3ArtifactBoundary({
        persistedReport: reviewed.report,
        persistCheckpoint: async () => {
          const next = {
            ...checkpoint,
            answerFirstV3: diagnosisResult.checkpoint,
            pendingArtifactVerification
          };
          const updated = await input.checkpointJob({
            stage: "synthesizing",
            phase: "artifact_verification",
            progress: 99,
            checkpoint: next as JobCheckpoint,
            ...input.coverage
          });
          checkpoint = normalizeCheckpoint(updated.checkpoint);
          const persisted = checkpoint.pendingArtifactVerification;
          if (!persisted ||
              hashReportSemanticReviewValue(checkpoint.answerFirstV3) !== hashReportSemanticReviewValue(diagnosisResult.checkpoint) ||
              hashReportSemanticReviewValue(persisted.report) !== hashReportSemanticReviewValue(reviewed.report) ||
              hashReportSemanticReviewValue(persisted.commercialSnapshotRefs) !== hashReportSemanticReviewValue(snapshotRefs) ||
              hashReportSemanticReviewValue(persisted.semanticReview) !== hashReportSemanticReviewValue(semanticReview)) {
            throw new Error("Reviewed Paid V3 artifact checkpoint did not persist its exact atomic projection.");
          }
          input.liveDrill?.inject({ jobId: input.job.id, fault: "artifact" });
        },
        verifyProjection: (report) => verifyReviewedPaidV3CheckpointProjection({
          report,
          checkpoint: diagnosisResult.checkpoint,
          semanticReview,
          reviewedFreeQ1: prospectiveTeaser.reviewedFreeQ1,
          reviewedFreeQ1Annotation,
          expectedAuthorityBindings: authorityBindings
        }),
        materialize: () => materializePreparedCombinedArtifactV3(reviewed.report, evidenceAssets, {
          semanticValidation: "deferred",
          reviewedReceiptVerified: true
        }),
        terminalize: (ready) => terminalizeReadyCombinedArtifact(
          input,
          ready,
          diagnosisResult.checkpoint.identityHash,
          snapshotRefs,
          "deferred"
        )
      });
      return;
    }
    if (semanticValidation === "free_direct") {
      if (!prospectiveTeaser || !("answerCards" in answerResult)) {
        throw new OrchestrationInvariantError("Direct Paid V3 requires its completed Free lineage and three Direct answer cards.");
      }
      const sourceSelectionDiagnosis = answerResult.checkpoint.sourceSelectionDiagnosis;
      if (!sourceSelectionDiagnosis) throw new OrchestrationInvariantError("Direct Paid V3 requires its existing source-selection diagnosis.");
      const directSemantics = await buildPaidV3DirectSemantics({
        questionSet: businessQuestionSet,
        answerCards: answerResult.answerCards,
        answerCheckpoint: answerResult.checkpoint,
        freeCheckpoint: prospectiveTeaser.reviewedFreeCheckpoint,
        admission: prospectiveTeaser.admission,
        targetUrl: input.targetUrl,
        foundation: input.websiteFoundation,
        locale: runtime.authority.surface.locale,
        signal: input.signal,
        trace: input.trace
      });
      const ready = await tracePaidV3DirectStep(input.trace, "combined_artifact_readiness", {
        phase: "artifact_verification"
      }, () => buildReadyCombinedArtifactV3({
        artifactRevisionId: pending.artifactRevisionId,
        artifactRevision: pending.artifactRevision,
        reportId: input.job.reportId,
        orderId: pending.orderId,
        jobId: input.job.id,
        originalPaidJobId: input.originalPaidJobId ?? input.job.id,
        targetUrl: input.targetUrl,
        technicalReport: input.technicalReport,
        aiReport: input.websiteFoundation,
        evidenceAssets,
        businessQuestionSet,
        answerCards: answerResult.answerCards,
        sourceSelectionDiagnosis,
        engineProvenance: answerResult.checkpoint.engineProvenance,
        publicSourceForensics: forensicResult.report,
        providerDiscovery: providerResult.providerDiscovery,
        directSemantics,
        onReportPrepared: async (report) => {
          const next = { ...checkpoint, answerFirstV3: answerResult.checkpoint, pendingArtifactVerification: { report, commercialSnapshotRefs: snapshotRefs } };
          const updated = await input.checkpointJob({ stage: "synthesizing", phase: "artifact_verification", progress: 99, checkpoint: next as JobCheckpoint, ...input.coverage });
          checkpoint = normalizeCheckpoint(updated.checkpoint);
        }
      }, { semanticValidation: "free_direct", trace: input.trace }));
      await tracePaidV3DirectStep(input.trace, "terminalization", {
        phase: "terminalization", artifactState: "ready"
      }, () => terminalizeReadyCombinedArtifact(input, ready, answerResult.checkpoint.identityHash, snapshotRefs, "free_direct"));
      input.trace?.emit("job_terminal", "fulfillment_completed", {
        phase: "terminalization", artifactState: "active", fulfillmentState: "completed", refundState: "not_required"
      });
      return;
    }
    if (!("answerCards" in answerResult)) {
      throw new OrchestrationInvariantError("Legacy Paid V3 requires complete legacy answer cards.");
    }
    const sourceSelectionDiagnosis = answerResult.checkpoint.sourceSelectionDiagnosis;
    if (!sourceSelectionDiagnosis) throw new OrchestrationInvariantError("Prospective V3 artifact requires source selection diagnosis.");
    const diagnosisResult = prospectiveTeaser
      ? await enhanceV3AnswerCardsWithDiagnosis({
          answerCards: answerResult.answerCards,
          checkpoint: answerResult.checkpoint,
          questionSetIdentity: businessQuestionSet.contentHash,
          admission: prospectiveTeaser.admission,
          locale: runtime.authority.surface.locale,
          provider: createReportV4MimoDiagnosisProvider({ environment: process.env }),
          modelRuntime: loadReportV4ModelRuntimeConfig(process.env),
          signal: input.signal,
          saveCheckpoint: async (answerFirstV3) => {
            const next = { ...checkpoint, answerFirstV3 };
            const updated = await input.checkpointJob({
              stage: "synthesizing",
              phase: "grounded_answer_synthesis",
              progress: 98,
              checkpoint: next as JobCheckpoint,
              ...input.coverage
            });
            checkpoint = normalizeCheckpoint(updated.checkpoint);
          }
        })
      : { answerCards: answerResult.answerCards, checkpoint: answerResult.checkpoint };
    const ready = await buildReadyCombinedArtifactV3({
      artifactRevisionId: pending.artifactRevisionId,
      artifactRevision: pending.artifactRevision,
      reportId: input.job.reportId,
      orderId: pending.orderId,
      jobId: input.job.id,
      originalPaidJobId: input.originalPaidJobId ?? input.job.id,
      targetUrl: input.targetUrl,
      technicalReport: input.technicalReport,
      aiReport: input.websiteFoundation,
      evidenceAssets,
      businessQuestionSet,
      answerCards: diagnosisResult.answerCards,
      sourceSelectionDiagnosis,
      engineProvenance: diagnosisResult.checkpoint.engineProvenance,
      publicSourceForensics: forensicResult.report,
      providerDiscovery: providerResult.providerDiscovery,
      onReportPrepared: async (report) => {
        const next = { ...checkpoint, pendingArtifactVerification: { report, commercialSnapshotRefs: snapshotRefs } };
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "artifact_verification", progress: 99, checkpoint: next as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
    });
    await terminalizeReadyCombinedArtifact(input, ready, diagnosisResult.checkpoint.identityHash, snapshotRefs, "legacy");
    return;
  }
  const groundedAnswerEvidence = groundedEvidenceFromForensic(forensicResult.report);
  const questionIds = forensicResult.report.questions.questions.slice(1).map(({ id }) => id) as [string, string];
  const groundedAnswers = await synthesizeGroundedBusinessAnswersV2(client, {
    questionSet: businessQuestionSet,
    questionIds,
    evidence: groundedAnswerEvidence,
    locale: forensicResult.report.locale,
    signal: input.signal
  });
  const ready = await buildReadyCombinedArtifactV2({
    artifactRevisionId: pending.artifactRevisionId,
    artifactRevision: pending.artifactRevision,
    reportId: input.job.reportId,
    orderId: pending.orderId,
    jobId: input.job.id,
    originalPaidJobId: input.originalPaidJobId ?? input.job.id,
    targetUrl: input.targetUrl,
    technicalReport: input.technicalReport,
    aiReport: input.websiteFoundation,
    evidenceAssets,
    businessQuestionSet,
    businessQuestionAnswers: groundedAnswers,
    groundedAnswerEvidence,
    publicSourceForensics: forensicResult.report,
    providerDiscovery: providerResult.providerDiscovery
  });
  const verificationSnapshotId = providerResult.checkpoint.verificationSnapshotId;
  if (!verificationSnapshotId) throw new Error("V2 provider verification snapshot is unavailable at terminalization.");
  const verificationRef = await providerVerificationCommercialRef(verificationSnapshotId);
  const snapshotRefs = uniqueSnapshotRefs([...forensicResult.commercialSnapshotRefs, verificationRef]);
  if (snapshotRefs.length !== 4) throw new Error("V2 combined reports require exactly four immutable market snapshots.");
  const terminalInput = {
    report: ready.report,
    workerId: input.workerId,
    checkpointIdentityHash: providerResult.checkpoint.identityHash,
    snapshotRefs,
    htmlSha256: ready.htmlSha256,
    pdfSha256: ready.pdfSha256,
    pdfStorageKey: ready.pdfStorageKey,
    pageCount: ready.pageCount
  };
  await terminalizePaidCombinedReport(terminalInput);
}

async function terminalizeReadyCombinedArtifact(
  input: Parameters<typeof finalizeProviderDiscoveryCombinedJob>[0],
  ready: Awaited<ReturnType<typeof buildReadyCombinedArtifactV3>>,
  checkpointIdentityHash: string,
  snapshotRefs: PublicSourceCommercialSnapshotRef[],
  semanticValidation: "legacy" | "deferred" | "free_direct"
): Promise<void> {
  const terminalInput = { report: ready.report, workerId: input.workerId, checkpointIdentityHash, snapshotRefs,
    htmlSha256: ready.htmlSha256, pdfSha256: ready.pdfSha256, pdfStorageKey: ready.pdfStorageKey, pageCount: ready.pageCount,
    semanticValidation, trace: input.trace };
  await terminalizePaidCombinedReport(terminalInput);
}

function isCombinedGeoReportV3(value: RecommendationForensicReportV2 | CombinedGeoReportV3 | undefined): value is CombinedGeoReportV3 {
  return Boolean(value && "artifactContract" in value && value.artifactContract === "combined_geo_report_v3");
}

function groundedEvidenceFromForensic(report: RecommendationForensicReportV2): GroundedAnswerEvidence[] {
  const questionFanouts = report.questions.questions.slice(1).map((question) => ({ question, queryIds: new Set(report.fanouts.find(({ questionId }) => questionId === question.id)?.queries.map(({ id }) => id) ?? []) }));
  return questionFanouts.flatMap(({ question, queryIds }) => report.sourceGraph.evidence.flatMap((evidence) => {
    if (!evidence.queryVariantIds.some((id) => queryIds.has(id)) || !evidence.verifiedExcerpt) return [];
    return [{ evidenceId: evidence.evidenceId, questionId: question.id, subjectKey: `question:${question.id}`, registrableDomain: evidence.registrableDomain,
      exactExcerpt: evidence.verifiedExcerpt, eligible: evidence.retrievalReadiness.ready, direct: evidence.retrievalReadiness.ready && !evidence.metadataOnly }];
  }));
}

async function providerVerificationCommercialRef(snapshotId: string): Promise<PublicSourceCommercialSnapshotRef> {
  const bundle = await getMarketSnapshotBundle(snapshotId);
  if (!bundle || bundle.snapshot.status !== "completed") throw new Error("Provider verification snapshot is not complete.");
  const actualCostMicros = bundle.attempts.reduce((total, attempt) => total + (attempt.providerCostMicros ?? 0), 0);
  return { snapshotId, cacheIdentity: bundle.snapshot.cacheIdentity, freshnessState: "fresh", actualCostMicros, allocatedCostMicros: actualCostMicros, avoidedCostMicros: 0 };
}

function uniqueSnapshotRefs(values: PublicSourceCommercialSnapshotRef[]): PublicSourceCommercialSnapshotRef[] {
  return [...new Map(values.map((value) => [value.snapshotId, value])).values()];
}

async function loadAnswerFirstV3StoredSources(snapshotIds: readonly string[]): Promise<AnswerFirstV3StoredSource[]> {
  const output: AnswerFirstV3StoredSource[] = [];
  for (const snapshotId of [...new Set(snapshotIds)]) {
    const bundle = await getMarketSnapshotBundle(snapshotId);
    if (!bundle) throw new Error("V3 answer evidence snapshot is unavailable.");
    const observations = new Map(bundle.observations.map((observation) => [observation.id, observation]));
    for (const source of bundle.sources) {
      const observation = observations.get(source.observationId);
      if (!observation) continue;
      if (!isAnswerFirstSourceCategory(source.sourceCategory)) continue;
      output.push({
        sourceEvidenceId: source.id,
        observationId: source.observationId,
        queryId: observation.queryId,
        canonicalUrl: source.canonicalUrl,
        title: observation.title,
        registrableDomain: source.registrableDomain,
        exactExcerpt: source.excerpt,
        sourceCategory: source.sourceCategory,
        observedAt: observation.observedAt.toISOString(),
        retrievalReady: source.retrievalState === "available" && Boolean(source.excerpt),
        snapshotKind: bundle.snapshot.snapshotKind as AnswerFirstV3StoredSource["snapshotKind"]
      });
    }
  }
  return output;
}

function isAnswerFirstSourceCategory(value: string): value is AnswerFirstV3StoredSource["sourceCategory"] {
  return ["company_owned", "earned_editorial", "directory_or_reference", "community_or_ugc", "institution", "social", "unknown"].includes(value);
}

function providerPhaseProgress(phase: ProviderDiscoveryCheckpointV1["phase"]): number {
  const values: Record<ProviderDiscoveryCheckpointV1["phase"], number> = { provider_discovery_search: 91, candidate_resolution: 92, candidate_verification: 93,
    provider_source_retrieval: 94, provider_passage_selection: 95, provider_claim_extraction: 96, provider_qualification: 97, grounded_answer_synthesis: 98, complete: 98 };
  return values[phase];
}

/**
 * Report chrome uses compact locales (for example `zh`), while the certified
 * public-search surface owns its exact provider locale (for example `zh-CN`).
 * V2 questions, snapshots, and artifacts must be bound to that surface.
 */
export function resolvePublicSourceRunScope(dependencies: Pick<PublicSourceForensicsDependencies, "authority">): { locale: string; region: string } {
  return { locale: dependencies.authority.surface.locale, region: dependencies.authority.surface.region };
}

export interface WorkerPublicSourceForensicsCollaborators {
  resolveSnapshot: typeof resolvePublicSourceSnapshot;
  getReport: typeof getSourceForensicReportForJob;
  saveReport: typeof saveSourceForensicReport;
}

export interface WorkerPublicSourceForensicsDependencyInput {
  job: Pick<ScanJobRow, "id" | "reportId">;
  workerId: string;
  coverage: { plannedPages: number; successfulPages: number; failedPages: number };
  readCheckpoint: () => WorkerCheckpoint;
  onCheckpointSaved: (checkpoint: WorkerCheckpoint) => Promise<void>;
  checkpointJob: WorkerCheckpointWriter;
  retrieveSource?: PublicSourceRetriever;
  artifactReadiness?: ArtifactReadinessGate;
  forceSnapshotRefreshAfter?: string;
  publicSourceBudget?: PublicSourceAttemptBudget;
  liveDrill?: StagingLiveDrill;
  semanticValidation?: "legacy" | "deferred";
  signal?: AbortSignal;
  collaborators?: WorkerPublicSourceForensicsCollaborators;
}

/**
 * Creates the job-bound V2 collaborators used by the Worker only.  The report
 * remains deferred so `terminalizePaidPublicSourceReport` is the sole writer
 * of report, snapshot binding, job, refund, and email terminal state.
 */
export function createWorkerPublicSourceForensicsDependencies(
  input: WorkerPublicSourceForensicsDependencyInput,
  runtime: { adapter: PublicSearchSurfaceAdapter; authority: PublicSearchSurfaceAuthority }
): PublicSourceForensicsDependencies {
  if (!input.retrieveSource || !input.artifactReadiness) {
    throw new PublicSourceAuthorityUnavailableError("Required public-source Worker collaborator is unavailable.");
  }
  const collaborators = input.collaborators ?? {
    resolveSnapshot: resolvePublicSourceSnapshot,
    getReport: getSourceForensicReportForJob,
    saveReport: saveSourceForensicReport
  };
  const requireJob = (jobId: string) => {
    if (jobId !== input.job.id) throw new PublicSourceAuthorityUnavailableError("Public-source collaborator job identity mismatch.");
  };
  return {
    authority: runtime.authority,
    resolveSnapshot: async ({ questionId, fanout, evidenceCutoffAt, retrievalGate }) => collaborators.resolveSnapshot({
      authority: runtime.authority,
      adapter: runtime.adapter,
      question: questionFromFanout(questionId, fanout),
      fanout,
      evidenceCutoffAt,
      leaseOwner: `public-source:${input.job.id}:${input.workerId}`,
      retrieveSource: input.retrieveSource,
      retrievalGate,
      forceRefreshAfter: input.forceSnapshotRefreshAfter,
      ...(input.publicSourceBudget ? { executionBudget: input.publicSourceBudget } : {}),
      signal: input.signal
    }),
    resolveSnapshotById: async ({ snapshotId, questionId, fanout, retrievalGate }) => {
      // A retry must reuse the exact snapshots its prior attempt persisted,
      // even when their completed_at is later than the job's evidence cutoff.
      // Verify the exact ID first, then let the standard resolver materialize
      // that same snapshot by searching with a cutoff that includes it.
      const bundle = await getMarketSnapshotBundle(snapshotId);
      if (!bundle || bundle.snapshot.status !== "completed" || !bundle.snapshot.completedAt) return null;
      if (bundle.snapshot.surfaceAuthorityVersion !== runtime.authority.authorityId) return null;
      const resolved = await collaborators.resolveSnapshot({
        authority: runtime.authority,
        adapter: runtime.adapter,
        question: questionFromFanout(questionId, fanout),
        fanout,
        evidenceCutoffAt: bundle.snapshot.completedAt.toISOString(),
        leaseOwner: `public-source:${input.job.id}:${input.workerId}`,
        retrieveSource: input.retrieveSource,
        retrievalGate,
        ...(input.publicSourceBudget ? { executionBudget: input.publicSourceBudget } : {}),
        signal: input.signal
      });
      return resolved.snapshotId === snapshotId ? resolved : null;
    },
    getCheckpoint: async (jobId) => {
      requireJob(jobId);
      return input.readCheckpoint().publicSourceForensics ?? null;
    },
    saveCheckpoint: async (jobId, publicSourceForensics) => {
      requireJob(jobId);
      const next = { ...input.readCheckpoint(), publicSourceForensics };
      input.signal?.throwIfAborted();
      const updated = await input.checkpointJob({
        stage: "synthesizing", phase: "source_retrieval",
        progress: 95,
        checkpoint: next as JobCheckpoint,
        ...input.coverage
      });
      await input.onCheckpointSaved(normalizeCheckpoint(updated.checkpoint));
    },
    ...(input.semanticValidation === "deferred" ? {} : {
      prepareArtifactVerification: async ({ jobId, report, checkpoint: publicSourceForensics, commercialSnapshotRefs }: {
        jobId: string;
        report: RecommendationForensicReportV2;
        checkpoint: PublicSourcePipelineCheckpoint;
        commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
      }) => {
        requireJob(jobId);
        const next = {
          ...input.readCheckpoint(),
          recommendationForensics: { questionsGenerated: true, reportSaved: true },
          publicSourceForensics,
          pendingArtifactVerification: { report, commercialSnapshotRefs }
        };
        input.signal?.throwIfAborted();
        const updated = await input.checkpointJob({
          stage: "synthesizing", phase: "artifact_verification", progress: 99,
          checkpoint: next as JobCheckpoint,
          ...input.coverage
        });
        await input.onCheckpointSaved(normalizeCheckpoint(updated.checkpoint));
        input.liveDrill?.inject({ jobId: input.job.id, fault: "artifact" });
      }
    }),
    getReport: async (jobId) => {
      requireJob(jobId);
      return collaborators.getReport(jobId);
    },
    saveReport: collaborators.saveReport,
    artifactReadiness: input.artifactReadiness,
    deferReportPersistence: true
  };
}

function questionFromFanout(questionId: string, fanout: SearchQueryFanout): CanonicalBuyerQuestion {
  if (questionId !== fanout.questionId || !fanout.questionSetVersion.trim()) {
    throw new PublicSourceAuthorityUnavailableError("Public-source fanout identity is invalid.");
  }
  const canonical = fanout.queries.find((query) => query.derivationRuleId === "query-canonical-v1" || query.derivationRuleId === "provider-discovery-canonical-v1");
  if (!canonical || canonical.questionId !== questionId || canonical.locale !== fanout.surface.locale || canonical.region !== fanout.surface.region) {
    throw new PublicSourceAuthorityUnavailableError("Public-source canonical query is unavailable.");
  }
  const normalizedText = canonical.exactQuery.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!normalizedText) throw new PublicSourceAuthorityUnavailableError("Public-source canonical query is empty.");
  return {
    id: questionId,
    questionSetVersion: fanout.questionSetVersion,
    locale: fanout.surface.locale,
    region: fanout.surface.region,
    kind: "supplier_discovery",
    exactText: normalizedText,
    normalizedText,
    derivation: { ruleId: "worker-fanout-canonical-v1", evidenceSourceIds: [], subject: normalizedText, broadened: false }
  };
}

function createWorkerPublicSourceRetriever(): PublicSourceRetriever {
  return async ({ observation, result, signal }): Promise<InjectedPublicSourceRetrieval> => {
    const fact = await executePublicSourceRetrieval({
      observationId: observation.observationId,
      queryId: observation.queryId,
      resultUrl: result.url
    }, { signal, excerptMode: "legacy_prefix" });
    return {
      fact,
      source: {
        retrievalState: fact.retrievalState === "available" ? "available" : "inaccessible",
        ...(fact.retrievalState === "available" ? {
          excerpt: fact.verifiedExcerpt ?? null,
          excerptHash: sourceEvidenceHash(fact.normalizedContentHash),
          contentHash: sourceEvidenceHash(fact.normalizedContentHash)
        } : {}),
        sourceCategory: "unknown",
        entities: fact.entityMentions ?? [],
        claims: fact.claims ?? [],
        contradictions: [],
        evidenceFamilyIdentity: createHash("sha256").update(fact.finalUrl ?? fact.resultUrl).digest("hex")
      }
    };
  };
}

/** The retrieval contract labels hashes with `sha256:`; the SQL evidence row
 * stores the fixed-width digest so its schema can validate it directly. */
export function sourceEvidenceHash(value: string | undefined): string | null {
  if (!value) return null;
  const digest = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  if (!/^[a-f0-9]{64}$/i.test(digest)) throw new Error("Public-source content hash must be a SHA-256 digest.");
  return digest.toLowerCase();
}

function createWorkerPublicSourceArtifactReadinessGate(): ArtifactReadinessGate {
  return createPublicSourceArtifactReadinessGate({
    loadTechnicalReport: async (reportId, jobId) => {
      const foundation = await getAiReport(reportId, "deep", "recommendation_forensics_v1");
      return foundation?.jobId === jobId ? foundation.technicalPayload ?? null : null;
    },
    materializePdf: async ({ html }) => exportCanonicalArtifactHtmlPdf(html)
  });
}

async function recordCommercialOutcomeSafely(
  jobId: string,
  outcome: "completed" | "completed_limited" | "failed",
  trace?: PaidV3DirectDebugTrace
): Promise<void> {
  try {
    await tracePaidV3DirectStep(trace, "commercial_outcome_reconciliation", {
      phase: "terminalization", outcome
    }, () => recordPaidJobOutcome({ jobId, outcome }));
  } catch (error) {
    trace?.degraded("commercial_outcome_reconciliation_required", {
      phase: "terminalization", outcome, disposition: "operator_reconciliation_required"
    }, error);
    console.error("Commercial outcome reconciliation required:", error instanceof Error ? error.name : "unknown_error");
  }
}

async function loadCompletedEvidence(job: ScanJobRow, planned: PlannedPage): Promise<StoredPageEvidence> {
  const current = await getCrawlEvidence(job.id, planned.url);
  if (!current?.normalizedContent) throw new Error("Completed crawl evidence is missing.");
  return storedEvidence(planned, current);
}

async function loadOrFetchEvidence(
  job: ScanJobRow,
  planned: PlannedPage,
  robotsPolicy: RobotsPolicy,
  signal?: AbortSignal
): Promise<StoredPageEvidence> {
  const current = await getCrawlEvidence(job.id, planned.url);
  const reusable = current?.normalizedContent ? current : await getReusableCrawlEvidence(job.reportId, planned.url);
  if (reusable?.normalizedContent) {
    const evidence = storedEvidence(planned, reusable);
    if (reusable.jobId !== job.id) {
      await saveCrawlEvidence({
        reportId: job.reportId,
        jobId: job.id,
        url: planned.url,
        canonicalUrl: reusable.canonicalUrl ?? undefined,
        pageType: planned.pageType,
        fetchStatus: "reused",
        httpStatus: reusable.httpStatus ?? undefined,
        contentHash: reusable.contentHash ?? undefined,
        normalizedContent: reusable.normalizedContent,
        evidenceExcerpts: reusable.evidenceExcerpts
      });
    }
    return evidence;
  }

  const fetched = await fetchEvidencePage(planned, robotsPolicy, signal);
  await saveCrawlEvidence({
    reportId: job.reportId,
    jobId: job.id,
    url: fetched.page.url,
    canonicalUrl: fetched.canonicalUrl,
    pageType: fetched.page.pageType,
    fetchStatus: fetched.browserRendered ? "browser" : "http",
    httpStatus: fetched.httpStatus,
    contentHash: fetched.contentHash,
    normalizedContent: fetched.page.text
  });
  return fetched;
}

function storedEvidence(
  planned: PlannedPage,
  reusable: NonNullable<Awaited<ReturnType<typeof getCrawlEvidence>>>
): StoredPageEvidence {
  return {
    page: {
      url: planned.url,
      pageType: planned.pageType,
      text: reusable.normalizedContent!,
      metadata: { reusedEvidence: "true" }
    },
    canonicalUrl: reusable.canonicalUrl ?? undefined,
    httpStatus: reusable.httpStatus ?? 200,
    contentHash: reusable.contentHash ?? ""
  };
}

async function saveFailedEvidence(job: ScanJobRow, url: string, pageType: PlannedPage["pageType"]) {
  await saveCrawlEvidence({ reportId: job.reportId, jobId: job.id, url, pageType, fetchStatus: "failed" });
}

async function persistAiReport(
  job: ScanJobRow,
  report: AiWebsiteReportV1,
  pages: StoredPageEvidence[],
  technicalPayload?: GeoAuditReport
) {
  await saveAiReport({
    reportId: job.reportId,
    jobId: job.id,
    tier: job.tier,
    productContract: job.productContract,
    locale: job.locale,
    payload: report,
    technicalPayload,
    model: report.provenance.modelId,
    promptVersion: AI_REPORT_PROMPT_VERSION,
    contentHash: report.provenance.contentHash
  });
  const quotesByUrl = new Map<string, string[]>();
  for (const finding of report.findings) {
    for (const citation of finding.evidence) {
      const quotes = quotesByUrl.get(citation.url) ?? [];
      if (!quotes.includes(citation.quote)) quotes.push(citation.quote);
      quotesByUrl.set(citation.url, quotes);
    }
  }
  for (const evidence of pages) {
    await saveCrawlEvidence({
      reportId: job.reportId,
      jobId: job.id,
      url: evidence.page.url,
      canonicalUrl: evidence.canonicalUrl,
      pageType: evidence.page.pageType,
      fetchStatus: "analyzed",
      httpStatus: evidence.httpStatus,
      contentHash: evidence.contentHash,
      normalizedContent: evidence.page.text,
      evidenceExcerpts: quotesByUrl.get(evidence.page.url) ?? []
    });
  }
}

function snapshotDiscovery(discovered: DiscoveredSite): DiscoverySnapshot {
  return {
    targetUrl: discovered.targetUrl,
    candidates: discovered.candidates,
    robotsPolicy: discovered.robotsPolicy,
    estimatedPages: discovered.estimatedPages
  };
}

function rankCandidates(candidates: DiscoveredSite["candidates"], selected: readonly PlannedPage[]): PlannedPage[] {
  const ranked = [...selected];
  const seen = new Set(selected.map(({ url }) => canonicalUrl(url)));
  for (const [index, candidate] of preparePlanningCandidates(candidates).entries()) {
    if (seen.has(canonicalUrl(candidate.url))) continue;
    ranked.push({
      url: candidate.url,
      pageType: candidate.pageType ?? inferPageType(candidate.url),
      priority: Math.max(1, 100 - index),
      reason: "Ranked replacement candidate"
    });
  }
  return ranked;
}

function normalizeCheckpoint(value: JobCheckpoint): WorkerCheckpoint {
  const raw = value as WorkerCheckpoint;
  const rankedCandidates = validPlannedPages(raw.rankedCandidates)
    ? raw.rankedCandidates
    : urlsToPlan(raw.rankedCandidateUrls ?? value.candidateUrls ?? []);
  const effectivePlan = validPlannedPages(raw.effectivePlan)
    ? raw.effectivePlan
    : urlsToPlan(raw.effectivePlannedUrls ?? value.plannedUrls ?? []);
  return {
    ...raw,
    rankedCandidates,
    rankedCandidateUrls: rankedCandidates.map(({ url }) => url),
    effectivePlan,
    effectivePlannedUrls: effectivePlan.map(({ url }) => url),
    completedCrawlUrls: raw.completedCrawlUrls ?? value.completedUrls ?? [],
    completedPageAnalyses: validCompletedAnalyses(raw.completedPageAnalyses),
    permanentFailures: raw.permanentFailures ?? [],
    transientAttemptCounts: raw.transientAttemptCounts ?? {},
    exhaustedTransientUrls: Array.isArray(raw.exhaustedTransientUrls) ? raw.exhaustedTransientUrls : []
  };
}

function validPlannedPages(value: unknown): value is PlannedPage[] {
  return Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof item.url === "string");
}

function validCompletedAnalyses(value: unknown): CompletedPageAnalysis[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CompletedPageAnalysis => Boolean(
    item && typeof item === "object" && typeof item.url === "string" &&
    typeof item.contentHash === "string" && item.analysis && typeof item.analysis === "object"
  ));
}

function urlsToPlan(urls: readonly string[]): PlannedPage[] {
  return urls.map((url, index) => ({
    url,
    pageType: inferPageType(url),
    priority: Math.max(1, 100 - index),
    reason: "Restored checkpoint candidate"
  }));
}

/**
 * Merge newly produced page analyses into the recoverable checkpoint set.
 * When `analysisAuthority` is provided (marker-present deferred), every new
 * entry is stamped. When omitted (marker-absent), identity is not written.
 */
export function mergeCompletedAnalyses(
  current: readonly CompletedPageAnalysis[],
  analyses: readonly PageAnalysis[],
  evidenceByUrl: Map<string, StoredPageEvidence> | ReadonlyMap<string, StoredPageEvidence>,
  analysisAuthority?: PageAnalysisAuthority
): CompletedPageAnalysis[] {
  const merged = new Map(current.map((stored) => [canonicalUrl(stored.url), stored]));
  for (const analysis of analyses) {
    const evidence = evidenceByUrl.get(canonicalUrl(analysis.url));
    if (!evidence) continue;
    merged.set(canonicalUrl(analysis.url), {
      url: analysis.url,
      contentHash: evidence.contentHash,
      analysis,
      ...(analysisAuthority ? { analysisAuthority } : {})
    });
  }
  return [...merged.values()];
}

function createConfiguredClient() {
  const baseUrl = process.env.OGC_AI_BASE_URL?.trim();
  const apiKey = process.env.OGC_AI_API_KEY?.trim();
  const model = process.env.OGC_AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) throw new Error("AI analysis is not configured on this deployment.");
  return createOpenAiCompatibleClient({
    baseUrl,
    apiKey,
    model,
    timeoutMs: configuredAiTimeoutMs(),
    useJsonResponseFormat: process.env.OGC_AI_JSON_RESPONSE_FORMAT === "true"
  });
}

function traceGenerativeAnswerProvider(provider: GenerativeSearchAnswerProvider, trace: PaidV3DirectDebugTrace | undefined,
  step: string): GenerativeSearchAnswerProvider {
  if (!trace) return provider;
  let ordinal = 0;
  return { providerId: provider.providerId, model: provider.model, searchMode: provider.searchMode,
    answerWithSources: (request) => trace.span(step, {
    phase: "grounded_answer_synthesis", providerCallOrdinal: ++ordinal, configuredMaxAttempts: 1,
    configuredModel: provider.model
  }, () => provider.answerWithSources(request)) };
}

function tracePaidV3DirectGate<T>(trace: PaidV3DirectDebugTrace | undefined, step: string,
  details: PaidV3DirectDebugTraceDetails, operation: () => T): T {
  const started = Date.now();
  trace?.emit("step_started", step, details);
  try {
    const value = operation();
    trace?.emit("step_succeeded", step, { ...details, durationMs: Date.now() - started });
    return value;
  } catch (error) {
    trace?.failed(step, { ...details, durationMs: Date.now() - started }, error);
    throw error;
  }
}

function fetchWithSignal(fetchImpl: typeof fetch, signal: AbortSignal): typeof fetch {
  return (input, init = {}) => fetchImpl(input, { ...init, signal });
}

function configuredAiTimeoutMs(): number {
  const configured = Number(process.env.OGC_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180_000;
}

/**
 * Foundation synthesis input identity.
 * Marker-absent: pages + analyses + coverage only (byte-stable vs prior).
 * Marker-present: also binds deferred authority and each entry's authority identity.
 */
export function hashSynthesisInput(
  pages: readonly StoredPageEvidence[],
  analyses: readonly PageAnalysis[],
  coverage: object,
  options?: {
    requiredDeferredAuthority?: DeferredPageAnalysisAuthority | null;
    completedEntries?: readonly CompletedPageAnalysis[];
  }
): string {
  const base = {
    pages: pages.map(({ page, contentHash }) => ({ url: canonicalUrl(page.url), contentHash }))
      .sort((left, right) => left.url.localeCompare(right.url)),
    analyses: analyses.map(({ url, ...analysis }) => ({ url: canonicalUrl(url), ...analysis }))
      .sort((left, right) => left.url.localeCompare(right.url)),
    coverage
  };
  if (!options?.requiredDeferredAuthority) {
    return createHash("sha256").update(JSON.stringify(base)).digest("hex");
  }
  return createHash("sha256").update(JSON.stringify({
    ...base,
    analysisAuthority: options.requiredDeferredAuthority,
    entryAuthorities: (options.completedEntries ?? []).map((entry) => ({
      url: canonicalUrl(entry.url),
      contentHash: entry.contentHash,
      analysisAuthority: entry.analysisAuthority ?? null
    })).sort((left, right) => left.url.localeCompare(right.url))
  })).digest("hex");
}

export type WorkerCheckpointWriter = (input: CheckpointScanJobInput) => Promise<ScanJobRow>;

/**
 * The Worker-only checkpoint authority. Every analysis phase must enter via
 * this closure so the database revision and recoverable envelope advance as
 * one compare-and-swap guarded write.
 */
export function createRecoveryCheckpointWriter(input: {
  job: ScanJobRow;
  workerId: string;
  write?: typeof checkpointScanJob;
}): WorkerCheckpointWriter {
  let checkpointRevision = input.job.checkpointRevision;
  const write = input.write ?? checkpointScanJob;
  return async (checkpointInput) => {
    const phase = checkpointInput.phase ?? phaseForStage(checkpointInput.stage);
    const expectedCheckpointRevision = checkpointRevision;
    const checkpoint = checkpointInput.checkpoint
      ? withRecoveryEnvelope(input.job, checkpointInput.checkpoint, phase, expectedCheckpointRevision + 1)
      : undefined;
    const updated = await write(input.job.id, input.workerId, {
      ...checkpointInput,
      phase,
      checkpoint,
      expectedCheckpointRevision
    });
    const recovery = checkpoint ? recoveryEnvelope(updated.checkpoint) : null;
    if (updated.checkpointRevision !== expectedCheckpointRevision + 1 || updated.currentPhase !== phase ||
        (checkpoint && (!recovery || recovery.revision !== updated.checkpointRevision || recovery.phase !== updated.currentPhase ||
          recovery.phaseAttempt !== updated.phaseAttempt || recovery.resumeGeneration !== updated.resumeGeneration))) {
      throw new Error("Recovery checkpoint write did not commit a matching database state.");
    }
    checkpointRevision = updated.checkpointRevision;
    return updated;
  };
}

export function withRecoveryEnvelope(job: ScanJobRow, checkpoint: JobCheckpoint, phase: ReturnType<typeof phaseForStage>, revision: number): JobCheckpoint {
  const serializable = { ...checkpoint } as Record<string, unknown>;
  delete serializable.recovery;
  const publicSource = checkpoint.publicSourceForensics as { authorityId?: string } | undefined;
  const completedArtifacts = [
    checkpoint.discoverySnapshot ? "discovery" : null,
    checkpoint.planningCompleted ? "plan" : null,
    checkpoint.completedCrawlUrls?.length ? "crawl" : null,
    checkpoint.completedPageAnalyses?.length ? "page_analysis" : null,
    checkpoint.websiteFoundation?.completed ? "website_foundation" : null,
    publicSource ? "public_source" : null
  ].filter((value): value is string => Boolean(value));
  return {
    ...checkpoint,
    recovery: {
      // checkpointScanJob resets the phase-local attempt after every committed
      // checkpoint, so the envelope must describe that committed state.
      schemaVersion: 1, phase, revision, phaseAttempt: 0, resumeGeneration: job.resumeGeneration,
      identity: { jobId: job.id, reportId: job.reportId, productContract: job.productContract,
        methodology: job.fulfillmentMethodology, locale: job.locale,
        authorityId: publicSource?.authorityId ?? null },
      inputHash: createHash("sha256").update(JSON.stringify(serializable)).digest("hex"),
      completedArtifacts, remainingWork: [phase], priorTransitionId: null
    }
  };
}

function coverageLimitations(checkpoint: WorkerCheckpoint, exhaustedTransientUrls: readonly string[]): string[] {
  const limitations: string[] = [];
  const permanentCount = checkpoint.permanentFailures?.length ?? 0;
  if (permanentCount > 0) limitations.push(`${permanentCount} permanently inaccessible page(s) were excluded.`);
  if (exhaustedTransientUrls.length > 0) {
    limitations.push(`${exhaustedTransientUrls.length} page(s) remained unavailable after automatic retries.`);
  }
  return limitations;
}

function failureCount(checkpoint: WorkerCheckpoint): number {
  return (checkpoint.permanentFailures?.length ?? 0) + (checkpoint.exhaustedTransientUrls?.length ?? 0);
}

function crawlProgress(checkpoint: WorkerCheckpoint): number {
  const target = Math.max(1, checkpoint.targetPageCount ?? 1);
  return Math.min(64, 35 + Math.round(((checkpoint.completedCrawlUrls?.length ?? 0) / target) * 29));
}

function analysisProgress(completed: number, total: number): number {
  return Math.min(84, 65 + Math.round((completed / Math.max(1, total)) * 19));
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

export class HistoricalRecommendationRuntimeRetiredError extends Error {
  constructor() { super("Historical V1 recommendation fulfillment was retired after the zero-nonterminal audit."); }
}

function publicFailure(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "The AI report task failed.";
}

/**
 * Paid V3 diagnosis incompletion previously discarded `result.failure`,
 * making the real stage/code/parserPath unknowable on retry. The message
 * keeps the diagnosable detail and the structured failure rides along so
 * job-error normalization can classify deterministic input-validation
 * failures as permanent without parsing prose.
 */
export class PaidV3DiagnosisIncompleteError extends Error {
  readonly failure: ReportV4DiagnosisFailure;
  readonly providerAttempts: number;

  constructor(questionId: string, result: { providerAttempts: number; failure: ReportV4DiagnosisFailure }) {
    super(`Paid V3 per-question diagnosis did not complete. questionId=${questionId}; ${formatReportV4DiagnosisFailure(result.failure, result.providerAttempts)}`);
    this.name = "PaidV3DiagnosisIncompleteError";
    this.failure = result.failure;
    this.providerAttempts = result.providerAttempts;
  }
}

export function createPaidV3DiagnosisIncompleteError(
  questionId: string,
  result: { providerAttempts: number; failure: ReportV4DiagnosisFailure }
): Error {
  return new PaidV3DiagnosisIncompleteError(questionId, result);
}

/**
 * Paid V3 diagnosis: Q1 Free reuse (0 model calls); Q2/Q3 exactly one enhancer
 * invocation each, in parallel. No packet resume and no packet-layer retry.
 */
export async function enhanceV3AnswerCardsWithDiagnosis<T extends PaidV3SemanticAnswerCardDraft>(input: {
  answerCards: readonly T[];
  checkpoint: AnswerFirstV3CheckpointV2;
  questionSetIdentity: string;
  admission: NonNullable<Awaited<ReturnType<typeof loadReportV4PreAdmissionSnapshot>>>;
  locale: string;
  provider: ReportV4DiagnosisProvider;
  modelRuntime: ReturnType<typeof loadReportV4ModelRuntimeConfig>;
  semanticValidation?: "legacy" | "deferred";
  saveCheckpoint(checkpoint: AnswerFirstV3CheckpointV2): Promise<void>;
  signal?: AbortSignal;
}): Promise<{ answerCards: [T, T, T]; checkpoint: AnswerFirstV3CheckpointV2 }> {
  type GenCard = Extract<PaidV3SemanticAnswerCardDraft, { answerMode: "generative_search_v1" }>;
  type Diag = NonNullable<GenerativeSearchAnswerCardV3["diagnosis"]>;
  const diagnosisInputs = input.answerCards.map((card) => ({
    questionId: card.questionId,
    targetPages: buildFreeTeaserDiagnosisTargetPages(card.questionId, input.admission)
  }));
  if (diagnosisInputs.some(({ targetPages }) => targetPages.length === 0)) {
    throw new OrchestrationInvariantError("Prospective V3 diagnosis requires non-empty target-site evidence for every question.");
  }
  const diagnosisIdentityHash = createHash("sha256").update(JSON.stringify({
    version: "paid-v3-question-diagnosis-v1",
    questionSetIdentity: input.questionSetIdentity,
    answerHash: input.checkpoint.answerHash,
    admissionSnapshotId: input.admission.snapshot.id,
    admissionContentIdentityHash: input.admission.snapshot.contentIdentityHash,
    locale: input.locale,
    evidence: diagnosisInputs
  })).digest("hex");
  if (input.checkpoint.diagnosisIdentityHash && input.checkpoint.diagnosisIdentityHash !== diagnosisIdentityHash) {
    throw new OrchestrationInvariantError("Paid V3 diagnosis checkpoint identity does not match current question evidence.");
  }
  let checkpoint = input.checkpoint;
  const diagnosisByQuestion = { ...(checkpoint.diagnosisByQuestion ?? {}) };
  let packetsByQuestion = { ...(checkpoint.packetsByQuestion ?? {}) };
  const stageTimings: Record<string, string | number> = {};
  let writeChain: Promise<void> = Promise.resolve();
  const enqueue = (mutator: (c: AnswerFirstV3CheckpointV2) => AnswerFirstV3CheckpointV2) => {
    writeChain = writeChain.then(async () => {
      checkpoint = mutator(checkpoint);
      await input.saveCheckpoint(checkpoint);
    });
    return writeChain;
  };
  const gen = (index: number): GenCard => {
    const card = input.answerCards[index]!;
    if (card.answerMode !== "generative_search_v1") {
      throw new OrchestrationInvariantError("Prospective V3 per-question diagnosis requires generative answer cards.");
    }
    return card as GenCard;
  };
  const parseDiag = (value: unknown, card: GenCard) => parseReportV4DiagnosisOutputForQuestion(value, {
    questionId: card.questionId, sourceEvidenceIds: card.sources.map((s) => s.sourceId)
  }, { semanticValidation: input.semanticValidation });
  const ep = input.checkpoint.engineProvenance;
  if (ep?.searchedAt) stageTimings.sourceCollectionStartedAt = ep.searchedAt;
  if (ep?.evidenceCutoffAt) stageTimings.sourceCollectionCompletedAt = ep.evidenceCutoffAt;
  const answers = input.checkpoint.answerResults;
  if (answers?.[1]) { stageTimings.q2AnswerStartedAt = answers[1].searchedAt; stageTimings.q2AnswerCompletedAt = answers[1].completedAt; }
  if (answers?.[2]) { stageTimings.q3AnswerStartedAt = answers[2].searchedAt; stageTimings.q3AnswerCompletedAt = answers[2].completedAt; }
  const t0 = Date.now();
  const persist = async (card: GenCard, diagnosis: Diag | null, status: "completed" | "failed", providerAttempts: number, startedAt: string, error?: unknown) => {
    const attempts = Math.min(1, Math.max(0, providerAttempts)); // orchestration layer: at most one step call
    const classified = error ? classifyPaidV3PacketError(error) : null;
    const packet = buildPaidV3AnswerPacketFromGenerativeCard({
      card: (diagnosis ? { ...card, diagnosis } : { ...card, diagnosis: undefined }) as never,
      authorityHash: diagnosisIdentityHash, status, attemptCount: attempts, providerAttempts: attempts,
      startedAt, completedAt: new Date().toISOString(),
      ...(status === "failed" && classified ? {
        failure: {
          classification: classified.classification, retryable: false,
          reason: error instanceof Error ? error.message : String(error ?? "failed")
        }
      } : {})
    });
    if (diagnosis) diagnosisByQuestion[card.questionId] = diagnosis;
    packetsByQuestion = mergePaidV3PacketsByQuestion(packetsByQuestion, packet) as typeof packetsByQuestion;
    stageTimings.aggregateProviderAttempts = Object.values(packetsByQuestion).reduce((n, p) => n + p.providerAttempts, 0);
    stageTimings.stageDurationMs = Date.now() - t0;
    await enqueue((c) => ({
      ...c, diagnosisIdentityHash,
      diagnosisByQuestion: { ...(c.diagnosisByQuestion ?? {}), ...diagnosisByQuestion },
      packetsByQuestion: { ...(c.packetsByQuestion ?? {}), ...packetsByQuestion },
      paidV3DiagnosisStageTimings: { ...stageTimings }
    }));
  };
  const runOne = async (index: 0 | 1 | 2): Promise<void> => {
    input.signal?.throwIfAborted();
    const card = gen(index);
    const key = (`q${index + 1}Diagnosis`) as "q1Diagnosis" | "q2Diagnosis" | "q3Diagnosis";
    const startedAt = new Date().toISOString();
    stageTimings[`${key}StartedAt`] = startedAt;
    const done = () => { stageTimings[`${key}CompletedAt`] = new Date().toISOString(); };
    // Q1 Free reuse: zero model calls. No packet resume path.
    if (index === 0 && input.semanticValidation === "deferred") {
      if (!("diagnosis" in card) || !card.diagnosis) {
        throw new OrchestrationInvariantError("Deferred Paid V3 must reuse the reviewed Free Q1 diagnosis.");
      }
      done();
      await persist(card, parseDiag(card.diagnosis, card), "completed", 0, startedAt);
      return;
    }
    // Exactly one enhancer invocation per paid diagnosis step (no orchestration retry).
    try {
      const result = await enhanceReportV4QuestionDiagnosis({
        question: v3CardToV4Question(card, index), locale: input.locale, targetPages: diagnosisInputs[index]!.targetPages,
        provider: input.provider,
        getTokenBudget: (request) => buildReportV4MimoDiagnosisTokenBudget({ runtime: input.modelRuntime, request }),
        semanticValidation: input.semanticValidation, signal: input.signal
      });
      if (result.status !== "completed") {
        const err = createPaidV3DiagnosisIncompleteError(card.questionId, result);
        done();
        await persist(card, null, "failed", Math.min(1, result.providerAttempts || 1), startedAt, err);
        throw err;
      }
      done();
      await persist(card, parseDiag(result.diagnosis, card), "completed", Math.min(1, result.providerAttempts || 1), startedAt);
    } catch (error) {
      if (packetsByQuestion[card.questionId]?.status === "failed") throw error;
      done();
      await persist(card, null, "failed", 1, startedAt, error);
      throw error;
    }
  };
  await runOne(0);
  const settled = await Promise.allSettled([runOne(1), runOne(2)]);
  await writeChain;
  const rejected = settled.find((row): row is PromiseRejectedResult => row.status === "rejected");
  if (rejected) throw rejected.reason;
  const enhanced = input.answerCards.map((card) => ({ ...card, diagnosis: diagnosisByQuestion[card.questionId]! })) as [T, T, T];
  stageTimings.stageDurationMs = Date.now() - t0;
  stageTimings.aggregateProviderAttempts = Object.values(packetsByQuestion).reduce((n, p) => n + p.providerAttempts, 0);
  const ready: AnswerFirstV3CheckpointV2 = {
    ...checkpoint, stage: "per_question_diagnosis_ready", diagnosisIdentityHash, diagnosisByQuestion, packetsByQuestion,
    paidV3DiagnosisStageTimings: stageTimings,
    ...(input.semanticValidation === "deferred" ? {} : {
      answerCards: enhanced as [Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>, Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>, Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>]
    })
  };
  await input.saveCheckpoint(ready);
  return { answerCards: enhanced, checkpoint: ready };
}

function v3CardToV4Question(card: PaidV3SemanticAnswerCardDraft, index: number): CombinedGeoReportV4Question {
  const order = (index + 1) as 1 | 2 | 3;
  if (card.answerMode === "generative_search_v1") {
    return {
      order,
      questionId: card.questionId,
      questionText: card.exactQuestion,
      status: card.answerText ? "answered" : "unavailable",
      answer: card.answerText ?? null,
      sources: card.sources.map((source) => ({
        questionId: card.questionId,
        sourceId: source.sourceId,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        citedText: source.citedText ?? null,
        retrievalStatus: source.retrievalStatus === "verified_body" ? "available" as const
          : source.retrievalStatus === "inaccessible" ? "inaccessible" as const
          : "not_checked" as const
      }))
    };
  }
  // Legacy card: synthesize V4 question from legacy evidence
  const answerText = card.status === "answered" || card.status === "limited"
    ? card.sentences.filter((s) => s.kind === "grounded_claim").map((s) => s.text).join(" ")
    : null;
  return {
    order,
    questionId: card.questionId,
    questionText: card.exactQuestion,
    status: card.status === "answered" ? "answered" : "unavailable",
    answer: answerText || null,
    sources: card.sourceEvidence.slice(0, 5).map((evidence) => ({
      questionId: card.questionId,
      sourceId: evidence.evidenceId,
      title: evidence.title,
      canonicalUrl: evidence.canonicalUrl,
      citedText: evidence.exactExcerpt,
      retrievalStatus: "available" as const
    }))
  };
}

type PaidV3GenerativeDraftCard = Extract<PaidV3SemanticAnswerCardDraft, { answerMode: "generative_search_v1" }>;

/**
 * W4 rule 1: which answer-card sources may enter the Paid V3 semantic catalog.
 * - verified_body + successful retrieval audit → eligible verified body
 * - search_source_only (SERP hit, body unavailable) → eligible search-summary-only
 * - inaccessible / other → not eligible (evidence_missing stays permanent when none remain)
 */
export function paidV3SemanticSourceCatalogEligibility(input: {
  readonly retrievalStatus: string;
  readonly auditRetrievalReady: boolean;
  readonly auditExactExcerpt: string | null;
}): { readonly eligible: boolean; readonly evidenceMode: "verified_body" | "search_summary_only" | "unavailable" } {
  if (input.retrievalStatus === "verified_body" && input.auditRetrievalReady && input.auditExactExcerpt !== null) {
    return { eligible: true, evidenceMode: "verified_body" };
  }
  if (input.retrievalStatus === "search_source_only") {
    return { eligible: true, evidenceMode: "search_summary_only" };
  }
  return { eligible: false, evidenceMode: "unavailable" };
}

function buildPaidV3SemanticAuthorities(input: {
  answerCards: readonly PaidV3SemanticAnswerCardDraft[];
  questionSet: ConfirmedBusinessQuestionSet;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  admission: NonNullable<Awaited<ReturnType<typeof loadReportV4PreAdmissionSnapshot>>>;
  targetPages: GeoAuditReport["pages"];
  storedSources: readonly AnswerFirstV3StoredSource[];
  sourceHash: string;
  modelId: string;
}): {
  answerCards: [PaidV3GenerativeDraftCard, PaidV3GenerativeDraftCard, PaidV3GenerativeDraftCard];
  manifest: Parameters<typeof runPaidV3SemanticReview>[0]["manifest"];
  sourceSelectionContext: Parameters<typeof runPaidV3SemanticReview>[0]["sourceSelectionContext"];
  sourceDictionary: ReturnType<typeof buildPaidV3SourceDictionary>;
} {
  if (input.answerCards.length !== 3 || input.answerCards.some((card) => card.answerMode !== "generative_search_v1")) {
    throw new Error("Reviewed Paid V3 requires exactly three generative answer drafts.");
  }
  const answerCards = input.answerCards as [PaidV3GenerativeDraftCard, PaidV3GenerativeDraftCard, PaidV3GenerativeDraftCard];
  const canonicalQuestions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  if (canonicalQuestions.length !== 3) throw new Error("Reviewed Paid V3 requires exactly three canonical questions.");
  const auditByUrl = new Map(input.storedSources.map((source) => [canonicalUrl(source.canonicalUrl), source]));
  const seenSourceIds = new Set<string>();
  const sourceDictionary = buildPaidV3SourceDictionary(answerCards.flatMap((card) => card.sources.flatMap((source) => {
    if (seenSourceIds.has(source.sourceId)) return [];
    seenSourceIds.add(source.sourceId);
    const audit = auditByUrl.get(canonicalUrl(source.canonicalUrl));
    return [{
      sourceId: source.sourceId,
      canonicalUrl: source.canonicalUrl,
      title: source.title,
      citedText: source.citedText,
      auditExcerpt: audit?.exactExcerpt ?? null
    }];
  })));
  const sources = answerCards.flatMap((card) => card.sources.map((source) => {
    const audit = auditByUrl.get(canonicalUrl(source.canonicalUrl));
    const catalog = paidV3SemanticSourceCatalogEligibility({
      retrievalStatus: source.retrievalStatus,
      auditRetrievalReady: audit?.retrievalReady === true,
      auditExactExcerpt: audit?.exactExcerpt ?? null
    });
    const entry = sourceDictionary[source.sourceId]!;
    const originalText = slimOriginalTextPlaceholder(source.sourceId, entry.hashes.bodyHash);
    return {
      sourceId: source.sourceId,
      questionId: card.questionId,
      canonicalUrl: source.canonicalUrl,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText),
      eligible: catalog.eligible
    };
  }));
  const sourceIds = new Set(sources.map(({ sourceId }) => sourceId));
  const sourceEvidence = sources.map((source) => {
    const originalText = slimOriginalTextPlaceholder(`evidence:${source.sourceId}`, source.originalTextHash);
    return {
      evidenceId: source.sourceId,
      questionId: source.questionId,
      sourceId: source.sourceId,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText),
      eligible: source.eligible
    };
  });
  const targetEvidence = answerCards.flatMap((card) =>
    buildFreeTeaserDiagnosisTargetPages(card.questionId, input.admission).flatMap((page) =>
      page.sourceLocations.map((location) => {
        const originalText = page.summary.slice(location.startOffset, location.endOffset);
        return {
          evidenceId: location.locationId,
          questionId: card.questionId,
          sourceId: null,
          originalText,
          originalTextHash: reportSemanticTextHash(originalText),
          eligible: true
        };
      })
    )
  );
  const targetPageEvidence = input.targetPages.map((page) => {
    const evidenceId = canonicalUrl(page.url);
    const originalText = JSON.stringify({
      url: evidenceId,
      title: page.title ?? null,
      metaDescription: page.metaDescription ?? null,
      h1: [...page.h1],
      readableTextLength: page.readableTextLength,
      hasJsonLd: page.hasJsonLd
    });
    return {
      evidenceId,
      questionId: null,
      sourceId: null,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText),
      eligible: true
    };
  });
  const identityEvidenceText = JSON.stringify({
    sourceHash: input.sourceHash,
    targetFoundationHash: sourceSelectionTargetFoundationHash(input.targetPages),
    locale: input.questionSet.locale.toLocaleLowerCase().startsWith("zh") ? "zh" : "en",
    contributionAnalyzerVersion: SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION,
    factorAnalyzerVersion: SOURCE_SELECTION_FACTOR_ANALYZER_VERSION,
    targetComparatorVersion: SOURCE_SELECTION_TARGET_COMPARATOR_VERSION
  });
  const identityEvidence = {
    evidenceId: "paid-v3-source-selection-identity",
    questionId: null,
    sourceId: null,
    originalText: identityEvidenceText,
    originalTextHash: reportSemanticTextHash(identityEvidenceText),
    eligible: true
  };
  const evidence = [...sourceEvidence, ...targetEvidence, ...targetPageEvidence, identityEvidence];
  const observationResults = sources.map((source, index) => {
    const originalText = slimOriginalTextPlaceholder(`observation:${source.sourceId}:${index}`, source.originalTextHash);
    return {
      observationId: `paid-v3-answer-source-observation:${index + 1}:${source.questionId}`,
      resultId: source.sourceId,
      questionId: source.questionId!,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText)
    };
  });
  const entities = sources.map((source, index) => {
    const originalText = slimOriginalTextPlaceholder(`entity:${source.sourceId}:${index}`, source.originalTextHash);
    return {
      entityId: `paid-v3-source-entity:${index + 1}:${createHash("sha256").update(`${source.questionId}\0${source.sourceId}`).digest("hex").slice(0, 16)}`,
      questionId: source.questionId,
      kind: "competitor_candidate" as const,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText)
    };
  });
  const targetHost = new URL(input.targetUrl).hostname;
  const targetAliases = [
    targetHost,
    input.foundation.organizationProfile.organizationName,
    input.foundation.organizationProfile.legalEntity,
    ...(input.foundation.organizationProfile.brandNames ?? [])
  ].filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim())
    .filter((value, index, values) => values.indexOf(value) === index);

  const profileGroups = new Map<string, Array<{ card: PaidV3GenerativeDraftCard; source: PaidV3GenerativeDraftCard["sources"][number] }>>();
  for (const card of answerCards) {
    for (const source of card.sources) {
      const key = source.registrableDomain.toLocaleLowerCase();
      const rows = profileGroups.get(key) ?? [];
      rows.push({ card, source });
      profileGroups.set(key, rows);
    }
  }
  if (profileGroups.size === 0) throw new Error("Reviewed Paid V3 requires source-selection profiles.");
  const catalogSeeds: PaidV3SourceSelectionCatalogSeed[] = [];
  const allTargetEvidenceIds = [...targetEvidence, ...targetPageEvidence].map(({ evidenceId }) => evidenceId);
  const profileIds: string[] = [];
  for (const [domain, rows] of profileGroups) {
    const profileId = `paid-v3-source-profile:${createHash("sha256").update(domain).digest("hex").slice(0, 20)}`;
    profileIds.push(profileId);
    const profileEvidenceIds = [...new Set([
      ...rows.map(({ source }) => source.sourceId),
      ...rows.flatMap(({ card }) => card.diagnosis?.detailedEvidenceRefs ?? [])
    ])];
    for (const { card, source } of rows) {
      catalogSeeds.push({
        kind: "contribution",
        questionId: card.questionId,
        sourceId: source.sourceId,
        profileId,
        allowedEvidenceIds: [source.sourceId]
      });
    }
    catalogSeeds.push({
      kind: "target_state",
      slotId: "target-gap-1",
      questionId: null,
      sourceId: null,
      profileId,
      allowedEvidenceIds: profileEvidenceIds
    });
    for (const slotId of ["factor-1", "factor-2", "factor-3"] as const) {
      catalogSeeds.push({
        kind: "factor",
        slotId,
        questionId: null,
        sourceId: null,
        profileId,
        allowedEvidenceIds: profileEvidenceIds
      });
    }
  }
  const allEvidenceIds = [...new Set([...sources.map(({ sourceId }) => sourceId), ...allTargetEvidenceIds])];
  for (const actionId of ["paid-v3-action-1", "paid-v3-action-2", "paid-v3-action-3"] as const) {
    catalogSeeds.push({
      kind: "action",
      questionId: null,
      sourceId: null,
      profileId: profileIds[0]!,
      actionId,
      allowedEvidenceIds: allEvidenceIds
    });
  }

  const fieldOverrides: PaidV3DraftManifestFieldOverride[] = [];
  input.questionSet.questions.forEach((question, index) => {
    for (const key of ["generatedText", "neutralPublicText", "privateText"] as const) {
      if (typeof question[key] === "string") {
        fieldOverrides.push({
          path: `businessQuestionSet.questions[${index}].${key}`,
          mutability: "read_only",
          questionId: canonicalQuestions[index]!.id
        });
      }
    }
  });
  answerCards.forEach((card, index) => {
    const cardSourceIds = card.sources.map(({ sourceId }) => sourceId);
    const detailedEvidenceIds = card.diagnosis?.detailedEvidenceRefs ?? cardSourceIds;
    fieldOverrides.push(
      { path: `answerCards[${index}].exactQuestion`, mutability: "read_only", questionId: card.questionId },
      { path: `answerCards[${index}].answerText`, questionId: card.questionId, allowedEvidenceIds: cardSourceIds, allowedSourceIds: cardSourceIds }
    );
    if (card.diagnosis) {
      fieldOverrides.push(
        { path: `answerCards[${index}].diagnosis.selectionSummary`, questionId: card.questionId, allowedEvidenceIds: detailedEvidenceIds, allowedSourceIds: detailedEvidenceIds.filter((id) => sourceIds.has(id)) },
        { path: `answerCards[${index}].diagnosis.targetGap`, questionId: card.questionId, allowedEvidenceIds: detailedEvidenceIds, allowedSourceIds: detailedEvidenceIds.filter((id) => sourceIds.has(id)) },
        ...card.diagnosis.observableFactors.map((factor, factorIndex) => ({
          path: `answerCards[${index}].diagnosis.observableFactors[${factorIndex}].observation`,
          questionId: card.questionId,
          allowedEvidenceIds: factor.evidenceRefs,
          allowedSourceIds: factor.evidenceRefs.filter((id) => sourceIds.has(id))
        })),
        ...card.diagnosis.recommendedActions.map((action, actionIndex) => ({
          path: `answerCards[${index}].diagnosis.recommendedActions[${actionIndex}].action`,
          questionId: card.questionId,
          allowedEvidenceIds: action.evidenceRefs,
          allowedSourceIds: action.evidenceRefs.filter((id) => sourceIds.has(id))
        }))
      );
    }
    if ("geoDiagnosis" in card && card.geoDiagnosis) {
      card.geoDiagnosis.targetRoles.forEach((_, roleIndex) => fieldOverrides.push({
        path: `answerCards[${index}].geoDiagnosis.targetRoles[${roleIndex}]`,
        mutability: "read_only",
        questionId: card.questionId,
        allowedEvidenceIds: detailedEvidenceIds,
        allowedSourceIds: cardSourceIds
      }));
      fieldOverrides.push({
        path: `answerCards[${index}].geoDiagnosis.retestQuestion`,
        mutability: "read_only",
        questionId: card.questionId
      });
    }
  });

  return {
    answerCards,
    sourceDictionary,
    manifest: {
      locale: input.questionSet.locale,
      target: { siteKey: targetHost, targetUrl: input.targetUrl, aliases: targetAliases },
      expectedModel: { providerId: "xiaomi-mimo", modelId: input.modelId },
      questions: canonicalQuestions.map((question, index) => ({
        questionId: question.id,
        originalText: input.questionSet.questions[index]!.privateText,
        originalTextHash: reportSemanticTextHash(input.questionSet.questions[index]!.privateText)
      })),
      sources,
      evidence,
      observationResults,
      entities,
      answerSubjects: answerCards.map((card, index) => ({
        questionId: card.questionId,
        fieldPath: `answerCards[${index}].answerText`
      })),
      sourceSelectionCatalogSeeds: catalogSeeds,
      manifestCoverageOptions: { fieldOverrides }
    },
    sourceSelectionContext: {
      questions: answerCards.map((card) => ({
        questionId: card.questionId,
        answerText: card.answerText,
        sources: card.sources.map((source) => ({
          ...source,
          questionId: card.questionId,
          auditExcerpt: auditByUrl.get(canonicalUrl(source.canonicalUrl))?.exactExcerpt ?? null
        }))
      })),
      missingEvidenceFamiliesByQuestion: answerCards.map((card) =>
        "geoDiagnosis" in card && card.geoDiagnosis ? card.geoDiagnosis.missingEvidenceFamilies : []
      ) as [string[], string[], string[]],
      finalSourceSelectionInputIdentity: {
        sourceHash: input.sourceHash,
        targetFoundationHash: sourceSelectionTargetFoundationHash(input.targetPages),
        locale: input.questionSet.locale.toLocaleLowerCase().startsWith("zh") ? "zh" : "en",
        contributionAnalyzerVersion: SOURCE_SELECTION_CONTRIBUTION_ANALYZER_VERSION,
        factorAnalyzerVersion: SOURCE_SELECTION_FACTOR_ANALYZER_VERSION,
        targetComparatorVersion: SOURCE_SELECTION_TARGET_COMPARATOR_VERSION
      }
    }
  };
}

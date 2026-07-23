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
  type CombinedReportLanguageScope,
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
import { readSemanticReviewContractVersion } from "@/db/report-semantic-review-activation";
import { loadReportV4PreAdmissionSnapshot } from "@/db/report-v4-site-snapshots";
import { getActivePublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import { getCorrectionExecutionContext } from "@/db/report-corrections";
import { getReplacementExecutionContext, syncReplacementExecutionState } from "@/db/report-replacement-fulfillments";
import { listEvidenceAssets } from "@/db/evidence-assets";
import { terminalizeCombinedCorrection, terminalizePaidCombinedReport } from "@/db/combined-correction-terminalization";
import { terminalizeCombinedReplacement } from "@/db/combined-replacement-terminalization";
import { getPendingPaidCombinedContext } from "@/db/combined-reports";
import { failStagingCombinedArtifactRefresh, getStagingCombinedArtifactRefreshContext, terminalizeStagingCombinedArtifactRefresh } from "@/db/staging-combined-artifact-refresh";
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
import { normalizeJobError } from "./job-errors";
import { assertStagingCommandEnvironment } from "@/security/deployment-policy";
import { createPublicSourceAttemptBudget } from "./public-source-execution-budget";
import { phaseForStage, recoveryEnvelope } from "./job-state";
import type { StagingLiveDrill } from "./staging-live-drill";
import { resolvePublicSourceSnapshot, type InjectedPublicSourceRetrieval, type PublicSourceRetriever } from "./public-source-snapshot-resolver";
import { createProductionProviderDiscoveryContext } from "./provider-discovery-production";
import { runProviderDiscoveryPipeline, type ProviderDiscoveryCheckpointV1 } from "./provider-discovery-pipeline";
import { resolveGenerativeAnswerFirstV3, type AnswerFirstV3Checkpoint, type AnswerFirstV3CheckpointV2, type AnswerFirstV3StoredSource, type DeferredGenerativeAnswerFirstV3 } from "./answer-first-v3";
import {
  calculateEffectiveCoverage,
  determineResumeStage,
  fetchPlannedPagesWithRecovery,
  type CompletedPageAnalysis,
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
import { enhanceReportV4QuestionDiagnosis, type ReportV4DiagnosisProvider } from "./report-v4-diagnosis-enhancer";
import { buildReportV4MimoDiagnosisTokenBudget, createReportV4MimoDiagnosisProvider, createReportV4MimoStructuredInvoker } from "@/report-v4/mimo-provider";
import { loadReportV4ModelRuntimeConfig } from "@/report-v4/model-runtime-config";
import type { CombinedGeoReportV4Question, OpenGeoAnswerCardV3 } from "@open-geo-console/ai-report-engine";
import {
  buildFreeTeaserDiagnosisTargetPages,
  freeTeaserCheckpointFromJobCheckpoint,
  freeTeaserSeededQ1,
  generateFreeTeaser
} from "./report-v4-free-teaser";
import { sourceSelectionTargetFoundationHash } from "./source-selection-diagnosis";
import { runPaidV3SemanticReview, verifyPersistedPaidV3SemanticReview } from "./paid-v3-semantic-review";

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
  const paidV3SemanticValidation = resolvePaidV3SemanticValidation(job, checkpoint);
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
    if (job.reason === "staging_artifact_refresh") {
      assertStagingCommandEnvironment(process.env);
      const context=await getStagingCombinedArtifactRefreshContext(job.id);
      if(!context) throw new Error("The staging artifact-refresh identity is unavailable.");
      const evidenceAssets=await loadReferencedEvidenceAssets(context.sourceReport);
      await assertReusableEvidenceAssets(evidenceAssets);
      if(context.sourceReport.artifactContract==="combined_geo_report_v2"||context.sourceReport.artifactContract==="combined_geo_report_v3"){
        await finalizeProviderDiscoveryCombinedJob({job,workerId,checkpoint,websiteFoundation:context.sourceReport.technicalFoundation.aiReport,
          technicalReport:context.sourceReport.technicalFoundation.technicalReport,targetUrl:context.sourceReport.targetUrl,
          coverage:{plannedPages:job.plannedPages,successfulPages:job.successfulPages,failedPages:job.failedPages},checkpointJob,
          signal:execution.controller.signal,remainingMs:execution.remainingMs(),liveDrill:options.liveDrill,evidenceAssets,
          artifactContext:{orderId:context.orderId,artifactRevisionId:context.artifactRevisionId,artifactRevision:context.artifactRevision},
          originalPaidJobId:context.sourceReport.originalPaidJobId,forceSnapshotRefreshAfter:context.sourceReport.generatedAt});
        return;
      }
      await finalizeStagingArtifactRefreshJob({job,workerId,checkpoint,context,evidenceAssets,checkpointJob,
        signal:execution.controller.signal,remainingMs:execution.remainingMs(),liveDrill:options.liveDrill});
      return;
    }
    if (job.reason === "replacement_fulfillment") {
      await syncReplacementExecutionState(job.id, "running");
      const foundation = await getAiReport(job.reportId, "deep", "recommendation_forensics_v1");
      const context = await getReplacementExecutionContext(job.id);
      if (!context) throw new Error("The replacement execution identity is unavailable.");
      const foundationMatches = foundation?.technicalPayload && foundation.isPrivate && foundation.payload.tier === "deep" &&
        foundation.reportId === job.reportId && foundation.locale === job.locale && sameTarget(foundation.payload.targetUrl, storedReport.url);
      if (foundationMatches) {
        const evidenceAssets = await listEvidenceAssets(job.reportId, context.originalFailedJobId);
        if (await areReusableEvidenceAssets(evidenceAssets)) {
          await finalizeProviderDiscoveryCombinedJob({ job, workerId, checkpoint, websiteFoundation: foundation.payload,
            technicalReport: foundation.technicalPayload!, targetUrl: foundation.payload.targetUrl,
            coverage: { plannedPages: job.plannedPages, successfulPages: job.successfulPages, failedPages: job.failedPages }, checkpointJob,
            signal: execution.controller.signal, remainingMs: execution.remainingMs(), liveDrill: options.liveDrill, evidenceAssets,
            artifactContext: { orderId: context.orderId, artifactRevisionId: context.artifactRevisionId, artifactRevision: context.artifactRevision },
            originalPaidJobId: context.originalFailedJobId });
          return;
        }
      }
    }
    if (job.reason === "paid_report_correction") {
      const foundation = await getAiReport(job.reportId, "deep", "recommendation_forensics_v1");
      const context = await getCorrectionExecutionContext(job.id);
      if (!context) throw new Error("The correction execution identity is unavailable.");
      const foundationMatches = foundation?.technicalPayload && foundation.isPrivate && foundation.payload.tier === "deep" &&
        foundation.reportId === job.reportId && foundation.locale === job.locale && sameTarget(foundation.payload.targetUrl, storedReport.url);
      if (foundationMatches) {
        const evidenceAssets = await listEvidenceAssets(job.reportId, context.originalPaidJobId);
        if (await areReusableEvidenceAssets(evidenceAssets)) {
          if(job.artifactContract==="combined_geo_report_v2"){
            await finalizeProviderDiscoveryCombinedJob({job,workerId,checkpoint,websiteFoundation:foundation.payload,
              technicalReport:foundation.technicalPayload!,targetUrl:foundation.payload.targetUrl,coverage:{plannedPages:job.plannedPages,successfulPages:job.successfulPages,failedPages:job.failedPages},
              checkpointJob,signal:execution.controller.signal,remainingMs:execution.remainingMs(),liveDrill:options.liveDrill,evidenceAssets,
              artifactContext:{orderId:context.orderId,artifactRevisionId:context.artifactRevisionId,artifactRevision:context.artifactRevision},originalPaidJobId:context.originalPaidJobId});
            return;
          }
          await finalizeCorrectionJob({ job, workerId, checkpoint, websiteFoundation: foundation.payload,
            technicalReport: foundation.technicalPayload!, targetUrl: foundation.payload.targetUrl, evidenceAssets, context,
            checkpointJob, signal: execution.controller.signal, remainingMs: execution.remainingMs(), liveDrill: options.liveDrill });
          return;
        }
      }
    }
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
          signal: execution.controller.signal, remainingMs: execution.remainingMs()
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

    let resumeStage = determineResumeStage(checkpoint);
    let discovery = checkpoint.discoverySnapshot;
    if (resumeStage === "discovering" || !discovery) {
      await checkpointJob({ stage: "discovering", progress: 10 });
      const discovered = await discoverSite(storedReport.url, job.tier, createSafeFetch(), execution.controller.signal);
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
      const pagePlan = await planPagesWithRecovery(client, {
        tier: job.tier,
        locale: job.locale,
        targetUrl: discovery.targetUrl,
        candidates: discovery.candidates,
        signal: execution.controller.signal
      });
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

    const crawl = await runReportV4GuardedOperation({
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
    });
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
      ? await auditSite(discovery.targetUrl, {
          fetchImpl: fetchWithSignal(createSafeFetch(), execution.controller.signal),
          pageUrls: checkpoint.effectivePlan!.map(({ url }) => url)
        })
      : undefined;

    const evidenceByUrl = new Map(crawl.pages.map((page) => [canonicalUrl(page.page.url), page]));
    checkpoint.completedPageAnalyses = (checkpoint.completedPageAnalyses ?? []).filter((stored) => {
      const evidence = evidenceByUrl.get(canonicalUrl(stored.url));
      return Boolean(evidence?.contentHash) && evidence?.contentHash === stored.contentHash;
    });
    await saveCheckpoint("analyzing", 65, checkpoint, {
      plannedPages: checkpoint.effectivePlan!.length,
      successfulPages: crawl.pages.length,
      failedPages: failureCount(checkpoint)
    });
    options.liveDrill?.inject({ jobId: job.id, fault: "model" });

    let analyzed;
    try {
      analyzed = await analyzePageBatch(client, {
        pages: crawl.pages.map(({ page }) => page),
        locale: job.locale,
        ...(paidV3SemanticValidation === "deferred"
          ? { semanticValidation: "deferred" as const }
          : {}),
        batchSize: 4,
        maxCharactersPerPage: 30_000,
        signal: execution.controller.signal,
        completedAnalyses: checkpoint.completedPageAnalyses.map(({ analysis }) => analysis),
        onBatchComplete: async (batch) => {
          checkpoint.completedPageAnalyses = mergeCompletedAnalyses(
            checkpoint.completedPageAnalyses ?? [],
            batch,
            evidenceByUrl
          );
          await saveCheckpoint("analyzing", analysisProgress(
            checkpoint.completedPageAnalyses.length,
            crawl.pages.length
          ), checkpoint, {
            plannedPages: checkpoint.effectivePlan!.length,
            successfulPages: checkpoint.completedPageAnalyses.length,
            failedPages: failureCount(checkpoint)
          });
        }
      });
    } catch (error) {
      if (error instanceof PageAnalysisBatchError) {
        checkpoint.completedPageAnalyses = mergeCompletedAnalyses(
          checkpoint.completedPageAnalyses ?? [],
          error.completedAnalyses,
          evidenceByUrl
        );
        await saveCheckpoint("analyzing", analysisProgress(
          checkpoint.completedPageAnalyses.length,
          crawl.pages.length
        ), checkpoint);
      }
      throw error;
    }

    checkpoint.completedPageAnalyses = mergeCompletedAnalyses(
      checkpoint.completedPageAnalyses ?? [],
      analyzed.analyses,
      evidenceByUrl
    );
    const effectiveCoverage = calculateEffectiveCoverage({
      discoveredCandidateCount: discovery.estimatedPages,
      effectivePlannedUrls: checkpoint.effectivePlan!.map(({ url }) => url),
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
    const synthesisInputHash = hashSynthesisInput(crawl.pages, analyzed.analyses, coverage);
    checkpoint.synthesisInputHash = synthesisInputHash;
    await saveCheckpoint("synthesizing", 85, checkpoint);

    const synthesis = await synthesizeWebsiteReportWithRecovery(client, {
      targetUrl: discovery.targetUrl,
      tier: job.tier,
      locale: job.locale,
      pages: crawl.pages.map(({ page }) => page),
      pageAnalyses: analyzed.analyses,
      coverage
    }, {
      signal: execution.controller.signal,
      ...(paidV3SemanticValidation === "deferred"
        ? { semanticValidation: "deferred" as const }
        : {})
    });
    const reportToPersist = job.tier === "free" ? projectFreeAiReport(synthesis.report) : synthesis.report;
    if (job.tier === "deep") {
      await captureReportVisualEvidence({
        reportId: job.reportId,
        jobId: job.id,
        report: reportToPersist,
        pages: crawl.pages.map((evidence) => ({
          url: evidence.page.url,
          contentHash: evidence.contentHash
        }))
      }).catch(() => {
        console.error("Visual evidence capture unavailable.", { reportId: job.reportId, jobId: job.id });
      });
    }
    await persistAiReport(job, reportToPersist, crawl.pages, technicalReport);

    if (fulfillmentTarget !== "legacy") {
      checkpoint = {
        ...checkpoint,
        contractVersion: 2,
        websiteFoundation: { completed: true, synthesisInputHash }
      };
      const preflightCheckpoint = await checkpointJob({ stage: "synthesizing", phase: "public_source_preflight", progress: 90, checkpoint: checkpoint as JobCheckpoint,
        plannedPages: effectiveCoverage.effectivePlannedPages,
        successfulPages: effectiveCoverage.analyzedPages,
        failedPages: failureCount(checkpoint)
      });
      checkpoint = normalizeCheckpoint(preflightCheckpoint.checkpoint);
      if (job.reason === "replacement_fulfillment") {
        const context = await getReplacementExecutionContext(job.id);
        if (!context) throw new Error("The replacement execution identity is unavailable after technical regeneration.");
        const evidenceAssets = await listEvidenceAssets(job.reportId, job.id);
        await assertReusableEvidenceAssets(evidenceAssets);
        await finalizeProviderDiscoveryCombinedJob({ job, workerId, checkpoint, websiteFoundation: reportToPersist,
          targetUrl: discovery.targetUrl, technicalReport: technicalReport!, evidenceAssets,
          artifactContext: { orderId: context.orderId, artifactRevisionId: context.artifactRevisionId, artifactRevision: context.artifactRevision },
          originalPaidJobId: context.originalFailedJobId,
          coverage: { plannedPages: effectiveCoverage.effectivePlannedPages, successfulPages: effectiveCoverage.analyzedPages, failedPages: failureCount(checkpoint) },
          checkpointJob, signal: execution.controller.signal, remainingMs: execution.remainingMs(), liveDrill: options.liveDrill });
        return;
      }
      if (job.reason === "paid_report_correction") {
        const context = await getCorrectionExecutionContext(job.id);
        if (!context) throw new Error("The correction execution identity is unavailable after technical regeneration.");
        const evidenceAssets = await listEvidenceAssets(job.reportId, job.id);
        await assertReusableEvidenceAssets(evidenceAssets);
        if(job.artifactContract==="combined_geo_report_v2"){
          await finalizeProviderDiscoveryCombinedJob({job,workerId,checkpoint,websiteFoundation:reportToPersist,
            targetUrl:discovery.targetUrl,technicalReport:technicalReport!,evidenceAssets,artifactContext:{orderId:context.orderId,artifactRevisionId:context.artifactRevisionId,artifactRevision:context.artifactRevision},
            originalPaidJobId:context.originalPaidJobId,coverage:{plannedPages:effectiveCoverage.effectivePlannedPages,successfulPages:effectiveCoverage.analyzedPages,failedPages:failureCount(checkpoint)},
            checkpointJob,signal:execution.controller.signal,remainingMs:execution.remainingMs(),liveDrill:options.liveDrill});
          return;
        }
        await finalizeCorrectionJob({ job, workerId, checkpoint, websiteFoundation: reportToPersist,
          targetUrl: discovery.targetUrl, technicalReport: technicalReport!, evidenceAssets, context,
          checkpointJob, signal: execution.controller.signal, remainingMs: execution.remainingMs(), liveDrill: options.liveDrill });
        return;
      }
      await finalizeRecommendationJob({
        job, workerId, checkpoint, websiteFoundation: reportToPersist, targetUrl: discovery.targetUrl,
        technicalReport: technicalReport!,
        fulfillmentTarget, coverage: {
          plannedPages: effectiveCoverage.effectivePlannedPages,
          successfulPages: effectiveCoverage.analyzedPages,
          failedPages: failureCount(checkpoint)
        },
        signal: execution.controller.signal, remainingMs: execution.remainingMs(), checkpointJob, liveDrill: options.liveDrill
      });
      return;
    }

    const homepageUrl = new URL(discovery.targetUrl).href;
    const homepageSucceeded = crawl.pages.some(({ page }) => canonicalUrl(page.url) === canonicalUrl(homepageUrl));
    const evidenceValidated = synthesis.rejectedFindingIds.length === 0 || synthesis.report.findings.length > 0;
    const billable = isBillableCoverage({
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
      await recordCommercialOutcomeSafely(job.id, terminalJob.stage as "completed" | "completed_limited");
    }
  } catch (error) {
    if (error instanceof ReportValidationError) {
      console.error("AI report validation issues:", error.issues);
    }
    const currentJob = await getScanJob(job.id);
    if (reportV4ProductionRoutingAttempted && isTerminalScanJob(currentJob)) return;
    const phase = currentJob?.currentPhase ?? phaseForStage(currentJob?.stage ?? job.stage);
    const normalized = normalizeJobError(error, {
      jobId: job.id, phase, phaseAttempt: currentJob?.phaseAttempt ?? job.phaseAttempt ?? 0,
      resumeGeneration: currentJob?.resumeGeneration ?? job.resumeGeneration ?? 0,
      configuredSecrets: [process.env.OGC_AI_API_KEY ?? "", process.env.OGC_PUBLIC_SEARCH_MIMO_API_KEY ?? ""]
    });
    // V4 owns commercial terminalization, but ordinary runner failures still
    // belong to the canonical job state machine so the original error is
    // durable immediately instead of being replaced later by lease_exhausted.
    const failedJob = await failScanJob(job.id, workerId, {
      code: normalized.code, publicMessage: "The analysis is temporarily unavailable.",
      retryable: normalized.classification === "transient",
      classification: normalized.classification === "operator_repairable" ? "operator_repairable" : normalized.classification === "target_limitation" ? "target_limitation" : undefined,
      internalError: normalized, phase
    });
    if (job.tier === "free" && failedJob.stage === "failed") {
      const report = await getGeoReport(job.reportId);
      if (report && report.technicalStatus !== "completed") {
        await failGeoReportTechnical(job.reportId, {
          code: error instanceof Error ? error.name : "scan_failed",
          publicMessage: publicFailure(error)
        });
      }
    }
    if (!reportV4ProductionRoutingAttempted && job.tier === "deep" && job.reason !== "v4_pre_admission" && failedJob.stage === "failed" && !["paid_report_correction","staging_artifact_refresh","replacement_fulfillment"].includes(job.reason)) {
      await recordCommercialOutcomeSafely(job.id, "failed");
    }
    if (job.reason === "replacement_fulfillment") await syncReplacementExecutionState(job.id, failedJob.executionState);
    if(job.reason==="staging_artifact_refresh"&&failedJob.stage==="failed")await failStagingCombinedArtifactRefresh(job.id);
  } finally {
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
    await generateFreeTeaser({
      reportId: runInput.job.reportId,
      jobId: runInput.job.id,
      targetUrl: report.url,
      foundation: foundation.payload,
      locale: runInput.job.locale,
      admission,
      checkpoint: freeTeaserCheckpointFromJobCheckpoint(currentCheckpoint),
      semanticReviewContractVersion,
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
  job: Pick<ScanJobRow, "productContract" | "fulfillmentMethodology" | "recommendationReportVersion">
): "legacy" | "recommendation_v1" | "recommendation_v2" {
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

async function loadReferencedEvidenceAssets(sourceReport: import("@open-geo-console/ai-report-engine").CombinedGeoReportV1 | import("@open-geo-console/ai-report-engine").CombinedGeoReportV2 | import("@open-geo-console/ai-report-engine").CombinedGeoReportV3):Promise<ReportEvidenceAssetRow[]>{
  const references=sourceReport.technicalFoundation.evidenceAssets;
  const ids=new Set(references.map(({assetId})=>assetId));
  const jobIds=[...new Set(references.map(({jobId})=>jobId))];
  return (await Promise.all(jobIds.map((jobId)=>listEvidenceAssets(sourceReport.reportId,jobId)))).flat().filter((asset)=>ids.has(asset.id));
}

async function finalizeStagingArtifactRefreshJob(input:{
  job:ScanJobRow;workerId:string;checkpoint:WorkerCheckpoint;
  context:NonNullable<Awaited<ReturnType<typeof getStagingCombinedArtifactRefreshContext>>>;
  evidenceAssets:ReportEvidenceAssetRow[];checkpointJob:WorkerCheckpointWriter;signal?:AbortSignal;remainingMs:number;liveDrill?:StagingLiveDrill;
}):Promise<void>{
  let checkpoint=input.checkpoint;
  createPublicSourceAttemptBudget(input.remainingMs);
  const source=input.context.sourceReport;
  const questionSet=input.job.businessQuestionSetId?await getConfirmedBusinessQuestionSet(input.job.reportId,input.job.businessQuestionSetId):null;
  if(!questionSet)throw new Error("The refresh question set is not locked and available.");
  const resumed=correctionArtifactVerificationResume(checkpoint);
  const result=resumed??await(async()=>{
    const dependencies=await createProductionPublicSourceForensicsDependencies(process.env,{createDependencies:async(runtime)=>
      createWorkerPublicSourceForensicsDependencies({job:input.job,workerId:input.workerId,
        coverage:{plannedPages:input.job.plannedPages,successfulPages:input.job.successfulPages,failedPages:input.job.failedPages},
        readCheckpoint:()=>checkpoint,onCheckpointSaved:async(next)=>{checkpoint=next;},checkpointJob:input.checkpointJob,
        retrieveSource:createWorkerPublicSourceRetriever(),artifactReadiness:{async verify(){}},forceSnapshotRefreshAfter:source.generatedAt,
        liveDrill:input.liveDrill,signal:input.signal},runtime)});
    return runPublicSourceForensicsPipeline({reportId:input.job.reportId,jobId:input.job.id,...resolvePublicSourceRunScope(dependencies),
      targetUrl:source.targetUrl,websiteFoundation:source.technicalFoundation.aiReport,businessQuestionSet:questionSet,dependencies,signal:input.signal});
  })();
  const resolvedAnswers=await resolveCombinedQuestionAnswers({checkpoint,questionSet,forensic:result.report,checkpointJob:input.checkpointJob,
    coverage:{plannedPages:input.job.plannedPages,successfulPages:input.job.successfulPages,failedPages:input.job.failedPages},signal:input.signal});
  checkpoint=resolvedAnswers.checkpoint;
  const ready=await buildReadyCombinedArtifact({artifactRevisionId:input.context.artifactRevisionId,artifactRevision:input.context.artifactRevision,
    reportId:input.job.reportId,orderId:input.context.orderId,jobId:input.job.id,originalPaidJobId:source.originalPaidJobId,
    targetUrl:source.targetUrl,technicalReport:source.technicalFoundation.technicalReport,aiReport:source.technicalFoundation.aiReport,
    evidenceAssets:input.evidenceAssets,businessQuestionSet:questionSet,businessQuestionAnswers:resolvedAnswers.answers,
    publicSourceForensics:result.report,languageValidationScope:"presentation_refresh"});
  await terminalizeStagingCombinedArtifactRefresh({report:ready.report,workerId:input.workerId,checkpointIdentityHash:result.checkpoint.identityHash,
    snapshotRefs:result.commercialSnapshotRefs,htmlSha256:ready.htmlSha256,pdfSha256:ready.pdfSha256,pdfStorageKey:ready.pdfStorageKey,pageCount:ready.pageCount});
}

async function finalizeCorrectionJob(input: {
  job: ScanJobRow;
  workerId: string;
  checkpoint: WorkerCheckpoint;
  websiteFoundation: AiWebsiteReportV1;
  technicalReport: GeoAuditReport;
  targetUrl: string;
  evidenceAssets: ReportEvidenceAssetRow[];
  context: NonNullable<Awaited<ReturnType<typeof getCorrectionExecutionContext>>>;
  checkpointJob: WorkerCheckpointWriter;
  signal?: AbortSignal;
  remainingMs: number;
  liveDrill?: StagingLiveDrill;
}): Promise<void> {
  let checkpoint=input.checkpoint;
  createPublicSourceAttemptBudget(input.remainingMs);
  const questionSet=input.job.businessQuestionSetId ? await getConfirmedBusinessQuestionSet(input.job.reportId,input.job.businessQuestionSetId) : null;
  if(!questionSet) throw new Error("The correction question set is not locked and available.");
  const resumed=correctionArtifactVerificationResume(checkpoint);
  const result=resumed ?? await (async()=>{
    const dependencies=await createProductionPublicSourceForensicsDependencies(process.env,{createDependencies:async(runtime)=>
      createWorkerPublicSourceForensicsDependencies({job:input.job,workerId:input.workerId,
        coverage:{plannedPages:input.job.plannedPages,successfulPages:input.job.successfulPages,failedPages:input.job.failedPages},
        readCheckpoint:()=>checkpoint,onCheckpointSaved:async(next)=>{checkpoint=next;},checkpointJob:input.checkpointJob,
        retrieveSource:createWorkerPublicSourceRetriever(),artifactReadiness:{async verify(){ /* combined readiness runs below */ }},
        liveDrill:input.liveDrill,signal:input.signal},runtime)});
    return runPublicSourceForensicsPipeline({reportId:input.job.reportId,jobId:input.job.id,
      ...resolvePublicSourceRunScope(dependencies),targetUrl:input.targetUrl,websiteFoundation:input.websiteFoundation,
      businessQuestionSet:questionSet,dependencies,signal:input.signal});
  })();
  input.signal?.throwIfAborted();
  const resolvedAnswers=await resolveCombinedQuestionAnswers({checkpoint,questionSet,forensic:result.report,
    checkpointJob:input.checkpointJob,coverage:{plannedPages:input.job.plannedPages,successfulPages:input.job.successfulPages,failedPages:input.job.failedPages},signal:input.signal});
  checkpoint=resolvedAnswers.checkpoint;
  const ready=await buildReadyCombinedArtifact({artifactRevisionId:input.context.artifactRevisionId,
    artifactRevision:input.context.artifactRevision,reportId:input.job.reportId,orderId:input.context.orderId,jobId:input.job.id,
    originalPaidJobId:input.context.originalPaidJobId,targetUrl:input.targetUrl,technicalReport:input.technicalReport,
    aiReport:input.websiteFoundation,evidenceAssets:input.evidenceAssets,businessQuestionSet:questionSet,
    businessQuestionAnswers:resolvedAnswers.answers,publicSourceForensics:result.report});
  input.signal?.throwIfAborted();
  await terminalizeCombinedCorrection({report:ready.report,workerId:input.workerId,
    checkpointIdentityHash:result.checkpoint.identityHash,snapshotRefs:result.commercialSnapshotRefs,
    htmlSha256:ready.htmlSha256,pdfSha256:ready.pdfSha256,pdfStorageKey:ready.pdfStorageKey,pageCount:ready.pageCount});
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

export const correctionArtifactVerificationResume = publicSourceArtifactVerificationResume;

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
  semanticValidation: "legacy" | "deferred",
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

export function combinedV3LanguageValidationScope(
  reason: ScanJobRow["reason"]
): CombinedReportLanguageScope | undefined {
  return reason === "replacement_fulfillment" || reason === "staging_artifact_refresh" ? "presentation_refresh" : undefined;
}

export function resolvePaidV3SemanticValidation(
  job: Pick<ScanJobRow, "artifactContract" | "recommendationReportVersion" | "reason">,
  checkpoint: JobCheckpoint
): "legacy" | "deferred" {
  if (job.artifactContract !== "combined_geo_report_v3" || job.recommendationReportVersion !== 3) {
    return "legacy";
  }
  const version = readSemanticReviewContractVersion(checkpoint);
  if (version === null) return "legacy";
  if (job.reason !== "standard") {
    throw new Error("Semantic-reviewed Paid V3 is allowed only for the ordinary immutable Paid lineage.");
  }
  return "deferred";
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
      createPublicSourceAttemptBudget(input.remainingMs);
      const dependencies = await createProductionPublicSourceForensicsDependencies(process.env, {
        createDependencies: async (runtime) => createWorkerPublicSourceForensicsDependencies({
          job: input.job,
          workerId: input.workerId,
          coverage: input.coverage,
          readCheckpoint: () => checkpoint,
          onCheckpointSaved: async (next) => { checkpoint = next; },
          checkpointJob: input.checkpointJob,
          retrieveSource: createWorkerPublicSourceRetriever(),
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
  semanticValidation: "legacy" | "deferred"
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
  const seededQ1 = freeTeaserSeededQ1(teaserCheckpoint, questionSet, semanticValidation === "deferred"
    ? { semanticReviewContractVersion: "report-semantic-review-v1" }
    : {});
  if (!teaserCheckpoint.q1AnswerCard || teaserCheckpoint.q1AnswerCard.answerMode !== "generative_search_v1") {
    throw new Error("Prospective Paid V3 reviewed Free Q1 is unavailable.");
  }
  return {
    seededQ1,
    reviewedFreeQ1: teaserCheckpoint.q1AnswerCard,
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
}): Promise<void> {
  let checkpoint = input.checkpoint;
  const businessQuestionSet = input.job.businessQuestionSetId
    ? await getConfirmedBusinessQuestionSet(input.job.reportId, input.job.businessQuestionSetId)
    : null;
  const pending = input.artifactContext ?? await getPendingPaidCombinedContext(input.job.id);
  if (!businessQuestionSet || !pending) throw new Error("The combined job requires its exact locked questions and pending artifact revision.");
  const semanticValidation = resolvePaidV3SemanticValidation(input.job, checkpoint);
  const evidenceAssets = input.evidenceAssets ?? await listEvidenceAssets(input.job.reportId, input.job.id);
  await assertReusableEvidenceAssets(evidenceAssets);
  const prospectiveTeaser = input.job.recommendationReportVersion === 3
    ? await resolveProspectiveV3TeaserContext(input.job.reportId, input.targetUrl, businessQuestionSet, semanticValidation)
    : null;
  const resumedV3 = input.job.artifactContract === "combined_geo_report_v3" ? combinedV3ArtifactVerificationResume(checkpoint) : null;
  if (resumedV3) {
    assertPaidV3ResumeSemanticAuthority(semanticValidation, resumedV3);
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
          resumedV3.commercialSnapshotRefs
        )
      });
      return;
    }
    const ready = await materializePreparedCombinedArtifactV3(resumedV3.report, evidenceAssets);
    await terminalizeReadyCombinedArtifact(input, ready, resumedV3.checkpoint.identityHash, resumedV3.commercialSnapshotRefs);
    return;
  }
  createPublicSourceAttemptBudget(input.remainingMs);
  const client = createConfiguredClient();
  let generativeCheckpoint: AnswerFirstV3CheckpointV2 | null = null;
  if (input.job.artifactContract === "combined_geo_report_v3") {
    const provider = resolveGenerativeSearchAnswerProvider(process.env, {
      locale: businessQuestionSet.locale,
      region: businessQuestionSet.region
    });
    const collected = await resolveGenerativeAnswerFirstV3({
      questionSet: businessQuestionSet,
      provider,
      locale: businessQuestionSet.locale,
      region: businessQuestionSet.region,
      targetUrl: input.targetUrl,
      targetAliases: businessQuestionSet.identityExclusions,
      seededQ1: prospectiveTeaser?.seededQ1,
      checkpoint: checkpoint.answerFirstV3,
      ...(semanticValidation === "deferred" ? { semanticValidation: "deferred" as const } : {}),
      signal: input.signal,
      saveCheckpoint: async (answerFirstV3) => {
        const next = { ...checkpoint, answerFirstV3 };
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "grounded_answer_synthesis", progress: 90, checkpoint: next as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
    });
    generativeCheckpoint = collected.checkpoint;
  }
  // Public-search authority and retrieval belong to the audit sidecar. Resolve
  // them only after the ordinary answers have been safely checkpointed.
  const runtime = await resolveProductionPublicSearchRuntime({ environment: process.env, getAuthority: getActivePublicSearchSurfaceAuthority });
  const evidenceCutoffAt = checkpoint.providerDiscovery?.evidenceCutoffAt ?? new Date().toISOString();
  const providerContext = createProductionProviderDiscoveryContext({
    runtime,
    questionSet: businessQuestionSet,
    artifactContract: input.job.artifactContract === "combined_geo_report_v3" ? "combined_geo_report_v3" : "combined_geo_report_v2",
    websiteCategories: [input.websiteFoundation.organizationProfile.businessModel ?? "", ...input.websiteFoundation.organizationProfile.productsAndServices].filter(Boolean),
    websiteFoundationHash: createHash("sha256").update(JSON.stringify(input.websiteFoundation)).digest("hex"),
    workerId: `provider-discovery:${input.job.id}:${input.workerId}`,
    evidenceCutoffAt,
    extractionClient: client,
    extractionModel: client.configuredModel,
    forceSnapshotRefreshAfter: input.forceSnapshotRefreshAfter,
    getCheckpoint: async () => checkpoint.providerDiscovery ?? null,
    saveCheckpoint: async (providerDiscovery) => {
      const next = { ...checkpoint, providerDiscovery };
      const updated = await input.checkpointJob({ stage: "synthesizing", phase: providerDiscovery.phase === "complete" ? "grounded_answer_synthesis" : providerDiscovery.phase, progress: providerPhaseProgress(providerDiscovery.phase), checkpoint: next as JobCheckpoint, ...input.coverage });
      checkpoint = normalizeCheckpoint(updated.checkpoint);
    }
  });
  const providerResult = await runProviderDiscoveryPipeline({
    identity: providerContext.identity,
    dependencies: providerContext.dependencies,
    hardDeadlineAt: new Date(Date.now() + Math.max(1_000, input.remainingMs)).toISOString(),
    signal: input.signal
  });
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
    forceSnapshotRefreshAfter: input.forceSnapshotRefreshAfter,
    liveDrill: input.liveDrill,
    semanticValidation,
    signal: input.signal,
    collaborators: { resolveSnapshot: providerContext.resolveForensicSnapshot, getReport: getSourceForensicReportForJob, saveReport: saveSourceForensicReport }
  }, runtime);
  const forensicResult = publicSourceSynthesisResume(checkpoint) ?? await runPublicSourceForensicsPipeline({
      reportId: input.job.reportId,
      jobId: input.job.id,
      ...resolvePublicSourceRunScope(dependencies),
      targetUrl: input.targetUrl,
      websiteFoundation: input.websiteFoundation,
      businessQuestionSet,
      dependencies,
      fanoutOverrides: new Map([[providerContext.discoveryFanout.questionId, providerContext.discoveryFanout]]),
      ...(semanticValidation === "deferred" ? { semanticValidation: "deferred" as const } : {}),
      signal: input.signal
    });
  if (input.job.artifactContract === "combined_geo_report_v2" && forensicResult.report.commercialOutcome !== "completed") throw new Error("V2 combined activation requires complete claim-bound public-source coverage.");
  if (input.job.artifactContract === "combined_geo_report_v3") {
    const verificationSnapshotId = providerResult.checkpoint.verificationSnapshotId;
    if (!verificationSnapshotId) throw new Error("V3 provider verification snapshot is unavailable before answer synthesis.");
    const storedSources = await loadAnswerFirstV3StoredSources([
      verificationSnapshotId,
      ...forensicResult.report.snapshotRefs.map(({ snapshotId }) => snapshotId)
    ]);
    const provider = resolveGenerativeSearchAnswerProvider(process.env, {
      locale: runtime.authority.surface.locale,
      region: runtime.authority.surface.region
    });
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
      signal: input.signal,
      saveCheckpoint: async (answerFirstV3: AnswerFirstV3CheckpointV2) => {
        const next = { ...checkpoint, answerFirstV3 };
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "grounded_answer_synthesis", progress: 98, checkpoint: next as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
    };
    const answerResult = semanticValidation === "deferred"
      ? await resolveGenerativeAnswerFirstV3({ ...answerInput, semanticValidation: "deferred" })
      : await resolveGenerativeAnswerFirstV3(answerInput);
    const verificationRef = await providerVerificationCommercialRef(verificationSnapshotId);
    const snapshotRefs = uniqueSnapshotRefs([...forensicResult.commercialSnapshotRefs, verificationRef]);
    if (snapshotRefs.length !== 4) throw new Error("V3 combined reports require exactly four immutable market snapshots.");
    if (semanticValidation === "deferred") {
      const deferredAnswerResult = answerResult as DeferredGenerativeAnswerFirstV3;
      if (!prospectiveTeaser || !Array.isArray(deferredAnswerResult.answerCardDrafts) ||
          deferredAnswerResult.answerCardDrafts.length !== 3) {
        throw new Error("Reviewed Paid V3 requires deferred answer drafts and its reviewed Free lineage.");
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
      const reviewed = await runPaidV3SemanticReview({
        report: semanticDraft,
        manifest: {
          ...semanticAuthorities.manifest,
          authorityBindings
        },
        sourceSelectionContext: semanticAuthorities.sourceSelectionContext,
        answerResults: diagnosisResult.checkpoint.answerResults,
        reviewedFreeQ1: prospectiveTeaser.reviewedFreeQ1,
        reviewedFreeQ1Annotation,
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
      const receipt = reviewed.report.semanticReviewReceipt;
      if (!receipt) throw new Error("Reviewed Paid V3 report receipt is unavailable.");
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
          snapshotRefs
        )
      });
      return;
    }
    if (!("answerCards" in answerResult)) {
      throw new Error("Legacy Paid V3 requires complete legacy answer cards.");
    }
    const sourceSelectionDiagnosis = answerResult.checkpoint.sourceSelectionDiagnosis;
    if (!sourceSelectionDiagnosis) throw new Error("Prospective V3 artifact requires source selection diagnosis.");
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
      languageValidationScope: combinedV3LanguageValidationScope(input.job.reason),
      onReportPrepared: async (report) => {
        const next = { ...checkpoint, pendingArtifactVerification: { report, commercialSnapshotRefs: snapshotRefs } };
        const updated = await input.checkpointJob({ stage: "synthesizing", phase: "artifact_verification", progress: 99, checkpoint: next as JobCheckpoint, ...input.coverage });
        checkpoint = normalizeCheckpoint(updated.checkpoint);
      }
    });
    await terminalizeReadyCombinedArtifact(input, ready, diagnosisResult.checkpoint.identityHash, snapshotRefs);
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
  if(input.job.reason==="staging_artifact_refresh") await terminalizeStagingCombinedArtifactRefresh(terminalInput);
  else if(input.job.reason==="replacement_fulfillment") await terminalizeCombinedReplacement(terminalInput);
  else if(input.job.reason==="paid_report_correction") await terminalizeCombinedCorrection(terminalInput);
  else await terminalizePaidCombinedReport(terminalInput);
}

async function terminalizeReadyCombinedArtifact(
  input: Parameters<typeof finalizeProviderDiscoveryCombinedJob>[0],
  ready: Awaited<ReturnType<typeof buildReadyCombinedArtifactV3>>,
  checkpointIdentityHash: string,
  snapshotRefs: PublicSourceCommercialSnapshotRef[]
): Promise<void> {
  const terminalInput = { report: ready.report, workerId: input.workerId, checkpointIdentityHash, snapshotRefs,
    htmlSha256: ready.htmlSha256, pdfSha256: ready.pdfSha256, pdfStorageKey: ready.pdfStorageKey, pageCount: ready.pageCount };
  if(input.job.reason==="staging_artifact_refresh") await terminalizeStagingCombinedArtifactRefresh(terminalInput);
  else if(input.job.reason==="replacement_fulfillment") await terminalizeCombinedReplacement(terminalInput);
  else if(input.job.reason==="paid_report_correction") await terminalizeCombinedCorrection(terminalInput);
  else await terminalizePaidCombinedReport(terminalInput);
}

function isCombinedGeoReportV3(value: RecommendationForensicReportV2 | CombinedGeoReportV3 | undefined): value is CombinedGeoReportV3 {
  return Boolean(value && "artifactContract" in value && value.artifactContract === "combined_geo_report_v3");
}

function groundedEvidenceFromForensic(report: RecommendationForensicReportV2): GroundedAnswerEvidence[] {
  const questionFanouts = report.questions.questions.slice(1).map((question) => ({ question, queryIds: new Set(report.fanouts.find(({ questionId }) => questionId === question.id)?.queries.map(({ id }) => id) ?? []) }));
  return questionFanouts.flatMap(({ question, queryIds }) => report.sourceGraph.evidence.flatMap((evidence) => {
    if (!evidence.queryVariantIds.some((id) => queryIds.has(id)) || !evidence.verifiedExcerpt) return [];
    const relevant = groundedExcerptRelevant(evidence.verifiedExcerpt, `${question.normalizedText} ${question.derivation.subject}`);
    return [{ evidenceId: evidence.evidenceId, questionId: question.id, subjectKey: `question:${question.id}`, registrableDomain: evidence.registrableDomain,
      exactExcerpt: evidence.verifiedExcerpt, eligible: evidence.retrievalReadiness.ready && relevant, direct: evidence.retrievalReadiness.ready && relevant && !evidence.metadataOnly }];
  }));
}

function groundedExcerptRelevant(excerpt:string,question:string):boolean{
  const normalizedQuestion=question.normalize("NFKC").toLocaleLowerCase();
  const terms=[...(normalizedQuestion.match(/[a-z0-9][a-z0-9-]{2,}/g)??[]),...(normalizedQuestion.match(/[\p{Script=Han}]{2,}/gu)??[]).flatMap((run)=>run.length<=6?[run]:Array.from({length:run.length-1},(_,index)=>run.slice(index,index+2)))];
  const ignored=new Set(["which","what","where","provide","哪些","什么","如何","是否"]),text=excerpt.normalize("NFKC").toLocaleLowerCase();
  return [...new Set(terms)].filter((term)=>!ignored.has(term)).some((term)=>text.includes(term));
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
      signal: input.signal
    }),
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
  outcome: "completed" | "completed_limited" | "failed"
): Promise<void> {
  try {
    await recordPaidJobOutcome({ jobId, outcome });
  } catch (error) {
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

function mergeCompletedAnalyses(
  current: readonly CompletedPageAnalysis[],
  analyses: readonly PageAnalysis[],
  evidenceByUrl: Map<string, StoredPageEvidence>
): CompletedPageAnalysis[] {
  const merged = new Map(current.map((stored) => [canonicalUrl(stored.url), stored]));
  for (const analysis of analyses) {
    const evidence = evidenceByUrl.get(canonicalUrl(analysis.url));
    if (!evidence) continue;
    merged.set(canonicalUrl(analysis.url), {
      url: analysis.url,
      contentHash: evidence.contentHash,
      analysis
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

function fetchWithSignal(fetchImpl: typeof fetch, signal: AbortSignal): typeof fetch {
  return (input, init = {}) => fetchImpl(input, { ...init, signal });
}

function configuredAiTimeoutMs(): number {
  const configured = Number(process.env.OGC_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180_000;
}

function hashSynthesisInput(
  pages: readonly StoredPageEvidence[],
  analyses: readonly PageAnalysis[],
  coverage: object
): string {
  return createHash("sha256").update(JSON.stringify({
    pages: pages.map(({ page, contentHash }) => ({ url: canonicalUrl(page.url), contentHash }))
      .sort((left, right) => left.url.localeCompare(right.url)),
    analyses: analyses.map(({ url, ...analysis }) => ({ url: canonicalUrl(url), ...analysis }))
      .sort((left, right) => left.url.localeCompare(right.url)),
    coverage
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

async function enhanceV3AnswerCardsWithDiagnosis<T extends PaidV3SemanticAnswerCardDraft>(input: {
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
}): Promise<{
  answerCards: [T, T, T];
  checkpoint: AnswerFirstV3CheckpointV2;
}> {
  const diagnosisInputs = input.answerCards.map((card) => ({
    questionId: card.questionId,
    targetPages: buildFreeTeaserDiagnosisTargetPages(card.questionId, input.admission)
  }));
  if (diagnosisInputs.some(({ targetPages }) => targetPages.length === 0)) {
    throw new Error("Prospective V3 diagnosis requires non-empty target-site evidence for every question.");
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
  if (input.checkpoint.diagnosisIdentityHash &&
      input.checkpoint.diagnosisIdentityHash !== diagnosisIdentityHash) {
    throw new Error("Paid V3 diagnosis checkpoint identity does not match current question evidence.");
  }

  let checkpoint = input.checkpoint;
  const diagnosisByQuestion = { ...(checkpoint.diagnosisByQuestion ?? {}) };
  for (let index = 0; index < input.answerCards.length; index += 1) {
    input.signal?.throwIfAborted();
    const card = input.answerCards[index]!;
    if (card.answerMode !== "generative_search_v1") {
      throw new Error("Prospective V3 per-question diagnosis requires generative answer cards.");
    }
    const targetPages = diagnosisInputs[index]!.targetPages;
    let diagnosis = diagnosisByQuestion[card.questionId];
    if (input.semanticValidation === "deferred" && index === 0) {
      if (!("diagnosis" in card) || !card.diagnosis) {
        throw new Error("Deferred Paid V3 must reuse the reviewed Free Q1 diagnosis.");
      }
      diagnosis = parseReportV4DiagnosisOutputForQuestion(card.diagnosis, {
        questionId: card.questionId,
        sourceEvidenceIds: card.sources.map(({ sourceId }) => sourceId)
      }, { semanticValidation: "deferred" });
      diagnosisByQuestion[card.questionId] = diagnosis;
      continue;
    }
    if (diagnosis) {
      diagnosis = parseReportV4DiagnosisOutputForQuestion(diagnosis, {
        questionId: card.questionId,
        sourceEvidenceIds: card.sources.map(({ sourceId }) => sourceId)
      }, { semanticValidation: input.semanticValidation });
    } else {
      const result = await enhanceReportV4QuestionDiagnosis({
        question: v3CardToV4Question(card, index),
        locale: input.locale,
        targetPages,
        provider: input.provider,
        getTokenBudget: (request) => buildReportV4MimoDiagnosisTokenBudget({
          runtime: input.modelRuntime,
          request
        }),
        semanticValidation: input.semanticValidation,
        signal: input.signal
      });
      if (result.status !== "completed") {
        throw new Error("Paid V3 per-question diagnosis did not complete.");
      }
      diagnosis = parseReportV4DiagnosisOutputForQuestion(result.diagnosis, {
        questionId: card.questionId,
        sourceEvidenceIds: card.sources.map(({ sourceId }) => sourceId)
      }, { semanticValidation: input.semanticValidation });
      diagnosisByQuestion[card.questionId] = diagnosis;
      checkpoint = {
        ...checkpoint,
        diagnosisIdentityHash,
        diagnosisByQuestion
      };
      await input.saveCheckpoint(checkpoint);
    }
  }

  const enhanced = input.answerCards.map((card) => ({
    ...card,
    diagnosis: diagnosisByQuestion[card.questionId]!
  })) as [T, T, T];
  const ready: AnswerFirstV3CheckpointV2 = {
    ...checkpoint,
    stage: "per_question_diagnosis_ready",
    diagnosisIdentityHash,
    diagnosisByQuestion,
    ...(input.semanticValidation === "deferred" ? {} : {
      answerCards: enhanced as [
        Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>,
        Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>,
        Extract<OpenGeoAnswerCardV3, { answerMode: "generative_search_v1" }>
      ]
    })
  };
  if (checkpoint.stage !== ready.stage ||
      JSON.stringify(checkpoint.answerCards) !== JSON.stringify(ready.answerCards)) {
    await input.saveCheckpoint(ready);
  }
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
} {
  if (input.answerCards.length !== 3 || input.answerCards.some((card) => card.answerMode !== "generative_search_v1")) {
    throw new Error("Reviewed Paid V3 requires exactly three generative answer drafts.");
  }
  const answerCards = input.answerCards as [PaidV3GenerativeDraftCard, PaidV3GenerativeDraftCard, PaidV3GenerativeDraftCard];
  const canonicalQuestions = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  if (canonicalQuestions.length !== 3) throw new Error("Reviewed Paid V3 requires exactly three canonical questions.");
  const auditByUrl = new Map(input.storedSources.map((source) => [canonicalUrl(source.canonicalUrl), source]));
  const sources = answerCards.flatMap((card) => card.sources.map((source) => {
    const audit = auditByUrl.get(canonicalUrl(source.canonicalUrl));
    const originalText = JSON.stringify({
      title: source.title,
      canonicalUrl: source.canonicalUrl,
      registrableDomain: source.registrableDomain,
      citedText: source.citedText,
      auditExcerpt: audit?.exactExcerpt ?? null,
      retrievalStatus: source.retrievalStatus,
      ownershipCategory: source.ownershipCategory,
      providerResultOrder: source.providerResultOrder
    });
    return {
      sourceId: source.sourceId,
      questionId: card.questionId,
      canonicalUrl: source.canonicalUrl,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText)
    };
  }));
  const sourceIds = new Set(sources.map(({ sourceId }) => sourceId));
  const sourceEvidence = sources.map((source) => ({
    evidenceId: source.sourceId,
    questionId: source.questionId,
    sourceId: source.sourceId,
    originalText: source.originalText,
    originalTextHash: source.originalTextHash
  }));
  const targetEvidence = answerCards.flatMap((card) =>
    buildFreeTeaserDiagnosisTargetPages(card.questionId, input.admission).flatMap((page) =>
      page.sourceLocations.map((location) => {
        const originalText = page.summary.slice(location.startOffset, location.endOffset);
        return {
          evidenceId: location.locationId,
          questionId: card.questionId,
          sourceId: null,
          originalText,
          originalTextHash: reportSemanticTextHash(originalText)
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
      originalTextHash: reportSemanticTextHash(originalText)
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
    originalTextHash: reportSemanticTextHash(identityEvidenceText)
  };
  const evidence = [...sourceEvidence, ...targetEvidence, ...targetPageEvidence, identityEvidence];
  const observationResults = sources.map((source, index) => ({
    observationId: `paid-v3-answer-source-observation:${index + 1}:${source.questionId}`,
    resultId: source.sourceId,
    questionId: source.questionId!,
    originalText: source.originalText,
    originalTextHash: source.originalTextHash
  }));
  const entities = sources.map((source, index) => ({
    entityId: `paid-v3-source-entity:${index + 1}:${createHash("sha256").update(`${source.questionId}\0${source.sourceId}`).digest("hex").slice(0, 16)}`,
    questionId: source.questionId,
    kind: "competitor_candidate" as const,
    originalText: source.originalText,
    originalTextHash: source.originalTextHash
  }));
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

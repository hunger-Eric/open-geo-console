import {
  AI_REPORT_PROMPT_VERSION,
  REPORT_TIER_LIMITS,
  PageAnalysisBatchError,
  ReportValidationError,
  analyzePageBatch,
  combinedBusinessQuestionAnswerInputHash,
  createOpenAiCompatibleClient,
  inferPageType,
  planPagesWithRecovery,
  preparePlanningCandidates,
  parseCombinedBusinessQuestionAnswers,
  synthesizeCombinedBusinessQuestionAnswers,
  synthesizeGroundedBusinessAnswersV2,
  synthesizeWebsiteReportWithRecovery,
  type AiWebsiteReportV1,
  type CombinedBusinessQuestionAnswers,
  type GroundedAnswerEvidence,
  type RecommendationForensicReportV2,
  type ExtractedPage,
  type PageAnalysis,
  type PlannedPage
} from "@open-geo-console/ai-report-engine";
import { auditSite, type GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { RobotsPolicy } from "@open-geo-console/site-crawler";
import type { CanonicalBuyerQuestion, ConfirmedBusinessQuestionSet, PublicSearchSurfaceAdapter, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";
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
import { getActivePublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import { getCorrectionExecutionContext } from "@/db/report-corrections";
import { listEvidenceAssets } from "@/db/evidence-assets";
import { terminalizeCombinedCorrection, terminalizePaidCombinedReport } from "@/db/combined-correction-terminalization";
import { getPendingPaidCombinedContext } from "@/db/combined-reports";
import { failStagingCombinedArtifactRefresh, getStagingCombinedArtifactRefreshContext, terminalizeStagingCombinedArtifactRefresh } from "@/db/staging-combined-artifact-refresh";
import { buildReadyCombinedArtifact, buildReadyCombinedArtifactV2 } from "@/report/combined-artifact-readiness";
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
import { createProductionPublicSourceForensicsDependencies, resolveProductionPublicSearchRuntime } from "@/public-source-forensics/production-runtime";
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
import {
  calculateEffectiveCoverage,
  determineResumeStage,
  fetchPlannedPagesWithRecovery,
  type CompletedPageAnalysis,
  type RecoveryCheckpoint
} from "./recovery";

interface StoredPageEvidence {
  page: ExtractedPage;
  canonicalUrl?: string;
  httpStatus: number;
  contentHash: string;
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
    report: RecommendationForensicReportV2;
    commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
  };
  providerDiscovery?: ProviderDiscoveryCheckpointV1;
  combinedQuestionAnswers?: CombinedBusinessQuestionAnswers;
  discoverySnapshot?: DiscoverySnapshot;
  pageAnalysisContentHashes?: Record<string, string>;
  aiEnabled?: boolean;
  aiSkipReason?: string;
  technicalCompleted?: boolean;
}

export async function processScanJob(job: ScanJobRow, workerId: string, options: { liveDrill?: StagingLiveDrill } = {}): Promise<void> {
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
  try {
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
      if(context.sourceReport.artifactContract==="combined_geo_report_v2"){
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

    const crawl = await fetchPlannedPagesWithRecovery<StoredPageEvidence>({
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
    }, { signal: execution.controller.signal });
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
    const phase = currentJob?.currentPhase ?? phaseForStage(currentJob?.stage ?? job.stage);
    const normalized = normalizeJobError(error, {
      jobId: job.id, phase, phaseAttempt: currentJob?.phaseAttempt ?? job.phaseAttempt ?? 0,
      resumeGeneration: currentJob?.resumeGeneration ?? job.resumeGeneration ?? 0,
      configuredSecrets: [process.env.OGC_AI_API_KEY ?? "", process.env.OGC_PUBLIC_SEARCH_MIMO_API_KEY ?? ""]
    });
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
    if (job.tier === "deep" && failedJob.stage === "failed" && !["paid_report_correction","staging_artifact_refresh"].includes(job.reason)) {
      await recordCommercialOutcomeSafely(job.id, "failed");
    }
    if(job.reason==="staging_artifact_refresh"&&failedJob.stage==="failed")await failStagingCombinedArtifactRefresh(job.id);
  } finally {
    execution.stop();
  }
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
  if (job.fulfillmentMethodology === "public_search_source_forensics_v1" && job.recommendationReportVersion === 2) return "recommendation_v2";
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

async function loadReferencedEvidenceAssets(sourceReport: import("@open-geo-console/ai-report-engine").CombinedGeoReportV1 | import("@open-geo-console/ai-report-engine").CombinedGeoReportV2):Promise<ReportEvidenceAssetRow[]>{
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
  return { report:checkpoint.pendingArtifactVerification.report,checkpoint:checkpoint.publicSourceForensics,
    commercialSnapshotRefs:checkpoint.pendingArtifactVerification.commercialSnapshotRefs };
}

export const correctionArtifactVerificationResume = publicSourceArtifactVerificationResume;

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
    if (input.job.artifactContract === "combined_geo_report_v2") {
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
    if (input.job.artifactContract !== "combined_geo_report_v1" && ["artifact_verification", "terminalization"].includes(checkpointPhase() ?? "") && checkpoint.pendingArtifactVerification) {
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
  if (!businessQuestionSet || !pending) throw new Error("The V2 combined job requires its exact locked questions and pending artifact revision.");
  const evidenceAssets = input.evidenceAssets ?? await listEvidenceAssets(input.job.reportId, input.job.id);
  await assertReusableEvidenceAssets(evidenceAssets);
  createPublicSourceAttemptBudget(input.remainingMs);
  const runtime = await resolveProductionPublicSearchRuntime({ environment: process.env, getAuthority: getActivePublicSearchSurfaceAuthority });
  const client = createConfiguredClient();
  const evidenceCutoffAt = checkpoint.providerDiscovery?.evidenceCutoffAt ?? new Date().toISOString();
  const providerContext = createProductionProviderDiscoveryContext({
    runtime,
    questionSet: businessQuestionSet,
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
    signal: input.signal,
    collaborators: { resolveSnapshot: providerContext.resolveForensicSnapshot, getReport: getSourceForensicReportForJob, saveReport: saveSourceForensicReport }
  }, runtime);
  const forensicResult = await runPublicSourceForensicsPipeline({
    reportId: input.job.reportId,
    jobId: input.job.id,
    ...resolvePublicSourceRunScope(dependencies),
    targetUrl: input.targetUrl,
    websiteFoundation: input.websiteFoundation,
    businessQuestionSet,
    dependencies,
    fanoutOverrides: new Map([[providerContext.discoveryFanout.questionId, providerContext.discoveryFanout]]),
    signal: input.signal
  });
  if (forensicResult.report.commercialOutcome !== "completed") throw new Error("V2 combined activation requires complete claim-bound public-source coverage.");
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
  else if(input.job.reason==="paid_report_correction") await terminalizeCombinedCorrection(terminalInput);
  else await terminalizePaidCombinedReport(terminalInput);
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
    prepareArtifactVerification: async ({ jobId, report, checkpoint: publicSourceForensics, commercialSnapshotRefs }) => {
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
    },
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

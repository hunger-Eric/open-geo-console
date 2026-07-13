import {
  AI_REPORT_PROMPT_VERSION,
  REPORT_TIER_LIMITS,
  PageAnalysisBatchError,
  RecommendationForensicReportValidationError,
  ReportValidationError,
  analyzePageBatch,
  createOpenAiCompatibleClient,
  inferPageType,
  planPagesWithRecovery,
  preparePlanningCandidates,
  synthesizeWebsiteReportWithRecovery,
  type AiWebsiteReportV1,
  type ExtractedPage,
  type PageAnalysis,
  type PlannedPage
} from "@open-geo-console/ai-report-engine";
import { auditSite, type GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { RobotsPolicy } from "@open-geo-console/site-crawler";
import type { CanonicalBuyerQuestion, PublicSearchSurfaceAdapter, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";
import { createHash } from "node:crypto";
import { checkpointScanJob, failScanJob, heartbeatScanJob, isBillableCoverage, terminalizeScanJob, type CheckpointScanJobInput } from "@/db/jobs";
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
import {
  getCrawlEvidence,
  getReusableCrawlEvidence,
  purgeExpiredCrawlContent,
  saveCrawlEvidence
} from "@/db/crawl-evidence";
import type { JobCheckpoint, ScanJobRow } from "@/db/schema";
import { projectFreeAiReport } from "@/report/visibility";
import { createSafeFetch } from "@/server/safe-fetch";
import { captureReportVisualEvidence } from "./visual-evidence";
import { createProductionPublicSourceForensicsDependencies } from "@/public-source-forensics/production-runtime";
import { createPublicSourceArtifactReadinessGate } from "@/public-source-forensics/artifact-readiness";
import { exportCanonicalArtifactHtmlPdf } from "@/report/pdf-export";
import { PublicSourceAuthorityUnavailableError, runPublicSourceForensicsPipeline, type ArtifactReadinessGate, type PublicSourceForensicsDependencies, type PublicSourcePipelineCheckpoint } from "./public-source-forensics";
import { discoverSite, fetchEvidencePage, type DiscoveredSite } from "./crawler-runtime";
import { executePublicSourceRetrieval } from "./public-source-retriever";
import { JobExecutionLease, configuredJobHardDeadlineMs } from "./job-execution";
import { resolvePublicSourceSnapshot, type InjectedPublicSourceRetrieval, type PublicSourceRetriever } from "./public-source-snapshot-resolver";
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
  discoverySnapshot?: DiscoverySnapshot;
  pageAnalysisContentHashes?: Record<string, string>;
  aiEnabled?: boolean;
  aiSkipReason?: string;
  technicalCompleted?: boolean;
}

export async function processScanJob(job: ScanJobRow, workerId: string): Promise<void> {
  const execution = new JobExecutionLease({
    hardDeadlineMs: configuredJobHardDeadlineMs(),
    heartbeat: () => heartbeatScanJob(job.id, workerId)
  });
  execution.start();
  const checkpointJob = async (input: CheckpointScanJobInput) => {
    execution.throwIfAborted();
    const updated = await checkpointScanJob(job.id, workerId, input);
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
    await purgeExpiredCrawlContent();
    let storedReport = await getGeoReport(job.reportId);
    if (!storedReport) throw new Error("The source technical report no longer exists.");
    if (fulfillmentTarget !== "legacy" && job.productContract === "recommendation_forensics_v1" && checkpoint.contractVersion === 2 &&
        checkpoint.websiteFoundation?.completed) {
      const existingFoundation = await getAiReport(job.reportId, "deep", job.productContract);
      const canonicalTarget = resolveRecommendationFoundationTarget(checkpoint, existingFoundation, storedReport.url);
      if (isMatchingRecommendationWebsiteFoundation(job, canonicalTarget, existingFoundation)) {
        await finalizeRecommendationJob({
          job, workerId, checkpoint, websiteFoundation: existingFoundation.payload,
          targetUrl: canonicalTarget,
          coverage: { plannedPages: job.plannedPages, successfulPages: job.successfulPages, failedPages: job.failedPages },
          fulfillmentTarget
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
      await saveCheckpoint("fetching", 35, checkpoint);
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
      await saveCheckpoint("synthesizing", 90, checkpoint, {
        plannedPages: effectiveCoverage.effectivePlannedPages,
        successfulPages: effectiveCoverage.analyzedPages,
        failedPages: failureCount(checkpoint)
      });
      await finalizeRecommendationJob({
        job, workerId, checkpoint, websiteFoundation: reportToPersist, targetUrl: discovery.targetUrl,
        fulfillmentTarget, coverage: {
          plannedPages: effectiveCoverage.effectivePlannedPages,
          successfulPages: effectiveCoverage.analyzedPages,
          failedPages: failureCount(checkpoint)
        },
        signal: execution.controller.signal
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
    const failedJob = await failScanJob(job.id, workerId, {
      code: error instanceof Error ? error.name : "scan_failed",
      publicMessage: publicFailure(error),
      retryable: isRetryable(error)
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
    if (job.tier === "deep" && failedJob.stage === "failed") {
      await recordCommercialOutcomeSafely(job.id, "failed");
    }
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

async function finalizeRecommendationJob(input: {
  job: ScanJobRow;
  workerId: string;
  checkpoint: WorkerCheckpoint;
  websiteFoundation: AiWebsiteReportV1;
  targetUrl: string;
  coverage: { plannedPages: number; successfulPages: number; failedPages: number };
  fulfillmentTarget: "recommendation_v1" | "recommendation_v2";
  signal?: AbortSignal;
}): Promise<void> {
  if (input.fulfillmentTarget === "recommendation_v2") {
    let checkpoint = input.checkpoint;
    const dependencies = await createProductionPublicSourceForensicsDependencies(process.env, {
      createDependencies: async (runtime) => createWorkerPublicSourceForensicsDependencies({
        job: input.job,
        workerId: input.workerId,
        coverage: input.coverage,
        readCheckpoint: () => checkpoint,
        onCheckpointSaved: async (next) => { checkpoint = next; },
        retrieveSource: createWorkerPublicSourceRetriever(),
        // This verifies the canonical V2 HTML and a real Chromium PDF before the
        // atomic terminalization boundary; it never persists a report itself.
        artifactReadiness: createWorkerPublicSourceArtifactReadinessGate(),
        signal: input.signal
      }, runtime)
    });
    if (!dependencies) throw new PublicSourceAuthorityUnavailableError("Public-source forensics authority is not installed.");
    const result = await runPublicSourceForensicsPipeline({ reportId: input.job.reportId, jobId: input.job.id,
      locale: input.websiteFoundation.provenance.locale, region: process.env.OGC_PUBLIC_SEARCH_REGION?.trim() || "CN",
      targetUrl: input.targetUrl, websiteFoundation: input.websiteFoundation, dependencies, signal: input.signal });
    checkpoint = { ...checkpoint, recommendationForensics: { questionsGenerated: true, reportSaved: true }, publicSourceForensics: result.checkpoint };
    await saveStageCheckpoint(input.job, input.workerId, "synthesizing", 99, checkpoint);
    await terminalizePaidPublicSourceReport({ report: result.report, workerId: input.workerId, checkpointIdentityHash: result.checkpoint.identityHash,
      coverage: input.coverage, snapshotRefs: result.commercialSnapshotRefs });
    return;
  }
  throw new HistoricalRecommendationRuntimeRetiredError();
}

export interface WorkerPublicSourceForensicsCollaborators {
  resolveSnapshot: typeof resolvePublicSourceSnapshot;
  checkpointJob: typeof checkpointScanJob;
  getReport: typeof getSourceForensicReportForJob;
  saveReport: typeof saveSourceForensicReport;
}

export interface WorkerPublicSourceForensicsDependencyInput {
  job: Pick<ScanJobRow, "id" | "reportId">;
  workerId: string;
  coverage: { plannedPages: number; successfulPages: number; failedPages: number };
  readCheckpoint: () => WorkerCheckpoint;
  onCheckpointSaved: (checkpoint: WorkerCheckpoint) => Promise<void>;
  retrieveSource?: PublicSourceRetriever;
  artifactReadiness?: ArtifactReadinessGate;
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
    checkpointJob: checkpointScanJob,
    getReport: getSourceForensicReportForJob,
    saveReport: saveSourceForensicReport
  };
  const requireJob = (jobId: string) => {
    if (jobId !== input.job.id) throw new PublicSourceAuthorityUnavailableError("Public-source collaborator job identity mismatch.");
  };
  return {
    authority: runtime.authority,
    resolveSnapshot: async ({ questionId, fanout, evidenceCutoffAt }) => collaborators.resolveSnapshot({
      authority: runtime.authority,
      adapter: runtime.adapter,
      question: questionFromFanout(questionId, fanout),
      fanout,
      evidenceCutoffAt,
      leaseOwner: `public-source:${input.job.id}:${input.workerId}`,
      retrieveSource: input.retrieveSource,
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
      await collaborators.checkpointJob(input.job.id, input.workerId, {
        stage: "synthesizing",
        progress: 95,
        checkpoint: next as JobCheckpoint,
        ...input.coverage
      });
      await input.onCheckpointSaved(next);
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
  const canonical = fanout.queries.find((query) => query.derivationRuleId === "query-canonical-v1");
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
    }, { signal });
    return {
      fact,
      source: {
        retrievalState: fact.retrievalState === "available" ? "available" : "inaccessible",
        ...(fact.retrievalState === "available" ? {
          excerpt: fact.verifiedExcerpt ?? null,
          excerptHash: fact.normalizedContentHash ?? null,
          contentHash: fact.normalizedContentHash ?? null
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

async function saveStageCheckpoint(
  job: ScanJobRow,
  workerId: string,
  stage: "discovering" | "planning" | "fetching" | "analyzing" | "synthesizing",
  progress: number,
  checkpoint: WorkerCheckpoint,
  coverage: { plannedPages?: number; successfulPages?: number; failedPages?: number } = {}
) {
  await checkpointScanJob(job.id, workerId, {
    stage,
    progress,
    checkpoint: checkpoint as JobCheckpoint,
    ...coverage
  });
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

function isRetryable(error: unknown): boolean {
  if (error instanceof HistoricalRecommendationRuntimeRetiredError ||
      error instanceof RecommendationForensicReportValidationError) return false;
  const message = publicFailure(error).toLowerCase();
  return !message.includes("robots.txt") &&
    !message.includes("not configured") &&
    !message.includes("no public representative") &&
    !message.includes("no planned page returned readable evidence") &&
    !message.includes("source technical report no longer exists");
}

export class HistoricalRecommendationRuntimeRetiredError extends Error {
  constructor() { super("Historical V1 recommendation fulfillment was retired after the zero-nonterminal audit."); }
}

function publicFailure(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "The AI report task failed.";
}

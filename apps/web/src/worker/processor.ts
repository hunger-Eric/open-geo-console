import {
  AI_REPORT_PROMPT_VERSION,
  ReportValidationError,
  analyzePageBatch,
  createOpenAiCompatibleClient,
  planPages,
  synthesizeWebsiteReport,
  type AiWebsiteReportV1,
  type ExtractedPage,
  type PlannedPage
} from "@open-geo-console/ai-report-engine";
import { checkpointScanJob, failScanJob, finishScanJob, isBillableCoverage } from "@/db/jobs";
import { getGeoReport } from "@/db/reports";
import { saveAiReport } from "@/db/ai-reports";
import {
  getCrawlEvidence,
  getReusableCrawlEvidence,
  purgeExpiredCrawlContent,
  saveCrawlEvidence
} from "@/db/crawl-evidence";
import { refundCredit, settleCredit } from "@/db/credits";
import type { ScanJobRow } from "@/db/schema";
import { discoverSite, fetchEvidencePage } from "./crawler-runtime";

interface StoredPageEvidence {
  page: ExtractedPage;
  canonicalUrl?: string;
  httpStatus: number;
  contentHash: string;
}

export async function processScanJob(job: ScanJobRow, workerId: string): Promise<void> {
  const heartbeat = setInterval(() => {
    void import("@/db/jobs")
      .then(({ heartbeatScanJob }) => heartbeatScanJob(job.id, workerId))
      .catch(() => undefined);
  }, 30_000);
  try {
    await purgeExpiredCrawlContent();
    const storedReport = await getGeoReport(job.reportId);
    if (!storedReport) throw new Error("The source technical report no longer exists.");
    const client = createConfiguredClient();

    await checkpointScanJob(job.id, workerId, { stage: "discovering", progress: 10 });
    const discovered = await discoverSite(storedReport.url);

    await checkpointScanJob(job.id, workerId, {
      stage: "planning",
      progress: 25,
      checkpoint: {
        discoveredUrls: discovered.deterministicCandidates.map((candidate) => candidate.url),
        candidateUrls: discovered.candidates.map((candidate) => candidate.url)
      }
    });
    const pagePlan = await planPages(client, {
      tier: job.tier,
      locale: job.locale,
      targetUrl: discovered.targetUrl,
      candidates: discovered.candidates
    });
    if (pagePlan.selected.length === 0) throw new Error("No public representative pages could be planned.");

    await checkpointScanJob(job.id, workerId, {
      stage: "fetching",
      progress: 35,
      plannedPages: pagePlan.selected.length,
      checkpoint: {
        plannedUrls: pagePlan.selected.map((page) => page.url),
        pagePlan: pagePlan.selected
      }
    });

    const fetched: StoredPageEvidence[] = [];
    const failures: Array<{ url: string; error: string }> = [];
    for (const planned of pagePlan.selected) {
      try {
        const evidence = await loadOrFetchEvidence(job, planned, discovered.robotsPolicy);
        fetched.push(evidence);
      } catch (error) {
        failures.push({ url: planned.url, error: publicFailure(error) });
        await saveCrawlEvidence({
          reportId: job.reportId,
          jobId: job.id,
          url: planned.url,
          pageType: planned.pageType,
          fetchStatus: "failed"
        });
      }
    }
    if (fetched.length === 0) throw new Error("No planned page returned readable evidence.");

    await checkpointScanJob(job.id, workerId, {
      stage: "analyzing",
      progress: 65,
      successfulPages: fetched.length,
      failedPages: failures.length,
      checkpoint: {
        completedUrls: fetched.map((item) => item.page.url),
        failedUrls: failures
      }
    });
    const analyzed = await analyzePageBatch(client, {
      pages: fetched.map((item) => item.page),
      locale: job.locale,
      batchSize: 4,
      maxCharactersPerPage: 30_000
    });

    await checkpointScanJob(job.id, workerId, {
      stage: "synthesizing",
      progress: 85,
      checkpoint: { pageAnalyses: analyzed.analyses }
    });
    const coverage = {
      discoveredPages: discovered.deterministicCandidates.length,
      plannedPages: pagePlan.selected.length,
      analyzedPages: analyzed.analyses.length,
      failedPages: failures.length,
      samplingMethod: job.tier === "free"
        ? "Site-wide discovery followed by an AI-planned sample of up to 8 representative pages."
        : "Site-wide discovery followed by page-type clustering and an AI-planned sample of up to 50 representative pages.",
      pageTypesCovered: [...new Set(fetched.map((item) => item.page.pageType))],
      limitations: failures.length > 0 ? [`${failures.length} planned page(s) could not be analyzed.`] : []
    };
    const synthesis = await synthesizeWebsiteReport(client, {
      targetUrl: discovered.targetUrl,
      tier: job.tier,
      locale: job.locale,
      pages: fetched.map((item) => item.page),
      pageAnalyses: analyzed.analyses,
      coverage
    });
    await persistAiReport(job, synthesis.report, fetched);

    const homepageUrl = new URL(discovered.targetUrl).href;
    const billable = isBillableCoverage({
      plannedPages: pagePlan.selected.length,
      successfulPages: fetched.length,
      homepageSucceeded: fetched.some((item) => new URL(item.page.url).pathname === new URL(homepageUrl).pathname),
      evidenceValidated: synthesis.rejectedFindingIds.length === 0 || synthesis.report.findings.length > 0
    });
    const terminalStage = billable ? "completed" : "partial";
    await finishScanJob(job.id, workerId, terminalStage, {
      plannedPages: pagePlan.selected.length,
      successfulPages: fetched.length,
      failedPages: failures.length
    });
    if (job.creditReservationId && billable) await settleCredit(job.creditReservationId);
  } catch (error) {
    if (error instanceof ReportValidationError) {
      console.error("AI report validation issues:", error.issues);
    }
    const retryable = isRetryable(error);
    const failed = await failScanJob(job.id, workerId, {
      code: error instanceof Error ? error.name : "scan_failed",
      publicMessage: publicFailure(error),
      retryable
    });
    if (failed.stage === "failed" && job.creditReservationId) {
      await refundCredit(job.creditReservationId);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function loadOrFetchEvidence(
  job: ScanJobRow,
  planned: PlannedPage,
  robotsPolicy: Parameters<typeof fetchEvidencePage>[1]
): Promise<StoredPageEvidence> {
  const current = await getCrawlEvidence(job.id, planned.url);
  const reusable = current?.normalizedContent ? current : await getReusableCrawlEvidence(job.reportId, planned.url);
  if (reusable?.normalizedContent) {
    const page: ExtractedPage = {
      url: planned.url,
      pageType: planned.pageType,
      text: reusable.normalizedContent,
      metadata: { reusedEvidence: "true" }
    };
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
    return {
      page,
      canonicalUrl: reusable.canonicalUrl ?? undefined,
      httpStatus: reusable.httpStatus ?? 200,
      contentHash: reusable.contentHash ?? ""
    };
  }

  const fetched = await fetchEvidencePage(planned, robotsPolicy);
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

async function persistAiReport(job: ScanJobRow, report: AiWebsiteReportV1, pages: StoredPageEvidence[]) {
  await saveAiReport({
    reportId: job.reportId,
    jobId: job.id,
    tier: job.tier,
    locale: job.locale,
    payload: report,
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

function configuredAiTimeoutMs(): number {
  const configured = Number(process.env.OGC_AI_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 180_000;
}

function isRetryable(error: unknown): boolean {
  const message = publicFailure(error).toLowerCase();
  return !message.includes("robots.txt") && !message.includes("not configured") && !message.includes("no public representative");
}

function publicFailure(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "The AI report task failed.";
}

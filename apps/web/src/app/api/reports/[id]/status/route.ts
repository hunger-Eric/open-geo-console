import { NextResponse } from "next/server";
import { getAiReport } from "@/db/ai-reports";
import { getActiveCombinedGeoReport } from "@/db/combined-reports";
import { getJobCreditStatus, getLatestScanJob, getScanJobQueueStatus } from "@/db/jobs";
import { getGeoReport } from "@/db/reports";
import { publicStateForStage } from "@/report/job-status";
import { resolveRequestArtifactScope } from "@/server/report-access";

type RouteContext = { params: Promise<{ id: string }> };
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [report, artifactScope] = await Promise.all([
    getGeoReport(id),
    resolveRequestArtifactScope(request, id)
  ]);
  if (!report) {
    return NextResponse.json(
      { error: "report_not_found" },
      { status: 404, headers: PRIVATE_NO_STORE }
    );
  }

  const hasDeepAccess = artifactScope !== null;
  const readsV4Artifact = artifactScope === "combined_geo_report_v4";

  const [freeJob, freeAiReport, deepJob, deepAiReport, activeV4Report] = await Promise.all([
    getLatestScanJob(id, "free"),
    readsV4Artifact ? Promise.resolve(null) : getAiReport(id, "free"),
    hasDeepAccess ? getLatestScanJob(id, "deep") : Promise.resolve(null),
    hasDeepAccess && !readsV4Artifact ? getAiReport(id, "deep") : Promise.resolve(null),
    readsV4Artifact ? getActiveCombinedGeoReport(id, "combined_geo_report_v4") : Promise.resolve(null)
  ]);
  const job = deepJob ?? freeJob;
  const aiReport = deepAiReport ?? freeAiReport;
  const queue = job ? await getScanJobQueueStatus(job.id) : null;
  const creditStatus = job ? await getJobCreditStatus(job.id) : null;
  const reportLocale = report.reportLocale;
  const aiReportLocale = activeV4Report
    ? compactReportLocale(activeV4Report.report.locale)
    : aiReport?.locale === "zh" ? "zh" : aiReport?.locale === "en" ? "en" : null;
  const localeCorrectionAvailable = Boolean(
    hasDeepAccess
      && reportLocale
      && deepAiReport
      && aiReportLocale
      && aiReportLocale !== reportLocale
      && !report.localeCorrectionUsedAt
  );

  return NextResponse.json(
    {
      job: job ? {
        tier: job.tier === "deep" ? "deep" : "preview",
        stage: job.stage,
        state: publicStateForStage(job.stage),
        executionState: job.executionState,
        progress: job.progress,
        plannedPages: job.plannedPages,
        successfulPages: job.successfulPages,
        failedPages: job.failedPages,
        refundState: creditStatus,
        queuePosition: job.executionState === "queued" ? queue?.queuePosition ?? null : null,
        waitReason: job.executionState === "queued" ? queue?.waitReason ?? null : null,
        activeTier: job.executionState === "queued" ? queue?.activeTier ?? null : null
      } : null,
      hasAiReport: Boolean(activeV4Report ?? aiReport),
      hasTechnicalReport: Boolean(report.payload),
      technicalStatus: report.technicalStatus,
      technicalErrorCode: report.technicalErrorCode,
      technicalPublicError: report.technicalPublicError,
      hasDeepAccess,
      reportLocale,
      aiReportLocale,
      localeCorrectionAvailable,
      localeCorrectionInProgress: Boolean(
        deepJob?.reason === "locale_correction" && publicStateForStage(deepJob.stage) === "generating"
      )
    },
    { headers: PRIVATE_NO_STORE }
  );
}

function compactReportLocale(locale: string): "en" | "zh" | null {
  const compact = locale.toLowerCase().split(/[-_]/u, 1)[0];
  return compact === "en" || compact === "zh" ? compact : null;
}

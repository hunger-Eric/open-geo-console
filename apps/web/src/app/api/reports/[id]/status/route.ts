import { NextResponse } from "next/server";
import { getAiReport } from "@/db/ai-reports";
import { getLatestScanJob, getScanJobQueueStatus } from "@/db/jobs";
import { getGeoReport } from "@/db/reports";
import { requestHasReportAccess } from "@/server/report-access";

type RouteContext = { params: Promise<{ id: string }> };
const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const [report, hasDeepAccess] = await Promise.all([
    getGeoReport(id),
    requestHasReportAccess(request, id)
  ]);
  if (!report) {
    return NextResponse.json(
      { error: "report_not_found" },
      { status: 404, headers: PRIVATE_NO_STORE }
    );
  }

  const [freeJob, freeAiReport, deepJob, deepAiReport] = await Promise.all([
    getLatestScanJob(id, "free"),
    getAiReport(id, "free"),
    hasDeepAccess ? getLatestScanJob(id, "deep") : Promise.resolve(null),
    hasDeepAccess ? getAiReport(id, "deep") : Promise.resolve(null)
  ]);
  const job = deepJob ?? freeJob;
  const aiReport = deepAiReport ?? freeAiReport;
  const queue = job ? await getScanJobQueueStatus(job.id) : null;

  return NextResponse.json(
    {
      job: job ? {
        id: job.id,
        tier: job.tier === "deep" ? "deep" : "preview",
        stage: job.stage,
        status: statusForStage(job.stage),
        progress: job.progress,
        errorCode: job.errorCode,
        publicError: job.publicError,
        plannedPages: job.plannedPages,
        successfulPages: job.successfulPages,
        failedPages: job.failedPages,
        queuePosition: queue?.queuePosition ?? null,
        waitReason: queue?.waitReason ?? null,
        activeTier: queue?.activeTier ?? null
      } : null,
      hasAiReport: Boolean(aiReport),
      hasDeepAccess
    },
    { headers: PRIVATE_NO_STORE }
  );
}

function statusForStage(stage: string): "queued" | "running" | "completed" | "partial" | "failed" {
  if (stage === "queued") return "queued";
  if (stage === "completed" || stage === "partial" || stage === "failed") return stage;
  return "running";
}

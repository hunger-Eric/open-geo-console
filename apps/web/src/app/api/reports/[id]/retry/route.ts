import { NextResponse } from "next/server";
import { getLatestScanJob, retryScanJob } from "@/db/jobs";
import { getGeoReport } from "@/db/reports";
import { requestHasReportAccess } from "@/server/report-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await getGeoReport(id))) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const hasDeepAccess = await requestHasReportAccess(request, id);
  const job = hasDeepAccess
    ? (await getLatestScanJob(id, "deep")) ?? await getLatestScanJob(id, "free")
    : await getLatestScanJob(id, "free");
  if (!job || (job.stage !== "failed" && job.stage !== "partial")) {
    return NextResponse.json({ error: "This report does not have a retryable job." }, { status: 409 });
  }
  try {
    const retried = await retryScanJob(job.id);
    return NextResponse.json({ jobId: retried.id, status: retried.stage });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to retry the report." },
      { status: 409 }
    );
  }
}

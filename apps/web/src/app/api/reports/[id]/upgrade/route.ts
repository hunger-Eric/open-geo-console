import { NextResponse } from "next/server";
import { getAiReport } from "@/db/ai-reports";
import { attachReservationToJob, reserveCredit, refundCredit } from "@/db/credits";
import { enqueueScanJob, getLatestScanJob } from "@/db/jobs";
import { issueReportAccessToken } from "@/db/report-tokens";
import { getGeoReport } from "@/db/reports";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await getGeoReport(id))) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const body = (await request.json()) as { accessKey?: unknown };
  const accessKey = typeof body.accessKey === "string" ? body.accessKey.trim() : "";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!accessKey || !idempotencyKey) {
    return NextResponse.json({ error: "An access key and Idempotency-Key are required." }, { status: 400 });
  }

  const existingReport = await getAiReport(id, "deep");
  const locale = (await getLatestScanJob(id))?.locale === "zh" ? "zh" : "en";
  if (existingReport) {
    const access = await issueReportAccessToken({ reportId: id });
    return NextResponse.json({ accessUrl: accessUrl(request, id, access.rawToken), jobId: existingReport.jobId });
  }

  try {
    const reservation = await reserveCredit({ rawKey: accessKey, reportId: id, idempotencyKey });
    let jobId = reservation.job_id;
    if (!jobId) {
      try {
        const job = await enqueueScanJob({
          reportId: id,
          tier: "deep",
          locale,
          creditReservationId: reservation.id
        });
        jobId = job.id;
        await attachReservationToJob(reservation.id, job.id);
      } catch (error) {
        await refundCredit(reservation.id);
        throw error;
      }
    }
    const access = await issueReportAccessToken({ reportId: id });
    return NextResponse.json({
      jobId,
      accessUrl: accessUrl(request, id, access.rawToken)
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reserve a report credit." },
      { status: 400 }
    );
  }
}

function accessUrl(request: Request, reportId: string, token: string) {
  return new URL(`/api/reports/${reportId}/access?token=${encodeURIComponent(token)}`, request.url).href;
}

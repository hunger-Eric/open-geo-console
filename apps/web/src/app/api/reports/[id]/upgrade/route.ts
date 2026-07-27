import { NextResponse } from "next/server";
import { getAiReport } from "@/db/ai-reports";
import { attachReservationToJob, reserveCredit, refundCredit, validateAccessKey } from "@/db/credits";
import { enqueueScanJob } from "@/db/jobs";
import { issueReportAccessToken } from "@/db/report-tokens";
import { getGeoReport, persistLegacyReportLocale } from "@/db/reports";
import { parseReportLocale } from "@/server/report-locale";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as { accessKey?: unknown; locale?: unknown };
  const accessKey = typeof body.accessKey === "string" ? body.accessKey.trim() : "";
  const requestedLocale = parseReportLocale(body.locale);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!accessKey || !requestedLocale || !idempotencyKey) {
    return NextResponse.json({ error: "An access key, an en or zh locale, and Idempotency-Key are required." }, { status: 400 });
  }
  const report = await getGeoReport(id);
  if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  if (report.reportLocale && report.reportLocale !== requestedLocale) {
    return localeMismatchResponse();
  }

  const existingReport = await getAiReport(id, "deep");
  if (existingReport) {
    try {
      await validateAccessKey(accessKey);
      const persistedLocale = report.reportLocale ?? await persistLegacyReportLocale(id, requestedLocale);
      if (persistedLocale !== requestedLocale) return localeMismatchResponse();
      const access = await issueReportAccessToken({ reportId: id });
      return NextResponse.json({ accessUrl: accessUrl(request, id, access.rawToken), jobId: existingReport.jobId });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to validate the report access key." },
        { status: 400 }
      );
    }
  }

  try {
    const reservation = await reserveCredit({ rawKey: accessKey, reportId: id, idempotencyKey });
    const persistedLocale = report.reportLocale ?? await persistLegacyReportLocale(id, requestedLocale);
    if (persistedLocale !== requestedLocale) {
      if (!reservation.job_id && reservation.status === "reserved") await refundCredit(reservation.id);
      return localeMismatchResponse();
    }
    let jobId = reservation.job_id;
    if (!jobId) {
      try {
        const job = await enqueueScanJob({
          reportId: id,
          tier: "deep",
          locale: persistedLocale,
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

function localeMismatchResponse() {
  return NextResponse.json(
    { error: "The requested locale must match the report's persisted language." },
    { status: 409 }
  );
}

function accessUrl(request: Request, reportId: string, token: string) {
  return new URL(`/api/reports/${reportId}/access?token=${encodeURIComponent(token)}`, request.url).href;
}

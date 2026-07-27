import { analyzeLogs, buildBotEvidenceSummary } from "@open-geo-console/log-parser";
import { NextResponse } from "next/server";
import { deleteBotEvidence, saveBotEvidence } from "@/db/bot-evidence";
import { getGeoReport } from "@/db/reports";

export const runtime = "nodejs";
export const MAX_LOG_BYTES = 5 * 1024 * 1024;

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    if (!(await getGeoReport(id))) {
      return apiError("report_not_found", 404);
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_LOG_BYTES) {
      return apiError("payload_too_large", 413);
    }

    const body = (await request.json()) as { logs?: unknown };
    if (typeof body.logs !== "string" || body.logs.trim() === "") {
      return apiError("empty_logs", 400);
    }
    if (Buffer.byteLength(body.logs, "utf8") > MAX_LOG_BYTES) {
      return apiError("payload_too_large", 413);
    }

    const analysis = analyzeLogs(body.logs);
    const summary = buildBotEvidenceSummary(analysis);
    await saveBotEvidence(id, summary);

    return NextResponse.json({ analysis, summary });
  } catch {
    return apiError("analysis_failed", 400);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await getGeoReport(id))) {
    return apiError("report_not_found", 404);
  }
  await deleteBotEvidence(id);
  return new Response(null, { status: 204 });
}

function apiError(
  errorCode: "report_not_found" | "empty_logs" | "payload_too_large" | "analysis_failed",
  status: number
) {
  return NextResponse.json({ errorCode }, { status });
}

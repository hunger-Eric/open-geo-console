import { NextResponse } from "next/server";
import { createLocaleCorrectionJob, LocaleCorrectionError } from "@/db/reports";
import { requestHasReportAccess } from "@/server/report-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!(await requestHasReportAccess(request, id))) {
    return NextResponse.json({ error: "Report access is required." }, { status: 403 });
  }

  try {
    const correction = await createLocaleCorrectionJob(id);
    return NextResponse.json(correction, { status: 202 });
  } catch (error) {
    if (error instanceof LocaleCorrectionError) {
      const status = error.code === "report_not_found" ? 404 : 409;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to schedule the report language correction." },
      { status: 500 }
    );
  }
}

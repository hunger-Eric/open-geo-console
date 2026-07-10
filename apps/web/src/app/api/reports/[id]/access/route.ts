import { NextResponse } from "next/server";
import { getLatestScanJob } from "@/db/jobs";
import { verifyReportAccessToken } from "@/db/report-tokens";
import { reportAccessCookieName } from "@/server/report-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = token ? await verifyReportAccessToken(token) : null;
  if (!verified || verified.reportId !== id) {
    return NextResponse.json({ error: "The report access link is invalid or expired." }, { status: 403 });
  }
  const locale = (await getLatestScanJob(id, "deep"))?.locale === "zh" ? "zh" : "en";
  const destination = new URL(`/${locale}/reports/${id}/analysis`, request.url);
  const response = NextResponse.redirect(destination);
  response.cookies.set(reportAccessCookieName(id), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/`,
    expires: verified.expiresAt
  });
  return response;
}

import { NextResponse } from "next/server";
import { inspectReportAccessToken, redeemReportAccessToken } from "@/db/report-tokens";
import { getGeoReport } from "@/db/reports";
import { reportAccessCookieName } from "@/server/report-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const verified = token ? await inspectReportAccessToken(token) : null;
  if (!verified || verified.reportId !== id) {
    return NextResponse.json({ error: "The report access link is invalid or expired." }, { status: 403 });
  }
  const report = await getGeoReport(id);
  if (!report?.reportLocale) {
    return NextResponse.json({ error: "The report language has not been established." }, { status: 409 });
  }
  const zh = report.reportLocale === "zh";
  const action = new URL(`/api/reports/${encodeURIComponent(id)}/access`, request.url).href;
  const response = new NextResponse(`<!doctype html><html lang="${report.reportLocale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${zh ? "打开报告" : "Open report"}</title></head><body style="font-family:system-ui;background:#f5f5f0;color:#17202a;padding:32px"><main style="max-width:560px;margin:12vh auto;background:white;padding:32px;border-radius:14px"><p style="color:#64748b;font-size:12px">OPEN GEO CONSOLE</p><h1>${zh ? "确认打开诊断报告" : "Confirm report access"}</h1><p>${zh ? "点击下方按钮后，此链接将被兑换，本设备将获得报告访问权限。" : "After you continue, this one-time link will be redeemed and this device will receive report access."}</p><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit" style="border:0;background:#111827;color:white;padding:12px 18px;border-radius:8px;cursor:pointer">${zh ? "安全打开报告" : "Open report securely"}</button></form></main></body></html>`, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
  harden(response);
  return response;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const token = await readToken(request);
  const verified = token ? await redeemReportAccessToken(token) : null;
  if (!verified || verified.reportId !== id) {
    return NextResponse.json({ error: "The report access link is invalid, expired, or already used." }, { status: 403 });
  }
  const report = await getGeoReport(id);
  if (!report?.reportLocale) {
    return NextResponse.json({ error: "The report language has not been established." }, { status: 409 });
  }
  const destination = verified.artifactScope === "recommendation_forensics_v1" || verified.artifactScope === "combined_geo_report_v1"
    ? new URL(`/reports/${id}/report.html`, request.url)
    : new URL(`/${report.reportLocale}/reports/${id}/analysis`, request.url);
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(reportAccessCookieName(id, verified.artifactScope), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/`,
    expires: verified.expiresAt
  });
  harden(response);
  return response;
}

async function readToken(request: Request): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json() as { token?: unknown };
    return typeof body.token === "string" ? body.token : "";
  }
  const form = await request.formData();
  const value = form.get("token");
  return typeof value === "string" ? value : "";
}

function harden(response: NextResponse) {
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!);
}

import { verifyReportAccessToken } from "@/db/report-tokens";
import type { ReportArtifactScope } from "@/db/schema";

export function reportAccessCookieName(
  reportId: string,
  artifactScope: ReportArtifactScope = "legacy_website_audit_v1"
): string {
  const suffix = artifactScope === "recommendation_forensics_v1" ? "_recommendation"
    : artifactScope === "combined_geo_report_v1" ? "_combined"
    : artifactScope === "combined_geo_report_v2" ? "_combined_v2"
    : artifactScope === "combined_geo_report_v3" ? "_combined_v3"
    : artifactScope === "combined_geo_report_v4" ? "_combined_v4" : "";
  return `ogc_report_${reportId.replace(/[^a-zA-Z0-9_-]/g, "")}${suffix}`;
}

export async function requestHasReportAccess(
  request: Request,
  reportId: string,
  artifactScope: ReportArtifactScope = "legacy_website_audit_v1"
): Promise<boolean> {
  const rawToken = readCookie(request.headers.get("cookie") ?? "", reportAccessCookieName(reportId, artifactScope));
  if (!rawToken) return false;
  const verified = await verifyReportAccessToken(rawToken);
  return verified?.reportId === reportId && verified.artifactScope === artifactScope;
}

export async function tokenGrantsReportAccess(
  rawToken: string | undefined,
  reportId: string,
  artifactScope: ReportArtifactScope = "legacy_website_audit_v1"
): Promise<boolean> {
  if (!rawToken) return false;
  const verified = await verifyReportAccessToken(rawToken);
  return verified?.reportId === reportId && verified.artifactScope === artifactScope;
}

export async function resolveRequestArtifactScope(request: Request, reportId: string): Promise<ReportArtifactScope | null> {
  if (await requestHasReportAccess(request, reportId, "combined_geo_report_v4")) {
    return "combined_geo_report_v4";
  }
  if (await requestHasReportAccess(request, reportId, "combined_geo_report_v3")) {
    return "combined_geo_report_v3";
  }
  if (await requestHasReportAccess(request, reportId, "combined_geo_report_v2")) {
    return "combined_geo_report_v2";
  }
  if (await requestHasReportAccess(request, reportId, "combined_geo_report_v1")) {
    return "combined_geo_report_v1";
  }
  if (await requestHasReportAccess(request, reportId, "recommendation_forensics_v1")) {
    return "recommendation_forensics_v1";
  }
  if (await requestHasReportAccess(request, reportId, "legacy_website_audit_v1")) {
    return "legacy_website_audit_v1";
  }
  return null;
}

export function scopedReportAccessCookieHeader(
  request: Request,
  reportId: string,
  artifactScope: ReportArtifactScope
): string | null {
  const name = reportAccessCookieName(reportId, artifactScope);
  const rawToken = readCookie(request.headers.get("cookie") ?? "", name);
  return rawToken ? `${name}=${encodeURIComponent(rawToken)}` : null;
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

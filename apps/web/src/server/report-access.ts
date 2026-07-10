import { verifyReportAccessToken } from "@/db/report-tokens";

export function reportAccessCookieName(reportId: string): string {
  return `ogc_report_${reportId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export async function requestHasReportAccess(request: Request, reportId: string): Promise<boolean> {
  const rawToken = readCookie(request.headers.get("cookie") ?? "", reportAccessCookieName(reportId));
  if (!rawToken) return false;
  const verified = await verifyReportAccessToken(rawToken);
  return verified?.reportId === reportId;
}

export async function tokenGrantsReportAccess(rawToken: string | undefined, reportId: string): Promise<boolean> {
  if (!rawToken) return false;
  const verified = await verifyReportAccessToken(rawToken);
  return verified?.reportId === reportId;
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rawValue.join("="));
  }
  return undefined;
}

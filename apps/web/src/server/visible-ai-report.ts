import "server-only";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { cookies } from "next/headers";
import { getAiReport } from "@/db/ai-reports";
import { buildVisibleReportBundle, type VisibleReportBundle } from "@/report/visibility";
import { reportAccessCookieName, tokenGrantsReportAccess } from "./report-access";

export async function getVisibleReportBundle(
  reportId: string,
  publicTechnicalReport: GeoAuditReport
): Promise<VisibleReportBundle> {
  const freeReportPromise = getAiReport(reportId, "free");
  const cookieStore = await cookies();
  const token = cookieStore.get(reportAccessCookieName(reportId))?.value;
  const hasDeepAccess = await tokenGrantsReportAccess(token, reportId);
  const [freeRow, deepRow] = await Promise.all([
    freeReportPromise,
    hasDeepAccess ? getAiReport(reportId, "deep") : Promise.resolve(null)
  ]);

  return buildVisibleReportBundle({
    publicTechnicalReport,
    freeAiReport: freeRow?.payload ?? null,
    deepAiReport: deepRow?.payload ?? null,
    deepTechnicalReport: deepRow?.technicalPayload ?? null,
    hasDeepAccess
  });
}

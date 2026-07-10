import "server-only";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import { cookies } from "next/headers";
import { getAiReport } from "@/db/ai-reports";
import { reportAccessCookieName, tokenGrantsReportAccess } from "./report-access";

export async function getVisibleAiReport(reportId: string): Promise<AiWebsiteReportV1 | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(reportAccessCookieName(reportId))?.value;
  const hasDeepAccess = await tokenGrantsReportAccess(token, reportId);
  const row = hasDeepAccess
    ? (await getAiReport(reportId, "deep")) ?? await getAiReport(reportId, "free")
    : await getAiReport(reportId, "free");
  return row ? row.payload : null;
}

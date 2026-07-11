import "server-only";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { getAiReport } from "@/db/ai-reports";
import { listEvidenceAssets } from "@/db/evidence-assets";
import { getGeoReport } from "@/db/reports";
import type { ReportEvidenceAssetRow, ReportLocale } from "@/db/schema";

export interface PrivateReportArtifactModel {
  reportId: string;
  locale: ReportLocale;
  technicalReport: GeoAuditReport;
  aiReport: AiWebsiteReportV1;
  evidenceAssets: ReportEvidenceAssetRow[];
}

export async function loadPrivateReportArtifact(reportId: string): Promise<PrivateReportArtifactModel | null> {
  const [report, deep] = await Promise.all([getGeoReport(reportId), getAiReport(reportId, "deep")]);
  if (!report?.reportLocale || !deep?.technicalPayload || !deep.payload || !deep.isPrivate) return null;
  return {
    reportId,
    locale: report.reportLocale,
    technicalReport: deep.technicalPayload,
    aiReport: deep.payload,
    evidenceAssets: await listEvidenceAssets(reportId, deep.jobId)
  };
}

import "server-only";
import type { AiWebsiteReportV1, RecommendationForensicReportV1 } from "@open-geo-console/ai-report-engine";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { getAiReport } from "@/db/ai-reports";
import { listEvidenceAssets } from "@/db/evidence-assets";
import { getGeoReport } from "@/db/reports";
import { getRecommendationForensicReportForReport } from "@/db/recommendation-authority";
import type { ReportArtifactScope, ReportEvidenceAssetRow, ReportLocale } from "@/db/schema";

export interface LegacyPrivateReportArtifactModel {
  productContract: "legacy_website_audit_v1";
  reportId: string;
  locale: ReportLocale;
  technicalReport: GeoAuditReport;
  aiReport: AiWebsiteReportV1;
  evidenceAssets: ReportEvidenceAssetRow[];
}

export interface RecommendationPrivateReportArtifactModel {
  productContract: "recommendation_forensics_v1";
  reportId: string;
  locale: ReportLocale;
  technicalReport: GeoAuditReport;
  recommendationReport: RecommendationForensicReportV1;
  evidenceAssets: ReportEvidenceAssetRow[];
}

export type PrivateReportArtifactModel = LegacyPrivateReportArtifactModel | RecommendationPrivateReportArtifactModel;

export async function loadPrivateReportArtifact(
  reportId: string,
  productContract: ReportArtifactScope = "legacy_website_audit_v1"
): Promise<PrivateReportArtifactModel | null> {
  if (productContract === "recommendation_forensics_v1") {
    const [report, recommendation, foundation] = await Promise.all([
      getGeoReport(reportId),
      getRecommendationForensicReportForReport(reportId),
      getAiReport(reportId, "deep", "recommendation_forensics_v1")
    ]);
    if (!report?.reportLocale || !recommendation || !foundation?.technicalPayload ||
        foundation.jobId !== recommendation.jobId || recommendation.provenanceAndLimitations.locale !== report.reportLocale) {
      return null;
    }
    return {
      productContract,
      reportId,
      locale: report.reportLocale,
      technicalReport: foundation.technicalPayload,
      recommendationReport: recommendation,
      evidenceAssets: await listEvidenceAssets(reportId, recommendation.jobId)
    };
  }
  const [report, deep] = await Promise.all([
    getGeoReport(reportId),
    getAiReport(reportId, "deep", "legacy_website_audit_v1")
  ]);
  if (!report?.reportLocale || !deep?.technicalPayload || !deep.payload || !deep.isPrivate) return null;
  return {
    productContract,
    reportId,
    locale: report.reportLocale,
    technicalReport: deep.technicalPayload,
    aiReport: deep.payload,
    evidenceAssets: await listEvidenceAssets(reportId, deep.jobId)
  };
}

import "server-only";
import type { AiWebsiteReportV1, CombinedGeoReportV1, RecommendationForensicReportV1, RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { getAiReport } from "@/db/ai-reports";
import { listEvidenceAssets } from "@/db/evidence-assets";
import { getGeoReport } from "@/db/reports";
import { getRecommendationForensicReportForReport } from "@/db/recommendation-authority";
import { getSourceForensicReportForReport } from "@/db/source-forensic-reports";
import { getActiveCombinedGeoReport } from "@/db/combined-reports";
import type { ReportArtifactScope, ReportEvidenceAssetRow, ReportLocale } from "@/db/schema";

export interface CombinedPrivateReportArtifactModel {
  productContract: "combined_geo_report_v1";
  reportId: string;
  locale: ReportLocale;
  combinedReport: CombinedGeoReportV1;
  technicalReport: GeoAuditReport;
  evidenceAssets: ReportEvidenceAssetRow[];
  artifactRevisionId: string;
  pdfStorageKey: string;
}

export interface LegacyPrivateReportArtifactModel {
  productContract: "legacy_website_audit_v1";
  reportId: string;
  locale: ReportLocale;
  technicalReport: GeoAuditReport;
  aiReport: AiWebsiteReportV1;
  evidenceAssets: ReportEvidenceAssetRow[];
}

export interface RecommendationPrivateReportArtifactModelV1 {
  productContract: "recommendation_forensics_v1";
  reportVersion: 1;
  fulfillmentMethodology: "answer_engine_recommendation_forensics_v1";
  reportId: string;
  locale: ReportLocale;
  technicalReport: GeoAuditReport;
  recommendationReport: RecommendationForensicReportV1;
  evidenceAssets: ReportEvidenceAssetRow[];
}

export interface RecommendationPrivateReportArtifactModelV2 {
  productContract: "recommendation_forensics_v1";
  reportVersion: 2;
  fulfillmentMethodology: "public_search_source_forensics_v1";
  reportId: string;
  locale: ReportLocale;
  technicalReport: GeoAuditReport;
  recommendationReport: RecommendationForensicReportV2;
  evidenceAssets: ReportEvidenceAssetRow[];
}

export type RecommendationPrivateReportArtifactModel = RecommendationPrivateReportArtifactModelV1 | RecommendationPrivateReportArtifactModelV2;

export type PrivateReportArtifactModel = LegacyPrivateReportArtifactModel | RecommendationPrivateReportArtifactModel | CombinedPrivateReportArtifactModel;

export async function loadPrivateReportArtifact(
  reportId: string,
  productContract: ReportArtifactScope = "legacy_website_audit_v1"
): Promise<PrivateReportArtifactModel | null> {
  if (productContract === "combined_geo_report_v1") {
    const active = await getActiveCombinedGeoReport(reportId);
    if (!active) return null;
    const language = active.report.locale.toLowerCase().split(/[-_]/, 1)[0];
    if (language !== "en" && language !== "zh") return null;
    const evidenceJobIds = [...new Set(active.report.technicalFoundation.evidenceAssets.map((asset) => asset.jobId))];
    const referencedAssetIds = new Set(active.report.technicalFoundation.evidenceAssets.map((asset) => asset.assetId));
    const evidenceAssets = (await Promise.all(evidenceJobIds.map((jobId) => listEvidenceAssets(reportId, jobId))))
      .flat().filter((asset) => referencedAssetIds.has(asset.id));
    return {
      productContract,
      reportId,
      locale: language,
      combinedReport: active.report,
      technicalReport: active.report.technicalFoundation.technicalReport,
      evidenceAssets,
      artifactRevisionId: active.artifactRevisionId,
      pdfStorageKey: active.pdfStorageKey
    };
  }
  if (productContract === "recommendation_forensics_v1") {
    const [report, v1, v2, foundation] = await Promise.all([
      getGeoReport(reportId),
      getRecommendationForensicReportForReport(reportId),
      getSourceForensicReportForReport(reportId),
      getAiReport(reportId, "deep", "recommendation_forensics_v1")
    ]);
    if (!report?.reportLocale || !foundation?.technicalPayload || (v1 ? 1 : 0) + (v2 ? 1 : 0) !== 1) {
      return null;
    }
    if (v2) {
      if (foundation.jobId !== v2.jobId || !localeMatches(v2.locale, report.reportLocale)) return null;
      return { productContract, reportVersion: 2, fulfillmentMethodology: "public_search_source_forensics_v1", reportId,
        locale: report.reportLocale, technicalReport: foundation.technicalPayload, recommendationReport: v2,
        evidenceAssets: await listEvidenceAssets(reportId, v2.jobId) };
    }
    if (foundation.jobId !== v1!.jobId || !localeMatches(v1!.provenanceAndLimitations.locale, report.reportLocale)) return null;
    return { productContract, reportVersion: 1, fulfillmentMethodology: "answer_engine_recommendation_forensics_v1", reportId,
      locale: report.reportLocale, technicalReport: foundation.technicalPayload, recommendationReport: v1!,
      evidenceAssets: await listEvidenceAssets(reportId, v1!.jobId) };
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

function localeMatches(generationLocale: string, routeLocale: ReportLocale): boolean {
  return generationLocale.toLowerCase().split(/[-_]/, 1)[0] === routeLocale;
}

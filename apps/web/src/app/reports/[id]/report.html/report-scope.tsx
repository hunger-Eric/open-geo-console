import { cookies } from "next/headers";
import { ReportArtifact } from "@/components/report-artifact";
import { RecommendationReportArtifact } from "@/components/recommendation-report-artifact";
import { PublicSourceForensicsReportArtifact } from "@/components/public-source-forensics-report-artifact";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { CombinedGeoReportV2Artifact } from "@/components/combined-geo-report-v2-artifact";
import { CombinedGeoReportV3Artifact } from "@/components/combined-geo-report-v3-artifact";
import { CombinedGeoReportV4Artifact } from "@/components/combined-geo-report-v4-artifact";
import { loadPrivateReportArtifact, type PrivateReportArtifactModel } from "@/report/artifact-model";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { reportAccessCookieName, tokenGrantsReportAccess } from "@/server/report-access";

export async function resolvePrivateReportArtifact(id: string): Promise<PrivateReportArtifactModel | null> {
  const cookieStore = await cookies();
  const recommendationToken = cookieStore.get(reportAccessCookieName(id, "recommendation_forensics_v1"))?.value;
  const combinedToken = cookieStore.get(reportAccessCookieName(id, "combined_geo_report_v1"))?.value;
  const combinedV2Token = cookieStore.get(reportAccessCookieName(id, "combined_geo_report_v2"))?.value;
  const combinedV3Token = cookieStore.get(reportAccessCookieName(id, "combined_geo_report_v3"))?.value;
  const combinedV4Token = cookieStore.get(reportAccessCookieName(id, "combined_geo_report_v4"))?.value;
  const legacyToken = cookieStore.get(reportAccessCookieName(id, "legacy_website_audit_v1"))?.value;
  const productContract = await tokenGrantsReportAccess(combinedV4Token, id, "combined_geo_report_v4")
    ? "combined_geo_report_v4"
    : await tokenGrantsReportAccess(combinedV3Token, id, "combined_geo_report_v3")
    ? "combined_geo_report_v3"
    : await tokenGrantsReportAccess(combinedV2Token, id, "combined_geo_report_v2")
    ? "combined_geo_report_v2"
    : await tokenGrantsReportAccess(combinedToken, id, "combined_geo_report_v1")
    ? "combined_geo_report_v1"
    : await tokenGrantsReportAccess(recommendationToken, id, "recommendation_forensics_v1")
    ? "recommendation_forensics_v1"
    : await tokenGrantsReportAccess(legacyToken, id, "legacy_website_audit_v1")
      ? "legacy_website_audit_v1"
      : null;
  if (!productContract) return null;
  return loadPrivateReportArtifact(id, productContract);
}

export function PrivateReportArtifactView({ model }: { model: PrivateReportArtifactModel }) {
  return model.productContract === "combined_geo_report_v4" ? <CombinedGeoReportV4Artifact report={model.combinedReport} /> : model.productContract === "combined_geo_report_v3" ? <CombinedGeoReportV3Artifact model={model} /> : model.productContract === "combined_geo_report_v2" ? <CombinedGeoReportV2Artifact model={model} /> : model.productContract === "combined_geo_report_v1" ? <CombinedGeoReportArtifact model={model} /> : model.productContract === "recommendation_forensics_v1"
    ? model.reportVersion===2?<PublicSourceForensicsReportArtifact model={model}/>:<RecommendationReportArtifact model={model}/>
    : <ReportArtifact model={model} />;
}

export function buildStandaloneReportDocument(artifactMarkup: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${ARTIFACT_CSS}</style></head><body>${artifactMarkup}</body></html>`;
}

export function reportDownloadDisposition(id: string): string {
  return `attachment; filename="geo-report-${id}.html"`;
}

import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { RecommendationReportArtifact } from "@/components/recommendation-report-artifact";
import { PublicSourceForensicsReportArtifact } from "@/components/public-source-forensics-report-artifact";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { loadAuthorizedScopedHtmlArtifact } from "@/report/scoped-html-artifact";
import { reportAccessCookieName } from "@/server/report-access";

export const dynamic = "force-dynamic";

export default async function RecommendationPrivateHtmlReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(reportAccessCookieName(id, "recommendation_forensics_v1"))?.value;
  const model = await loadAuthorizedScopedHtmlArtifact({ token, reportId: id, artifactScope: "recommendation_forensics_v1" });
  if (!model || model.productContract !== "recommendation_forensics_v1") notFound();
  return <><style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS }} />{model.reportVersion===2?<PublicSourceForensicsReportArtifact model={model}/>:<RecommendationReportArtifact model={model}/>}</>;
}

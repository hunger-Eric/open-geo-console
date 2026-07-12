import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ReportArtifact } from "@/components/report-artifact";
import { RecommendationReportArtifact } from "@/components/recommendation-report-artifact";
import { loadPrivateReportArtifact } from "@/report/artifact-model";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { reportAccessCookieName, tokenGrantsReportAccess } from "@/server/report-access";

export const dynamic = "force-dynamic";

export default async function PrivateHtmlReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const recommendationToken = cookieStore.get(reportAccessCookieName(id, "recommendation_forensics_v1"))?.value;
  const legacyToken = cookieStore.get(reportAccessCookieName(id, "legacy_website_audit_v1"))?.value;
  const productContract = await tokenGrantsReportAccess(recommendationToken, id, "recommendation_forensics_v1")
    ? "recommendation_forensics_v1"
    : await tokenGrantsReportAccess(legacyToken, id, "legacy_website_audit_v1")
      ? "legacy_website_audit_v1"
      : null;
  if (!productContract) notFound();
  const model = await loadPrivateReportArtifact(id, productContract);
  if (!model) notFound();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS }} />
      {model.productContract === "recommendation_forensics_v1"
        ? <RecommendationReportArtifact model={model} />
        : <ReportArtifact model={model} />}
    </>
  );
}

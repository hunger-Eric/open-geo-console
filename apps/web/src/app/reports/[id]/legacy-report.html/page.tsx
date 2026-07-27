import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ReportArtifact } from "@/components/report-artifact";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { loadAuthorizedScopedHtmlArtifact } from "@/report/scoped-html-artifact";
import { reportAccessCookieName } from "@/server/report-access";

export const dynamic = "force-dynamic";

export default async function LegacyPrivateHtmlReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(reportAccessCookieName(id, "legacy_website_audit_v1"))?.value;
  const model = await loadAuthorizedScopedHtmlArtifact({ token, reportId: id, artifactScope: "legacy_website_audit_v1" });
  if (!model || model.productContract !== "legacy_website_audit_v1") notFound();
  return <><style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS }} /><ReportArtifact model={model} /></>;
}

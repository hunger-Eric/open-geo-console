import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ReportArtifact } from "@/components/report-artifact";
import { loadPrivateReportArtifact } from "@/report/artifact-model";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { reportAccessCookieName, tokenGrantsReportAccess } from "@/server/report-access";

export const dynamic = "force-dynamic";

export default async function PrivateHtmlReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(reportAccessCookieName(id))?.value;
  if (!await tokenGrantsReportAccess(token, id)) notFound();
  const model = await loadPrivateReportArtifact(id);
  if (!model) notFound();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS }} />
      <ReportArtifact model={model} />
    </>
  );
}

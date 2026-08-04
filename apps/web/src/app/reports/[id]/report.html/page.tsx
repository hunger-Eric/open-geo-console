import { notFound } from "next/navigation";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { PrivateReportArtifactView, resolvePrivateReportArtifact } from "./report-scope";

export const dynamic = "force-dynamic";

export default async function PrivateHtmlReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await resolvePrivateReportArtifact(id);
  if (!model) notFound();
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS }} />
      <PrivateReportArtifactView model={model} />
    </>
  );
}

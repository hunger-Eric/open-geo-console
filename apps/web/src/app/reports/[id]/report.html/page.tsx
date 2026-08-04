import { Download } from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDictionary, INTERFACE_LOCALE_HEADER, normalizeLocale } from "@/i18n";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { PrivateReportArtifactView, resolvePrivateReportArtifact } from "./report-scope";

export const dynamic = "force-dynamic";

export default async function PrivateHtmlReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await resolvePrivateReportArtifact(id);
  if (!model) notFound();
  const dictionary = getDictionary(normalizeLocale((await headers()).get(INTERFACE_LOCALE_HEADER) ?? undefined));
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ARTIFACT_CSS }} />
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 print:hidden">
        <a className="button-secondary" href={`/reports/${id}/report.html/download`}>
          <Download aria-hidden="true" className="size-4" />
          {dictionary.actions.downloadHtml}
        </a>
        <span className="text-xs text-[var(--muted)]">{dictionary.actions.downloadHtmlHint}</span>
      </div>
      <PrivateReportArtifactView model={model} />
    </>
  );
}

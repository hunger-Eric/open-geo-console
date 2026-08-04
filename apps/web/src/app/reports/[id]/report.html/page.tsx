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
      <div className="no-print mx-auto max-w-[1120px] px-8 pt-6">
        <nav className="artifact-actions" aria-label="Report download" style={{ marginBottom: 0 }}>
          <a className="primary" href={`/reports/${id}/report.html/download`}>
            <Download aria-hidden="true" className="mr-1 inline size-4 align-[-2px]" />
            {dictionary.actions.downloadHtml}
          </a>
        </nav>
        <p className="mt-2 text-right text-xs text-[var(--muted)]">{dictionary.actions.downloadHtmlHint}</p>
      </div>
      <PrivateReportArtifactView model={model} />
    </>
  );
}

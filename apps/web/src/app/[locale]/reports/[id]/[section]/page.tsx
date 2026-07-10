import { notFound } from "next/navigation";
import { ReportView, type ReportWorkspaceSection } from "@/components/report-view";
import { StoredReportFallback } from "@/components/stored-report-fallback";
import { getBotEvidence } from "@/db/bot-evidence";
import { getGeoReport } from "@/db/reports";
import { getDictionary, isLocale, type Locale } from "@/i18n";
import { getVisibleReportBundle } from "@/server/visible-ai-report";

const sections = ["analysis", "issues", "bots", "technical", "print"] as const;

export const dynamic = "force-dynamic";

export default async function ReportWorkspaceSectionPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string; locale: string; section: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id, locale: rawLocale, section: rawSection } = await params;
  if (!isLocale(rawLocale) || !sections.includes(rawSection as (typeof sections)[number])) {
    notFound();
  }
  const locale: Locale = rawLocale;
  const section = rawSection as ReportWorkspaceSection;
  const page = parsePage((await searchParams).page);
  const row = await getGeoReport(id);
  const dictionary = getDictionary(locale);

  if (!row) {
    return <StoredReportFallback dictionary={dictionary} locale={locale} page={page} reportId={id} section={section} />;
  }

  const [evidence, visible] = await Promise.all([getBotEvidence(id), getVisibleReportBundle(id, row.payload)]);
  const reportLocale: Locale = row.reportLocale ?? locale;
  return (
    <ReportView
      aiReport={visible.aiReport}
      canPrint={visible.canPrint}
      dictionary={dictionary}
      evidence={evidence?.summary ?? null}
      locale={locale}
      page={page}
      report={visible.technicalReport}
      reportId={id}
      reportLocale={reportLocale}
      reportTier={visible.tier}
      section={section}
    />
  );
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

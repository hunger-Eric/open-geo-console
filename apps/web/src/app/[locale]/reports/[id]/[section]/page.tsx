import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView, type ReportWorkspaceSection } from "@/components/report-view";
import { PendingReportView } from "@/components/pending-report-view";
import { StoredReportFallback } from "@/components/stored-report-fallback";
import { getBotEvidence } from "@/db/bot-evidence";
import { getGeoReport } from "@/db/reports";
import { getDictionary, getLocaleAlternates, isLocale, type Locale } from "@/i18n";
import { getVisibleReportBundle } from "@/server/visible-ai-report";
import { cookies } from "next/headers";
import { reportAccessCookieName, tokenGrantsReportAccess } from "@/server/report-access";

const sections = ["analysis", "issues", "bots", "technical", "print"] as const;

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string; locale: string; section: string }>;
}): Promise<Metadata> {
  const { id, locale, section } = await params;
  return isLocale(locale)
    ? { alternates: getLocaleAlternates(locale, `/reports/${id}/${section}`) }
    : {};
}

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
  const reportLocale: Locale = row.reportLocale ?? locale;
  if (row.activeArtifactRevisionId) {
    const token=(await cookies()).get(reportAccessCookieName(id,"combined_geo_report_v1"))?.value;
    if(!await tokenGrantsReportAccess(token,id,"combined_geo_report_v1")) notFound();
  }
  if (!row.payload) {
    return (
      <PendingReportView
        createdAt={row.createdAt}
        dictionary={dictionary}
        locale={locale}
        reportId={id}
        reportLocale={reportLocale}
        section={section}
        url={row.url}
      />
    );
  }

  const [evidence, visible] = await Promise.all([getBotEvidence(id), getVisibleReportBundle(id, row.payload)]);
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

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { PendingReportView } from "@/components/pending-report-view";
import { StoredReportFallback } from "@/components/stored-report-fallback";
import { getBotEvidence } from "@/db/bot-evidence";
import { getGeoReport } from "@/db/reports";
import { getActiveCombinedGeoReport } from "@/db/combined-reports";
import { getDictionary, getLocaleAlternates, isLocale, type Locale } from "@/i18n";
import { getVisibleReportBundle } from "@/server/visible-ai-report";
import { cookies } from "next/headers";
import { reportAccessCookieName, tokenGrantsReportAccess } from "@/server/report-access";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  return isLocale(locale) ? { alternates: getLocaleAlternates(locale, `/reports/${id}`) } : {};
}

export default async function ReportPage({
  params
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }

  const row = await getGeoReport(id);
  const locale: Locale = rawLocale;
  if (!row) {
    return <StoredReportFallback dictionary={getDictionary(locale)} locale={locale} reportId={id} section="overview" />;
  }
  const reportLocale: Locale = row.reportLocale ?? locale;
  if (row.activeArtifactRevisionId) {
    const active=await getActiveCombinedGeoReport(id);
    if(!active) notFound();
    const scope=active.report.artifactContract;
    const token=(await cookies()).get(reportAccessCookieName(id,scope))?.value;
    if(!await tokenGrantsReportAccess(token,id,scope)) notFound();
  }
  if (!row.payload) {
    return (
      <PendingReportView
        createdAt={row.createdAt}
        dictionary={getDictionary(locale)}
        locale={locale}
        reportId={id}
        reportLocale={reportLocale}
        url={row.url}
      />
    );
  }

  const [evidence, visible] = await Promise.all([getBotEvidence(id), getVisibleReportBundle(id, row.payload)]);
  return (
    <ReportView
      aiReport={visible.aiReport}
      htmlEnabled={visible.canAccessHtmlArtifact}
      dictionary={getDictionary(locale)}
      evidence={evidence?.summary ?? null}
      locale={locale}
      report={visible.technicalReport}
      reportId={id}
      reportLocale={reportLocale}
      reportTier={visible.tier}
    />
  );
}

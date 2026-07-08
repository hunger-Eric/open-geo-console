import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { StoredReportFallback } from "@/components/stored-report-fallback";
import { getGeoReport } from "@/db/reports";
import { getDictionary, isLocale, type Locale } from "@/i18n";

export const dynamic = "force-dynamic";

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
    return <StoredReportFallback dictionary={getDictionary(locale)} locale={locale} reportId={id} />;
  }

  return <ReportView dictionary={getDictionary(locale)} locale={locale} report={row.payload} />;
}

import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
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
  if (!row) {
    notFound();
  }

  const locale: Locale = rawLocale;
  return <ReportView dictionary={getDictionary(locale)} locale={locale} report={row.payload} />;
}

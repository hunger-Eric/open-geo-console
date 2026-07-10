import { notFound } from "next/navigation";
import { LogAnalyzer } from "@/components/log-analyzer";
import { getDictionary, isLocale } from "@/i18n";

export default async function LogsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const dictionary = getDictionary(locale);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
      <LogAnalyzer dictionary={dictionary} locale={locale} />
    </main>
  );
}

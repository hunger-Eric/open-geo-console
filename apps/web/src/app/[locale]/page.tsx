import { FileSearch, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScannerForm } from "@/components/scanner-form";
import { getRecentReports } from "@/db/reports";
import { formatDate, getDictionary, isLocale, localizePath, type Locale } from "@/i18n";
import { scannerCapabilities } from "@/product/config";

export const dynamic = "force-dynamic";

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  const reports = await getRecentReports(6);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-12">
      <section className="workspace-surface p-6 sm:p-9">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-[var(--teal)]">
            <FileSearch aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Open GEO Console</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{dictionary.scanner.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{dictionary.scanner.description}</p>
          </div>
        </div>
        <div className="mt-8">
          <ScannerForm locale={locale} dictionary={dictionary} />
        </div>

        <div className="mt-8 grid border-t border-[var(--border)] md:grid-cols-3 md:divide-x md:divide-[var(--border)]">
          {scannerCapabilities.map((capability) => {
            const Icon = capability.icon;
            const copy = dictionary.capabilities[capability.key];
            return (
              <article key={capability.key} className="border-b border-[var(--border)] py-5 md:border-b-0 md:px-5 md:first:pl-0 md:last:pr-0">
                <Icon aria-hidden="true" className="size-5 text-[var(--teal)]" />
                <h2 className="mt-3 text-sm font-semibold">{copy.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="workspace-surface overflow-hidden">
          <div className="border-b border-[var(--border)] px-6 py-5">
            <h2 className="text-xl font-semibold">{dictionary.scanner.recentReportsTitle}</h2>
          </div>
          {reports.length === 0 ? (
            <p className="px-6 py-8 text-sm leading-6 text-[var(--muted)]">{dictionary.scanner.emptyRecentReports}</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {reports.map((report) => (
                <Link key={report.id} href={localizePath(locale, `/reports/${report.id}`)} className="group flex items-center justify-between gap-4 px-6 py-4 hover:bg-[var(--subtle)]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:text-[var(--teal)]">{report.url}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">{formatDate(locale, report.createdAt)}</span>
                  </span>
                  <span className="text-lg font-semibold">{report.score ?? "—"}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="workspace-surface h-fit p-6">
          <Upload aria-hidden="true" className="size-5 text-[var(--teal)]" />
          <h2 className="mt-3 text-lg font-semibold">{dictionary.nav.logs}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.scanner.nextDescription}</p>
          <Link href={localizePath(locale, "/logs")} className="button-secondary mt-5 w-full">
            {dictionary.actions.openSampleLogReport}
          </Link>
        </aside>
      </div>
    </main>
  );
}

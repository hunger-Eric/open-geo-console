import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSearch, Upload } from "lucide-react";
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
  const reports = await getRecentReports(4);

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-teal-50 text-[var(--teal)]">
            <FileSearch className="size-5" />
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal">{dictionary.scanner.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              {dictionary.scanner.description}
            </p>
          </div>
        </div>
        <div className="mt-7">
          <ScannerForm locale={locale} dictionary={dictionary} />
        </div>
        <div className="mt-7 grid gap-3 md:grid-cols-3">
          {scannerCapabilities.map((capability) => {
            const Icon = capability.icon;
            const copy = dictionary.capabilities[capability.key];
            return (
              <article key={capability.key} className="rounded-md border border-[var(--border)] p-4">
                <Icon className="size-5 text-[var(--teal)]" />
                <h2 className="mt-3 text-sm font-semibold">{copy.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-md border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{dictionary.scanner.recentReportsTitle}</h2>
          <div className="mt-4 space-y-3">
            {reports.length === 0 ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                {dictionary.scanner.emptyRecentReports}
              </p>
            ) : (
              reports.map((report) => (
                <Link
                  key={report.id}
                  href={localizePath(locale, `/reports/${report.id}`)}
                  className="block rounded-md border border-[var(--border)] p-3 hover:bg-slate-50"
                >
                  <span className="block truncate text-sm font-semibold">{report.url}</span>
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    {formatDate(locale, report.createdAt)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-md border border-[var(--border)] bg-white p-5 shadow-sm">
          <Upload className="size-5 text-[var(--teal)]" />
          <h2 className="mt-3 text-lg font-semibold">{dictionary.scanner.nextTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {dictionary.scanner.nextDescription}
          </p>
          <Link
            href={localizePath(locale, "/logs")}
            className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-slate-50"
          >
            {dictionary.actions.openSampleLogReport}
          </Link>
        </section>
      </aside>
    </main>
  );
}

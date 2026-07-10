import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import type { ReportWorkspaceSection } from "./report-view";

export function StoredReportFallback({
  dictionary,
  locale,
  page = 1,
  reportId,
  section = "overview"
}: {
  dictionary: Dictionary;
  locale: Locale;
  page?: number;
  reportId: string;
  section?: ReportWorkspaceSection;
}) {
  void page;
  void reportId;
  void section;
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-5 py-16">
      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{dictionary.report.reportUnavailableTitle}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{dictionary.report.reportUnavailableDescription}</p>
        <Link
          href={localizePath(locale, "/")}
          className="mt-5 inline-flex rounded-md border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-slate-50"
        >
          {dictionary.actions.backToScanner}
        </Link>
      </section>
    </main>
  );
}

"use client";

import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import { ReportView } from "./report-view";

export function StoredReportFallback({
  dictionary,
  locale,
  reportId
}: {
  dictionary: Dictionary;
  locale: Locale;
  reportId: string;
}) {
  const [report, setReport] = useState<GeoAuditReport | null>();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rawReport = window.localStorage.getItem(`open-geo-console:report:${reportId}`);
      if (!rawReport) {
        setReport(null);
        return;
      }

      try {
        setReport(JSON.parse(rawReport) as GeoAuditReport);
      } catch {
        setReport(null);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reportId]);

  if (report) {
    return <ReportView dictionary={dictionary} locale={locale} report={report} />;
  }

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-5 py-16">
      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{dictionary.report.reportUnavailableTitle}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {report === undefined ? dictionary.report.loadingReport : dictionary.report.reportUnavailableDescription}
        </p>
        {report === null ? (
          <Link
            href={localizePath(locale, "/")}
            className="mt-5 inline-flex rounded-md border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-slate-50"
          >
            {dictionary.actions.backToScanner}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

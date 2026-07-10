"use client";

import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import { ReportView, type ReportWorkspaceSection } from "./report-view";

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
  const [report, setReport] = useState<GeoAuditReport | null>();
  const [evidence, setEvidence] = useState<BotEvidenceSummary | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const rawReport = window.localStorage.getItem(`open-geo-console:report:${reportId}`);
      const rawEvidence = window.localStorage.getItem(`open-geo-console:bot-evidence:${reportId}`);
      if (!rawReport) {
        setReport(null);
        return;
      }

      try {
        setReport(JSON.parse(rawReport) as GeoAuditReport);
        setEvidence(rawEvidence ? (JSON.parse(rawEvidence) as BotEvidenceSummary) : null);
      } catch {
        setReport(null);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reportId]);

  if (report) {
    return (
      <ReportView
        dictionary={dictionary}
        evidence={evidence}
        locale={locale}
        page={page}
        report={report}
        reportId={reportId}
        section={section}
      />
    );
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

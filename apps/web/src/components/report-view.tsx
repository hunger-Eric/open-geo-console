import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { FileSearch } from "lucide-react";
import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, localizePath } from "@/i18n";
import { buildReportPresentation } from "@/report/presenter";
import { ReportActions } from "./report-actions";
import { ReportBotEvidence } from "./report-bot-evidence";
import { ReportIssues } from "./report-issues";
import { ReportOverview } from "./report-overview";
import { ReportPrintView } from "./report-print-view";
import { ReportTechnical } from "./report-technical";

export type ReportWorkspaceSection = "overview" | "issues" | "bots" | "technical" | "print";

export function ReportView({
  dictionary,
  evidence,
  locale,
  page = 1,
  report,
  reportId,
  section = "overview"
}: {
  dictionary: Dictionary;
  evidence?: BotEvidenceSummary | null;
  locale: Locale;
  page?: number;
  report: GeoAuditReport;
  reportId: string;
  section?: ReportWorkspaceSection;
}) {
  const presentation = buildReportPresentation(report, dictionary, locale);
  const overviewHref = localizePath(locale, `/reports/${reportId}`);

  if (section === "print") {
    return (
      <ReportPrintView
        dictionary={dictionary}
        evidence={evidence ?? null}
        locale={locale}
        presentation={presentation}
        report={report}
        reportHref={overviewHref}
      />
    );
  }

  const tabs = [
    { key: "overview", href: overviewHref },
    { key: "issues", href: localizePath(locale, `/reports/${reportId}/issues`) },
    { key: "bots", href: localizePath(locale, `/reports/${reportId}/bots`) },
    { key: "technical", href: localizePath(locale, `/reports/${reportId}/technical`) }
  ] as const;

  return (
    <main className="report-page mx-auto w-full max-w-[1440px] px-5 py-6 sm:px-8 sm:py-8">
      <section className="workspace-context">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--teal)]">
            <FileSearch aria-hidden="true" className="size-4" />
            {dictionary.report.title}
          </div>
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{report.url}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--muted)]">
            <div>
              <dt className="inline">{dictionary.workspace.currentSite}: </dt>
              <dd className="inline text-[var(--foreground)]">{report.url}</dd>
            </div>
            <div>
              <dt className="inline">{dictionary.workspace.lastScan}: </dt>
              <dd className="inline text-[var(--foreground)]">{formatDate(locale, report.scannedAt)}</dd>
            </div>
          </dl>
        </div>
        <ReportActions
          dictionary={dictionary}
          printHref={localizePath(locale, `/reports/${reportId}/print`)}
          shareHref={overviewHref}
        />
      </section>

      <nav className="workspace-tabs" aria-label={dictionary.report.title}>
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={section === tab.key ? "page" : undefined}
            className={`workspace-tab ${section === tab.key ? "is-active" : ""}`}
          >
            {dictionary.workspace.tabs[tab.key]}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {section === "overview" ? (
          <ReportOverview
            dictionary={dictionary}
            evidence={evidence ?? null}
            locale={locale}
            presentation={presentation}
            report={report}
            reportId={reportId}
          />
        ) : null}
        {section === "issues" ? (
          <ReportIssues
            dictionary={dictionary}
            locale={locale}
            page={page}
            presentation={presentation}
            report={report}
            reportId={reportId}
          />
        ) : null}
        {section === "bots" ? (
          <ReportBotEvidence
            dictionary={dictionary}
            initialEvidence={evidence ?? null}
            locale={locale}
            reportId={reportId}
            sourceUrl={report.url}
          />
        ) : null}
        {section === "technical" ? (
          <ReportTechnical dictionary={dictionary} locale={locale} page={page} report={report} reportId={reportId} />
        ) : null}
      </div>
    </main>
  );
}

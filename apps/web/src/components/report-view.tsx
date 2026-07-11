import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { FileSearch } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, localizePath } from "@/i18n";
import { buildReportPresentation } from "@/report/presenter";
import { ReportActions } from "./report-actions";
import { ReportBotEvidence } from "./report-bot-evidence";
import { ReportIssues } from "./report-issues";
import { ReportOverview } from "./report-overview";
import { ReportPrintView } from "./report-print-view";
import { ReportTechnical } from "./report-technical";
import { AiReportContent } from "./ai-report-content";
import { AiReportStatus } from "./ai-report-status";
import { PaymentReturnBanner } from "./payment-return-banner";

export type ReportWorkspaceSection = "overview" | "analysis" | "issues" | "bots" | "technical" | "print";

export function ReportView({
  dictionary,
  aiReport,
  canPrint,
  evidence,
  locale,
  page = 1,
  report,
  reportId,
  reportLocale,
  reportTier,
  section = "overview"
}: {
  dictionary: Dictionary;
  aiReport?: AiWebsiteReportV1 | null;
  canPrint: boolean;
  evidence?: BotEvidenceSummary | null;
  locale: Locale;
  page?: number;
  report: GeoAuditReport;
  reportId: string;
  reportLocale: Locale;
  reportTier: "free" | "deep";
  section?: ReportWorkspaceSection;
}) {
  const presentation = buildReportPresentation(report, dictionary, locale);
  const overviewHref = localizePath(locale, `/reports/${reportId}`);

  if (section === "print") {
    if (!canPrint) {
      return (
        <main className="print-page mx-auto max-w-3xl px-6 py-12">
          <p className="eyebrow">{dictionary.aiReport.previewLabel}</p>
          <h1 className="mt-3 text-3xl font-semibold">{dictionary.aiReport.printLockedTitle}</h1>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">{dictionary.aiReport.printLockedDescription}</p>
          <Link href={overviewHref} className="button-primary mt-7">{dictionary.workspace.backToReport}</Link>
        </main>
      );
    }
    return (
      <ReportPrintView
        aiReport={aiReport}
        dictionary={dictionary}
        evidence={evidence ?? null}
        locale={locale}
        presentation={presentation}
        report={report}
        reportHref={overviewHref}
        reportLocale={reportLocale}
      />
    );
  }

  const tabs = [
    { key: "overview", href: overviewHref },
    { key: "analysis", href: localizePath(locale, `/reports/${reportId}/analysis`) },
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
            <div>
              <dt className="inline">{dictionary.aiReport.reportLanguage}: </dt>
              <dd className="inline text-[var(--foreground)]">
                {reportLocale === "zh" ? dictionary.aiReport.reportLanguageChinese : dictionary.aiReport.reportLanguageEnglish}
              </dd>
            </div>
          </dl>
        </div>
        <ReportActions
          dictionary={dictionary}
          printEnabled={canPrint}
          printHref={localizePath(locale, `/reports/${reportId}/print`)}
          shareHref={overviewHref}
        />
      </section>

      <Suspense fallback={null}>
        <PaymentReturnBanner dictionary={dictionary} reportId={reportId} />
      </Suspense>

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
          <div className="space-y-6">
            <AiReportStatus dictionary={dictionary} reportId={reportId} reportLocale={reportLocale} />
            <ReportOverview
              dictionary={dictionary}
              evidence={evidence ?? null}
              locale={locale}
              presentation={presentation}
              report={report}
              reportId={reportId}
              reportTier={reportTier}
            />
          </div>
        ) : null}
        {section === "analysis" ? (
          <div className="space-y-6">
            <AiReportStatus dictionary={dictionary} reportId={reportId} reportLocale={reportLocale} />
            {aiReport ? <AiReportContent dictionary={dictionary} locale={locale} report={aiReport} reportLocale={reportLocale} /> : null}
          </div>
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

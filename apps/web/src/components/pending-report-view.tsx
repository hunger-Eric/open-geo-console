import { FileSearch } from "lucide-react";
import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, localizePath } from "@/i18n";
import { AiReportStatus } from "./ai-report-status";
import { ReportActions } from "./report-actions";
import type { ReportWorkspaceSection } from "./report-view";

export function PendingReportView({
  createdAt,
  dictionary,
  locale,
  reportId,
  reportLocale,
  section = "overview",
  url
}: {
  createdAt: Date;
  dictionary: Dictionary;
  locale: Locale;
  reportId: string;
  reportLocale: Locale;
  section?: ReportWorkspaceSection;
  url: string;
}) {
  const overviewHref = localizePath(locale, `/reports/${reportId}`);
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
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">{url}</h1>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm text-[var(--muted)]">
            <div>
              <dt className="inline">{dictionary.workspace.currentSite}: </dt>
              <dd className="inline text-[var(--foreground)]">{url}</dd>
            </div>
            <div>
              <dt className="inline">{dictionary.workspace.submittedAt}: </dt>
              <dd className="inline text-[var(--foreground)]">{formatDate(locale, createdAt.toISOString())}</dd>
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
          htmlHref={`/reports/${reportId}/report.html`}
          htmlEnabled={false}
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

      <div className="mt-6 space-y-6">
        <AiReportStatus
          dictionary={dictionary}
          hasTechnicalReport={false}
          reportId={reportId}
          reportLocale={reportLocale}
          showCommerce={false}
        />
        <section className="workspace-surface p-6 sm:p-8" aria-hidden="true">
          <div className="motion-safe:animate-pulse">
            <div className="h-4 w-40 rounded bg-[var(--subtle)]" />
            <div className="mt-5 h-8 w-56 max-w-full rounded bg-[var(--subtle)]" />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="h-24 rounded-lg bg-[var(--subtle)]" />
              <div className="h-24 rounded-lg bg-[var(--subtle)]" />
              <div className="h-24 rounded-lg bg-[var(--subtle)]" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

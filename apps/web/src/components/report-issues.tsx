import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { Dictionary, Locale } from "@/i18n";
import { formatNumber, interpolate, localizePath } from "@/i18n";
import type { LocalizedFinding, ReportPresentation } from "@/report/presenter";
import { SeverityPill } from "./severity-pill";
import { WorkspacePagination } from "./workspace-pagination";

const PAGE_SIZE = 20;

export function ReportIssues({
  dictionary,
  locale,
  page,
  presentation,
  report,
  reportId
}: {
  dictionary: Dictionary;
  locale: Locale;
  page: number;
  presentation: ReportPresentation;
  report: GeoAuditReport;
  reportId: string;
}) {
  const findings = [
    ...presentation.findingsBySeverity.critical,
    ...presentation.findingsBySeverity.warning,
    ...presentation.findingsBySeverity.info
  ];
  const totalPages = Math.max(1, Math.ceil(findings.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const visible = findings.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className="workspace-surface overflow-hidden">
      <div className="border-b border-[var(--border)] px-6 py-6">
        <h2 className="text-2xl font-semibold tracking-tight">{dictionary.workspace.issuesTitle}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{dictionary.workspace.issuesDescription}</p>
        <dl className="mt-5 flex flex-wrap gap-5 text-sm">
          <IssueCount label={dictionary.report.metricLabels.critical} value={presentation.criticalCount} />
          <IssueCount label={dictionary.report.metricLabels.warnings} value={presentation.warningCount} />
          <IssueCount label={dictionary.report.metricLabels.pages} value={report.pages.length} />
        </dl>
      </div>

      {visible.length === 0 ? (
        <p className="px-6 py-10 text-sm text-[var(--muted)]">{dictionary.report.noFindings}</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {visible.map((finding) => (
            <article key={finding.id} className="grid gap-4 px-6 py-6 md:grid-cols-[110px_minmax(0,1fr)]">
              <div>
                <SeverityPill label={dictionary.severity[finding.severity]} severity={finding.severity} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold">{finding.localizedTitle}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{finding.localizedDescription}</p>
                <p className="mt-3 text-sm leading-6">{finding.localizedRecommendation}</p>
                {finding.aggregation ? (
                  <FindingAggregation
                    aggregation={finding.aggregation}
                    dictionary={dictionary}
                    locale={locale}
                  />
                ) : finding.url ? (
                  <p className="mt-3 break-all font-mono text-xs text-[var(--muted)]">{finding.url}</p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <WorkspacePagination
        baseHref={localizePath(locale, `/reports/${reportId}/issues`)}
        dictionary={dictionary}
        page={safePage}
        totalPages={totalPages}
      />
    </section>
  );
}

function FindingAggregation({
  aggregation,
  dictionary,
  locale
}: {
  aggregation: NonNullable<LocalizedFinding["aggregation"]>;
  dictionary: Dictionary;
  locale: Locale;
}) {
  const representativeUrls = aggregation.representativeUrls.slice(0, 3);
  const moreCount = Math.max(0, aggregation.affectedCount - representativeUrls.length);
  const context = [
    aggregation.pageType
      ? interpolate(dictionary.report.findingAggregation.pageType, {
          pageType: dictionary.report.findingAggregation.pageTypeLabels[aggregation.pageType]
        })
      : null,
    aggregation.templateKey
      ? interpolate(dictionary.report.findingAggregation.template, { template: aggregation.templateKey })
      : null
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="mt-4 rounded-lg bg-[var(--subtle)] p-4">
      <p className="text-sm font-semibold">
        {interpolate(dictionary.report.findingAggregation.affectedPages, {
          count: formatNumber(locale, aggregation.affectedCount)
        })}
      </p>
      {context.length > 0 ? <p className="mt-1 text-xs text-[var(--muted)]">{context.join(" · ")}</p> : null}
      {representativeUrls.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[var(--muted)]">{dictionary.report.findingAggregation.representativePages}</p>
          <ul className="mt-2 space-y-1">
            {representativeUrls.map((url) => (
              <li key={url} className="break-all font-mono text-xs text-[var(--muted)]">{url}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {moreCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">
          {interpolate(dictionary.report.findingAggregation.morePages, {
            count: formatNumber(locale, moreCount)
          })}
        </p>
      ) : null}
    </div>
  );
}

function IssueCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

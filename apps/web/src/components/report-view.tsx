import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { AlertTriangle, CheckCircle2, FileSearch, Upload } from "lucide-react";
import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, localizePath } from "@/i18n";
import {
  buildReportPresentation,
  formatReportNumber,
  localizedAssetSummary
} from "@/report/presenter";
import { ReportActions } from "./report-actions";
import { ScoreRing } from "./score-ring";
import { SeverityPill } from "./severity-pill";

export function ReportView({
  dictionary,
  locale,
  report
}: {
  dictionary: Dictionary;
  locale: Locale;
  report: GeoAuditReport;
}) {
  const presentation = buildReportPresentation(report, dictionary, locale);
  const assetEntries = Object.entries(report.machineReadableAssets) as Array<
    [keyof GeoAuditReport["machineReadableAssets"], GeoAuditReport["machineReadableAssets"][keyof GeoAuditReport["machineReadableAssets"]]]
  >;

  return (
    <main className="report-page mx-auto w-full max-w-7xl px-5 py-8">
      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--teal)]">
              <FileSearch className="size-4" />
              {dictionary.report.title}
            </div>
            <h1 className="mt-3 break-words text-3xl font-semibold">{report.url}</h1>
            <dl className="mt-4 grid gap-2 text-sm text-[var(--muted)] sm:grid-cols-2">
              <Meta label={dictionary.report.generatedFor} value={report.url} />
              <Meta label={dictionary.report.scanDate} value={formatDate(locale, report.scannedAt)} />
            </dl>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {dictionary.report.shareDescription}
            </p>
          </div>
          <ReportActions dictionary={dictionary} locale={locale} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
            <div className="flex justify-center">
              <ScoreRing label={dictionary.report.scoreLabel} score={report.score} />
            </div>
            <p className="mt-5 text-sm leading-6 text-[var(--muted)]">
              {dictionary.report.scoreDescription}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Metric
                label={dictionary.report.metricLabels.critical}
                value={presentation.criticalCount}
              />
              <Metric
                label={dictionary.report.metricLabels.warnings}
                value={presentation.warningCount}
              />
              <Metric label={dictionary.report.metricLabels.pages} value={report.pages.length} />
              <Metric
                label={dictionary.report.metricLabels.assets}
                value={presentation.availableAssets}
              />
            </dl>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
            <Upload className="size-5 text-[var(--teal)]" />
            <h2 className="mt-3 text-lg font-semibold">{dictionary.report.logNextTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {dictionary.report.logNextDescription}
            </p>
            <Link
              href={localizePath(locale, "/logs")}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-slate-50"
            >
              {dictionary.actions.uploadLogsNext}
            </Link>
          </section>
        </aside>

        <div className="min-w-0 space-y-6">
          <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{dictionary.report.executiveSummary}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-[var(--border)] p-4">
                <h3 className="text-sm font-semibold">{dictionary.report.scoreMeaning}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {presentation.scoreMeaning}
                </p>
              </div>
              <div className="rounded-md border border-[var(--border)] p-4">
                <h3 className="text-sm font-semibold">{dictionary.report.priorityFixes}</h3>
                {presentation.priorityFindings.length === 0 ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {dictionary.report.priorityEmpty}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--muted)]">
                    {presentation.priorityFindings.map((finding) => (
                      <li key={finding.id}>{finding.localizedRecommendation}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{dictionary.report.machineReadableAssets}</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {assetEntries.map(([key, asset]) => (
                <div key={key} className="rounded-md border border-[var(--border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{dictionary.report.assetLabels[key]}</span>
                    {asset.present ? (
                      <CheckCircle2 className="size-5 text-[var(--teal)]" />
                    ) : (
                      <AlertTriangle className="size-5 text-[var(--amber)]" />
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {localizedAssetSummary(key, asset.present, dictionary)}
                  </p>
                  {asset.url ? (
                    <p className="mt-3 truncate text-xs text-[var(--muted)]">{asset.url}</p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{dictionary.report.findingsAndRecommendations}</h2>
            <div className="mt-4 divide-y divide-[var(--border)]">
              {presentation.localizedFindings.length === 0 ? (
                <p className="py-5 text-sm text-[var(--muted)]">{dictionary.report.noFindings}</p>
              ) : (
                presentation.localizedFindings.map((finding) => (
                  <article
                    key={finding.id}
                    className="grid min-w-0 gap-3 py-4 md:grid-cols-[120px_minmax(0,1fr)]"
                  >
                    <div className="space-y-2">
                      <SeverityPill
                        label={dictionary.severity[finding.severity]}
                        severity={finding.severity}
                      />
                      {finding.copySource === "legacy" ? (
                        <span className="block text-xs text-[var(--muted)]">
                          {dictionary.report.legacyFindingLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{finding.localizedTitle}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                        {finding.localizedDescription}
                      </p>
                      <p className="mt-2 text-sm leading-6">{finding.localizedRecommendation}</p>
                      {finding.url ? (
                        <p className="mt-2 break-all text-xs text-[var(--muted)]">{finding.url}</p>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">{dictionary.report.technicalAppendix}</h2>
            <div className="mt-4 max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted)]">
                  <tr className="border-b border-[var(--border)]">
                    <th className="py-3 pr-4">{dictionary.report.tableHeaders.url}</th>
                    <th className="py-3 pr-4">{dictionary.report.tableHeaders.status}</th>
                    <th className="py-3 pr-4">{dictionary.report.tableHeaders.h1}</th>
                    <th className="py-3 pr-4">{dictionary.report.tableHeaders.schema}</th>
                    <th className="py-3 pr-4">{dictionary.report.tableHeaders.text}</th>
                    <th className="py-3">{dictionary.report.tableHeaders.links}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.pages.map((page) => (
                    <tr key={page.url} className="border-b border-[var(--border)] last:border-0">
                      <td className="max-w-80 break-all py-3 pr-4">{page.url}</td>
                      <td className="py-3 pr-4">{page.status || dictionary.report.fields.error}</td>
                      <td className="py-3 pr-4">{formatReportNumber(locale, page.h1.length)}</td>
                      <td className="py-3 pr-4">
                        {page.hasJsonLd ? dictionary.report.fields.yes : dictionary.report.fields.no}
                      </td>
                      <td className="py-3 pr-4">
                        {formatReportNumber(locale, page.readableTextLength)}
                      </td>
                      <td className="py-3">{formatReportNumber(locale, page.internalLinks)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 break-words text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <dt className="text-xs uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { recommendedNginxLogFormat } from "@open-geo-console/log-parser";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import { formatReportNumber, localizedAssetSummary } from "@/report/presenter";
import { WorkspacePagination } from "./workspace-pagination";

const PAGE_SIZE = 20;

export function ReportTechnical({
  dictionary,
  locale,
  page,
  report,
  reportId
}: {
  dictionary: Dictionary;
  locale: Locale;
  page: number;
  report: GeoAuditReport;
  reportId: string;
}) {
  const assets = Object.entries(report.machineReadableAssets) as Array<
    [keyof GeoAuditReport["machineReadableAssets"], GeoAuditReport["machineReadableAssets"][keyof GeoAuditReport["machineReadableAssets"]]]
  >;
  const totalPages = Math.max(1, Math.ceil(report.pages.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pages = report.pages.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-6">
          <h2 className="text-2xl font-semibold tracking-tight">{dictionary.workspace.technicalTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.workspace.technicalDescription}</p>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {assets.map(([key, asset]) => (
            <div key={key} className="grid gap-3 px-6 py-5 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-center">
              <span className="font-semibold">{dictionary.report.assetLabels[key]}</span>
              <div>
                <p className="text-sm text-[var(--muted)]">{localizedAssetSummary(key, asset.present, dictionary)}</p>
                {asset.url ? <p className="mt-1 break-all font-mono text-xs text-[var(--muted)]">{asset.url}</p> : null}
              </div>
              {asset.present ? (
                <CheckCircle2 aria-label={dictionary.report.fields.present} className="size-5 text-[var(--teal)]" />
              ) : (
                <AlertTriangle aria-label={dictionary.report.fields.missing} className="size-5 text-[var(--amber)]" />
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-xl font-semibold">{dictionary.report.technicalAppendix}</h2>
        </div>
        <div className="responsive-table-wrap">
          <table className="workspace-table">
            <thead>
              <tr>
                <th>{dictionary.report.tableHeaders.url}</th>
                <th>{dictionary.report.tableHeaders.status}</th>
                <th>{dictionary.report.tableHeaders.h1}</th>
                <th>{dictionary.report.tableHeaders.schema}</th>
                <th>{dictionary.report.tableHeaders.text}</th>
                <th>{dictionary.report.tableHeaders.links}</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((auditedPage) => (
                <tr key={auditedPage.url}>
                  <td data-label={dictionary.report.tableHeaders.url} className="max-w-96 break-all">{auditedPage.url}</td>
                  <td data-label={dictionary.report.tableHeaders.status}>{auditedPage.status || dictionary.report.fields.error}</td>
                  <td data-label={dictionary.report.tableHeaders.h1}>{formatReportNumber(locale, auditedPage.h1.length)}</td>
                  <td data-label={dictionary.report.tableHeaders.schema}>{auditedPage.hasJsonLd ? dictionary.report.fields.yes : dictionary.report.fields.no}</td>
                  <td data-label={dictionary.report.tableHeaders.text}>{formatReportNumber(locale, auditedPage.readableTextLength)}</td>
                  <td data-label={dictionary.report.tableHeaders.links}>{formatReportNumber(locale, auditedPage.internalLinks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <WorkspacePagination
          baseHref={localizePath(locale, `/reports/${reportId}/technical`)}
          dictionary={dictionary}
          page={safePage}
          totalPages={totalPages}
        />
      </section>

      <details className="workspace-surface group p-6">
        <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">
          {dictionary.logs.recommendedNginx}
        </summary>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{dictionary.logs.recommendedNginxIntro}</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{recommendedNginxLogFormat}</pre>
      </details>
    </div>
  );
}

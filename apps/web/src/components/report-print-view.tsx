import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatNumber } from "@/i18n";
import type { ReportPresentation } from "@/report/presenter";
import { localizedAssetSummary } from "@/report/presenter";
import { PrintToolbar } from "./print-toolbar";
import { ScoreRing } from "./score-ring";
import { SeverityPill } from "./severity-pill";

export function ReportPrintView({
  dictionary,
  evidence,
  locale,
  presentation,
  report,
  reportHref
}: {
  dictionary: Dictionary;
  evidence: BotEvidenceSummary | null;
  locale: Locale;
  presentation: ReportPresentation;
  report: GeoAuditReport;
  reportHref: string;
}) {
  const assets = Object.entries(report.machineReadableAssets) as Array<
    [keyof GeoAuditReport["machineReadableAssets"], GeoAuditReport["machineReadableAssets"][keyof GeoAuditReport["machineReadableAssets"]]]
  >;

  return (
    <main className="print-page mx-auto max-w-5xl px-6 py-8">
      <PrintToolbar backHref={reportHref} dictionary={dictionary} />
      <header className="border-b border-[var(--border)] pb-6">
        <p className="eyebrow">{dictionary.workspace.printTitle}</p>
        <h1 className="mt-2 break-all text-3xl font-semibold">{report.url}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{dictionary.report.scanDate}: {formatDate(locale, report.scannedAt)}</p>
      </header>

      <section className="grid gap-6 border-b border-[var(--border)] py-8 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
        <ScoreRing label={dictionary.report.scoreLabel} score={report.score} />
        <div>
          <h2 className="text-2xl font-semibold">{presentation.scoreMeaning}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.report.scoreDescription}</p>
          <p className="mt-4 text-sm">{dictionary.report.metricLabels.critical}: {presentation.criticalCount} · {dictionary.report.metricLabels.warnings}: {presentation.warningCount}</p>
        </div>
      </section>

      <PrintSection title={dictionary.report.findingsAndRecommendations}>
        <div className="divide-y divide-[var(--border)]">
          {presentation.localizedFindings.map((finding) => (
            <article key={finding.id} className="grid gap-3 py-4 sm:grid-cols-[100px_minmax(0,1fr)]">
              <SeverityPill label={dictionary.severity[finding.severity]} severity={finding.severity} />
              <div>
                <h3 className="font-semibold">{finding.localizedTitle}</h3>
                <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{finding.localizedDescription}</p>
                <p className="mt-2 text-sm leading-6">{finding.localizedRecommendation}</p>
              </div>
            </article>
          ))}
        </div>
      </PrintSection>

      <PrintSection title={dictionary.report.machineReadableAssets}>
        <div className="divide-y divide-[var(--border)]">
          {assets.map(([key, asset]) => (
            <div key={key} className="grid gap-2 py-3 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
              <strong>{dictionary.report.assetLabels[key]}</strong>
              <span className="text-sm text-[var(--muted)]">{localizedAssetSummary(key, asset.present, dictionary)}</span>
              {asset.present ? <CheckCircle2 className="size-5 text-[var(--teal)]" /> : <AlertTriangle className="size-5 text-[var(--amber)]" />}
            </div>
          ))}
        </div>
      </PrintSection>

      <PrintSection title={dictionary.workspace.botEvidenceTitle}>
        {evidence ? (
          <>
            <p className="text-sm">{dictionary.workspace.botsObserved}: {formatNumber(locale, evidence.detectedBotCount)} · {dictionary.workspace.operatorsObserved}: {formatNumber(locale, evidence.operators.length)}</p>
            <div className="mt-4 divide-y divide-[var(--border)]">
              {evidence.bots.map((bot) => (
                <div key={bot.ruleId} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <span><strong>{bot.bot}</strong> · {bot.operator}</span>
                  <span>{bot.hits}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">{dictionary.workspace.botEvidenceEmpty}</p>
        )}
      </PrintSection>

      <PrintSection title={dictionary.report.technicalAppendix}>
        <table className="workspace-table">
          <thead><tr><th>{dictionary.report.tableHeaders.url}</th><th>{dictionary.report.tableHeaders.status}</th><th>{dictionary.report.tableHeaders.h1}</th><th>{dictionary.report.tableHeaders.schema}</th></tr></thead>
          <tbody>
            {report.pages.map((page) => (
              <tr key={page.url}><td className="break-all">{page.url}</td><td>{page.status}</td><td>{page.h1.length}</td><td>{page.hasJsonLd ? dictionary.report.fields.yes : dictionary.report.fields.no}</td></tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
    </main>
  );
}

function PrintSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="border-b border-[var(--border)] py-8"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}

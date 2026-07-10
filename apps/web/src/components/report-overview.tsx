import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import type { BotEvidenceSummary } from "@open-geo-console/log-parser";
import { ArrowRight, Bot, CheckCircle2, FileUp } from "lucide-react";
import Link from "next/link";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatNumber, interpolate, localizePath } from "@/i18n";
import type { LocalizedFinding, ReportPresentation } from "@/report/presenter";
import { ScoreRing } from "./score-ring";
import { SeverityPill } from "./severity-pill";

export function ReportOverview({
  dictionary,
  evidence,
  locale,
  presentation,
  report,
  reportId,
  reportTier
}: {
  dictionary: Dictionary;
  evidence: BotEvidenceSummary | null;
  locale: Locale;
  presentation: ReportPresentation;
  report: GeoAuditReport;
  reportId: string;
  reportTier: "free" | "deep";
}) {
  const topFindings = presentation.priorityFindings.slice(0, 3);
  const issuesHref = localizePath(locale, `/reports/${reportId}/issues`);
  const botsHref = localizePath(locale, `/reports/${reportId}/bots`);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <section className="workspace-surface p-6 sm:p-8">
          <div className="grid gap-7 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
            <div className="flex justify-center md:justify-start">
              <ScoreRing label={reportTier === "free" ? dictionary.aiReport.homepageScore : dictionary.report.scoreLabel} score={report.score} />
            </div>
            <div>
              <p className="eyebrow">{dictionary.workspace.overviewTitle}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {reportTier === "free" ? dictionary.aiReport.homepagePreviewNotice : presentation.scoreMeaning}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                {reportTier === "free" ? dictionary.aiReport.homepageScoreDescription : dictionary.report.scoreDescription}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link href={issuesHref} className="button-primary">
                  {dictionary.workspace.viewAllIssues}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <Link href={botsHref} className="button-secondary">
                  <FileUp aria-hidden="true" className="size-4" />
                  {dictionary.report.logNextTitle}
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="workspace-surface overflow-hidden">
          <div className="border-b border-[var(--border)] px-6 py-5">
            <h2 className="text-xl font-semibold">{dictionary.workspace.topFixes}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{dictionary.report.priorityFixes}</p>
          </div>
          {topFindings.length === 0 ? (
            <p className="px-6 py-8 text-sm text-[var(--muted)]">{dictionary.report.priorityEmpty}</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {topFindings.map((finding) => (
                <article key={finding.id} className="grid gap-4 px-6 py-5 sm:grid-cols-[104px_minmax(0,1fr)_auto] sm:items-center">
                  <SeverityPill label={dictionary.severity[finding.severity]} severity={finding.severity} />
                  <div className="min-w-0">
                    <h3 className="font-semibold">{finding.localizedTitle}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{finding.localizedRecommendation}</p>
                    {finding.aggregation ? (
                      <PriorityFindingAggregation
                        aggregation={finding.aggregation}
                        dictionary={dictionary}
                        locale={locale}
                      />
                    ) : null}
                  </div>
                  <Link href={issuesHref} className="text-link">
                    {dictionary.workspace.viewIssueDetails}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </article>
              ))}
            </div>
          )}
          {presentation.localizedFindings.length > topFindings.length ? (
            <div className="border-t border-[var(--border)] px-6 py-4 text-center">
              <Link href={issuesHref} className="text-link">
                {dictionary.workspace.viewAllIssues}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          ) : null}
        </section>
      </div>

      <aside className="workspace-surface h-fit p-6">
        <h2 className="text-lg font-semibold">{dictionary.workspace.overviewTitle}</h2>
        <dl className="mt-4 divide-y divide-[var(--border)] text-sm">
          <SummaryRow label={reportTier === "free" ? dictionary.aiReport.homepageScore : dictionary.report.scoreLabel} value={`${formatNumber(locale, report.score)} / 100`} />
          <SummaryRow label={dictionary.report.metricLabels.critical} value={formatNumber(locale, presentation.criticalCount)} />
          <SummaryRow label={dictionary.report.metricLabels.warnings} value={formatNumber(locale, presentation.warningCount)} />
          <SummaryRow label={dictionary.report.metricLabels.pages} value={formatNumber(locale, report.pages.length)} />
          <SummaryRow label={dictionary.report.metricLabels.assets} value={formatNumber(locale, presentation.availableAssets)} />
        </dl>

        <div className="mt-7 border-t border-[var(--border)] pt-6">
          <div className="flex items-center gap-2">
            <Bot aria-hidden="true" className="size-5 text-[var(--teal)]" />
            <h2 className="text-lg font-semibold">{dictionary.workspace.botEvidenceTitle}</h2>
          </div>
          {evidence ? (
            <>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <CompactMetric label={dictionary.workspace.botsObserved} value={formatNumber(locale, evidence.detectedBotCount)} />
                <CompactMetric label={dictionary.workspace.operatorsObserved} value={formatNumber(locale, evidence.operators.length)} />
              </dl>
              <p className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
                <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--teal)]" />
                {dictionary.workspace.latestEvidence}: {formatDate(locale, evidence.analyzedAt)}
              </p>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{dictionary.workspace.botEvidenceEmpty}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.workspace.botEvidenceDescription}</p>
            </>
          )}
          <Link href={botsHref} className="button-secondary mt-5 w-full">
            {evidence ? dictionary.workspace.replaceEvidence : dictionary.report.logNextTitle}
          </Link>
        </div>
      </aside>
    </div>
  );
}

function PriorityFindingAggregation({
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
      ? dictionary.report.findingAggregation.pageTypeLabels[aggregation.pageType]
      : null,
    aggregation.templateKey ?? null
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="mt-3 text-xs text-[var(--muted)]">
      <p className="font-semibold text-[var(--foreground)]">
        {interpolate(dictionary.report.findingAggregation.affectedPages, {
          count: formatNumber(locale, aggregation.affectedCount)
        })}
        {context.length > 0 ? ` · ${context.join(" · ")}` : ""}
      </p>
      {representativeUrls.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {representativeUrls.map((url) => (
            <li key={url} className="break-all font-mono">{url}</li>
          ))}
        </ul>
      ) : null}
      {moreCount > 0 ? (
        <p className="mt-1">
          {interpolate(dictionary.report.findingAggregation.morePages, {
            count: formatNumber(locale, moreCount)
          })}
        </p>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--subtle)] p-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

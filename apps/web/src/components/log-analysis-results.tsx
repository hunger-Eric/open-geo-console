"use client";

import {
  recommendedNginxLogFormat,
  type BotCoverageRow,
  type LogAnalysisResult
} from "@open-geo-console/log-parser";
import { useMemo, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatNumber, interpolate } from "@/i18n";

const PAGE_SIZE = 10;

export function LogAnalysisResults({
  dictionary,
  locale,
  result
}: {
  dictionary: Dictionary;
  locale: Locale;
  result: LogAnalysisResult;
}) {
  const [registryPage, setRegistryPage] = useState(1);
  const detectedRows = result.botCoverage.filter((row) => row.status === "detected");
  const sortedRegistry = useMemo(() => [...result.botCoverage].sort(compareCoverage), [result.botCoverage]);
  const totalPages = Math.max(1, Math.ceil(sortedRegistry.length / PAGE_SIZE));
  const safePage = Math.min(registryPage, totalPages);
  const visibleRegistry = sortedRegistry.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-xl font-semibold">{dictionary.logs.summary}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {interpolate(dictionary.logs.registryContext, {
              detected: detectedRows.length,
              total: result.botCoverage.length
            })}
          </p>
        </div>
        <dl className="grid gap-px bg-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
          <Metric label={dictionary.logs.metricLabels.lines} locale={locale} value={result.totalLines} />
          <Metric label={dictionary.logs.metricLabels.parsed} locale={locale} value={result.parsedLines} />
          <Metric label={dictionary.logs.metricLabels.aiHits} locale={locale} value={result.aiCrawlerHits} />
          <Metric label={dictionary.logs.metricLabels.detectedBots} locale={locale} value={detectedRows.length} />
          <Metric label={dictionary.logs.metricLabels.detectedOperators} locale={locale} value={result.operatorSummary.length} />
          <Metric label={dictionary.logs.metricLabels.registryBots} locale={locale} value={result.botCoverage.length} />
        </dl>
        {result.missingUserAgent ? (
          <p className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {dictionary.logs.missingUserAgentWarning}
          </p>
        ) : null}
      </section>

      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-xl font-semibold">{dictionary.logs.operatorSummary}</h2>
        </div>
        {result.operatorSummary.length === 0 ? (
          <p className="px-6 py-8 text-sm text-[var(--muted)]">{dictionary.logs.noDetectedOperators}</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {result.operatorSummary.map((summary) => (
              <div key={summary.operator} className="grid gap-3 px-6 py-4 sm:grid-cols-[180px_minmax(0,1fr)_120px_220px] sm:items-center">
                <strong>{summary.operator}</strong>
                <p className="text-sm text-[var(--muted)]">{summary.detectedBots.join(", ")}</p>
                <p className="text-sm">{interpolate(dictionary.logs.hitCount, { count: summary.totalHits })}</p>
                <p className="text-sm text-[var(--muted)]">{summary.latestDate ? formatDate(locale, summary.latestDate) : "—"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <h2 className="text-xl font-semibold">{dictionary.workspace.detectedBots}</h2>
        </div>
        {detectedRows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-[var(--muted)]">{dictionary.logs.noKnownCrawlers}</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {detectedRows.map((row) => <CoverageRow key={row.ruleId} dictionary={dictionary} locale={locale} row={row} />)}
          </div>
        )}
      </section>

      <details className="workspace-surface overflow-hidden">
        <summary className="cursor-pointer px-6 py-5 text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">
          {dictionary.logs.botCoverageMatrix}
        </summary>
        <p className="border-t border-[var(--border)] px-6 py-4 text-sm leading-6 text-[var(--muted)]">{dictionary.logs.robotTokenOnlyNotice}</p>
        <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
          {visibleRegistry.map((row) => <CoverageRow key={row.ruleId} dictionary={dictionary} locale={locale} row={row} />)}
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
            <button type="button" disabled={safePage === 1} onClick={() => setRegistryPage((page) => Math.max(1, page - 1))} className="button-secondary">{dictionary.workspace.previousPage}</button>
            <span className="text-sm text-[var(--muted)]">{interpolate(dictionary.workspace.pageStatus, { page: safePage, total: totalPages })}</span>
            <button type="button" disabled={safePage === totalPages} onClick={() => setRegistryPage((page) => Math.min(totalPages, page + 1))} className="button-secondary">{dictionary.workspace.nextPage}</button>
          </div>
        ) : null}
      </details>

      <details className="workspace-surface p-6">
        <summary className="cursor-pointer text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">{dictionary.logs.detectedEvidence}</summary>
        {result.aggregates.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">{dictionary.logs.noKnownCrawlers}</p>
        ) : (
          <div className="mt-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {result.aggregates.map((group) => (
              <div key={`${group.operator}-${group.bot}-${group.path}-${group.status}-${group.date}`} className="grid gap-2 py-3 text-sm sm:grid-cols-[150px_150px_minmax(0,1fr)_100px]">
                <strong>{group.operator}</strong><span>{group.bot}</span><code className="break-all text-xs">{group.path}</code><span>{group.hits}</span>
              </div>
            ))}
          </div>
        )}
      </details>

      <details className="workspace-surface p-6">
        <summary className="cursor-pointer text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">{dictionary.logs.policyHints}</summary>
        <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
          {result.policyHints.map((hint) => (
            <p key={`${hint.type}-${hint.ruleId ?? hint.bot ?? "global"}`}>
              {interpolate(dictionary.logs.policyHintMessages[hint.type], {
                bot: hint.bot ?? "",
                operator: hint.operator ?? "",
                robotsToken: hint.robotsToken ?? ""
              })}
            </p>
          ))}
        </div>
      </details>

      <details className="workspace-surface p-6">
        <summary className="cursor-pointer text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">{dictionary.logs.recommendedNginx}</summary>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{dictionary.logs.recommendedNginxIntro}</p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">{recommendedNginxLogFormat}</pre>
      </details>
    </div>
  );
}

function Metric({ label, locale, value }: { label: string; locale: Locale; value: number }) {
  return <div className="bg-white px-4 py-4"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 text-2xl font-semibold">{formatNumber(locale, value)}</dd></div>;
}

function CoverageRow({ dictionary, locale, row }: { dictionary: Dictionary; locale: Locale; row: BotCoverageRow }) {
  return (
    <div className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_150px_110px_220px] sm:items-center">
      <div><p className="font-semibold">{row.bot}</p><p className="mt-1 text-xs text-[var(--muted)]">{row.operator} · {dictionary.logs.intentLabels[row.intent]}</p></div>
      <p className="text-sm text-[var(--muted)]">{dictionary.logs.detectabilityLabels[row.detectability]}</p>
      <span className={`status-chip status-${row.status}`}>{dictionary.logs.coverageStatuses[row.status]}</span>
      <p className="text-sm text-[var(--muted)]">{row.latestDate ? formatDate(locale, row.latestDate) : interpolate(dictionary.logs.hitCount, { count: row.hits })}</p>
    </div>
  );
}

function compareCoverage(left: BotCoverageRow, right: BotCoverageRow) {
  return statusRank(left.status) - statusRank(right.status) || left.operator.localeCompare(right.operator) || left.bot.localeCompare(right.bot);
}

function statusRank(status: BotCoverageRow["status"]) {
  return status === "detected" ? 0 : status === "not_seen" ? 1 : status === "unknown_or_unverified" ? 2 : 3;
}

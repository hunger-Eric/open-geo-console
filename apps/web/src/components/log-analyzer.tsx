"use client";

import {
  analyzeLogs,
  recommendedNginxLogFormat,
  type BotCoverageRow,
  type OperatorSummary,
  type PolicyHint
} from "@open-geo-console/log-parser";
import { useMemo, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatNumber, interpolate } from "@/i18n";
import { sampleCrawlerLog } from "@/data/sample-log";

const MAX_VISIBLE_PATHS = 4;

export function LogAnalyzer({
  dictionary,
  locale
}: {
  dictionary: Dictionary;
  locale: Locale;
}) {
  const [input, setInput] = useState(sampleCrawlerLog);
  const result = useMemo(() => analyzeLogs(input), [input]);

  const detectedBotCount = useMemo(
    () => result.botCoverage.filter((row) => row.status === "detected").length,
    [result.botCoverage]
  );

  const coverageGroups = useMemo(() => groupCoverageByOperator(result.botCoverage), [
    result.botCoverage
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{dictionary.logs.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {dictionary.logs.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInput(sampleCrawlerLog)}
            className="shrink-0 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            {dictionary.actions.loadSample}
          </button>
        </div>
        <label className="mt-5 block text-sm font-semibold" htmlFor="log-sample">
          {dictionary.logs.textareaLabel}
        </label>
        <textarea
          id="log-sample"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="mt-2 min-h-[320px] w-full rounded-md border border-[var(--border)] bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-teal-700/10"
          spellCheck={false}
        />
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{dictionary.logs.summary}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {interpolate(dictionary.logs.registryContext, {
                detected: detectedBotCount,
                total: result.botCoverage.length
              })}
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Metric label={dictionary.logs.metricLabels.lines} locale={locale} value={result.totalLines} />
          <Metric label={dictionary.logs.metricLabels.parsed} locale={locale} value={result.parsedLines} />
          <Metric label={dictionary.logs.metricLabels.aiHits} locale={locale} value={result.aiCrawlerHits} />
          <Metric label={dictionary.logs.metricLabels.groups} locale={locale} value={result.aggregates.length} />
          <Metric label={dictionary.logs.metricLabels.detectedBots} locale={locale} value={detectedBotCount} />
          <Metric
            label={dictionary.logs.metricLabels.detectedOperators}
            locale={locale}
            value={result.operatorSummary.length}
          />
          <Metric label={dictionary.logs.metricLabels.registryBots} locale={locale} value={result.botCoverage.length} />
        </dl>
        {result.missingUserAgent ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {dictionary.logs.missingUserAgentWarning}
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{dictionary.logs.operatorSummary}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {result.operatorSummary.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{dictionary.logs.noDetectedOperators}</p>
          ) : (
            result.operatorSummary.map((summary) => (
              <OperatorSummaryCard
                key={summary.operator}
                dictionary={dictionary}
                locale={locale}
                summary={summary}
              />
            ))
          )}
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{dictionary.logs.botCoverageMatrix}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {dictionary.logs.robotTokenOnlyNotice}
            </p>
          </div>
        </div>
        <div className="mt-5 space-y-5">
          {coverageGroups.map(({ operator, rows }) => (
            <div key={operator} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase text-[var(--muted)]">{operator}</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((row) => (
                  <CoverageCard
                    key={row.ruleId}
                    dictionary={dictionary}
                    locale={locale}
                    row={row}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{dictionary.logs.policyHints}</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {result.policyHints.map((hint) => (
            <PolicyHintCard key={policyHintKey(hint)} dictionary={dictionary} hint={hint} />
          ))}
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{dictionary.logs.detectedEvidence}</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {result.aggregates.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{dictionary.logs.noKnownCrawlers}</p>
          ) : (
            result.aggregates.map((group) => (
              <article
                key={`${group.operator}-${group.bot}-${group.path}-${group.status}-${group.date}`}
                className="rounded-md border border-[var(--border)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold">{group.operator}</span>
                  <span className="text-sm text-[var(--muted)]">
                    {interpolate(dictionary.logs.hitCount, { count: group.hits })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--muted)]">{group.bot}</p>
                <p className="mt-2 break-all font-mono text-xs">{group.path}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {interpolate(dictionary.logs.groupMeta, {
                    date: group.date,
                    status: group.status
                  })}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{dictionary.logs.recommendedNginx}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
          {dictionary.logs.recommendedNginxIntro}
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          {recommendedNginxLogFormat}
        </pre>
      </section>
    </div>
  );
}

function Metric({ label, locale, value }: { label: string; locale: Locale; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <dt className="text-xs uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{formatNumber(locale, value)}</dd>
    </div>
  );
}

function OperatorSummaryCard({
  dictionary,
  locale,
  summary
}: {
  dictionary: Dictionary;
  locale: Locale;
  summary: OperatorSummary;
}) {
  return (
    <article className="rounded-md border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{summary.operator}</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {interpolate(dictionary.logs.hitCount, { count: summary.totalHits })}
          </p>
        </div>
        {summary.latestDate ? (
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-[var(--muted)]">
            {formatDate(locale, summary.latestDate)}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {summary.detectedBots.map((bot) => (
          <span key={bot} className="rounded-full border border-[var(--border)] px-2 py-1 text-xs">
            {bot}
          </span>
        ))}
      </div>
      <PathList dictionary={dictionary} paths={summary.paths} />
    </article>
  );
}

function CoverageCard({
  dictionary,
  locale,
  row
}: {
  dictionary: Dictionary;
  locale: Locale;
  row: BotCoverageRow;
}) {
  return (
    <article className="min-w-0 rounded-md border border-[var(--border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words font-semibold">{row.bot}</h4>
          <p className="mt-1 text-xs uppercase text-[var(--muted)]">{row.operator}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>
          {dictionary.logs.coverageStatuses[row.status]}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {dictionary.logs.coverageStatusDescriptions[row.status]}
      </p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <KeyValue label={dictionary.logs.fields.intent} value={dictionary.logs.intentLabels[row.intent]} />
        <KeyValue
          label={dictionary.logs.fields.detectability}
          value={dictionary.logs.detectabilityLabels[row.detectability]}
        />
        <KeyValue
          label={dictionary.logs.fields.hits}
          value={interpolate(dictionary.logs.hitCount, { count: row.hits })}
        />
        {row.latestDate ? (
          <KeyValue label={dictionary.logs.fields.latestDate} value={formatDate(locale, row.latestDate)} />
        ) : null}
        {row.robotsToken ? (
          <KeyValue label={dictionary.logs.fields.robotsToken} value={row.robotsToken} mono />
        ) : null}
        {row.docsUrl ? (
          <div>
            <dt className="text-xs uppercase text-[var(--muted)]">{dictionary.logs.fields.docs}</dt>
            <dd className="mt-1 break-all">
              <a
                href={row.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[var(--teal)] underline-offset-4 hover:underline"
              >
                {dictionary.logs.docsLink}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>

      {row.status === "detected" ? <PathList dictionary={dictionary} paths={row.paths} /> : null}
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        {dictionary.logs.detectabilityDescriptions[row.detectability]}
      </p>
    </article>
  );
}

function KeyValue({
  label,
  mono,
  value
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase text-[var(--muted)]">{label}</dt>
      <dd className={`mt-1 break-words ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function PathList({ dictionary, paths }: { dictionary: Dictionary; paths: string[] }) {
  if (paths.length === 0) {
    return null;
  }

  const visiblePaths = paths.slice(0, MAX_VISIBLE_PATHS);
  const hiddenCount = paths.length - visiblePaths.length;

  return (
    <div className="mt-3">
      <p className="text-xs uppercase text-[var(--muted)]">{dictionary.logs.fields.paths}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {visiblePaths.map((path) => (
          <span
            key={path}
            className="max-w-full break-all rounded-md bg-slate-100 px-2 py-1 font-mono text-xs"
          >
            {path}
          </span>
        ))}
        {hiddenCount > 0 ? (
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-[var(--muted)]">
            {interpolate(dictionary.logs.morePaths, { count: hiddenCount })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PolicyHintCard({ dictionary, hint }: { dictionary: Dictionary; hint: PolicyHint }) {
  return (
    <article className="rounded-md border border-[var(--border)] p-4">
      <p className="text-sm leading-6 text-[var(--muted)]">
        {interpolate(dictionary.logs.policyHintMessages[hint.type], {
          bot: hint.bot ?? "",
          operator: hint.operator ?? "",
          robotsToken: hint.robotsToken ?? ""
        })}
      </p>
      {hint.docsUrl ? (
        <a
          href={hint.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block break-all text-sm font-semibold text-[var(--teal)] underline-offset-4 hover:underline"
        >
          {dictionary.logs.docsLink}
        </a>
      ) : null}
    </article>
  );
}

function groupCoverageByOperator(
  rows: BotCoverageRow[]
): Array<{ operator: string; rows: BotCoverageRow[] }> {
  const groups = new Map<string, BotCoverageRow[]>();
  for (const row of rows) {
    const operatorRows = groups.get(row.operator) ?? [];
    operatorRows.push(row);
    groups.set(row.operator, operatorRows);
  }

  return [...groups.entries()]
    .map(([operator, groupRows]) => ({
      operator,
      rows: [...groupRows].sort(sortCoverageRows)
    }))
    .sort((left, right) => left.operator.localeCompare(right.operator));
}

function sortCoverageRows(left: BotCoverageRow, right: BotCoverageRow) {
  return statusRank(left.status) - statusRank(right.status) || left.bot.localeCompare(right.bot);
}

function statusRank(status: BotCoverageRow["status"]) {
  if (status === "detected") {
    return 0;
  }
  if (status === "not_seen") {
    return 1;
  }
  if (status === "unknown_or_unverified") {
    return 2;
  }
  return 3;
}

function statusTone(status: BotCoverageRow["status"]) {
  if (status === "detected") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "not_seen") {
    return "bg-slate-100 text-slate-700";
  }
  if (status === "unknown_or_unverified") {
    return "bg-amber-50 text-amber-700";
  }
  return "bg-sky-50 text-sky-700";
}

function policyHintKey(hint: PolicyHint) {
  return `${hint.type}-${hint.ruleId ?? hint.bot ?? "global"}`;
}

"use client";

import {
  analyzeLogs,
  recommendedNginxLogFormat,
  type BotCoverageRow,
  type OperatorSummary,
  type PolicyHint
} from "@open-geo-console/log-parser";
import { FileUp, GitCompare, Play, RotateCcw } from "lucide-react";
import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatNumber, interpolate } from "@/i18n";
import { sampleCrawlerLog } from "@/data/sample-log";

const MAX_VISIBLE_PATHS = 4;
const SIMULATOR_API_TIMEOUT_MS = 20000;

type JsonRecord = Record<string, unknown>;

type SimulatorAttempt = {
  key: string;
  method: string;
  url: string;
  path: string;
  userAgent?: string;
  operator?: string;
  bot?: string;
  raw: JsonRecord;
};

type SimulatorRun = {
  runId: string;
  sourceUrl: string;
  generatedAt: string;
  attempted: SimulatorAttempt[];
};

type SimulatorComparison = {
  observed: SimulatorAttempt[];
  missing: SimulatorAttempt[];
  observedKeys: Set<string>;
  missingKeys: Set<string>;
};

export function LogAnalyzer({
  dictionary,
  locale
}: {
  dictionary: Dictionary;
  locale: Locale;
}) {
  const [input, setInput] = useState(sampleCrawlerLog);
  const [simulatorRun, setSimulatorRun] = useState<SimulatorRun | null>(null);
  const [simulatorComparison, setSimulatorComparison] = useState<SimulatorComparison | null>(null);
  const [simulatorError, setSimulatorError] = useState<string | null>(null);
  const [isRunningSimulator, setIsRunningSimulator] = useState(false);
  const [isMatchingSimulatorLogs, setIsMatchingSimulatorLogs] = useState(false);
  const result = useMemo(() => analyzeLogs(input), [input]);

  const detectedBotCount = useMemo(
    () => result.botCoverage.filter((row) => row.status === "detected").length,
    [result.botCoverage]
  );

  const coverageGroups = useMemo(() => groupCoverageByOperator(result.botCoverage), [
    result.botCoverage
  ]);

  function updateInput(nextInput: string) {
    setInput(nextInput);
    setSimulatorComparison(null);
    setSimulatorError(null);
  }

  async function handleRunSimulator() {
    setIsRunningSimulator(true);
    setSimulatorError(null);
    setSimulatorComparison(null);

    try {
      const run = normalizeSimulatorRun(
        await postSimulatorJson(
          "/api/simulator/runs",
          { sourceUrl: dictionary.scanner.firstCaseUrl },
          dictionary.logs.simulator.errors.runFailed
        ),
        dictionary.scanner.firstCaseUrl
      );
      if (!run) {
        throw new Error(dictionary.logs.simulator.errors.invalidRun);
      }

      setSimulatorRun(run);
    } catch (error) {
      setSimulatorError(error instanceof Error ? error.message : dictionary.logs.simulator.errors.runFailed);
    } finally {
      setIsRunningSimulator(false);
    }
  }

  async function handleCompareSimulatorLogs() {
    if (!simulatorRun) {
      return;
    }

    if (!input.trim()) {
      setSimulatorError(dictionary.logs.simulator.errors.emptyLogs);
      return;
    }

    setIsMatchingSimulatorLogs(true);
    setSimulatorError(null);

    try {
      setSimulatorComparison(
        normalizeSimulatorComparison(
          await postSimulatorJson(
            "/api/simulator/match-logs",
            {
              attempted: simulatorRun.attempted.map(toApiAttempt),
              logInput: input,
              runId: simulatorRun.runId
            },
            dictionary.logs.simulator.errors.matchFailed
          ),
          simulatorRun.attempted
        )
      );
    } catch (error) {
      setSimulatorError(error instanceof Error ? error.message : dictionary.logs.simulator.errors.matchFailed);
    } finally {
      setIsMatchingSimulatorLogs(false);
    }
  }

  async function handleImportLogFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      updateInput(await file.text());
    } catch {
      setSimulatorError(dictionary.logs.simulator.errors.importFailed);
    } finally {
      event.target.value = "";
    }
  }

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
          <div className="flex shrink-0 flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-slate-50">
              <FileUp aria-hidden="true" className="h-4 w-4" />
              {dictionary.actions.importLogs}
              <input
                type="file"
                accept=".log,.txt,.json,.jsonl"
                className="sr-only"
                onChange={handleImportLogFile}
              />
            </label>
            <button
              type="button"
              onClick={() => updateInput(sampleCrawlerLog)}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {dictionary.actions.loadSample}
            </button>
          </div>
        </div>

        <SimulatorPanel
          comparison={simulatorComparison}
          dictionary={dictionary}
          error={simulatorError}
          isMatching={isMatchingSimulatorLogs}
          isRunning={isRunningSimulator}
          locale={locale}
          logInput={input}
          onCompare={handleCompareSimulatorLogs}
          onRun={handleRunSimulator}
          run={simulatorRun}
        />

        <label className="mt-5 block text-sm font-semibold" htmlFor="log-sample">
          {dictionary.logs.textareaLabel}
        </label>
        <textarea
          id="log-sample"
          value={input}
          onChange={(event) => updateInput(event.target.value)}
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

function SimulatorPanel({
  comparison,
  dictionary,
  error,
  isMatching,
  isRunning,
  locale,
  logInput,
  onCompare,
  onRun,
  run
}: {
  comparison: SimulatorComparison | null;
  dictionary: Dictionary;
  error: string | null;
  isMatching: boolean;
  isRunning: boolean;
  locale: Locale;
  logInput: string;
  onCompare: () => void;
  onRun: () => void;
  run: SimulatorRun | null;
}) {
  const canCompare = Boolean(run) && logInput.trim().length > 0 && !isMatching;

  return (
    <div className="mt-5 rounded-md border border-[var(--border)] bg-slate-50 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{dictionary.logs.simulator.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            {dictionary.logs.simulator.description}
          </p>
          <dl className="mt-3 text-sm">
            <dt className="text-xs uppercase text-[var(--muted)]">
              {dictionary.logs.simulator.targetUrlLabel}
            </dt>
            <dd className="mt-1 break-all font-mono text-xs">{dictionary.scanner.firstCaseUrl}</dd>
          </dl>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={onRun}
            disabled={isRunning}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--teal)] px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play aria-hidden="true" className="h-4 w-4" />
            {isRunning ? dictionary.logs.simulator.runningButton : dictionary.logs.simulator.runButton}
          </button>
          <button
            type="button"
            onClick={onCompare}
            disabled={!canCompare}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <GitCompare aria-hidden="true" className="h-4 w-4" />
            {isMatching ? dictionary.logs.simulator.comparingButton : dictionary.logs.simulator.compareButton}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-md border border-[var(--border)] bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold">{dictionary.logs.simulator.attemptedTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {dictionary.logs.simulator.attemptedDescription}
              </p>
            </div>
            {run ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-[var(--muted)]">
                {interpolate(dictionary.logs.simulator.generatedMeta, {
                  date: formatDate(locale, run.generatedAt),
                  runId: run.runId
                })}
              </span>
            ) : null}
          </div>
          <AttemptList
            attempts={run?.attempted ?? []}
            comparison={comparison}
            dictionary={dictionary}
            emptyText={dictionary.logs.simulator.noAttempts}
          />
        </div>

        <div className="min-w-0 rounded-md border border-[var(--border)] bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="font-semibold">{dictionary.logs.simulator.comparisonTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                {dictionary.logs.simulator.comparisonDescription}
              </p>
            </div>
            {comparison ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-[var(--muted)]">
                {interpolate(dictionary.logs.simulator.comparisonSummary, {
                  missing: comparison.missing.length,
                  observed: comparison.observed.length
                })}
              </span>
            ) : null}
          </div>

          {!run ? (
            <p className="mt-4 text-sm text-[var(--muted)]">{dictionary.logs.simulator.noAttempts}</p>
          ) : !logInput.trim() ? (
            <p className="mt-4 text-sm text-[var(--muted)]">{dictionary.logs.simulator.pasteLogsHint}</p>
          ) : comparison ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <ComparisonColumn
                attempts={comparison.observed}
                dictionary={dictionary}
                emptyText={dictionary.logs.simulator.noObserved}
                title={dictionary.logs.simulator.observedTitle}
                tone="observed"
              />
              <ComparisonColumn
                attempts={comparison.missing}
                dictionary={dictionary}
                emptyText={dictionary.logs.simulator.noMissing}
                title={dictionary.logs.simulator.missingTitle}
                tone="missing"
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">{dictionary.logs.simulator.pasteLogsHint}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function AttemptList({
  attempts,
  comparison,
  dictionary,
  emptyText
}: {
  attempts: SimulatorAttempt[];
  comparison: SimulatorComparison | null;
  dictionary: Dictionary;
  emptyText: string;
}) {
  if (attempts.length === 0) {
    return <p className="mt-4 text-sm text-[var(--muted)]">{emptyText}</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {attempts.map((attempt) => (
        <AttemptCard
          key={attempt.key}
          attempt={attempt}
          dictionary={dictionary}
          tone={attemptComparisonTone(attempt, comparison)}
        />
      ))}
    </div>
  );
}

function ComparisonColumn({
  attempts,
  dictionary,
  emptyText,
  title,
  tone
}: {
  attempts: SimulatorAttempt[];
  dictionary: Dictionary;
  emptyText: string;
  title: string;
  tone: "observed" | "missing";
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-semibold">{title}</h4>
      {attempts.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {attempts.map((attempt) => (
            <AttemptCard key={attempt.key} attempt={attempt} dictionary={dictionary} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );
}

function AttemptCard({
  attempt,
  dictionary,
  tone
}: {
  attempt: SimulatorAttempt;
  dictionary: Dictionary;
  tone: "pending" | "observed" | "missing";
}) {
  return (
    <article className="min-w-0 rounded-md border border-[var(--border)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all font-mono text-xs">{attempt.url || attempt.path}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">{dictionary.logs.simulator.simulatedBadge}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${attemptToneClass(tone)}`}>
          {attemptToneLabel(dictionary, tone)}
        </span>
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <KeyValue label={dictionary.logs.simulator.fields.method} value={attempt.method} />
        <KeyValue label={dictionary.logs.simulator.fields.path} value={attempt.path} mono />
        {attempt.operator ? (
          <KeyValue label={dictionary.logs.simulator.fields.operator} value={attempt.operator} />
        ) : null}
        {attempt.bot ? <KeyValue label={dictionary.logs.simulator.fields.bot} value={attempt.bot} /> : null}
        {attempt.userAgent ? (
          <KeyValue label={dictionary.logs.simulator.fields.userAgent} value={attempt.userAgent} mono />
        ) : null}
      </dl>
    </article>
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

function toApiAttempt(attempt: SimulatorAttempt): JsonRecord {
  return {
    ...attempt.raw,
    bot: attempt.bot,
    id: stringField(attempt.raw, ["id", "requestId", "attemptId"]) ?? attempt.key,
    method: attempt.method,
    operator: attempt.operator,
    path: attempt.path,
    url: attempt.url,
    userAgent: attempt.userAgent
  };
}

async function postSimulatorJson(
  url: string,
  body: JsonRecord,
  fallbackError: string
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), SIMULATOR_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(fallbackError);
    }

    return await response.json();
  } catch {
    throw new Error(fallbackError);
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeSimulatorRun(value: unknown, fallbackSourceUrl: string): SimulatorRun | null {
  const data = asRecord(value);
  if (!data) {
    return null;
  }

  const runId = stringField(data, ["runId", "id"]);
  const attemptedValues =
    arrayField(data, ["attempted", "attempts", "requests"]) ??
    arrayField(asRecord(data.result), ["attempted", "attempts", "requests"]);

  if (!runId || !attemptedValues) {
    return null;
  }

  const sourceUrl = stringField(data, ["sourceUrl", "url", "targetUrl"]) ?? fallbackSourceUrl;
  const generatedAt = stringField(data, ["generatedAt", "createdAt", "startedAt"]) ?? new Date().toISOString();

  return {
    attempted: uniqueAttempts(
      attemptedValues.map((attempt, index) => normalizeAttempt(attempt, index, sourceUrl))
    ),
    generatedAt,
    runId,
    sourceUrl
  };
}

function normalizeSimulatorComparison(value: unknown, attempted: SimulatorAttempt[]): SimulatorComparison {
  const data = asRecord(value);
  const comparison = asRecord(data?.comparison) ?? asRecord(data?.simulatorComparison);
  const result = asRecord(data?.result);
  const observedValues =
    arrayField(comparison, ["observedMatches"]) ??
    arrayField(data, ["observed", "matches"]) ??
    arrayField(result, ["observed", "matches"]);
  const missingValues =
    arrayField(comparison, ["missingAttempted"]) ??
    arrayField(data, ["missing", "unobserved", "unobservedAttempted"]) ??
    arrayField(result, ["missing", "unobserved", "unobservedAttempted"]);
  const attemptsById = new Map(attempted.flatMap((attempt) => attemptIds(attempt).map((id) => [id, attempt])));

  const hasObservedValues = Boolean(observedValues);
  const hasMissingValues = Boolean(missingValues);
  const missing = uniqueAttempts(
    hasMissingValues && missingValues
      ? missingValues.map((item, index) => normalizeMatchedAttempt(item, index, attemptsById))
      : []
  );
  const missingKeys = new Set(missing.map((attempt) => attempt.key));
  const observed = uniqueAttempts(
    hasObservedValues && observedValues
      ? observedValues.map((item, index) => normalizeMatchedAttempt(item, index, attemptsById))
      : hasMissingValues
        ? attempted.filter((attempt) => !missingKeys.has(attempt.key))
        : []
  );
  const observedKeys = new Set(observed.map((attempt) => attempt.key));
  const resolvedMissing =
    hasMissingValues ? missing : attempted.filter((attempt) => !observedKeys.has(attempt.key));
  const resolvedMissingKeys = new Set(resolvedMissing.map((attempt) => attempt.key));

  return {
    missing: resolvedMissing,
    missingKeys: resolvedMissingKeys,
    observed,
    observedKeys
  };
}

function normalizeMatchedAttempt(
  value: unknown,
  index: number,
  attemptsById: Map<string, SimulatorAttempt>
): SimulatorAttempt {
  const record = asRecord(value);
  const attemptId = stringField(record, ["attemptId", "id", "requestId"]);
  const matchedAttempt = attemptId ? attemptsById.get(attemptId) : undefined;
  if (matchedAttempt) {
    return {
      ...matchedAttempt,
      method: stringField(record, ["method", "requestMethod"]) ?? matchedAttempt.method,
      path: stringField(record, ["path", "pathname", "requestPath"]) ?? matchedAttempt.path,
      raw: { ...matchedAttempt.raw, ...record },
      userAgent: stringField(record, ["userAgent", "ua", "requestUserAgent"]) ?? matchedAttempt.userAgent
    };
  }

  return normalizeAttempt(
    asRecord(record?.attempt) ??
      asRecord(record?.attempted) ??
      asRecord(record?.simulated) ??
      asRecord(record?.request) ??
      value,
    index
  );
}

function normalizeAttempt(value: unknown, index: number, sourceUrl?: string): SimulatorAttempt {
  const raw = asRecord(value) ?? {};
  const method = stringField(raw, ["method", "requestMethod"]) ?? "GET";
  const url = stringField(raw, ["url", "requestUrl", "href"]);
  const path = stringField(raw, ["path", "pathname", "requestPath"]) ?? pathFromUrl(url) ?? "/";
  const resolvedUrl = url ?? resolveAttemptUrl(sourceUrl, path);
  const userAgent = stringField(raw, ["userAgent", "ua", "requestUserAgent"]);
  const operator = stringField(raw, ["operator", "company"]);
  const bot = stringField(raw, ["bot", "crawler", "name"]);
  const key =
    stringField(raw, ["key", "id", "requestId", "attemptId"]) ??
    [method, path, userAgent ?? "", operator ?? "", bot ?? "", resolvedUrl].join("|");

  return {
    bot,
    key: key || `attempt-${index}`,
    method,
    operator,
    path,
    raw,
    url: resolvedUrl,
    userAgent
  };
}

function attemptIds(attempt: SimulatorAttempt): string[] {
  return [
    attempt.key,
    stringField(attempt.raw, ["key", "id", "requestId", "attemptId"])
  ].filter((id): id is string => Boolean(id));
}

function uniqueAttempts(attempts: SimulatorAttempt[]): SimulatorAttempt[] {
  const seen = new Set<string>();
  const unique: SimulatorAttempt[] = [];

  for (const attempt of attempts) {
    if (seen.has(attempt.key)) {
      continue;
    }
    seen.add(attempt.key);
    unique.push(attempt);
  }

  return unique;
}

function attemptComparisonTone(
  attempt: SimulatorAttempt,
  comparison: SimulatorComparison | null
): "pending" | "observed" | "missing" {
  if (!comparison) {
    return "pending";
  }
  if (comparison.observedKeys.has(attempt.key)) {
    return "observed";
  }
  if (comparison.missingKeys.has(attempt.key)) {
    return "missing";
  }
  return "pending";
}

function attemptToneLabel(dictionary: Dictionary, tone: "pending" | "observed" | "missing") {
  if (tone === "observed") {
    return dictionary.logs.simulator.observedBadge;
  }
  if (tone === "missing") {
    return dictionary.logs.simulator.missingBadge;
  }
  return dictionary.logs.simulator.pendingBadge;
}

function attemptToneClass(tone: "pending" | "observed" | "missing") {
  if (tone === "observed") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (tone === "missing") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function arrayField(record: JsonRecord | null | undefined, keys: string[]): unknown[] | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return undefined;
}

function stringField(record: JsonRecord | null | undefined, keys: string[]): string | undefined {
  if (!record) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

function resolveAttemptUrl(sourceUrl: string | undefined, path: string): string {
  if (!sourceUrl) {
    return path;
  }

  try {
    return new URL(path, sourceUrl).toString();
  } catch {
    return path;
  }
}

function pathFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return undefined;
  }
}

import { GitCompare, Play } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, interpolate } from "@/i18n";
import type {
  SimulatorApiAttempt,
  SimulatorComparisonResult,
  SimulatorRunResponse
} from "@/simulator/contracts";
import { LogKeyValue } from "./log-key-value";

export function SimulatorPanel({
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
  comparison: SimulatorComparisonResult | null;
  dictionary: Dictionary;
  error: string | null;
  isMatching: boolean;
  isRunning: boolean;
  locale: Locale;
  logInput: string;
  onCompare: () => void;
  onRun: () => void;
  run: SimulatorRunResponse | null;
}) {
  const canCompare = Boolean(run) && logInput.trim().length > 0 && !isMatching;
  const comparisonByAttemptId = new Map(
    comparison?.attempts.map((attempt) => [attempt.attemptId, attempt]) ?? []
  );
  const observed = run?.attempted.filter((attempt) => comparisonByAttemptId.get(attempt.id)?.matched) ?? [];
  const missing =
    run?.attempted.filter((attempt) => comparison && !comparisonByAttemptId.get(attempt.id)?.matched) ?? [];

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
                  missing: missing.length,
                  observed: observed.length
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
                attempts={observed}
                dictionary={dictionary}
                emptyText={dictionary.logs.simulator.noObserved}
                title={dictionary.logs.simulator.observedTitle}
                tone="observed"
              />
              <ComparisonColumn
                attempts={missing}
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
  attempts: SimulatorApiAttempt[];
  comparison: SimulatorComparisonResult | null;
  dictionary: Dictionary;
  emptyText: string;
}) {
  if (attempts.length === 0) {
    return <p className="mt-4 text-sm text-[var(--muted)]">{emptyText}</p>;
  }

  const comparisonByAttemptId = new Map(
    comparison?.attempts.map((attempt) => [attempt.attemptId, attempt.matched]) ?? []
  );

  return (
    <div className="mt-4 space-y-3">
      {attempts.map((attempt) => (
        <AttemptCard
          key={attempt.id}
          attempt={attempt}
          dictionary={dictionary}
          tone={attemptComparisonTone(attempt.id, comparison, comparisonByAttemptId)}
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
  attempts: SimulatorApiAttempt[];
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
            <AttemptCard key={attempt.id} attempt={attempt} dictionary={dictionary} tone={tone} />
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
  attempt: SimulatorApiAttempt;
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
        <LogKeyValue label={dictionary.logs.simulator.fields.method} value={attempt.method} />
        <LogKeyValue label={dictionary.logs.simulator.fields.path} value={attempt.path} mono />
        {attempt.operator ? (
          <LogKeyValue label={dictionary.logs.simulator.fields.operator} value={attempt.operator} />
        ) : null}
        {attempt.bot ? <LogKeyValue label={dictionary.logs.simulator.fields.bot} value={attempt.bot} /> : null}
        <LogKeyValue label={dictionary.logs.simulator.fields.userAgent} value={attempt.userAgent} mono />
      </dl>
    </article>
  );
}

function attemptComparisonTone(
  attemptId: string,
  comparison: SimulatorComparisonResult | null,
  comparisonByAttemptId: Map<string, boolean>
): "pending" | "observed" | "missing" {
  if (!comparison) {
    return "pending";
  }
  return comparisonByAttemptId.get(attemptId) ? "observed" : "missing";
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

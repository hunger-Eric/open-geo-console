"use client";

import {
  analyzeLogs,
  buildBotEvidenceSummary,
  type BotEvidenceSummary,
  type LogAnalysisResult
} from "@open-geo-console/log-parser";
import { Bot, FileUp, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useMemo, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { formatDate, formatNumber, interpolate } from "@/i18n";
import { useSimulator } from "@/simulator/use-simulator";
import { SimulatorPanel } from "./simulator-panel";

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const REGISTRY_PAGE_SIZE = 10;

export function ReportBotEvidence({
  dictionary,
  initialEvidence,
  locale,
  reportId,
  sourceUrl
}: {
  dictionary: Dictionary;
  initialEvidence: BotEvidenceSummary | null;
  locale: Locale;
  reportId: string;
  sourceUrl: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<LogAnalysisResult | null>(null);
  const [summary, setSummary] = useState<BotEvidenceSummary | null>(initialEvidence);
  const [activeList, setActiveList] = useState<"detected" | "registry">("detected");
  const [registryPage, setRegistryPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const simulator = useSimulator({
    errors: dictionary.logs.simulator.errors,
    sourceUrl
  });
  const emptyRegistry = useMemo(() => analyzeLogs("").botCoverage, []);
  const registry = analysis?.botCoverage ?? emptyRegistry;
  const totalRegistryPages = Math.max(1, Math.ceil(registry.length / REGISTRY_PAGE_SIZE));
  const visibleRegistry = registry.slice(
    (registryPage - 1) * REGISTRY_PAGE_SIZE,
    registryPage * REGISTRY_PAGE_SIZE
  );

  function updateInput(nextInput: string) {
    setInput(nextInput);
    setMessage(null);
    setError(null);
    simulator.clearComparison();
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      setFileName(file.name);
      updateInput(await file.text());
    } catch {
      setError(dictionary.logs.simulator.errors.importFailed);
    } finally {
      event.target.value = "";
    }
  }

  async function analyzeAndSave() {
    setMessage(null);
    setError(null);
    if (!input.trim()) {
      setError(dictionary.workspace.errors.emptyLogs);
      return;
    }
    if (new Blob([input]).size > MAX_LOG_BYTES) {
      setError(dictionary.workspace.errors.payloadTooLarge);
      return;
    }

    setIsSaving(true);
    const localAnalysis = analyzeLogs(input);
    const localSummary = buildBotEvidenceSummary(localAnalysis);
    setAnalysis(localAnalysis);
    setSummary(localSummary);

    try {
      const response = await fetch(`/api/reports/${reportId}/bot-evidence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: input })
      });
      if (!response.ok) {
        throw new Error("persistence unavailable");
      }
      const payload = (await response.json()) as {
        analysis: LogAnalysisResult;
        summary: BotEvidenceSummary;
      };
      setAnalysis(payload.analysis);
      setSummary(payload.summary);
      persistBrowserSummary(reportId, payload.summary);
      setMessage(dictionary.workspace.savedEvidence);
    } catch {
      persistBrowserSummary(reportId, localSummary);
      setMessage(dictionary.workspace.localFallback);
    } finally {
      setIsSaving(false);
      router.refresh();
    }
  }

  async function removeEvidence() {
    setIsRemoving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/reports/${reportId}/bot-evidence`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        throw new Error("delete failed");
      }
      window.localStorage.removeItem(browserEvidenceKey(reportId));
      setSummary(null);
      setAnalysis(null);
      setMessage(dictionary.workspace.removedEvidence);
      router.refresh();
    } catch {
      setError(dictionary.workspace.errors.deleteFailed);
    } finally {
      setIsRemoving(false);
    }
  }

  async function compareSimulatorLogs() {
    if (!input.trim()) {
      simulator.setError(dictionary.logs.simulator.errors.emptyLogs);
      return;
    }
    await simulator.compareLogs(input);
  }

  return (
    <div className="space-y-6">
      <section className="workspace-surface p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="eyebrow">{dictionary.workspace.targetUrl}</p>
            <p className="mt-1 break-all font-mono text-sm">{sourceUrl}</p>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">{dictionary.workspace.importTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.workspace.importDescription}</p>
          </div>
          <label className="button-secondary cursor-pointer">
            <FileUp aria-hidden="true" className="size-4" />
            {summary ? dictionary.workspace.replaceEvidence : dictionary.actions.importLogs}
            <input type="file" accept=".log,.txt,.json,.jsonl" className="sr-only" onChange={importFile} />
          </label>
        </div>

        {fileName ? <p className="mt-4 text-sm font-medium">{interpolate(dictionary.workspace.fileReady, { name: fileName })}</p> : null}

        <details className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-4">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">
            {dictionary.workspace.pasteLogs}
          </summary>
          <label className="mt-4 block text-sm font-semibold" htmlFor="report-log-input">
            {dictionary.logs.textareaLabel}
          </label>
          <textarea
            id="report-log-input"
            value={input}
            onChange={(event) => updateInput(event.target.value)}
            className="mt-2 min-h-56 w-full rounded-lg border border-[var(--border)] bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-teal-700/10"
            spellCheck={false}
          />
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={analyzeAndSave} disabled={isSaving || !input.trim()} className="button-primary">
            <Save aria-hidden="true" className="size-4" />
            {isSaving ? dictionary.workspace.analyzing : dictionary.workspace.analyzeAndSave}
          </button>
          {summary ? (
            <button type="button" onClick={removeEvidence} disabled={isRemoving} className="button-danger">
              <Trash2 aria-hidden="true" className="size-4" />
              {isRemoving ? dictionary.workspace.removing : dictionary.workspace.removeEvidence}
            </button>
          ) : null}
        </div>
        <div aria-live="polite" className="mt-4 text-sm">
          {error ? <p className="text-[var(--red)]">{error}</p> : null}
          {message ? <p className="text-[var(--teal)]">{message}</p> : null}
        </div>
      </section>

      <section className="workspace-surface overflow-hidden">
        <div className="border-b border-[var(--border)] px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Bot aria-hidden="true" className="size-5 text-[var(--teal)]" />
                {dictionary.workspace.botEvidenceTitle}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">{dictionary.workspace.botsDescription}</p>
            </div>
            <div className="inline-flex w-fit rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-1 text-sm font-semibold">
              <button type="button" onClick={() => setActiveList("detected")} aria-pressed={activeList === "detected"} className={`segmented-control ${activeList === "detected" ? "is-active" : ""}`}>
                {dictionary.workspace.detectedBots}
              </button>
              <button type="button" onClick={() => setActiveList("registry")} aria-pressed={activeList === "registry"} className={`segmented-control ${activeList === "registry" ? "is-active" : ""}`}>
                {dictionary.workspace.registry}
              </button>
            </div>
          </div>
        </div>

        {activeList === "detected" ? (
          <DetectedEvidence dictionary={dictionary} locale={locale} summary={summary} />
        ) : (
          <div>
            <p className="border-b border-[var(--border)] px-6 py-4 text-sm text-[var(--muted)]">{dictionary.workspace.registryDescription}</p>
            <div className="divide-y divide-[var(--border)]">
              {visibleRegistry.map((row) => (
                <div key={row.ruleId} className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_160px_100px] sm:items-center">
                  <div>
                    <p className="font-semibold">{row.bot}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{row.operator} · {dictionary.logs.intentLabels[row.intent]}</p>
                  </div>
                  <p className="text-sm text-[var(--muted)]">{dictionary.logs.detectabilityLabels[row.detectability]}</p>
                  <span className={`status-chip status-${row.status}`}>{dictionary.logs.coverageStatuses[row.status]}</span>
                </div>
              ))}
            </div>
            {totalRegistryPages > 1 ? (
              <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
                <button type="button" disabled={registryPage === 1} onClick={() => setRegistryPage((page) => Math.max(1, page - 1))} className="button-secondary">
                  {dictionary.workspace.previousPage}
                </button>
                <span className="text-sm text-[var(--muted)]">{interpolate(dictionary.workspace.pageStatus, { page: registryPage, total: totalRegistryPages })}</span>
                <button type="button" disabled={registryPage === totalRegistryPages} onClick={() => setRegistryPage((page) => Math.min(totalRegistryPages, page + 1))} className="button-secondary">
                  {dictionary.workspace.nextPage}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <details className="workspace-surface p-6">
        <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">
          {dictionary.workspace.advancedSimulator}
        </summary>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.workspace.advancedSimulatorDescription}</p>
        <SimulatorPanel
          comparison={simulator.comparison}
          dictionary={dictionary}
          error={simulator.error}
          isMatching={simulator.isMatching}
          isRunning={simulator.isRunning}
          locale={locale}
          logInput={input}
          onCompare={compareSimulatorLogs}
          onRun={simulator.runSimulator}
          run={simulator.run}
          sourceUrl={sourceUrl}
        />
      </details>
    </div>
  );
}

function DetectedEvidence({
  dictionary,
  locale,
  summary
}: {
  dictionary: Dictionary;
  locale: Locale;
  summary: BotEvidenceSummary | null;
}) {
  if (!summary || summary.bots.length === 0) {
    return <p className="px-6 py-10 text-sm text-[var(--muted)]">{summary ? dictionary.workspace.noDetectedBots : dictionary.workspace.botEvidenceEmpty}</p>;
  }

  return (
    <>
      <dl className="grid gap-px border-b border-[var(--border)] bg-[var(--border)] sm:grid-cols-3">
        <EvidenceMetric label={dictionary.workspace.botsObserved} value={formatNumber(locale, summary.detectedBotCount)} />
        <EvidenceMetric label={dictionary.workspace.operatorsObserved} value={formatNumber(locale, summary.operators.length)} />
        <EvidenceMetric label={dictionary.workspace.sourceLines} value={formatNumber(locale, summary.totalLines)} />
      </dl>
      <div className="divide-y divide-[var(--border)]">
        {summary.bots.map((bot) => (
          <div key={bot.ruleId} className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_120px_220px] sm:items-center">
            <div>
              <p className="font-semibold">{bot.bot}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{bot.operator} · {dictionary.logs.intentLabels[bot.intent]}</p>
            </div>
            <p className="text-sm">{interpolate(dictionary.logs.hitCount, { count: bot.hits })}</p>
            <p className="text-sm text-[var(--muted)]">{bot.latestDate ? formatDate(locale, bot.latestDate) : "—"}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-6 py-4">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
    </div>
  );
}

function browserEvidenceKey(reportId: string) {
  return `open-geo-console:bot-evidence:${reportId}`;
}

function persistBrowserSummary(reportId: string, summary: BotEvidenceSummary) {
  window.localStorage.setItem(browserEvidenceKey(reportId), JSON.stringify(summary));
}

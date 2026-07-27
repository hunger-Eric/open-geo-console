"use client";

import { analyzeLogs } from "@open-geo-console/log-parser";
import { FileUp, RotateCcw } from "lucide-react";
import type { ChangeEvent } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { sampleCrawlerLog } from "@/data/sample-log";
import type { Dictionary, Locale } from "@/i18n";
import { useSimulator } from "@/simulator/use-simulator";
import { LogAnalysisResults } from "./log-analysis-results";
import { SimulatorPanel } from "./simulator-panel";

export function LogAnalyzer({
  dictionary,
  locale
}: {
  dictionary: Dictionary;
  locale: Locale;
}) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [input, setInput] = useState(sampleCrawlerLog);
  const deferredInput = useDeferredValue(input);
  const result = useMemo(() => analyzeLogs(deferredInput), [deferredInput]);
  const simulator = useSimulator({
    errors: dictionary.logs.simulator.errors,
    sourceUrl
  });

  function updateInput(nextInput: string) {
    setInput(nextInput);
    simulator.clearComparison();
  }

  async function handleCompareSimulatorLogs() {
    if (!input.trim()) {
      simulator.setError(dictionary.logs.simulator.errors.emptyLogs);
      return;
    }
    await simulator.compareLogs(input);
  }

  async function handleImportLogFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      updateInput(await file.text());
    } catch {
      simulator.setError(dictionary.logs.simulator.errors.importFailed);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <section className="workspace-surface p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{dictionary.logs.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              {dictionary.logs.description}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <label className="button-secondary cursor-pointer">
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
              className="button-secondary"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              {dictionary.actions.loadSample}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:max-w-2xl">
          <label className="text-sm font-semibold" htmlFor="standalone-target-url">
            {dictionary.workspace.targetUrl}
          </label>
          <input
            id="standalone-target-url"
            type="url"
            value={sourceUrl}
            placeholder={dictionary.scanner.urlPlaceholder}
            onChange={(event) => {
              setSourceUrl(event.target.value);
              simulator.clearComparison();
            }}
            className="input-control"
          />
        </div>

        <details className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--subtle)] p-4">
          <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--teal)]">
            {dictionary.workspace.advancedSimulator}
          </summary>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {dictionary.workspace.advancedSimulatorDescription}
          </p>
          <SimulatorPanel
            comparison={simulator.comparison}
            dictionary={dictionary}
            error={simulator.error}
            isMatching={simulator.isMatching}
            isRunning={simulator.isRunning}
            locale={locale}
            logInput={input}
            onCompare={handleCompareSimulatorLogs}
            onRun={simulator.runSimulator}
            run={simulator.run}
            sourceUrl={sourceUrl}
          />
        </details>

        <label className="mt-6 block text-sm font-semibold" htmlFor="log-sample">
          {dictionary.logs.textareaLabel}
        </label>
        <textarea
          id="log-sample"
          value={input}
          onChange={(event) => updateInput(event.target.value)}
          className="mt-2 min-h-[280px] w-full rounded-lg border border-[var(--border)] bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-teal-700/10"
          spellCheck={false}
        />
      </section>

      <LogAnalysisResults dictionary={dictionary} locale={locale} result={result} />
    </div>
  );
}

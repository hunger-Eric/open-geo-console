"use client";

import { analyzeLogs, recommendedNginxLogFormat } from "@open-geo-console/log-parser";
import { useMemo, useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { interpolate } from "@/i18n";
import { sampleCrawlerLog } from "@/data/sample-log";
import { formatReportNumber } from "@/report/presenter";

export function LogAnalyzer({
  dictionary,
  locale
}: {
  dictionary: Dictionary;
  locale: Locale;
}) {
  const [input, setInput] = useState(sampleCrawlerLog);
  const result = useMemo(() => analyzeLogs(input), [input]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{dictionary.logs.title}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {dictionary.logs.description}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInput(sampleCrawlerLog)}
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-slate-50"
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
          className="mt-2 min-h-[360px] w-full rounded-md border border-[var(--border)] bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-100 outline-none focus:border-[var(--teal)] focus:ring-4 focus:ring-teal-700/10"
          spellCheck={false}
        />
      </section>

      <aside className="space-y-6">
        <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{dictionary.logs.summary}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Metric label={dictionary.logs.metricLabels.lines} locale={locale} value={result.totalLines} />
            <Metric label={dictionary.logs.metricLabels.parsed} locale={locale} value={result.parsedLines} />
            <Metric label={dictionary.logs.metricLabels.aiHits} locale={locale} value={result.aiCrawlerHits} />
            <Metric label={dictionary.logs.metricLabels.groups} locale={locale} value={result.aggregates.length} />
          </dl>
          {result.missingUserAgent ? (
            <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {dictionary.logs.missingUserAgentWarning}
            </p>
          ) : null}
        </section>

        <section className="rounded-md border border-[var(--border)] bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">{dictionary.logs.crawlerGroups}</h2>
          <div className="mt-4 space-y-3">
            {result.aggregates.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{dictionary.logs.noKnownCrawlers}</p>
            ) : (
              result.aggregates.map((group) => (
                <article
                  key={`${group.operator}-${group.bot}-${group.path}-${group.status}-${group.date}`}
                  className="rounded-md border border-[var(--border)] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
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
      </aside>
    </div>
  );
}

function Metric({ label, locale, value }: { label: string; locale: Locale; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3">
      <dt className="text-xs uppercase text-[var(--muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{formatReportNumber(locale, value)}</dd>
    </div>
  );
}

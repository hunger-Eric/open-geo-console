"use client";

import { ArrowRight, KeyRound, Languages, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { interpolate, localizePath, type Dictionary, type Locale } from "@/i18n";
import { CommercialCheckout } from "./commercial-checkout";

type WaitReason = "jobs_ahead" | "active_jobs_in_pool" | "awaiting_claim";
type ActiveTier = "preview" | "deep" | "mixed";
type PublicReportState = "generating" | "completed" | "completed_limited" | "unavailable";

export interface PublicJobStatus {
  tier: "preview" | "deep";
  stage: "queued" | "discovering" | "planning" | "fetching" | "analyzing" | "synthesizing" | "completed" | "completed_limited" | "failed";
  state: PublicReportState;
  progress: number;
  plannedPages: number;
  successfulPages: number;
  failedPages: number;
  refundState: "reserved" | "settled" | "refunded" | null;
  queuePosition: number | null;
  waitReason: WaitReason | null;
  activeTier: ActiveTier | null;
}

interface StatusPayload {
  job: PublicJobStatus | null;
  hasAiReport: boolean;
  hasTechnicalReport: boolean;
  technicalStatus: "pending" | "processing" | "completed" | "failed";
  technicalErrorCode: string | null;
  technicalPublicError: string | null;
  hasDeepAccess: boolean;
  reportLocale: Locale | null;
  aiReportLocale: Locale | null;
  localeCorrectionAvailable: boolean;
  localeCorrectionInProgress: boolean;
}

export function AiReportStatus({
  dictionary,
  hasTechnicalReport = true,
  reportId,
  reportLocale,
  showCommerce = true
}: {
  dictionary: Dictionary;
  hasTechnicalReport?: boolean;
  reportId: string;
  reportLocale: Locale;
  showCommerce?: boolean;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const refreshedTerminalReport = useRef(false);
  const refreshedTechnicalReport = useRef(hasTechnicalReport);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/reports/${reportId}/status`, {
      cache: "no-store",
      signal
    });
    if (!response.ok) return null;
    const next = (await response.json()) as StatusPayload;
    if (next.hasTechnicalReport && !refreshedTechnicalReport.current) {
      refreshedTechnicalReport.current = true;
      router.refresh();
    }
    const terminalWithReport = next.job?.state !== "generating" && next.hasAiReport;
    setPayload(next);
    if (terminalWithReport && !refreshedTerminalReport.current) {
      refreshedTerminalReport.current = true;
      router.refresh();
    }
    return next;
  }, [reportId, router]);

  useEffect(() => {
    refreshedTerminalReport.current = false;
    refreshedTechnicalReport.current = hasTechnicalReport;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadStatus(controller.signal).catch(() => undefined);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasTechnicalReport, loadStatus]);

  const isGenerating = payload?.job?.state === "generating";
  useEffect(() => {
    if (!isGenerating) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadStatus(controller.signal).catch(() => undefined);
    }, payload?.job?.waitReason ? 5000 : 2500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [isGenerating, loadStatus, payload?.job?.waitReason]);

  async function unlockDeepReport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accessKey.trim()) return;
    setError(null);
    setIsUnlocking(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/upgrade`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto.randomUUID()
        },
        body: JSON.stringify({ accessKey: accessKey.trim(), locale: reportLocale })
      });
      const result = (await response.json()) as { error?: string; accessUrl?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to unlock the report.");
      setAccessKey("");
      if (result.accessUrl) {
        window.location.assign(result.accessUrl);
        return;
      }
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to unlock the report.");
    } finally {
      setIsUnlocking(false);
    }
  }

  async function correctReportLanguage() {
    setError(null);
    setIsCorrecting(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/locale-correction`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to regenerate the report language.");
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to regenerate the report language.");
    } finally {
      setIsCorrecting(false);
    }
  }

  const job = payload?.job ?? null;
  const progress = Math.max(0, Math.min(99, job?.progress ?? 0));
  const queueDescription = job ? getQueueDescription(job, dictionary) : null;
  const statusDescription = payload
    ? getStatusDescription(payload, dictionary, queueDescription)
    : hasTechnicalReport
      ? dictionary.aiReport.waitingDescription
      : dictionary.aiReport.acceptedDescription;
  const statusId = `ai-report-status-${reportId}`;
  const languageName = reportLocale === "zh"
    ? dictionary.aiReport.reportLanguageChinese
    : dictionary.aiReport.reportLanguageEnglish;

  return (
    <section
      className="workspace-surface p-6 sm:p-8"
      aria-busy={Boolean(isGenerating || isUnlocking || isCorrecting)}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[var(--teal)]">
            <Sparkles aria-hidden="true" className="size-5" />
            <h2 className="text-xl font-semibold">{dictionary.aiReport.statusTitle}</h2>
          </div>
          <p
            id={statusId}
            className="mt-2 text-sm leading-6 text-[var(--muted)]"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusDescription}
          </p>
        </div>
        <span className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--muted)]">
          {job?.tier === "deep" ? dictionary.aiReport.deepLabel : dictionary.aiReport.previewLabel}
        </span>
      </div>

      {isGenerating ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold">{dictionary.aiReport.waitingDescription}</span>
            <span className="text-[var(--muted)]" aria-hidden="true">{progress}%</span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--subtle)]"
            role="progressbar"
            aria-describedby={statusId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={interpolate(dictionary.aiReport.progressValue, { progress })}
          >
            <div
              className="h-full rounded-full bg-[var(--teal)] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {job?.state === "unavailable" ? (
        <Link href={localizePath(reportLocale, "/")} className="button-secondary mt-5">
          <ArrowRight aria-hidden="true" className="size-4" />
          {dictionary.aiReport.startNewAnalysis}
        </Link>
      ) : null}

      {payload?.localeCorrectionAvailable ? (
        <button
          type="button"
          className="button-secondary mt-5"
          disabled={isCorrecting}
          onClick={() => void correctReportLanguage()}
        >
          {isCorrecting ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <Languages aria-hidden="true" className="size-4" />}
          {interpolate(dictionary.aiReport.regenerateLanguage, { language: languageName })}
        </button>
      ) : null}

      {showCommerce && !payload?.hasDeepAccess ? (
        <div className="mt-7 border-t border-[var(--border)] pt-6">
          <CommercialCheckout dictionary={dictionary} locale={reportLocale} reportId={reportId} />
          <details className="mt-5">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--muted)]">{dictionary.commerce.operatorKeySummary}</summary>
        <form onSubmit={unlockDeepReport} className="mt-4">
          <div className="max-w-2xl">
            <h3 className="text-lg font-semibold">{dictionary.aiReport.unlockTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.aiReport.unlockDescription}</p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor={`access-key-${reportId}`}>{dictionary.aiReport.accessKeyLabel}</label>
            <input
              id={`access-key-${reportId}`}
              className="input-control min-h-12 min-w-0 flex-1 font-mono"
              type="password"
              autoComplete="off"
              value={accessKey}
              onChange={(event) => setAccessKey(event.target.value)}
              placeholder={dictionary.aiReport.accessKeyLabel}
            />
            <button type="submit" className="button-primary min-h-12" disabled={isUnlocking || !accessKey.trim()}>
              {isUnlocking ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <KeyRound aria-hidden="true" className="size-4" />}
              {isUnlocking ? dictionary.aiReport.unlocking : dictionary.aiReport.unlockAction}
            </button>
          </div>
        </form>
          </details>
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-[var(--red)]" role="alert">{error}</p> : null}
    </section>
  );
}

function getStatusDescription(
  payload: StatusPayload | null,
  dictionary: Dictionary,
  queueDescription: string | null
): string {
  if (payload?.technicalStatus === "failed") {
    return payload.technicalPublicError ?? dictionary.aiReport.technicalFailedDescription;
  }
  if (payload?.localeCorrectionInProgress) return dictionary.aiReport.correctionInProgress;
  const job = payload?.job;
  if (!job) {
    return payload && !payload.hasTechnicalReport
      ? dictionary.aiReport.acceptedDescription
      : dictionary.aiReport.unavailableDescription;
  }
  if (job.state === "completed") {
    return interpolate(dictionary.aiReport.completedDescription, { count: job.successfulPages });
  }
  if (job.state === "completed_limited") {
    return interpolate(dictionary.aiReport.completedLimitedDescription, {
      count: job.successfulPages,
      failed: job.failedPages
    });
  }
  if (job.state === "unavailable") {
    return job.tier === "preview" && payload.hasTechnicalReport && job.refundState === null
      ? dictionary.aiReport.unavailableDescription
      : dictionary.aiReport.failedDescription;
  }
  return queueDescription ?? dictionary.aiReport.stageDescriptions[job.stage];
}

export function getQueueDescription(job: PublicJobStatus, dictionary: Dictionary): string | null {
  if (job.state !== "generating" || job.waitReason === null) return null;
  const messages: string[] = [];
  if (job.queuePosition !== null) {
    messages.push(interpolate(dictionary.aiReport.queuePosition, { position: job.queuePosition }));
  }
  if (job.waitReason === "jobs_ahead") {
    messages.push(interpolate(dictionary.aiReport.queueJobsAhead, {
      count: Math.max(0, (job.queuePosition ?? 1) - 1)
    }));
  } else if (job.waitReason === "active_jobs_in_pool") {
    messages.push(dictionary.aiReport.queueActiveJobsInPool);
  } else {
    messages.push(dictionary.aiReport.queueAwaitingClaim);
  }
  if (job.activeTier === "preview") messages.push(dictionary.aiReport.activeTierPreview);
  if (job.activeTier === "deep") messages.push(dictionary.aiReport.activeTierDeep);
  if (job.activeTier === "mixed") messages.push(dictionary.aiReport.activeTierMixed);
  return messages.join(" ");
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { interpolate, type Dictionary } from "@/i18n";

type JobStage = keyof Dictionary["aiReport"]["stages"];
type WaitReason = "jobs_ahead" | "active_jobs_in_pool" | "awaiting_claim";
type ActiveTier = "preview" | "deep" | "mixed";

export interface PublicJobStatus {
  id: string;
  tier: "preview" | "deep";
  stage: JobStage;
  status: "queued" | "running" | "completed" | "partial" | "failed";
  progress: number;
  errorCode?: string | null;
  publicError?: string | null;
  queuePosition: number | null;
  waitReason: WaitReason | null;
  activeTier: ActiveTier | null;
}

interface StatusPayload {
  job: PublicJobStatus | null;
  hasAiReport: boolean;
  hasDeepAccess: boolean;
}

const ACTIVE_STAGES = new Set<JobStage>([
  "queued",
  "discovering",
  "planning",
  "fetching",
  "analyzing",
  "synthesizing"
]);

export function AiReportStatus({
  dictionary,
  reportId
}: {
  dictionary: Dictionary;
  reportId: string;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const refreshedCompletedReport = useRef(false);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/reports/${reportId}/status`, {
      cache: "no-store",
      signal
    });
    if (!response.ok) return null;
    const next = (await response.json()) as StatusPayload;
    const nextStage = next.job?.stage ?? null;
    const shouldRefresh = nextStage === "completed"
      && next.hasAiReport
      && !refreshedCompletedReport.current;
    setPayload(next);
    if (shouldRefresh) {
      refreshedCompletedReport.current = true;
      router.refresh();
    }
    return next;
  }, [reportId, router]);

  useEffect(() => {
    refreshedCompletedReport.current = false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadStatus(controller.signal).catch(() => undefined);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadStatus]);

  const shouldPoll = payload?.job ? ACTIVE_STAGES.has(payload.job.stage) : false;
  useEffect(() => {
    if (!shouldPoll) return;
    const controller = new AbortController();
    const delay = payload?.job?.stage === "queued" ? 5000 : 2500;
    const timer = window.setTimeout(() => {
      void loadStatus(controller.signal).catch(() => undefined);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadStatus, payload, shouldPoll]);

  const progress = useMemo(
    () => Math.max(0, Math.min(100, payload?.job?.progress ?? 0)),
    [payload?.job?.progress]
  );

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
        body: JSON.stringify({ accessKey: accessKey.trim() })
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

  async function retry() {
    setError(null);
    setIsRetrying(true);
    try {
      const response = await fetch(`/api/reports/${reportId}/retry`, { method: "POST" });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Unable to retry the report.");
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to retry the report.");
    } finally {
      setIsRetrying(false);
    }
  }

  const stage = payload?.job?.stage ?? "queued";
  const isFailed = stage === "failed" || stage === "partial";
  const isBusy = Boolean(payload?.job && ACTIVE_STAGES.has(stage)) || isUnlocking || isRetrying;
  const publicError = payload?.job?.publicError === "AI analysis is not configured on this deployment."
    ? dictionary.aiReport.unavailableDescription
    : payload?.job?.publicError;
  const queueDescription = payload?.job ? getQueueDescription(payload.job, dictionary) : null;
  const statusDescription = stage === "completed"
    ? dictionary.aiReport.completedDescription
    : stage === "partial"
      ? dictionary.aiReport.partialDescription
      : isFailed && publicError
        ? publicError
        : queueDescription
          ? queueDescription
          : payload?.job
            ? dictionary.aiReport.waitingDescription
          : dictionary.aiReport.unavailableDescription;
  const statusId = `ai-report-status-${reportId}`;
  const progressValue = interpolate(dictionary.aiReport.progressValue, {
    stage: dictionary.aiReport.stages[stage],
    progress
  });

  return (
    <section className="workspace-surface p-6 sm:p-8" aria-busy={isBusy}>
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
          {payload?.job?.tier === "deep" ? dictionary.aiReport.deepLabel : dictionary.aiReport.previewLabel}
        </span>
      </div>

      {payload?.job ? (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-semibold">{dictionary.aiReport.stages[stage]}</span>
            <span className="text-[var(--muted)]" aria-hidden="true">{progress}%</span>
          </div>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--subtle)]"
            role="progressbar"
            aria-describedby={statusId}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={progressValue}
          >
            <div
              className="h-full rounded-full bg-[var(--teal)] transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {isFailed ? (
        <button
          type="button"
          className="button-secondary mt-5"
          disabled={isRetrying}
          onClick={() => void retry()}
        >
          {isRetrying ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : <RefreshCw aria-hidden="true" className="size-4" />}
          {dictionary.aiReport.retryAction}
        </button>
      ) : null}

      {!payload?.hasDeepAccess ? (
        <form onSubmit={unlockDeepReport} className="mt-7 border-t border-[var(--border)] pt-6">
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
      ) : null}

      {error ? <p className="mt-4 text-sm text-[var(--red)]" role="alert">{error}</p> : null}
    </section>
  );
}

export function getQueueDescription(job: PublicJobStatus, dictionary: Dictionary): string | null {
  if (job.stage !== "queued" || job.waitReason === null) return null;
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

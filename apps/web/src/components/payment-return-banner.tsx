"use client";

import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dictionary } from "@/i18n";
import { getProgressStageDescription } from "./ai-report-status-copy";
import { attemptPaymentCompletionHandoff, fetchPaymentReturnStatus, getPaymentReturnContext, getPaymentReturnView, isTerminalPaymentReturn, paymentPollDelay, type PublicOrderStatus } from "./payment-return";

export function PaymentReturnBanner({ dictionary, reportId }: { dictionary: Dictionary; reportId: string }) {
  const searchParams = useSearchParams();
  const context = useMemo(() => getPaymentReturnContext(searchParams), [searchParams]);
  const [status, setStatus] = useState<PublicOrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const accessAttemptedFor = useRef<string | null>(null);

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    if (!context) return null;
    setLoading(true);
    try {
      const response = await fetchPaymentReturnStatus(
        `/api/reports/${encodeURIComponent(reportId)}/orders/${encodeURIComponent(context.orderId)}/status`,
        { signal }
      );
      if (!response.ok) {
        setUnavailable(true);
        return null;
      }
      const next = await response.json() as PublicOrderStatus;
      setStatus(next);
      setUnavailable(false);
      const expectedDestination = `/reports/${encodeURIComponent(reportId)}/report.html`;
      await attemptPaymentCompletionHandoff({
        status: next,
        orderId: context.orderId,
        attemptedFor: accessAttemptedFor.current,
        completionUrl: `/api/reports/${encodeURIComponent(reportId)}/orders/${encodeURIComponent(context.orderId)}/completion-access`,
        expectedDestination,
        markAttempted: (orderId) => { accessAttemptedFor.current = orderId; },
        navigate: (destination) => window.location.replace(destination),
        signal
      });
      return next;
    } catch {
      if (!signal?.aborted) setUnavailable(true);
      return null;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [context, reportId]);

  useEffect(() => {
    if (!context) return;
    const controller = new AbortController();
    let attempt = 0;
    let timer: number | undefined;

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        timer = undefined;
        void poll();
      }, delay);
    };
    const poll = async () => {
      if (document.hidden) {
        return;
      }
      const next = await loadStatus(controller.signal);
      if (controller.signal.aborted || (next && isTerminalPaymentReturn(next))) return;
      attempt += 1;
      schedule(paymentPollDelay(attempt));
    };
    const resume = () => {
      if (!document.hidden && timer === undefined) schedule(0);
    };

    schedule(0);
    document.addEventListener("visibilitychange", resume);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [context, loadStatus]);

  if (!context) return null;
  const view = getPaymentReturnView(status, context.hint, dictionary);
  const Icon = view.kind === "success" ? CircleCheck : view.kind === "warning" ? CircleAlert : Loader2;
  const activeProgress = status?.progress
    && !["queued", "completed", "completed_limited", "failed"].includes(status.progress.stage)
    ? status.progress
    : null;
  const progress = activeProgress ? Math.max(0, Math.min(99, activeProgress.progress)) : 0;

  return (
    <section className="workspace-surface mt-6 p-5 sm:p-6" aria-busy={loading} aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${view.kind === "pending" ? "animate-spin text-[var(--teal)]" : view.kind === "success" ? "text-[var(--teal)]" : "text-[var(--red)]"}`} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{dictionary.commerce.paymentReturnTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            {unavailable ? dictionary.commerce.paymentStatusUnavailable : view.message}
          </p>
          {activeProgress ? (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-[var(--muted)]">
                <span>{getProgressStageDescription(activeProgress.stage, dictionary)}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--subtle)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-full rounded-full bg-[var(--teal)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

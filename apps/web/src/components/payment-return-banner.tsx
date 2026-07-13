"use client";

import { CircleAlert, CircleCheck, Loader2, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dictionary } from "@/i18n";
import { fetchPaymentReturnStatus, getPaymentReturnView, isTerminalPaymentReturn, type PublicOrderStatus, type ReturnHint } from "./payment-return";

interface ReturnContext { orderId: string; hint: ReturnHint }

export function PaymentReturnBanner({ dictionary, reportId }: { dictionary: Dictionary; reportId: string }) {
  const searchParams = useSearchParams();
  const context = useMemo<ReturnContext | null>(() => {
    const orderId = searchParams.get("order") ?? "";
    const hint = searchParams.get("payment_return");
    return /^[a-zA-Z0-9_-]{1,128}$/.test(orderId) && (hint === "success" || hint === "cancel")
      ? { orderId, hint }
      : null;
  }, [searchParams]);
  const [status, setStatus] = useState<PublicOrderStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [pollingStopped, setPollingStopped] = useState(false);

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
    const startedAt = Date.now();
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
        schedule(1_000);
        return;
      }
      const next = await loadStatus(controller.signal);
      if (controller.signal.aborted || (next && isTerminalPaymentReturn(next))) return;
      if (Date.now() - startedAt >= 120_000) {
        setPollingStopped(true);
        return;
      }
      attempt += 1;
      schedule(Math.min(1_000 * 2 ** Math.min(attempt, 4), 15_000));
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
  const progress = status?.progress && !["queued", "completed", "completed_limited", "failed"].includes(status.progress.stage)
    ? Math.max(0, Math.min(99, status.progress.progress))
    : null;

  return (
    <section className="workspace-surface mt-6 p-5 sm:p-6" aria-busy={loading} aria-live="polite">
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${view.kind === "pending" ? "animate-spin text-[var(--teal)]" : view.kind === "success" ? "text-[var(--teal)]" : "text-[var(--red)]"}`} />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{dictionary.commerce.paymentReturnTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            {unavailable ? dictionary.commerce.paymentStatusUnavailable : view.message}
          </p>
          {pollingStopped ? <p className="mt-2 text-xs text-[var(--muted)]">{dictionary.commerce.paymentRefreshStopped}</p> : null}
          {progress !== null ? (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-[var(--muted)]">
                <span>{dictionary.commerce.paymentGenerating}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--subtle)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-full rounded-full bg-[var(--teal)] transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="button-secondary min-h-10 shrink-0"
          disabled={loading}
          onClick={() => {
            setPollingStopped(false);
            void loadStatus();
          }}
        >
          <RefreshCw aria-hidden="true" className={`size-4 ${loading ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{dictionary.commerce.paymentRefresh}</span>
        </button>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";
import { getScanProgressStage } from "./scanner-progress";

export function ScannerForm({
  dictionary,
  locale,
  turnstileSiteKey,
  allowForceFresh = false
}: {
  dictionary: Dictionary;
  locale: Locale;
  turnstileSiteKey?: string;
  allowForceFresh?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [forceFresh, setForceFresh] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const pendingSubmission = useRef(false);
  const idempotencyKey = useRef("");

  useEffect(() => {
    if (!isSubmitting) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1_000);
    return () => window.clearInterval(timer);
  }, [isSubmitting]);

  function submitScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isVerifying) return;
    setError(null);
    setElapsedMs(0);
    if (turnstileSiteKey && !turnstileToken) {
      pendingSubmission.current = true;
      setIsVerifying(true);
      turnstileRef.current?.execute();
      return;
    }
    void submitAcceptedScan(turnstileToken);
  }

  async function submitAcceptedScan(token: string) {
    setIsVerifying(false);
    setIsSubmitting(true);
    idempotencyKey.current ||= globalThis.crypto.randomUUID();
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey.current
        },
        body: JSON.stringify({
          url,
          locale,
          turnstileToken: token,
          ...(allowForceFresh && forceFresh ? { forceFresh: true } : {})
        })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        reportId?: string;
        id?: string;
        error?: string;
        errorKey?: keyof Dictionary["errors"];
      };
      const reportId = payload.reportId ?? payload.id;

      if (!response.ok || !reportId) {
        setError(payload.errorKey ? dictionary.errors[payload.errorKey] : (payload.error ?? dictionary.errors.scanFailed));
        setIsSubmitting(false);
        setTurnstileToken("");
        turnstileRef.current?.reset();
        return;
      }

      window.location.assign(localizePath(locale, `/reports/${reportId}`));
    } catch {
      setError(dictionary.errors.scanFailed);
      setIsSubmitting(false);
      setTurnstileToken("");
      turnstileRef.current?.reset();
    }
  }

  function receiveTurnstileToken(token: string) {
    setTurnstileToken(token);
    if (!token || !pendingSubmission.current) return;
    pendingSubmission.current = false;
    void submitAcceptedScan(token);
  }

  function failTurnstile() {
    pendingSubmission.current = false;
    setIsVerifying(false);
    setError(dictionary.errors.humanVerificationRequired);
  }

  const progressStage = getScanProgressStage(elapsedMs);
  const progressMessage = progressStage === "extended"
    ? dictionary.scanner.scanProgressExtended
    : progressStage === "slow"
      ? dictionary.scanner.scanProgressSlow
      : dictionary.scanner.scanProgressStarting;

  return (
    <form onSubmit={submitScan} className="space-y-3" aria-busy={isSubmitting || isVerifying}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          disabled={isSubmitting || isVerifying}
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            idempotencyKey.current = "";
          }}
          aria-label={dictionary.scanner.urlLabel}
          className="input-control min-h-12 min-w-0 flex-1 text-base"
          placeholder={dictionary.scanner.urlPlaceholder}
        />
        <button
          type="submit"
          disabled={isSubmitting || isVerifying || !url.trim()}
          className="button-primary min-h-12 shrink-0 px-5"
        >
          {isSubmitting || isVerifying ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {isVerifying
            ? dictionary.scanner.verifyingHuman
            : isSubmitting
              ? dictionary.scanner.acceptingReport
              : dictionary.actions.generateReport}
        </button>
      </div>
      {allowForceFresh ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
          <input
            type="checkbox"
            checked={forceFresh}
            onChange={(event) => setForceFresh(event.target.checked)}
            className="mt-1 size-4 accent-[var(--teal)]"
          />
          <span>
            <span className="block text-sm font-medium">{dictionary.scanner.forceFreshLabel}</span>
            <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{dictionary.scanner.forceFreshDescription}</span>
          </span>
        </label>
      ) : null}
      <div aria-live="polite">
        {isSubmitting ? (
          <p role="status" className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
            {progressMessage}
          </p>
        ) : null}
        {error ? <p className="text-sm text-[var(--red)]">{error}</p> : null}
      </div>
      {turnstileSiteKey ? (
        <TurnstileWidget
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          onToken={receiveTurnstileToken}
          onError={failTurnstile}
        />
      ) : null}
    </form>
  );
}

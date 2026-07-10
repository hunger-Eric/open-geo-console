"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import { TurnstileWidget } from "./turnstile-widget";

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
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [forceFresh, setForceFresh] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submitScan(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url,
          locale,
          turnstileToken,
          ...(allowForceFresh && forceFresh ? { forceFresh: true } : {})
        })
      });
      const payload = (await response.json()) as {
        reportId?: string;
        id?: string;
        error?: string;
        errorKey?: keyof Dictionary["errors"];
      };
      const reportId = payload.reportId ?? payload.id;

      if (!response.ok || !reportId) {
        setError(payload.errorKey ? dictionary.errors[payload.errorKey] : (payload.error ?? dictionary.errors.scanFailed));
        return;
      }

      router.push(localizePath(locale, `/reports/${reportId}`));
    });
  }

  return (
    <form onSubmit={submitScan} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="url"
          required
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label={dictionary.scanner.urlLabel}
          className="input-control min-h-12 min-w-0 flex-1 text-base"
          placeholder={dictionary.scanner.urlPlaceholder}
        />
        <button
          type="submit"
          disabled={isPending || Boolean(turnstileSiteKey && !turnstileToken)}
          className="button-primary min-h-12 shrink-0 px-5"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {dictionary.actions.generateReport}
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
      <div aria-live="polite">{error ? <p className="text-sm text-[var(--red)]">{error}</p> : null}</div>
      {turnstileSiteKey ? <TurnstileWidget siteKey={turnstileSiteKey} onToken={setTurnstileToken} /> : null}
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";

export function ScannerForm({
  dictionary,
  locale
}: {
  dictionary: Dictionary;
  locale: Locale;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(dictionary.scanner.firstCaseUrl);
  const [error, setError] = useState<string | null>(null);
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
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as {
        id?: string;
        error?: string;
        errorKey?: keyof Dictionary["errors"];
      };

      if (!response.ok || !payload.id) {
        setError(payload.errorKey ? dictionary.errors[payload.errorKey] : (payload.error ?? dictionary.errors.scanFailed));
        return;
      }

      router.push(localizePath(locale, `/reports/${payload.id}`));
    });
  }

  return (
    <form onSubmit={submitScan} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-label={dictionary.scanner.urlLabel}
          className="min-h-12 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-4 text-base text-[var(--foreground)] shadow-sm outline-none transition focus:border-[var(--teal)] focus:ring-4 focus:ring-teal-700/10"
          placeholder={dictionary.scanner.urlPlaceholder}
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--foreground)] px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {dictionary.actions.generateReport}
        </button>
      </div>
      {error ? <p className="text-sm text-[var(--red)]">{error}</p> : null}
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
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
        report?: GeoAuditReport;
        error?: string;
        errorKey?: keyof Dictionary["errors"];
      };

      if (!response.ok || !payload.id) {
        setError(payload.errorKey ? dictionary.errors[payload.errorKey] : (payload.error ?? dictionary.errors.scanFailed));
        return;
      }

      if (payload.report) {
        window.localStorage.setItem(`open-geo-console:report:${payload.id}`, JSON.stringify(payload.report));
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
          className="input-control min-h-12 min-w-0 flex-1 text-base"
          placeholder={dictionary.scanner.urlPlaceholder}
        />
        <button
          type="submit"
          disabled={isPending}
          className="button-primary min-h-12 shrink-0 px-5"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {dictionary.actions.generateReport}
        </button>
      </div>
      <div aria-live="polite">{error ? <p className="text-sm text-[var(--red)]">{error}</p> : null}</div>
    </form>
  );
}

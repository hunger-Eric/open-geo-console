"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dictionary, Locale } from "@/i18n";
import { localizePath } from "@/i18n";
import { reportActions } from "@/product/config";

export function ReportActions({
  dictionary,
  locale
}: {
  dictionary: Dictionary;
  locale: Locale;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {reportActions.map((action) => {
        const Icon = action.icon;
        if (action.action === "logs") {
          return (
            <Link
              key={action.key}
              href={localizePath(locale, "/logs")}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
            >
              <Icon className="size-4" />
              {dictionary.actions[action.key]}
            </Link>
          );
        }

        return (
          <button
            key={action.key}
            type="button"
            onClick={action.action === "copy" ? copyLink : () => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            <Icon className="size-4" />
            {action.action === "copy" && copied ? dictionary.actions.copiedLink : dictionary.actions[action.key]}
          </button>
        );
      })}
    </div>
  );
}

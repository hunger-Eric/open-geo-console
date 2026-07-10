"use client";

import { Printer, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Dictionary } from "@/i18n";

export function ReportActions({
  dictionary,
  printEnabled,
  printHref,
  shareHref
}: {
  dictionary: Dictionary;
  printEnabled: boolean;
  printHref: string;
  shareHref: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(new URL(shareHref, window.location.origin).href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <button type="button" onClick={copyLink} className="button-secondary">
        <Share2 aria-hidden="true" className="size-4" />
        {copied ? dictionary.actions.copiedLink : dictionary.actions.copyLink}
      </button>
      {printEnabled ? (
        <Link href={printHref} className="button-secondary">
          <Printer aria-hidden="true" className="size-4" />
          {dictionary.actions.printReport}
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className="button-secondary cursor-not-allowed opacity-60"
          title={dictionary.aiReport.printLockedDescription}
        >
          <Printer aria-hidden="true" className="size-4" />
          {dictionary.actions.printReport}
        </span>
      )}
    </div>
  );
}

"use client";

import { Printer, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Dictionary } from "@/i18n";

export function ReportActions({
  dictionary,
  printHref,
  shareHref
}: {
  dictionary: Dictionary;
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
      <Link href={printHref} className="button-secondary">
        <Printer aria-hidden="true" className="size-4" />
        {dictionary.actions.printReport}
      </Link>
    </div>
  );
}

"use client";

import { Download, FileText, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Dictionary } from "@/i18n";

export function ReportActions({
  dictionary,
  printEnabled,
  htmlHref,
  pdfHref,
  shareHref
}: {
  dictionary: Dictionary;
  printEnabled: boolean;
  htmlHref: string;
  pdfHref: string;
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
        <>
          <Link href={htmlHref} className="button-secondary">
            <FileText aria-hidden="true" className="size-4" />
            HTML
          </Link>
          <Link href={pdfHref} className="button-secondary">
            <Download aria-hidden="true" className="size-4" />
            PDF
          </Link>
        </>
      ) : (
        <span
          aria-disabled="true"
          className="button-secondary cursor-not-allowed opacity-60"
          title={dictionary.aiReport.printLockedDescription}
        >
          <FileText aria-hidden="true" className="size-4" />
          {dictionary.actions.printReport}
        </span>
      )}
    </div>
  );
}

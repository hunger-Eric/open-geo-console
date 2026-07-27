"use client";

import { FileText, Share2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Dictionary } from "@/i18n";

export function ReportActions({
  dictionary,
  htmlEnabled,
  htmlHref,
  shareHref
}: {
  dictionary: Dictionary;
  htmlEnabled: boolean;
  htmlHref: string;
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
      {htmlEnabled ? <Link href={htmlHref} className="button-secondary">
          <FileText aria-hidden="true" className="size-4" />
          HTML
        </Link> : null}
    </div>
  );
}

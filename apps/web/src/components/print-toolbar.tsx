"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/i18n";

export function PrintToolbar({ backHref, dictionary }: { backHref: string; dictionary: Dictionary }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
      <Link href={backHref} className="button-secondary"><ArrowLeft className="size-4" />{dictionary.workspace.backToReport}</Link>
      <button type="button" className="button-primary" onClick={() => window.print()}><Printer className="size-4" />{dictionary.actions.printReport}</button>
    </div>
  );
}

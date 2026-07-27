import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/i18n";
import { interpolate } from "@/i18n";

export function WorkspacePagination({
  baseHref,
  dictionary,
  page,
  totalPages
}: {
  baseHref: string;
  dictionary: Dictionary;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label={dictionary.workspace.pageStatus} className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4">
      {page > 1 ? (
        <Link href={`${baseHref}?page=${page - 1}`} className="button-secondary">
          <ChevronLeft aria-hidden="true" className="size-4" />
          {dictionary.workspace.previousPage}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-[var(--muted)]">
        {interpolate(dictionary.workspace.pageStatus, { page, total: totalPages })}
      </span>
      {page < totalPages ? (
        <Link href={`${baseHref}?page=${page + 1}`} className="button-secondary">
          {dictionary.workspace.nextPage}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

import { AlertTriangle, ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/i18n";
import type { RecentReportResume } from "@/server/recent-report-resume";

export function RecentReportResumeCard({
  dictionary,
  href,
  resume
}: {
  dictionary: Dictionary;
  href: string;
  resume: RecentReportResume;
}) {
  const failed = resume.state === "failed";
  const copy = dictionary.scanner.recentTask;
  const Icon = failed ? AlertTriangle : Clock3;
  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 sm:p-5" aria-labelledby="recent-report-title">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[var(--teal)] shadow-sm">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{failed ? copy.failedLabel : copy.generatingLabel}</p>
          <h2 id="recent-report-title" className="mt-1 text-base font-semibold">
            {failed ? copy.failedTitle : copy.generatingTitle}
          </h2>
          <p className="mt-1 break-all text-sm font-medium text-[var(--foreground)]">{resume.domain}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            {failed ? copy.failedDescription : copy.generatingDescription}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href={href} className="button-primary min-h-11">
              {failed ? copy.failedAction : copy.generatingAction}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a href="#website-scanner" className="button-secondary min-h-11">
              {copy.scanAnotherAction}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

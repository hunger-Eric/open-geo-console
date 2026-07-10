import { FileSearch, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScannerForm } from "@/components/scanner-form";
import { getDictionary, isLocale, localizePath, type Locale } from "@/i18n";
import { scannerCapabilities } from "@/product/config";
import { isProtectedStagingPreview } from "@/security/deployment-policy";

export const dynamic = "force-dynamic";

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const locale: Locale = rawLocale;
  const dictionary = getDictionary(locale);
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 sm:py-12">
      <section className="workspace-surface p-6 sm:p-9">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-[var(--teal)]">
            <FileSearch aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Open GEO Console</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{dictionary.scanner.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">{dictionary.scanner.description}</p>
          </div>
        </div>
        <div className="mt-8">
          <ScannerForm
            locale={locale}
            dictionary={dictionary}
            turnstileSiteKey={process.env.TURNSTILE_SITE_KEY?.trim()}
            allowForceFresh={isProtectedStagingPreview()}
          />
        </div>

        <div className="mt-8 grid border-t border-[var(--border)] md:grid-cols-3 md:divide-x md:divide-[var(--border)]">
          {scannerCapabilities.map((capability) => {
            const Icon = capability.icon;
            const copy = dictionary.capabilities[capability.key];
            return (
              <article key={capability.key} className="border-b border-[var(--border)] py-5 md:border-b-0 md:px-5 md:first:pl-0 md:last:pr-0">
                <Icon aria-hidden="true" className="size-5 text-[var(--teal)]" />
                <h2 className="mt-3 text-sm font-semibold">{copy.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{copy.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="workspace-surface p-6 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div>
          <Upload aria-hidden="true" className="size-5 text-[var(--teal)]" />
          <h2 className="mt-3 text-lg font-semibold">{dictionary.nav.logs}</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{dictionary.scanner.nextDescription}</p>
        </div>
          <Link href={localizePath(locale, "/logs")} className="button-secondary mt-5 shrink-0 sm:mt-0">
            {dictionary.actions.openSampleLogReport}
          </Link>
      </aside>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { languageActions, navItems } from "@/product/config";
import { localizePath, switchLocalePath, type Dictionary, type Locale } from "@/i18n";

export function AppHeader({
  locale,
  dictionary
}: {
  locale: Locale;
  dictionary: Dictionary;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--border)] bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <Link href={localizePath(locale, "/")} className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-[var(--foreground)] text-sm font-bold text-white">
            OG
          </span>
          <span>
            <span className="block whitespace-nowrap text-sm font-semibold leading-4">
              {dictionary.metadata.title}
            </span>
            <span className="hidden text-xs text-[var(--muted)] sm:block">
              {dictionary.metadata.description}
            </span>
          </span>
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
          <nav className="flex items-center gap-2 text-sm text-[var(--muted)]">
            {navItems.map((item) =>
              item.external ? (
                <a
                  key={item.key}
                  className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-[var(--foreground)]"
                  href={item.href}
                >
                  {dictionary.nav[item.key]}
                </a>
              ) : (
                <Link
                  key={item.key}
                  className="rounded-md px-3 py-2 hover:bg-slate-100 hover:text-[var(--foreground)]"
                  href={localizePath(locale, item.href)}
                >
                  {dictionary.nav[item.key]}
                </Link>
              )
            )}
          </nav>
          <div className="flex rounded-md border border-[var(--border)] bg-white p-1 text-xs font-semibold">
            {languageActions.map((action) => {
              const Icon = action.icon;
              const active = action.locale === locale;
              return (
                <Link
                  key={action.locale}
                  href={switchLocalePath(pathname, action.locale)}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1.5 ${
                    active
                      ? "bg-[var(--foreground)] text-white"
                      : "text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)]"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-3.5" />
                  {dictionary.actions[action.labelKey]}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}

import { defaultLocale, isLocale, type Locale } from "./locales";

export type LocaleRoutingAction =
  | { kind: "next" }
  | { kind: "redirect"; pathname: string }
  | { kind: "rewrite"; locale: Locale; pathname: string };

const NON_LOCALIZED_PREFIXES = ["/api", "/_next"];
const PUBLIC_FILE_PATTERN = /\/[^/]+\.[^/]+$/;

function splitHref(href: string): { hash: string; pathname: string; query: string } {
  const [beforeHash = "", hash = ""] = href.split("#", 2);
  const [pathname = "", query = ""] = beforeHash.split("?", 2);

  return {
    hash: hash ? `#${hash}` : "",
    pathname: pathname || "/",
    query: query ? `?${query}` : ""
  };
}

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export function isLocalizablePathname(pathname: string): boolean {
  const normalized = normalizePathname(pathname);

  return (
    !NON_LOCALIZED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)) &&
    !PUBLIC_FILE_PATTERN.test(normalized)
  );
}

export function getLocaleFromPathname(pathname: string): Locale | undefined {
  const [, firstSegment] = normalizePathname(pathname).split("/");
  return isLocale(firstSegment) ? firstSegment : undefined;
}

export function stripLocaleFromPathname(pathname: string): { locale?: Locale; pathname: string } {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (!isLocale(firstSegment)) {
    return { pathname: normalized };
  }

  const withoutLocale = `/${segments.slice(1).join("/")}`;
  return {
    locale: firstSegment,
    pathname: withoutLocale === "/" ? "/" : normalizePathname(withoutLocale)
  };
}

export function withLocale(locale: Locale, href: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) {
    return href;
  }

  const { hash, pathname, query } = splitHref(href);

  if (!isLocalizablePathname(pathname)) {
    return href;
  }

  const stripped = stripLocaleFromPathname(pathname);
  const localizedPathname = stripped.pathname === "/" ? `/${locale}` : `/${locale}${stripped.pathname}`;
  return `${localizedPathname}${query}${hash}`;
}

export function switchLocale(pathname: string, locale: Locale): string {
  return withLocale(locale, pathname);
}

export function getLocaleRoutingAction(pathname: string): LocaleRoutingAction {
  const normalized = normalizePathname(pathname);

  if (!isLocalizablePathname(normalized)) {
    return { kind: "next" };
  }

  if (normalized === "/") {
    return { kind: "redirect", pathname: `/${defaultLocale}` };
  }

  const stripped = stripLocaleFromPathname(normalized);

  if (stripped.locale) {
    return {
      kind: "rewrite",
      locale: stripped.locale,
      pathname: stripped.pathname
    };
  }

  return { kind: "next" };
}

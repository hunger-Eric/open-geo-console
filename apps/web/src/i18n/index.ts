import { en } from "./en";
import { zh } from "./zh";
import { formatDateTime, formatNumber as formatIntlNumber, formatPercent } from "./format";
import { switchLocale, withLocale } from "./routes";
import { locales, type Dictionary, type Locale, type TranslationParams } from "./types";

const dictionaries = {
  en,
  zh
} satisfies Record<Locale, Dictionary>;

export { dictionaries, formatDateTime, formatPercent, locales };
export type { Dictionary, FindingMessage, Locale, SeverityKey, TranslationParams } from "./types";
export {
  getLocaleFromPathname,
  getLocaleAlternates,
  getLocaleRoutingAction,
  INTERFACE_LOCALE_HEADER,
  isLocalizablePathname,
  stripLocaleFromPathname,
  switchLocale,
  withLocale,
  type LocaleRoutingAction
} from "./routes";

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function normalizeLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : "zh";
}

export function localizePath(locale: Locale, path: string): string {
  return withLocale(locale, path);
}

export function switchLocalePath(path: string, nextLocale: Locale): string {
  return switchLocale(path, nextLocale);
}

export function formatDate(locale: Locale, date: Date | string): string {
  return formatDateTime(locale, date);
}

export function formatNumber(locale: Locale, value: number): string {
  return formatIntlNumber(locale, value);
}

export function interpolate(template: string, params: TranslationParams = {}): string {
  return template.replace(/\{(\w+)}/g, (_, key: string) => String(params[key] ?? `{${key}}`));
}

export function dictionaryKeys(dictionary: Dictionary): string[] {
  const keys: string[] = [];
  collectKeys(dictionary, "", keys);
  return keys.sort();
}

function collectKeys(value: unknown, prefix: string, keys: string[]) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectKeys(child, prefix ? `${prefix}.${key}` : key, keys);
    }
    return;
  }
  keys.push(prefix);
}

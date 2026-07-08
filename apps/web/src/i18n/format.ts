import type { Locale } from "./locales";

const intlLocales = {
  en: "en-US",
  zh: "zh-CN"
} as const satisfies Record<Locale, string>;

type DateInput = Date | number | string;

export function getIntlLocale(locale: Locale): string {
  return intlLocales[locale];
}

export function formatDateTime(
  locale: Locale,
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short"
  }
): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(new Date(value));
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(getIntlLocale(locale), options).format(value);
}

export function formatPercent(locale: Locale, value: number, options?: Intl.NumberFormatOptions): string {
  return formatNumber(locale, value, {
    maximumFractionDigits: 0,
    style: "percent",
    ...options
  });
}

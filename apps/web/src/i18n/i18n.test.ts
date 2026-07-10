import { describe, expect, it } from "vitest";
import { dictionaries, getDictionary } from ".";
import { formatDateTime, formatNumber, formatPercent } from "./format";
import { defaultLocale, isLocale, locales } from "./locales";
import {
  getLocaleFromPathname,
  getLocaleRoutingAction,
  stripLocaleFromPathname,
  switchLocale,
  withLocale
} from "./routes";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return [prefix];
  }

  return Object.entries(value)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe("i18n architecture", () => {
  it("recognizes only supported locales", () => {
    expect(locales).toEqual(["en", "zh"]);
    expect(defaultLocale).toBe("en");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("keeps dictionary keys in parity across locales", () => {
    const englishKeys = flattenKeys(dictionaries.en);
    const chineseKeys = flattenKeys(dictionaries.zh);

    expect(chineseKeys).toEqual(englishKeys);
    expect(getDictionary("en").metadata.title).toBe("Open GEO Console");
  });

  it("extracts and strips route locales", () => {
    expect(getLocaleFromPathname("/zh/reports/abc")).toBe("zh");
    expect(getLocaleFromPathname("/reports/abc")).toBeUndefined();
    expect(stripLocaleFromPathname("/en/reports/abc")).toEqual({
      locale: "en",
      pathname: "/reports/abc"
    });
  });

  it("preserves path, query, and hash when switching locale", () => {
    expect(withLocale("zh", "/reports/abc?tab=summary#top")).toBe("/zh/reports/abc?tab=summary#top");
    expect(switchLocale("/en/logs", "zh")).toBe("/zh/logs");
    expect(withLocale("en", "/api/scan")).toBe("/api/scan");
    expect(withLocale("zh", "https://example.com/report")).toBe("https://example.com/report");
  });

  it("defines routing behavior without localizing APIs", () => {
    expect(getLocaleRoutingAction("/")).toEqual({ kind: "redirect", pathname: "/en" });
    expect(getLocaleRoutingAction("/api/scan")).toEqual({ kind: "next" });
    expect(getLocaleRoutingAction("/_next/static/chunk.js")).toEqual({ kind: "next" });
    expect(getLocaleRoutingAction("/zh/reports/abc")).toEqual({
      kind: "rewrite",
      locale: "zh",
      pathname: "/reports/abc"
    });
  });

  it("formats dates and numbers through locale-aware helpers", () => {
    const date = new Date("2026-07-08T12:34:00Z");

    expect(formatDateTime("en", date, { dateStyle: "medium", timeZone: "UTC" })).toContain("2026");
    expect(formatDateTime("zh", date, { dateStyle: "medium", timeZone: "UTC" })).toContain("2026");
    expect(formatDateTime("en", date)).toBe("Jul 8, 2026, 12:34 PM");
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatPercent("en", 0.42)).toBe("42%");
  });
});

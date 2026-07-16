import { describe, expect, it } from "vitest";
import { dictionaries, getDictionary } from ".";
import { formatDateTime, formatNumber, formatPercent } from "./format";
import { defaultLocale, isLocale, locales } from "./locales";
import {
  getLocaleFromPathname,
  getLocaleAlternates,
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
    expect(defaultLocale).toBe("zh");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("de")).toBe(false);
  });

  it("keeps dictionary keys in parity across locales", () => {
    const englishKeys = flattenKeys(dictionaries.en);
    const chineseKeys = flattenKeys(dictionaries.zh);

    expect(chineseKeys).toEqual(englishKeys);
    expect(getDictionary("en").metadata.title).toBe("Open GEO Console");
    expect(getDictionary("en").aiReport.queueJobsAhead).toContain("{count}");
    expect(getDictionary("zh").report.findingAggregation.affectedPages).toContain("{count}");
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
    expect(withLocale("zh", "/reports/abc?tab=summary#top")).toBe("/reports/abc?tab=summary#top");
    expect(withLocale("en", "/reports/abc?tab=summary#top")).toBe("/en/reports/abc?tab=summary#top");
    expect(switchLocale("/en/logs", "zh")).toBe("/logs");
    expect(switchLocale("/logs", "en")).toBe("/en/logs");
    expect(withLocale("en", "/api/scan")).toBe("/api/scan");
    expect(withLocale("zh", "https://example.com/report")).toBe("https://example.com/report");
  });

  it("defines routing behavior without localizing APIs", () => {
    expect(getLocaleRoutingAction("/")).toEqual({ kind: "rewrite", locale: "zh", pathname: "/" });
    expect(getLocaleRoutingAction("/reports/abc")).toEqual({
      kind: "rewrite",
      locale: "zh",
      pathname: "/reports/abc"
    });
    expect(getLocaleRoutingAction("/api/scan")).toEqual({ kind: "next" });
    expect(getLocaleRoutingAction("/_next/static/chunk.js")).toEqual({ kind: "next" });
    expect(getLocaleRoutingAction("/reports/abc/report.html")).toEqual({ kind: "next" });
    expect(getLocaleRoutingAction("/zh/reports/abc")).toEqual({
      kind: "redirect",
      pathname: "/reports/abc"
    });
    expect(getLocaleRoutingAction("/en/reports/abc")).toEqual({ kind: "next" });
  });

  it("generates canonical and alternate URLs from the same logical path", () => {
    expect(getLocaleAlternates("zh", "/reports/abc")).toEqual({
      canonical: "/reports/abc",
      languages: {
        "zh-CN": "/reports/abc",
        en: "/en/reports/abc",
        "x-default": "/reports/abc"
      }
    });
    expect(getLocaleAlternates("en", "/reports/abc").canonical).toBe("/en/reports/abc");
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

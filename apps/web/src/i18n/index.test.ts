import { describe, expect, it } from "vitest";
import { dictionaryKeys, formatDate, getDictionary, isLocale, localizePath, switchLocalePath } from ".";

describe("i18n helpers", () => {
  it("validates supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("fr")).toBe(false);
  });

  it("localizes and switches paths", () => {
    expect(localizePath("en", "/reports/123")).toBe("/en/reports/123");
    expect(localizePath("zh", "/en/reports/123")).toBe("/zh/reports/123");
    expect(switchLocalePath("/zh/logs", "en")).toBe("/en/logs");
  });

  it("keeps dictionary keys in parity", () => {
    expect(dictionaryKeys(getDictionary("zh"))).toEqual(dictionaryKeys(getDictionary("en")));
  });

  it("formats dates per locale", () => {
    expect(formatDate("en", "2026-07-08T01:00:00.000Z")).toContain("2026");
    expect(formatDate("zh", "2026-07-08T01:00:00.000Z")).toContain("2026");
  });
});

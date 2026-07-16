import { describe, expect, it } from "vitest";
import { loadReportV4ReportRuntimeConfig } from "./report-runtime-config";

// @requirement GEO-V4-COPY-01
// @requirement GEO-V4-COPY-02
// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-LEGACY-01
describe("V4 immutable paid-locale report runtime", () => {
  it.each([
    ["zh", "business-operator-zh-v1", "zh-CN"],
    ["en", "business-operator-en-v1", "en"]
  ] as const)("maps exact paid locale %s to its parsed profile", (paidLocale, profileId, profileLocale) => {
    const runtime = loadReportV4ReportRuntimeConfig(paidLocale);

    expect(runtime).toMatchObject({ paidLocale, reportProfile: { profileId, locale: profileLocale } });
    expect(runtime.reportProfile.terminology.requiredGeoTerms).toContain("GEO");
    expect(runtime.reportProfile.readingOrder).toEqual(["conclusion", "reason", "action"]);
  });

  it.each(["", "zh-CN", "en-US", "ZH", "fr", undefined, null])(
    "fails closed without locale fallback for %j",
    (locale) => {
      expect(() => loadReportV4ReportRuntimeConfig(locale)).toThrow(/paid locale|unsupported|en|zh/i);
    }
  );

  it("returns stable deeply frozen runtime objects", () => {
    const first = loadReportV4ReportRuntimeConfig("en");
    const second = loadReportV4ReportRuntimeConfig("en");

    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.reportProfile)).toBe(true);
    expect(Object.isFrozen(first.reportProfile.audiences)).toBe(true);
    expect(Object.isFrozen(first.reportProfile.audiences.primary)).toBe(true);
    expect(Object.isFrozen(first.reportProfile.terminology)).toBe(true);
    expect(Object.isFrozen(first.reportProfile.fieldBounds)).toBe(true);
    expect(Object.isFrozen(first.reportProfile.fieldBounds.questionAnswer)).toBe(true);
  });
});

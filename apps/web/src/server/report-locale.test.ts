import { describe, expect, it } from "vitest";
import { parseReportLocale } from "./report-locale";

describe("report locale contract", () => {
  it("accepts only the supported report locales", () => {
    expect(parseReportLocale("en")).toBe("en");
    expect(parseReportLocale("zh")).toBe("zh");
    expect(parseReportLocale("EN")).toBeNull();
    expect(parseReportLocale("zh-CN")).toBeNull();
    expect(parseReportLocale(undefined)).toBeNull();
  });
});

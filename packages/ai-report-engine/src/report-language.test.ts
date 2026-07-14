import { describe, expect, it } from "vitest";
import {
  ReportLanguageValidationError,
  assertReportLanguage,
  normalizeReportLanguage,
  reportLanguageInstruction
} from "./report-language";

describe("report language contract", () => {
  it("normalizes only supported report languages", () => {
    expect(normalizeReportLanguage("zh-CN")).toBe("zh");
    expect(normalizeReportLanguage("en_US")).toBe("en");
    expect(() => normalizeReportLanguage("fr")).toThrow(/unsupported report locale/i);
  });

  it("gives the model an explicit non-bilingual Chinese instruction", () => {
    expect(reportLanguageInstruction("zh-CN")).toContain("Simplified Chinese");
    expect(reportLanguageInstruction("zh-CN")).toContain("Do not repeat the prose in English");
  });

  it("rejects sentence-scale English leakage in Chinese prose", () => {
    expect(() =>
      assertReportLanguage(
        [
          {
            path: "executiveSummary.overview",
            text: "这是结论。The customer should update all public materials immediately."
          }
        ],
        "zh-CN"
      )
    ).toThrow(ReportLanguageValidationError);
  });

  it("allows brands, URLs, code, and source-original fields", () => {
    expect(() =>
      assertReportLanguage(
        [
          { path: "finding.title", text: "为 Open GEO Console 增加 JSON-LD" },
          { path: "finding.url", text: "https://example.com/docs/getting-started" },
          {
            path: "evidence.quote",
            text: "This exact source passage remains verbatim.",
            kind: "source_original"
          }
        ],
        "zh",
        ["Open GEO Console", "JSON-LD"]
      )
    ).not.toThrow();
  });

  it("rejects Chinese narrative in an English report but allows an official name", () => {
    expect(() => assertReportLanguage([{ path: "overview", text: "客户应当立即更新网站内容。" }], "en"))
      .toThrow(ReportLanguageValidationError);
    expect(() =>
      assertReportLanguage([{ path: "organization", text: "Report for 小米集团" }], "en", ["小米集团"])
    ).not.toThrow();
  });
});

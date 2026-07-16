import { describe, expect, it } from "vitest";
import { assertAiReportLocale } from "./ai-reports";

describe("AI report locale contract", () => {
  it("requires the generated AI locale to equal the persisted report locale", () => {
    expect(() => assertAiReportLocale("zh", "zh")).not.toThrow();
    expect(() => assertAiReportLocale("zh", "en")).toThrow(/must match/);
    expect(() => assertAiReportLocale(null, "en")).toThrow(/has not been established/);
  });
});

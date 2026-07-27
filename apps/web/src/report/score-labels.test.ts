import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { zh } from "@/i18n/zh";
import { technicalScoreLabel } from "./score-labels";

describe("technicalScoreLabel", () => {
  it("labels the free score as homepage-only", () => {
    expect(technicalScoreLabel(en, "free", 1)).toBe("Homepage technical score");
  });

  it("includes deep-report coverage context", () => {
    expect(technicalScoreLabel(en, "deep", 6)).toContain("6 valid pages");
    expect(technicalScoreLabel(zh, "deep", 6)).toContain("6 个有效页面");
  });
});

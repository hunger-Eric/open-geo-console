import { describe, expect, it } from "vitest";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { matchesImmutableBusinessQuestions, resolveBusinessQuestionLocale } from "./business-questions";

describe("immutable business-question checkout recovery", () => {
  const locked = {
    confirmedAt: "2026-07-16T12:34:18.543Z",
    questions: [
      { privateText: "台湾海快、海运、空运分别有哪些公开服务商？" },
      { privateText: "面向跨境电商卖家的线路，如何选择方案？" },
      { privateText: "签约前需要核验哪些运输限制与履约风险？" }
    ]
  } as ConfirmedBusinessQuestionSet;

  it("accepts an idempotent replay of the three confirmed or locked texts", () => {
    expect(matchesImmutableBusinessQuestions(locked, locked.questions.map(({ privateText }) => privateText))).toBe(true);
  });

  it("rejects any attempted change after the questions are locked", () => {
    const changed = locked.questions.map(({ privateText }) => privateText);
    changed[1] = "改写后的第二个问题？";
    expect(matchesImmutableBusinessQuestions(locked, changed)).toBe(false);
  });
});

describe("business-question locale authority", () => {
  it("uses the persisted report locale ahead of the deployment default", () => {
    expect(resolveBusinessQuestionLocale(undefined, "en", "zh-CN")).toBe("en");
  });

  it("canonicalizes the explicit public-search locale", () => {
    expect(resolveBusinessQuestionLocale("zh-CN", "en", "en-US")).toBe("zh");
    expect(resolveBusinessQuestionLocale("zh_CN", "en", "en-US")).toBe("zh");
    expect(resolveBusinessQuestionLocale("en-GB", "zh", "zh-CN")).toBe("en");
  });

  it("canonicalizes fallback locales without changing their precedence", () => {
    expect(resolveBusinessQuestionLocale("  ", "zh-CN", "en-US")).toBe("zh");
    expect(resolveBusinessQuestionLocale(undefined, "  ", "en-US")).toBe("en");
    expect(resolveBusinessQuestionLocale(undefined, undefined, undefined)).toBe("en");
  });

  it("fails closed for unsupported report languages", () => {
    expect(() => resolveBusinessQuestionLocale("fr-FR", "zh", "zh-CN")).toThrow("Unsupported report locale");
  });
});

import { describe, expect, it } from "vitest";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { matchesLockedBusinessQuestions } from "./business-questions";

describe("locked business-question checkout recovery", () => {
  const locked = {
    confirmedAt: "2026-07-16T12:34:18.543Z",
    questions: [
      { privateText: "台湾海快、海运、空运分别有哪些公开服务商？" },
      { privateText: "面向跨境电商卖家的线路，如何选择方案？" },
      { privateText: "签约前需要核验哪些运输限制与履约风险？" }
    ]
  } as ConfirmedBusinessQuestionSet;

  it("accepts an idempotent replay of the three locked texts", () => {
    expect(matchesLockedBusinessQuestions(locked, locked.questions.map(({ privateText }) => privateText))).toBe(true);
  });

  it("rejects any attempted change after the questions are locked", () => {
    const changed = locked.questions.map(({ privateText }) => privateText);
    changed[1] = "改写后的第二个问题？";
    expect(matchesLockedBusinessQuestions(locked, changed)).toBe(false);
  });
});

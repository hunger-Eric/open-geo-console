import { describe, expect, it } from "vitest";
import { PublicSourceAttemptDeferredError, createPublicSourceAttemptBudget, splitPublicSourceSubBudgetMs } from "./public-source-execution-budget";

describe("public-source attempt budget", () => {
  it("reserves bounded search, retrieval, artifact, and cleanup windows", () => {
    expect(createPublicSourceAttemptBudget(700_000)).toEqual({
      searchMs: 180_000,
      retrievalMs: 180_000,
      artifactReserveMs: 180_000,
      cleanupMarginMs: 60_000
    });
  });

  it("defers before starting when the remaining attempt cannot contain every reserve", () => {
    expect(() => createPublicSourceAttemptBudget(599_999)).toThrow(PublicSourceAttemptDeferredError);
  });

  it("lets Direct use the actual positive remaining job time without a fresh-attempt reserve", () => {
    expect(createPublicSourceAttemptBudget(244_000, { semanticValidation: "free_direct" })).toEqual({
      searchMs: 180_000,
      retrievalMs: 180_000,
      artifactReserveMs: 180_000,
      cleanupMarginMs: 60_000
    });
    expect(() => createPublicSourceAttemptBudget(0, { semanticValidation: "free_direct" }))
      .toThrow(PublicSourceAttemptDeferredError);
  });

  it("splits propagated sub-budgets into bounded per-unit deadlines", () => {
    expect(splitPublicSourceSubBudgetMs(180_000, 6)).toBe(30_000);
    expect(splitPublicSourceSubBudgetMs(180_000, 12)).toBe(15_000);
    expect(splitPublicSourceSubBudgetMs(10, 12)).toBe(1);
    expect(() => splitPublicSourceSubBudgetMs(0, 6)).toThrow(TypeError);
    expect(() => splitPublicSourceSubBudgetMs(180_000, 0)).toThrow(TypeError);
  });
});

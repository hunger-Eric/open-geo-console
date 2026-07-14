import { describe, expect, it } from "vitest";
import { PublicSourceAttemptDeferredError, createPublicSourceAttemptBudget } from "./public-source-execution-budget";

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
});

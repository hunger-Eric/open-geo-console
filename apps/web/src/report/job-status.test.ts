import { describe, expect, it } from "vitest";
import { publicStateForStage } from "./job-status";

describe("publicStateForStage", () => {
  it.each(["queued", "discovering", "planning", "fetching", "analyzing", "synthesizing"])(
    "maps %s to the product generating state",
    (stage) => expect(publicStateForStage(stage)).toBe("generating")
  );

  it("keeps only product terminal outcomes public", () => {
    expect(publicStateForStage("completed")).toBe("completed");
    expect(publicStateForStage("completed_limited")).toBe("completed_limited");
    expect(publicStateForStage("failed")).toBe("unavailable");
  });

  it("projects legacy partial rows as completed limited", () => {
    expect(publicStateForStage("partial")).toBe("completed_limited");
  });
});

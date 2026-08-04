import { describe, expect, it } from "vitest";
import { publicProgressForStage, publicStateForStage, publicTwoStageFreeProgress } from "./job-status";

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

describe("publicProgressForStage", () => {
  it("clears public progress for failed jobs so 96% is not shown as generating", () => {
    expect(publicProgressForStage("failed", 96)).toBeNull();
    expect(publicProgressForStage("failed", 0)).toBeNull();
    expect(publicProgressForStage("failed", 100)).toBeNull();
  });

  it("publishes terminal success as 100 without inventing mid-run percentages", () => {
    expect(publicProgressForStage("completed", 100)).toBe(100);
    expect(publicProgressForStage("completed", 96)).toBe(100);
    expect(publicProgressForStage("completed_limited", 80)).toBe(100);
    expect(publicProgressForStage("partial", 50)).toBe(100);
  });

  it("clamps in-flight progress to 0..99 and never publishes 100 while generating", () => {
    expect(publicProgressForStage("synthesizing", 96)).toBe(96);
    expect(publicProgressForStage("synthesizing", 100)).toBe(99);
    expect(publicProgressForStage("analyzing", -3)).toBe(0);
    expect(publicProgressForStage("queued", 12.9)).toBe(12);
  });
});

describe("publicTwoStageFreeProgress", () => {
  it("keeps the V4 handoff monotonic at 65 percent", () => {
    expect(publicTwoStageFreeProgress("analyzing", 65, "base")).toBe(65);
    expect(publicTwoStageFreeProgress("synthesizing", 85, "base")).toBe(65);
    expect(publicTwoStageFreeProgress("completed", 100, "base")).toBe(65);
    expect(publicTwoStageFreeProgress("queued", 0, "preview")).toBe(65);
    expect(publicTwoStageFreeProgress("discovering", 5, "preview")).toBe(67);
    expect(publicTwoStageFreeProgress("synthesizing", 96, "preview")).toBe(98);
  });

  it("preserves terminal semantics for the preview segment", () => {
    expect(publicTwoStageFreeProgress("completed", 99, "preview")).toBe(100);
    expect(publicTwoStageFreeProgress("failed", 96, "preview")).toBeNull();
  });
});

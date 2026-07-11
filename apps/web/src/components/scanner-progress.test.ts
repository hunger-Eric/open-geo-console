import { describe, expect, it } from "vitest";
import { getScanProgressStage } from "./scanner-progress";

describe("getScanProgressStage", () => {
  it("starts with the security and homepage crawl stage", () => {
    expect(getScanProgressStage(0)).toBe("starting");
    expect(getScanProgressStage(14_999)).toBe("starting");
  });

  it("shows a slow-site hint after fifteen seconds", () => {
    expect(getScanProgressStage(15_000)).toBe("slow");
    expect(getScanProgressStage(59_999)).toBe("slow");
  });

  it("shows an extended-wait hint after one minute", () => {
    expect(getScanProgressStage(60_000)).toBe("extended");
  });
});

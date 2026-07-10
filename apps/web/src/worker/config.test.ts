import { describe, expect, it } from "vitest";
import { parseWorkerTier, positiveInteger, readWorkerConfig } from "./config";

describe("worker configuration", () => {
  it("requires an explicit free or deep worker lane", () => {
    expect(parseWorkerTier("free")).toBe("free");
    expect(parseWorkerTier(" DEEP ")).toBe("deep");
    expect(() => parseWorkerTier(undefined)).toThrow(/OGC_WORKER_TIER/);
    expect(() => parseWorkerTier("all")).toThrow(/free.*deep/);
  });

  it("uses a positive poll interval and falls back for invalid values", () => {
    expect(positiveInteger("2500", 1500)).toBe(2500);
    expect(positiveInteger("0", 1500)).toBe(1500);
    expect(positiveInteger("invalid", 1500)).toBe(1500);
    expect(readWorkerConfig({ OGC_WORKER_TIER: "free" })).toEqual({ tier: "free", pollMs: 1500 });
  });
});

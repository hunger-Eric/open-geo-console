import { describe, expect, it } from "vitest";
import { createConcurrencyGate, mapWithConcurrency } from "./bounded-scheduler";

describe("bounded scheduler", () => {
  it("preserves result order while limiting active work", async () => {
    let active = 0;
    let peak = 0;
    const results = await mapWithConcurrency([30, 5, 20, 1], 2, async (delay, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, delay));
      active -= 1;
      return index;
    });
    expect(results).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("shares one limit across independent callers", async () => {
    const gate = createConcurrencyGate(2);
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 6 }, () => gate.run(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
    })));
    expect(peak).toBe(2);
  });
});

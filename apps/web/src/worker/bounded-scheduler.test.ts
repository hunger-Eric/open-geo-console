import { describe, expect, it, vi } from "vitest";
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

  it("starts no work for a pre-aborted schedule", async () => {
    const controller = new AbortController();
    const reason = new Error("deadline");
    controller.abort(reason);
    const worker = vi.fn(async (value: number) => value);

    await expect(mapWithConcurrency([1, 2, 3], 1, worker, controller.signal)).rejects.toBe(reason);
    expect(worker).not.toHaveBeenCalled();
  });

  it("does not start queued work after a mid-flight abort", async () => {
    const controller = new AbortController();
    const reason = new Error("phase deadline");
    let release!: () => void;
    const first = new Promise<void>((resolve) => { release = resolve; });
    const started: number[] = [];
    const pending = mapWithConcurrency([1, 2, 3], 1, async (value) => {
      started.push(value);
      await first;
      controller.signal.throwIfAborted();
      return value;
    }, controller.signal);
    await vi.waitFor(() => expect(started).toEqual([1]));

    controller.abort(reason);
    release();

    await expect(pending).rejects.toBe(reason);
    expect(started).toEqual([1]);
  });
});

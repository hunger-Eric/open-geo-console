import { describe, expect, it, vi } from "vitest";
import { DeferredTurnstileExecution } from "./turnstile-execution";

describe("deferred Turnstile execution", () => {
  it("runs one queued request when the widget becomes ready", () => {
    const queue = new DeferredTurnstileExecution();
    const execute = vi.fn();
    queue.request();
    queue.request();

    queue.ready(execute);

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("executes immediately after readiness and clears on teardown", () => {
    const queue = new DeferredTurnstileExecution();
    const execute = vi.fn();
    queue.ready(execute);
    queue.request();
    expect(execute).toHaveBeenCalledTimes(1);

    queue.clear();
    queue.request();
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

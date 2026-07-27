import { describe, expect, it, vi } from "vitest";
import { runQueueHintCycle } from "./consumer";
import { LocalJobNotificationQueue } from "./local";

describe("queue hint consumer", () => {
  it("claims authoritative work and acknowledges the hint before processing", async () => {
    const queue = new LocalJobNotificationQueue(() => 1_000);
    await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "deep" });
    const events: string[] = [];
    const result = await runQueueHintCycle(queue, {
      claim: async () => { events.push("claim"); return { id: "job_1" }; },
      process: async () => {
        expect(await queue.pull("deep")).toEqual([]);
        events.push("process");
      }
    }, "worker_1", "deep");

    expect(result).toMatchObject({ pulled: 1, claimed: 1, processed: 1 });
    expect(events).toEqual(["claim", "process"]);
  });

  it("acknowledges a duplicate hint when PostgreSQL has no eligible job", async () => {
    const queue = new LocalJobNotificationQueue(() => 1_000);
    await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "free" });
    const result = await runQueueHintCycle(queue, {
      claim: async () => null,
      process: vi.fn()
    }, "worker_1", "free");

    expect(result.stale).toBe(1);
    expect(await queue.pull("free")).toEqual([]);
  });

  it("retries the hint when the PostgreSQL claim fails", async () => {
    let now = 1_000;
    const queue = new LocalJobNotificationQueue(() => now);
    await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "deep" });
    const result = await runQueueHintCycle(queue, {
      claim: async () => { throw new Error("database unavailable"); },
      process: vi.fn()
    }, "worker_1", "deep", { retryDelaySeconds: 5 });

    expect(result.retried).toBe(1);
    expect(await queue.pull("deep")).toEqual([]);
    now += 5_000;
    expect((await queue.pull("deep"))[0].attempts).toBe(2);
  });

  it("does not depend on the hint after a job has been claimed", async () => {
    const queue = new LocalJobNotificationQueue(() => 1_000);
    await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "deep" });
    const result = await runQueueHintCycle(queue, {
      claim: async () => ({ id: "job_1" }),
      process: async () => { throw new Error("worker crashed after ack"); }
    }, "worker_1", "deep");

    expect(result.processingFailures).toBe(1);
    expect(await queue.pull("deep")).toEqual([]);
  });
});

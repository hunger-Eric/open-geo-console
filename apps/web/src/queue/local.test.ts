import { describe, expect, it } from "vitest";
import { LocalJobNotificationQueue } from "./local";

describe("local job notification queue", () => {
  it("supports pull, retry delay, redelivery, and acknowledgement", async () => {
    let now = 1_000;
    const queue = new LocalJobNotificationQueue(() => now);
    await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "deep" });

    const [first] = await queue.pull("deep", { visibilityTimeoutMs: 10_000 });
    expect(first.notification?.dispatchId).toBe("dispatch_1");
    expect(first.attempts).toBe(1);
    await queue.retry("deep", [{ leaseId: first.leaseId, delaySeconds: 5 }]);
    expect(await queue.pull("deep")).toEqual([]);

    now += 5_000;
    const [second] = await queue.pull("deep");
    expect(second.attempts).toBe(2);
    await queue.acknowledge("deep", [second.leaseId]);
    expect(await queue.pull("deep")).toEqual([]);
  });

  it("keeps the free and deep lanes isolated", async () => {
    const queue = new LocalJobNotificationQueue(() => 1_000);
    await queue.publish({ version: 1, dispatchId: "dispatch_free", tier: "free" });
    expect(await queue.pull("deep")).toEqual([]);
    expect((await queue.pull("free"))[0].notification?.tier).toBe("free");
  });
});

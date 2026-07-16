import { describe, expect, it, vi } from "vitest";
import { LocalJobNotificationQueue } from "./local";
import {
  dispatchJobNotifications,
  reconcileJobNotifications,
  retryDelayMs,
  type JobDispatchOutboxRepository,
  type JobDispatchRecord
} from "./outbox-dispatcher";

function repository(records: JobDispatchRecord[]): JobDispatchOutboxRepository & {
  published: string[];
  retries: Array<{ id: string; errorCode: string; nextAttemptAt: Date }>;
} {
  const published: string[] = [];
  const retries: Array<{ id: string; errorCode: string; nextAttemptAt: Date }> = [];
  return {
    published,
    retries,
    leaseJobDispatches: vi.fn(async () => records),
    markJobDispatchPublished: vi.fn(async ({ id }) => { published.push(id); return true; }),
    markJobDispatchRetry: vi.fn(async ({ id, errorCode, nextAttemptAt }) => {
      retries.push({ id, errorCode, nextAttemptAt });
      return true;
    }),
    ensureQueuedJobsHaveDispatches: vi.fn(async () => 0)
  };
}

describe("job dispatch outbox", () => {
  it("publishes the leased outbox row and marks it after the queue accepts it", async () => {
    const store = repository([{ id: "dispatch_1", tier: "deep", attempts: 0 }]);
    const queue = new LocalJobNotificationQueue(() => 1_000);
    const result = await dispatchJobNotifications(store, queue, {
      owner: "dispatcher",
      now: () => new Date("2026-07-10T00:00:00Z")
    });

    expect(result).toMatchObject({ leased: 1, published: 1, deferred: 0 });
    expect(store.published).toEqual(["dispatch_1"]);
    expect((await queue.pull("deep"))[0].notification).toEqual({
      version: 1,
      dispatchId: "dispatch_1",
      tier: "deep"
    });
  });

  it("defers a failed publish without storing the provider error text", async () => {
    const store = repository([{ id: "dispatch_2", tier: "free", attempts: 2 }]);
    const queue = {
      publish: vi.fn(async () => { throw new Error("response contains a secret"); }),
      pull: vi.fn(),
      acknowledge: vi.fn(),
      retry: vi.fn()
    };
    const result = await dispatchJobNotifications(store, queue, {
      owner: "dispatcher",
      now: () => new Date("2026-07-10T00:00:00Z")
    });

    expect(result.deferred).toBe(1);
    expect(store.retries[0].errorCode).toBe("queue_publish_failed");
    expect(store.retries[0].nextAttemptAt.toISOString()).toBe("2026-07-10T00:02:00.000Z");
  });

  it("repairs missing dispatches and republishes stale notifications during reconciliation", async () => {
    const store = repository([]);
    vi.mocked(store.ensureQueuedJobsHaveDispatches).mockResolvedValue(2);
    const queue = new LocalJobNotificationQueue();
    const now = new Date("2026-07-10T12:00:00Z");

    const result = await reconcileJobNotifications(store, queue, {
      owner: "reconciler",
      now: () => now
    });

    expect(result.repaired).toBe(2);
    expect(store.leaseJobDispatches).toHaveBeenCalledWith(expect.objectContaining({
      includePublishedBefore: new Date("2026-07-10T11:30:00Z")
    }));
  });

  it("bounds exponential retry delays", () => {
    expect(retryDelayMs(0)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(99)).toBe(1_800_000);
  });
});

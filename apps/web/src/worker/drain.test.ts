import { describe, expect, it, vi } from "vitest";
import { LocalJobNotificationQueue } from "@/queue/local";
import { boundedReplicas, drainTierUntilEmpty, runRealtimeLane } from "./drain";

describe("worker drains", () => {
  it("drains authoritative work until every replica observes an empty queue", async () => {
    const jobs = Array.from({ length: 7 }, (_, index) => ({ id: index + 1 }));
    const claimed = new Set<number>();
    const result = await drainTierUntilEmpty({
      tier: "deep",
      replicas: 3,
      workerIdPrefix: "worker",
      runner: {
        claim: async () => jobs.shift() ?? null,
        process: async (job) => { claimed.add(job.id); }
      }
    });

    expect(result).toEqual({ tier: "deep", replicas: 3, claimedJobs: 7, completedJobs: 7, failedJobs: 0 });
    expect([...claimed].sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("contains a processing failure and continues to later jobs", async () => {
    const jobs = [{ id: 1 }, { id: 2 }];
    const onError = vi.fn();
    const result = await drainTierUntilEmpty({
      tier: "free",
      runner: {
        claim: async () => jobs.shift() ?? null,
        process: async (job) => { if (job.id === 1) throw new Error("crash"); }
      },
      onProcessingError: onError
    });

    expect(result).toMatchObject({ claimedJobs: 2, completedJobs: 1, failedJobs: 1 });
    expect(onError).toHaveBeenCalledOnce();
  });

  it("performs PostgreSQL startup recovery before waiting for a real-time hint", async () => {
    const jobs = [{ id: "startup" }, { id: "hint" }];
    const processed: string[] = [];
    const queue = new LocalJobNotificationQueue(() => 1_000);
    let stopping = false;
    const result = await runRealtimeLane({
      tier: "deep",
      queue,
      queuePollMs: 1_000,
      shouldStop: () => stopping,
      delay: async () => {
        await queue.publish({ version: 1, dispatchId: "dispatch_1", tier: "deep" });
      },
      runner: {
        claim: async () => {
          const next = jobs.shift() ?? null;
          if (!next) stopping = true;
          return next;
        },
        process: async (job) => { processed.push(job.id); }
      }
    });

    // Startup recovery drains both durable jobs. The Queue has no authority to
    // create another one when the subsequent hint is stale.
    expect(processed).toEqual(["startup", "hint"]);
    expect(result.completedJobs).toBe(2);
  });

  it("bounds local concurrency", () => {
    expect(boundedReplicas(undefined)).toBe(1);
    expect(boundedReplicas(4)).toBe(4);
    expect(boundedReplicas(100)).toBe(16);
  });
});

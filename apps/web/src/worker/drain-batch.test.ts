import { describe, expect, it, vi } from "vitest";
import { runRecordedBatchDrain } from "./drain-batch";

describe("recorded batch drain", () => {
  it("records a successful drain with aggregate counts", async () => {
    const jobs = [{ id: 1 }, { id: 2 }];
    const finishBatchRun = vi.fn(async () => undefined);
    const result = await runRecordedBatchDrain({
      tier: "deep",
      replicas: 2,
      batchRuns: {
        startBatchRun: async () => ({ id: "batch_1" }),
        finishBatchRun
      },
      runner: {
        claim: async () => jobs.shift() ?? null,
        process: async () => undefined
      }
    });

    expect(result.completedJobs).toBe(2);
    expect(finishBatchRun).toHaveBeenCalledWith({
      id: "batch_1",
      status: "succeeded",
      claimedJobs: 2,
      completedJobs: 2,
      failedJobs: 0
    });
  });

  it("records a sanitized failure and completed progress if a later authoritative claim fails", async () => {
    const finishBatchRun = vi.fn(async () => undefined);
    let claims = 0;
    await expect(runRecordedBatchDrain({
      tier: "free",
      batchRuns: {
        startBatchRun: async () => ({ id: "batch_1" }),
        finishBatchRun
      },
      runner: {
        claim: async () => {
          claims += 1;
          if (claims === 1) return { id: "job_1" };
          throw new Error("secret database string");
        },
        process: async () => undefined
      }
    })).rejects.toThrow("authoritative work");

    expect(finishBatchRun).toHaveBeenCalledWith({
      id: "batch_1",
      status: "failed",
      claimedJobs: 1,
      completedJobs: 1,
      failedJobs: 0,
      errorCode: "batch_drain_failed"
    });
  });
});

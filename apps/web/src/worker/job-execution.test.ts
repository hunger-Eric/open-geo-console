import { describe, expect, it, vi } from "vitest";
import { JobDeadlineExceededError, JobExecutionLease } from "./job-execution";

describe("JobExecutionLease", () => {
  it("stops renewing after a hard deadline and exposes its abort reason", async () => {
    vi.useFakeTimers();
    const heartbeat = vi.fn(async () => true);
    const lease = new JobExecutionLease({ hardDeadlineMs: 1_000, heartbeatIntervalMs: 100, heartbeat });
    lease.start();
    await vi.advanceTimersByTimeAsync(900);
    expect(heartbeat).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(() => lease.throwIfAborted()).toThrow(JobDeadlineExceededError);
    const callsAtDeadline = heartbeat.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(heartbeat).toHaveBeenCalledTimes(callsAtDeadline);
    lease.stop();
    vi.useRealTimers();
  });

  it("rejects an unusably short configured deadline", () => {
    expect(() => new JobExecutionLease({ hardDeadlineMs: 999, heartbeat: async () => true })).toThrow("OGC_JOB_HARD_DEADLINE_MS");
  });
});

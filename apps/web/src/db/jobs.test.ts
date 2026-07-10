import { describe, expect, it } from "vitest";
import { deriveScanJobQueueStatus } from "./jobs";

describe("scan job queue status", () => {
  it("reports jobs ahead using the same deterministic queue position", () => {
    expect(deriveScanJobQueueStatus({
      stage: "queued",
      queue_position: 3,
      same_tier_active: true,
      free_active: false,
      deep_active: true
    })).toEqual({ queuePosition: 3, waitReason: "jobs_ahead", activeTier: "deep" });
  });

  it("distinguishes an active same-tier lease from a job awaiting claim", () => {
    expect(deriveScanJobQueueStatus({
      stage: "queued",
      queue_position: 1,
      same_tier_active: true,
      free_active: true,
      deep_active: false
    })).toEqual({ queuePosition: 1, waitReason: "active_jobs_in_pool", activeTier: "preview" });

    expect(deriveScanJobQueueStatus({
      stage: "queued",
      queue_position: 1,
      same_tier_active: false,
      free_active: false,
      deep_active: false
    })).toEqual({ queuePosition: 1, waitReason: "awaiting_claim", activeTier: null });
  });

  it("summarizes mixed active leases without exposing queue data for running jobs", () => {
    expect(deriveScanJobQueueStatus({
      stage: "analyzing",
      queue_position: null,
      same_tier_active: true,
      free_active: true,
      deep_active: true
    })).toEqual({ queuePosition: null, waitReason: null, activeTier: "mixed" });
  });

  it("handles the brief claimed-but-not-checkpointed queued state factually", () => {
    expect(deriveScanJobQueueStatus({
      stage: "queued",
      queue_position: null,
      same_tier_active: true,
      free_active: true,
      deep_active: false
    })).toEqual({ queuePosition: null, waitReason: "active_jobs_in_pool", activeTier: "preview" });
  });
});

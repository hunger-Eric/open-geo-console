import { describe, expect, it } from "vitest";
import { assertFulfillmentPair, deriveScanJobQueueStatus, retryScanJob } from "./jobs";

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

describe("terminal-job retry boundary", () => {
  it("rejects the legacy direct retry path before it can reopen credits or refunds", async () => {
    await expect(retryScanJob("job-1")).rejects.toThrow(/restricted historical recovery/i);
  });
});

describe("scan job fulfillment identity", () => {
  it("opens the V4 pair only for the pre-admission reason", () => {
    expect(() => assertFulfillmentPair(
      "recommendation_forensics_v1",
      "two_stage_geo_report_v4",
      4,
      "v4_pre_admission"
    )).not.toThrow();
    expect(() => assertFulfillmentPair(
      "recommendation_forensics_v1",
      "two_stage_geo_report_v4",
      4,
      "standard"
    )).not.toThrow();
    expect(() => assertFulfillmentPair(
      "recommendation_forensics_v1",
      "public_search_source_forensics_v1",
      2,
      "v4_pre_admission"
    )).toThrow(/exact V4|pre-admission/i);
    expect(() => assertFulfillmentPair(
      "recommendation_forensics_v1",
      "two_stage_geo_report_v4",
      4,
      "locale_correction"
    )).toThrow(/standard|pre-admission/i);
  });
});

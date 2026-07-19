import { describe, expect, it, vi } from "vitest";
import type { ScanJobRow } from "@/db/schema";
import { runProtectedExactPreviewJob } from "./exact-preview-job";

const job = (overrides: Partial<ScanJobRow> = {}) => ({
  id: "target-job", reportId: "target-report", tier: "free", productContract: "legacy_website_audit_v1",
  artifactContract: null, fulfillmentMethodology: null, recommendationReportVersion: null, creditReservationId: null,
  reason: "standard", executionState: "queued", ...overrides
} as ScanJobRow);

function dependencies(candidate: ScanJobRow | null = job()) {
  return {
    prepareStaging: vi.fn().mockResolvedValue(undefined), prepareWorker: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(candidate), claim: vi.fn().mockResolvedValue(candidate),
    process: vi.fn().mockResolvedValue(undefined)
  };
}

const input = { jobId: "target-job", reportId: "target-report", tier: "free" as const, workerId: "one-shot" };

describe("protected exact preview worker", () => {
  it("runs guard and readiness before one accepted legacy-free claim and normal processing", async () => {
    const d = dependencies();
    await runProtectedExactPreviewJob(input, d);
    expect(d.prepareStaging).toHaveBeenCalledBefore(d.prepareWorker);
    expect(d.prepareWorker).toHaveBeenCalledBefore(d.getJob);
    expect(d.getJob).toHaveBeenCalledBefore(d.claim);
    expect(d.claim).toHaveBeenCalledTimes(1);
    expect(d.claim).toHaveBeenCalledWith("one-shot", { jobId: "target-job", reportId: "target-report", tier: "free" });
    expect(d.process).toHaveBeenCalledTimes(1);
    expect(d.process).toHaveBeenCalledWith(expect.objectContaining({ id: "target-job" }), "one-shot");
  });

  it.each([
    ["not found", null], ["wrong id", job({ id: "other-job" })], ["wrong report", job({ reportId: "other-report" })],
    ["wrong input tier", job()], ["wrong tier", job({ tier: "deep" })], ["wrong contract", job({ productContract: "recommendation_forensics_v1" })],
    ["methodology", job({ fulfillmentMethodology: "two_stage_geo_report_v4" })], ["version", job({ recommendationReportVersion: 4 })],
    ["artifact", job({ artifactContract: "legacy_website_audit_v1" })], ["credit", job({ creditReservationId: "credit-1" })],
    ["reason", job({ reason: "system_recovery" })]
  ])("fails closed for %s before a claim or process", async (_name, candidate) => {
    const d = dependencies(candidate);
    const rejectedInput = _name === "wrong input tier" ? { ...input, tier: "deep" as const } : input;
    await expect(runProtectedExactPreviewJob(rejectedInput, d)).rejects.toThrow();
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.process).not.toHaveBeenCalled();
  });

  it("allows staging regeneration and makes no second claim", async () => {
    const d = dependencies(job({ reason: "staging_regeneration" }));
    await runProtectedExactPreviewJob(input, d);
    expect(d.claim).toHaveBeenCalledTimes(1);
    expect(d.process).toHaveBeenCalledTimes(1);
  });

  it("fails after one claim without processing for ineligibility or a mismatched claim", async () => {
    for (const claimed of [null, job({ reportId: "other-report" })]) {
      const d = dependencies();
      d.claim.mockResolvedValue(claimed);
      await expect(runProtectedExactPreviewJob(input, d)).rejects.toThrow();
      expect(d.claim).toHaveBeenCalledTimes(1);
      expect(d.process).not.toHaveBeenCalled();
    }
  });
});

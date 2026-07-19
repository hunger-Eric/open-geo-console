import { describe, expect, it, vi } from "vitest";
import type { ScanJobRow } from "@/db/schema";
import { runProtectedExactJob } from "./exact-job";

const job = (overrides: Partial<ScanJobRow> = {}) => ({
  id: "target-job", reportId: "target-report", tier: "deep", productContract: "recommendation_forensics_v1",
  artifactContract: "combined_geo_report_v4", fulfillmentMethodology: "two_stage_geo_report_v4",
  recommendationReportVersion: 4, reason: "standard", executionState: "queued",
  ...overrides
} as ScanJobRow);

function dependencies(candidate: ScanJobRow | null = job()) {
  return {
    prepareStaging: vi.fn().mockResolvedValue(undefined), prepareV4: vi.fn().mockResolvedValue(undefined),
    getJob: vi.fn().mockResolvedValue(candidate), claim: vi.fn().mockResolvedValue(candidate),
    process: vi.fn().mockResolvedValue(undefined)
  };
}

describe("protected exact-job worker", () => {
  it("runs staging and V4 readiness before exactly one target claim and normal processing", async () => {
    const d = dependencies();
    await runProtectedExactJob({ jobId: "target-job", reportId: "target-report", tier: "deep", workerId: "one-shot" }, d);
    expect(d.prepareStaging).toHaveBeenCalledBefore(d.prepareV4);
    expect(d.prepareV4).toHaveBeenCalledBefore(d.getJob);
    expect(d.claim).toHaveBeenCalledTimes(1);
    expect(d.claim).toHaveBeenCalledWith("one-shot", { jobId: "target-job", reportId: "target-report", tier: "deep" });
    expect(d.process).toHaveBeenCalledWith(expect.objectContaining({ id: "target-job" }), "one-shot");
  });

  it.each([
    ["wrong report", job({ reportId: "other-report" })], ["wrong tier", job({ tier: "free" })],
    ["wrong contract", job({ productContract: "legacy_website_audit_v1" })],
    ["wrong artifact", job({ artifactContract: "combined_geo_report_v3" })],
    ["wrong methodology", job({ fulfillmentMethodology: "public_search_source_forensics_v1" })],
    ["wrong version", job({ recommendationReportVersion: 3 })], ["wrong reason", job({ reason: "replacement_fulfillment" })]
  ])("fails closed for %s before a claim or process", async (_name, candidate) => {
    const d = dependencies(candidate);
    await expect(runProtectedExactJob({ jobId: "target-job", reportId: "target-report", tier: "deep", workerId: "one-shot" }, d)).rejects.toThrow();
    expect(d.claim).not.toHaveBeenCalled();
    expect(d.process).not.toHaveBeenCalled();
  });

  it("fails closed for an ineligible state after only the target claim attempt", async () => {
    const d = dependencies(job({ executionState: "running" })); d.claim.mockResolvedValue(null);
    await expect(runProtectedExactJob({ jobId: "target-job", reportId: "target-report", tier: "deep", workerId: "one-shot" }, d)).rejects.toThrow(/not eligible/i);
    expect(d.claim).toHaveBeenCalledTimes(1);
    expect(d.process).not.toHaveBeenCalled();
  });

  it("fails closed when exact eligibility produces no claim or a mismatched returned identity", async () => {
    for (const claimed of [null, job({ id: "other-job" })]) {
      const d = dependencies(); d.claim.mockResolvedValue(claimed);
      await expect(runProtectedExactJob({ jobId: "target-job", reportId: "target-report", tier: "deep", workerId: "one-shot" }, d)).rejects.toThrow();
      expect(d.process).not.toHaveBeenCalled();
    }
  });
});

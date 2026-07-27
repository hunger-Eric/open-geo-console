import { describe, expect, it, vi } from "vitest";
import {
  enqueueReportV4PreAdmissionAfterPreview,
  type ReportV4AdmissionJobRepository
} from "./report-v4-admission-jobs";

// @requirement GEO-V4-CRAWL-04
describe("V4 pre-admission job lifecycle", () => {
  it("derives one exact prospective V4 job from a successful standard free preview", async () => {
    const createExactlyOnce = vi.fn(async () => ({ jobId: "admission-job", created: true }));
    const repository: ReportV4AdmissionJobRepository = { createExactlyOnce };

    await expect(enqueueReportV4PreAdmissionAfterPreview({
      reportId: "report-1",
      locale: "zh",
      tier: "free",
      productContract: "legacy_website_audit_v1",
      reason: "standard",
      stage: "completed"
    }, repository)).resolves.toEqual({ jobId: "admission-job", created: true });

    expect(createExactlyOnce).toHaveBeenCalledTimes(1);
    expect(createExactlyOnce).toHaveBeenCalledWith({
      reportId: "report-1",
      locale: "zh",
      tier: "deep",
      productContract: "recommendation_forensics_v1",
      fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4,
      artifactContract: "combined_geo_report_v4",
      reason: "v4_pre_admission"
    });
  });

  it("dispatches a completed-limited standard preview exactly once", async () => {
    const createExactlyOnce = vi.fn(async () => ({ jobId: "limited-admission-job", created: true }));
    const repository: ReportV4AdmissionJobRepository = { createExactlyOnce };

    await expect(enqueueReportV4PreAdmissionAfterPreview({
      reportId: "report-limited",
      locale: "en",
      tier: "free",
      productContract: "legacy_website_audit_v1",
      reason: "standard",
      stage: "completed_limited"
    }, repository)).resolves.toEqual({ jobId: "limited-admission-job", created: true });

    expect(createExactlyOnce).toHaveBeenCalledTimes(1);
    expect(createExactlyOnce).toHaveBeenCalledWith(expect.objectContaining({
      reportId: "report-limited",
      reason: "v4_pre_admission"
    }));
  });

  it("dispatches a protected staging regeneration through the same pre-admission boundary", async () => {
    const createExactlyOnce = vi.fn(async () => ({ jobId: "staging-admission-job", created: true }));
    const repository: ReportV4AdmissionJobRepository = { createExactlyOnce };

    await expect(enqueueReportV4PreAdmissionAfterPreview({
      reportId: "report-staging",
      locale: "zh",
      tier: "free",
      productContract: "legacy_website_audit_v1",
      reason: "staging_regeneration",
      stage: "completed"
    }, repository)).resolves.toEqual({ jobId: "staging-admission-job", created: true });

    expect(createExactlyOnce).toHaveBeenCalledWith(expect.objectContaining({
      reportId: "report-staging",
      reason: "v4_pre_admission"
    }));
  });

  it.each([
    ["failed preview", { stage: "failed" as const }],
    ["deep source", { tier: "deep" as const }],
    ["non-legacy source", { productContract: "recommendation_forensics_v1" as const }]
  ])("does not enqueue for %s", async (_label, overrides) => {
    const createExactlyOnce = vi.fn();
    const repository: ReportV4AdmissionJobRepository = { createExactlyOnce };

    await expect(enqueueReportV4PreAdmissionAfterPreview({
      reportId: "report-1",
      locale: "en",
      tier: "free",
      productContract: "legacy_website_audit_v1",
      reason: "standard",
      stage: "completed",
      ...overrides
    }, repository)).resolves.toBeNull();
    expect(createExactlyOnce).not.toHaveBeenCalled();
  });
});

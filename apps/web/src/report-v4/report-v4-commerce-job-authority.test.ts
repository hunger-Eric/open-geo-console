import { describe, expect, it } from "vitest";
import {
  normalizeReportV4CommerceDispatch,
  normalizeReportV4CommerceJob,
  normalizeReportV4CommerceJobs,
} from "./report-v4-commerce-job-authority";

const base = (overrides: Record<string, unknown> = {}) => ({
  id: "job-1",
  reportId: "report-1",
  siteSnapshotId: "snap-1",
  tier: "deep",
  productContract: "recommendation_forensics_v1",
  fulfillmentMethodology: "two_stage_geo_report_v4",
  recommendationReportVersion: 4,
  artifactContract: "combined_geo_report_v4",
  businessQuestionSetId: "questions-1",
  locale: "en",
  reason: "standard",
  stage: "queued",
  executionState: "queued",
  currentPhase: "admission",
  checkpointRevision: 0,
  phaseAttempt: 0,
  resumeGeneration: 0,
  progress: 0,
  plannedPages: 0,
  successfulPages: 0,
  failedPages: 0,
  attempts: 0,
  maxAttempts: 3,
  errorCode: null,
  publicError: null,
  creditReservationId: "credit-1",
  ...overrides,
});
const dispatch = (overrides: Record<string, unknown> = {}) => ({
  id: "dispatch-1",
  jobId: "job-1",
  tier: "deep",
  schemaVersion: 1,
  state: "pending",
  attempts: 0,
  publishedAt: null,
  lastErrorCode: null,
  ...overrides,
});

describe("report v4 commerce authority", () => {
  it("accepts core, pre-admission, and enhancement lanes", () => {
    expect(normalizeReportV4CommerceJob(base()).reason).toBe("standard");
    expect(
      normalizeReportV4CommerceJob(
        base({
          reason: "v4_pre_admission",
          siteSnapshotId: null,
          businessQuestionSetId: null,
          creditReservationId: null,
        }),
      ).reason,
    ).toBe("v4_pre_admission");
    expect(
      normalizeReportV4CommerceJob(
        base({
          reason: "v4_diagnosis_enhancement",
          siteSnapshotId: null,
          creditReservationId: null,
        }),
      ).reason,
    ).toBe("v4_diagnosis_enhancement");
  });
  it("hashes IDs and omits sensitive fields", () => {
    const result = normalizeReportV4CommerceJob(base());
    expect(result.idHash).toHaveLength(64);
    expect(JSON.stringify(result)).not.toContain("job-1");
    expect(result).not.toHaveProperty("checkpoint");
  });
  it("rejects legacy standard jobs", () => {
    expect(() =>
      normalizeReportV4CommerceJob(
        base({
          productContract: "legacy_website_audit_v1",
          fulfillmentMethodology: null,
          recommendationReportVersion: null,
          artifactContract: null,
        }),
      ),
    ).toThrow();
  });
  it("enforces lane nullability", () => {
    expect(() =>
      normalizeReportV4CommerceJob(base({ siteSnapshotId: null })),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(
        base({
          reason: "v4_pre_admission",
          siteSnapshotId: "snap-1",
          businessQuestionSetId: null,
          creditReservationId: null,
        }),
      ),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(
        base({
          reason: "v4_diagnosis_enhancement",
          businessQuestionSetId: null,
        }),
      ),
    ).toThrow();
  });
  it("rejects unknown checkpoint lease correction replacement fields", () => {
    for (const key of [
      "checkpoint",
      "leaseOwner",
      "correctionId",
      "replacementFulfillmentId",
    ])
      expect(() => normalizeReportV4CommerceJob(base({ [key]: {} }))).toThrow();
  });
  it("rejects raw token URL and IP fields", () => {
    for (const key of ["accessToken", "url", "clientIp"])
      expect(() =>
        normalizeReportV4CommerceJob(base({ [key]: "raw" })),
      ).toThrow();
  });
  it("rejects missing empty and non-string IDs", () => {
    expect(() => normalizeReportV4CommerceJob(base({ id: "" }))).toThrow();
    expect(() => normalizeReportV4CommerceJob(base({ reportId: 2 }))).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(base({ siteSnapshotId: 2 })),
    ).toThrow();
  });
  it("rejects missing nullable lane fields and undefined nullable values", () => {
    for (const key of [
      "siteSnapshotId",
      "businessQuestionSetId",
      "creditReservationId",
    ]) {
      const value = base();
      delete value[key];
      expect(() => normalizeReportV4CommerceJob(value)).toThrow(/missing/);
      expect(() =>
        normalizeReportV4CommerceJob(base({ [key]: undefined })),
      ).toThrow();
    }
  });
  it("validates enum phase and numeric bounds", () => {
    for (const key of ["stage", "executionState", "currentPhase"])
      expect(() =>
        normalizeReportV4CommerceJob(base({ [key]: "bad" })),
      ).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(base({ progress: 101 })),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(base({ plannedPages: -1 })),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(base({ maxAttempts: 0 })),
    ).toThrow();
  });
  it("rejects undefined and nonfinite values", () => {
    expect(() =>
      normalizeReportV4CommerceJob(base({ attempts: undefined })),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceJob(base({ progress: Number.NaN })),
    ).toThrow();
  });
  it("sorts by ID hash and rejects duplicates", () => {
    const result = normalizeReportV4CommerceJobs([
      base({ id: "b" }),
      base({ id: "a" }),
    ]);
    expect(result[0].idHash.localeCompare(result[1].idHash)).toBeLessThan(0);
    expect(() => normalizeReportV4CommerceJobs([base(), base()])).toThrow(
      /duplicate/,
    );
  });
  it("accepts all dispatch states and timestamp", () => {
    for (const state of ["pending", "published", "abandoned"])
      expect(
        normalizeReportV4CommerceDispatch(
          dispatch({
            state,
            publishedAt:
              state === "pending" ? null : "2026-07-17T00:00:00.000Z",
          }),
        ).state,
      ).toBe(state);
  });
  it("rejects dispatch unknown lease and malformed values", () => {
    expect(() =>
      normalizeReportV4CommerceDispatch(dispatch({ leaseOwner: "x" })),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceDispatch(dispatch({ schemaVersion: 0 })),
    ).toThrow();
    expect(() =>
      normalizeReportV4CommerceDispatch(dispatch({ publishedAt: "bad" })),
    ).toThrow();
  });
  it("requires dispatch nullable fields and canonical timestamps", () => {
    for (const key of ["publishedAt", "lastErrorCode"]) {
      const value = dispatch();
      delete value[key];
      expect(() => normalizeReportV4CommerceDispatch(value)).toThrow(/missing/);
      expect(() =>
        normalizeReportV4CommerceDispatch(dispatch({ [key]: undefined })),
      ).toThrow();
    }
    expect(() =>
      normalizeReportV4CommerceDispatch(
        dispatch({ publishedAt: "2026-07-17T00:00:00Z" }),
      ),
    ).toThrow();
    expect(
      normalizeReportV4CommerceDispatch(
        dispatch({ publishedAt: new Date("2026-07-17T00:00:00Z") }),
      ).publishedAt,
    ).toBe("2026-07-17T00:00:00.000Z");
  });
  it("does not expose dispatch raw IDs", () => {
    const result = normalizeReportV4CommerceDispatch(dispatch());
    expect(JSON.stringify(result)).not.toContain("dispatch-1");
    expect(JSON.stringify(result)).not.toContain("job-1");
  });
});

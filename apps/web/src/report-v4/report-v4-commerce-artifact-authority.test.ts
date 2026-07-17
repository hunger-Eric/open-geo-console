import { describe, expect, it } from "vitest";
import {
  normalizeReportV4AccessTokens,
  normalizeReportV4ArtifactRevisions,
} from "./report-v4-commerce-artifact-authority";
const h = "a".repeat(64);
const t = "2026-07-17T00:00:00.000Z";
const token = (o: Record<string, unknown> = {}) => ({
  idHash: h,
  reportIdHash: h,
  tokenPrefixHash: h,
  artifactScope: "combined_geo_report_v4",
  expiresAt: t,
  lastUsedAt: null,
  revokedAt: null,
  ...o,
});
const art = (o: Record<string, unknown> = {}) => ({
  idHash: h,
  reportIdHash: h,
  orderIdHash: h,
  jobIdHash: h,
  configSnapshotIdHash: h,
  correctionIdHash: null,
  replacementFulfillmentIdHash: null,
  sourceArtifactRevisionIdHash: null,
  revisionKind: "generation",
  revision: 1,
  artifactContract: "combined_geo_report_v4",
  status: "pending",
  payloadIdentityHash: h,
  htmlSha256: null,
  pdfSha256: null,
  pdfStorageKeyPresent: false,
  readyAt: null,
  activatedAt: null,
  ...o,
});
describe("report v4 commerce artifact authority", () => {
  it("accepts token states and enhancement", () => {
    expect(
      normalizeReportV4AccessTokens([
        token({ idHash: "b".repeat(64), lastUsedAt: t, revokedAt: t }),
        token(),
      ]),
    ).toHaveLength(2);
    expect(
      normalizeReportV4ArtifactRevisions([
        art({
          idHash: "b".repeat(64),
          revisionKind: "diagnosis_enhancement",
          sourceArtifactRevisionIdHash: h,
          status: "ready",
          htmlSha256: h,
          readyAt: t,
        }),
      ]),
    ).toHaveLength(1);
  });
  it("sorts and rejects duplicate", () => {
    expect(
      normalizeReportV4AccessTokens([
        token({ idHash: "b".repeat(64) }),
        token(),
      ])[0].idHash,
    ).toBe(h);
    expect(() => normalizeReportV4AccessTokens([token(), token()])).toThrow();
  });
  const bad = (o: Record<string, unknown>) =>
    expect(() => normalizeReportV4ArtifactRevisions([art(o)])).toThrow();
  it("rejects contract, kind, source and legacy", () => {
    bad({ artifactContract: "combined_geo_report_v3" });
    bad({ revisionKind: "correction" });
    bad({ sourceArtifactRevisionIdHash: h });
    bad({ revisionKind: "diagnosis_enhancement" });
    bad({ correctionIdHash: h });
  });
  it("enforces ready html/pdf invariant", () => {
    bad({ status: "active", htmlSha256: null });
    bad({ status: "ready", htmlSha256: h, pdfSha256: h });
    bad({ status: "ready", htmlSha256: h, pdfStorageKeyPresent: true });
  });
  it("rejects malformed scalar values", () => {
    bad({ revision: 0 });
    bad({ idHash: "RAW" });
    bad({ readyAt: "2026-07-17T00:00:00Z" });
    bad({ pdfStorageKeyPresent: "x" });
  });
  it("requires token expiry and config snapshot", () => {
    expect(() =>
      normalizeReportV4AccessTokens([token({ expiresAt: null })]),
    ).toThrow();
    expect(() =>
      normalizeReportV4AccessTokens([token({ expiresAt: undefined })]),
    ).toThrow();
    bad({ configSnapshotIdHash: null });
    bad({ configSnapshotIdHash: undefined });
  });
  it("rejects PDF fields for pending and failed", () => {
    bad({ pdfSha256: h });
    bad({ pdfStorageKeyPresent: true, status: "failed" });
  });
  it("requires active timestamps", () => {
    bad({ status: "active", htmlSha256: h, readyAt: t, activatedAt: null });
    expect(
      normalizeReportV4ArtifactRevisions([
        art({ status: "active", htmlSha256: h, readyAt: t, activatedAt: t }),
      ]),
    ).toHaveLength(1);
  });
  it("rejects invalid dates and nonfinite revisions", () => {
    expect(() =>
      normalizeReportV4AccessTokens([
        token({ expiresAt: "2026-07-17T00:00:00.000+00:00" }),
      ]),
    ).toThrow();
    bad({ revision: Infinity });
  });
  it("rejects unknown and raw sensitive fields", () => {
    expect(() =>
      normalizeReportV4AccessTokens([token({ tokenPrefix: h })]),
    ).toThrow();
    expect(() =>
      normalizeReportV4AccessTokens([token({ tokenHmac: h })]),
    ).toThrow();
    expect(() =>
      normalizeReportV4ArtifactRevisions([art({ readiness: {} })]),
    ).toThrow();
    expect(() =>
      normalizeReportV4ArtifactRevisions([art({ payload: {} })]),
    ).toThrow();
  });
  it("does not leak input fields", () => {
    const out = normalizeReportV4AccessTokens([token()])[0];
    expect(out).not.toHaveProperty("tokenHmac");
    expect(out).not.toHaveProperty("createdAt");
  });
  it("rejects undefined, nonfinite and invalid token scope", () => {
    expect(() =>
      normalizeReportV4AccessTokens([token({ artifactScope: undefined })]),
    ).toThrow();
    bad({ revision: Infinity });
    expect(() =>
      normalizeReportV4AccessTokens([
        token({ artifactScope: "combined_geo_report_v3" }),
      ]),
    ).toThrow();
  });
});

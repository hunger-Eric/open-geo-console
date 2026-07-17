import { describe, expect, it } from "vitest";
import {
  normalizeReportV4DiagnosisCheckpointAuthorities,
  normalizeReportV4QuestionCheckpointAuthorities,
} from "./report-v4-commerce-checkpoint-authority";
const h = "a".repeat(64);
const q = (
  state: "answered" | "unavailable" = "answered",
  calls: 0 | 1 | 2 = 1,
) => ({
  identityHash: h,
  reportIdHash: h,
  jobIdHash: h,
  questionSetIdHash: h,
  questionIdHash: h,
  snapshotIdHash: h,
  ordinal: 1,
  state,
  questionIdentityHash: h,
  modelConfigIdentityHash: h,
  inputIdentityHash: h,
  providerCallCount: calls,
  sourcePayloadHash: h,
  sourceCount: state === "unavailable" ? 0 : 1,
  answerContentHash: state === "answered" ? h : null,
  terminalFingerprint: h,
});
const d = (
  state: "completed" | "failed" = "completed",
  calls: 0 | 1 | 2 = 1,
) => ({
  identityHash: h,
  reportIdHash: h,
  enhancementJobIdHash: h,
  coreArtifactRevisionIdHash: h,
  configSnapshotIdHash: h,
  questionSetIdHash: h,
  questionIdHash: h,
  snapshotIdHash: h,
  ordinal: 1,
  state,
  inputIdentityHash: h,
  providerCallCount: calls,
  sourceAuditPayloadHash: h,
  sourceAuditCount: 1,
  diagnosisContentHash: state === "completed" ? h : null,
  terminalFingerprint: h,
});
describe("commerce checkpoint authority", () => {
  it.each([
    q("answered", 1),
    q("answered", 2),
    q("unavailable", 0),
    q("unavailable", 2),
  ])("accepts valid question terminal", (x) =>
    expect(normalizeReportV4QuestionCheckpointAuthorities([x])).toHaveLength(1),
  );
  it.each([
    d("completed", 1),
    d("completed", 2),
    d("failed", 0),
    d("failed", 2),
  ])("accepts valid diagnosis terminal", (x) =>
    expect(normalizeReportV4DiagnosisCheckpointAuthorities([x])).toHaveLength(
      1,
    ),
  );
  it("sorts and rejects duplicates", () => {
    const a = q();
    const b = { ...q(), identityHash: "b".repeat(64) };
    expect(
      normalizeReportV4QuestionCheckpointAuthorities([b, a])[0]?.identityHash,
    ).toBe(h);
    expect(() =>
      normalizeReportV4QuestionCheckpointAuthorities([a, a]),
    ).toThrow(/duplicate/);
  });
  it.each([
    { state: "queued" },
    { providerCallCount: 3 },
    { ordinal: 4 },
    { identityHash: "x" },
    { sourceCount: -1 },
    { sourceCount: Number.MAX_SAFE_INTEGER + 1 },
    { answerContentHash: null },
    { answerPayload: "raw" },
    { sourcePayload: "raw" },
    { questionText: "raw" },
    { url: "raw" },
    { terminalFingerprint: undefined },
  ])("rejects malformed question", (change) =>
    expect(() =>
      normalizeReportV4QuestionCheckpointAuthorities([{ ...q(), ...change }]),
    ).toThrow(),
  );
  it.each([
    { state: "running" },
    { providerCallCount: 3 },
    { ordinal: 0 },
    { diagnosisContentHash: null },
    { diagnosis: "raw" },
    { diagnosisInput: "raw" },
    { sourceAudits: "raw" },
    { token: "raw" },
  ])("rejects malformed diagnosis", (change) =>
    expect(() =>
      normalizeReportV4DiagnosisCheckpointAuthorities([{ ...d(), ...change }]),
    ).toThrow(),
  );
  it.each([
    { sourceAuditCount: 6 },
    { sourceAuditCount: Number.NaN },
    { ordinal: Number.POSITIVE_INFINITY },
    { inputIdentityHash: undefined },
    { questionIdHash: undefined },
  ])("rejects diagnosis missing or invalid values", (change) =>
    expect(() =>
      normalizeReportV4DiagnosisCheckpointAuthorities([{ ...d(), ...change }]),
    ).toThrow(),
  );
  it("sorts and rejects diagnosis duplicates", () => {
    const a = d();
    const b = { ...d(), identityHash: "b".repeat(64) };
    expect(
      normalizeReportV4DiagnosisCheckpointAuthorities([b, a])[0]?.identityHash,
    ).toBe(h);
    expect(() =>
      normalizeReportV4DiagnosisCheckpointAuthorities([a, a]),
    ).toThrow(/duplicate/);
  });
  it("does not expose raw fields", () =>
    expect(
      JSON.stringify(normalizeReportV4QuestionCheckpointAuthorities([q()])),
    ).not.toMatch(/answerPayload|sourcePayload\W|questionText|canonicalUrl/));
});

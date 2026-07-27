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
  sourceRecords: state === "unavailable" ? [] : [{
    questionIdHash: h,
    sourceIdHash: "b".repeat(64),
    titleHash: h,
    canonicalUrlHash: h,
    citedTextHash: h,
    retrievalStatus: "not_checked" as const,
  }],
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
  sourceAuditRecords: [{
    questionIdHash: h,
    sourceIdHash: "b".repeat(64),
    canonicalUrlHash: h,
    status: "available" as const,
    summaryHash: h,
  }],
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
  it("canonically sorts hash-safe question source records", () => {
    const first = q().sourceRecords[0]!;
    const sourceRecords = [
      { ...first, sourceIdHash: "c".repeat(64), canonicalUrlHash: "c".repeat(64) },
      { ...first, sourceIdHash: "b".repeat(64), canonicalUrlHash: "b".repeat(64) },
    ];
    const [normalized] = normalizeReportV4QuestionCheckpointAuthorities([{ ...q(), sourceCount: 2, sourceRecords }]);
    expect(normalized?.sourceRecords.map((record) => record.sourceIdHash)).toEqual(["b".repeat(64), "c".repeat(64)]);
  });
  it.each([
    { sourceCount: 0 },
    { sourceRecords: [{ ...q().sourceRecords[0]!, questionIdHash: "c".repeat(64) }] },
    { sourceRecords: [q().sourceRecords[0], q().sourceRecords[0]] },
    { sourceRecords: [q().sourceRecords[0], { ...q().sourceRecords[0]!, sourceIdHash: "c".repeat(64) }] },
    { sourceRecords: [{ ...q().sourceRecords[0]!, retrievalStatus: "unknown" }] },
    { sourceRecords: [{ ...q().sourceRecords[0]!, canonicalUrl: "https://secret.example/" }] },
    { sourceRecords: [{ ...q().sourceRecords[0]!, title: "secret title" }] },
    { sourceRecords: [{ ...q().sourceRecords[0]!, citedText: "secret snippet" }] },
    { sourceRecords: [{ ...q().sourceRecords[0]!, extra: h }] },
  ])("rejects malformed or tampered question source authority", (change) =>
    expect(() => normalizeReportV4QuestionCheckpointAuthorities([{ ...q(), ...change }])).toThrow(),
  );
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
  it("canonically sorts hash-safe source audits and binds them to the checkpoint question", () => {
    const sourceAuditRecords = [
      { ...d().sourceAuditRecords[0]!, sourceIdHash: "c".repeat(64), canonicalUrlHash: "c".repeat(64) },
      { ...d().sourceAuditRecords[0]!, sourceIdHash: "b".repeat(64), canonicalUrlHash: "b".repeat(64) },
    ];
    const [normalized] = normalizeReportV4DiagnosisCheckpointAuthorities([
      { ...d(), sourceAuditCount: 2, sourceAuditRecords },
    ]);
    expect(normalized?.sourceAuditRecords.map((record) => record.sourceIdHash)).toEqual([
      "b".repeat(64),
      "c".repeat(64),
    ]);
  });
  it.each([
    { sourceAuditCount: 0 },
    { sourceAuditRecords: [{ ...d().sourceAuditRecords[0]!, status: "unknown" }] },
    { sourceAuditRecords: [{ ...d().sourceAuditRecords[0]!, questionIdHash: "c".repeat(64) }] },
    { sourceAuditRecords: [d().sourceAuditRecords[0], d().sourceAuditRecords[0]] },
    { sourceAuditRecords: [{ ...d().sourceAuditRecords[0]!, canonicalUrl: "https://secret.example/" }] },
    { sourceAuditRecords: [{ ...d().sourceAuditRecords[0]!, summary: "secret summary" }] },
    { sourceAuditRecords: [{ ...d().sourceAuditRecords[0]!, extra: h }] },
    { sourceAuditRecords: [{ ...d().sourceAuditRecords[0]!, status: "inaccessible", summaryHash: h }] },
  ])("rejects malformed or tampered diagnosis source-audit authority", (change) =>
    expect(() => normalizeReportV4DiagnosisCheckpointAuthorities([{ ...d(), ...change }])).toThrow(),
  );
  it("rejects duplicate canonical URL hashes across distinct source IDs", () => {
    const first = d().sourceAuditRecords[0]!;
    expect(() => normalizeReportV4DiagnosisCheckpointAuthorities([{ ...d(), sourceAuditCount: 2,
      sourceAuditRecords: [first, { ...first, sourceIdHash: "c".repeat(64) }] }]))
      .toThrow(/duplicate.*canonicalUrlHash/iu);
  });
  it("does not expose raw fields", () =>
    expect(
      JSON.stringify(normalizeReportV4QuestionCheckpointAuthorities([q()])),
    ).not.toMatch(/answerPayload|sourcePayload\W|questionText|canonicalUrl(?!Hash)/));
  it("does not expose question source plaintext", () => {
    const serialized = JSON.stringify(normalizeReportV4QuestionCheckpointAuthorities([q()]));
    expect(serialized).not.toMatch(/canonicalUrl\W|title\W|citedText\W|https?:\/\//iu);
  });
  it("does not expose source-audit URL or summary plaintext", () => {
    const serialized = JSON.stringify(normalizeReportV4DiagnosisCheckpointAuthorities([d()]));
    expect(serialized).not.toMatch(/canonicalUrl\W|summary\W|https?:\/\//iu);
  });
});

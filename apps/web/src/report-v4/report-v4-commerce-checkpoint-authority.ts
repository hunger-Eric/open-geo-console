const HASH = /^[a-f0-9]{64}$/u;
const FORBIDDEN =
  /^(answerpayload|sourcepayload|diagnosisinput|diagnosis|sourceaudits|questiontext|url|token|email)$/i;

export interface ReportV4QuestionCheckpointAuthority {
  readonly identityHash: string;
  readonly reportIdHash: string;
  readonly jobIdHash: string;
  readonly questionSetIdHash: string;
  readonly questionIdHash: string;
  readonly snapshotIdHash: string;
  readonly ordinal: 1 | 2 | 3;
  readonly state: "answered" | "unavailable";
  readonly questionIdentityHash: string;
  readonly modelConfigIdentityHash: string;
  readonly inputIdentityHash: string;
  readonly providerCallCount: 0 | 1 | 2;
  readonly sourcePayloadHash: string;
  readonly sourceCount: number;
  readonly answerContentHash: string | null;
  readonly terminalFingerprint: string;
}

export interface ReportV4DiagnosisCheckpointAuthority {
  readonly identityHash: string;
  readonly reportIdHash: string;
  readonly enhancementJobIdHash: string;
  readonly coreArtifactRevisionIdHash: string;
  readonly configSnapshotIdHash: string;
  readonly questionSetIdHash: string;
  readonly questionIdHash: string;
  readonly snapshotIdHash: string;
  readonly ordinal: 1 | 2 | 3;
  readonly state: "completed" | "failed";
  readonly inputIdentityHash: string;
  readonly providerCallCount: 0 | 1 | 2;
  readonly sourceAuditPayloadHash: string;
  readonly sourceAuditCount: number;
  readonly sourceAuditRecords: readonly ReportV4DiagnosisSourceAuditAuthorityRecord[];
  readonly diagnosisContentHash: string | null;
  readonly terminalFingerprint: string;
}

export interface ReportV4DiagnosisSourceAuditAuthorityRecord {
  readonly questionIdHash: string;
  readonly sourceIdHash: string;
  readonly canonicalUrlHash: string;
  readonly status: "available" | "inaccessible";
  readonly summaryHash: string | null;
}

export function normalizeReportV4QuestionCheckpointAuthorities(
  input: readonly unknown[],
): readonly ReportV4QuestionCheckpointAuthority[] {
  return normalize(input, questionFields, parseQuestion).sort(byIdentity);
}
export function normalizeReportV4DiagnosisCheckpointAuthorities(
  input: readonly unknown[],
): readonly ReportV4DiagnosisCheckpointAuthority[] {
  return normalize(input, diagnosisFields, parseDiagnosis).sort(byIdentity);
}

const questionFields = [
  "identityHash",
  "reportIdHash",
  "jobIdHash",
  "questionSetIdHash",
  "questionIdHash",
  "snapshotIdHash",
  "ordinal",
  "state",
  "questionIdentityHash",
  "modelConfigIdentityHash",
  "inputIdentityHash",
  "providerCallCount",
  "sourcePayloadHash",
  "sourceCount",
  "answerContentHash",
  "terminalFingerprint",
] as const;
const diagnosisFields = [
  "identityHash",
  "reportIdHash",
  "enhancementJobIdHash",
  "coreArtifactRevisionIdHash",
  "configSnapshotIdHash",
  "questionSetIdHash",
  "questionIdHash",
  "snapshotIdHash",
  "ordinal",
  "state",
  "inputIdentityHash",
  "providerCallCount",
  "sourceAuditPayloadHash",
  "sourceAuditCount",
  "sourceAuditRecords",
  "diagnosisContentHash",
  "terminalFingerprint",
] as const;
function normalize<T extends { identityHash: string }>(
  input: readonly unknown[],
  fields: readonly string[],
  parser: (v: unknown, f: readonly string[]) => T,
): T[] {
  if (!Array.isArray(input))
    throw new TypeError("authorities must be an array");
  const seen = new Set<string>();
  return input
    .map((v) => parser(v, fields))
    .map((v) => {
      const id = v.identityHash;
      if (seen.has(id)) throw new TypeError("duplicate identityHash");
      seen.add(id);
      return v;
    });
}
function parseQuestion(
  value: unknown,
  fields: readonly string[],
): ReportV4QuestionCheckpointAuthority {
  const r = record(value, fields);
  const state = literal(r.state, ["answered", "unavailable"]);
  const calls = count(r.providerCallCount);
  const answer = nullableHash(r.answerContentHash, "answerContentHash");
  const sourceCount = safeCount(r.sourceCount, 5);
  if (state === "answered" && (calls < 1 || answer === null))
    throw new TypeError("answered cross constraint");
  if (state === "unavailable" && (answer !== null || sourceCount !== 0))
    throw new TypeError("unavailable cross constraint");
  return {
    identityHash: hash(r.identityHash, "identityHash"),
    reportIdHash: hash(r.reportIdHash, "reportIdHash"),
    jobIdHash: hash(r.jobIdHash, "jobIdHash"),
    questionSetIdHash: hash(r.questionSetIdHash, "questionSetIdHash"),
    questionIdHash: hash(r.questionIdHash, "questionIdHash"),
    snapshotIdHash: hash(r.snapshotIdHash, "snapshotIdHash"),
    questionIdentityHash: hash(r.questionIdentityHash, "questionIdentityHash"),
    modelConfigIdentityHash: hash(
      r.modelConfigIdentityHash,
      "modelConfigIdentityHash",
    ),
    inputIdentityHash: hash(r.inputIdentityHash, "inputIdentityHash"),
    ordinal: ordinal(r.ordinal),
    state,
    providerCallCount: calls,
    sourcePayloadHash: hash(r.sourcePayloadHash, "sourcePayloadHash"),
    sourceCount,
    answerContentHash: answer,
    terminalFingerprint: hash(r.terminalFingerprint, "terminalFingerprint"),
  };
}
function parseDiagnosis(
  value: unknown,
  fields: readonly string[],
): ReportV4DiagnosisCheckpointAuthority {
  const r = record(value, fields);
  const state = literal(r.state, ["completed", "failed"]);
  const calls = count(r.providerCallCount);
  const diagnosis = nullableHash(
    r.diagnosisContentHash,
    "diagnosisContentHash",
  );
  const questionIdHash = hash(r.questionIdHash, "questionIdHash");
  const sourceAuditCount = safeCount(r.sourceAuditCount, 5);
  const sourceAuditRecords = parseSourceAuditRecords(r.sourceAuditRecords, questionIdHash);
  if (sourceAuditRecords.length !== sourceAuditCount)
    throw new TypeError("sourceAuditCount must equal sourceAuditRecords length");
  if (state === "completed" && (calls < 1 || diagnosis === null))
    throw new TypeError("completed cross constraint");
  if (state === "failed" && diagnosis !== null)
    throw new TypeError("failed cross constraint");
  return {
    identityHash: hash(r.identityHash, "identityHash"),
    reportIdHash: hash(r.reportIdHash, "reportIdHash"),
    enhancementJobIdHash: hash(r.enhancementJobIdHash, "enhancementJobIdHash"),
    coreArtifactRevisionIdHash: hash(
      r.coreArtifactRevisionIdHash,
      "coreArtifactRevisionIdHash",
    ),
    configSnapshotIdHash: hash(r.configSnapshotIdHash, "configSnapshotIdHash"),
    questionSetIdHash: hash(r.questionSetIdHash, "questionSetIdHash"),
    questionIdHash,
    snapshotIdHash: hash(r.snapshotIdHash, "snapshotIdHash"),
    inputIdentityHash: hash(r.inputIdentityHash, "inputIdentityHash"),
    ordinal: ordinal(r.ordinal),
    state,
    providerCallCount: calls,
    sourceAuditPayloadHash: hash(
      r.sourceAuditPayloadHash,
      "sourceAuditPayloadHash",
    ),
    sourceAuditCount,
    sourceAuditRecords,
    diagnosisContentHash: diagnosis,
    terminalFingerprint: hash(r.terminalFingerprint, "terminalFingerprint"),
  };
}
function parseSourceAuditRecords(
  value: unknown,
  checkpointQuestionIdHash: string,
): readonly ReportV4DiagnosisSourceAuditAuthorityRecord[] {
  if (!Array.isArray(value) || value.length > 5)
    throw new TypeError("sourceAuditRecords must be an array of at most five rows");
  const fields = ["questionIdHash", "sourceIdHash", "canonicalUrlHash", "status", "summaryHash"] as const;
  const seen = new Set<string>();
  const seenCanonicalUrlHashes = new Set<string>();
  return value.map((item) => {
    const r = record(item, fields);
    const questionIdHash = hash(r.questionIdHash, "sourceAuditRecords.questionIdHash");
    if (questionIdHash !== checkpointQuestionIdHash)
      throw new TypeError("source audit question must equal checkpoint question");
    const sourceIdHash = hash(r.sourceIdHash, "sourceAuditRecords.sourceIdHash");
    if (seen.has(sourceIdHash)) throw new TypeError("duplicate source audit sourceIdHash");
    seen.add(sourceIdHash);
    const canonicalUrlHash = hash(r.canonicalUrlHash, "sourceAuditRecords.canonicalUrlHash");
    if (seenCanonicalUrlHashes.has(canonicalUrlHash))
      throw new TypeError("duplicate source audit canonicalUrlHash");
    seenCanonicalUrlHashes.add(canonicalUrlHash);
    const status = literal(r.status, ["available", "inaccessible"]);
    const summaryHash = nullableHash(r.summaryHash, "sourceAuditRecords.summaryHash");
    if (status === "inaccessible" && summaryHash !== null)
      throw new TypeError("inaccessible source audit summaryHash must be null");
    return {
      questionIdHash,
      sourceIdHash,
      canonicalUrlHash,
      status,
      summaryHash,
    };
  }).sort((left, right) => left.sourceIdHash.localeCompare(right.sourceIdHash));
}
function record(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("authority must be an object");
  const r = value as Record<string, unknown>;
  for (const key of Object.keys(r)) {
    if (FORBIDDEN.test(key) || !fields.includes(key))
      throw new TypeError(`unknown field ${key}`);
    if (r[key] === undefined) throw new TypeError("undefined is not allowed");
  }
  for (const key of fields)
    if (!(key in r)) throw new TypeError(`missing field ${key}`);
  return r;
}
function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH.test(value))
    throw new TypeError(`${label} must be lowercase sha256`);
  return value;
}
function nullableHash(value: unknown, label: string): string | null {
  return value === null ? null : hash(value, label);
}
function count(value: unknown): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2)
    throw new TypeError("providerCallCount must be 0..2");
  return value;
}
function safeCount(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  )
    throw new TypeError("count must be a safe non-negative integer");
  return value;
}
function ordinal(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3)
    throw new TypeError("ordinal must be 1..3");
  return value;
}
function literal<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string") throw new TypeError("invalid state");
  const matched = allowed.find((candidate) => candidate === value);
  if (matched === undefined) throw new TypeError("invalid state");
  return matched;
}
function byIdentity(
  a: { identityHash: string },
  b: { identityHash: string },
): number {
  return a.identityHash.localeCompare(b.identityHash);
}

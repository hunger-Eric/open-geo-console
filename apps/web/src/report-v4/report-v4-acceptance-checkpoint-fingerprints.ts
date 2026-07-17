import { createHash } from "node:crypto";
import {
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput,
  type ReportV4DiagnosisInput
} from "@open-geo-console/ai-report-engine";
import type {
  ReportV4QuestionCheckpoint,
  ReportV4QuestionCheckpointAnswerPayload,
  ReportV4QuestionCheckpointSourcePayload
} from "../db/report-v4-question-checkpoints";
import type {
  ReportV4DiagnosisCheckpoint,
  ReportV4DiagnosisSourceAudit
} from "../db/report-v4-diagnosis-checkpoints";

export const REPORT_V4_QUESTION_TERMINAL_CHECKPOINT_FINGERPRINT_CONTRACT =
  "report-v4-question-terminal-checkpoint/v1" as const;
export const REPORT_V4_DIAGNOSIS_TERMINAL_CHECKPOINT_FINGERPRINT_CONTRACT =
  "report-v4-diagnosis-terminal-checkpoint/v1" as const;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

const QUESTION_FIELDS = [
  "identityHash", "reportId", "jobId", "questionSetId", "questionId", "snapshotId", "ordinal",
  "questionIdentityHash", "modelConfigIdentityHash", "inputIdentityHash", "state", "providerCallCount",
  "answerPayload", "sourcePayload", "answerContentHash"
] as const;
const ANSWER_FIELDS = ["order", "questionId", "questionText", "status", "answer"] as const;
const SOURCE_FIELDS = ["questionId", "sourceId", "title", "canonicalUrl", "citedText", "retrievalStatus"] as const;
const DIAGNOSIS_FIELDS = [
  "reportId", "enhancementJobId", "coreArtifactRevisionId", "configSnapshotId", "questionSetId", "snapshotId",
  "questionId", "ordinal", "identityHash", "state", "inputIdentityHash", "diagnosisInput", "providerCallCount",
  "sourceAudits", "diagnosis", "diagnosisContentHash"
] as const;

/**
 * Hashes the exact terminal checkpoint identity used by protected-Staging
 * acceptance. This is not vendor token-usage, provider-call, or commerce
 * evidence, and the returned value never exposes checkpoint prose or URLs.
 */
export function computeReportV4QuestionTerminalCheckpointFingerprint(
  value: ReportV4QuestionCheckpoint
): string {
  const checkpoint = strictRecord(value, QUESTION_FIELDS, "question checkpoint");
  const state = checkpoint.state;
  if (state !== "answered" && state !== "unavailable") {
    throw new TypeError("A terminal Report V4 question checkpoint must be answered or unavailable.");
  }
  const ordinal = questionOrdinal(checkpoint.ordinal);
  const questionId = boundedText(checkpoint.questionId, "questionId", 500);
  const providerCallCount = callCount(checkpoint.providerCallCount, "providerCallCount");
  const sourcePayload = parseQuestionSources(checkpoint.sourcePayload, questionId);
  const common = {
    identityHash: hash(checkpoint.identityHash, "identityHash"),
    reportId: boundedText(checkpoint.reportId, "reportId", 500),
    jobId: boundedText(checkpoint.jobId, "jobId", 500),
    questionSetId: boundedText(checkpoint.questionSetId, "questionSetId", 500),
    questionId,
    snapshotId: boundedText(checkpoint.snapshotId, "snapshotId", 500),
    ordinal,
    questionIdentityHash: hash(checkpoint.questionIdentityHash, "questionIdentityHash"),
    modelConfigIdentityHash: hash(checkpoint.modelConfigIdentityHash, "modelConfigIdentityHash"),
    inputIdentityHash: hash(checkpoint.inputIdentityHash, "inputIdentityHash")
  };
  const expectedIdentityHash = digest(JSON.stringify({
    reportId: common.reportId,
    jobId: common.jobId,
    questionSetId: common.questionSetId,
    snapshotId: common.snapshotId,
    modelConfigIdentityHash: common.modelConfigIdentityHash,
    order: common.ordinal,
    questionId: common.questionId,
    questionIdentityHash: common.questionIdentityHash,
    inputIdentityHash: common.inputIdentityHash
  }));
  if (common.identityHash !== expectedIdentityHash) {
    throw new TypeError("Report V4 question checkpoint immutable identity hash is inconsistent.");
  }

  let answerPayload: ReportV4QuestionCheckpointAnswerPayload | null;
  let answerContentHash: string | null;
  if (state === "answered") {
    if (providerCallCount < 1) throw new TypeError("An answered Report V4 question requires one or two provider calls.");
    answerPayload = parseQuestionAnswer(checkpoint.answerPayload, questionId, ordinal);
    answerContentHash = hash(checkpoint.answerContentHash, "answerContentHash");
    const expectedContentHash = digest(JSON.stringify({ answerPayload, sourcePayload }));
    if (answerContentHash !== expectedContentHash) {
      throw new TypeError("Report V4 question answer content hash is inconsistent.");
    }
  } else {
    if (checkpoint.answerPayload !== null || checkpoint.answerContentHash !== null || sourcePayload.length !== 0) {
      throw new TypeError("An unavailable Report V4 question cannot retain answer or source payload content.");
    }
    answerPayload = null;
    answerContentHash = null;
  }

  return fingerprint({
    version: REPORT_V4_QUESTION_TERMINAL_CHECKPOINT_FINGERPRINT_CONTRACT,
    checkpoint: {
      ...common,
      state,
      providerCallCount,
      answerPayload,
      sourcePayload,
      answerContentHash
    }
  });
}

/** See computeReportV4QuestionTerminalCheckpointFingerprint. */
export function computeReportV4DiagnosisTerminalCheckpointFingerprint(
  value: ReportV4DiagnosisCheckpoint
): string {
  const checkpoint = strictRecord(value, DIAGNOSIS_FIELDS, "diagnosis checkpoint");
  const state = checkpoint.state;
  if (state !== "completed" && state !== "failed") {
    throw new TypeError("A terminal Report V4 diagnosis checkpoint must be completed or failed.");
  }
  const lineage = {
    reportId: boundedText(checkpoint.reportId, "reportId", 500),
    enhancementJobId: boundedText(checkpoint.enhancementJobId, "enhancementJobId", 500),
    coreArtifactRevisionId: boundedText(checkpoint.coreArtifactRevisionId, "coreArtifactRevisionId", 500),
    configSnapshotId: boundedText(checkpoint.configSnapshotId, "configSnapshotId", 500),
    questionSetId: boundedText(checkpoint.questionSetId, "questionSetId", 500),
    snapshotId: boundedText(checkpoint.snapshotId, "snapshotId", 500),
    questionId: boundedText(checkpoint.questionId, "questionId", 500),
    ordinal: questionOrdinal(checkpoint.ordinal)
  };
  const diagnosisInput = parseReportV4DiagnosisInput(checkpoint.diagnosisInput);
  if (diagnosisInput.question.questionId !== lineage.questionId) {
    throw new TypeError("Report V4 diagnosis input does not match its question lineage.");
  }
  const inputIdentityHash = hash(checkpoint.inputIdentityHash, "inputIdentityHash");
  if (inputIdentityHash !== fingerprint(diagnosisInput)) {
    throw new TypeError("Report V4 diagnosis input identity hash is inconsistent.");
  }
  const identityHash = hash(checkpoint.identityHash, "identityHash");
  if (identityHash !== fingerprint({ ...lineage, inputIdentityHash })) {
    throw new TypeError("Report V4 diagnosis checkpoint immutable identity hash is inconsistent.");
  }
  const providerCallCount = callCount(checkpoint.providerCallCount, "providerCallCount");
  const sourceAudits = parseDiagnosisSourceAudits(
    checkpoint.sourceAudits,
    diagnosisInput,
    state === "failed" && providerCallCount === 0
  );

  let diagnosis: ReturnType<typeof parseReportV4DiagnosisOutput> | null;
  let diagnosisContentHash: string | null;
  if (state === "completed") {
    if (providerCallCount < 1) throw new TypeError("A completed Report V4 diagnosis requires one or two provider calls.");
    diagnosis = parseReportV4DiagnosisOutput(checkpoint.diagnosis, diagnosisInput);
    diagnosisContentHash = hash(checkpoint.diagnosisContentHash, "diagnosisContentHash");
    if (diagnosisContentHash !== fingerprint(diagnosis)) {
      throw new TypeError("Report V4 diagnosis content hash is inconsistent.");
    }
  } else {
    if (checkpoint.diagnosis !== null || checkpoint.diagnosisContentHash !== null) {
      throw new TypeError("A failed Report V4 diagnosis cannot retain diagnosis output or a content hash.");
    }
    diagnosis = null;
    diagnosisContentHash = null;
  }

  return fingerprint({
    version: REPORT_V4_DIAGNOSIS_TERMINAL_CHECKPOINT_FINGERPRINT_CONTRACT,
    checkpoint: {
      ...lineage,
      identityHash,
      state,
      inputIdentityHash,
      diagnosisInput,
      providerCallCount,
      sourceAudits,
      diagnosis,
      diagnosisContentHash
    }
  });
}

function parseQuestionAnswer(value: unknown, questionId: string, ordinal: 1 | 2 | 3): ReportV4QuestionCheckpointAnswerPayload {
  const answer = strictRecord(value, ANSWER_FIELDS, "answerPayload");
  if (answer.status !== "answered" || answer.order !== ordinal || answer.questionId !== questionId) {
    throw new TypeError("Report V4 question answer payload does not match its exact terminal lineage.");
  }
  return {
    order: ordinal,
    questionId,
    questionText: boundedText(answer.questionText, "answerPayload.questionText", 10_000),
    status: "answered",
    answer: boundedText(answer.answer, "answerPayload.answer", 50_000)
  };
}

function parseQuestionSources(value: unknown, questionId: string): readonly ReportV4QuestionCheckpointSourcePayload[] {
  if (!Array.isArray(value) || value.length > 5) throw new TypeError("sourcePayload must contain at most five sources.");
  const ids = new Set<string>();
  const urls = new Set<string>();
  return value.map((entry, index) => {
    const source = strictRecord(entry, SOURCE_FIELDS, `sourcePayload[${index}]`);
    if (source.questionId !== questionId) throw new TypeError(`sourcePayload[${index}] does not match its question lineage.`);
    const sourceId = boundedText(source.sourceId, `sourcePayload[${index}].sourceId`, 500);
    const canonicalUrl = httpUrl(source.canonicalUrl, `sourcePayload[${index}].canonicalUrl`);
    if (ids.has(sourceId) || urls.has(canonicalUrl)) throw new TypeError("sourcePayload contains a duplicate source identity.");
    ids.add(sourceId);
    urls.add(canonicalUrl);
    if (source.retrievalStatus !== "not_checked" && source.retrievalStatus !== "available"
      && source.retrievalStatus !== "inaccessible") {
      throw new TypeError(`sourcePayload[${index}].retrievalStatus is invalid.`);
    }
    return {
      questionId,
      sourceId,
      title: boundedText(source.title, `sourcePayload[${index}].title`, 2_000),
      canonicalUrl,
      citedText: source.citedText === null ? null : boundedText(source.citedText, `sourcePayload[${index}].citedText`, 10_000),
      retrievalStatus: source.retrievalStatus
    };
  });
}

function parseDiagnosisSourceAudits(
  value: unknown,
  input: ReportV4DiagnosisInput,
  allowEmpty: boolean
): readonly ReportV4DiagnosisSourceAudit[] {
  if (!Array.isArray(value) || value.length > 5) throw new TypeError("Diagnosis source audits must contain at most five rows.");
  if (allowEmpty && value.length === 0) return [];
  if (value.length !== input.sources.length) throw new TypeError("Diagnosis source audits must preserve every input source.");
  const byId = new Map<string, ReportV4DiagnosisSourceAudit>();
  for (const [index, entry] of value.entries()) {
    const row = record(entry, `sourceAudits[${index}]`);
    const expectedFields = Object.hasOwn(row, "summary")
      ? ["questionId", "sourceId", "canonicalUrl", "status", "summary"] as const
      : ["questionId", "sourceId", "canonicalUrl", "status"] as const;
    strictKeys(row, expectedFields, `sourceAudits[${index}]`);
    const questionId = boundedText(row.questionId, `sourceAudits[${index}].questionId`, 500);
    const sourceId = boundedText(row.sourceId, `sourceAudits[${index}].sourceId`, 500);
    const canonicalUrl = httpUrl(row.canonicalUrl, `sourceAudits[${index}].canonicalUrl`);
    if (row.status !== "available" && row.status !== "inaccessible") {
      throw new TypeError(`sourceAudits[${index}].status is invalid.`);
    }
    if (byId.has(sourceId)) throw new TypeError("Diagnosis source audit source IDs must be unique.");
    const summary = Object.hasOwn(row, "summary")
      ? boundedText(row.summary, `sourceAudits[${index}].summary`, 5_000)
      : undefined;
    if (row.status === "inaccessible" && summary !== undefined) {
      throw new TypeError("An inaccessible diagnosis source audit cannot retain a summary.");
    }
    byId.set(sourceId, {
      questionId, sourceId, canonicalUrl, status: row.status, ...(summary === undefined ? {} : { summary })
    });
  }
  return input.sources.map((source) => {
    const audit = byId.get(source.sourceId);
    if (!audit || audit.questionId !== input.question.questionId || audit.canonicalUrl !== source.canonicalUrl
      || audit.status !== source.retrievalStatus) {
      throw new TypeError("Diagnosis source audit does not match its exact question/source lineage.");
    }
    return audit;
  });
}

function fingerprint(value: unknown): string {
  return digest(stableJson(value));
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown, path = "$fingerprint"): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} cannot contain a non-finite number.`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((child, index) => stableJson(child, `${path}[${index}]`)).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => {
        if (child === undefined) throw new TypeError(`${path}.${key} cannot be undefined.`);
        return `${JSON.stringify(key)}:${stableJson(child, `${path}.${key}`)}`;
      }).join(",")}}`;
  }
  throw new TypeError(`${path} contains a non-JSON value.`);
}

function strictRecord<const Fields extends readonly string[]>(value: unknown, fields: Fields, label: string): Record<Fields[number], unknown> {
  const parsed = record(value, label);
  strictKeys(parsed, fields, label);
  return parsed as Record<Fields[number], unknown>;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function strictKeys(value: Record<string, unknown>, fields: readonly string[], label: string): void {
  const expected = new Set(fields);
  const unknown = Object.keys(value).find((field) => !expected.has(field));
  const missing = fields.find((field) => !Object.hasOwn(value, field));
  if (unknown || missing) throw new TypeError(`${label} has an unknown or missing field ${unknown ?? missing}.`);
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > maximum) {
    throw new TypeError(`${label} must be non-empty bounded trimmed text.`);
  }
  return value;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}

function questionOrdinal(value: unknown): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) throw new TypeError("ordinal must be 1, 2, or 3.");
  return value;
}

function callCount(value: unknown, label: string): 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) throw new TypeError(`${label} must be a provider call count from zero through two.`);
  return value;
}

function httpUrl(value: unknown, label: string): string {
  const text = boundedText(value, label, 2_000);
  try {
    const url = new URL(text);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error();
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${label} must be an HTTP(S) URL without credentials.`);
  }
}

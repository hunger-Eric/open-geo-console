import { createHash } from "node:crypto";

export const REPORT_SEMANTIC_REVIEW_CONTRACT = "report-semantic-review-v1" as const;

export type ReportSemanticReviewLifecycle = "free_v4" | "paid_v3";
export type ReportSemanticFieldMutability = "mutable" | "read_only";
export type ReportSemanticFieldDecision = "pass" | "corrected" | "blocked";
export type ReportSemanticReviewDecision = "pass" | "corrected" | "blocked";
export type ReportQuestionDistinctnessDecision = "distinct" | "duplicate" | "blocked";

export interface ReportSemanticTargetIdentity {
  readonly siteKey: string;
  readonly targetUrl: string;
  readonly aliases: readonly string[];
}

export interface ReportSemanticExpectedModel {
  readonly providerId: string;
  readonly modelId: string;
}

export interface ReportSemanticQuestion {
  readonly questionId: string;
  readonly originalText: string;
  readonly originalTextHash: string;
}

export interface ReportSemanticSource {
  readonly sourceId: string;
  readonly questionId: string | null;
  readonly canonicalUrl: string;
  readonly originalText: string;
  readonly originalTextHash: string;
}

export interface ReportSemanticEvidence {
  readonly evidenceId: string;
  readonly questionId: string | null;
  readonly sourceId: string | null;
  readonly originalText: string;
  readonly originalTextHash: string;
}

export interface ReportSemanticObservationResult {
  readonly observationId: string;
  readonly resultId: string;
  readonly questionId: string | null;
  readonly originalText: string;
  readonly originalTextHash: string;
}
export interface ReportSemanticAnswerSubject { readonly questionId: string; readonly fieldPath: string; }

export interface ReportSemanticFieldManifestEntry {
  readonly path: string;
  readonly originalText: string;
  readonly originalTextHash: string;
  readonly mutability: ReportSemanticFieldMutability;
  readonly questionId: string | null;
  readonly allowedEvidenceIds: readonly string[];
  readonly allowedSourceIds: readonly string[];
}

export interface ReportSemanticReviewInputCore {
  readonly version: typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
  readonly lifecycle: ReportSemanticReviewLifecycle;
  readonly locale: string;
  readonly target: ReportSemanticTargetIdentity;
  readonly expectedModel: ReportSemanticExpectedModel;
  readonly questions: readonly ReportSemanticQuestion[];
  readonly sources: readonly ReportSemanticSource[];
  readonly evidence: readonly ReportSemanticEvidence[];
  readonly observationResults: readonly ReportSemanticObservationResult[];
  readonly answerSubjects: readonly ReportSemanticAnswerSubject[];
  readonly fields: readonly ReportSemanticFieldManifestEntry[];
  readonly nonProseProjectionHash: string;
}

export interface ReportSemanticReviewInput extends ReportSemanticReviewInputCore {
  readonly inputHash: string;
}

export interface ReportSemanticRetainedTerm {
  readonly term: string;
  readonly reason: string;
}

export interface ReportSemanticFieldResult {
  readonly path: string;
  readonly originalTextHash: string;
  readonly decision: ReportSemanticFieldDecision;
  readonly correctedText?: string;
  readonly issueCodes: readonly string[];
  readonly reason: string;
  readonly evidenceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly retainedOriginalTerms: readonly ReportSemanticRetainedTerm[];
}

export interface ReportQuestionDistinctnessResult {
  readonly decision: ReportQuestionDistinctnessDecision;
  readonly duplicateGroups: readonly (readonly string[])[];
  readonly reason: string;
}

export type ReportSemanticPresence = "present" | "absent" | "ambiguous";
export interface ReportSemanticObservationAnnotation {
  readonly observationId: string;
  readonly resultId: string;
  readonly targetPresence: ReportSemanticPresence;
  readonly competitorPresence: ReportSemanticPresence;
  readonly reason: string;
}
export interface ReportSemanticAnswerAnnotation {
  readonly questionId: string;
  readonly relevance: "responsive" | "not_responsive" | "blocked";
  readonly entityRole: "target" | "competitor" | "mixed" | "none" | "ambiguous";
  readonly evidenceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly reason: string;
}
export interface ReportSemanticEvidenceUseAnnotation {
  readonly path: string;
  readonly evidenceIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly reason: string;
}
export interface ReportSemanticAnnotations {
  readonly observationResults: readonly ReportSemanticObservationAnnotation[];
  readonly answers: readonly ReportSemanticAnswerAnnotation[];
  readonly evidenceUse: readonly ReportSemanticEvidenceUseAnnotation[];
}

export interface ReportSemanticReviewOutput {
  readonly version: typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
  readonly inputHash: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly fields: readonly ReportSemanticFieldResult[];
  readonly questionDistinctness: ReportQuestionDistinctnessResult;
  readonly annotations: ReportSemanticAnnotations;
  readonly overallDecision: ReportSemanticReviewDecision;
}

export interface AppliedReportSemanticField {
  readonly path: string;
  readonly originalTextHash: string;
  readonly appliedText: string;
  readonly appliedTextHash: string;
  readonly decision: "pass" | "corrected";
}

export interface ReportSemanticReceiptField {
  readonly path: string;
  readonly originalTextHash: string;
  readonly appliedTextHash: string;
  readonly decision: "pass" | "corrected";
}

export interface ReportSemanticReviewReceipt {
  readonly version: typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
  readonly lifecycle: ReportSemanticReviewLifecycle;
  readonly inputHash: string;
  readonly reviewHash: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly decision: "pass" | "corrected";
  readonly fieldCoverageHash: string;
  readonly appliedProseHash: string;
  readonly annotationsHash: string;
  readonly nonProseProjectionHash: string;
  readonly fields: readonly ReportSemanticReceiptField[];
}

export interface AppliedReportSemanticReview {
  readonly fields: readonly AppliedReportSemanticField[];
  readonly annotations: ReportSemanticAnnotations;
  readonly receipt: ReportSemanticReviewReceipt;
}

const INPUT_KEYS = new Set([
  "version", "lifecycle", "locale", "target", "expectedModel", "questions", "sources", "evidence", "fields",
  "observationResults", "answerSubjects", "nonProseProjectionHash", "inputHash"
]);
const TARGET_KEYS = new Set(["siteKey", "targetUrl", "aliases"]);
const MODEL_KEYS = new Set(["providerId", "modelId"]);
const QUESTION_KEYS = new Set(["questionId", "originalText", "originalTextHash"]);
const SOURCE_KEYS = new Set(["sourceId", "questionId", "canonicalUrl", "originalText", "originalTextHash"]);
const EVIDENCE_KEYS = new Set(["evidenceId", "questionId", "sourceId", "originalText", "originalTextHash"]);
const OBSERVATION_RESULT_KEYS = new Set(["observationId", "resultId", "questionId", "originalText", "originalTextHash"]);
const ANSWER_SUBJECT_KEYS = new Set(["questionId", "fieldPath"]);
const FIELD_KEYS = new Set([
  "path", "originalText", "originalTextHash", "mutability", "questionId", "allowedEvidenceIds", "allowedSourceIds"
]);
const OUTPUT_KEYS = new Set([
  "version", "inputHash", "providerId", "modelId", "fields", "questionDistinctness", "annotations", "overallDecision"
]);
const FIELD_RESULT_KEYS = new Set([
  "path", "originalTextHash", "decision", "correctedText", "issueCodes", "reason", "evidenceIds", "sourceIds",
  "retainedOriginalTerms"
]);
const RETAINED_TERM_KEYS = new Set(["term", "reason"]);
const DISTINCTNESS_KEYS = new Set(["decision", "duplicateGroups", "reason"]);
const ANNOTATIONS_KEYS = new Set(["observationResults", "answers", "evidenceUse"]);
const OBSERVATION_ANNOTATION_KEYS = new Set(["observationId", "resultId", "targetPresence", "competitorPresence", "reason"]);
const ANSWER_ANNOTATION_KEYS = new Set(["questionId", "relevance", "entityRole", "evidenceIds", "sourceIds", "reason"]);
const EVIDENCE_USE_KEYS = new Set(["path", "evidenceIds", "sourceIds", "reason"]);
const RECEIPT_KEYS = new Set([
  "version", "lifecycle", "inputHash", "reviewHash", "providerId", "modelId", "decision", "fieldCoverageHash",
  "appliedProseHash", "annotationsHash", "nonProseProjectionHash", "fields"
]);
const RECEIPT_FIELD_KEYS = new Set(["path", "originalTextHash", "appliedTextHash", "decision"]);

const MAX_ID_CHARS = 500;
const MAX_PATH_CHARS = 1_000;
const MAX_TEXT_CHARS = 200_000;
const MAX_FIELDS = 2_000;
const MAX_CATALOG_ROWS = 10_000;
const MAX_REFS_PER_FIELD = 2_000;

export function reportSemanticTextHash(value: string): string {
  return sha256(requireBoundedText(value, "semantic text", MAX_TEXT_CHARS));
}

export function hashReportSemanticReviewValue(value: unknown): string {
  return sha256(canonicalJson(value));
}

export function createReportSemanticReviewInput(value: ReportSemanticReviewInputCore): ReportSemanticReviewInput {
  const core = parseInputCore(value);
  return { ...core, inputHash: hashReportSemanticReviewValue(core) };
}

export function parseReportSemanticReviewInput(value: unknown): ReportSemanticReviewInput {
  const record = strictRecord(value, "$reviewInput", INPUT_KEYS);
  const core = parseInputCore(record);
  const inputHash = requireHash(record.inputHash, "$reviewInput.inputHash");
  const expectedHash = hashReportSemanticReviewValue(core);
  if (inputHash !== expectedHash) {
    throw new TypeError("$reviewInput.inputHash does not match the canonical review input.");
  }
  return { ...core, inputHash };
}

export function parseReportSemanticReviewOutput(
  value: unknown,
  rawInput: unknown
): ReportSemanticReviewOutput {
  const input = parseReportSemanticReviewInput(rawInput);
  const record = strictRecord(value, "$reviewOutput", OUTPUT_KEYS);
  requireExact(record.version, REPORT_SEMANTIC_REVIEW_CONTRACT, "$reviewOutput.version");
  requireExact(record.inputHash, input.inputHash, "$reviewOutput.inputHash");
  const providerId = requireBoundedText(record.providerId, "$reviewOutput.providerId", MAX_ID_CHARS);
  const modelId = requireBoundedText(record.modelId, "$reviewOutput.modelId", MAX_ID_CHARS);
  requireExact(providerId, input.expectedModel.providerId, "$reviewOutput.providerId");
  requireExact(modelId, input.expectedModel.modelId, "$reviewOutput.modelId");

  const fieldRows = requireArray(record.fields, "$reviewOutput.fields", MAX_FIELDS);
  if (fieldRows.length !== input.fields.length) {
    throw new TypeError("$reviewOutput.fields must cover every input field exactly once and in order.");
  }
  const fields = fieldRows.map((row, index) => parseFieldResult(row, input.fields[index]!, input, index));
  assertUnique(fields.map(({ path }) => path), "$reviewOutput.fields paths");
  const questionDistinctness = parseQuestionDistinctness(record.questionDistinctness, input);
  const annotations = parseAnnotations(record.annotations, input);
  const overallDecision = requireOneOf(
    record.overallDecision,
    ["pass", "corrected", "blocked"] as const,
    "$reviewOutput.overallDecision"
  );
  const expectedDecision = deriveOverallDecision(fields, questionDistinctness, annotations);
  if (overallDecision !== expectedDecision) {
    throw new TypeError(`$reviewOutput.overallDecision must equal ${expectedDecision}.`);
  }
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    inputHash: input.inputHash,
    providerId,
    modelId,
    fields,
    questionDistinctness,
    annotations,
    overallDecision
  };
}

export function applyReportSemanticReview(
  rawInput: unknown,
  rawReview: unknown,
  currentNonProseProjectionHash?: string
): AppliedReportSemanticReview {
  const input = parseReportSemanticReviewInput(rawInput);
  const review = parseReportSemanticReviewOutput(rawReview, input);
  const currentNonProseHash = requireHash(
    currentNonProseProjectionHash ?? input.nonProseProjectionHash,
    "currentNonProseProjectionHash"
  );
  if (currentNonProseHash !== input.nonProseProjectionHash) {
    throw new TypeError("The non-prose projection changed after semantic-review input creation.");
  }
  if (review.overallDecision === "blocked") {
    throw new TypeError("A blocked semantic review cannot be applied.");
  }
  const fields = review.fields.map((result, index): AppliedReportSemanticField => {
    const manifest = input.fields[index]!;
    if (result.decision === "blocked") throw new TypeError("A blocked semantic field cannot be applied.");
    const appliedText = result.decision === "corrected" ? result.correctedText! : manifest.originalText;
    return {
      path: manifest.path,
      originalTextHash: manifest.originalTextHash,
      appliedText,
      appliedTextHash: reportSemanticTextHash(appliedText),
      decision: result.decision
    };
  });
  const receiptFields = fields.map(({ path, originalTextHash, appliedTextHash, decision }) => ({
    path,
    originalTextHash,
    appliedTextHash,
    decision
  }));
  const receipt: ReportSemanticReviewReceipt = {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    lifecycle: input.lifecycle,
    inputHash: input.inputHash,
    reviewHash: hashReportSemanticReviewValue(review),
    providerId: review.providerId,
    modelId: review.modelId,
    decision: review.overallDecision,
    fieldCoverageHash: fieldCoverageHash(input.fields),
    appliedProseHash: appliedProseHash(fields),
    annotationsHash: hashReportSemanticReviewValue(review.annotations),
    nonProseProjectionHash: input.nonProseProjectionHash,
    fields: receiptFields
  };
  return { fields, annotations: review.annotations, receipt };
}

export function verifyReportSemanticReviewReceipt(
  value: unknown,
  rawInput: unknown,
  rawReview: unknown,
  rawAppliedFields: readonly AppliedReportSemanticField[],
  currentNonProseProjectionHash?: string
): ReportSemanticReviewReceipt {
  const input = parseReportSemanticReviewInput(rawInput);
  const review = parseReportSemanticReviewOutput(rawReview, input);
  if (review.overallDecision === "blocked") throw new TypeError("A blocked semantic review cannot have an applied receipt.");
  const fields = parseAppliedFields(rawAppliedFields, input);
  for (const [index, field] of fields.entries()) {
    const reviewed = review.fields[index]!;
    if (reviewed.decision !== field.decision
        || (reviewed.decision === "corrected" && reviewed.correctedText !== field.appliedText)) {
      throw new TypeError(`Applied semantic field ${field.path} does not match its reviewed result.`);
    }
  }
  const record = strictRecord(value, "$reviewReceipt", RECEIPT_KEYS);
  requireExact(record.version, REPORT_SEMANTIC_REVIEW_CONTRACT, "$reviewReceipt.version");
  requireExact(record.lifecycle, input.lifecycle, "$reviewReceipt.lifecycle");
  requireExact(record.inputHash, input.inputHash, "$reviewReceipt.inputHash");
  const reviewHash = requireHash(record.reviewHash, "$reviewReceipt.reviewHash");
  requireExact(reviewHash, hashReportSemanticReviewValue(review), "$reviewReceipt.reviewHash");
  const providerId = requireBoundedText(record.providerId, "$reviewReceipt.providerId", MAX_ID_CHARS);
  const modelId = requireBoundedText(record.modelId, "$reviewReceipt.modelId", MAX_ID_CHARS);
  requireExact(providerId, input.expectedModel.providerId, "$reviewReceipt.providerId");
  requireExact(modelId, input.expectedModel.modelId, "$reviewReceipt.modelId");
  const decision = requireOneOf(record.decision, ["pass", "corrected"] as const, "$reviewReceipt.decision");
  const expectedDecision = review.overallDecision;
  requireExact(decision, expectedDecision, "$reviewReceipt.decision");
  const coverageHash = requireHash(record.fieldCoverageHash, "$reviewReceipt.fieldCoverageHash");
  requireExact(coverageHash, fieldCoverageHash(input.fields), "$reviewReceipt.fieldCoverageHash");
  const proseHash = requireHash(record.appliedProseHash, "$reviewReceipt.appliedProseHash");
  requireExact(proseHash, appliedProseHash(fields), "$reviewReceipt.appliedProseHash");
  const annotationsHash = requireHash(record.annotationsHash, "$reviewReceipt.annotationsHash");
  requireExact(annotationsHash, hashReportSemanticReviewValue(review.annotations), "$reviewReceipt.annotationsHash");
  const nonProseHash = requireHash(record.nonProseProjectionHash, "$reviewReceipt.nonProseProjectionHash");
  requireExact(nonProseHash, input.nonProseProjectionHash, "$reviewReceipt.nonProseProjectionHash");
  requireExact(
    requireHash(currentNonProseProjectionHash ?? nonProseHash, "currentNonProseProjectionHash"),
    input.nonProseProjectionHash,
    "currentNonProseProjectionHash"
  );
  const receiptFields = parseReceiptFields(record.fields, input, fields);
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    lifecycle: input.lifecycle,
    inputHash: input.inputHash,
    reviewHash,
    providerId,
    modelId,
    decision,
    fieldCoverageHash: coverageHash,
    appliedProseHash: proseHash,
    annotationsHash,
    nonProseProjectionHash: nonProseHash,
    fields: receiptFields
  };
}

function parseInputCore(value: unknown): ReportSemanticReviewInputCore {
  const record = requireRecord(value, "$reviewInput");
  requireExact(record.version, REPORT_SEMANTIC_REVIEW_CONTRACT, "$reviewInput.version");
  const lifecycle = requireOneOf(record.lifecycle, ["free_v4", "paid_v3"] as const, "$reviewInput.lifecycle");
  const locale = requireBoundedText(record.locale, "$reviewInput.locale", 100);
  const targetRow = strictRecord(record.target, "$reviewInput.target", TARGET_KEYS);
  const target: ReportSemanticTargetIdentity = {
    siteKey: requireBoundedText(targetRow.siteKey, "$reviewInput.target.siteKey", MAX_ID_CHARS),
    targetUrl: requireSafeUrl(targetRow.targetUrl, "$reviewInput.target.targetUrl"),
    aliases: requireUniqueTextArray(targetRow.aliases, "$reviewInput.target.aliases", 500, MAX_ID_CHARS, true)
  };
  const modelRow = strictRecord(record.expectedModel, "$reviewInput.expectedModel", MODEL_KEYS);
  const expectedModel: ReportSemanticExpectedModel = {
    providerId: requireBoundedText(modelRow.providerId, "$reviewInput.expectedModel.providerId", MAX_ID_CHARS),
    modelId: requireBoundedText(modelRow.modelId, "$reviewInput.expectedModel.modelId", MAX_ID_CHARS)
  };
  const questions = requireArray(record.questions, "$reviewInput.questions", 3).map(parseQuestion);
  if (questions.length !== 3) throw new TypeError("$reviewInput.questions must contain exactly three questions.");
  assertUnique(questions.map(({ questionId }) => questionId), "$reviewInput.questions questionId");
  const questionIds = new Set(questions.map(({ questionId }) => questionId));
  const sources = requireArray(record.sources, "$reviewInput.sources", MAX_CATALOG_ROWS).map(parseSource);
  assertUnique(sources.map(({ sourceId }) => sourceId), "$reviewInput.sources sourceId");
  for (const source of sources) assertNullableOwner(source.questionId, questionIds, "$reviewInput.sources questionId");
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const evidence = requireArray(record.evidence, "$reviewInput.evidence", MAX_CATALOG_ROWS).map(parseEvidence);
  assertUnique(evidence.map(({ evidenceId }) => evidenceId), "$reviewInput.evidence evidenceId");
  for (const item of evidence) {
    assertNullableOwner(item.questionId, questionIds, "$reviewInput.evidence questionId");
    if (item.sourceId !== null) {
      const source = sourceById.get(item.sourceId);
      if (!source) throw new TypeError(`$reviewInput.evidence references unknown source ${item.sourceId}.`);
      if (item.questionId !== null && source.questionId !== null && source.questionId !== item.questionId) {
        throw new TypeError(`$reviewInput.evidence ${item.evidenceId} and source ${item.sourceId} have different question owners.`);
      }
    }
  }
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  const observationResults = requireArray(record.observationResults, "$reviewInput.observationResults", MAX_CATALOG_ROWS)
    .map(parseObservationResult);
  assertUnique(observationResults.map(({ observationId, resultId }) => `${observationId}:${resultId}`), "$reviewInput.observationResults identity");
  for (const item of observationResults) assertNullableOwner(item.questionId, questionIds, "$reviewInput.observationResults questionId");
  const observationOwners = new Map<string, string | null>();
  for (const item of observationResults) {
    const prior = observationOwners.get(item.observationId);
    if (prior !== undefined && prior !== item.questionId) throw new TypeError(`$reviewInput.observationResults ${item.observationId} has inconsistent question ownership.`);
    observationOwners.set(item.observationId, item.questionId);
  }
  const fields = requireArray(record.fields, "$reviewInput.fields", MAX_FIELDS).map(parseManifestField);
  if (fields.length === 0) throw new TypeError("$reviewInput.fields must not be empty.");
  assertUnique(fields.map(({ path }) => path), "$reviewInput.fields path");
  for (const field of fields) {
    assertNullableOwner(field.questionId, questionIds, `$reviewInput.fields ${field.path} questionId`);
    for (const evidenceId of field.allowedEvidenceIds) {
      const item = evidenceById.get(evidenceId);
      if (!item) throw new TypeError(`$reviewInput.fields ${field.path} allows unknown evidence ${evidenceId}.`);
      assertCompatibleOwner(field.questionId, item.questionId, `$reviewInput.fields ${field.path} evidence ${evidenceId}`);
    }
    for (const sourceId of field.allowedSourceIds) {
      const source = sourceById.get(sourceId);
      if (!source) throw new TypeError(`$reviewInput.fields ${field.path} allows unknown source ${sourceId}.`);
      assertCompatibleOwner(field.questionId, source.questionId, `$reviewInput.fields ${field.path} source ${sourceId}`);
    }
  }
  const answerSubjects = requireArray(record.answerSubjects, "$reviewInput.answerSubjects", 3).map((value, index) => {
    const path = `$reviewInput.answerSubjects[${index}]`;
    const row = strictRecord(value, path, ANSWER_SUBJECT_KEYS);
    const questionId = requireBoundedText(row.questionId, `${path}.questionId`, MAX_ID_CHARS);
    const fieldPath = requireBoundedText(row.fieldPath, `${path}.fieldPath`, MAX_PATH_CHARS);
    if (!questionIds.has(questionId)) throw new TypeError(`${path} references unknown question ${questionId}.`);
    if (!fields.some((field) => field.path === fieldPath && field.questionId === questionId)) throw new TypeError(`${path} is not an owned answer field.`);
    return { questionId, fieldPath };
  });
  if (answerSubjects.length === 0) throw new TypeError("$reviewInput.answerSubjects must include at least one answer subject.");
  assertUnique(answerSubjects.map(({ questionId }) => questionId), "$reviewInput.answerSubjects questionId");
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    lifecycle,
    locale,
    target,
    expectedModel,
    questions,
    sources,
    evidence,
    observationResults,
    answerSubjects,
    fields,
    nonProseProjectionHash: requireHash(record.nonProseProjectionHash, "$reviewInput.nonProseProjectionHash")
  };
}

function parseQuestion(value: unknown, index: number): ReportSemanticQuestion {
  const path = `$reviewInput.questions[${index}]`;
  const row = strictRecord(value, path, QUESTION_KEYS);
  const originalText = requireBoundedText(row.originalText, `${path}.originalText`, MAX_TEXT_CHARS);
  const originalTextHash = requireHash(row.originalTextHash, `${path}.originalTextHash`);
  requireExact(originalTextHash, reportSemanticTextHash(originalText), `${path}.originalTextHash`);
  return { questionId: requireBoundedText(row.questionId, `${path}.questionId`, MAX_ID_CHARS), originalText, originalTextHash };
}

function parseSource(value: unknown, index: number): ReportSemanticSource {
  const path = `$reviewInput.sources[${index}]`;
  const row = strictRecord(value, path, SOURCE_KEYS);
  const originalText = requireBoundedText(row.originalText, `${path}.originalText`, MAX_TEXT_CHARS);
  const originalTextHash = requireHash(row.originalTextHash, `${path}.originalTextHash`);
  requireExact(originalTextHash, reportSemanticTextHash(originalText), `${path}.originalTextHash`);
  return {
    sourceId: requireBoundedText(row.sourceId, `${path}.sourceId`, MAX_ID_CHARS),
    questionId: requireNullableText(row.questionId, `${path}.questionId`, MAX_ID_CHARS),
    canonicalUrl: requireSafeUrl(row.canonicalUrl, `${path}.canonicalUrl`),
    originalText,
    originalTextHash
  };
}

function parseEvidence(value: unknown, index: number): ReportSemanticEvidence {
  const path = `$reviewInput.evidence[${index}]`;
  const row = strictRecord(value, path, EVIDENCE_KEYS);
  const originalText = requireBoundedText(row.originalText, `${path}.originalText`, MAX_TEXT_CHARS);
  const originalTextHash = requireHash(row.originalTextHash, `${path}.originalTextHash`);
  requireExact(originalTextHash, reportSemanticTextHash(originalText), `${path}.originalTextHash`);
  return {
    evidenceId: requireBoundedText(row.evidenceId, `${path}.evidenceId`, MAX_ID_CHARS),
    questionId: requireNullableText(row.questionId, `${path}.questionId`, MAX_ID_CHARS),
    sourceId: requireNullableText(row.sourceId, `${path}.sourceId`, MAX_ID_CHARS),
    originalText,
    originalTextHash
  };
}

function parseObservationResult(value: unknown, index: number): ReportSemanticObservationResult {
  const path = `$reviewInput.observationResults[${index}]`;
  const row = strictRecord(value, path, OBSERVATION_RESULT_KEYS);
  const originalText = requireBoundedText(row.originalText, `${path}.originalText`, MAX_TEXT_CHARS);
  const originalTextHash = requireHash(row.originalTextHash, `${path}.originalTextHash`);
  requireExact(originalTextHash, reportSemanticTextHash(originalText), `${path}.originalTextHash`);
  return {
    observationId: requireBoundedText(row.observationId, `${path}.observationId`, MAX_ID_CHARS),
    resultId: requireBoundedText(row.resultId, `${path}.resultId`, MAX_ID_CHARS),
    questionId: requireNullableText(row.questionId, `${path}.questionId`, MAX_ID_CHARS), originalText, originalTextHash
  };
}

function parseManifestField(value: unknown, index: number): ReportSemanticFieldManifestEntry {
  const path = `$reviewInput.fields[${index}]`;
  const row = strictRecord(value, path, FIELD_KEYS);
  const originalText = requireBoundedText(row.originalText, `${path}.originalText`, MAX_TEXT_CHARS);
  const originalTextHash = requireHash(row.originalTextHash, `${path}.originalTextHash`);
  requireExact(originalTextHash, reportSemanticTextHash(originalText), `${path}.originalTextHash`);
  return {
    path: requireBoundedText(row.path, `${path}.path`, MAX_PATH_CHARS),
    originalText,
    originalTextHash,
    mutability: requireOneOf(row.mutability, ["mutable", "read_only"] as const, `${path}.mutability`),
    questionId: requireNullableText(row.questionId, `${path}.questionId`, MAX_ID_CHARS),
    allowedEvidenceIds: requireUniqueTextArray(
      row.allowedEvidenceIds,
      `${path}.allowedEvidenceIds`,
      MAX_REFS_PER_FIELD,
      MAX_ID_CHARS
    ),
    allowedSourceIds: requireUniqueTextArray(
      row.allowedSourceIds,
      `${path}.allowedSourceIds`,
      MAX_REFS_PER_FIELD,
      MAX_ID_CHARS
    )
  };
}

function parseFieldResult(
  value: unknown,
  manifest: ReportSemanticFieldManifestEntry,
  input: ReportSemanticReviewInput,
  index: number
): ReportSemanticFieldResult {
  const path = `$reviewOutput.fields[${index}]`;
  const row = strictRecord(value, path, FIELD_RESULT_KEYS);
  requireExact(row.path, manifest.path, `${path}.path`);
  requireExact(row.originalTextHash, manifest.originalTextHash, `${path}.originalTextHash`);
  const decision = requireOneOf(row.decision, ["pass", "corrected", "blocked"] as const, `${path}.decision`);
  const correctedText = row.correctedText === undefined
    ? undefined
    : requireBoundedText(row.correctedText, `${path}.correctedText`, MAX_TEXT_CHARS);
  if (decision === "corrected") {
    if (manifest.mutability !== "mutable") throw new TypeError(`${path} cannot correct a read-only field.`);
    if (correctedText === undefined) throw new TypeError(`${path}.correctedText is required for a corrected field.`);
    if (correctedText === manifest.originalText) throw new TypeError(`${path}.correctedText must differ from the original text.`);
  } else if (correctedText !== undefined) {
    throw new TypeError(`${path}.correctedText is allowed only for a corrected field.`);
  }
  const issueCodes = requireUniqueTextArray(row.issueCodes, `${path}.issueCodes`, 100, 200);
  if (decision !== "pass" && issueCodes.length === 0) throw new TypeError(`${path}.issueCodes must explain a non-pass decision.`);
  const evidenceIds = requireUniqueTextArray(row.evidenceIds, `${path}.evidenceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
  const sourceIds = requireUniqueTextArray(row.sourceIds, `${path}.sourceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
  assertSubset(evidenceIds, manifest.allowedEvidenceIds, `${path}.evidenceIds`);
  assertSubset(sourceIds, manifest.allowedSourceIds, `${path}.sourceIds`);
  if (manifest.allowedEvidenceIds.length + manifest.allowedSourceIds.length > 0
      && evidenceIds.length + sourceIds.length === 0) {
    throw new TypeError(`${path} must retain at least one allowed evidence or source reference.`);
  }
  const evidenceById = new Map(input.evidence.map((item) => [item.evidenceId, item]));
  const sourceById = new Map(input.sources.map((item) => [item.sourceId, item]));
  for (const id of evidenceIds) assertCompatibleOwner(manifest.questionId, evidenceById.get(id)!.questionId, `${path}.evidenceIds ${id}`);
  for (const id of sourceIds) assertCompatibleOwner(manifest.questionId, sourceById.get(id)!.questionId, `${path}.sourceIds ${id}`);
  const retainedOriginalTerms = requireArray(row.retainedOriginalTerms, `${path}.retainedOriginalTerms`, 500)
    .map((item, termIndex): ReportSemanticRetainedTerm => {
      const termPath = `${path}.retainedOriginalTerms[${termIndex}]`;
      const term = strictRecord(item, termPath, RETAINED_TERM_KEYS);
      return {
        term: requireBoundedText(term.term, `${termPath}.term`, 500),
        reason: requireBoundedText(term.reason, `${termPath}.reason`, 2_000)
      };
    });
  assertUnique(retainedOriginalTerms.map(({ term }) => term), `${path}.retainedOriginalTerms term`);
  return {
    path: manifest.path,
    originalTextHash: manifest.originalTextHash,
    decision,
    ...(correctedText === undefined ? {} : { correctedText }),
    issueCodes,
    reason: requireBoundedText(row.reason, `${path}.reason`, 5_000),
    evidenceIds,
    sourceIds,
    retainedOriginalTerms
  };
}

function parseQuestionDistinctness(value: unknown, input: ReportSemanticReviewInput): ReportQuestionDistinctnessResult {
  const path = "$reviewOutput.questionDistinctness";
  const row = strictRecord(value, path, DISTINCTNESS_KEYS);
  const decision = requireOneOf(row.decision, ["distinct", "duplicate", "blocked"] as const, `${path}.decision`);
  const knownQuestions = new Set(input.questions.map(({ questionId }) => questionId));
  const duplicateGroups = requireArray(row.duplicateGroups, `${path}.duplicateGroups`, 3).map((group, index) => {
    const ids = requireUniqueTextArray(group, `${path}.duplicateGroups[${index}]`, 3, MAX_ID_CHARS);
    if (ids.length < 2) throw new TypeError(`${path}.duplicateGroups[${index}] must identify at least two questions.`);
    for (const id of ids) if (!knownQuestions.has(id)) throw new TypeError(`${path} references unknown question ${id}.`);
    return ids;
  });
  if (decision === "distinct" && duplicateGroups.length !== 0) throw new TypeError(`${path}.duplicateGroups must be empty when questions are distinct.`);
  if (decision === "duplicate" && duplicateGroups.length === 0) throw new TypeError(`${path}.duplicateGroups must identify duplicated questions.`);
  const groupedIds = duplicateGroups.flat();
  if (new Set(groupedIds).size !== groupedIds.length) throw new TypeError(`${path}.duplicateGroups must not overlap.`);
  return { decision, duplicateGroups, reason: requireBoundedText(row.reason, `${path}.reason`, 5_000) };
}

function parseAnnotations(value: unknown, input: ReportSemanticReviewInput): ReportSemanticAnnotations {
  const row = strictRecord(value, "$reviewOutput.annotations", ANNOTATIONS_KEYS);
  const observations = requireArray(row.observationResults, "$reviewOutput.annotations.observationResults", MAX_CATALOG_ROWS);
  if (observations.length !== input.observationResults.length) throw new TypeError("$reviewOutput.annotations.observationResults must cover the input catalog exactly.");
  const observationResults = observations.map((value, index) => {
    const path = `$reviewOutput.annotations.observationResults[${index}]`;
    const item = strictRecord(value, path, OBSERVATION_ANNOTATION_KEYS);
    const expected = input.observationResults[index]!;
    requireExact(item.observationId, expected.observationId, `${path}.observationId`);
    requireExact(item.resultId, expected.resultId, `${path}.resultId`);
    return {
      observationId: expected.observationId,
      resultId: expected.resultId,
      targetPresence: requireOneOf(item.targetPresence, ["present", "absent", "ambiguous"] as const, `${path}.targetPresence`),
      competitorPresence: requireOneOf(item.competitorPresence, ["present", "absent", "ambiguous"] as const, `${path}.competitorPresence`),
      reason: requireBoundedText(item.reason, `${path}.reason`, 5_000)
    };
  });
  const answers = requireArray(row.answers, "$reviewOutput.annotations.answers", 3);
  if (answers.length !== input.answerSubjects.length) throw new TypeError("$reviewOutput.annotations.answers must cover every answer subject exactly once and in order.");
  const evidenceById = new Map(input.evidence.map((item) => [item.evidenceId, item]));
  const sourceById = new Map(input.sources.map((item) => [item.sourceId, item]));
  const parsedAnswers = answers.map((value, index) => {
    const path = `$reviewOutput.annotations.answers[${index}]`;
    const item = strictRecord(value, path, ANSWER_ANNOTATION_KEYS);
    const subject = input.answerSubjects[index]!;
    const questionId = subject.questionId;
    requireExact(item.questionId, questionId, `${path}.questionId`);
    const evidenceIds = requireUniqueTextArray(item.evidenceIds, `${path}.evidenceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
    const sourceIds = requireUniqueTextArray(item.sourceIds, `${path}.sourceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
    for (const id of evidenceIds) {
      const evidence = evidenceById.get(id); if (!evidence) throw new TypeError(`${path}.evidenceIds contains unknown reference ${id}.`);
      assertCompatibleOwner(questionId, evidence.questionId, `${path}.evidenceIds ${id}`);
    }
    for (const id of sourceIds) {
      const source = sourceById.get(id); if (!source) throw new TypeError(`${path}.sourceIds contains unknown reference ${id}.`);
      assertCompatibleOwner(questionId, source.questionId, `${path}.sourceIds ${id}`);
    }
    const field = input.fields.find((item) => item.path === subject.fieldPath && item.questionId === questionId)!;
    assertSubset(evidenceIds, field.allowedEvidenceIds, `${path}.evidenceIds`);
    assertSubset(sourceIds, field.allowedSourceIds, `${path}.sourceIds`);
    return { questionId, relevance: requireOneOf(item.relevance, ["responsive", "not_responsive", "blocked"] as const, `${path}.relevance`), entityRole: requireOneOf(item.entityRole, ["target", "competitor", "mixed", "none", "ambiguous"] as const, `${path}.entityRole`), evidenceIds, sourceIds, reason: requireBoundedText(item.reason, `${path}.reason`, 5_000) };
  });
  const evidenceUse = requireArray(row.evidenceUse, "$reviewOutput.annotations.evidenceUse", MAX_FIELDS).map((value, index) => {
    const path = `$reviewOutput.annotations.evidenceUse[${index}]`;
    const item = strictRecord(value, path, EVIDENCE_USE_KEYS);
    const field = input.fields[index];
    if (!field) throw new TypeError(`${path} exceeds field coverage.`);
    requireExact(item.path, field.path, `${path}.path`);
    const evidenceIds = requireUniqueTextArray(item.evidenceIds, `${path}.evidenceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
    const sourceIds = requireUniqueTextArray(item.sourceIds, `${path}.sourceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
    assertSubset(evidenceIds, field.allowedEvidenceIds, `${path}.evidenceIds`);
    assertSubset(sourceIds, field.allowedSourceIds, `${path}.sourceIds`);
    return { path: field.path, evidenceIds, sourceIds, reason: requireBoundedText(item.reason, `${path}.reason`, 5_000) };
  });
  if (evidenceUse.length !== input.fields.length) throw new TypeError("$reviewOutput.annotations.evidenceUse must cover every field exactly once and in order.");
  return { observationResults, answers: parsedAnswers, evidenceUse };
}

export function deriveFreeObservationMetrics(review: ReportSemanticReviewOutput): { targetMentionCount: number; competitorMentionCount: number } {
  const grouped = new Map<string, { target: boolean; competitor: boolean }>();
  for (const item of review.annotations.observationResults) {
    const current = grouped.get(item.observationId) ?? { target: false, competitor: false };
    current.target ||= item.targetPresence === "present";
    current.competitor ||= item.competitorPresence === "present";
    grouped.set(item.observationId, current);
  }
  return [...grouped.values()].reduce((counts, item) => ({ targetMentionCount: counts.targetMentionCount + Number(item.target), competitorMentionCount: counts.competitorMentionCount + Number(item.competitor) }), { targetMentionCount: 0, competitorMentionCount: 0 });
}

function parseAppliedFields(
  values: readonly AppliedReportSemanticField[],
  input: ReportSemanticReviewInput
): AppliedReportSemanticField[] {
  if (!Array.isArray(values) || values.length !== input.fields.length) {
    throw new TypeError("Applied semantic fields must cover the complete input manifest.");
  }
  return values.map((value, index) => {
    const manifest = input.fields[index]!;
    const path = `appliedFields[${index}]`;
    const row = strictRecord(value, path, new Set(["path", "originalTextHash", "appliedText", "appliedTextHash", "decision"]));
    requireExact(row.path, manifest.path, `${path}.path`);
    requireExact(row.originalTextHash, manifest.originalTextHash, `${path}.originalTextHash`);
    const appliedText = requireBoundedText(row.appliedText, `${path}.appliedText`, MAX_TEXT_CHARS);
    const appliedTextHash = requireHash(row.appliedTextHash, `${path}.appliedTextHash`);
    requireExact(appliedTextHash, reportSemanticTextHash(appliedText), `${path}.appliedTextHash`);
    const decision = requireOneOf(row.decision, ["pass", "corrected"] as const, `${path}.decision`);
    if (decision === "pass" && appliedText !== manifest.originalText) throw new TypeError(`${path} changed text while claiming pass.`);
    if (decision === "corrected" && (manifest.mutability !== "mutable" || appliedText === manifest.originalText)) {
      throw new TypeError(`${path} is not a valid mutable correction.`);
    }
    return { path: manifest.path, originalTextHash: manifest.originalTextHash, appliedText, appliedTextHash, decision };
  });
}

function parseReceiptFields(
  value: unknown,
  input: ReportSemanticReviewInput,
  appliedFields: readonly AppliedReportSemanticField[]
): ReportSemanticReceiptField[] {
  const rows = requireArray(value, "$reviewReceipt.fields", MAX_FIELDS);
  if (rows.length !== input.fields.length) throw new TypeError("$reviewReceipt.fields must cover the complete input manifest.");
  return rows.map((value, index) => {
    const path = `$reviewReceipt.fields[${index}]`;
    const row = strictRecord(value, path, RECEIPT_FIELD_KEYS);
    const applied = appliedFields[index]!;
    requireExact(row.path, applied.path, `${path}.path`);
    requireExact(row.originalTextHash, applied.originalTextHash, `${path}.originalTextHash`);
    requireExact(row.appliedTextHash, applied.appliedTextHash, `${path}.appliedTextHash`);
    requireExact(row.decision, applied.decision, `${path}.decision`);
    return {
      path: applied.path,
      originalTextHash: applied.originalTextHash,
      appliedTextHash: applied.appliedTextHash,
      decision: applied.decision
    };
  });
}

function deriveOverallDecision(
  fields: readonly ReportSemanticFieldResult[],
  distinctness: ReportQuestionDistinctnessResult,
  annotations: ReportSemanticAnnotations
): ReportSemanticReviewDecision {
  if (distinctness.decision !== "distinct" || fields.some(({ decision }) => decision === "blocked") || annotations.answers.some(({ relevance }) => relevance !== "responsive")) return "blocked";
  return fields.some(({ decision }) => decision === "corrected") ? "corrected" : "pass";
}

function fieldCoverageHash(fields: readonly ReportSemanticFieldManifestEntry[]): string {
  return hashReportSemanticReviewValue(fields.map(({ path, originalTextHash }) => ({ path, originalTextHash })));
}

function appliedProseHash(fields: readonly AppliedReportSemanticField[]): string {
  return hashReportSemanticReviewValue(fields.map(({ path, appliedTextHash }) => ({ path, appliedTextHash })));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set<object>()));
}

function canonicalValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical semantic-review JSON rejects non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Canonical semantic-review JSON rejects cycles.");
    ancestors.add(value);
    const result = value.map((item) => canonicalValue(item, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError("Canonical semantic-review JSON rejects cycles.");
    ancestors.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new TypeError("Canonical semantic-review JSON rejects undefined values.");
      result[key] = canonicalValue(item, ancestors);
    }
    ancestors.delete(value);
    return result;
  }
  throw new TypeError(`Canonical semantic-review JSON rejects ${typeof value} values.`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}

function strictRecord(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  const record = requireRecord(value, path);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key)).sort();
  if (unknown.length > 0) throw new TypeError(`${path} contains unknown key ${unknown[0]}.`);
  return record;
}

function requireArray(value: unknown, path: string, maximum: number): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  if (value.length > maximum) throw new TypeError(`${path} exceeds its maximum length of ${maximum}.`);
  return value;
}

function requireBoundedText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be nonblank text.`);
  if (value.length > maximum) throw new TypeError(`${path} exceeds ${maximum} characters.`);
  return value;
}

function requireNullableText(value: unknown, path: string, maximum: number): string | null {
  return value === null ? null : requireBoundedText(value, path, maximum);
}

function requireHash(value: unknown, path: string): string {
  const result = requireBoundedText(value, path, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${path} must be a lowercase SHA-256 hash.`);
  return result;
}

function requireSafeUrl(value: unknown, path: string): string {
  const result = requireBoundedText(value, path, 10_000);
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new TypeError(`${path} must be an absolute HTTP(S) URL.`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    throw new TypeError(`${path} must be a credential-free HTTP(S) URL.`);
  }
  return result;
}

function requireUniqueTextArray(
  value: unknown,
  path: string,
  maximumItems: number,
  maximumText: number,
  requireNonempty = false
): string[] {
  const result = requireArray(value, path, maximumItems).map((item, index) =>
    requireBoundedText(item, `${path}[${index}]`, maximumText)
  );
  if (requireNonempty && result.length === 0) throw new TypeError(`${path} must not be empty.`);
  assertUnique(result, path);
  return result;
}

function requireOneOf<const T extends readonly string[]>(value: unknown, allowed: T, path: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new TypeError(`${path} is unsupported.`);
  return value as T[number];
}

function requireExact(value: unknown, expected: unknown, path: string): void {
  if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`);
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) throw new TypeError(`${path} must be unique.`);
}

function assertSubset(values: readonly string[], allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed);
  for (const value of values) if (!allowedSet.has(value)) throw new TypeError(`${path} contains disallowed reference ${value}.`);
}

function assertNullableOwner(owner: string | null, known: ReadonlySet<string>, path: string): void {
  if (owner !== null && !known.has(owner)) throw new TypeError(`${path} references unknown question ${owner}.`);
}

function assertCompatibleOwner(fieldOwner: string | null, referencedOwner: string | null, path: string): void {
  if (fieldOwner !== null && referencedOwner !== null && fieldOwner !== referencedOwner) {
    throw new TypeError(`${path} belongs to another question.`);
  }
}

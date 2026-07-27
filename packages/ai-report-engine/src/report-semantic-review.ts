import { createHash } from "node:crypto";
import type { SourceSelectionDiagnosisV1 } from "./source-selection-diagnosis-v1";

export const REPORT_SEMANTIC_REVIEW_CONTRACT = "report-semantic-review-v1" as const;

export function buildReportSemanticReviewSystemPrompt(): string {
  return [
    `You are the sole semantic reviewer for ${REPORT_SEMANTIC_REVIEW_CONTRACT}.`,
    "Judge and, where allowed, correct customer prose for natural language, appropriate preservation of brands and technical terms, answer responsiveness, semantic question distinctness, unsupported causal or exaggerated claims, and faithful expression of the supplied evidence.",
    "Return exactly one JSON object and no Markdown, commentary, code fence, or unknown key.",
    "Copy version, inputHash, providerId, modelId, every ID, every originalTextHash, and every path exactly from the input authority. Never change questions, sources, evidence, observations, entities, hashes, URLs, or non-prose data. Never invent or cite an ID outside the field-owned catalogs.",
    "The top-level keys are exactly, in this order: version, inputHash, providerId, modelId, fields, questionDistinctness, annotations, overallDecision.",
    "Set version to report-semantic-review-v1. Set inputHash to input.inputHash. Set providerId and modelId to input.expectedModel.providerId and input.expectedModel.modelId.",
    "fields must cover input.fields exactly once and in input order. Each item has exactly: path, originalTextHash, decision, optional correctedText, issueCodes, reason, evidenceIds, sourceIds, retainedOriginalTerms. decision is pass, corrected, or blocked. pass has no correctedText and an empty issueCodes array. corrected is allowed only for a mutable field, must include changed correctedText and nonempty issueCodes. Every correctedText must be natural customer prose in input.locale; preserve brand names, product names, acronyms, model names, and professional terms in their appropriate original form even when they use another language. blocked has no correctedText and nonempty issueCodes. evidenceIds and sourceIds must be subsets of that input field's allowed IDs and must respect question ownership. If either allowedEvidenceIds or allowedSourceIds is nonempty, the field result must return at least one reference across evidenceIds and sourceIds. retainedOriginalTerms is an array of objects with exactly term and reason.",
    "questionDistinctness has exactly decision, duplicateGroups, reason. decision is distinct, duplicate, or blocked. distinct requires duplicateGroups []; duplicate requires nonoverlapping groups of at least two exact input questionIds. Judge meaning, not normalized string equality.",
    "annotations has exactly observationResults, answers, evidenceUse.",
    "annotations.observationResults must cover input.observationResults exactly once and in input order. Each item has exactly observationId, resultId, targetPresence, competitorPresence, reason. Presence enums are present, absent, or ambiguous; classify the exact supplied persisted result text independently for target and competitor presence.",
    "annotations.answers must cover input.answerSubjects exactly once and in input order. Each item has exactly questionId, relevance, entityRole, targetPresence, targetFirstSentence, targetRoles, competitorEntityIds, evidenceIds, sourceIds, reason. relevance is responsive, not_responsive, or blocked. entityRole is target, competitor, mixed, none, or ambiguous. For Free V4, targetPresence must not be ambiguous: present requires a positive 1-based targetFirstSentence and targetRoles describing the target's roles; absent requires targetFirstSentence null and targetRoles []. competitorEntityIds may contain only exact input.entities entityIds. entityRole must agree with targetPresence and whether competitorEntityIds is empty. Answer refs must be subsets of the owned answer field catalogs.",
    "annotations.evidenceUse must cover input.fields exactly once and in input order. Each item has exactly path, evidenceIds, sourceIds, reason, using only that field's allowed IDs.",
    "Derive overallDecision exactly: blocked when questionDistinctness is not distinct, any field is blocked, or any answer relevance is not responsive; otherwise corrected when any field is corrected; otherwise pass. Do not claim pass when these rules require blocked or corrected."
  ].join("\n");
}

export function buildPaidV3ReportSemanticReviewSystemPrompt(): string {
  return [
    buildReportSemanticReviewSystemPrompt()
      .replace(
        "The top-level keys are exactly, in this order: version, inputHash, providerId, modelId, fields, questionDistinctness, annotations, overallDecision.",
        "The top-level keys are exactly, in this order: version, inputHash, providerId, modelId, fields, questionDistinctness, annotations, sourceSelectionDraft, sourceSelectionDraftHash, overallDecision."
      )
      .replace(
        "annotations has exactly observationResults, answers, evidenceUse.",
        "annotations has exactly observationResults, answers, evidenceUse, sourceSelection."
      ),
    "annotations.sourceSelection must cover input.sourceSelectionCatalog exactly once and in input order. Each item has exactly annotationId, itemId, kind, questionId, sourceId, profileId, actionId, contributionRole, targetState, factorClassification, actionFamily, priority, evidenceIds, reason. Copy annotationId, itemId, kind, questionId, sourceId, profileId, and actionId exactly, including nulls. itemId is the stable catalog identity of the exact contribution, target-state gap, factor, or action being reviewed; never derive it from annotationId or prose. Use null for every semantic value that does not apply to the item kind. contribution items require contributionRole; target_state items require targetState; factor items require factorClassification; action items require actionFamily and priority. Use only exact catalog evidence IDs. Judge these values from the supplied evidence; never derive them from question order, ownership labels, wording length, regexes, keywords, or a local taxonomy shortcut.",
    "sourceSelectionDraft must be one complete SourceSelectionDiagnosisV1 JSON object. Its ordered source profiles, contributions, target gaps, observable factors, and actions must cover input.sourceSelectionCatalog exactly in catalog order and agree exactly with every sourceSelection annotation identity and semantic value. It must include all contribution summaries, basis and confidence, factor observations, target comparisons, profile audit states, shared-pattern prose, action titles and rationales, and limitation prose. Copy every structural ID, URL, excerpt, evidence reference, locale, and analyzer version from the supplied authority without alteration. Never calculate or reinterpret answerHash, sourceHash, or targetFoundationHash: copy the supplied draft identity values, which the program will replace with its exact final post-correction hashes before structural validation. sourceSelectionDraftHash must be the lowercase SHA-256 canonical JSON hash of the raw model-owned sourceSelectionDraft before that program-owned identity rebind."
  ].join("\n");
}

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

/** Immutable authority lineage for a marker-present Paid V3 semantic review. */
export interface ReportSemanticReviewAuthorityBindings {
  readonly rootMarker: typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
  readonly artifactIdentityHash: string;
  readonly reviewedFreeAuthorityHash: string;
  readonly answerCheckpointHash: string;
  readonly commercialSnapshotsHash: string;
  readonly publicSourceHash: string;
  readonly providerDiscoveryHash: string;
  readonly technicalFoundationHash: string;
  readonly aiFoundationHash: string;
  readonly evidenceAssetsHash: string;
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
export interface ReportSemanticEntity {
  readonly entityId: string;
  readonly questionId: string;
  readonly kind: "competitor_candidate";
  readonly originalText: string;
  readonly originalTextHash: string;
}
export interface ReportSemanticAnswerSubject { readonly questionId: string; readonly fieldPath: string; }

export type ReportSemanticSourceSelectionKind = "contribution" | "target_state" | "factor" | "action";
export interface ReportSemanticSourceSelectionCatalogEntry {
  readonly annotationId: string;
  readonly itemId: string;
  readonly kind: ReportSemanticSourceSelectionKind;
  readonly questionId: string | null;
  readonly sourceId: string | null;
  readonly profileId: string | null;
  readonly actionId: string | null;
  readonly allowedEvidenceIds: readonly string[];
}

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
  readonly entities: readonly ReportSemanticEntity[];
  readonly answerSubjects: readonly ReportSemanticAnswerSubject[];
  readonly sourceSelectionCatalog?: readonly ReportSemanticSourceSelectionCatalogEntry[];
  /** Optional for Free/legacy inputs and required for every Paid V3 input. */
  readonly authorityBindings?: ReportSemanticReviewAuthorityBindings;
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
  readonly targetPresence?: ReportSemanticPresence;
  readonly targetFirstSentence?: number | null;
  readonly targetRoles?: readonly string[];
  readonly competitorEntityIds?: readonly string[];
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
export interface ReportSemanticSourceSelectionAnnotation {
  readonly annotationId: string;
  readonly itemId: string;
  readonly kind: ReportSemanticSourceSelectionKind;
  readonly questionId: string | null;
  readonly sourceId: string | null;
  readonly profileId: string | null;
  readonly actionId: string | null;
  readonly contributionRole: "candidate_discovery" | "definition_or_framework" | "first_party_capability" | "constraint_or_risk" | "comparison" | "third_party_validation" | "other" | null;
  readonly targetState: "present" | "weak" | "missing" | "unavailable" | null;
  readonly factorClassification: "problem_match" | "factual_specificity" | "entity_clarity" | "source_authority" | "accessibility" | "freshness" | null;
  readonly actionFamily: "first_party_fact_page" | "entity_relationship" | "accessible_structure" | "freshness" | "third_party_validation" | null;
  readonly priority: "high" | "medium" | "low" | null;
  readonly evidenceIds: readonly string[];
  readonly reason: string;
}
export interface ReportSemanticAnnotations {
  readonly observationResults: readonly ReportSemanticObservationAnnotation[];
  readonly answers: readonly ReportSemanticAnswerAnnotation[];
  readonly evidenceUse: readonly ReportSemanticEvidenceUseAnnotation[];
  readonly sourceSelection?: readonly ReportSemanticSourceSelectionAnnotation[];
}

export interface ReportSemanticReviewOutput {
  readonly version: typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
  readonly inputHash: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly fields: readonly ReportSemanticFieldResult[];
  readonly questionDistinctness: ReportQuestionDistinctnessResult;
  readonly annotations: ReportSemanticAnnotations;
  readonly sourceSelectionDraft?: SourceSelectionDiagnosisV1;
  readonly sourceSelectionDraftHash?: string;
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
  readonly sourceSelectionDraftHash?: string;
  readonly nonProseProjectionHash: string;
  readonly finalReviewedReportProjectionHash?: string;
  readonly fields: readonly ReportSemanticReceiptField[];
}

export interface PaidV3ReportSemanticReviewReceipt extends ReportSemanticReviewReceipt {
  readonly lifecycle: "paid_v3";
  readonly sourceSelectionDraftHash: string;
  readonly finalReviewedReportProjectionHash: string;
}

export interface AppliedReportSemanticReview {
  readonly fields: readonly AppliedReportSemanticField[];
  readonly annotations: ReportSemanticAnnotations;
  readonly receipt: ReportSemanticReviewReceipt;
}

const INPUT_KEYS = new Set([
  "version", "lifecycle", "locale", "target", "expectedModel", "questions", "sources", "evidence", "fields",
  "observationResults", "entities", "answerSubjects", "sourceSelectionCatalog", "authorityBindings", "nonProseProjectionHash", "inputHash"
]);
const TARGET_KEYS = new Set(["siteKey", "targetUrl", "aliases"]);
const MODEL_KEYS = new Set(["providerId", "modelId"]);
const AUTHORITY_BINDING_KEYS = new Set([
  "rootMarker", "artifactIdentityHash", "reviewedFreeAuthorityHash", "answerCheckpointHash", "commercialSnapshotsHash",
  "publicSourceHash", "providerDiscoveryHash", "technicalFoundationHash", "aiFoundationHash", "evidenceAssetsHash"
]);
const QUESTION_KEYS = new Set(["questionId", "originalText", "originalTextHash"]);
const SOURCE_KEYS = new Set(["sourceId", "questionId", "canonicalUrl", "originalText", "originalTextHash"]);
const EVIDENCE_KEYS = new Set(["evidenceId", "questionId", "sourceId", "originalText", "originalTextHash"]);
const OBSERVATION_RESULT_KEYS = new Set(["observationId", "resultId", "questionId", "originalText", "originalTextHash"]);
const ENTITY_KEYS = new Set(["entityId", "questionId", "kind", "originalText", "originalTextHash"]);
const ANSWER_SUBJECT_KEYS = new Set(["questionId", "fieldPath"]);
const SOURCE_SELECTION_CATALOG_KEYS = new Set([
  "annotationId", "itemId", "kind", "questionId", "sourceId", "profileId", "actionId", "allowedEvidenceIds"
]);
const FIELD_KEYS = new Set([
  "path", "originalText", "originalTextHash", "mutability", "questionId", "allowedEvidenceIds", "allowedSourceIds"
]);
const OUTPUT_KEYS = new Set([
  "version", "inputHash", "providerId", "modelId", "fields", "questionDistinctness", "annotations",
  "sourceSelectionDraft", "sourceSelectionDraftHash", "overallDecision"
]);
const FIELD_RESULT_KEYS = new Set([
  "path", "originalTextHash", "decision", "correctedText", "issueCodes", "reason", "evidenceIds", "sourceIds",
  "retainedOriginalTerms"
]);
const RETAINED_TERM_KEYS = new Set(["term", "reason"]);
const DISTINCTNESS_KEYS = new Set(["decision", "duplicateGroups", "reason"]);
const ANNOTATIONS_KEYS = new Set(["observationResults", "answers", "evidenceUse", "sourceSelection"]);
const OBSERVATION_ANNOTATION_KEYS = new Set(["observationId", "resultId", "targetPresence", "competitorPresence", "reason"]);
const ANSWER_ANNOTATION_KEYS = new Set(["questionId", "relevance", "entityRole", "targetPresence", "targetFirstSentence", "targetRoles", "competitorEntityIds", "evidenceIds", "sourceIds", "reason"]);
const EVIDENCE_USE_KEYS = new Set(["path", "evidenceIds", "sourceIds", "reason"]);
const SOURCE_SELECTION_ANNOTATION_KEYS = new Set([
  "annotationId", "itemId", "kind", "questionId", "sourceId", "profileId", "actionId",
  "contributionRole", "targetState", "factorClassification", "actionFamily", "priority",
  "evidenceIds", "reason"
]);
const RECEIPT_KEYS = new Set([
  "version", "lifecycle", "inputHash", "reviewHash", "providerId", "modelId", "decision", "fieldCoverageHash",
  "appliedProseHash", "annotationsHash", "sourceSelectionDraftHash", "nonProseProjectionHash",
  "finalReviewedReportProjectionHash", "fields"
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
  const sourceSelectionDraft = input.sourceSelectionCatalog
    ? parsePaidReviewedSourceSelectionDraft(record.sourceSelectionDraft, input, annotations)
    : undefined;
  if (!input.sourceSelectionCatalog && (record.sourceSelectionDraft !== undefined || record.sourceSelectionDraftHash !== undefined)) {
    throw new TypeError("$reviewOutput source-selection draft fields are allowed only for a catalog-bound Paid V3 review.");
  }
  const sourceSelectionDraftHash = sourceSelectionDraft
    ? requireHash(record.sourceSelectionDraftHash, "$reviewOutput.sourceSelectionDraftHash")
    : undefined;
  if (sourceSelectionDraft && sourceSelectionDraftHash !== hashReportSemanticReviewValue(sourceSelectionDraft)) {
    throw new TypeError("$reviewOutput.sourceSelectionDraftHash does not match the canonical reviewed draft.");
  }
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
    ...(sourceSelectionDraft && sourceSelectionDraftHash
      ? { sourceSelectionDraft, sourceSelectionDraftHash }
      : {}),
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
    ...(review.sourceSelectionDraftHash ? { sourceSelectionDraftHash: review.sourceSelectionDraftHash } : {}),
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
  currentNonProseProjectionHash?: string,
  expectedFinalReviewedReportProjectionHash?: string
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
  const sourceSelectionDraftHash = record.sourceSelectionDraftHash === undefined
    ? undefined
    : requireHash(record.sourceSelectionDraftHash, "$reviewReceipt.sourceSelectionDraftHash");
  requireExact(sourceSelectionDraftHash, review.sourceSelectionDraftHash, "$reviewReceipt.sourceSelectionDraftHash");
  const nonProseHash = requireHash(record.nonProseProjectionHash, "$reviewReceipt.nonProseProjectionHash");
  requireExact(nonProseHash, input.nonProseProjectionHash, "$reviewReceipt.nonProseProjectionHash");
  requireExact(
    requireHash(currentNonProseProjectionHash ?? nonProseHash, "currentNonProseProjectionHash"),
    input.nonProseProjectionHash,
    "currentNonProseProjectionHash"
  );
  const finalReviewedReportProjectionHash = record.finalReviewedReportProjectionHash === undefined
    ? undefined
    : requireHash(record.finalReviewedReportProjectionHash, "$reviewReceipt.finalReviewedReportProjectionHash");
  if (expectedFinalReviewedReportProjectionHash !== undefined) {
    requireExact(
      finalReviewedReportProjectionHash,
      requireHash(expectedFinalReviewedReportProjectionHash, "expectedFinalReviewedReportProjectionHash"),
      "$reviewReceipt.finalReviewedReportProjectionHash"
    );
  }
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
    ...(sourceSelectionDraftHash ? { sourceSelectionDraftHash } : {}),
    nonProseProjectionHash: nonProseHash,
    ...(finalReviewedReportProjectionHash ? { finalReviewedReportProjectionHash } : {}),
    fields: receiptFields
  };
}

export function parsePaidV3ReportSemanticReviewReceipt(value: unknown): PaidV3ReportSemanticReviewReceipt {
  const record = strictRecord(value, "$reviewReceipt", RECEIPT_KEYS);
  requireExact(record.version, REPORT_SEMANTIC_REVIEW_CONTRACT, "$reviewReceipt.version");
  requireExact(record.lifecycle, "paid_v3", "$reviewReceipt.lifecycle");
  const fields = requireArray(record.fields, "$reviewReceipt.fields", MAX_FIELDS).map((value, index) => {
    const path = `$reviewReceipt.fields[${index}]`;
    const row = strictRecord(value, path, RECEIPT_FIELD_KEYS);
    return {
      path: requireBoundedText(row.path, `${path}.path`, MAX_PATH_CHARS),
      originalTextHash: requireHash(row.originalTextHash, `${path}.originalTextHash`),
      appliedTextHash: requireHash(row.appliedTextHash, `${path}.appliedTextHash`),
      decision: requireOneOf(row.decision, ["pass", "corrected"] as const, `${path}.decision`)
    };
  });
  if (fields.length === 0) throw new TypeError("$reviewReceipt.fields must not be empty.");
  assertUnique(fields.map(({ path }) => path), "$reviewReceipt.fields path");
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    lifecycle: "paid_v3",
    inputHash: requireHash(record.inputHash, "$reviewReceipt.inputHash"),
    reviewHash: requireHash(record.reviewHash, "$reviewReceipt.reviewHash"),
    providerId: requireBoundedText(record.providerId, "$reviewReceipt.providerId", MAX_ID_CHARS),
    modelId: requireBoundedText(record.modelId, "$reviewReceipt.modelId", MAX_ID_CHARS),
    decision: requireOneOf(record.decision, ["pass", "corrected"] as const, "$reviewReceipt.decision"),
    fieldCoverageHash: requireHash(record.fieldCoverageHash, "$reviewReceipt.fieldCoverageHash"),
    appliedProseHash: requireHash(record.appliedProseHash, "$reviewReceipt.appliedProseHash"),
    annotationsHash: requireHash(record.annotationsHash, "$reviewReceipt.annotationsHash"),
    sourceSelectionDraftHash: requireHash(record.sourceSelectionDraftHash, "$reviewReceipt.sourceSelectionDraftHash"),
    nonProseProjectionHash: requireHash(record.nonProseProjectionHash, "$reviewReceipt.nonProseProjectionHash"),
    finalReviewedReportProjectionHash: requireHash(
      record.finalReviewedReportProjectionHash,
      "$reviewReceipt.finalReviewedReportProjectionHash"
    ),
    fields
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
  const authorityBindings = record.authorityBindings === undefined
    ? undefined
    : parseAuthorityBindings(record.authorityBindings);
  if (lifecycle === "paid_v3" && !authorityBindings) {
    throw new TypeError("$reviewInput.authorityBindings is required for Paid V3.");
  }
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
  const entities = requireArray(record.entities, "$reviewInput.entities", MAX_CATALOG_ROWS).map((value, index) => {
    const path = `$reviewInput.entities[${index}]`;
    const row = strictRecord(value, path, ENTITY_KEYS);
    const originalText = requireBoundedText(row.originalText, `${path}.originalText`, MAX_TEXT_CHARS);
    const originalTextHash = requireHash(row.originalTextHash, `${path}.originalTextHash`);
    requireExact(originalTextHash, reportSemanticTextHash(originalText), `${path}.originalTextHash`);
    requireExact(row.kind, "competitor_candidate", `${path}.kind`);
    const questionId = requireBoundedText(row.questionId, `${path}.questionId`, MAX_ID_CHARS);
    if (!questionIds.has(questionId)) throw new TypeError(`${path}.questionId references an unknown question.`);
    return { entityId: requireBoundedText(row.entityId, `${path}.entityId`, MAX_ID_CHARS), questionId, kind: "competitor_candidate" as const, originalText, originalTextHash };
  });
  assertUnique(entities.map(({ entityId }) => entityId), "$reviewInput.entities entityId");
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
  const sourceSelectionCatalog = record.sourceSelectionCatalog === undefined
    ? undefined
    : requireArray(record.sourceSelectionCatalog, "$reviewInput.sourceSelectionCatalog", MAX_CATALOG_ROWS)
        .map((value, index): ReportSemanticSourceSelectionCatalogEntry => {
          const path = `$reviewInput.sourceSelectionCatalog[${index}]`;
          const row = strictRecord(value, path, SOURCE_SELECTION_CATALOG_KEYS);
          const kind = requireOneOf(
            row.kind,
            ["contribution", "target_state", "factor", "action"] as const,
            `${path}.kind`
          );
          const questionId = requireNullableText(row.questionId, `${path}.questionId`, MAX_ID_CHARS);
          const sourceId = requireNullableText(row.sourceId, `${path}.sourceId`, MAX_ID_CHARS);
          const profileId = requireNullableText(row.profileId, `${path}.profileId`, MAX_ID_CHARS);
          const actionId = requireNullableText(row.actionId, `${path}.actionId`, MAX_ID_CHARS);
          if (questionId !== null && !questionIds.has(questionId)) throw new TypeError(`${path}.questionId references an unknown question.`);
          if (sourceId !== null) {
            const source = sourceById.get(sourceId);
            if (!source) throw new TypeError(`${path}.sourceId references an unknown source.`);
            assertCompatibleOwner(questionId, source.questionId, `${path}.sourceId`);
          }
          if (kind === "contribution" && (!questionId || !sourceId || !profileId)) {
            throw new TypeError(`${path} contribution entries require questionId, sourceId, and profileId.`);
          }
          if ((kind === "target_state" || kind === "factor") && !profileId) {
            throw new TypeError(`${path} ${kind} entries require profileId.`);
          }
          if (kind === "action" && !actionId) throw new TypeError(`${path} action entries require actionId.`);
          const allowedEvidenceIds = requireUniqueTextArray(
            row.allowedEvidenceIds,
            `${path}.allowedEvidenceIds`,
            MAX_REFS_PER_FIELD,
            MAX_ID_CHARS
          );
          if (allowedEvidenceIds.length === 0) {
            throw new TypeError(`${path}.allowedEvidenceIds must contain at least one exact evidence ID.`);
          }
          for (const evidenceId of allowedEvidenceIds) {
            const item = evidenceById.get(evidenceId);
            if (!item) throw new TypeError(`${path}.allowedEvidenceIds references unknown evidence ${evidenceId}.`);
            assertCompatibleOwner(questionId, item.questionId, `${path}.allowedEvidenceIds ${evidenceId}`);
          }
          return {
            annotationId: requireBoundedText(row.annotationId, `${path}.annotationId`, MAX_ID_CHARS),
            itemId: requireBoundedText(row.itemId, `${path}.itemId`, MAX_ID_CHARS),
            kind,
            questionId,
            sourceId,
            profileId,
            actionId,
            allowedEvidenceIds
          };
        });
  if (sourceSelectionCatalog) {
    if (lifecycle !== "paid_v3") throw new TypeError("$reviewInput.sourceSelectionCatalog is allowed only for Paid V3.");
    if (sourceSelectionCatalog.length === 0) throw new TypeError("$reviewInput.sourceSelectionCatalog must not be empty when supplied.");
    assertUnique(sourceSelectionCatalog.map(({ annotationId }) => annotationId), "$reviewInput.sourceSelectionCatalog annotationId");
    assertUnique(
      sourceSelectionCatalog.map(({ kind, itemId }) => `${kind}\u0000${itemId}`),
      "$reviewInput.sourceSelectionCatalog kind/itemId"
    );
  }
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
    entities,
    answerSubjects,
    ...(sourceSelectionCatalog ? { sourceSelectionCatalog } : {}),
    ...(authorityBindings ? { authorityBindings } : {}),
    fields,
    nonProseProjectionHash: requireHash(record.nonProseProjectionHash, "$reviewInput.nonProseProjectionHash")
  };
}

function parseAuthorityBindings(value: unknown): ReportSemanticReviewAuthorityBindings {
  const row = strictRecord(value, "$reviewInput.authorityBindings", AUTHORITY_BINDING_KEYS);
  requireExact(row.rootMarker, REPORT_SEMANTIC_REVIEW_CONTRACT, "$reviewInput.authorityBindings.rootMarker");
  return {
    rootMarker: REPORT_SEMANTIC_REVIEW_CONTRACT,
    artifactIdentityHash: requireHash(row.artifactIdentityHash, "$reviewInput.authorityBindings.artifactIdentityHash"),
    reviewedFreeAuthorityHash: requireHash(row.reviewedFreeAuthorityHash, "$reviewInput.authorityBindings.reviewedFreeAuthorityHash"),
    answerCheckpointHash: requireHash(row.answerCheckpointHash, "$reviewInput.authorityBindings.answerCheckpointHash"),
    commercialSnapshotsHash: requireHash(row.commercialSnapshotsHash, "$reviewInput.authorityBindings.commercialSnapshotsHash"),
    publicSourceHash: requireHash(row.publicSourceHash, "$reviewInput.authorityBindings.publicSourceHash"),
    providerDiscoveryHash: requireHash(row.providerDiscoveryHash, "$reviewInput.authorityBindings.providerDiscoveryHash"),
    technicalFoundationHash: requireHash(row.technicalFoundationHash, "$reviewInput.authorityBindings.technicalFoundationHash"),
    aiFoundationHash: requireHash(row.aiFoundationHash, "$reviewInput.authorityBindings.aiFoundationHash"),
    evidenceAssetsHash: requireHash(row.evidenceAssetsHash, "$reviewInput.authorityBindings.evidenceAssetsHash")
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
    const hasGeo = input.lifecycle === "paid_v3" ||
      item.targetPresence !== undefined ||
      item.targetFirstSentence !== undefined ||
      item.targetRoles !== undefined ||
      item.competitorEntityIds !== undefined;
    const targetPresence = hasGeo ? requireOneOf(item.targetPresence, ["present", "absent", "ambiguous"] as const, `${path}.targetPresence`) : undefined;
    const targetFirstSentence = !hasGeo ? undefined : item.targetFirstSentence === null ? null : requireNonnegativeInteger(item.targetFirstSentence, `${path}.targetFirstSentence`);
    if (hasGeo && targetPresence === "present" && (typeof targetFirstSentence !== "number" || targetFirstSentence < 1)) throw new TypeError(`${path}.targetFirstSentence must be positive when target presence is present.`);
    if (hasGeo && targetPresence !== "present" && targetFirstSentence !== null) throw new TypeError(`${path}.targetFirstSentence requires present target presence.`);
    const targetRoles = hasGeo ? requireUniqueTextArray(item.targetRoles, `${path}.targetRoles`, 100, 500) : undefined;
    if (hasGeo && targetPresence === "absent" && targetRoles!.length !== 0) throw new TypeError(`${path}.targetRoles must be empty when target presence is absent.`);
    if (input.lifecycle === "paid_v3" && targetPresence === "ambiguous") {
      throw new TypeError(`${path}.targetPresence must not be ambiguous for Paid V3.`);
    }
    if (input.lifecycle === "paid_v3" && targetPresence === "present" && targetRoles!.length === 0) {
      throw new TypeError(`${path}.targetRoles must describe at least one target role when target presence is present.`);
    }
    const competitorEntityIds = hasGeo ? requireUniqueTextArray(item.competitorEntityIds, `${path}.competitorEntityIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS) : undefined;
    if (competitorEntityIds) {
      assertSubset(competitorEntityIds, input.entities.map(({ entityId }) => entityId), `${path}.competitorEntityIds`);
      const entityById = new Map(input.entities.map((entity) => [entity.entityId, entity]));
      for (const id of competitorEntityIds) assertCompatibleOwner(questionId, entityById.get(id)!.questionId, `${path}.competitorEntityIds ${id}`);
    }
    const entityRole = requireOneOf(item.entityRole, ["target", "competitor", "mixed", "none", "ambiguous"] as const, `${path}.entityRole`);
    if (input.lifecycle === "paid_v3") {
      const expectedRole = targetPresence === "present"
        ? competitorEntityIds!.length > 0 ? "mixed" : "target"
        : competitorEntityIds!.length > 0 ? "competitor" : "none";
      requireExact(entityRole, expectedRole, `${path}.entityRole`);
    }
    return { questionId, relevance: requireOneOf(item.relevance, ["responsive", "not_responsive", "blocked"] as const, `${path}.relevance`), entityRole, ...(hasGeo ? { targetPresence, targetFirstSentence, targetRoles, competitorEntityIds } : {}), evidenceIds, sourceIds, reason: requireBoundedText(item.reason, `${path}.reason`, 5_000) };
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
  const catalog = input.sourceSelectionCatalog;
  if (!catalog && row.sourceSelection !== undefined) {
    throw new TypeError("$reviewOutput.annotations.sourceSelection is not allowed without an input catalog.");
  }
  const sourceSelection = !catalog ? undefined : requireArray(
    row.sourceSelection,
    "$reviewOutput.annotations.sourceSelection",
    MAX_CATALOG_ROWS
  ).map((value, index): ReportSemanticSourceSelectionAnnotation => {
    const path = `$reviewOutput.annotations.sourceSelection[${index}]`;
    const item = strictRecord(value, path, SOURCE_SELECTION_ANNOTATION_KEYS);
    const expected = catalog[index];
    if (!expected) throw new TypeError(`${path} exceeds source-selection catalog coverage.`);
    requireExact(item.annotationId, expected.annotationId, `${path}.annotationId`);
    requireExact(item.itemId, expected.itemId, `${path}.itemId`);
    requireExact(item.kind, expected.kind, `${path}.kind`);
    requireExact(item.questionId, expected.questionId, `${path}.questionId`);
    requireExact(item.sourceId, expected.sourceId, `${path}.sourceId`);
    requireExact(item.profileId, expected.profileId, `${path}.profileId`);
    requireExact(item.actionId, expected.actionId, `${path}.actionId`);
    const contributionRole = item.contributionRole === null ? null : requireOneOf(
      item.contributionRole,
      ["candidate_discovery", "definition_or_framework", "first_party_capability", "constraint_or_risk", "comparison", "third_party_validation", "other"] as const,
      `${path}.contributionRole`
    );
    const targetState = item.targetState === null ? null : requireOneOf(
      item.targetState,
      ["present", "weak", "missing", "unavailable"] as const,
      `${path}.targetState`
    );
    const factorClassification = item.factorClassification === null ? null : requireOneOf(
      item.factorClassification,
      ["problem_match", "factual_specificity", "entity_clarity", "source_authority", "accessibility", "freshness"] as const,
      `${path}.factorClassification`
    );
    const actionFamily = item.actionFamily === null ? null : requireOneOf(
      item.actionFamily,
      ["first_party_fact_page", "entity_relationship", "accessible_structure", "freshness", "third_party_validation"] as const,
      `${path}.actionFamily`
    );
    const priority = item.priority === null ? null : requireOneOf(
      item.priority,
      ["high", "medium", "low"] as const,
      `${path}.priority`
    );
    const semanticValues = [contributionRole, targetState, factorClassification, actionFamily, priority];
    const expectedPresent = expected.kind === "contribution" ? [0]
      : expected.kind === "target_state" ? [1]
        : expected.kind === "factor" ? [2] : [3, 4];
    if (semanticValues.some((value, semanticIndex) => expectedPresent.includes(semanticIndex) ? value === null : value !== null)) {
      throw new TypeError(`${path} semantic values do not match ${expected.kind} annotation shape.`);
    }
    const evidenceIds = requireUniqueTextArray(item.evidenceIds, `${path}.evidenceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS);
    if (evidenceIds.length === 0) {
      throw new TypeError(`${path}.evidenceIds must cite at least one catalog-owned evidence ID.`);
    }
    assertSubset(evidenceIds, expected.allowedEvidenceIds, `${path}.evidenceIds`);
    return {
      annotationId: expected.annotationId,
      itemId: expected.itemId,
      kind: expected.kind,
      questionId: expected.questionId,
      sourceId: expected.sourceId,
      profileId: expected.profileId,
      actionId: expected.actionId,
      contributionRole,
      targetState,
      factorClassification,
      actionFamily,
      priority,
      evidenceIds,
      reason: requireBoundedText(item.reason, `${path}.reason`, 5_000)
    };
  });
  if (catalog && sourceSelection!.length !== catalog.length) {
    throw new TypeError("$reviewOutput.annotations.sourceSelection must cover the input catalog exactly once and in order.");
  }
  return {
    observationResults,
    answers: parsedAnswers,
    evidenceUse,
    ...(sourceSelection ? { sourceSelection } : {})
  };
}

/**
 * Fails closed unless the Paid Q1 semantic annotation preserves the accepted
 * Free annotation's meaning-bearing fields. The reviewer may supply a new
 * reason, but cannot silently reinterpret the already accepted Q1 authority.
 */
export function assertPaidV3Q1AnnotationContinuity(paid: unknown, acceptedFree: unknown): void {
  const paidAnnotation = parseQ1ContinuityAnnotation(paid, "$paidQ1Annotation");
  const freeAnnotation = parseQ1ContinuityAnnotation(acceptedFree, "$acceptedFreeQ1Annotation");
  for (const key of [
    "questionId", "relevance", "entityRole", "targetPresence", "targetFirstSentence",
    "targetRoles", "competitorEntityIds", "evidenceIds", "sourceIds"
  ] as const) {
    if (!sameCanonicalValue(paidAnnotation[key], freeAnnotation[key])) {
      throw new TypeError(`Paid Q1 annotation contradicts accepted Free annotation at ${key}.`);
    }
  }
}

type Q1ContinuityAnnotation = Pick<
  ReportSemanticAnswerAnnotation,
  "questionId" | "relevance" | "entityRole" | "targetPresence" | "targetFirstSentence" |
  "targetRoles" | "competitorEntityIds" | "evidenceIds" | "sourceIds"
>;

function parseQ1ContinuityAnnotation(value: unknown, path: string): Q1ContinuityAnnotation {
  const row = strictRecord(value, path, ANSWER_ANNOTATION_KEYS);
  const targetPresence = requireOneOf(row.targetPresence, ["present", "absent", "ambiguous"] as const, `${path}.targetPresence`);
  const targetFirstSentence = row.targetFirstSentence === null
    ? null
    : requireNonnegativeInteger(row.targetFirstSentence, `${path}.targetFirstSentence`);
  if (targetPresence === "present" && (typeof targetFirstSentence !== "number" || targetFirstSentence < 1)) {
    throw new TypeError(`${path}.targetFirstSentence must be positive when target presence is present.`);
  }
  return {
    questionId: requireBoundedText(row.questionId, `${path}.questionId`, MAX_ID_CHARS),
    relevance: requireOneOf(row.relevance, ["responsive", "not_responsive", "blocked"] as const, `${path}.relevance`),
    entityRole: requireOneOf(row.entityRole, ["target", "competitor", "mixed", "none", "ambiguous"] as const, `${path}.entityRole`),
    targetPresence,
    targetFirstSentence,
    targetRoles: requireUniqueTextArray(row.targetRoles, `${path}.targetRoles`, MAX_REFS_PER_FIELD, MAX_ID_CHARS),
    competitorEntityIds: requireUniqueTextArray(row.competitorEntityIds, `${path}.competitorEntityIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS),
    evidenceIds: requireUniqueTextArray(row.evidenceIds, `${path}.evidenceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS),
    sourceIds: requireUniqueTextArray(row.sourceIds, `${path}.sourceIds`, MAX_REFS_PER_FIELD, MAX_ID_CHARS)
  };
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

interface SourceSelectionDraftProjection {
  readonly kind: ReportSemanticSourceSelectionKind;
  readonly questionId: string | null;
  readonly sourceId: string | null;
  readonly profileId: string | null;
  readonly actionId: string | null;
  readonly contributionRole: ReportSemanticSourceSelectionAnnotation["contributionRole"];
  readonly targetState: ReportSemanticSourceSelectionAnnotation["targetState"];
  readonly factorClassification: ReportSemanticSourceSelectionAnnotation["factorClassification"];
  readonly actionFamily: ReportSemanticSourceSelectionAnnotation["actionFamily"];
  readonly priority: ReportSemanticSourceSelectionAnnotation["priority"];
  readonly relatedSourceRefs: readonly { questionId: string; sourceId: string }[];
}

function parsePaidReviewedSourceSelectionDraft(
  value: unknown,
  input: ReportSemanticReviewInput,
  annotations: ReportSemanticAnnotations
): SourceSelectionDiagnosisV1 {
  const catalog = input.sourceSelectionCatalog;
  const reviewed = annotations.sourceSelection;
  if (!catalog || !reviewed) {
    throw new TypeError("$reviewOutput.sourceSelectionDraft requires complete Paid source-selection authority.");
  }
  const root = requireRecord(value, "$reviewOutput.sourceSelectionDraft");
  const projections: SourceSelectionDraftProjection[] = [];
  const profileIds = new Set<string>();
  const profileRefs = new Map<string, Array<{ questionId: string; sourceId: string }>>();
  const profiles = requireArray(root.sourceProfiles, "$reviewOutput.sourceSelectionDraft.sourceProfiles", MAX_CATALOG_ROWS);
  for (const [profileIndex, profileValue] of profiles.entries()) {
    const path = `$reviewOutput.sourceSelectionDraft.sourceProfiles[${profileIndex}]`;
    const profile = requireRecord(profileValue, path);
    const profileId = requireBoundedText(profile.profileId, `${path}.profileId`, MAX_ID_CHARS);
    if (profileIds.has(profileId)) throw new TypeError(`${path}.profileId must be unique.`);
    profileIds.add(profileId);
    const refs = requireArray(profile.sourceRefs, `${path}.sourceRefs`, MAX_REFS_PER_FIELD).map((value, refIndex) => {
      const refPath = `${path}.sourceRefs[${refIndex}]`;
      const ref = requireRecord(value, refPath);
      return {
        questionId: requireBoundedText(ref.questionId, `${refPath}.questionId`, MAX_ID_CHARS),
        sourceId: requireBoundedText(ref.sourceId, `${refPath}.sourceId`, MAX_ID_CHARS)
      };
    });
    profileRefs.set(profileId, refs);
    for (const [index, contributionValue] of requireArray(
      profile.contributions,
      `${path}.contributions`,
      MAX_CATALOG_ROWS
    ).entries()) {
      const itemPath = `${path}.contributions[${index}]`;
      const contribution = requireRecord(contributionValue, itemPath);
      projections.push({
        kind: "contribution",
        questionId: requireBoundedText(contribution.questionId, `${itemPath}.questionId`, MAX_ID_CHARS),
        sourceId: requireBoundedText(contribution.sourceId, `${itemPath}.sourceId`, MAX_ID_CHARS),
        profileId,
        actionId: null,
        contributionRole: requireOneOf(
          contribution.role,
          ["candidate_discovery", "definition_or_framework", "first_party_capability", "constraint_or_risk", "comparison", "third_party_validation", "other"] as const,
          `${itemPath}.role`
        ),
        targetState: null,
        factorClassification: null,
        actionFamily: null,
        priority: null,
        relatedSourceRefs: refs
      });
    }
    for (const [index, gapValue] of requireArray(
      profile.targetGaps,
      `${path}.targetGaps`,
      MAX_CATALOG_ROWS
    ).entries()) {
      const itemPath = `${path}.targetGaps[${index}]`;
      const gap = requireRecord(gapValue, itemPath);
      const sourceEvidenceRefs = requireArray(
        gap.sourceEvidenceRefs,
        `${itemPath}.sourceEvidenceRefs`,
        MAX_REFS_PER_FIELD
      ).map((value, refIndex) => {
        const refPath = `${itemPath}.sourceEvidenceRefs[${refIndex}]`;
        const ref = requireRecord(value, refPath);
        return {
          questionId: requireBoundedText(ref.questionId, `${refPath}.questionId`, MAX_ID_CHARS),
          sourceId: requireBoundedText(ref.sourceId, `${refPath}.sourceId`, MAX_ID_CHARS)
        };
      });
      projections.push({
        kind: "target_state",
        questionId: null,
        sourceId: null,
        profileId,
        actionId: null,
        contributionRole: null,
        targetState: requireOneOf(
          gap.targetState,
          ["present", "weak", "missing", "unavailable"] as const,
          `${itemPath}.targetState`
        ),
        factorClassification: null,
        actionFamily: null,
        priority: null,
        relatedSourceRefs: sourceEvidenceRefs.length > 0 ? sourceEvidenceRefs : refs
      });
    }
    for (const [index, factorValue] of requireArray(
      profile.observableFactors,
      `${path}.observableFactors`,
      MAX_CATALOG_ROWS
    ).entries()) {
      const itemPath = `${path}.observableFactors[${index}]`;
      const factor = requireRecord(factorValue, itemPath);
      projections.push({
        kind: "factor",
        questionId: null,
        sourceId: null,
        profileId,
        actionId: null,
        contributionRole: null,
        targetState: null,
        factorClassification: requireOneOf(
          factor.factor,
          ["problem_match", "factual_specificity", "entity_clarity", "source_authority", "accessibility", "freshness"] as const,
          `${itemPath}.factor`
        ),
        actionFamily: null,
        priority: null,
        relatedSourceRefs: refs
      });
    }
  }
  for (const [actionIndex, actionValue] of requireArray(
    root.targetActions,
    "$reviewOutput.sourceSelectionDraft.targetActions",
    MAX_CATALOG_ROWS
  ).entries()) {
    const path = `$reviewOutput.sourceSelectionDraft.targetActions[${actionIndex}]`;
    const action = requireRecord(actionValue, path);
    const relatedProfileIds = requireUniqueTextArray(
      action.relatedProfileIds,
      `${path}.relatedProfileIds`,
      MAX_REFS_PER_FIELD,
      MAX_ID_CHARS
    );
    const relatedSourceRefs = relatedProfileIds.flatMap((profileId) => profileRefs.get(profileId) ?? []);
    projections.push({
      kind: "action",
      questionId: null,
      sourceId: null,
      profileId: relatedProfileIds[0] ?? null,
      actionId: requireBoundedText(action.actionId, `${path}.actionId`, MAX_ID_CHARS),
      contributionRole: null,
      targetState: null,
      factorClassification: null,
      actionFamily: requireOneOf(
        action.actionFamily,
        ["first_party_fact_page", "entity_relationship", "accessible_structure", "freshness", "third_party_validation"] as const,
        `${path}.actionFamily`
      ),
      priority: requireOneOf(action.priority, ["high", "medium", "low"] as const, `${path}.priority`),
      relatedSourceRefs
    });
  }
  if (projections.length !== catalog.length) {
    throw new TypeError("$reviewOutput.sourceSelectionDraft must cover every source-selection catalog item exactly once.");
  }
  for (const [index, projection] of projections.entries()) {
    const path = `$reviewOutput.sourceSelectionDraft.catalogProjection[${index}]`;
    const expected = catalog[index]!;
    const annotation = reviewed[index]!;
    requireExact(projection.kind, expected.kind, `${path}.kind`);
    requireExact(projection.profileId, expected.profileId, `${path}.profileId`);
    requireExact(projection.actionId, expected.actionId, `${path}.actionId`);
    if (expected.kind === "contribution") {
      requireExact(projection.questionId, expected.questionId, `${path}.questionId`);
      requireExact(projection.sourceId, expected.sourceId, `${path}.sourceId`);
    } else {
      assertCatalogReferenceIsRepresented(expected, projection.relatedSourceRefs, path);
    }
    requireExact(projection.contributionRole, annotation.contributionRole, `${path}.contributionRole`);
    requireExact(projection.targetState, annotation.targetState, `${path}.targetState`);
    requireExact(projection.factorClassification, annotation.factorClassification, `${path}.factorClassification`);
    requireExact(projection.actionFamily, annotation.actionFamily, `${path}.actionFamily`);
    requireExact(projection.priority, annotation.priority, `${path}.priority`);
  }
  return value as SourceSelectionDiagnosisV1;
}

function assertCatalogReferenceIsRepresented(
  expected: ReportSemanticSourceSelectionCatalogEntry,
  refs: readonly { questionId: string; sourceId: string }[],
  path: string
): void {
  if (expected.questionId === null && expected.sourceId === null) return;
  if (!refs.some((ref) =>
    (expected.questionId === null || ref.questionId === expected.questionId)
    && (expected.sourceId === null || ref.sourceId === expected.sourceId)
  )) {
    throw new TypeError(`${path} does not preserve the catalog-owned question/source identity.`);
  }
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

function requireNonnegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${path} must be a nonnegative integer.`);
  return value;
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

import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  parseReportSemanticReviewInput,
  parseReportSemanticReviewOutput,
  parseGenerativeSearchAnswerResult,
  verifyReportSemanticReviewReceipt,
  verifyFreeV4DirectAnalysisReceipt,
  verifyFreeV4DirectCoreReceipt
} from "@open-geo-console/ai-report-engine";
import type { JobCheckpoint, ScanJobStage } from "./schema";

export type SemanticReviewContractVersion = typeof REPORT_SEMANTIC_REVIEW_CONTRACT;
export type FreeDirectSemanticsVersion = typeof FREE_V4_DIRECT_SEMANTICS_VERSION;

const CARRIER_KEY = "semanticReviewContractVersion" as const;
const FREE_DIRECT_CARRIER_KEY = "freeDirectSemanticsVersion" as const;

export function createSemanticReviewInitialCheckpoint(
  version?: SemanticReviewContractVersion
): JobCheckpoint {
  if (version === undefined) return {};
  requireVersion(version, "$checkpoint.semanticReviewContractVersion");
  return { semanticReviewContractVersion: version };
}

export function createFreeDirectSemanticsInitialCheckpoint(): JobCheckpoint {
  return { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION };
}

export function readFreeDirectSemanticsVersion(value: unknown): FreeDirectSemanticsVersion | null {
  const checkpoint = record(value, "$checkpoint");
  const declared = Object.prototype.hasOwnProperty.call(checkpoint, FREE_DIRECT_CARRIER_KEY);
  assertNoNestedCarrier(checkpoint, FREE_DIRECT_CARRIER_KEY);
  if (!declared) return null;
  if (checkpoint[FREE_DIRECT_CARRIER_KEY] !== FREE_V4_DIRECT_SEMANTICS_VERSION) {
    throw new TypeError(`$checkpoint.${FREE_DIRECT_CARRIER_KEY} must equal ${FREE_V4_DIRECT_SEMANTICS_VERSION}.`);
  }
  return FREE_V4_DIRECT_SEMANTICS_VERSION;
}

export function readSemanticReviewContractVersion(value: unknown): SemanticReviewContractVersion | null {
  const checkpoint = record(value, "$checkpoint");
  const declared = Object.prototype.hasOwnProperty.call(checkpoint, CARRIER_KEY);
  assertNoNestedCarrier(checkpoint);
  if (!declared) return null;
  return requireVersion(checkpoint[CARRIER_KEY], `$checkpoint.${CARRIER_KEY}`);
}

export function assertSemanticReviewCarrierUpdate(
  persistedValue: unknown,
  updateValue: unknown
): void {
  const persisted = readSemanticReviewContractVersion(persistedValue);
  const proposed = semanticReviewCarrierUpdateVersion(updateValue);
  if (proposed !== undefined && proposed !== persisted) {
    throw new Error("The semantic-review checkpoint carrier is immutable after job creation.");
  }
  const persistedFree = readFreeDirectSemanticsVersion(persistedValue);
  const proposedFree = freeDirectSemanticsCarrierUpdateVersion(updateValue);
  if (proposedFree !== undefined && proposedFree !== persistedFree) {
    throw new Error("The Free direct-semantics checkpoint carrier is immutable after job creation.");
  }
}

export function freeDirectSemanticsCarrierUpdateVersion(
  updateValue: unknown
): FreeDirectSemanticsVersion | undefined {
  const update = record(updateValue, "$checkpointUpdate");
  const declared = Object.prototype.hasOwnProperty.call(update, FREE_DIRECT_CARRIER_KEY);
  const proposed = readFreeDirectSemanticsVersion(update);
  return declared ? proposed ?? undefined : undefined;
}

export function semanticReviewCarrierUpdateVersion(
  updateValue: unknown
): SemanticReviewContractVersion | undefined {
  const update = record(updateValue, "$checkpointUpdate");
  const declared = Object.prototype.hasOwnProperty.call(update, CARRIER_KEY);
  const proposed = readSemanticReviewContractVersion(update);
  return declared ? proposed ?? undefined : undefined;
}

export function assertSemanticReviewCarrierEquals(
  checkpoint: unknown,
  expected: SemanticReviewContractVersion | FreeDirectSemanticsVersion | null
): void {
  const semantic = readSemanticReviewContractVersion(checkpoint);
  const direct = readFreeDirectSemanticsVersion(checkpoint);
  if ((expected === FREE_V4_DIRECT_SEMANTICS_VERSION && (direct !== expected || semantic !== null)) ||
      (expected !== FREE_V4_DIRECT_SEMANTICS_VERSION && (semantic !== expected || direct !== null))) {
    throw new Error("The semantic-review checkpoint carrier does not match the job creation authority.");
  }
}

export function resolvePaidV3SemanticReviewContract(input: {
  checkpoint: unknown;
  stage: ScanJobStage;
  reportId: string;
  questionSetId: string;
  questionSetIdentity: string;
}): SemanticReviewContractVersion | FreeDirectSemanticsVersion | null {
  const version = readSemanticReviewContractVersion(input.checkpoint);
  const freeDirectVersion = readFreeDirectSemanticsVersion(input.checkpoint);
  if (version !== null && freeDirectVersion !== null) {
    throw new Error("A Free job cannot carry both legacy review and direct semantic authority.");
  }
  if (version === null && freeDirectVersion === null) return null;
  if (input.stage !== "completed" && input.stage !== "completed_limited") {
    throw new Error("A marker-bearing Free teaser must be terminal before Paid V3 creation.");
  }
  const checkpoint = record(input.checkpoint, "$checkpoint");
  const teaser = record(checkpoint.freeTeaser, "$checkpoint.freeTeaser");
  if (teaser.version !== "free-teaser-checkpoint-v1" || teaser.stage !== "ready" ||
      teaser.reportId !== input.reportId || teaser.questionSetId !== input.questionSetId ||
      teaser.questionSetIdentity !== input.questionSetIdentity) {
    throw new Error("The marker-bearing Free teaser does not match the Paid V3 question lineage.");
  }
  if (freeDirectVersion !== null) {
    assertTerminalFreeDirectReceipt(teaser);
    return freeDirectVersion;
  }
  assertTerminalFreeSemanticReceipt(teaser);
  return version;
}

function assertTerminalFreeDirectReceipt(teaser: Record<string, unknown>): void {
  const core = record(teaser.q1AnswerDraft, "$checkpoint.freeTeaser.q1AnswerDraft");
  const provenance = record(core.provenance, "$checkpoint.freeTeaser.q1AnswerDraft.provenance");
  const answerResult = record(teaser.q1AnswerResult, "$checkpoint.freeTeaser.q1AnswerResult");
  const questions = teaser.directQuestionTexts;
  if (!Array.isArray(questions) || questions.length !== 3 || !teaser.directCoreReceipt ||
      (teaser.directAnalysisStatus !== "completed" && teaser.directAnalysisStatus !== "incomplete")) {
    throw new Error("The Free direct core receipt or analysis status is incomplete.");
  }
  const parsedAnswer = parseGenerativeSearchAnswerResult(answerResult, {
    expectedQuestionId: requireText(core.questionId, "$checkpoint.freeTeaser.q1AnswerDraft.questionId"),
    locale: requireText(teaser.locale, "$checkpoint.freeTeaser.locale"),
    semanticValidation: "free_direct"
  });
  if (parsedAnswer.answerText !== core.answerText || JSON.stringify(parsedAnswer.refusal) !== JSON.stringify(core.refusal) ||
      JSON.stringify(parsedAnswer.sources.map(answerSourceProjection)) !==
        JSON.stringify((Array.isArray(core.sources) ? core.sources : []).map(answerSourceProjection))) {
    throw new Error("The Free direct Q1 core differs from its provider answer authority.");
  }
  const coreReceipt = verifyFreeV4DirectCoreReceipt(teaser.directCoreReceipt, {
    questionSetIdentity: requireText(teaser.questionSetIdentity, "$checkpoint.freeTeaser.questionSetIdentity"),
    questions: questions.map((question, index) => requireText(question, `$checkpoint.freeTeaser.directQuestionTexts[${index}]`)),
    questionId: requireText(core.questionId, "$checkpoint.freeTeaser.q1AnswerDraft.questionId"),
    questionText: requireText(core.exactQuestion, "$checkpoint.freeTeaser.q1AnswerDraft.exactQuestion"),
    answer: teaser.q1AnswerResult,
    sources: core.sources,
    providerResponseId: parsedAnswer.providerResponseId,
    providerId: requireText(provenance.providerId, "$checkpoint.freeTeaser.q1AnswerDraft.provenance.providerId"),
    model: requireText(provenance.model, "$checkpoint.freeTeaser.q1AnswerDraft.provenance.model"),
    searchMode: requireText(provenance.searchMode, "$checkpoint.freeTeaser.q1AnswerDraft.provenance.searchMode"),
    searchedAt: requireText(provenance.searchedAt, "$checkpoint.freeTeaser.q1AnswerDraft.provenance.searchedAt"),
    completedAt: requireText(provenance.completedAt, "$checkpoint.freeTeaser.q1AnswerDraft.provenance.completedAt"),
    nonProseProjection: {
      version: teaser.version,
      identityHash: teaser.identityHash,
      reportId: teaser.reportId,
      admissionSnapshotId: teaser.admissionSnapshotId,
      admissionContentIdentityHash: teaser.admissionContentIdentityHash,
      foundationHash: teaser.foundationHash,
      locale: teaser.locale,
      region: teaser.region,
      authorityId: teaser.authorityId,
      evidenceCutoffAt: teaser.evidenceCutoffAt,
      questionSetId: teaser.questionSetId,
      questionSetIdentity: teaser.questionSetIdentity,
      questionId: core.questionId,
      answerHash: provenance.answerHash,
      sourceHash: provenance.sourceHash
    }
  });
  if (teaser.directAnalysisStatus === "incomplete") {
    if (teaser.directAnalysis !== undefined || teaser.directAnalysisHandleBindings !== undefined || teaser.directAnalysisReceipt !== undefined) {
      throw new Error("The Free direct incomplete analysis must not carry an unverified projection.");
    }
    return;
  }
  const analysis = record(teaser.directAnalysis, "$checkpoint.freeTeaser.directAnalysis");
  const bindings = teaser.directAnalysisHandleBindings;
  if (!Array.isArray(bindings) || !teaser.directAnalysisReceipt) {
    throw new Error("The Free direct completed analysis receipt is incomplete.");
  }
  verifyFreeV4DirectAnalysisReceipt(teaser.directAnalysisReceipt, {
    coreReceiptHash: coreReceipt.receiptHash,
    analysis: analysis as never,
    handleBindings: bindings.map((binding, index) => {
      const row = record(binding, `$checkpoint.freeTeaser.directAnalysisHandleBindings[${index}]`);
      return {
        handle: requireText(row.handle, `$checkpoint.freeTeaser.directAnalysisHandleBindings[${index}].handle`),
        evidenceRef: requireText(row.evidenceRef, `$checkpoint.freeTeaser.directAnalysisHandleBindings[${index}].evidenceRef`)
      };
    }),
    nonProseProjection: {
      version: teaser.version,
      identityHash: teaser.identityHash,
      reportId: teaser.reportId,
      admissionSnapshotId: teaser.admissionSnapshotId,
      admissionContentIdentityHash: teaser.admissionContentIdentityHash,
      foundationHash: teaser.foundationHash,
      locale: teaser.locale,
      region: teaser.region,
      authorityId: teaser.authorityId,
      questionSetIdentity: teaser.questionSetIdentity,
      analysisStatus: teaser.directAnalysisStatus
    }
  });
}

function answerSourceProjection(value: unknown): unknown {
  const source = record(value, "$checkpoint.freeTeaser.q1AnswerDraft.sources[]");
  return {
    sourceId: source.sourceId,
    title: source.title,
    canonicalUrl: source.canonicalUrl,
    registrableDomain: source.registrableDomain,
    citedText: source.citedText ?? null,
    providerResultOrder: source.providerResultOrder
  };
}

/**
 * Checkout has no natural-language authority. It only accepts the complete
 * receipt that the Free review persisted and the exact reviewed projection it
 * binds. This deliberately rejects partial, missing and tampered checkpoints.
 */
function assertTerminalFreeSemanticReceipt(teaser: Record<string, unknown>): void {
  const semanticReview = record(teaser.semanticReview, "$checkpoint.freeTeaser.semanticReview");
  if (semanticReview.version !== REPORT_SEMANTIC_REVIEW_CONTRACT) {
    throw new Error("The marker-bearing Free teaser has no current semantic receipt.");
  }
  const input = parseReportSemanticReviewInput(semanticReview.input);
  const output = parseReportSemanticReviewOutput(semanticReview.output, input);
  const applied = record(semanticReview.applied, "$checkpoint.freeTeaser.semanticReview.applied");
  if (!Array.isArray(applied.fields) || !applied.receipt) {
    throw new Error("The marker-bearing Free teaser semantic receipt is incomplete.");
  }
  verifyReportSemanticReviewReceipt(applied.receipt, input, output, applied.fields);
  const card = record(teaser.q1AnswerCard, "$checkpoint.freeTeaser.q1AnswerCard");
  const diagnosis = record(card.diagnosis, "$checkpoint.freeTeaser.q1AnswerCard.diagnosis");
  const projection = new Map<string, unknown>([
    ["q1AnswerCard.answerText", card.answerText],
    ["q1Diagnosis.selectionSummary", diagnosis.selectionSummary],
    ["q1Diagnosis.targetGap", diagnosis.targetGap]
  ]);
  for (const field of applied.fields) {
    const row = record(field, "$checkpoint.freeTeaser.semanticReview.applied.fields[]");
    if (typeof row.path === "string" && projection.has(row.path) && projection.get(row.path) !== row.appliedText) {
      throw new Error("The reviewed Free projection no longer matches its semantic receipt.");
    }
  }
}

function requireVersion(value: unknown, path: string): SemanticReviewContractVersion {
  if (value !== REPORT_SEMANTIC_REVIEW_CONTRACT) {
    throw new TypeError(`${path} must equal ${REPORT_SEMANTIC_REVIEW_CONTRACT}.`);
  }
  return REPORT_SEMANTIC_REVIEW_CONTRACT;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertNoNestedCarrier(root: Record<string, unknown>, carrierKey: string = CARRIER_KEY): void {
  const pending = Object.entries(root)
    .filter(([key]) => key !== carrierKey)
    .map(([, value]) => value);
  const seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    const row = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(row, carrierKey)) {
      throw new TypeError(`$checkpoint.${carrierKey} must be declared only at the checkpoint root.`);
    }
    pending.push(...Object.values(row));
  }
}

function requireText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be nonblank text.`);
  return value;
}

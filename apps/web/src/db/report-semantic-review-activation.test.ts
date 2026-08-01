import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt
} from "@open-geo-console/ai-report-engine";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertSemanticReviewCarrierEquals,
  assertSemanticReviewCarrierUpdate,
  createFreeDirectSemanticsInitialCheckpoint,
  createSemanticReviewInitialCheckpoint,
  readFreeDirectSemanticsVersion,
  readSemanticReviewContractVersion,
  resolvePaidV3SemanticReviewContract
} from "./report-semantic-review-activation";

describe("semantic-review checkpoint carrier", () => {
  it("keeps the Free direct carrier separate and immutable", () => {
    const direct = createFreeDirectSemanticsInitialCheckpoint();
    expect(direct).toEqual({ freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION });
    expect(readFreeDirectSemanticsVersion(direct)).toBe(FREE_V4_DIRECT_SEMANTICS_VERSION);
    expect(readSemanticReviewContractVersion(direct)).toBeNull();
    expect(() => assertSemanticReviewCarrierUpdate({}, direct)).toThrow(/immutable/i);
    expect(() => assertSemanticReviewCarrierUpdate(direct, direct)).not.toThrow();
    expect(() => readFreeDirectSemanticsVersion({
      freeTeaser: { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION }
    })).toThrow(/root/i);
  });
  it("creates only absent or exact V1 initial authorities", () => {
    expect(createSemanticReviewInitialCheckpoint()).toEqual({});
    expect(createSemanticReviewInitialCheckpoint(REPORT_SEMANTIC_REVIEW_CONTRACT)).toEqual({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    });
    expect(readSemanticReviewContractVersion({})).toBeNull();
    expect(readSemanticReviewContractVersion({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).toBe(REPORT_SEMANTIC_REVIEW_CONTRACT);
  });

  it.each([null, "", "report-semantic-review-v2", 1, {}, []])(
    "rejects invalid root carrier value %j",
    (semanticReviewContractVersion) => {
      expect(() => readSemanticReviewContractVersion({ semanticReviewContractVersion })).toThrow(/must equal/i);
    }
  );

  it("rejects a nested carrier even when the root is absent or valid", () => {
    expect(() => readSemanticReviewContractVersion({
      freeTeaser: { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    })).toThrow(/root/i);
    expect(() => readSemanticReviewContractVersion({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      freeTeaser: { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    })).toThrow(/root/i);
  });

  it("allows omission or exact preservation but rejects late add, removal, and change", () => {
    const active = { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT };
    expect(() => assertSemanticReviewCarrierUpdate({}, { stage: "planning" })).not.toThrow();
    expect(() => assertSemanticReviewCarrierUpdate(active, { stage: "planning" })).not.toThrow();
    expect(() => assertSemanticReviewCarrierUpdate(active, active)).not.toThrow();
    expect(() => assertSemanticReviewCarrierUpdate({}, active)).toThrow(/immutable/i);
    expect(() => assertSemanticReviewCarrierUpdate(active, { semanticReviewContractVersion: null })).toThrow();
    expect(() => assertSemanticReviewCarrierEquals(active, null)).toThrow(/authority/i);
  });

  it("rejects a marker-bearing terminal lineage without its complete Free receipt", () => {
    const checkpoint = readyCheckpoint();
    expect(() => resolvePaidV3SemanticReviewContract({
      checkpoint,
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toThrow(/semanticReview|receipt/i);
    expect(resolvePaidV3SemanticReviewContract({
      checkpoint: { freeTeaser: checkpoint.freeTeaser },
      stage: "synthesizing",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toBeNull();
  });

  it.each([
    ["nonterminal job", { stage: "synthesizing" }],
    ["wrong report", { reportId: "report-other" }],
    ["wrong question set", { questionSetId: "questions-other" }],
    ["wrong question identity", { questionSetIdentity: "b".repeat(64) }]
  ])("blocks marker-bearing %s", (_label, overrides) => {
    expect(() => resolvePaidV3SemanticReviewContract({
      checkpoint: readyCheckpoint(),
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64),
      ...overrides
    } as Parameters<typeof resolvePaidV3SemanticReviewContract>[0])).toThrow(/terminal|lineage/i);
  });

  it("verifies both terminal Direct receipts without minting a legacy Paid marker", () => {
    const checkpoint = directReadyCheckpoint();
    expect(resolvePaidV3SemanticReviewContract({
      checkpoint,
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toBeNull();
    (checkpoint.freeTeaser.q1AnswerDraft as { answerText: string }).answerText = "tampered";
    expect(() => resolvePaidV3SemanticReviewContract({
      checkpoint,
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toThrow(/differs|match/u);
  });

  it("accepts a completed receipt-valid Direct result regardless of a harmless legacy model boolean", () => {
    expect(resolvePaidV3SemanticReviewContract({
      checkpoint: directReadyCheckpoint(false),
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toBeNull();
  });
});

function readyCheckpoint() {
  return {
    semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
    freeTeaser: {
      version: "free-teaser-checkpoint-v1",
      stage: "ready",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    }
  };
}

function directReadyCheckpoint(checkoutEligible = true) {
  const bindings = [{ handle: "S1", evidenceRef: "source-1" }];
  const answerSources = [{
    sourceId: "source-1", title: "Source", canonicalUrl: "https://source.example/",
    registrableDomain: "source.example", citedText: "Evidence", providerResultOrder: 0
  }];
  const coreSources = answerSources.map((source) => ({ ...source, retrievalStatus: "search_source_only", ownershipCategory: "unknown" }));
  const answerResult = {
    questionId: "question-1", answerText: "Direct answer.", sources: answerSources, refusal: null,
    searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z",
    providerResponseId: "response-1"
  };
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const provenance = {
    providerId: "mimo", model: "model", searchMode: "native", promptVersion: "generative-search-answer-v1",
    searchedAt: answerResult.searchedAt, completedAt: answerResult.completedAt,
    answerHash: hash(answerResult), sourceHash: hash(answerSources)
  };
  const analysis = {
    summary: "Direct natural analysis.", observations: [], recommendations: [],
    evidenceHandles: ["S1"], checkoutEligible
  };
  const teaser: Record<string, unknown> = {
    version: "free-teaser-checkpoint-v1",
    stage: "ready",
    identityHash: "d".repeat(64),
    reportId: "report-1",
    admissionSnapshotId: "admission-1",
    admissionContentIdentityHash: "e".repeat(64),
    foundationHash: "f".repeat(64),
    locale: "en",
    region: "US",
    authorityId: "authority-1",
    evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
    questionSetId: "questions-1",
    questionSetIdentity: "a".repeat(64),
    directQuestionTexts: ["Question one?", "Question two?", "Question three?"],
    directAnalysisStatus: "completed",
    directAnalysis: analysis,
    directAnalysisHandleBindings: bindings,
    readyAt: "2030-01-01T00:01:00.000Z",
    q1AnswerResult: answerResult,
    q1AnswerDraft: {
      questionId: "question-1", exactQuestion: "Question one?", answerMode: "generative_search_v1",
      status: "answered", answerText: "Direct answer.", refusal: null, sources: coreSources, provenance,
      audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 1, inaccessibleCount: 0 }
    }
  };
  teaser.directCoreReceipt = createFreeV4DirectCoreReceipt({
    questionSetIdentity: teaser.questionSetIdentity as string,
    questions: teaser.directQuestionTexts as string[],
    questionId: "question-1",
    questionText: "Question one?",
    answer: answerResult,
    sources: coreSources,
    providerResponseId: "response-1",
    providerId: provenance.providerId,
    model: provenance.model,
    searchMode: provenance.searchMode,
    searchedAt: provenance.searchedAt,
    completedAt: provenance.completedAt,
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
      questionId: "question-1",
      answerHash: provenance.answerHash,
      sourceHash: provenance.sourceHash
    }
  });
  teaser.directAnalysisReceipt = createFreeV4DirectAnalysisReceipt({
    coreReceiptHash: (teaser.directCoreReceipt as { receiptHash: string }).receiptHash,
    analysis,
    handleBindings: bindings,
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
  return {
    freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION,
    freeTeaser: teaser as typeof teaser & { q1AnswerDraft: { answerText: string } }
  };
}

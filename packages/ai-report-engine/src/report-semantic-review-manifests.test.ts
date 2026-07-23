import { describe, expect, it } from "vitest";
import {
  applyPaidV3SemanticReviewToReport,
  buildFreeV4SemanticReviewManifest,
  buildPaidV3SemanticReviewManifest
} from "./report-semantic-review-manifests";
import {
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  hashReportSemanticReviewValue,
  reportSemanticTextHash,
  type ReportSemanticReviewInput
} from "./report-semantic-review";

const seed = () => ({
  locale: "zh-CN", target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["target.example", "Target Organization", "Target Legal Entity", "Target Brand"] }, expectedModel: { providerId: "mock", modelId: "model" },
  questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: questionId, originalTextHash: reportSemanticTextHash(questionId) })),
  sources: [{ sourceId: "s1", questionId: "q1", canonicalUrl: "https://source.example/", originalText: "Source text", originalTextHash: reportSemanticTextHash("Source text") }],
  evidence: [{ evidenceId: "e1", questionId: "q1", sourceId: "s1", originalText: "Evidence text", originalTextHash: reportSemanticTextHash("Evidence text") }],
  observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1", originalText: "Target", originalTextHash: reportSemanticTextHash("Target") }],
  entities: [], answerSubjects: [{ questionId: "q1", fieldPath: "answer" }],
  fields: [{ path: "answer", text: "Target term remains untouched", mutability: "mutable" as const, questionId: "q1", allowedEvidenceIds: ["e1"], allowedSourceIds: ["s1"] }],
  nonProseProjectionHash: hashReportSemanticReviewValue({ id: 1 })
});

const sourceSelectionCatalog = () => [
  { annotationId: "a-contribution", itemId: "contribution-q1-s1", kind: "contribution" as const, questionId: "q1", sourceId: "s1", profileId: "profile-1", actionId: null, allowedEvidenceIds: ["e1"] },
  { annotationId: "a-gap", itemId: "gap-profile-1-problem-match", kind: "target_state" as const, questionId: "q1", sourceId: "s1", profileId: "profile-1", actionId: null, allowedEvidenceIds: ["e1"] },
  { annotationId: "a-factor", itemId: "factor-profile-1-problem-match", kind: "factor" as const, questionId: "q1", sourceId: "s1", profileId: "profile-1", actionId: null, allowedEvidenceIds: ["e1"] },
  { annotationId: "a-action", itemId: "action-first-party", kind: "action" as const, questionId: "q1", sourceId: null, profileId: "profile-1", actionId: "action-first-party", allowedEvidenceIds: ["e1"] }
];

describe("semantic review manifests", () => {
  it("builds pure Free and Paid manifests from caller-shaped values", () => {
    const free = buildFreeV4SemanticReviewManifest(seed());
    const paid = buildPaidV3SemanticReviewManifest(seed());
    expect(free.lifecycle).toBe("free_v4");
    expect(free.fields[0]?.originalText).toBe("Target term remains untouched");
    expect(paid.lifecycle).toBe("paid_v3");
    expect(free.answerSubjects).toEqual([{ questionId: "q1", fieldPath: "answer" }]);
    expect(free.target.aliases).toEqual(["target.example", "Target Organization", "Target Legal Entity", "Target Brand"]);
  });

  it("builds and mechanically applies a complete Paid manifest without changing non-prose data", () => {
    const input = buildPaidV3SemanticReviewManifest({ ...seed(), sourceSelectionCatalog: sourceSelectionCatalog() });
    const report = { reportId: "report-1", question: "q1", answer: "Target term remains untouched", count: 3 };
    const review = validPaidReview(input);
    const firstField = (review.fields as Array<Record<string, unknown>>)[0]!;
    firstField.decision = "corrected";
    firstField.correctedText = "Target Brand 提供 FBA 头程服务。";
    firstField.issueCodes = ["natural_language"];
    review.overallDecision = "corrected";

    const applied = applyPaidV3SemanticReviewToReport(
      report,
      input,
      review,
      input.nonProseProjectionHash
    );

    expect(applied.report).toEqual({
      reportId: "report-1",
      question: "q1",
      answer: "Target Brand 提供 FBA 头程服务。",
      count: 3
    });
    expect(report.answer).toBe("Target term remains untouched");
    expect(applied.receipt.nonProseProjectionHash).toBe(input.nonProseProjectionHash);
    expect(applied.annotations.sourceSelection?.map(({ kind, itemId }) => ({ kind, itemId }))).toEqual(
      sourceSelectionCatalog().map(({ kind, itemId }) => ({ kind, itemId }))
    );
  });

  it("fails closed on missing source-selection evidence and unknown or cross-owned IDs", () => {
    expect(() => buildPaidV3SemanticReviewManifest({
      ...seed(),
      sourceSelectionCatalog: [{ ...sourceSelectionCatalog()[0]!, allowedEvidenceIds: [] }]
    })).toThrow(/at least one exact evidence ID/u);

    expect(() => buildPaidV3SemanticReviewManifest({
      ...seed(),
      sourceSelectionCatalog: [{ ...sourceSelectionCatalog()[0]!, allowedEvidenceIds: ["missing"] }]
    })).toThrow(/unknown evidence/u);

    expect(() => buildPaidV3SemanticReviewManifest({
      ...seed(),
      sourceSelectionCatalog: [{ ...sourceSelectionCatalog()[0]!, questionId: "q2" }]
    })).toThrow(/another question/u);
  });

  it("rejects incomplete, mismatched, ambiguous, or evidence-free Paid annotations", () => {
    const input = buildPaidV3SemanticReviewManifest({ ...seed(), sourceSelectionCatalog: sourceSelectionCatalog() });

    const evidenceFree = validPaidReview(input);
    ((evidenceFree.annotations as Record<string, unknown>).sourceSelection as Array<Record<string, unknown>>)[0]!.evidenceIds = [];
    expect(() => applyPaidV3SemanticReviewToReport({ answer: "Target term remains untouched" }, input, evidenceFree, input.nonProseProjectionHash))
      .toThrow(/at least one catalog-owned evidence ID/u);

    const wrongItem = validPaidReview(input);
    ((wrongItem.annotations as Record<string, unknown>).sourceSelection as Array<Record<string, unknown>>)[1]!.itemId = "another-gap";
    expect(() => applyPaidV3SemanticReviewToReport({ answer: "Target term remains untouched" }, input, wrongItem, input.nonProseProjectionHash))
      .toThrow(/itemId/u);

    const ambiguous = validPaidReview(input);
    const ambiguousAnswer = ((ambiguous.annotations as Record<string, unknown>).answers as Array<Record<string, unknown>>)[0]!;
    ambiguousAnswer.targetPresence = "ambiguous";
    ambiguousAnswer.targetFirstSentence = null;
    ambiguousAnswer.targetRoles = [];
    ambiguousAnswer.entityRole = "ambiguous";
    expect(() => applyPaidV3SemanticReviewToReport({ answer: "Target term remains untouched" }, input, ambiguous, input.nonProseProjectionHash))
      .toThrow(/must not be ambiguous/u);

    const missingCatalogRow = validPaidReview(input);
    ((missingCatalogRow.annotations as Record<string, unknown>).sourceSelection as unknown[]).pop();
    expect(() => applyPaidV3SemanticReviewToReport({ answer: "Target term remains untouched" }, input, missingCatalogRow, input.nonProseProjectionHash))
      .toThrow(/cover/u);
  });
});

function validPaidReview(input: ReportSemanticReviewInput): Record<string, unknown> {
  const semanticValue = {
    contribution: { contributionRole: "first_party_capability", targetState: null, factorClassification: null, actionFamily: null, priority: null },
    target_state: { contributionRole: null, targetState: "missing", factorClassification: null, actionFamily: null, priority: null },
    factor: { contributionRole: null, targetState: null, factorClassification: "problem_match", actionFamily: null, priority: null },
    action: { contributionRole: null, targetState: null, factorClassification: null, actionFamily: "first_party_fact_page", priority: "high" }
  } as const;
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    inputHash: input.inputHash,
    providerId: input.expectedModel.providerId,
    modelId: input.expectedModel.modelId,
    fields: input.fields.map((field) => ({
      path: field.path,
      originalTextHash: field.originalTextHash,
      decision: "pass",
      issueCodes: [],
      reason: "The text is faithful to the evidence.",
      evidenceIds: field.allowedEvidenceIds,
      sourceIds: field.allowedSourceIds,
      retainedOriginalTerms: []
    })),
    questionDistinctness: { decision: "distinct", duplicateGroups: [], reason: "The questions are semantically distinct." },
    annotations: {
      observationResults: [{ observationId: "o1", resultId: "r1", targetPresence: "present", competitorPresence: "absent", reason: "The evidence identifies the target." }],
      answers: [{
        questionId: "q1",
        relevance: "responsive",
        entityRole: "target",
        targetPresence: "present",
        targetFirstSentence: 1,
        targetRoles: ["service provider"],
        competitorEntityIds: [],
        evidenceIds: ["e1"],
        sourceIds: ["s1"],
        reason: "The answer directly addresses q1."
      }],
      evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: field.allowedEvidenceIds, sourceIds: field.allowedSourceIds, reason: "Exact owned references." })),
      sourceSelection: input.sourceSelectionCatalog!.map((item) => ({
        annotationId: item.annotationId,
        itemId: item.itemId,
        kind: item.kind,
        questionId: item.questionId,
        sourceId: item.sourceId,
        profileId: item.profileId,
        actionId: item.actionId,
        ...semanticValue[item.kind],
        evidenceIds: item.allowedEvidenceIds,
        reason: "The bound evidence supports this catalog item."
      }))
    },
    overallDecision: "pass"
  };
}

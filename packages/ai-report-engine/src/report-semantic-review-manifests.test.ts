import { describe, expect, it } from "vitest";
import {
  applyCompletePaidV3SemanticReviewToReport,
  applyPaidV3SemanticReviewToReport,
  bindPaidV3SemanticReviewReceiptToFinalReport,
  buildCanonicalPaidV3DraftManifestCoverage,
  buildFreeV4SemanticReviewManifest,
  buildPaidV3SemanticReviewManifest,
  buildPaidV3SourceSelectionCatalog,
  verifyPaidV3SemanticReviewApplication
} from "./report-semantic-review-manifests";
import {
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  assertPaidV3Q1AnnotationContinuity,
  hashReportSemanticReviewValue,
  parseReportSemanticReviewInput,
  reportSemanticTextHash,
  type ReportSemanticReviewInput
} from "./report-semantic-review";
import { hashCombinedGeoReportV3ReceiptExcludedProjection } from "./combined-geo-report-v3";

const seed = () => ({
  locale: "zh-CN", target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["target.example", "Target Organization", "Target Legal Entity", "Target Brand"] }, expectedModel: { providerId: "mock", modelId: "model" },
  questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: questionId, originalTextHash: reportSemanticTextHash(questionId) })),
  sources: [{ sourceId: "s1", questionId: "q1", canonicalUrl: "https://source.example/", originalText: "Source text", originalTextHash: reportSemanticTextHash("Source text") }],
  evidence: [{ evidenceId: "e1", questionId: "q1", sourceId: "s1", originalText: "Evidence text", originalTextHash: reportSemanticTextHash("Evidence text") }],
  observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1", originalText: "Target", originalTextHash: reportSemanticTextHash("Target") }],
  entities: [], answerSubjects: [{ questionId: "q1", fieldPath: "answer" }],
  authorityBindings: authorityBindings(),
  fields: [{ path: "answer", text: "Target term remains untouched", mutability: "mutable" as const, questionId: "q1", allowedEvidenceIds: ["e1"], allowedSourceIds: ["s1"] }],
  nonProseProjectionHash: hashReportSemanticReviewValue({ id: 1 })
});

function authorityBindings() {
  const hash = (name: string) => hashReportSemanticReviewValue({ name });
  return {
    rootMarker: REPORT_SEMANTIC_REVIEW_CONTRACT,
    artifactIdentityHash: hash("artifactIdentity"),
    reviewedFreeAuthorityHash: hash("reviewedFreeAuthority"),
    answerCheckpointHash: hash("answerCheckpoint"),
    commercialSnapshotsHash: hash("commercialSnapshots"),
    publicSourceHash: hash("publicSource"),
    providerDiscoveryHash: hash("providerDiscovery"),
    technicalFoundationHash: hash("technicalFoundation"),
    aiFoundationHash: hash("aiFoundation"),
    evidenceAssetsHash: hash("evidenceAssets")
  };
}

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

  it("requires complete Paid authority bindings, hashes them canonically, and preserves Free compatibility", () => {
    const { authorityBindings: _authorityBindings, ...legacySeed } = seed();
    expect(() => buildPaidV3SemanticReviewManifest(legacySeed)).toThrow(/authorityBindings.*required/i);
    expect(buildFreeV4SemanticReviewManifest(legacySeed).authorityBindings).toBeUndefined();

    const input = buildPaidV3SemanticReviewManifest(seed());
    for (const key of Object.keys(input.authorityBindings ?? {}).filter((key) => key !== "rootMarker")) {
      const tampered = structuredClone(input) as Record<string, any>;
      tampered.authorityBindings[key] = "a".repeat(64);
      expect(() => parseReportSemanticReviewInput(tampered)).toThrow(/canonical review input/i);
    }
    const wrongMarker = structuredClone(input) as Record<string, any>;
    wrongMarker.authorityBindings.rootMarker = "other-marker";
    expect(() => parseReportSemanticReviewInput(wrongMarker)).toThrow(/rootMarker/i);
  });

  it("preserves every Q1 semantic annotation field across the accepted Free authority", () => {
    const acceptedFree = {
      questionId: "q1", relevance: "responsive", entityRole: "target", targetPresence: "present",
      targetFirstSentence: 1, targetRoles: ["answer subject", "provider"], competitorEntityIds: ["competitor-1"],
      evidenceIds: ["e1"], sourceIds: ["s1"], reason: "Free reason."
    };
    expect(() => assertPaidV3Q1AnnotationContinuity({ ...acceptedFree, reason: "Paid reason." }, acceptedFree)).not.toThrow();
    for (const [key, value] of Object.entries({
      questionId: "q2", relevance: "blocked", entityRole: "competitor", targetPresence: "absent",
      targetFirstSentence: 2, targetRoles: ["provider", "answer subject"], competitorEntityIds: [],
      evidenceIds: [], sourceIds: []
    })) {
      expect(() => assertPaidV3Q1AnnotationContinuity({ ...acceptedFree, [key]: value }, acceptedFree))
        .toThrow(new RegExp(key, "i"));
    }
    expect(() => assertPaidV3Q1AnnotationContinuity({ ...acceptedFree, evidenceIds: ["e1", "e1"] }, acceptedFree)).toThrow(/unique/i);
    const { targetRoles: _targetRoles, ...missing } = acceptedFree;
    expect(() => assertPaidV3Q1AnnotationContinuity(missing, acceptedFree)).toThrow(/targetRoles/i);
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

  it("constructs stable ordered catalog identities without prose semantics", () => {
    const catalog = buildPaidV3SourceSelectionCatalog([
      { kind: "contribution", questionId: "q1", sourceId: "s1", profileId: "profile-1", allowedEvidenceIds: ["e1"] },
      { kind: "target_state", slotId: "problem-match", questionId: "q1", sourceId: "s1", profileId: "profile-1", allowedEvidenceIds: ["e1"] },
      { kind: "factor", slotId: "problem-match", questionId: "q1", sourceId: "s1", profileId: "profile-1", allowedEvidenceIds: ["e1"] },
      { kind: "action", questionId: "q1", sourceId: null, profileId: "profile-1", actionId: "action-first-party", allowedEvidenceIds: ["e1"] }
    ]);
    expect(catalog.map(({ itemId }) => itemId)).toEqual([
      "contribution:profile-1:q1:s1",
      "target_state:profile-1:problem-match",
      "factor:profile-1:problem-match",
      "action:action-first-party"
    ]);
    expect(buildPaidV3SourceSelectionCatalog([
      { kind: "contribution", questionId: "q1", sourceId: "s1", profileId: "profile-1", allowedEvidenceIds: ["e1"] }
    ])[0]?.annotationId).toBe(catalog[0]?.annotationId);
  });

  it("canonically enumerates draft prose and rejects omitted, duplicate, extra, or contradictory policy", () => {
    const draft = {
      reportId: "report-1",
      technicalFoundation: {
        aiReport: { executiveSummary: { overview: "Customer overview", score: 72 } }
      },
      answerCards: [
        answerCard("q1", "s1", "Q1 answer", true),
        answerCard("q2", "s2", "Q2 answer", false),
        answerCard("q3", "s3", "Q3 answer", false)
      ],
      customCopy: "Additional customer prose"
    };
    const coverage = buildCanonicalPaidV3DraftManifestCoverage(draft, {
      additionalProsePaths: ["customCopy"],
      structuralStringPaths: [
        "answerCards[0].provenance.model",
        "answerCards[1].provenance.model",
        "answerCards[2].provenance.model"
      ],
      fieldOverrides: [{
        path: "answerCards[0].answerText",
        mutability: "read_only",
        allowedSourceIds: ["s1"]
      }]
    });
    expect(coverage.fields.map(({ path }) => path)).toEqual(expect.arrayContaining([
      "answerCards[0].answerText",
      "answerCards[1].answerText",
      "answerCards[2].answerText",
      "technicalFoundation.aiReport.executiveSummary.overview",
      "customCopy"
    ]));
    expect(coverage.fields.find(({ path }) => path === "answerCards[0].answerText")).toMatchObject({
      mutability: "read_only",
      questionId: "q1",
      allowedSourceIds: ["s1"]
    });
    expect(coverage.nonProseProjectionHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(buildCanonicalPaidV3DraftManifestCoverage(structuredClone(draft), {
      additionalProsePaths: ["customCopy"]
    })).toEqual(buildCanonicalPaidV3DraftManifestCoverage(structuredClone(draft), {
      additionalProsePaths: ["customCopy"]
    }));
    expect(() => buildCanonicalPaidV3DraftManifestCoverage(draft, {
      additionalProsePaths: ["missing.path"]
    })).toThrow(/unknown string leaf/u);
    expect(() => buildCanonicalPaidV3DraftManifestCoverage(draft, {
      additionalProsePaths: ["customCopy", "customCopy"]
    })).toThrow(/duplicated/u);
    expect(() => buildCanonicalPaidV3DraftManifestCoverage(draft, {
      additionalProsePaths: ["customCopy"],
      structuralStringPaths: ["customCopy"]
    })).toThrow(/contradictory/u);
    expect(() => buildCanonicalPaidV3DraftManifestCoverage({ reportId: "report-1" }))
      .toThrow(/no customer-prose/u);
  });

  it("rejects missing, extra, reordered, cross-owned, and semantically inconsistent reviewed drafts", () => {
    const input = buildPaidV3SemanticReviewManifest({ ...seed(), sourceSelectionCatalog: sourceSelectionCatalog() });
    const apply = (review: Record<string, unknown>) =>
      applyPaidV3SemanticReviewToReport({ answer: "Target term remains untouched" }, input, review, input.nonProseProjectionHash);

    const missing = validPaidReview(input);
    delete missing.sourceSelectionDraft;
    expect(() => apply(missing)).toThrow(/sourceSelectionDraft/u);

    const extra = validPaidReview(input);
    draftActions(extra).push(structuredClone(draftActions(extra)[0]!));
    refreshDraftHash(extra);
    expect(() => apply(extra)).toThrow(/cover every source-selection catalog item/u);

    const crossOwned = validPaidReview(input);
    draftContributions(crossOwned)[0]!.questionId = "q2";
    refreshDraftHash(crossOwned);
    expect(() => apply(crossOwned)).toThrow(/questionId/u);

    const semanticMismatch = validPaidReview(input);
    draftGaps(semanticMismatch)[0]!.targetState = "weak";
    refreshDraftHash(semanticMismatch);
    expect(() => apply(semanticMismatch)).toThrow(/targetState/u);

    const extendedCatalog = [
      ...sourceSelectionCatalog(),
      { annotationId: "a-action-2", itemId: "action-second", kind: "action" as const, questionId: "q1", sourceId: null, profileId: "profile-1", actionId: "action-second", allowedEvidenceIds: ["e1"] }
    ];
    const reorderedInput = buildPaidV3SemanticReviewManifest({ ...seed(), sourceSelectionCatalog: extendedCatalog });
    const reordered = validPaidReview(reorderedInput);
    draftActions(reordered).push({
      ...structuredClone(draftActions(reordered)[0]!),
      actionId: "action-second",
      title: "Second structurally bound action"
    });
    draftActions(reordered).reverse();
    refreshDraftHash(reordered);
    expect(() => applyPaidV3SemanticReviewToReport(
      { answer: "Target term remains untouched" },
      reorderedInput,
      reordered,
      reorderedInput.nonProseProjectionHash
    )).toThrow(/actionId/u);
  });

  it("applies complete draft cards, binds a receipt-excluded final hash, and re-verifies without a model call", () => {
    const base = seed();
    const sources = [
      ...base.sources,
      source("q2", "s2", "https://source.example/q2"),
      source("q3", "s3", "https://source.example/q3")
    ];
    const evidence = [
      ...base.evidence,
      evidenceRow("q2", "s2", "e2"),
      evidenceRow("q3", "s3", "e3")
    ];
    const fields = [
      ...base.fields,
      { path: "answerCards[1].answerText", text: "Q2 answer", mutability: "mutable" as const, questionId: "q2", allowedEvidenceIds: ["e2"], allowedSourceIds: ["s2"] },
      { path: "answerCards[2].answerText", text: "Q3 answer", mutability: "mutable" as const, questionId: "q3", allowedEvidenceIds: ["e3"], allowedSourceIds: ["s3"] }
    ];
    const input = buildPaidV3SemanticReviewManifest({
      ...base,
      sources,
      evidence,
      fields,
      answerSubjects: [
        { questionId: "q1", fieldPath: "answer" },
        { questionId: "q2", fieldPath: "answerCards[1].answerText" },
        { questionId: "q3", fieldPath: "answerCards[2].answerText" }
      ],
      sourceSelectionCatalog: sourceSelectionCatalog()
    });
    const review = validPaidReview(input);
    const report = {
      answer: "Target term remains untouched",
      answerCards: [
        answerCard("q1", "s1", "Q1 answer", true),
        answerCard("q2", "s2", "Q2 answer", false),
        answerCard("q3", "s3", "Q3 answer", false)
      ]
    };
    const sourceSelectionContext = {
      questions: [
        sourceSelectionQuestion("q1", "s1", "Q1 answer"),
        sourceSelectionQuestion("q2", "s2", "Q2 answer"),
        sourceSelectionQuestion("q3", "s3", "Q3 answer")
      ],
      allowPersistedIndependentExcerpts: true,
      missingEvidenceFamiliesByQuestion: [[], ["regional_fit"], ["delivery_risk"]] as const,
      finalSourceSelectionInputIdentity: {
        answerHash: "d".repeat(64),
        sourceHash: "e".repeat(64),
        targetFoundationHash: "f".repeat(64),
        locale: "zh" as const,
        contributionAnalyzerVersion: "deterministic-contribution-v1" as const,
        factorAnalyzerVersion: "observable-factor-v1" as const,
        targetComparatorVersion: "target-page-signal-v1" as const
      }
    };
    const applied = applyCompletePaidV3SemanticReviewToReport(
      report,
      input,
      review,
      input.nonProseProjectionHash,
      sourceSelectionContext
    );
    expect(applied.report.answerCards[1].geoDiagnosis).toMatchObject({
      targetMentioned: true,
      targetFirstSentence: 1,
      missingEvidenceFamilies: ["regional_fit"],
      retestQuestion: "q2"
    });
    expect(applied.report.answerCards[2].geoDiagnosis.citedOwnership.third_party_editorial).toBe(1);
    expect(applied.report.sourceSelectionDiagnosis.inputIdentity)
      .toEqual(sourceSelectionContext.finalSourceSelectionInputIdentity);
    expect(applied.receipt.sourceSelectionDraftHash).toBe(review.sourceSelectionDraftHash);
    expect(hashReportSemanticReviewValue(applied.report.sourceSelectionDiagnosis))
      .not.toBe(review.sourceSelectionDraftHash);

    const bound = bindPaidV3SemanticReviewReceiptToFinalReport(applied.report, applied.receipt);
    expect(bound.receipt.finalReviewedReportProjectionHash)
      .toBe(hashCombinedGeoReportV3ReceiptExcludedProjection(applied.report));
    expect(hashCombinedGeoReportV3ReceiptExcludedProjection(bound.report))
      .toBe(bound.receipt.finalReviewedReportProjectionHash);
    expect(() => bindPaidV3SemanticReviewReceiptToFinalReport(bound.report, applied.receipt))
      .toThrow(/must omit/u);
    expect(verifyPaidV3SemanticReviewApplication(
      bound.report,
      input,
      review,
      applied.fields,
      input.nonProseProjectionHash,
      sourceSelectionContext
    ).receipt).toEqual(bound.receipt);

    const tampered = structuredClone(bound.report);
    tampered.answerCards[1].geoDiagnosis.targetMentioned = false;
    expect(() => verifyPaidV3SemanticReviewApplication(
      tampered,
      input,
      review,
      applied.fields,
      input.nonProseProjectionHash,
      sourceSelectionContext
    )).toThrow(/finalReviewedReportProjectionHash|diagnosis projection/u);
  });
});

function validPaidReview(input: ReportSemanticReviewInput): Record<string, unknown> {
  const semanticValue = {
    contribution: { contributionRole: "first_party_capability", targetState: null, factorClassification: null, actionFamily: null, priority: null },
    target_state: { contributionRole: null, targetState: "missing", factorClassification: null, actionFamily: null, priority: null },
    factor: { contributionRole: null, targetState: null, factorClassification: "problem_match", actionFamily: null, priority: null },
    action: { contributionRole: null, targetState: null, factorClassification: null, actionFamily: "first_party_fact_page", priority: "high" }
  } as const;
  const sourceSelectionDraft = {
    version: "source_selection_diagnosis_v1",
    status: "complete",
    inputIdentity: {
      answerHash: "a".repeat(64),
      sourceHash: "b".repeat(64),
      targetFoundationHash: "c".repeat(64),
      locale: "zh",
      contributionAnalyzerVersion: "deterministic-contribution-v1",
      factorAnalyzerVersion: "observable-factor-v1",
      targetComparatorVersion: "target-page-signal-v1"
    },
    sourceProfiles: [{
      profileId: "profile-1",
      registrableDomain: "source.example",
      sourceRefs: [{ questionId: "q1", sourceId: "s1" }],
      coveredQuestionIds: ["q1"],
      contributions: [{
        questionId: "q1",
        sourceId: "s1",
        role: "first_party_capability",
        summary: "The source contributes an exact capability statement.",
        answerExcerpt: null,
        sourceExcerpt: null,
        basis: "provider_returned",
        confidence: "supported"
      }],
      targetGaps: [{
        factor: "problem_match",
        targetState: "missing",
        comparison: "The reviewed target comparison remains evidence-bound.",
        sourceEvidenceRefs: [{ questionId: "q1", sourceId: "s1", factor: "problem_match" }],
        targetEvidenceRefs: []
      }],
      observableFactors: [{
        factor: "problem_match",
        observation: "The source directly addresses the buyer problem.",
        evidenceUrl: "https://source.example/",
        evidenceExcerpt: null,
        basis: "provider_returned",
        confidence: "supported"
      }],
      auditStatus: "verified"
    }],
    sharedPatterns: [],
    targetActions: [{
      actionId: "action-first-party",
      priority: "high",
      actionFamily: "first_party_fact_page",
      title: "Publish a first-party fact page",
      rationale: "The verified gap supports this action.",
      relatedProfileIds: ["profile-1"],
      relatedGapFactors: ["problem_match"]
    }],
    limitations: []
  };
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
      answers: input.answerSubjects.map(({ questionId }) => ({
        questionId,
        relevance: "responsive",
        entityRole: "target",
        targetPresence: "present",
        targetFirstSentence: 1,
        targetRoles: ["service provider"],
        competitorEntityIds: [],
        evidenceIds: [`e${questionId.slice(1)}`],
        sourceIds: [`s${questionId.slice(1)}`],
        reason: `The answer directly addresses ${questionId}.`
      })),
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
    sourceSelectionDraft,
    sourceSelectionDraftHash: hashReportSemanticReviewValue(sourceSelectionDraft),
    overallDecision: "pass"
  };
}

function draftRoot(review: Record<string, unknown>): Record<string, unknown> {
  return review.sourceSelectionDraft as Record<string, unknown>;
}

function draftProfile(review: Record<string, unknown>): Record<string, unknown> {
  return (draftRoot(review).sourceProfiles as Array<Record<string, unknown>>)[0]!;
}

function draftContributions(review: Record<string, unknown>): Array<Record<string, unknown>> {
  return draftProfile(review).contributions as Array<Record<string, unknown>>;
}

function draftGaps(review: Record<string, unknown>): Array<Record<string, unknown>> {
  return draftProfile(review).targetGaps as Array<Record<string, unknown>>;
}

function draftActions(review: Record<string, unknown>): Array<Record<string, unknown>> {
  return draftRoot(review).targetActions as Array<Record<string, unknown>>;
}

function refreshDraftHash(review: Record<string, unknown>): void {
  review.sourceSelectionDraftHash = hashReportSemanticReviewValue(review.sourceSelectionDraft);
}

function source(questionId: string, sourceId: string, canonicalUrl: string) {
  const originalText = `${questionId} source text`;
  return {
    sourceId,
    questionId,
    canonicalUrl,
    originalText,
    originalTextHash: reportSemanticTextHash(originalText)
  };
}

function evidenceRow(questionId: string, sourceId: string, evidenceId: string) {
  const originalText = `${questionId} evidence text`;
  return {
    evidenceId,
    questionId,
    sourceId,
    originalText,
    originalTextHash: reportSemanticTextHash(originalText)
  };
}

function answerCard(questionId: string, sourceId: string, answerText: string, withDiagnosis: boolean) {
  const card = {
    answerMode: "generative_search_v1" as const,
    questionId,
    exactQuestion: questionId,
    status: "answered" as const,
    answerText,
    sources: [{
      sourceId,
      title: `${questionId} source`,
      canonicalUrl: `https://source.example/${questionId}`,
      registrableDomain: "source.example",
      citedText: null,
      providerResultOrder: 0,
      retrievalStatus: "verified_body" as const,
      ownershipCategory: "third_party_editorial" as const
    }],
    provenance: {
      providerId: "mock",
      model: "model",
      searchMode: "search",
      promptVersion: "generative-search-answer-v1" as const,
      searchedAt: "2026-07-23T00:00:00.000Z",
      completedAt: "2026-07-23T00:00:01.000Z",
      answerHash: "a".repeat(64),
      sourceHash: "b".repeat(64)
    },
    refusal: null,
    audit: { verifiedBodyCount: 1, searchSourceOnlyCount: 0, inaccessibleCount: 0 }
  };
  return withDiagnosis ? {
    ...card,
    geoDiagnosis: {
      targetMentioned: true,
      targetFirstSentence: 1,
      targetRoles: ["service provider"],
      competitorEntityIds: [],
      citedOwnership: {
        target_owned: 0,
        competitor_owned: 0,
        third_party_editorial: 1,
        directory: 0,
        government: 0,
        other: 0,
        institution: 0,
        community: 0,
        social: 0,
        unknown: 0
      },
      missingEvidenceFamilies: [],
      retestQuestion: questionId
    }
  } : card;
}

function sourceSelectionQuestion(questionId: string, sourceId: string, answerText: string) {
  return {
    questionId,
    answerText,
    sources: [{
      questionId,
      sourceId,
      title: `${questionId} source`,
      canonicalUrl: questionId === "q1" ? "https://source.example/" : `https://source.example/${questionId}`,
      registrableDomain: "source.example",
      citedText: null,
      auditExcerpt: null,
      retrievalStatus: "verified_body" as const,
      ownershipCategory: "third_party_editorial" as const,
      providerResultOrder: 0
    }]
  };
}

import { describe, expect, it, vi } from "vitest";
import {
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  generativeSearchAnswerHash,
  hashReportSemanticReviewValue,
  reportSemanticTextHash,
  type GenerativeSearchAnswerResult,
  type ReportSemanticAnswerAnnotation,
  type ReportSemanticReviewAuthorityBindings,
  type ReportSemanticReviewInput
} from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { createTestSourceForensicReport } from "@/public-source-forensics/testing";
import {
  prepareCombinedGeoReportV3SemanticDraft,
  type PrepareCombinedGeoReportV3Input
} from "@/report/combined-artifact-readiness";
import {
  buildPaidV3SemanticReviewDraft,
  runPaidV3SemanticReview,
  verifyPersistedPaidV3SemanticReview
} from "./paid-v3-semantic-review";

describe("Paid V3 semantic-review draft", () => {
  it("makes every Q1 field read-only and derives the ordered source-selection catalog", () => {
    const draft = buildPaidV3SemanticReviewDraft({
      reportDraft: { answerCards: [{ questionId: "q1", exactQuestion: "Q1", answerText: "Free Q1" }, { questionId: "q2", exactQuestion: "Q2", answerText: "Paid Q2" }, { questionId: "q3", exactQuestion: "Q3", answerText: "Paid Q3" }] },
      locale: "en",
      target: { siteKey: "site", targetUrl: "https://target.example/", aliases: ["Target"] },
      expectedModel: { providerId: "fixture", modelId: "review-model" },
      questions: [
        { questionId: "q1", text: "Q1" },
        { questionId: "q2", text: "Q2" },
        { questionId: "q3", text: "Q3" }
      ] as never,
      sources: [],
      evidence: [],
      observationResults: [],
      answerSubjects: [
        { questionId: "q1", fieldPath: "answerCards[0].answerText" },
        { questionId: "q2", fieldPath: "answerCards[1].answerText" },
        { questionId: "q3", fieldPath: "answerCards[2].answerText" }
      ],
      fields: [
        { path: "answerCards[0].answerText", text: "Free Q1", mutability: "mutable", questionId: "q1", allowedEvidenceIds: [], allowedSourceIds: [] },
        { path: "answerCards[1].answerText", text: "Paid Q2", mutability: "mutable", questionId: "q2", allowedEvidenceIds: [], allowedSourceIds: [] }
      ],
      sourceSelectionCatalogSeeds: [{ kind: "action", questionId: null, sourceId: null, profileId: null, actionId: "action-1", allowedEvidenceIds: [] }],
      nonProseProjectionHash: "a".repeat(64)
    });

    expect(draft.fields[0]).toMatchObject({ questionId: "q1", mutability: "read_only" });
    expect(draft.fields.find((field) => field.questionId === "q2")).toMatchObject({ mutability: "mutable" });
    expect(draft.sourceSelectionCatalog).toEqual([expect.objectContaining({ kind: "action", itemId: "action:action-1" })]);
  });

  it("fails closed when Q1 coverage or the source-selection catalog is absent", () => {
    const input = {
      reportDraft: { answerCards: [{ questionId: "q1", exactQuestion: "Q1", answerText: "Free Q1" }, { questionId: "q2", exactQuestion: "Q2", answerText: "Paid Q2" }, { questionId: "q3", exactQuestion: "Q3", answerText: "Paid Q3" }] },
      locale: "en", target: { siteKey: "site", targetUrl: "https://target.example/", aliases: [] }, expectedModel: { providerId: "fixture", modelId: "model" },
      questions: [{ questionId: "q1", text: "Q1" }, { questionId: "q2", text: "Q2" }, { questionId: "q3", text: "Q3" }],
      sources: [], evidence: [], observationResults: [],
      answerSubjects: [{ questionId: "q1", fieldPath: "a" }, { questionId: "q2", fieldPath: "b" }, { questionId: "q3", fieldPath: "c" }],
      fields: [{ path: "answerCards[1].answerText", text: "Paid Q2", mutability: "mutable" as const, questionId: "q2", allowedEvidenceIds: [], allowedSourceIds: [] }],
      sourceSelectionCatalogSeeds: [], nonProseProjectionHash: "a".repeat(64)
    };
    expect(() => buildPaidV3SemanticReviewDraft(input as never)).toThrow(/source-selection catalog/u);
  });

  it("runs one complete review, preserves Free Q1, and re-verifies persisted authority without a model", async () => {
    const fixture = await paidSemanticFixture();
    const reviewer = {
      review: vi.fn(async ({ inputText }: { inputText: string }) => {
        const { input } = JSON.parse(inputText) as { input: ReportSemanticReviewInput };
        return validPaidReview(input);
      })
    };

    const reviewed = await runPaidV3SemanticReview({ ...fixture, reviewer });
    expect(reviewer.review).toHaveBeenCalledOnce();
    expect(reviewed.report.answerCards[0]).toEqual(fixture.reviewedFreeQ1);
    expect(reviewed.report.semanticReviewReceipt?.finalReviewedReportProjectionHash).toMatch(/^[a-f0-9]{64}$/u);

    const resumeReviewer = vi.fn();
    await verifyPersistedPaidV3SemanticReview({
      report: reviewed.report,
      rawInput: reviewed.input,
      rawReview: reviewed.output,
      appliedFields: reviewed.applied.fields,
      answerResults: fixture.answerResults,
      reviewedFreeQ1: fixture.reviewedFreeQ1,
      reviewedFreeQ1Annotation: fixture.reviewedFreeQ1Annotation,
      expectedAuthorityBindings: fixture.manifest.authorityBindings
    });
    expect(resumeReviewer).not.toHaveBeenCalled();

    const tamperedCases = [
      {
        name: "input",
        value: {
          report: reviewed.report,
          rawInput: { ...reviewed.input, inputHash: "0".repeat(64) },
          rawReview: reviewed.output,
          appliedFields: reviewed.applied.fields
        }
      },
      {
        name: "output",
        value: {
          report: reviewed.report,
          rawInput: reviewed.input,
          rawReview: { ...reviewed.output, modelId: "forged-model" },
          appliedFields: reviewed.applied.fields
        }
      },
      {
        name: "applied",
        value: {
          report: reviewed.report,
          rawInput: reviewed.input,
          rawReview: reviewed.output,
          appliedFields: reviewed.applied.fields.map((field, index) =>
            index === 0 ? { ...field, appliedText: `${field.appliedText} tampered` } : field)
        }
      },
      {
        name: "final report",
        value: {
          report: {
            ...reviewed.report,
            methodology: {
              ...reviewed.report.methodology,
              technicalCoverage: `${reviewed.report.methodology.technicalCoverage} tampered`
            }
          },
          rawInput: reviewed.input,
          rawReview: reviewed.output,
          appliedFields: reviewed.applied.fields
        }
      }
    ];
    for (const tampered of tamperedCases) {
      await expect(verifyPersistedPaidV3SemanticReview({
        ...tampered.value,
        answerResults: fixture.answerResults,
        reviewedFreeQ1: fixture.reviewedFreeQ1,
        reviewedFreeQ1Annotation: fixture.reviewedFreeQ1Annotation,
        expectedAuthorityBindings: fixture.manifest.authorityBindings
      } as never), tampered.name).rejects.toThrow();
    }

    const q1AnnotationIndex = reviewed.output.annotations.answers.findIndex(
      (annotation) => annotation.questionId === fixture.reviewedFreeQ1.questionId
    );
    const contradictoryAnswers = reviewed.output.annotations.answers.map((annotation, index) =>
      index === q1AnnotationIndex ? { ...annotation, targetRoles: ["contradictory role"] } : annotation
    );
    await expect(verifyPersistedPaidV3SemanticReview({
      report: reviewed.report,
      rawInput: reviewed.input,
      rawReview: {
        ...reviewed.output,
        annotations: { ...reviewed.output.annotations, answers: contradictoryAnswers }
      },
      appliedFields: reviewed.applied.fields,
      answerResults: fixture.answerResults,
      reviewedFreeQ1: fixture.reviewedFreeQ1,
      reviewedFreeQ1Annotation: fixture.reviewedFreeQ1Annotation,
      expectedAuthorityBindings: fixture.manifest.authorityBindings
    })).rejects.toThrow(/contradicts accepted Free annotation/u);

    const contradictoryReviewer = {
      review: vi.fn(async ({ inputText }: { inputText: string }) => {
        const { input } = JSON.parse(inputText) as { input: ReportSemanticReviewInput };
        const valid = validPaidReview(input);
        const annotations = valid.annotations as {
          answers: Array<Record<string, unknown>>;
        };
        return {
          ...valid,
          annotations: {
            ...annotations,
            answers: annotations.answers.map((annotation) =>
              annotation.questionId === fixture.reviewedFreeQ1.questionId
                ? { ...annotation, targetRoles: ["contradictory role"] }
                : annotation)
          }
        };
      })
    };
    await expect(runPaidV3SemanticReview({
      ...fixture,
      reviewer: contradictoryReviewer
    })).rejects.toThrow(/contradicts accepted Free annotation/u);
    expect(contradictoryReviewer.review).toHaveBeenCalledOnce();

    for (const key of Object.keys(fixture.manifest.authorityBindings) as Array<
      keyof ReportSemanticReviewAuthorityBindings
    >) {
      const expectedAuthorityBindings = {
        ...fixture.manifest.authorityBindings,
        [key]: key === "rootMarker" ? "forged-marker" : "0".repeat(64)
      } as ReportSemanticReviewAuthorityBindings;
      await expect(verifyPersistedPaidV3SemanticReview({
        report: reviewed.report,
        rawInput: reviewed.input,
        rawReview: reviewed.output,
        appliedFields: reviewed.applied.fields,
        answerResults: fixture.answerResults,
        reviewedFreeQ1: fixture.reviewedFreeQ1,
        reviewedFreeQ1Annotation: fixture.reviewedFreeQ1Annotation,
        expectedAuthorityBindings
      }), key).rejects.toThrow(/authority bindings/u);
    }
  });
});

async function paidSemanticFixture() {
  const prepared = v3PreparationInput();
  const initialAnswerResults = prepared.answerCards.map((card, index) => ({
    questionId: card.questionId,
    answerText: card.answerText,
    sources: card.sources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      canonicalUrl: source.canonicalUrl,
      registrableDomain: source.registrableDomain,
      citedText: source.citedText,
      providerResultOrder: source.providerResultOrder
    })),
    refusal: null,
    searchedAt: card.provenance.searchedAt,
    completedAt: card.provenance.completedAt,
    providerResponseId: `response-${index + 1}`
  })) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  const perAnswerHashes = await Promise.all(initialAnswerResults.map((answer) =>
    generativeSearchAnswerHash(answer, {
      locale: prepared.businessQuestionSet.locale,
      semanticValidation: "deferred"
    })));
  prepared.answerCards.forEach((card, index) => {
    card.provenance.answerHash = perAnswerHashes[index]!;
  });
  const { sourceSelectionDiagnosis: _legacyDiagnosis, ...carrier } = prepared;
  void _legacyDiagnosis;
  const answerCards = prepared.answerCards.map((card, index) => {
    if (index === 0) return card;
    const { geoDiagnosis: _geoDiagnosis, ...draft } = card;
    void _geoDiagnosis;
    return draft;
  }) as never;
  const report = prepareCombinedGeoReportV3SemanticDraft({ ...carrier, answerCards });
  const generativeCards = report.answerCards as typeof prepared.answerCards;
  const questions = generativeCards.map((card) => ({
    questionId: card.questionId,
    originalText: card.exactQuestion,
    originalTextHash: reportSemanticTextHash(card.exactQuestion)
  }));
  const sources = generativeCards.map((card) => {
    const source = card.sources[0]!;
    const originalText = JSON.stringify(source);
    return {
      sourceId: source.sourceId,
      questionId: card.questionId,
      canonicalUrl: source.canonicalUrl,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText),
      eligible: true
    };
  });
  const evidence = sources.map((source) => ({
    evidenceId: source.sourceId,
    questionId: source.questionId,
    sourceId: source.sourceId,
    originalText: source.originalText,
    originalTextHash: source.originalTextHash,
    eligible: true
  }));
  const observationResults = sources.map((source, index) => ({
    observationId: `observation-${index + 1}`,
    resultId: `result-${index + 1}`,
    questionId: source.questionId,
    originalText: source.originalText,
    originalTextHash: source.originalTextHash
  }));
  const profileId = "profile-source-example";
  const sourceIds = sources.map(({ sourceId }) => sourceId);
  const sourceSelectionCatalogSeeds = [
    ...sources.map((source) => ({
      kind: "contribution" as const,
      questionId: source.questionId,
      sourceId: source.sourceId,
      profileId,
      allowedEvidenceIds: [source.sourceId]
    })),
    {
      kind: "target_state" as const,
      slotId: "target-gap",
      questionId: null,
      sourceId: null,
      profileId,
      allowedEvidenceIds: sourceIds
    },
    ...["problem-match", "factual-specificity", "entity-clarity"].map((slotId) => ({
      kind: "factor" as const,
      slotId,
      questionId: null,
      sourceId: null,
      profileId,
      allowedEvidenceIds: sourceIds
    })),
    ...["action-1", "action-2", "action-3"].map((actionId) => ({
      kind: "action" as const,
      questionId: null,
      sourceId: null,
      profileId,
      actionId,
      allowedEvidenceIds: sourceIds
    }))
  ];
  const answerResults = generativeCards.map((card, index) => ({
    questionId: card.questionId,
    answerText: card.answerText,
    sources: card.sources.map((source) => ({
      sourceId: source.sourceId,
      title: source.title,
      canonicalUrl: source.canonicalUrl,
      registrableDomain: source.registrableDomain,
      citedText: source.citedText,
      providerResultOrder: source.providerResultOrder
    })),
    refusal: null,
    searchedAt: card.provenance.searchedAt,
    completedAt: card.provenance.completedAt,
    providerResponseId: `response-${index + 1}`
  })) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  const authorityBindings = paidAuthorityBindings();
  const reviewedFreeQ1Annotation: ReportSemanticAnswerAnnotation = {
    questionId: generativeCards[0].questionId,
    relevance: "responsive",
    entityRole: "target",
    targetPresence: "present",
    targetFirstSentence: 1,
    targetRoles: ["service provider"],
    competitorEntityIds: [],
    evidenceIds: [generativeCards[0].sources[0]!.sourceId],
    sourceIds: [generativeCards[0].sources[0]!.sourceId],
    reason: "The accepted Free review found a responsive target answer."
  };
  return {
    report,
    manifest: {
      locale: prepared.businessQuestionSet.locale,
      target: { siteKey: "customer-logistics.example", targetUrl: prepared.targetUrl, aliases: ["Customer Logistics"] },
      expectedModel: { providerId: "fixture", modelId: "review-model" },
      questions,
      sources,
      evidence,
      observationResults,
      entities: [],
      authorityBindings,
      answerSubjects: generativeCards.map((card, index) => ({
        questionId: card.questionId,
        fieldPath: `answerCards[${index}].answerText`
      })),
      sourceSelectionCatalogSeeds,
      manifestCoverageOptions: {
        fieldOverrides: generativeCards.flatMap((card, index) => [
          {
            path: `answerCards[${index}].exactQuestion`,
            mutability: "read_only" as const,
            questionId: card.questionId
          },
          {
            path: `answerCards[${index}].answerText`,
            questionId: card.questionId,
            allowedEvidenceIds: [card.sources[0]!.sourceId],
            allowedSourceIds: [card.sources[0]!.sourceId]
          }
        ])
      }
    },
    sourceSelectionContext: {
      questions: generativeCards.map((card) => ({
        questionId: card.questionId,
        answerText: card.answerText,
        sources: card.sources.map((source) => ({
          ...source,
          questionId: card.questionId,
          auditExcerpt: null
        }))
      })),
      missingEvidenceFamiliesByQuestion: [
        generativeCards[0].geoDiagnosis.missingEvidenceFamilies,
        ["regional_fit"],
        ["delivery_risk"]
      ] as const,
      finalSourceSelectionInputIdentity: {
        sourceHash: "4".repeat(64),
        targetFoundationHash: "e".repeat(64),
        locale: "en" as const,
        contributionAnalyzerVersion: "deterministic-contribution-v1" as const,
        factorAnalyzerVersion: "observable-factor-v1" as const,
        targetComparatorVersion: "target-page-signal-v1" as const
      }
    },
    answerResults,
    reviewedFreeQ1: generativeCards[0],
    reviewedFreeQ1Annotation
  };
}

function paidAuthorityBindings(): ReportSemanticReviewAuthorityBindings {
  return {
    rootMarker: REPORT_SEMANTIC_REVIEW_CONTRACT,
    artifactIdentityHash: "1".repeat(64),
    reviewedFreeAuthorityHash: "2".repeat(64),
    answerCheckpointHash: "3".repeat(64),
    commercialSnapshotsHash: "4".repeat(64),
    publicSourceHash: "5".repeat(64),
    providerDiscoveryHash: "6".repeat(64),
    technicalFoundationHash: "7".repeat(64),
    aiFoundationHash: "8".repeat(64),
    evidenceAssetsHash: "9".repeat(64)
  };
}

function validPaidReview(input: ReportSemanticReviewInput): Record<string, unknown> {
  const contributionItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "contribution");
  const targetStateItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "target_state");
  const factorItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "factor");
  const actionItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "action");
  const factorKinds = ["problem_match", "factual_specificity", "entity_clarity"] as const;
  const actionFamilies = ["first_party_fact_page", "entity_relationship", "third_party_validation"] as const;
  const priorities = ["high", "medium", "low"] as const;
  const sourceSelectionDraft = {
    version: "source_selection_diagnosis_v1",
    status: "complete",
    inputIdentity: {
      answerHash: "a".repeat(64),
      sourceHash: "b".repeat(64),
      targetFoundationHash: "c".repeat(64),
      locale: "en",
      contributionAnalyzerVersion: "deterministic-contribution-v1",
      factorAnalyzerVersion: "observable-factor-v1",
      targetComparatorVersion: "target-page-signal-v1"
    },
    sourceProfiles: [{
      profileId: "profile-source-example",
      registrableDomain: "source.example",
      sourceRefs: contributionItems.map(({ questionId, sourceId }) => ({ questionId, sourceId })),
      coveredQuestionIds: contributionItems.map(({ questionId }) => questionId),
      contributions: contributionItems.map(({ questionId, sourceId }) => ({
        questionId,
        sourceId,
        role: "first_party_capability",
        summary: "The source contributes a directly observed service fact.",
        answerExcerpt: null,
        sourceExcerpt: null,
        basis: "provider_returned",
        confidence: "supported"
      })),
      targetGaps: targetStateItems.map(() => ({
        factor: "problem_match",
        targetState: "missing",
        comparison: "The target needs a clearer evidence-backed comparison.",
        sourceEvidenceRefs: contributionItems.map(({ questionId, sourceId }) => ({
          questionId,
          sourceId,
          factor: "problem_match"
        })),
        targetEvidenceRefs: []
      })),
      observableFactors: factorItems.map((_, index) => ({
        factor: factorKinds[index]!,
        observation: `Observed factor ${index + 1}.`,
        evidenceUrl: `https://source.example/q${index + 1}`,
        evidenceExcerpt: null,
        basis: "provider_returned",
        confidence: "supported"
      })),
      auditStatus: "verified"
    }],
    sharedPatterns: [],
    targetActions: actionItems.map(({ actionId }, index) => ({
      actionId,
      priority: priorities[index]!,
      actionFamily: actionFamilies[index]!,
      title: `Evidence action ${index + 1}`,
      rationale: `The reviewed evidence supports action ${index + 1}.`,
      relatedProfileIds: ["profile-source-example"],
      relatedGapFactors: ["problem_match"]
    })),
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
      reason: "The text is natural and supported by the exact evidence.",
      evidenceIds: input.evidencePolicy ? [input.evidence[0]!.evidenceId] : field.allowedEvidenceIds,
      sourceIds: input.evidencePolicy ? [input.sources[0]!.sourceId] : field.allowedSourceIds,
      rejectedEvidence: [], rejectedSources: [],
      retainedOriginalTerms: []
    })),
    questionDistinctness: {
      decision: "distinct",
      duplicateGroups: [],
      reason: "The three buyer questions address different decisions."
    },
    annotations: {
      observationResults: input.observationResults.map(({ observationId, resultId }) => ({
        observationId,
        resultId,
        targetPresence: "present",
        competitorPresence: "absent",
        reason: "The observation refers to the target."
      })),
      answers: input.answerSubjects.map(({ questionId }, index) => ({
        questionId,
        relevance: "responsive",
        entityRole: "target",
        targetPresence: "present",
        targetFirstSentence: 1,
        targetRoles: ["service provider"],
        competitorEntityIds: [],
        evidenceIds: [`s${index + 1}`],
        sourceIds: [`s${index + 1}`],
        reason: "The answer responds directly using its owned source."
      })),
      evidenceUse: input.fields.map((field) => ({
        path: field.path,
        evidenceIds: input.evidencePolicy ? [input.evidence[0]!.evidenceId] : field.allowedEvidenceIds,
        sourceIds: input.evidencePolicy ? [input.sources[0]!.sourceId] : field.allowedSourceIds,
        reason: "The exact references belong to this field."
      })),
      sourceSelection: input.sourceSelectionCatalog!.map((item) => {
        const factorIndex = factorItems.findIndex(({ itemId }) => itemId === item.itemId);
        const actionIndex = actionItems.findIndex(({ itemId }) => itemId === item.itemId);
        return {
          annotationId: item.annotationId,
          itemId: item.itemId,
          kind: item.kind,
          questionId: item.questionId,
          sourceId: item.sourceId,
          profileId: item.profileId,
          actionId: item.actionId,
          contributionRole: item.kind === "contribution" ? "first_party_capability" : null,
          targetState: item.kind === "target_state" ? "missing" : null,
          factorClassification: item.kind === "factor" ? factorKinds[factorIndex]! : null,
          actionFamily: item.kind === "action" ? actionFamilies[actionIndex]! : null,
          priority: item.kind === "action" ? priorities[actionIndex]! : null,
          evidenceIds: item.allowedEvidenceIds,
          reason: "The catalog-bound evidence supports this semantic value."
        };
      })
    },
    sourceSelectionDraft,
    sourceSelectionDraftHash: hashReportSemanticReviewValue(sourceSelectionDraft),
    overallDecision: "pass"
  };
}

function v3PreparationInput(): PrepareCombinedGeoReportV3Input {
  const forensic = createTestSourceForensicReport({ reportId: "report-v3", jobId: "job-v3" });
  const questionSet = {
    version: "business-questions-v1",
    id: "questions-v3",
    revision: 1,
    locale: forensic.locale,
    region: forensic.region,
    confidence: "high",
    requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile-v3",
    identityExclusions: [],
    acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z",
    contentHash: "questions-v3-hash",
    questions: forensic.questions.questions.map((question, index) => ({
      purpose: (["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const)[index]!,
      generatedText: question.normalizedText,
      privateText: question.normalizedText,
      neutralPublicText: question.normalizedText,
      evidenceUrls: [],
      service: question.normalizedText,
      audience: "buyer",
      marketRegion: forensic.region,
      edited: false,
      neutralizationVersion: "identity-neutral-v1",
      neutralContentHash: `neutral-${question.id}`
    }))
  } as unknown as ConfirmedBusinessQuestionSet;
  const canonical = toCanonicalBuyerQuestionSet(questionSet).questions;
  const questionIdMap = new Map(
    forensic.questions.questions.map((question, index) => [question.id, canonical[index]!.id])
  );
  const alignedForensic = rewriteExactStrings(structuredClone(forensic), questionIdMap);
  const answerCards = canonical.map((question, index) => ({
    answerMode: "generative_search_v1" as const,
    questionId: question.id,
    exactQuestion: questionSet.questions[index]!.privateText,
    status: "answered" as const,
    answerText: `The public evidence answers buyer question ${index + 1}.`,
    sources: [{
      sourceId: `s${index + 1}`,
      title: `Independent source ${index + 1}`,
      canonicalUrl: `https://source.example/q${index + 1}`,
      registrableDomain: "source.example",
      citedText: `Verified source fact ${index + 1}.`,
      providerResultOrder: index + 1,
      retrievalStatus: "verified_body" as const,
      ownershipCategory: "third_party_editorial" as const
    }],
    provenance: {
      providerId: "fixture",
      model: "fixture-model",
      searchMode: "native_web_search",
      promptVersion: "generative-search-answer-v1" as const,
      searchedAt: "2030-01-01T00:00:00.000Z",
      completedAt: "2030-01-01T00:00:01.000Z",
      answerHash: "a".repeat(64),
      sourceHash: "b".repeat(64)
    },
    refusal: null,
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
      retestQuestion: questionSet.questions[index]!.privateText
    },
    audit: { verifiedBodyCount: 1, searchSourceOnlyCount: 0, inaccessibleCount: 0 }
  })) as PrepareCombinedGeoReportV3Input["answerCards"];
  const evidenceAssets = [{
    id: "asset-v3",
    reportId: "report-v3",
    jobId: "job-v3",
    findingId: "finding-1",
    citationIndex: 0,
    kind: "context",
    status: "ready",
    sourceUrl: alignedForensic.targetUrl,
    quote: "The target website publishes a public service description.",
    pageElement: null,
    capturedAt: new Date("2030-01-01T00:00:00.000Z"),
    viewportWidth: 1280,
    viewportHeight: 720,
    contentHash: "f".repeat(64),
    evidenceHash: "1".repeat(64),
    assetHash: "2".repeat(64),
    storageProvider: "fixture",
    storageKey: "reports/report-v3/asset-v3.png",
    mimeType: "image/png",
    byteSize: 5,
    failureCode: null,
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-01T00:00:00.000Z")
  }] as PrepareCombinedGeoReportV3Input["evidenceAssets"];
  return {
    artifactRevisionId: "artifact-v3",
    artifactRevision: 3,
    reportId: "report-v3",
    orderId: "order-v3",
    jobId: "job-v3",
    originalPaidJobId: "job-v3",
    targetUrl: alignedForensic.targetUrl,
    technicalReport: {
      url: alignedForensic.targetUrl,
      scannedAt: "2030-01-01T00:00:00.000Z",
      score: 80,
      pages: [{
        url: alignedForensic.targetUrl,
        status: 200,
        title: "Customer Logistics",
        metaDescription: "Cross-border logistics services",
        h1: ["Customer Logistics"],
        h2: [],
        canonical: alignedForensic.targetUrl,
        hasOpenGraph: true,
        hasJsonLd: true,
        readableTextLength: 500,
        internalLinks: 2
      }],
      findings: [],
      recommendations: [],
      machineReadableAssets: {
        robotsTxt: { url: `${alignedForensic.targetUrl}robots.txt`, present: true, summary: "robots.txt is available." },
        sitemapXml: { url: `${alignedForensic.targetUrl}sitemap.xml`, present: true, summary: "sitemap.xml is available." },
        llmsTxt: { url: `${alignedForensic.targetUrl}llms.txt`, present: false, summary: "llms.txt was not found." }
      }
    },
    aiReport: alignedForensic.websiteFoundationAppendix,
    evidenceAssets,
    businessQuestionSet: questionSet,
    answerCards,
    sourceSelectionDiagnosis: {} as never,
    engineProvenance: {
      engineId: "open_geo_public_search_answer_v1",
      searchSurface: "fixture/v1",
      queryPlanVersion: "v1",
      passageSelectorVersion: "v1",
      synthesisModel: "fixture-model",
      synthesisPromptVersion: "v1",
      locale: alignedForensic.locale,
      region: alignedForensic.region,
      searchedAt: "2030-01-01T00:00:00.000Z",
      evidenceCutoffAt: "2030-01-02T00:00:00.000Z",
      synthesizedAt: "2030-01-02T00:00:00.000Z",
      inputHash: "3".repeat(64),
      evidenceHash: "4".repeat(64),
      answerHash: "5".repeat(64)
    },
    publicSourceForensics: alignedForensic,
    providerDiscovery: {
      version: "provider-discovery-v1",
      policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" },
      identity: {
        candidateSetHash: "6".repeat(64),
        queryPlanVersion: "v1",
        passageSelectorVersion: "v1",
        claimExtractionContract: "provider-claim-extraction-v1",
        claimExtractionModel: "fixture-model",
        claimSetHash: "7".repeat(64)
      },
      execution: {
        plannedQueries: 1,
        completedQueries: 1,
        returnedObservations: 1,
        safelyRetrievedPages: 1,
        relevantPassages: 1,
        discoveredProviders: 1,
        strictProviders: 0,
        candidateProviders: 1,
        rejectedProviders: 0,
        coverage: "partial"
      },
      strict: [],
      candidates: [{
        entityId: "provider-1",
        canonicalName: "Logistics Provider",
        genericRole: "service_provider",
        policyRole: "carrier",
        leadEvidenceIds: ["provider-evidence-1"],
        missingProof: ["Direct asset evidence is unavailable."]
      }],
      evidence: [{
        evidenceId: "provider-evidence-1",
        sourceEvidenceId: "source-provider-1",
        registrableDomain: "provider.example",
        title: "Logistics Provider",
        sourceAuthority: "company_owned",
        observedAt: "2030-01-01T00:00:00.000Z",
        exactExcerpt: "The provider publishes freight services.",
        capability: "linehaul_fleet"
      }],
      limitation: "Limited public evidence does not prove that a provider lacks capability."
    }
  };
}

function rewriteExactStrings<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  if (typeof value === "string") return (replacements.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => rewriteExactStrings(item, replacements)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteExactStrings(item, replacements)])
    ) as T;
  }
  return value;
}

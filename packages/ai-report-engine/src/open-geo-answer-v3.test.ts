import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { toCanonicalBuyerQuestionSet } from "@open-geo-console/public-search-observer";
import { describe, expect, it, vi } from "vitest";
import {
  OPEN_GEO_ANSWER_V3_VERSION,
  diagnoseOpenGeoAnswerCardV3,
  parseOpenGeoAnswerCardsV3,
  synthesizeOpenGeoAnswerCardsV3,
  type OpenGeoAnswerCardV3,
  type OpenGeoAnswerEvidenceV3
} from "./open-geo-answer-v3";
import { ReportLanguageValidationError } from "./report-language";

describe("Open GEO answer V3 contract", () => {
  it("accepts exactly three canonical cards in fixed order", () => {
    const context = fixtureContext();
    expect(parseOpenGeoAnswerCardsV3(cards(context), context)).toHaveLength(3);
    expect(OPEN_GEO_ANSWER_V3_VERSION).toBe("open-geo-answer-v3");
  });

  it("rejects untranslated coverage reasons in Chinese answer cards", () => {
    const context = fixtureContext();
    const value = cards(context);
    value[0] = {
      ...value[0]!,
      status: "insufficient",
      sentences: [],
      sourceEvidence: [],
      coverage: { ...value[0]!.coverage, reasons: ["Missing public evidence does not prove that a provider lacks a capability."] }
    };

    expect(() => parseOpenGeoAnswerCardsV3(value, context)).toThrow(ReportLanguageValidationError);
  });

  it("rejects missing, duplicate, and foreign question identities", () => {
    const context = fixtureContext();
    const value = cards(context);
    expect(() => parseOpenGeoAnswerCardsV3(value.slice(0, 2), context)).toThrow(/exactly three/i);
    expect(() => parseOpenGeoAnswerCardsV3([value[0], value[0], value[2]], context)).toThrow(/question/i);
    expect(() => parseOpenGeoAnswerCardsV3([{ ...value[0], questionId: "foreign" }, value[1], value[2]], context)).toThrow(/question/i);
  });

  it("rejects answered cards without grounded claims", () => {
    const context = fixtureContext();
    const value = cards(context);
    value[0] = { ...value[0], sentences: [] };
    expect(() => parseOpenGeoAnswerCardsV3(value, context)).toThrow(/grounded/i);
  });

  it("requires two independent registrable domains for verified claims", () => {
    const context = fixtureContext();
    const value = cards(context);
    value[0] = { ...value[0], sourceEvidence: value[0].sourceEvidence.slice(0, 1) };
    value[0].sentences[0]!.evidenceIds = ["evidence-q1-a"];
    expect(() => parseOpenGeoAnswerCardsV3(value, context)).toThrow(/two independent/i);
  });

  it("deterministically downgrades a model verified claim backed by one domain", async () => {
    const context = {
      ...fixtureContext(),
      locale: "en",
      missingEvidenceFamiliesByQuestion: [[], [], []] as [string[], string[], string[]]
    };
    const ids = canonicalIds(context.questionSet);
    const evidence = ids.flatMap((questionId, index) => evidenceFor(questionId, index));
    const client = {
      configuredModel: "fixture-model",
      completeJson: vi.fn(async () => ({
        modelId: "fixture-model",
        rawContent: "fixture-answer-cards",
        value: {
          answers: ids.map((questionId, index) => ({
            questionId,
            sentences: [{
              sentenceId: `sentence-q${index + 1}`,
              text: "The reviewed public sources directly support this bounded factual conclusion.",
              evidenceIds: index === 0
                ? [`evidence-q${index + 1}-a`]
                : [`evidence-q${index + 1}-a`, `evidence-q${index + 1}-b`],
              confidence: "verified"
            }]
          }))
        }
      }))
    };
    const completeCoverage = {
      plannedQueries: 2,
      completedQueries: 2,
      returnedResults: 2,
      attemptedRetrievals: 2,
      safelyRetrievedPages: 2,
      eligibleDirectEvidence: 2,
      reasons: []
    };

    const result = await synthesizeOpenGeoAnswerCardsV3(client, {
      ...context,
      evidence,
      coverageByQuestion: [completeCoverage, completeCoverage, completeCoverage]
    });

    expect(result[0]).toMatchObject({
      status: "limited",
      sentences: [
        expect.objectContaining({ kind: "grounded_claim", confidence: "limited" }),
        expect.objectContaining({
          kind: "scope_note",
          text: "This conclusion has only one source or incomplete retrieval coverage and is not independently verified."
        })
      ]
    });
    expect(client.completeJson).toHaveBeenCalledOnce();
  });

  it("emits a nonblank deterministic unresolved conclusion after retrieval is exhausted", async () => {
    const context = {
      ...fixtureContext(),
      locale: "en",
      missingEvidenceFamiliesByQuestion: [[], [], []] as [string[], string[], string[]]
    };
    const ids = canonicalIds(context.questionSet);
    const client = {
      configuredModel: "fixture-model",
      completeJson: vi.fn(async () => ({
        modelId: "fixture-model",
        rawContent: "fixture-unresolved-cards",
        value: { answers: ids.map((questionId) => ({ questionId, sentences: [] })) }
      }))
    };
    const exhaustedCoverage = {
      plannedQueries: 6,
      completedQueries: 6,
      returnedResults: 8,
      attemptedRetrievals: 6,
      safelyRetrievedPages: 0,
      eligibleDirectEvidence: 0,
      reasons: ["No safely retrieved page supplied direct evidence."]
    };

    const result = await synthesizeOpenGeoAnswerCardsV3(client, {
      ...context,
      evidence: [],
      coverageByQuestion: [exhaustedCoverage, exhaustedCoverage, exhaustedCoverage]
    });

    expect(result).toHaveLength(3);
    for (const card of result) {
      expect(card).toMatchObject({
        status: "unresolved",
        sourceEvidence: [],
        sentences: [{
          kind: "scope_note",
          evidenceIds: [],
          text: "The public search returned 8 results and attempted 6 pages; there is still insufficient verifiable page text for a reliable factual conclusion."
        }]
      });
    }
  });

  it("rejects cross-question and cross-subject evidence", () => {
    const context = fixtureContext();
    const crossQuestion = cards(context);
    crossQuestion[0].sourceEvidence[0]!.questionId = canonicalIds(context.questionSet)[1]!;
    expect(() => parseOpenGeoAnswerCardsV3(crossQuestion, context)).toThrow(/same question/i);

    const crossSubject = cards(context);
    crossSubject[0].sourceEvidence[1]!.subjectKey = "different-subject";
    expect(() => parseOpenGeoAnswerCardsV3(crossSubject, context)).toThrow(/same subject/i);
  });

  it("allows no model-authored factual answer for insufficient evidence", () => {
    const context = fixtureContext();
    const value = cards(context);
    value[2] = {
      ...value[2],
      status: "insufficient",
      sentences: [{ sentenceId: "made-up", kind: "grounded_claim", text: "公开资料证明该服务没有风险。", evidenceIds: [], confidence: "limited" }],
      sourceEvidence: []
    };
    expect(() => parseOpenGeoAnswerCardsV3(value, context)).toThrow(/insufficient/i);
  });

  it("rejects unapproved English in generated Chinese prose", () => {
    const context = fixtureContext();
    const value = cards(context);
    value[0].sentences[0]!.text = "The provider offers reliable shipping services.";
    expect(() => parseOpenGeoAnswerCardsV3(value, context)).toThrow(ReportLanguageValidationError);
  });

  it("computes diagnosis from persisted sentences and cited evidence", () => {
    const context = fixtureContext();
    const card = cards(context)[0];
    const diagnosis = diagnoseOpenGeoAnswerCardV3(card, {
      exactQuestion: card.exactQuestion,
      targetAliases: ["甲物流"],
      competitors: [{ entityId: "competitor-beta", aliases: ["乙物流"] }],
      missingEvidenceFamilies: ["独立行业评价"]
    });
    expect(diagnosis.targetMentioned).toBe(true);
    expect(diagnosis.targetFirstSentence).toBe(1);
    expect(diagnosis.competitorEntityIds).toEqual(["competitor-beta"]);
    expect(diagnosis.citedOwnership.third_party_editorial).toBe(1);
    expect(diagnosis.retestQuestion).toBe(card.exactQuestion);
  });
});

function fixtureContext() {
  return {
    questionSet: questionSet(),
    locale: "zh-CN",
    targetAliases: ["甲物流"],
    competitors: [{ entityId: "competitor-beta", aliases: ["乙物流"] }],
    missingEvidenceFamiliesByQuestion: [[], [], ["直接风险证据"]] as [string[], string[], string[]]
  };
}

function cards(context: ReturnType<typeof fixtureContext>): [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3] {
  const ids = canonicalIds(context.questionSet);
  return context.questionSet.questions.map((question, index) => {
    const evidence = evidenceFor(ids[index]!, index);
    return {
      questionId: ids[index]!,
      exactQuestion: question.privateText,
      status: "answered",
      sentences: [{
        sentenceId: `sentence-q${index + 1}-1`,
        kind: "grounded_claim",
        text: index === 0 ? "公开资料显示，甲物流与乙物流均提供相关运输服务。" : `公开资料显示，该问题已有两项直接证据支持结论${index + 1}。`,
        evidenceIds: evidence.map(({ evidenceId }) => evidenceId),
        confidence: "verified"
      }],
      sourceEvidence: evidence,
      coverage: { plannedQueries: 6, completedQueries: 6, returnedResults: 8, attemptedRetrievals: 6, safelyRetrievedPages: 4, eligibleDirectEvidence: 2, reasons: [] },
      geoDiagnosis: emptyDiagnosis(question.privateText)
    } satisfies OpenGeoAnswerCardV3;
  }) as unknown as [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}

function evidenceFor(questionId: string, index: number): OpenGeoAnswerEvidenceV3[] {
  return ["a", "b"].map((suffix, evidenceIndex) => ({
    evidenceId: `evidence-q${index + 1}-${suffix}`,
    questionId,
    subjectKey: `subject-q${index + 1}`,
    canonicalUrl: `https://${suffix}.example/q${index + 1}`,
    title: `来源 ${suffix.toUpperCase()}`,
    registrableDomain: `${suffix}.example`,
    ownershipCategory: evidenceIndex === 0 ? "target_owned" : "third_party_editorial",
    exactExcerpt: "Source-original supporting excerpt.",
    observedAt: "2030-01-01T00:00:00.000Z",
    eligible: true,
    direct: true
  }));
}

function emptyDiagnosis(retestQuestion: string): OpenGeoAnswerCardV3["geoDiagnosis"] {
  return {
    targetMentioned: false,
    targetFirstSentence: null,
    targetRoles: [],
    competitorEntityIds: [],
    citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0 },
    missingEvidenceFamilies: [],
    retestQuestion
  };
}

function canonicalIds(set: ConfirmedBusinessQuestionSet): [string, string, string] {
  return toCanonicalBuyerQuestionSet(set).questions.map(({ id }) => id) as [string, string, string];
}

function questionSet(): ConfirmedBusinessQuestionSet {
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  const privateTexts = ["哪些供应商能够提供跨境物流服务？", "哪些供应商适合中国出口企业？", "采购跨境物流服务时应如何比较交付风险？"];
  return {
    id: "question-set-v3",
    revision: 1,
    version: "business-questions-v1",
    locale: "zh-CN",
    region: "CN",
    confidence: "high",
    requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile-evidence",
    identityExclusions: ["甲物流"],
    acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z",
    contentHash: "question-set-content",
    questions: purposes.map((purpose, index) => ({
      purpose,
      generatedText: privateTexts[index]!,
      privateText: privateTexts[index]!,
      neutralPublicText: privateTexts[index]!,
      evidenceUrls: ["https://target.example/"],
      service: "跨境物流服务",
      audience: "中国出口企业",
      marketRegion: "中国",
      edited: false,
      neutralizationVersion: "identity-neutral-v1",
      neutralContentHash: `neutral-${index}`
    })) as unknown as ConfirmedBusinessQuestionSet["questions"]
  };
}

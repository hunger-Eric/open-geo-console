import { describe, expect, it, vi } from "vitest";
import type { PublicSourceEvidence } from "@open-geo-console/citation-intelligence";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { RecommendationForensicReportV2 } from "./recommendation-forensic-v2";
import {
  parseCombinedBusinessQuestionAnswers,
  selectQuestionAnswerEvidence,
  synthesizeCombinedBusinessQuestionAnswers
} from "./combined-business-question-answers";
import { ReportLanguageValidationError } from "./report-language";

describe("combined business question answers", () => {
  it("requires three ordered answers grounded in two independent sources per question", () => {
    const { questionSet, forensic, value } = fixture();
    expect(parseCombinedBusinessQuestionAnswers(value, questionSet, forensic).answers).toHaveLength(3);
    expect(selectQuestionAnswerEvidence(questionSet, forensic).every(({ evidence }) => new Set(evidence.map(({ registrableDomain }) => registrableDomain)).size >= 2)).toBe(true);
  });

  it("rejects evidence assigned to another question", () => {
    const { questionSet, forensic, value } = fixture();
    value.answers[1]!.sourceEvidenceIds = [...value.answers[0]!.sourceEvidenceIds];
    expect(() => parseCombinedBusinessQuestionAnswers(value, questionSet, forensic)).toThrow(/outside its question fanout/i);
  });

  it("fails closed when a question lacks two independent domains", () => {
    const { questionSet, forensic } = fixture();
    forensic.sourceGraph.evidence = forensic.sourceGraph.evidence.filter((evidence) => !evidence.queryVariantIds.includes("query-3-b"));
    expect(() => selectQuestionAnswerEvidence(questionSet, forensic)).toThrow(/two independent domains/i);
  });

  it("constrains model output and records its input identity", async () => {
    const { questionSet, forensic, value } = fixture();
    const completeJson = vi.fn(async (_request: unknown) => ({ value: { answers: value.answers.map((answer) => ({ ...answer, sourceEvidenceIds: ["model-hallucinated-id"] })) }, modelId: "served-model", rawContent: "{}" }));
    const result = await synthesizeCombinedBusinessQuestionAnswers({ configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 1 });
    expect(result.synthesis).toMatchObject({ mode: "evidence_constrained_model", modelId: "served-model" });
    expect(result.answers.every(({ sourceEvidenceIds }) => sourceEvidenceIds.length >= 2 && !sourceEvidenceIds.includes("model-hallucinated-id"))).toBe(true);
    expect(result.synthesis.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(completeJson).toHaveBeenCalledOnce();
    expect(JSON.stringify(completeJson.mock.calls[0]?.[0])).toContain("Write all report prose in English");
  });

  it("corrects Chinese answer language once", async () => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    const english = value.answers.map((item) => ({
      ...item,
      answer: "The customer should update all public materials from the verified evidence."
    }));
    const chinese = value.answers.map((item, index) => ({
      ...item,
      answer: `客户应依据已经核验的公开证据更新第 ${index + 1} 项业务材料并持续检查内容一致性。`
    }));
    const completeJson = vi.fn()
      .mockResolvedValueOnce({ value: { answers: english }, modelId: "served", rawContent: "{}" })
      .mockResolvedValueOnce({ value: { answers: chinese }, modelId: "served", rawContent: "{}" });

    const result = await synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson },
      { questionSet, forensic },
      { maxAttempts: 3, delay: async () => undefined }
    );

    expect(result.answers[0].answer).toContain("客户应依据");
    expect(completeJson).toHaveBeenCalledTimes(2);
    for (const call of completeJson.mock.calls) {
      expect(JSON.stringify(call[0])).toContain("Simplified Chinese");
    }
    const correction = JSON.parse(completeJson.mock.calls[1]![0].messages[1].content).correctionRequired;
    expect(correction).toEqual(["answers[0].answer: unexpected_english_sentence", "answers[1].answer: unexpected_english_sentence", "answers[2].answer: unexpected_english_sentence"]);
    expect(JSON.stringify(correction)).not.toContain("customer should update");
  });

  it("does not make a third model call after a repeated language violation", async () => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    const invalid = value.answers.map((item) => ({
      ...item,
      answer: "The customer should update all public materials from the verified evidence."
    }));
    const completeJson = vi.fn(async () => ({ value: { answers: invalid }, modelId: "served", rawContent: "{}" }));

    await expect(synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson },
      { questionSet, forensic },
      { maxAttempts: 3, delay: async () => undefined }
    )).rejects.toThrow(ReportLanguageValidationError);
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("preserves ordinary retries for non-language failures", async () => {
    const { questionSet, forensic, value } = fixture();
    const completeJson = vi.fn()
      .mockRejectedValueOnce(new Error("temporary transport failure"))
      .mockResolvedValueOnce({ value: { answers: value.answers }, modelId: "served", rawContent: "{}" });
    await expect(synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 3, delay: async () => undefined }
    )).resolves.toMatchObject({ synthesis: { modelId: "served" } });
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("allows exact proper names from resolved entities and supported claims", async () => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    forensic.sourceGraph.entities = [{ canonicalName: "Acme", status: "resolved" }] as unknown as RecommendationForensicReportV2["sourceGraph"]["entities"];
    forensic.sourceGraph.claims = [{ subjectName: "Beta Labs", status: "supported" }] as unknown as RecommendationForensicReportV2["sourceGraph"]["claims"];
    const answers = value.answers.map((item, index) => ({
      ...item,
      answer: `Acme 与 Beta Labs 应更新第 ${index + 1} 项业务材料并持续核验。`
    }));
    const completeJson = vi.fn(async () => ({ value: { answers }, modelId: "served", rawContent: "{}" }));

    const result = await synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson },
      { questionSet, forensic },
      { maxAttempts: 1 }
    );
    expect(result.answers[0].answer).toContain("Acme");
    expect(result.answers[0].answer).toContain("Beta Labs");
    expect(completeJson).toHaveBeenCalledOnce();
  });

  it("does not allowlist generic prose repeated across evidence excerpts", async () => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    forensic.sourceGraph.evidence = forensic.sourceGraph.evidence.map((item) => ({
      ...item,
      verifiedExcerpt: `Customer Growth Strategy appears in the supplied evidence from ${item.registrableDomain}.`
    }));
    const invalid = value.answers.map((item) => ({ ...item, answer: "客户应采用 Customer Growth Strategy 并继续核验公开材料。" }));
    const completeJson = vi.fn(async () => ({ value: { answers: invalid }, modelId: "served", rawContent: "{}" }));
    await expect(synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 3, delay: async () => undefined }
    )).rejects.toThrow(ReportLanguageValidationError);
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("allows official brand-style terms that occur in verified evidence", async () => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    forensic.sourceGraph.evidence = forensic.sourceGraph.evidence.map((item) => ({
      ...item,
      verifiedExcerpt: `Panli integrates AMERICAN NEW LOGISTICS with U-shipment, ERP and TMS for ${item.registrableDomain}.`
    }));
    const answers = value.answers.map((item) => ({
      ...item,
      answer: "Panli 可结合 AMERICAN NEW LOGISTICS、U-shipment、ERP 和 TMS 提供已验证的业务支持。"
    }));
    const completeJson = vi.fn(async () => ({ value: { answers }, modelId: "served", rawContent: "{}" }));

    const result = await synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 1 }
    );
    expect(result.answers[0].answer).toBe(answers[0]!.answer);
  });

  it.each(["Customer Growth Strategy", "Product One", "Google Analytics", "Cloudflare Workers"])(
    "does not treat an appendix product as an allowed proper name: %s",
    async (product) => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    forensic.websiteFoundationAppendix = { organizationProfile: {
      organizationName: null, brandNames: [], productsAndServices: [product], legalEntity: null
    } } as unknown as RecommendationForensicReportV2["websiteFoundationAppendix"];
    const invalid = value.answers.map((item) => ({ ...item, answer: `客户应采用 ${product} 并持续核验公开材料。` }));
    const completeJson = vi.fn(async () => ({ value: { answers: invalid }, modelId: "served", rawContent: "{}" }));
    await expect(synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 3, delay: async () => undefined }
    )).rejects.toThrow(ReportLanguageValidationError);
    expect(completeJson).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    ["organizationName", "AI Customer Growth Strategy"],
    ["brandNames", ["Grow Revenue in 30 Days"]],
    ["legalEntity", "cloud-first-growth"]
  ] as const)("does not let appendix profile %s authorize combined prose", async (field, value) => {
    const { questionSet, forensic, value: answerFixture } = fixture("zh-CN");
    forensic.websiteFoundationAppendix = { organizationProfile: {
      organizationName: null, brandNames: [], productsAndServices: [], legalEntity: null, [field]: value
    } } as unknown as RecommendationForensicReportV2["websiteFoundationAppendix"];
    const leaked = Array.isArray(value) ? value[0]! : value;
    const invalid = answerFixture.answers.map((item) => ({ ...item, answer: `客户不应把 ${leaked} 当作普通报告正文。` }));
    const completeJson = vi.fn(async () => ({ value: { answers: invalid }, modelId: "served", rawContent: "{}" }));
    await expect(synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 3, delay: async () => undefined }
    )).rejects.toThrow(ReportLanguageValidationError);
    expect(completeJson).toHaveBeenCalledTimes(2);
  });

  it("allows a product-like term only when it is a resolved entity", async () => {
    const { questionSet, forensic, value } = fixture("zh-CN");
    forensic.sourceGraph.entities = [{ canonicalName: "Google Analytics", status: "resolved" }] as unknown as RecommendationForensicReportV2["sourceGraph"]["entities"];
    const answers = value.answers.map((item) => ({ ...item, answer: "客户可依据 Google Analytics 的独立公开证据更新业务材料。" }));
    const completeJson = vi.fn(async () => ({ value: { answers }, modelId: "served", rawContent: "{}" }));
    const result = await synthesizeCombinedBusinessQuestionAnswers(
      { configuredModel: "configured", completeJson }, { questionSet, forensic }, { maxAttempts: 1 }
    );
    expect(result.answers[0].answer).toContain("Google Analytics");
  });
});

function fixture(locale = "en") {
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  const questionSet = { id: "question-set", revision: 1, locale, region: "US", status: "locked", confidence: "high",
    confirmedAt: "2030-01-01T00:00:00.000Z", lockedAt: "2030-01-01T00:00:00.000Z", contentHash: "hash", neutralContentHash: "neutral",
    questions: purposes.map((purpose, index) => ({ id: `private-${index + 1}`, ordinal: index + 1, purpose, generatedText: `Question ${index + 1}`,
      privateText: `Which option answers business question ${index + 1}?`, neutralPublicText: `Neutral question ${index + 1}`, neutralContentHash: `neutral-${index + 1}` }))
  } as unknown as ConfirmedBusinessQuestionSet;
  const publicQuestions = purposes.map((_, index) => ({ id: `question-${index + 1}`, normalizedText: `Neutral question ${index + 1}` }));
  const evidence = publicQuestions.flatMap((question, index) => ["a", "b"].map((suffix) => source(question.id, `query-${index + 1}-${suffix}`, `source-${index + 1}-${suffix}.example`)));
  const forensic = {
    locale, questions: { questions: publicQuestions },
    fanouts: publicQuestions.map((question, index) => ({ questionId: question.id, queries: ["a", "b"].map((suffix) => ({ id: `query-${index + 1}-${suffix}` })) })),
    sourceGraph: { evidence }
  } as unknown as RecommendationForensicReportV2;
  const value = { version: "combined-business-question-answers-v1", synthesis: { mode: "evidence_constrained_model", modelId: "fixture", inputHash: "hash" },
    answers: publicQuestions.map((question, index) => ({ questionId: question.id, purpose: purposes[index]!,
      answer: `A concise direct answer for business question ${index + 1}.`, sourceEvidenceIds: evidence.filter((item) => item.queryVariantIds[0]!.startsWith(`query-${index + 1}-`)).map(({ evidenceId }) => evidenceId) })) };
  return { questionSet, forensic, value };
}

function source(questionId: string, queryId: string, domain: string): PublicSourceEvidence {
  return { evidenceId: `evidence-${queryId}`, canonicalUrl: `https://${domain}/${questionId}`, registrableDomain: domain, ownershipCategory: "unknown",
    retrievalState: "available", verifiedExcerpt: `Verified public evidence for ${questionId} from ${domain}.`, directFactSupport: false,
    preciseEntityMapping: false, entityAmbiguous: false, contradictory: false, metadataOnly: false, observationRefs: [], queryVariantIds: [queryId],
    entityIds: [], claimIds: [], evidenceFamilyId: `family-${queryId}`, retrievalReadiness: { version: "retrieval-readiness-v1", signals: [], ready: true },
    sourceEligibility: { version: "source-eligibility-v1", signals: [], eligible: true }, grade: "B" };
}

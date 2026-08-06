import { describe, expect, it, vi } from "vitest";
import { GEO_ARTICLE_DELIVERABLE_VERSION, type JsonCompletionClient } from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet } from "@open-geo-console/public-search-observer";
import { combinedV3ArtifactFixture } from "../components/combined-artifact-fixtures";
import { buildGeoArticleFallback, generateGeoArticleExample, type GeoArticleExampleInput } from "./geo-article-example";

function input(client: JsonCompletionClient, locale = "en"): GeoArticleExampleInput {
  const report = combinedV3ArtifactFixture().combinedReport;
  const questionSet = {
    version: "business-questions-v1", id: "article-questions", revision: 1, locale, region: "US",
    confidence: "high", requiresAcknowledgement: false, profileEvidenceIdentity: "profile", identityExclusions: [],
    acknowledgedLowConfidence: false, confirmedAt: "2030-01-01T00:00:00.000Z", contentHash: "article-questions-hash",
    questions: report.businessQuestionSet.questions.map((question, index) => ({
      purpose: question.purpose, generatedText: question.privateText, privateText: question.privateText,
      neutralPublicText: question.privateText, evidenceUrls: [], service: `Service ${index + 1}`,
      audience: "Business buyers", marketRegion: "United States", edited: false,
      neutralizationVersion: "identity-neutral-v1", neutralContentHash: `neutral-${index + 1}`
    }))
  } as GeoArticleExampleInput["questionSet"];
  const canonical = toCanonicalBuyerQuestionSet(questionSet).questions;
  const answerCards = report.answerCards.map((card, index) => ({
    ...card,
    questionId: canonical[index]!.id,
    ...(card.answerMode === "generative_search_v1"
      ? { sources: card.sources }
      : { sourceEvidence: card.sourceEvidence.map((evidence) => ({ ...evidence, questionId: canonical[index]!.id })) })
  })) as GeoArticleExampleInput["answerCards"];
  return {
    client,
    targetUrl: report.targetUrl,
    locale,
    questionSet,
    answerCards,
    aiReport: {
      ...report.technicalFoundation.aiReport,
      organizationProfile: {
        ...report.technicalFoundation.aiReport.organizationProfile,
        organizationName: "Target Co",
        summary: "Example provides verifiable professional services.",
        productsAndServices: ["Professional service"],
        targetAudiences: ["Business buyers"],
        marketsAndRegions: ["United States"]
      }
    },
    technicalReport: report.technicalFoundation.technicalReport,
    timeoutMs: 50
  };
}

function modelArticle(questionId: string) {
  return {
    primaryQuestionId: questionId,
    article: {
      title: "How should buyers evaluate a professional service for a specific workflow?",
      introduction: { text: "Start with the workflow, operating constraints, and public proof needed for a reliable decision.", evidenceRefs: [`question:${questionId}`] },
      sections: [
        { id: "scenario", heading: "Define the workflow first", paragraphs: [{ text: "List the systems, handoffs, exceptions, and people involved in the workflow.", evidenceRefs: [`question:${questionId}`] }] },
        { id: "criteria", heading: "Compare the operating criteria", paragraphs: [{ text: "Check scope, integration conditions, exception recovery, and human review before comparing providers.", evidenceRefs: [`question:${questionId}`] }] },
        { id: "proof", heading: "Verify the public proof", paragraphs: [{ text: "Connect each important claim to an accessible service page, process, case, or stated limitation.", evidenceRefs: [`question:${questionId}`] }] }
      ],
      faq: [
        { question: "What should buyers verify first?", answer: { text: "Verify the workflow scope and operating limits before feature lists.", evidenceRefs: [`question:${questionId}`] } },
        { question: "Why does exception handling matter?", answer: { text: "It shows how the service behaves when automation cannot complete the workflow safely.", evidenceRefs: [`question:${questionId}`] } }
      ]
    },
    explanation: [
      { elementId: "title", heading: "Reader problem", reason: "The title states the buyer decision.", geoFunction: "Clarifies the primary intent.", evidenceRefs: [`question:${questionId}`] },
      { elementId: "introduction", heading: "Direct answer", reason: "The introduction gives the decision rule first.", geoFunction: "Makes the answer easy to extract.", evidenceRefs: [`question:${questionId}`] },
      { elementId: "section:scenario", heading: "Context", reason: "The first section defines the workflow.", geoFunction: "Builds semantic context.", evidenceRefs: [`question:${questionId}`] },
      { elementId: "section:criteria", heading: "Criteria", reason: "The second section supplies comparison dimensions.", geoFunction: "Creates explicit decision entities.", evidenceRefs: [`question:${questionId}`] },
      { elementId: "section:proof", heading: "Evidence", reason: "The final section binds claims to proof.", geoFunction: "Improves citation readiness.", evidenceRefs: [`question:${questionId}`] },
      { elementId: "faq", heading: "Adjacent questions", reason: "The FAQ covers related buyer concerns.", geoFunction: "Covers nearby intents without repeating the body.", evidenceRefs: [`question:${questionId}`] }
    ]
  };
}

describe("GEO article example generation", () => {
  it("uses one model call and retains a validated structured article", async () => {
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() });
    const completeJson = vi.fn(async () => ({ value: modelArticle(request.answerCards[0].questionId), modelId: "fixture", rawContent: "{}" }));
    const article = await generateGeoArticleExample({ ...request, client: { configuredModel: "fixture", completeJson } });
    expect(completeJson).toHaveBeenCalledTimes(1);
    const modelRequest = completeJson.mock.calls[0]![0] as { messages: Array<{ role: string; content: string }> };
    const system = modelRequest.messages.find(({ role }) => role === "system")?.content ?? "";
    const user = modelRequest.messages.find(({ role }) => role === "user")?.content ?? "{}";
    expect(system).toContain("publish-ready article for primaryQuestion");
    expect(system).toContain("Keep explanation separate");
    const payload = JSON.parse(user) as { task: string; constraints: string[] };
    expect(payload.task).toContain("publish-ready GEO article");
    expect(payload.constraints).toContain("Put writing reasons only in explanation.");
    expect(article).toMatchObject({ version: GEO_ARTICLE_DELIVERABLE_VERSION, kind: "article", primaryQuestionId: request.answerCards[0].questionId });
    if (article.kind !== "article") throw new TypeError("expected article");
    expect(article.article.sections).toHaveLength(3);
    expect(article.article.faq).toHaveLength(2);
    expect(article.explanation.map(({ elementId }) => elementId)).toEqual(["title", "introduction", "section:scenario", "section:criteria", "section:proof", "faq"]);
  });

  it("falls back without throwing when the provider fails", async () => {
    const completeJson = vi.fn(async () => { throw new Error("provider unavailable"); });
    const article = await generateGeoArticleExample(input({ configuredModel: "fixture", completeJson }));
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(article).toMatchObject({ version: GEO_ARTICLE_DELIVERABLE_VERSION, kind: "outline", fallbackReason: "provider_error" });
    if (article.kind !== "outline") throw new TypeError("expected outline");
    expect(article.outline.plannedSections.length).toBeGreaterThanOrEqual(3);
    expect(article.outline.faqAngles).toHaveLength(2);
  });

  it("falls back for unknown evidence references and invalid language", async () => {
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() });
    const invalidRef = modelArticle(request.answerCards[0].questionId);
    invalidRef.explanation[0]!.evidenceRefs = ["source:unknown"];
    const invalidReferenceClient = { configuredModel: "fixture", completeJson: vi.fn(async () => ({ value: invalidRef, modelId: "fixture", rawContent: "{}" })) };
    expect(await generateGeoArticleExample(input(invalidReferenceClient))).toMatchObject({ kind: "outline", fallbackReason: "contract_rejected" });
    const englishForChinese = { configuredModel: "fixture", completeJson: vi.fn(async () => ({ value: modelArticle(request.answerCards[0].questionId), modelId: "fixture", rawContent: "{}" })) };
    expect(await generateGeoArticleExample(input(englishForChinese, "zh-CN"))).toMatchObject({ kind: "outline", fallbackReason: "contract_rejected" });
  });

  it("uses the fallback when the isolated article deadline expires", async () => {
    const completeJson = vi.fn(({ signal }: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const article = await generateGeoArticleExample({ ...input({ configuredModel: "fixture", completeJson } as JsonCompletionClient), timeoutMs: 5 });
    expect(article).toMatchObject({ kind: "outline", fallbackReason: "timeout" });
  });

  it("builds a complete transparent fallback without a model client", () => {
    const { client: _client, ...fallbackInput } = input({ configuredModel: "fixture", completeJson: vi.fn() });
    void _client;
    const article = buildGeoArticleFallback(fallbackInput, "provider_error");
    expect(article.kind).toBe("outline");
    expect(article.explanation).toHaveLength(6);
    expect(article.primaryQuestionId).toBe(fallbackInput.answerCards[0].questionId);
    if (article.kind !== "outline") throw new TypeError("expected outline");
    const articleBody = [article.outline.workingTitle, article.outline.readerQuestion, article.outline.directAnswer, ...article.outline.plannedSections.flatMap(({ heading, purpose }) => [heading, purpose]), ...article.outline.faqAngles].join(" ");
    expect(articleBody).not.toMatch(/\b(?:report|example|prompt|input|generation process|writing method)\b/iu);
    expect(articleBody).not.toMatch(/报告|示例|提示词|输入材料|生成过程|写作方法/u);
  });

  it("keeps the Chinese fallback publish-ready and free of corrupted text", () => {
    const { client: _client, ...fallbackInput } = input({ configuredModel: "fixture", completeJson: vi.fn() }, "zh-CN");
    void _client;
    const article = buildGeoArticleFallback(fallbackInput, "quality_rejected");
    if (article.kind !== "outline") throw new TypeError("expected outline");
    const articleBody = [article.outline.workingTitle, article.outline.readerQuestion, article.outline.directAnswer, ...article.outline.plannedSections.flatMap(({ heading, purpose }) => [heading, purpose]), ...article.outline.faqAngles].join(" ");
    expect(articleBody).toContain("业务场景");
    expect(articleBody).not.toMatch(/报告|示例|提示词|输入材料|生成过程|写作方法/u);
    expect(articleBody).not.toMatch(/鍏|銆|鈥/u);
  });

  it("rejects provider ordinals, generic target titles, exact answer reuse, and duplicate FAQ prose without retry", async () => {
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() });
    const variants = [
      (value: ReturnType<typeof modelArticle>) => { value.article.introduction.text = "According to source 0, buyers should compare providers."; },
      (value: ReturnType<typeof modelArticle>) => { value.article.title = "Target Co service selection guide"; },
      (value: ReturnType<typeof modelArticle>) => { value.article.sections[0]!.paragraphs[0]!.text = request.answerCards[0].answerMode === "generative_search_v1" ? request.answerCards[0].answerText : request.answerCards[0].sentences.map(({ text }) => text).join(" "); },
      (value: ReturnType<typeof modelArticle>) => { value.article.faq[0]!.answer = value.article.sections[0]!.paragraphs[0]!; }
    ];
    for (const mutate of variants) {
      const value = modelArticle(request.answerCards[0].questionId);
      mutate(value);
      const completeJson = vi.fn(async () => ({ value, modelId: "fixture", rawContent: "{}" }));
      expect(await generateGeoArticleExample({ ...request, client: { configuredModel: "fixture", completeJson } })).toMatchObject({ kind: "outline", fallbackReason: "quality_rejected" });
      expect(completeJson).toHaveBeenCalledTimes(1);
    }
  });
});

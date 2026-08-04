import { describe, expect, it, vi } from "vitest";
import type { JsonCompletionClient } from "@open-geo-console/ai-report-engine";
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
    targetQuestionIds: [questionId],
    title: "A practical logistics provider guide",
    introduction: "Public information identifies the service scope, operating conditions, and proof buyers should verify.",
    sections: [
      { id: "scope", heading: "Confirm the service scope", paragraphs: ["Start with the exact service, audience, region, and operating limits stated on the website."] },
      { id: "proof", heading: "Connect claims to public proof", paragraphs: ["Link important claims to service pages, processes, cases, or other evidence that a buyer can verify."] }
    ],
    faq: [{ question: "What should buyers verify first?", answer: "Verify service scope, operating limits, and the public evidence supporting important claims." }],
    rationale: [
      { sectionId: "scope", reason: "Answer the buyer's immediate fit question.", evidenceRefs: [`question:${questionId}`] },
      { sectionId: "proof", reason: "Explain how the buyer can verify the answer.", evidenceRefs: [`question:${questionId}`] }
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
    expect(system).toContain("publish-ready customer article");
    expect(system).toContain("Keep rationale separate from the article");
    const payload = JSON.parse(user) as { task: string; constraints: string[] };
    expect(payload.task).toContain("publish-ready GEO article");
    expect(payload.constraints).toContain("Put writing reasons only in rationale.");
    expect(article.generationMode).toBe("model");
    expect(article.sections).toHaveLength(2);
    expect(article.rationale.map(({ sectionId }) => sectionId)).toEqual(["scope", "proof"]);
  });

  it("falls back without throwing when the provider fails", async () => {
    const completeJson = vi.fn(async () => { throw new Error("provider unavailable"); });
    const article = await generateGeoArticleExample(input({ configuredModel: "fixture", completeJson }));
    expect(completeJson).toHaveBeenCalledTimes(1);
    expect(article.generationMode).toBe("deterministic_fallback");
    expect(article.sections.length).toBeGreaterThanOrEqual(2);
    expect(article.faq).toHaveLength(3);
  });

  it("falls back for unknown evidence references and invalid language", async () => {
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() });
    const invalidRef = modelArticle(request.answerCards[0].questionId);
    invalidRef.rationale[0]!.evidenceRefs = ["source:unknown"];
    const invalidReferenceClient = { configuredModel: "fixture", completeJson: vi.fn(async () => ({ value: invalidRef, modelId: "fixture", rawContent: "{}" })) };
    expect((await generateGeoArticleExample(input(invalidReferenceClient))).generationMode).toBe("deterministic_fallback");
    const englishForChinese = { configuredModel: "fixture", completeJson: vi.fn(async () => ({ value: modelArticle(request.answerCards[0].questionId), modelId: "fixture", rawContent: "{}" })) };
    expect((await generateGeoArticleExample(input(englishForChinese, "zh-CN"))).generationMode).toBe("deterministic_fallback");
  });

  it("uses the fallback when the isolated article deadline expires", async () => {
    const completeJson = vi.fn(({ signal }: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const article = await generateGeoArticleExample({ ...input({ configuredModel: "fixture", completeJson } as JsonCompletionClient), timeoutMs: 5 });
    expect(article.generationMode).toBe("deterministic_fallback");
  });

  it("builds a complete transparent fallback without a model client", () => {
    const { client: _client, ...fallbackInput } = input({ configuredModel: "fixture", completeJson: vi.fn() });
    void _client;
    const article = buildGeoArticleFallback(fallbackInput);
    expect(article.generationMode).toBe("deterministic_fallback");
    expect(article.rationale).toHaveLength(article.sections.length);
    expect(article.targetQuestionIds).toHaveLength(3);
    const articleBody = [article.title, article.introduction, ...article.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs]), ...article.faq.flatMap(({ question, answer }) => [question, answer])].join(" ");
    expect(articleBody).not.toMatch(/\b(?:report|example|prompt|input|generation process|writing method)\b/iu);
    expect(articleBody).not.toMatch(/报告|示例|提示词|输入材料|生成过程|写作方法/u);
  });

  it("keeps the Chinese fallback publish-ready and free of corrupted text", () => {
    const { client: _client, ...fallbackInput } = input({ configuredModel: "fixture", completeJson: vi.fn() }, "zh-CN");
    void _client;
    const article = buildGeoArticleFallback(fallbackInput);
    const articleBody = [article.title, article.introduction, ...article.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs]), ...article.faq.flatMap(({ question, answer }) => [question, answer])].join(" ");
    expect(articleBody).toContain("服务范围与适用对象");
    expect(articleBody).not.toMatch(/报告|示例|提示词|输入材料|生成过程|写作方法/u);
    expect(articleBody).not.toMatch(/鍏|銆|鈥/u);
  });
});

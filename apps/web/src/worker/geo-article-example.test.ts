import { describe, expect, it, vi } from "vitest";
import {
  GEO_ARTICLE_DELIVERABLE_V3_VERSION,
  type GenerativeSearchAnswerProvider,
  type JsonCompletionClient
} from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet } from "@open-geo-console/public-search-observer";
import { combinedV3ArtifactFixture } from "../components/combined-artifact-fixtures";
import { buildGeoArticleFallback, generateGeoArticleExample, type GeoArticleExampleInput } from "./geo-article-example";

function input(client: JsonCompletionClient, locale = "en", provider = researchProvider(locale)): GeoArticleExampleInput {
  const report = combinedV3ArtifactFixture().combinedReport;
  const questionSet = {
    version: "business-questions-v1", id: "article-questions", revision: 1, locale, region: locale.startsWith("zh") ? "CN" : "US",
    confidence: "high", requiresAcknowledgement: false, profileEvidenceIdentity: "profile", identityExclusions: [],
    acknowledgedLowConfidence: false, confirmedAt: "2030-01-01T00:00:00.000Z", contentHash: "article-questions-hash",
    questions: report.businessQuestionSet.questions.map((question, index) => ({
      purpose: question.purpose, generatedText: question.privateText, privateText: question.privateText,
      neutralPublicText: locale.startsWith("zh") ? `企业如何评估 AI 业务自动化方案 ${index + 1}？` : question.privateText,
      evidenceUrls: [], service: "AI workflow automation", audience: "Enterprise teams", marketRegion: locale.startsWith("zh") ? "中国" : "United States", edited: false,
      neutralizationVersion: "identity-neutral-v1", neutralContentHash: `neutral-${index + 1}`
    }))
  } as GeoArticleExampleInput["questionSet"];
  const canonical = toCanonicalBuyerQuestionSet(questionSet).questions;
  const answerCards = report.answerCards.map((card, index) => ({
    ...card,
    questionId: canonical[index]!.id,
    exactQuestion: questionSet.questions[index]!.neutralPublicText,
    ...(card.answerMode === "generative_search_v1"
      ? { answerText: locale.startsWith("zh") ? `公开资料说明企业 AI 自动化方案 ${index + 1} 需要明确流程和交付边界。` : card.answerText, sources: card.sources }
      : { sourceEvidence: card.sourceEvidence.map((evidence) => ({ ...evidence, questionId: canonical[index]!.id })) })
  })) as GeoArticleExampleInput["answerCards"];
  return {
    client,
    researchProvider: provider,
    targetUrl: report.targetUrl,
    locale,
    questionSet,
    answerCards,
    aiReport: {
      ...report.technicalFoundation.aiReport,
      organizationProfile: {
        ...report.technicalFoundation.aiReport.organizationProfile,
        organizationName: locale.startsWith("zh") ? "目标科技" : "Target Co",
        summary: locale.startsWith("zh") ? "目标科技为企业提供可核验的 AI 工作流自动化服务。" : "Target Co provides verifiable AI workflow automation services.",
        productsAndServices: [locale.startsWith("zh") ? "AI 工作流自动化" : "AI workflow automation"],
        targetAudiences: [locale.startsWith("zh") ? "企业团队" : "Enterprise teams"],
        marketsAndRegions: [locale.startsWith("zh") ? "中国" : "United States"]
      }
    },
    technicalReport: report.technicalFoundation.technicalReport,
    timeoutMs: 50,
    searchTimeoutMs: 50,
    now: () => new Date("2030-01-01T00:00:02.000Z")
  };
}

function researchProvider(locale = "en", fail = false): GenerativeSearchAnswerProvider {
  return {
    providerId: "fixture-search", model: "fixture-search-model", searchMode: "native_web_search",
    answerWithSources: vi.fn(async ({ questionId }) => {
      if (fail) throw new Error("search unavailable");
      return {
        questionId,
        answerText: locale.startsWith("zh") ? "公开实施资料强调流程边界和人工接管机制。" : "Public implementation guidance emphasizes workflow boundaries and human handoff.",
        sources: [{
          sourceId: "article-source-1", title: locale.startsWith("zh") ? "企业 AI 实施指南" : "Enterprise AI implementation guide",
          canonicalUrl: "https://research.example/ai-implementation", registrableDomain: "research.example",
          citedText: locale.startsWith("zh") ? "企业 AI 项目需要明确流程边界和人工接管机制。" : "Enterprise AI projects need explicit workflow boundaries and human handoff.", providerResultOrder: 0
        }],
        refusal: null, searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z", providerResponseId: "research-response"
      };
    })
  };
}

function modelArticle(questionId: string, locale = "en", researched = true) {
  const zh = locale.startsWith("zh");
  const questionRef = `question:${questionId}`;
  return {
    article: {
      title: "ignored because the deterministic business title is authoritative",
      introduction: {
        text: zh ? "企业团队评估 AI 工作流自动化时，应先明确真实流程、交付边界和可核验依据。目标科技公开提供 AI 工作流自动化服务。" : "Enterprise teams evaluating AI workflow automation should define the real workflow, delivery boundaries, and verifiable proof first. Target Co publicly provides AI workflow automation services.",
        evidenceRefs: [questionRef, "website:service:0", "website:audience:0", "website:organization"]
      },
      sections: [
        { id: "scenario", heading: zh ? "把 AI 能力放进真实业务流程" : "Put the AI capability into the real workflow", paragraphs: [{ text: zh ? "目标科技的 AI 工作流自动化能力需要对应企业团队的系统交接、异常处理和人工复核环节。" : "Target Co's AI workflow automation capability needs to map to enterprise teams' system handoffs, exception handling, and human review.", evidenceRefs: [questionRef, "website:organization", "website:service:0", "website:audience:0"] }] },
        { id: "criteria", heading: zh ? "用交付边界建立判断标准" : "Use delivery boundaries as decision criteria", paragraphs: [{ text: zh ? "企业团队应核对输入输出、责任边界、验收方式和持续维护安排。" : "Enterprise teams should verify inputs and outputs, ownership boundaries, acceptance criteria, and ongoing maintenance.", evidenceRefs: [questionRef, "website:audience:0"] }] },
        { id: "proof", heading: zh ? "核对公开事实与实施依据" : "Verify public facts and implementation evidence", paragraphs: [{ text: zh ? "公开实施指南说明，企业 AI 项目需要明确流程边界和人工接管机制。" : "Public implementation guidance states that enterprise AI projects need explicit workflow boundaries and human handoff.", evidenceRefs: researched ? ["research:article-source-1", "website:service:0"] : [`source:${sourceIdFor(inputCardFixture())}`, "website:service:0"] }] }
      ],
      faq: [
        { question: zh ? "企业应先核对哪项条件？" : "What should an enterprise verify first?", answer: { text: zh ? "先确认 AI 工作流自动化对应的业务流程、使用者和异常处理责任。" : "Confirm the workflow, intended users, and exception ownership for AI workflow automation first.", evidenceRefs: [questionRef, "website:service:0"] } },
        { question: zh ? "为什么需要人工接管机制？" : "Why does human handoff matter?", answer: { text: zh ? "人工接管机制说明自动化无法安全完成任务时由谁继续处理。" : "Human handoff defines who continues the work when automation cannot complete it safely.", evidenceRefs: [questionRef, "website:audience:0"] } }
      ]
    },
    explanation: [
      { elementId: "title", heading: zh ? "业务标题" : "Business title", reason: zh ? "标题限定客户、能力和决策任务。" : "The title limits the audience, capability, and decision task.", geoFunction: zh ? "锁定单一搜索意图。" : "Clarifies one search intent.", evidenceRefs: [questionRef, "website:service:0", "website:audience:0"] },
      { elementId: "introduction", heading: zh ? "答案前置" : "Answer first", reason: zh ? "导语先给出判断方法。" : "The introduction gives the decision method first.", geoFunction: zh ? "形成独立答案块。" : "Creates a standalone answer block.", evidenceRefs: [questionRef, "website:service:0"] },
      { elementId: "section:scenario", heading: zh ? "业务场景" : "Business scenario", reason: zh ? "连接真实流程。" : "Connects the real workflow.", geoFunction: zh ? "明确实体关系。" : "Makes entity relationships explicit.", evidenceRefs: [questionRef, "website:service:0"] },
      { elementId: "section:criteria", heading: zh ? "判断标准" : "Decision criteria", reason: zh ? "提供可执行维度。" : "Provides executable criteria.", geoFunction: zh ? "便于结构化抽取。" : "Supports structured extraction.", evidenceRefs: [questionRef, "website:audience:0"] },
      { elementId: "section:proof", heading: zh ? "事实核验" : "Evidence check", reason: zh ? "区分业务事实和外部依据。" : "Separates business facts from external support.", geoFunction: zh ? "提升可验证性。" : "Improves verifiability.", evidenceRefs: researched ? ["research:article-source-1", "website:service:0"] : [questionRef, "website:service:0"] },
      { elementId: "faq", heading: zh ? "相邻问题" : "Adjacent intent", reason: zh ? "补充正文未覆盖的问题。" : "Covers questions not answered in the body.", geoFunction: zh ? "扩展相关查询覆盖。" : "Extends related query coverage.", evidenceRefs: [questionRef, "website:service:0"] }
    ]
  };
}

function inputCardFixture() { return combinedV3ArtifactFixture().combinedReport.answerCards[0]!; }
function sourceIdFor(card: ReturnType<typeof inputCardFixture>): string { return card.answerMode === "generative_search_v1" ? card.sources[0]!.sourceId : card.sourceEvidence[0]!.evidenceId; }

describe("GEO article V3 generation", () => {
  it("runs title-focused search before one model call and retains a business-specific GEO article", async () => {
    const order: string[] = [];
    const provider = researchProvider();
    vi.mocked(provider.answerWithSources).mockImplementation(async (request) => {
      order.push("search");
      return (await researchProvider().answerWithSources(request));
    });
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() }, "en", provider);
    const completeJson = vi.fn(async ({ messages }: { messages: Array<{ role: string; content: string }> }) => {
      order.push("article");
      const payload = JSON.parse(messages.find(({ role }) => role === "user")!.content) as { exactTitle: string };
      expect(payload.exactTitle).toContain("Enterprise teams");
      expect(payload.exactTitle).toContain("AI workflow automation");
      return { value: modelArticle(request.answerCards[0].questionId), modelId: "fixture", rawContent: "{}" };
    });
    const article = await generateGeoArticleExample({ ...request, client: { configuredModel: "fixture", completeJson } });
    expect(order).toEqual(["search", "article"]);
    expect(provider.answerWithSources).toHaveBeenCalledOnce();
    expect(completeJson).toHaveBeenCalledOnce();
    expect(article).toMatchObject({ version: GEO_ARTICLE_DELIVERABLE_V3_VERSION, kind: "article", generationMode: "model_researched", research: { outcome: "usable" } });
    expect(article.article.introduction.evidenceRefs).toEqual(expect.arrayContaining(["website:service:0", "website:audience:0"]));
    expect(article.explanation.map(({ elementId }) => elementId)).toEqual(["title", "introduction", "section:scenario", "section:criteria", "section:proof", "faq"]);
  });

  it("uses the existing report evidence when focused search fails and still calls the article model once", async () => {
    const provider = researchProvider("en", true);
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() }, "en", provider);
    const completeJson = vi.fn(async () => ({ value: modelArticle(request.answerCards[0].questionId, "en", false), modelId: "fixture", rawContent: "{}" }));
    const article = await generateGeoArticleExample({ ...request, client: { configuredModel: "fixture", completeJson } });
    expect(provider.answerWithSources).toHaveBeenCalledOnce();
    expect(completeJson).toHaveBeenCalledOnce();
    expect(article).toMatchObject({ kind: "article", generationMode: "model_existing_evidence", research: { outcome: "unavailable" } });
  });

  it("returns a complete deterministic article when the article model fails or times out", async () => {
    const failed = await generateGeoArticleExample(input({ configuredModel: "fixture", completeJson: vi.fn(async () => { throw new Error("provider unavailable"); }) }));
    expect(failed).toMatchObject({ version: GEO_ARTICLE_DELIVERABLE_V3_VERSION, kind: "article", generationMode: "deterministic_evidence_fallback" });
    expect(failed.article.sections).toHaveLength(3);
    expect(failed.article.faq).toHaveLength(2);
    const pending = vi.fn(({ signal }: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const timed = await generateGeoArticleExample({ ...input({ configuredModel: "fixture", completeJson: pending } as JsonCompletionClient), timeoutMs: 5 });
    expect(timed).toMatchObject({ kind: "article", generationMode: "deterministic_evidence_fallback" });
  });

  it("degrades invalid contract, language, advertising, vague blocks, and unsupported business linkage without retry", async () => {
    const request = input({ configuredModel: "fixture", completeJson: vi.fn() });
    const variants = [
      (value: ReturnType<typeof modelArticle>) => { value.explanation[0]!.evidenceRefs = ["source:unknown"]; },
      (value: ReturnType<typeof modelArticle>) => { value.article.introduction.text = "Contact us for the best guaranteed AI solution."; },
      (value: ReturnType<typeof modelArticle>) => { value.article.sections[0]!.paragraphs[0]!.text = "This provides the required context."; },
      (value: ReturnType<typeof modelArticle>) => {
        const onlyQuestion = [`question:${request.answerCards[0].questionId}`];
        value.article.introduction.evidenceRefs = onlyQuestion;
        value.article.sections.forEach((section) => section.paragraphs.forEach((paragraph) => { paragraph.evidenceRefs = onlyQuestion; }));
        value.article.faq.forEach((entry) => { entry.answer.evidenceRefs = onlyQuestion; });
      }
    ];
    for (const mutate of variants) {
      const value = modelArticle(request.answerCards[0].questionId);
      mutate(value);
      const completeJson = vi.fn(async () => ({ value, modelId: "fixture", rawContent: "{}" }));
      const article = await generateGeoArticleExample({ ...request, client: { configuredModel: "fixture", completeJson } });
      expect(article).toMatchObject({ kind: "article", generationMode: "deterministic_evidence_fallback" });
      expect(completeJson).toHaveBeenCalledOnce();
    }
    const zhRequest = input({ configuredModel: "fixture", completeJson: vi.fn() }, "zh-CN", researchProvider("zh-CN"));
    const englishOnly = vi.fn(async () => ({ value: modelArticle(zhRequest.answerCards[0].questionId), modelId: "fixture", rawContent: "{}" }));
    expect(await generateGeoArticleExample({ ...zhRequest, client: { configuredModel: "fixture", completeJson: englishOnly } })).toMatchObject({ generationMode: "deterministic_evidence_fallback" });
  });

  it("builds a Chinese business-specific GEO article directly without corrupted or advertising text", () => {
    const { client: _client, researchProvider: _provider, ...fallbackInput } = input({ configuredModel: "fixture", completeJson: vi.fn() }, "zh-CN", researchProvider("zh-CN"));
    void _client; void _provider;
    const article = buildGeoArticleFallback(fallbackInput, "provider_error");
    const prose = [article.article.title, article.article.introduction.text, ...article.article.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs.map(({ text }) => text)])].join(" ");
    expect(article).toMatchObject({ kind: "article", generationMode: "deterministic_evidence_fallback" });
    expect(prose).toContain("AI 工作流自动化");
    expect(prose).toContain("企业团队");
    expect(prose).not.toMatch(/领先|一站式|保证排名|联系我们|閸|鈥/u);
    expect(new Set(article.article.introduction.evidenceRefs.filter((ref) => ref.startsWith("website:"))).size).toBeGreaterThanOrEqual(2);
  });
});

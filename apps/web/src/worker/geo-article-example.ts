import {
  GEO_ARTICLE_EXAMPLE_VERSION,
  parseGeoArticleExampleV1,
  type AiWebsiteReportV1,
  type GeoArticleExampleV1,
  type JsonCompletionClient,
  type OpenGeoAnswerCardV3
} from "@open-geo-console/ai-report-engine";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";

export interface GeoArticleExampleInput {
  readonly client: JsonCompletionClient;
  readonly targetUrl: string;
  readonly locale: string;
  readonly questionSet: ConfirmedBusinessQuestionSet;
  readonly answerCards: readonly [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  readonly aiReport: AiWebsiteReportV1;
  readonly technicalReport: GeoAuditReport;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export async function generateGeoArticleExample(input: GeoArticleExampleInput): Promise<GeoArticleExampleV1> {
  const authority = articleAuthority(input);
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("GEO article generation timed out.")), input.timeoutMs ?? 30_000);
  try {
    const result = await input.client.completeJson({
      temperature: 0.2,
      maxTokens: 5_000,
      signal: controller.signal,
      messages: [
        { role: "system", content: articleSystemPrompt(input.locale) },
        { role: "user", content: JSON.stringify(compactArticleInput(input, authority.evidenceRefs)) }
      ]
    });
    const value = objectOrEmpty(result.value);
    return parseGeoArticleExampleV1({
      ...value,
      version: GEO_ARTICLE_EXAMPLE_VERSION,
      generationMode: "model"
    }, authority);
  } catch {
    return buildGeoArticleFallback(input);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }
}

export function buildGeoArticleFallback(input: Omit<GeoArticleExampleInput, "client">): GeoArticleExampleV1 {
  const zh = input.locale.toLowerCase().startsWith("zh");
  const authority = articleAuthority(input);
  const profile = input.aiReport.organizationProfile;
  const organization = bounded(safeText(profile.organizationName?.trim() || new URL(input.targetUrl).hostname), 120);
  const services = (profile.productsAndServices ?? []).slice(0, 4);
  const audiences = (profile.targetAudiences ?? []).slice(0, 3);
  const regions = (profile.marketsAndRegions ?? []).slice(0, 3);
  const questions = articleQuestions(input);
  const questionRefs = questions.map(({ id }) => `question:${id}`);
  const findingRef = authority.evidenceRefs.find((ref) => ref.startsWith("finding:")) ?? questionRefs[0]!;
  const sections = zh ? [
    {
      id: "website-facts",
      heading: "先确认服务范围与适用对象",
      paragraphs: [
        safeText(`${organization}在官网中公开表达的服务包括${services.length ? services.join("、") : "相关专业服务"}。${audiences.length ? `这些服务主要面向${audiences.join("、")}。` : "采购前应进一步确认具体适用对象。"}`),
        safeText(regions.length ? `网站提到的市场或服务区域包括${regions.join("、")}，实际覆盖范围仍应以可核验页面和具体项目条件为准。` : "网站尚未清楚列出完整服务区域，采购前应核对目的地、时效和限制条件。")
      ]
    },
    {
      id: "buyer-decision",
      heading: "把买家问题写成可以直接核验的答案",
      paragraphs: [safeText(answerText(input.answerCards[0], "当前公开信息应围绕服务能力、适用条件和限制形成直接答案。"))]
    },
    {
      id: "verification",
      heading: "补充能够被公开验证的证据",
      paragraphs: ["文章不应只描述优势，还应连接到服务页、流程、案例、资质或其他可核验材料，并明确不适用条件。这样既方便买家判断，也方便后续使用同一问题复测信息是否完整。"]
    }
  ] : [
    {
      id: "website-facts",
      heading: "Start with service scope and audience",
      paragraphs: [
        safeText(`${organization} describes ${services.length ? services.join(", ") : "its professional services"} on its website.${audiences.length ? ` The stated audiences include ${audiences.join(", ")}.` : " Buyers should confirm the exact audience and operating conditions."}`),
        safeText(regions.length ? `The stated markets or service regions include ${regions.join(", ")}. Buyers should verify the exact coverage and constraints on the relevant service page.` : "The website does not clearly enumerate complete service regions, so buyers should verify destinations, timing, and constraints before purchase.")
      ]
    },
    {
      id: "buyer-decision",
      heading: "Turn the buyer question into a verifiable answer",
      paragraphs: [safeText(answerText(input.answerCards[0], "Public information should answer the buyer question with specific capabilities, conditions, and limits."))]
    },
    {
      id: "verification",
      heading: "Connect claims to public proof",
      paragraphs: ["The article should connect each important claim to a service page, process, case study, credential, or other verifiable material and state relevant limitations. This helps buyers evaluate the offer and supports repeatable retesting with the same questions."]
    }
  ];
  const article = {
    version: GEO_ARTICLE_EXAMPLE_VERSION,
    generationMode: "deterministic_fallback" as const,
    targetQuestionIds: questions.map(({ id }) => id),
    title: zh ? `${organization}服务选择与核验指南` : `${organization} service selection and verification guide`,
    introduction: zh
      ? "下面是一篇基于本次网站事实和买家问题组织的GEO文章示例。它不承诺排名或引用结果，只示范如何把可核验信息写得更容易理解。"
      : "This GEO article example is organized from the verified website facts and buyer questions in this report. It does not promise ranking or citation outcomes; it demonstrates how to present verifiable information clearly.",
    sections,
    faq: questions.map((question, index) => ({
      question: safeText(question.text),
      answer: safeText(answerText(input.answerCards[index]!, zh ? "当前报告没有足够信息形成更具体的回答。" : "The report does not contain enough information for a more specific answer."))
    })),
    rationale: sections.map((section, index) => ({
      sectionId: section.id,
      reason: zh
        ? ["先建立网站公开事实，避免文章脱离真实业务。", "直接回应买家问题，让文章承担明确的检索与决策任务。", "解释证据和限制，避免只有宣传性结论。"][index]!
        : ["Establish public website facts before making any recommendation.", "Answer the buyer question directly so the article has a clear retrieval and decision purpose.", "Explain evidence and limitations instead of relying on promotional claims."][index]!,
      evidenceRefs: [index === 0 ? findingRef : questionRefs[Math.min(index - 1, questionRefs.length - 1)]!]
    }))
  };
  return parseGeoArticleExampleV1(article, authority);
}

function articleAuthority(input: Omit<GeoArticleExampleInput, "client">): { locale: string; questionIds: string[]; evidenceRefs: string[] } {
  const questionIds = articleQuestions(input).map(({ id }) => id);
  return {
    locale: input.locale,
    questionIds,
    evidenceRefs: [...new Set([
      ...questionIds.map((id) => `question:${id}`),
      ...(input.technicalReport.findings ?? []).map(({ id }) => `technical:${id}`),
      ...(input.aiReport.findings ?? []).map(({ id }) => `finding:${id}`),
      ...input.answerCards.flatMap((card) => card.answerMode === "generative_search_v1"
        ? card.sources.map(({ sourceId }) => `source:${sourceId}`)
        : card.sourceEvidence.map(({ evidenceId }) => `source:${evidenceId}`))
    ])]
  };
}

function compactArticleInput(input: GeoArticleExampleInput, evidenceRefs: readonly string[]): Record<string, unknown> {
  const profile = input.aiReport.organizationProfile;
  const questions = articleQuestions(input);
  return {
    task: "Write one evidence-grounded GEO article example and explain why each section is written that way.",
    constraints: ["Return JSON only.", "Use only supplied facts.", "Do not promise rankings, recommendations, or future citations.", "Use only the supplied evidenceRefs."],
    locale: input.locale,
    targetUrl: input.targetUrl,
    evidenceRefs,
    website: {
      organizationName: profile.organizationName,
      summary: bounded(profile.summary ?? "", 3_000),
      productsAndServices: (profile.productsAndServices ?? []).slice(0, 8),
      targetAudiences: (profile.targetAudiences ?? []).slice(0, 6),
      marketsAndRegions: (profile.marketsAndRegions ?? []).slice(0, 6)
    },
    questions: questions.map((question, index) => ({
      id: question.id,
      text: question.text,
      answer: bounded(answerText(input.answerCards[index]!, ""), 4_000),
      sources: input.answerCards[index]!.answerMode === "generative_search_v1"
        ? input.answerCards[index]!.sources.slice(0, 5).map(({ sourceId, title, citedText }) => ({ evidenceRef: `source:${sourceId}`, title, citedText: bounded(citedText ?? "", 1_200) }))
        : input.answerCards[index]!.sourceEvidence.slice(0, 5).map(({ evidenceId, title, exactExcerpt }) => ({ evidenceRef: `source:${evidenceId}`, title, citedText: bounded(exactExcerpt, 1_200) }))
    })),
    findings: (input.aiReport.findings ?? []).slice(0, 8).map(({ id, title, impact, recommendation }) => ({ evidenceRef: `finding:${id}`, title, impact: bounded(impact, 1_500), recommendation: bounded(recommendation, 1_500) })),
    outputShape: {
      targetQuestionIds: ["locked question ID"],
      title: "string",
      introduction: "string",
      sections: [{ id: "stable-section-id", heading: "string", paragraphs: ["string"] }],
      faq: [{ question: "string", answer: "string" }],
      rationale: [{ sectionId: "stable-section-id", reason: "string", evidenceRefs: ["supplied evidenceRef"] }]
    }
  };
}

function articleQuestions(input: Omit<GeoArticleExampleInput, "client">): { id: string; text: string }[] {
  const canonical = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  return canonical.map((question, index) => ({
    id: question.id,
    text: input.questionSet.questions[index]?.neutralPublicText || input.answerCards[index]!.exactQuestion
  }));
}

function articleSystemPrompt(locale: string): string {
  return locale.toLowerCase().startsWith("zh")
    ? "你是GEO内容编辑。只输出JSON。根据已提供的网站事实、买家问题和证据引用写一篇完整但克制的中文示例文章，并逐节解释写作理由。不得补充输入之外的事实，不得承诺排名、推荐或未来引用。"
    : "You are a GEO content editor. Return JSON only. Write a complete but restrained article from the supplied website facts, buyer questions, and evidence references, then explain the rationale for every section. Do not add facts or promise ranking, recommendation, or future citation outcomes.";
}

function answerText(card: OpenGeoAnswerCardV3, fallback: string): string {
  if (card.answerMode === "generative_search_v1") return card.refusal?.reason || card.answerText || fallback;
  return card.sentences.filter(({ kind }) => kind !== "scope_note").map(({ text }) => text).join(" ") || fallback;
}
function safeText(value: string): string {
  return bounded(value
    .replace(/<\/?[a-z][^>]*>/giu, "")
    .replace(/\[([^\]]+)\]\([^\s)]+\)/gu, "$1")
    .replace(/[*_`#]/gu, ""), 4_000) || "—";
}
function bounded(value: string, max: number): string { return value.trim().slice(0, max); }
function objectOrEmpty(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

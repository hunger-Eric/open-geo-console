import {
  GEO_ARTICLE_DELIVERABLE_VERSION,
  parseGeoArticleDeliverable,
  type AiWebsiteReportV1,
  type GeoArticleDeliverableV2,
  type GeoArticleFallbackReason,
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

export async function generateGeoArticleExample(input: GeoArticleExampleInput): Promise<GeoArticleDeliverableV2> {
  const authority = articleAuthority(input);
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error("GEO article generation timed out."));
  }, input.timeoutMs ?? 30_000);
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
    assertModelArticleQuality(value, input);
    const parsed = parseGeoArticleDeliverable({
      ...value,
      version: GEO_ARTICLE_DELIVERABLE_VERSION,
      kind: "article"
    }, authority);
    if (parsed.version !== GEO_ARTICLE_DELIVERABLE_VERSION) throw new TypeError("GEO article generator returned a legacy value.");
    return parsed;
  } catch (error) {
    return buildGeoArticleFallback(input, classifyFallback(error, timedOut));
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }
}

export function buildGeoArticleFallback(
  input: Omit<GeoArticleExampleInput, "client">,
  fallbackReason: GeoArticleFallbackReason
): GeoArticleDeliverableV2 {
  const zh = input.locale.toLowerCase().startsWith("zh");
  const authority = articleAuthority(input);
  const profile = input.aiReport.organizationProfile;
  const organization = bounded(safeText(profile.organizationName?.trim() || new URL(input.targetUrl).hostname), 120);
  const services = (profile.productsAndServices ?? []).slice(0, 4);
  const audiences = (profile.targetAudiences ?? []).slice(0, 3);
  const primary = articleQuestions(input)[0]!;
  const questionRef = `question:${primary.id}`;
  const findingRef = authority.evidenceRefs.find((ref) => ref.startsWith("finding:")) ?? questionRef;
  const directAnswer = cleanProviderReferences(answerText(input.answerCards[0], zh
    ? "现有公开信息只能支持初步判断；采购前仍需核对服务范围、适用条件和公开证据。"
    : "The public information supports an initial assessment only; buyers should still verify scope, operating conditions, and public proof."));
  const plannedSections = zh ? [
    {
      id: "scenario",
      heading: "先说明买家面对的业务场景",
      purpose: safeText(`围绕“${primary.text}”说明需要解决的实际流程，而不是从${organization}的服务清单开始。`),
      evidenceRefs: [questionRef]
    },
    {
      id: "criteria",
      heading: "再给出能够执行的判断标准",
      purpose: safeText(`把选择条件拆成服务范围、适用对象、异常处理和交付边界。当前公开服务包括${services.length ? services.join("、") : "相关专业服务"}${audiences.length ? `，主要面向${audiences.join("、")}` : ""}。`),
      evidenceRefs: [findingRef]
    },
    {
      id: "verification",
      heading: "最后连接公开证据与核验清单",
      purpose: "逐项连接可访问的服务页、流程、案例或资质，并明确尚不能确认的条件。",
      evidenceRefs: [questionRef]
    }
  ] : [
    {
      id: "scenario",
      heading: "Start with the buyer's operating scenario",
      purpose: safeText(`Frame the workflow behind “${primary.text}” instead of opening with ${organization}'s service catalogue.`),
      evidenceRefs: [questionRef]
    },
    {
      id: "criteria",
      heading: "Turn the decision into practical criteria",
      purpose: safeText(`Compare scope, intended users, exception handling, and delivery boundaries. The current public profile describes ${services.length ? services.join(", ") : "professional services"}${audiences.length ? ` for ${audiences.join(", ")}` : ""}.`),
      evidenceRefs: [findingRef]
    },
    {
      id: "verification",
      heading: "Connect public proof to a verification checklist",
      purpose: "Bind each important claim to an accessible service page, process, case, or credential and state what remains unverified.",
      evidenceRefs: [questionRef]
    }
  ];
  const explanationEntries = zh ? [
    buildExplanation("title", "标题设计", "标题围绕买家问题，而不是企业名称。", "明确文章的核心搜索意图。", questionRef),
    buildExplanation("introduction", "答案前置", "先给出当前能够支持的采购判断。", "帮助读者和 AI 快速提取核心答案。", questionRef),
    buildExplanation("section:scenario", "业务场景", "先让读者确认文章与自己的流程有关。", "建立问题的语义上下文。", questionRef),
    buildExplanation("section:criteria", "判断标准", "把抽象选择转成可以比较的维度。", "形成清晰、可提取的决策实体。", findingRef),
    buildExplanation("section:verification", "证据核验", "区分已确认事实和仍需补充的材料。", "提高结论的可验证性。", questionRef),
    buildExplanation("faq", "相关问题", "FAQ 只覆盖相邻意图，不重复正文。", "扩展相关问法而不稀释主题。", questionRef)
  ] : [
    buildExplanation("title", "Title design", "The title centers the buyer problem rather than the organization.", "Clarifies the primary search intent.", questionRef),
    buildExplanation("introduction", "Answer first", "The opening states the decision supported by current evidence.", "Makes the core answer easy to extract.", questionRef),
    buildExplanation("section:scenario", "Operating scenario", "The first section helps readers identify their workflow.", "Builds semantic context.", questionRef),
    buildExplanation("section:criteria", "Decision criteria", "The second section turns selection into comparable dimensions.", "Creates explicit decision entities.", findingRef),
    buildExplanation("section:verification", "Evidence check", "The final section separates confirmed facts from missing proof.", "Improves verifiability.", questionRef),
    buildExplanation("faq", "Related questions", "The FAQ covers adjacent intent without repeating the body.", "Extends relevant query coverage.", questionRef)
  ];
  const value = {
    version: GEO_ARTICLE_DELIVERABLE_VERSION,
    kind: "outline" as const,
    primaryQuestionId: primary.id,
    outline: {
      workingTitle: zh ? "企业选择业务自动化方案时应核对哪些能力" : "What should buyers verify when choosing a workflow automation service?",
      readerQuestion: safeText(primary.text),
      directAnswer: safeText(directAnswer),
      plannedSections,
      evidenceToAdd: zh
        ? ["补充可公开访问的服务流程、交付案例或适用限制。"]
        : ["Add an accessible service process, delivery case, or operating limitation."],
      faqAngles: zh
        ? ["采购前应优先核对哪些公开材料？", "哪些异常情况需要保留人工复核？"]
        : ["Which public materials should buyers verify first?", "Which exceptions still require human review?"]
    },
    explanation: explanationEntries,
    fallbackReason
  };
  const parsed = parseGeoArticleDeliverable(value, authority);
  if (parsed.version !== GEO_ARTICLE_DELIVERABLE_VERSION) throw new TypeError("GEO article fallback returned a legacy value.");
  return parsed;
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
  const primary = questions[0]!;
  const primaryCard = input.answerCards[0];
  return {
    task: "Produce one evidence-grounded, publish-ready GEO article for the primary buyer question plus a separate explanation of its structure.",
    constraints: [
      "Return JSON only.",
      "Use only supplied facts and the primary buyer question.",
      "Write for a prospective buyer, not a GEO practitioner.",
      "Use 3-5 progressive body sections and 2-3 non-duplicative FAQ entries.",
      "Keep evidenceRefs structured and out of prose.",
      "Keep article prose free of report, example, prompt, input, search, source ordinal, generation, or writing-process narration.",
      "Put writing reasons only in explanation.",
      "Do not copy a complete supplied answer into a paragraph or FAQ.",
      "Do not promise rankings, recommendations, or future citations.",
      "Use only the supplied evidenceRefs."
    ],
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
    primaryQuestion: {
      id: primary.id,
      text: primary.text,
      answer: bounded(answerText(primaryCard, ""), 4_000),
      sources: primaryCard.answerMode === "generative_search_v1"
        ? primaryCard.sources.slice(0, 5).map(({ sourceId, title, citedText }) => ({ evidenceRef: `source:${sourceId}`, title, citedText: bounded(citedText ?? "", 1_200) }))
        : primaryCard.sourceEvidence.slice(0, 5).map(({ evidenceId, title, exactExcerpt }) => ({ evidenceRef: `source:${evidenceId}`, title, citedText: bounded(exactExcerpt, 1_200) }))
    },
    adjacentQuestionTexts: questions.slice(1).map(({ text }) => text),
    findings: (input.aiReport.findings ?? []).slice(0, 8).map(({ id, title, impact, recommendation }) => ({ evidenceRef: `finding:${id}`, title, impact: bounded(impact, 1_500), recommendation: bounded(recommendation, 1_500) })),
    outputShape: {
      primaryQuestionId: primary.id,
      article: {
        title: "reader problem or decision scenario",
        introduction: { text: "direct answer", evidenceRefs: ["supplied evidenceRef"] },
        sections: [{ id: "stable-section-id", heading: "reader-facing heading", paragraphs: [{ text: "substantive prose", evidenceRefs: ["supplied evidenceRef"] }] }],
        faq: [{ question: "adjacent intent", answer: { text: "distinct answer", evidenceRefs: ["supplied evidenceRef"] } }]
      },
      explanation: [{ elementId: "title | introduction | section:<id> | faq", heading: "label", reason: "business reason", geoFunction: "understanding or extraction role", evidenceRefs: ["supplied evidenceRef"] }]
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
    ? "你是面向企业买家的内容编辑。只输出JSON。只围绕primaryQuestion写一篇客户审核后可直接发布的中文文章：先回答买家问题，再用3至5个递进小节提供业务场景、判断标准、公开证据边界和执行清单，并用2至3个不重复的FAQ补充相邻意图。不得把企业服务清单、完整搜索答案或来源编号拼成正文。证据引用只能放在evidenceRefs，不得写入正文。explanation必须与article分开，按标题、导语、每个小节和FAQ解释商业目的与GEO作用。不得补充输入之外的事实，不得提及报告、示例、提示词、输入、搜索或生成过程，不得承诺排名、推荐或未来引用。"
    : "You are a buyer-facing content editor. Return JSON only. Write one customer-reviewable, publish-ready article for primaryQuestion: answer the buyer first, then use 3-5 progressive sections for the operating scenario, decision criteria, public-evidence boundary, and action checklist, followed by 2-3 non-duplicative FAQ items. Do not assemble a service catalogue, complete search answer, or provider source ordinals into the body. Keep citations only in evidenceRefs. Keep explanation separate and cover the title, introduction, every section, and FAQ with its business purpose and GEO function. Do not add facts, mention a report/example/prompt/input/search/generation process, or promise ranking, recommendation, or future citation outcomes.";
}

function assertModelArticleQuality(value: Record<string, unknown>, input: GeoArticleExampleInput): void {
  const article = objectOrEmpty(value.article);
  const title = typeof article.title === "string" ? article.title.trim() : "";
  const profileName = input.aiReport.organizationProfile.organizationName?.trim() || new URL(input.targetUrl).hostname;
  if (normalize(title).includes(normalize(profileName)) && /(?:service\s+selection|purchase\s+verification|服务选择|采购核验).*(?:guide|指南)?/iu.test(title)) {
    throw new GeoArticleQualityError("generic_target_title");
  }
  const prose = modelCustomerProse(article);
  if (prose.some((text) => /(?:来源|source)\s*\d+/iu.test(text))) throw new GeoArticleQualityError("provider_ordinal");
  const normalized = prose.map(normalize).filter(Boolean);
  if (new Set(normalized).size !== normalized.length) throw new GeoArticleQualityError("duplicate_prose");
  const completeAnswers = input.answerCards.map((card) => normalize(answerText(card, ""))).filter(Boolean);
  if (normalized.some((text) => completeAnswers.includes(text))) throw new GeoArticleQualityError("complete_answer_reuse");
}

function modelCustomerProse(article: Record<string, unknown>): string[] {
  const values: string[] = [];
  if (typeof article.title === "string") values.push(article.title);
  const introduction = objectOrEmpty(article.introduction);
  if (typeof introduction.text === "string") values.push(introduction.text);
  if (Array.isArray(article.sections)) for (const sectionValue of article.sections) {
    const section = objectOrEmpty(sectionValue);
    if (Array.isArray(section.paragraphs)) for (const paragraphValue of section.paragraphs) {
      const paragraph = objectOrEmpty(paragraphValue);
      if (typeof paragraph.text === "string") values.push(paragraph.text);
    }
  }
  if (Array.isArray(article.faq)) for (const faqValue of article.faq) {
    const faq = objectOrEmpty(faqValue);
    const answer = objectOrEmpty(faq.answer);
    if (typeof answer.text === "string") values.push(answer.text);
  }
  return values;
}

function classifyFallback(error: unknown, timedOut: boolean): GeoArticleFallbackReason {
  if (timedOut) return "timeout";
  if (error instanceof GeoArticleQualityError) return "quality_rejected";
  if (error instanceof SyntaxError) return "invalid_output";
  if (error instanceof TypeError) return "contract_rejected";
  return "provider_error";
}

class GeoArticleQualityError extends Error {}

function buildExplanation(elementId: string, heading: string, reason: string, geoFunction: string, evidenceRef: string) {
  return { elementId, heading, reason, geoFunction, evidenceRefs: [evidenceRef] };
}
function answerText(card: OpenGeoAnswerCardV3, fallback: string): string {
  if (card.answerMode === "generative_search_v1") return card.refusal?.reason || card.answerText || fallback;
  return card.sentences.filter(({ kind }) => kind !== "scope_note").map(({ text }) => text).join(" ") || fallback;
}
function cleanProviderReferences(value: string): string {
  return safeText(value
    .replace(/来源\s*\d+(?:\s*[、,，]\s*\d+)*/gu, "")
    .replace(/source\s*\d+(?:\s*[,，]\s*\d+)*/giu, ""));
}
function safeText(value: string): string {
  return bounded(value
    .replace(/<\/?[a-z][^>]*>/giu, "")
    .replace(/\[([^\]]+)\]\([^\s)]+\)/gu, "$1")
    .replace(/[*_`#]/gu, ""), 4_000) || "—";
}
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function bounded(value: string, max: number): string { return value.trim().slice(0, max); }
function objectOrEmpty(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

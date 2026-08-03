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
      heading: "服务范围与适用对象",
      paragraphs: [
        safeText(`${organization}在官网公开的服务包括${services.length ? services.join("、") : "相关专业服务"}。${audiences.length ? `主要服务对象包括${audiences.join("、")}。` : "采购前需要确认具体适用对象。"}`),
        safeText(regions.length ? `公开的市场或服务区域包括${regions.join("、")}，具体覆盖范围仍以对应服务页面和项目条件为准。` : "官网尚未清楚列出完整服务区域，采购前需要核对目的地、时效和限制条件。")
      ]
    },
    {
      id: "buyer-decision",
      heading: "买家最关心的选择问题",
      paragraphs: [safeText(answerText(input.answerCards[0], "现有公开信息表明，采购判断需要同时核对服务能力、适用条件和明确限制。"))]
    },
    {
      id: "verification",
      heading: "采购前需要核验的公开依据",
      paragraphs: ["重要服务结论需要对应到可访问的服务页、流程、案例、资质或其他公开材料，并同时说明适用条件和限制。买家可以据此核对服务是否匹配实际需求。"]
    }
  ] : [
    {
      id: "website-facts",
      heading: "Service scope and intended buyers",
      paragraphs: [
        safeText(`${organization} describes ${services.length ? services.join(", ") : "its professional services"} on its website.${audiences.length ? ` The stated audiences include ${audiences.join(", ")}.` : " Buyers should confirm the exact audience and operating conditions."}`),
        safeText(regions.length ? `The stated markets or service regions include ${regions.join(", ")}. Buyers should verify the exact coverage and constraints on the relevant service page.` : "The website does not clearly enumerate complete service regions, so buyers should verify destinations, timing, and constraints before purchase.")
      ]
    },
    {
      id: "buyer-decision",
      heading: "The buyer's primary decision question",
      paragraphs: [safeText(answerText(input.answerCards[0], "The public information supports a purchase decision only when capabilities, conditions, and limits are stated specifically."))]
    },
    {
      id: "verification",
      heading: "Public proof to verify before purchase",
      paragraphs: ["Important service claims need a corresponding service page, process, case study, credential, or other accessible proof, together with relevant conditions and limitations. Buyers can use those materials to verify whether the offer fits their needs."]
    }
  ];
  const article = {
    version: GEO_ARTICLE_EXAMPLE_VERSION,
    generationMode: "deterministic_fallback" as const,
    targetQuestionIds: questions.map(({ id }) => id),
    title: zh ? `${organization}服务选择与采购核验指南` : `${organization} service selection and purchase verification guide`,
    introduction: zh
      ? `${organization}的公开信息可以帮助买家初步判断服务范围、适用对象和采购条件。以下内容汇总当前可核验事实，并列出采购前需要进一步确认的依据。`
      : `${organization}'s public information helps buyers assess service scope, intended users, and purchase conditions. The following sections summarize the currently verifiable facts and the proof buyers should confirm before purchase.`,
    sections,
    faq: questions.map((question, index) => ({
      question: safeText(question.text),
      answer: safeText(answerText(input.answerCards[index]!, zh ? "现有公开信息不足以形成更具体的答案，采购前需要向服务方核实。" : "The available public information does not support a more specific answer; buyers should confirm it with the provider."))
    })),
    rationale: sections.map((section, index) => ({
      sectionId: section.id,
      reason: zh
        ? ["先建立网站公开事实，避免正文脱离真实业务。", "直接回应买家问题，让内容承担明确的采购决策任务。", "连接证据和限制，避免只有宣传性结论。"][index]!
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
    task: "Produce one evidence-grounded, publish-ready GEO article plus a separate rationale for each section.",
    constraints: ["Return JSON only.", "Use only supplied facts.", "Keep title, introduction, sections, and FAQ free of report, example, prompt, input, generation, or writing-process narration.", "Put writing reasons only in rationale.", "Do not promise rankings, recommendations, or future citations.", "Use only the supplied evidenceRefs."],
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
    ? "你是GEO内容编辑。只输出JSON。title、introduction、sections和faq必须组成一篇客户审核后可直接发布的中文文章，直接陈述业务事实、买家答案和可核验依据，不得提到报告、示例、提示词、输入材料、生成过程或写作方法。rationale必须与文章正文分开，仅解释各节的证据依据和商业目的。不得补充输入之外的事实，不得承诺排名、推荐或未来引用。"
    : "You are a GEO content editor. Return JSON only. title, introduction, sections, and faq must form a publish-ready customer article that directly states business facts, buyer answers, and verifiable proof without mentioning a report, example, prompt, supplied input, generation process, or writing method. Keep rationale separate from the article and use it only for each section's evidence basis and business purpose. Do not add facts or promise ranking, recommendation, or future citation outcomes.";
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

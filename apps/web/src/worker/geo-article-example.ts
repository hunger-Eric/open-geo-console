import {
  GEO_ARTICLE_DELIVERABLE_V3_VERSION,
  parseGenerativeSearchAnswerResult,
  parseGeoArticleDeliverable,
  type AiWebsiteReportV1,
  type GenerativeSearchAnswerProvider,
  type GeoArticleDeliverableV3,
  type GeoArticleFallbackReason,
  type GeoArticleResearchV3,
  type JsonCompletionClient,
  type OpenGeoAnswerCardV3
} from "@open-geo-console/ai-report-engine";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";

export interface GeoArticleExampleInput {
  readonly client: JsonCompletionClient;
  readonly researchProvider: GenerativeSearchAnswerProvider;
  readonly targetUrl: string;
  readonly locale: string;
  readonly questionSet: ConfirmedBusinessQuestionSet;
  readonly answerCards: readonly [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  readonly aiReport: AiWebsiteReportV1;
  readonly technicalReport: GeoAuditReport;
  readonly signal?: AbortSignal;
  readonly searchTimeoutMs?: number;
  readonly timeoutMs?: number;
  readonly now?: () => Date;
}

type FallbackInput = Omit<GeoArticleExampleInput, "client" | "researchProvider">;

export async function generateGeoArticleExample(input: GeoArticleExampleInput): Promise<GeoArticleDeliverableV3> {
  const title = editorialTitle(input);
  const research = await focusedResearch(input, researchQuery(input));
  const authority = articleAuthority(input, research);
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
        { role: "user", content: JSON.stringify(compactArticleInput(input, title, research, authority.evidenceRefs)) }
      ]
    });
    const raw = objectOrEmpty(result.value);
    const parsed = parseGeoArticleDeliverable({
      ...raw,
      version: GEO_ARTICLE_DELIVERABLE_V3_VERSION,
      kind: "article",
      generationMode: research.outcome === "usable" ? "model_researched" : "model_existing_evidence",
      primaryQuestionId: articleQuestions(input)[0]!.id,
      research,
      article: { ...objectOrEmpty(raw.article), title }
    }, authority);
    if (parsed.version !== GEO_ARTICLE_DELIVERABLE_V3_VERSION) throw new TypeError("GEO article generator returned a legacy value.");
    assertArticleQuality(parsed, input);
    return parsed;
  } catch (error) {
    const { client: _client, researchProvider: _researchProvider, ...fallbackInput } = input;
    void _client; void _researchProvider;
    return buildGeoArticleFallback(fallbackInput, classifyFallback(error, timedOut), research);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }
}

export function buildGeoArticleFallback(
  input: FallbackInput,
  _fallbackReason: GeoArticleFallbackReason,
  retainedResearch?: GeoArticleResearchV3
): GeoArticleDeliverableV3 {
  const zh = isChinese(input.locale);
  const now = (input.now ?? (() => new Date()))().toISOString();
  const title = editorialTitle(input);
  const primary = articleQuestions(input)[0]!;
  const facts = websiteFacts(input);
  if (facts.length < 2) throw new TypeError("A complete GEO article requires at least two verified website business facts.");
  const organization = factValue(facts, "website:organization") ?? new URL(input.targetUrl).hostname;
  const serviceFact = facts.find(({ ref }) => ref.startsWith("website:service:")) ?? facts.find(({ ref }) => ref === "website:summary") ?? facts[0]!;
  const audienceFact = facts.find(({ ref }) => ref.startsWith("website:audience:")) ?? facts.find(({ ref }) => ref !== serviceFact.ref) ?? facts[1]!;
  const questionRef = `question:${primary.id}`;
  const research = retainedResearch ?? {
    outcome: "unavailable",
    queryId: researchQuestionId(primary.id),
    query: researchQuery(input),
    providerId: "not_attempted",
    model: "not_attempted",
    searchMode: "not_attempted",
    attemptedAt: now,
    completedAt: now
  };
  const external = externalEvidence(input, research);
  const article = zh ? {
    title,
    introduction: evidenceText(
      `对于正在评估${serviceFact.value}的${audienceFact.value}，更可靠的做法是先明确业务流程、交付边界和核验依据，再判断方案是否适用。${organization}公开说明的${serviceFact.value}及其面向的${audienceFact.value}，可以作为这项判断的业务起点，但不能替代对实施条件的逐项确认。`,
      [questionRef, serviceFact.ref, audienceFact.ref]
    ),
    sections: [
      {
        id: "business-scenario",
        heading: `先把${serviceFact.value}放进实际业务流程`,
        paragraphs: [evidenceText(
          `讨论“${safeText(primary.text)}”时，首先要确认需求发生在哪个流程、由谁使用、需要连接哪些环节，以及哪些异常必须由人工处理。${organization}的公开业务信息表明其提供${serviceFact.value}；买方应据此继续核对该能力与自身流程的对应关系。`,
          [questionRef, "website:organization", serviceFact.ref]
        )]
      },
      {
        id: "delivery-boundary",
        heading: "用交付边界判断方案能否真正落地",
        paragraphs: [evidenceText(
          `对${audienceFact.value}而言，功能名称不是充分依据。更有用的核对顺序是：适用对象、输入与输出、系统或人员交接、异常处置、验收方式以及持续维护责任。只有这些边界能够被公开说明或在采购阶段确认，${serviceFact.value}才具备可执行的评估基础。`,
          [audienceFact.ref, serviceFact.ref, questionRef]
        )]
      },
      {
        id: "evidence-checklist",
        heading: "把公开事实转化为可验证的决策清单",
        paragraphs: [evidenceText(external.text, external.refs)]
      }
    ],
    faq: fallbackFaq(input, true, serviceFact, audienceFact)
  } : {
    title,
    introduction: evidenceText(
      `For ${audienceFact.value} evaluating ${serviceFact.value}, the reliable starting point is to define the operating workflow, delivery boundaries, and verifiable proof before deciding whether a solution fits. ${organization}'s published ${serviceFact.value} and stated audience provide a business-specific starting point, but buyers still need to confirm the implementation conditions.`,
      [questionRef, serviceFact.ref, audienceFact.ref]
    ),
    sections: [
      {
        id: "business-scenario",
        heading: `Put ${serviceFact.value} into the real operating workflow first`,
        paragraphs: [evidenceText(
          `The question “${safeText(primary.text)}” becomes actionable only after the buyer identifies where the need occurs, who uses the service, which handoffs are involved, and which exceptions require human control. ${organization} publicly describes ${serviceFact.value}; the next step is to map that capability to the buyer's actual workflow.`,
          [questionRef, "website:organization", serviceFact.ref]
        )]
      },
      {
        id: "delivery-boundary",
        heading: "Use delivery boundaries to test whether the solution can operate",
        paragraphs: [evidenceText(
          `For ${audienceFact.value}, a feature name is not enough. Review intended users, inputs and outputs, system and human handoffs, exception handling, acceptance criteria, and ongoing ownership. ${serviceFact.value} becomes decision-ready only when those boundaries are public or can be confirmed during evaluation.`,
          [audienceFact.ref, serviceFact.ref, questionRef]
        )]
      },
      {
        id: "evidence-checklist",
        heading: "Turn public facts into a verification checklist",
        paragraphs: [evidenceText(external.text, external.refs)]
      }
    ],
    faq: fallbackFaq(input, false, serviceFact, audienceFact)
  };
  const explanation = zh ? [
    explanationEntry("title", "标题对应真实决策", "标题同时限定目标客户、业务能力与判断任务，避免写成宽泛行业话题。", "让答案引擎识别单一搜索意图和明确实体关系。", [questionRef, serviceFact.ref, audienceFact.ref]),
    explanationEntry("introduction", "答案前置", "导语先给出决策方法，再说明企业业务事实的适用边界。", "形成可以独立抽取的直接答案。", [questionRef, serviceFact.ref, audienceFact.ref]),
    explanationEntry("section:business-scenario", "业务场景", "本节把企业能力放回买方的真实流程，而不是罗列服务。", "建立企业、能力、客户和场景之间的语义关系。", [questionRef, serviceFact.ref]),
    explanationEntry("section:delivery-boundary", "交付边界", "本节把抽象能力转换为可执行的核对维度。", "提供结构清楚、可复用的决策答案块。", [questionRef, audienceFact.ref]),
    explanationEntry("section:evidence-checklist", "证据清单", "本节区分已经公开的事实与仍需核对的条件。", "提升事实的可验证性和引用边界。", external.refs),
    explanationEntry("faq", "相邻问题", "FAQ 只补充正文尚未回答的采购意图。", "扩展相关查询覆盖，同时避免重复正文。", [questionRef, serviceFact.ref])
  ] : [
    explanationEntry("title", "A real decision in the title", "The title names the audience, capability, and decision task instead of a broad industry topic.", "Makes one search intent and the entity relationships explicit.", [questionRef, serviceFact.ref, audienceFact.ref]),
    explanationEntry("introduction", "Answer first", "The opening gives the decision method before qualifying the company facts.", "Creates a self-contained extractable answer.", [questionRef, serviceFact.ref, audienceFact.ref]),
    explanationEntry("section:business-scenario", "Operating scenario", "This section connects the capability to the buyer's workflow instead of listing services.", "Links the company, capability, audience, and scenario.", [questionRef, serviceFact.ref]),
    explanationEntry("section:delivery-boundary", "Delivery boundary", "This section turns an abstract capability into executable review criteria.", "Provides a structured decision block that can stand alone.", [questionRef, audienceFact.ref]),
    explanationEntry("section:evidence-checklist", "Evidence checklist", "This section separates published facts from conditions that still require confirmation.", "Improves verifiability and citation boundaries.", external.refs),
    explanationEntry("faq", "Adjacent intent", "The FAQ addresses buyer questions not already answered in the body.", "Extends related query coverage without duplication.", [questionRef, serviceFact.ref])
  ];
  const parsed = parseGeoArticleDeliverable({
    version: GEO_ARTICLE_DELIVERABLE_V3_VERSION,
    kind: "article",
    generationMode: "deterministic_evidence_fallback",
    primaryQuestionId: primary.id,
    research,
    article,
    explanation
  }, articleAuthority(input, research));
  if (parsed.version !== GEO_ARTICLE_DELIVERABLE_V3_VERSION) throw new TypeError("GEO article fallback returned a legacy value.");
  assertArticleQuality(parsed, input);
  return parsed;
}

async function focusedResearch(input: GeoArticleExampleInput, query: string): Promise<GeoArticleResearchV3> {
  const primary = articleQuestions(input)[0]!;
  const queryId = researchQuestionId(primary.id);
  const now = input.now ?? (() => new Date());
  const attemptedAt = now().toISOString();
  const controller = new AbortController();
  const abort = () => controller.abort(input.signal?.reason);
  input.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("GEO article research timed out.")), input.searchTimeoutMs ?? 20_000);
  try {
    const raw = await input.researchProvider.answerWithSources({
      questionId: queryId,
      question: query,
      locale: input.locale,
      region: input.questionSet.region,
      signal: controller.signal
    });
    const result = parseGenerativeSearchAnswerResult(raw, { expectedQuestionId: queryId, locale: input.locale });
    if (!result.answerText || result.refusal || !result.sources.some(({ citedText }) => Boolean(citedText?.trim()))) throw new TypeError("Focused article research returned no usable cited fact.");
    return { outcome: "usable", query, providerId: input.researchProvider.providerId, model: input.researchProvider.model, searchMode: input.researchProvider.searchMode, result };
  } catch {
    return {
      outcome: "unavailable", queryId, query,
      providerId: input.researchProvider.providerId, model: input.researchProvider.model, searchMode: input.researchProvider.searchMode,
      attemptedAt, completedAt: now().toISOString()
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abort);
  }
}

function compactArticleInput(input: GeoArticleExampleInput, title: string, research: GeoArticleResearchV3, evidenceRefs: readonly string[]): Record<string, unknown> {
  const facts = websiteFacts(input);
  return {
    task: "Write one publish-ready, business-specific GEO article for the target company's own website, plus a separate structural explanation.",
    exactTitle: title,
    constraints: [
      "Use the exactTitle unchanged and answer the primary buyer intent in the introduction before background.",
      "Make the target business, intended customer, capability, and operating scenario the organizing center.",
      "Use at least two supplied website facts and include one complete section connecting a capability to the buyer scenario.",
      "Give each section one decision job and make its heading plus first paragraph independently understandable.",
      "Keep one principal claim or decision point per paragraph; use a checklist or sequence where it improves extraction.",
      "Use focused research only as context or verification support, never as the article's organizing center.",
      "Distinguish company-published facts from external facts and preserve limitations; never invent a case, result, rank, guarantee, or superiority claim.",
      "Do not write a provider roundup, generic definition, search recap, service catalogue, sales CTA, or keyword-stuffed article.",
      "Keep evidenceRefs structured and out of prose, use only supplied evidenceRefs, and keep explanation separate from article prose.",
      "Use 3-5 progressive body sections and 2-3 direct, self-contained, non-duplicative FAQ entries."
    ],
    locale: input.locale,
    targetUrl: input.targetUrl,
    evidenceRefs,
    websiteFacts: facts,
    primaryQuestion: articleQuestionEvidence(input, 0),
    adjacentQuestions: [articleQuestionEvidence(input, 1), articleQuestionEvidence(input, 2)],
    focusedResearch: research.outcome === "usable" ? {
      query: research.query,
      answer: bounded(research.result.answerText, 4_000),
      sources: research.result.sources.filter(({ citedText }) => Boolean(citedText?.trim())).slice(0, 5).map(({ sourceId, title: sourceTitle, canonicalUrl, citedText }) => ({
        evidenceRef: `research:${sourceId}`, title: sourceTitle, canonicalUrl, citedText: bounded(citedText ?? "", 1_200)
      }))
    } : { unavailable: true },
    findings: (input.aiReport.findings ?? []).slice(0, 8).map(({ id, title: findingTitle, impact, recommendation }) => ({ evidenceRef: `finding:${id}`, title: findingTitle, impact: bounded(impact, 1_500), recommendation: bounded(recommendation, 1_500) })),
    outputShape: {
      article: {
        title: "exactTitle",
        introduction: { text: "direct, qualified answer", evidenceRefs: ["question and website facts"] },
        sections: [{ id: "stable-section-id", heading: "self-contained decision heading", paragraphs: [{ text: "one substantive claim or decision", evidenceRefs: ["supplied evidenceRefs"] }] }],
        faq: [{ question: "adjacent buyer intent", answer: { text: "direct standalone answer", evidenceRefs: ["supplied evidenceRefs"] } }]
      },
      explanation: [{ elementId: "title | introduction | section:<id> | faq", heading: "label", reason: "business reason", geoFunction: "understanding, extraction, or verification role", evidenceRefs: ["supplied evidenceRefs"] }]
    }
  };
}

function articleAuthority(input: FallbackInput | GeoArticleExampleInput, research: GeoArticleResearchV3): { locale: string; questionIds: string[]; evidenceRefs: string[] } {
  const questionIds = articleQuestions(input).map(({ id }) => id);
  return {
    locale: input.locale,
    questionIds,
    evidenceRefs: [...new Set([
      ...questionIds.map((id) => `question:${id}`),
      ...websiteFacts(input).map(({ ref }) => ref),
      ...(input.technicalReport.findings ?? []).map(({ id }) => `technical:${id}`),
      ...(input.aiReport.findings ?? []).map(({ id }) => `finding:${id}`),
      ...input.answerCards.flatMap((card) => card.answerMode === "generative_search_v1"
        ? card.sources.map(({ sourceId }) => `source:${sourceId}`)
        : card.sourceEvidence.map(({ evidenceId }) => `source:${evidenceId}`)),
      ...(research.outcome === "usable" ? research.result.sources.map(({ sourceId }) => `research:${sourceId}`) : [])
    ])]
  };
}

function websiteFacts(input: FallbackInput | GeoArticleExampleInput): Array<{ ref: string; label: string; value: string }> {
  const profile = input.aiReport.organizationProfile;
  return [
    ...(profile.organizationName?.trim() ? [{ ref: "website:organization", label: "organization", value: profile.organizationName.trim() }] : []),
    ...(profile.summary?.trim() ? [{ ref: "website:summary", label: "business summary", value: bounded(profile.summary, 1_000) }] : []),
    ...(profile.productsAndServices ?? []).slice(0, 8).map((value, index) => ({ ref: `website:service:${index}`, label: "service", value: safeText(value) })),
    ...(profile.targetAudiences ?? []).slice(0, 6).map((value, index) => ({ ref: `website:audience:${index}`, label: "audience", value: safeText(value) })),
    ...(profile.marketsAndRegions ?? []).slice(0, 6).map((value, index) => ({ ref: `website:region:${index}`, label: "region", value: safeText(value) }))
  ].filter(({ value }) => Boolean(value));
}

function articleQuestionEvidence(input: GeoArticleExampleInput, index: number): Record<string, unknown> {
  const question = articleQuestions(input)[index]!;
  const card = input.answerCards[index]!;
  return {
    id: question.id,
    text: question.text,
    answer: bounded(answerText(card, ""), 4_000),
    sources: card.answerMode === "generative_search_v1"
      ? card.sources.slice(0, 5).map(({ sourceId, title, citedText }) => ({ evidenceRef: `source:${sourceId}`, title, citedText: bounded(citedText ?? "", 1_200) }))
      : card.sourceEvidence.slice(0, 5).map(({ evidenceId, title, exactExcerpt }) => ({ evidenceRef: `source:${evidenceId}`, title, citedText: bounded(exactExcerpt, 1_200) }))
  };
}

function editorialTitle(input: FallbackInput | GeoArticleExampleInput): string {
  const zh = isChinese(input.locale);
  const facts = websiteFacts(input);
  const service = facts.find(({ ref }) => ref.startsWith("website:service:"))?.value ?? (zh ? "这项业务能力" : "this business capability");
  const subject = conciseBusinessSubject(service, zh);
  return zh
    ? `${subject}落地：先核对业务场景与交付边界`
    : bounded(`${subject}: verify operating fit and delivery boundaries`, 110);
}

function researchQuery(input: FallbackInput | GeoArticleExampleInput): string {
  const zh = isChinese(input.locale);
  const facts = websiteFacts(input);
  const service = facts.find(({ ref }) => ref.startsWith("website:service:"))?.value ?? (zh ? "这项业务能力" : "this business capability");
  const audience = facts.find(({ ref }) => ref.startsWith("website:audience:"))?.value ?? (zh ? "企业买方" : "business buyers");
  return bounded(zh
    ? `${audience}采用${service}时，如何核对业务场景、交付边界与公开证据`
    : `How ${audience} should evaluate ${service}: operating fit, delivery boundaries, and public proof`, 300);
}

function conciseBusinessSubject(value: string, zh: boolean): string {
  const clean = safeText(value).replace(/[（(][^）)]*[）)]/gu, "").split(/[，,；;：:]/u)[0]!.trim();
  if (!zh) return bounded(clean.replace(/\b(?:services?|solutions?)\b$/iu, "").trim() || "Business capability", 54);
  if (/AI.{0,8}工作流/iu.test(clean)) return "企业 AI 工作流";
  if (/业务流程自动化/iu.test(clean)) return "业务流程自动化";
  const withoutGenericEnding = clean.replace(/(?:解决方案|设计与交付服务|交付服务|服务)$/u, "").trim();
  return bounded(withoutGenericEnding || "企业业务能力", 16);
}

function fallbackFaq(input: FallbackInput, zh: boolean, service: { ref: string; value: string }, audience: { ref: string; value: string }) {
  const questions = articleQuestions(input);
  return zh ? [
    { question: safeText(questions[1]?.text || `评估${service.value}时应先核对什么？`), answer: evidenceText(`先核对${service.value}面向的对象、适用流程、输入输出和异常处理，再比较功能或供应商。这样可以避免把能力名称误当成可交付结果。`, [`question:${questions[1]?.id ?? questions[0]!.id}`, service.ref]) },
    { question: safeText(questions[2]?.text || "哪些条件仍需要在采购阶段确认？"), answer: evidenceText(`面向${audience.value}的公开信息可以说明业务方向，但具体集成条件、责任边界、验收标准和持续维护方式仍应逐项确认。`, [`question:${questions[2]?.id ?? questions[0]!.id}`, audience.ref]) }
  ] : [
    { question: safeText(questions[1]?.text || `What should buyers verify first when evaluating ${service.value}?`), answer: evidenceText(`Verify the intended users, operating workflow, inputs and outputs, and exception handling before comparing features or providers. This prevents a capability label from being mistaken for a delivered outcome.`, [`question:${questions[1]?.id ?? questions[0]!.id}`, service.ref]) },
    { question: safeText(questions[2]?.text || "Which conditions still need confirmation during procurement?"), answer: evidenceText(`Published information for ${audience.value} can establish the business direction, while integration conditions, ownership boundaries, acceptance criteria, and ongoing maintenance still require explicit confirmation.`, [`question:${questions[2]?.id ?? questions[0]!.id}`, audience.ref]) }
  ];
}

function externalEvidence(input: FallbackInput, research: GeoArticleResearchV3): { text: string; refs: string[] } {
  const zh = isChinese(input.locale);
  if (research.outcome === "usable") {
    const source = research.result.sources.find(({ citedText }) => Boolean(citedText?.trim()))!;
    const excerpt = cleanProviderReferences(source.citedText ?? "");
    return {
      text: zh
        ? `公开资料可核对到：“${excerpt}”。这项外部事实适合用于补充判断标准；最终决策仍应回到目标企业公开的服务范围、适用对象和交付边界，并逐项记录已经确认与仍待确认的内容。`
        : `A public source states: “${excerpt}”. This external fact can inform the evaluation criteria, while the final decision should still return to the target company's published scope, intended users, and delivery boundaries and record what is confirmed or still unknown.`,
      refs: [`research:${source.sourceId}`, "website:organization"]
    };
  }
  const card = input.answerCards[0];
  if (card.answerMode === "generative_search_v1") {
    const source = card.sources.find(({ citedText }) => Boolean(citedText?.trim()));
    if (!source) return websiteEvidenceOnly(input, zh);
    return {
      text: zh
        ? `现有公开依据可核对到：“${cleanProviderReferences(source.citedText ?? source.title)}”。买方可以据此建立核验清单：事实是否来自可访问页面、是否说明适用范围、是否给出交付边界，以及哪些条件仍需进一步确认。`
        : `The retained public evidence states: “${cleanProviderReferences(source.citedText ?? source.title)}”. Buyers can turn that into a checklist: whether the fact appears on an accessible page, whether its scope is clear, whether delivery boundaries are stated, and which conditions still require confirmation.`,
      refs: [`source:${source.sourceId}`, `question:${articleQuestions(input)[0]!.id}`]
    };
  }
  const source = card.sourceEvidence[0];
  if (source) return {
    text: zh
      ? `现有公开依据可核对到：“${safeText(source.exactExcerpt)}”。买方可以据此建立核验清单：事实是否来自可访问页面、是否说明适用范围、是否给出交付边界，以及哪些条件仍需进一步确认。`
      : `The retained public evidence states: “${safeText(source.exactExcerpt)}”. Buyers can turn that into a checklist: whether the fact appears on an accessible page, whether its scope is clear, whether delivery boundaries are stated, and which conditions still require confirmation.`,
    refs: [`source:${source.evidenceId}`, `question:${articleQuestions(input)[0]!.id}`]
  };
  return websiteEvidenceOnly(input, zh);
}

function websiteEvidenceOnly(input: FallbackInput, zh: boolean): { text: string; refs: string[] } {
  return {
    text: zh
      ? "当前可确认的内容仅限于目标企业已经公开的业务事实。核验时应分别记录适用对象、服务范围、交付条件和仍未公开的信息，避免把缺少证据误写成确定结论。"
      : "The confirmed basis is limited to the target company's published business facts. The verification checklist should separately record intended users, service scope, delivery conditions, and missing public information instead of turning an evidence gap into a firm conclusion.",
    refs: ["website:organization", `question:${articleQuestions(input)[0]!.id}`]
  };
}

function assertArticleQuality(deliverable: GeoArticleDeliverableV3, input: FallbackInput | GeoArticleExampleInput): void {
  if (deliverable.article.title !== editorialTitle(input)) throw new GeoArticleQualityError("title_changed");
  if (isChinese(input.locale) && deliverable.article.title.length > 36) throw new GeoArticleQualityError("title_too_long");
  const blocks = [deliverable.article.introduction, ...deliverable.article.sections.flatMap(({ paragraphs }) => paragraphs), ...deliverable.article.faq.map(({ answer }) => answer)];
  if (isChinese(input.locale) && (hanCount(deliverable.article.introduction.text) < 12 ||
      deliverable.article.sections.some(({ paragraphs }) => hanCount(paragraphs[0]!.text) < 8) ||
      deliverable.article.faq.some(({ answer }) => hanCount(answer.text) < 6))) {
    throw new GeoArticleQualityError("wrong_language");
  }
  const websiteRefs = new Set(blocks.flatMap(({ evidenceRefs }) => evidenceRefs.filter((ref) => ref.startsWith("website:"))));
  if (websiteRefs.size < 2) throw new GeoArticleQualityError("business_facts_missing");
  const primaryRef = `question:${deliverable.primaryQuestionId}`;
  if (!deliverable.article.sections.some(({ paragraphs }) => {
    const refs = paragraphs.flatMap(({ evidenceRefs }) => evidenceRefs);
    return refs.includes(primaryRef) && refs.some((ref) => ref.startsWith("website:"));
  })) throw new GeoArticleQualityError("business_scenario_missing");
  if (deliverable.generationMode === "model_researched" && !blocks.some(({ evidenceRefs }) => evidenceRefs.some((ref) => ref.startsWith("research:")))) {
    throw new GeoArticleQualityError("research_not_used");
  }
  const prose = [deliverable.article.title, ...blocks.map(({ text }) => text), ...deliverable.article.faq.map(({ question }) => question)];
  if (prose.some((text) => /(?:source|来源)\s*\d+/iu.test(text))) throw new GeoArticleQualityError("provider_ordinal");
  if (prose.some((text) => /(?:best|leading|one[- ]stop|guarantee(?:d)?|contact us|立即联系|马上咨询|行业领先|一站式|保证(?:效果|排名|收录|引用)|排名第一)/iu.test(text))) throw new GeoArticleQualityError("advertising_claim");
  if (deliverable.article.sections.some(({ paragraphs }) => /^(?:this|that|these|those|it|上述|以上|这(?:个|些|种|项))/iu.test(paragraphs[0]!.text.trim()))) {
    throw new GeoArticleQualityError("vague_answer_block");
  }
  const completeAnswers = input.answerCards.map((card) => normalize(answerText(card, ""))).filter(Boolean);
  if (prose.map(normalize).some((text) => completeAnswers.includes(text))) throw new GeoArticleQualityError("complete_answer_reuse");
  const facts = websiteFacts(input).filter(({ ref }) => websiteRefs.has(ref));
  const normalizedProse = normalize(prose.join(" "));
  if (facts.filter(({ value }) => normalizedProse.includes(normalize(value))).length < 2) throw new GeoArticleQualityError("business_facts_not_expressed");
}

function articleQuestions(input: FallbackInput | GeoArticleExampleInput): { id: string; text: string }[] {
  const canonical = toCanonicalBuyerQuestionSet(input.questionSet).questions;
  return canonical.map((question, index) => ({
    id: question.id,
    text: input.questionSet.questions[index]?.neutralPublicText || input.answerCards[index]!.exactQuestion
  }));
}

function articleSystemPrompt(locale: string): string {
  return isChinese(locale)
    ? "你是面向企业买家的资深内容编辑。只输出 JSON。文章用于目标企业自己的官网，必须以已提供的真实业务、目标客户、能力和应用场景为主轴，使用 exactTitle 并在导语先直接回答买家意图。每节只承担一个决策任务，标题和首段必须能够独立理解；关键事实绑定 evidenceRefs，外部研究只用于背景或核验，不得主导全文。正文必须自然、专业、有方法和边界，不能写成通用科普、搜索摘要、服务清单、供应商盘点或广告软文。不得虚构案例、结果、优势、排名、保证或销售行动号召。FAQ 只回答正文未覆盖的相邻意图。explanation 与 article 分开，逐项说明商业目的及理解、抽取或验证方面的 GEO 作用。"
    : "You are a senior buyer-facing content editor. Return JSON only. The article is for the target company's own website: organize it around supplied business facts, intended customers, capabilities, and operating scenarios. Use exactTitle and answer the buyer intent first. Give each section one decision job and make its heading plus opening paragraph independently understandable. Bind factual blocks to evidenceRefs; external research may support context or verification but must not organize the article. Write natural expert prose with a practical method and clear boundaries, not a generic explainer, search recap, service catalogue, provider roundup, or advertisement. Never invent cases, results, superiority, rankings, guarantees, or sales calls to action. Use FAQ only for adjacent intent not covered in the body. Keep explanation separate and explain each element's business purpose and GEO role in understanding, extraction, or verification.";
}

function explanationEntry(elementId: string, heading: string, reason: string, geoFunction: string, evidenceRefs: string[]) {
  return { elementId, heading, reason, geoFunction, evidenceRefs };
}
function evidenceText(text: string, evidenceRefs: string[]) { return { text: safeText(text), evidenceRefs: [...new Set(evidenceRefs)] }; }
function factValue(facts: ReturnType<typeof websiteFacts>, ref: string): string | undefined { return facts.find((fact) => fact.ref === ref)?.value; }
function researchQuestionId(primaryId: string): string { return bounded(`geo-article-research:${primaryId}`, 500); }
function classifyFallback(error: unknown, timedOut: boolean): GeoArticleFallbackReason {
  if (timedOut) return "timeout";
  if (error instanceof GeoArticleQualityError) return "quality_rejected";
  if (error instanceof SyntaxError) return "invalid_output";
  if (error instanceof TypeError) return "contract_rejected";
  return "provider_error";
}
class GeoArticleQualityError extends Error {}
function answerText(card: OpenGeoAnswerCardV3, fallback: string): string {
  if (card.answerMode === "generative_search_v1") return card.refusal?.reason || card.answerText || fallback;
  return card.sentences.filter(({ kind }) => kind !== "scope_note").map(({ text }) => text).join(" ") || fallback;
}
function safeText(value: string): string {
  return bounded(value.replace(/<\/?[a-z][^>]*>/giu, "").replace(/\[([^\]]+)\]\([^\s)]+\)/gu, "$1").replace(/[*_`#]/gu, ""), 4_000);
}
function cleanProviderReferences(value: string): string {
  return safeText(value.replace(/(?:source|来源)\s*\d+/giu, "公开资料").replace(/\s{2,}/gu, " "));
}
function isChinese(locale: string): boolean { return locale.toLowerCase().startsWith("zh"); }
function hanCount(value: string): number { return value.match(/[\p{Script=Han}]/gu)?.length ?? 0; }
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function bounded(value: string, max: number): string { return value.trim().slice(0, max); }
function objectOrEmpty(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

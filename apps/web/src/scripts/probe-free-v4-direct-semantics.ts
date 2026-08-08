import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AiClientError,
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  ModelTokenBudgetError,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  parseCombinedGeoReportV4,
  parseFreeV4DirectAnalysis,
  verifyFreeV4DirectAnalysisReceipt,
  verifyFreeV4DirectCoreReceipt,
  type GenerativeSearchAnswerProvider
} from "@open-geo-console/ai-report-engine";
import {
  confirmBusinessQuestionSet,
  createModelBusinessQuestionCandidates,
  toCanonicalBuyerQuestionSet
} from "@open-geo-console/public-search-observer";
import {
  buildReportV4MimoDiagnosisTokenBudget,
  ReportV4MimoProviderError,
  type ReportV4StructuredInvoker
} from "@/report-v4/mimo-provider";
import type { ReportV4MimoSiteSynthesisProvider } from "@/report-v4/mimo-site-synthesis-provider";
import { resolveProviderProfileRuntime } from "@/provider-profile/runtime";
import { renderReportV4Html } from "@/report/report-v4-html";
import { discoverSite, fetchEvidencePage } from "@/worker/crawler-runtime";
import { resolveGenerativeAnswerFirstV3 } from "@/worker/answer-first-v3";
import {
  enhanceReportV4QuestionDiagnosis,
  type ReportV4DiagnosisEnhancerInput,
  type ReportV4DiagnosisProvider
} from "@/worker/report-v4-diagnosis-enhancer";
import { selectReportV4DiagnosisTargetPages } from "@/worker/report-v4-diagnosis-target-pages";

const RESULT_FILE = "direct-semantics-receipt.json";
const REPORT_FILE = "report.html";
const TARGET_URL = "https://shun-express.com/";
const CALL_SEQUENCE = [
  "site_read",
  "page_analysis",
  "website_synthesis",
  "question_answers",
  "q1_analysis",
  "diagnoses",
  "report_render"
] as const;
export type FreeV4DirectProbeStage = typeof CALL_SEQUENCE[number];

export type FreeV4DirectProbeFailureCategory =
  | "site_access"
  | "provider_response"
  | "provider_transport"
  | "token_budget"
  | "contract"
  | "timeout_or_abort"
  | "configuration"
  | "unknown";

export interface FreeV4DirectProbeFailureClassification {
  readonly category: FreeV4DirectProbeFailureCategory;
  readonly code: string;
  readonly httpStatus: number | null;
}

export interface FreeV4DirectProbeFailureDiagnostic extends FreeV4DirectProbeFailureClassification {
  readonly stage: FreeV4DirectProbeStage;
  readonly completedStages: readonly FreeV4DirectProbeStage[];
  readonly transportRequestCount: number;
  readonly transportRequestCountByStage: Readonly<Record<FreeV4DirectProbeStage, number>>;
  readonly diagnosisFailures?: readonly FreeV4DirectDiagnosisFailureSummary[];
}

export interface FreeV4DirectDiagnosisFailureSummary {
  readonly order: 1 | 2 | 3;
  readonly questionId: string;
  readonly providerAttempts: number;
  readonly stage: string;
  readonly code: string;
  readonly parserPath: string | null;
}

export class FreeV4DirectDiagnosisContractFailure extends TypeError {
  constructor(readonly failures: readonly FreeV4DirectDiagnosisFailureSummary[]) {
    super("Real local Report V4 diagnosis did not complete for every question.");
    this.name = "FreeV4DirectDiagnosisContractFailure";
  }
}

type FreeV4DirectMissingVisibleField = "questionText" | "answer" | "selectionSummary" | "targetGap";

export class FreeV4DirectReportArtifactFailure extends TypeError {
  constructor(
    readonly code: "report_html_empty" | "report_html_missing_visible_content",
    readonly questionOrder: 1 | 2 | 3 | null,
    readonly missingFields: readonly FreeV4DirectMissingVisibleField[]
  ) {
    super("Real local Report V4 HTML did not satisfy its visible-content contract.");
    this.name = "FreeV4DirectReportArtifactFailure";
  }
}

export class FreeV4DirectProbeFailure extends Error {
  constructor(
    readonly stage: FreeV4DirectProbeStage,
    readonly diagnostic?: FreeV4DirectProbeFailureDiagnostic
  ) {
    super(`Free Direct probe failed during ${stage}.`);
    this.name = "FreeV4DirectProbeFailure";
  }
}

export function classifyFreeV4DirectProbeFailure(error: unknown): FreeV4DirectProbeFailureClassification {
  if (error instanceof ModelTokenBudgetError) {
    return { category: "token_budget", code: error.code, httpStatus: null };
  }
  if (error instanceof AiClientError) {
    const httpStatus = safeHttpStatus(error.status);
    if (error.code === "timeout" || error.code === "aborted") {
      return { category: "timeout_or_abort", code: error.code, httpStatus };
    }
    if (error.code === "configuration") {
      return { category: "configuration", code: error.code, httpStatus };
    }
    if (["invalid_json", "non_json_response", "invalid_response", "empty_content", "output_truncated"].includes(error.code)) {
      return { category: "provider_response", code: error.code, httpStatus };
    }
    return { category: "provider_transport", code: error.code, httpStatus };
  }
  if (error instanceof ReportV4MimoProviderError) {
    if (error.code === "mimo_timeout") {
      return { category: "timeout_or_abort", code: error.code, httpStatus: null };
    }
    if (error.code === "configuration") {
      return { category: "configuration", code: error.code, httpStatus: null };
    }
    if (["mimo_invalid_response", "mimo_output_truncated", "mimo_content_filtered"].includes(error.code)) {
      return { category: "provider_response", code: error.code, httpStatus: null };
    }
    return { category: "provider_transport", code: error.code, httpStatus: null };
  }
  if (error instanceof FreeV4DirectDiagnosisContractFailure) {
    return { category: "contract", code: "diagnosis_incomplete", httpStatus: null };
  }
  if (error instanceof FreeV4DirectReportArtifactFailure) {
    return { category: "contract", code: error.code, httpStatus: null };
  }
  if (error instanceof TypeError) {
    return { category: "contract", code: "invalid_analysis_contract", httpStatus: null };
  }
  if (error && typeof error === "object" && "name" in error && error.name === "UrlSafetyError") {
    const code = "code" in error && typeof error.code === "string" ? error.code : "url_safety_error";
    return { category: "site_access", code, httpStatus: null };
  }
  const name = error && typeof error === "object" && "name" in error && typeof error.name === "string"
    ? error.name
    : "";
  if (name === "TimeoutError") {
    return { category: "timeout_or_abort", code: "timeout", httpStatus: null };
  }
  if (name === "AbortError") {
    return { category: "timeout_or_abort", code: "aborted", httpStatus: null };
  }
  return { category: "unknown", code: "unclassified", httpStatus: null };
}

function safeHttpStatus(value: number | undefined): number | null {
  return Number.isInteger(value) && value! >= 100 && value! <= 599 ? value! : null;
}

function sha(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return createHash("sha256").update(text).digest("hex");
}

function htmlVisibleText(html: string): string {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"')
    .replace(/&#x27;|&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function countTransportRequestsByStage(
  calls: readonly { stage: FreeV4DirectProbeStage }[]
): Readonly<Record<FreeV4DirectProbeStage, number>> {
  return Object.freeze(Object.fromEntries(CALL_SEQUENCE.map((stage) => [
    stage,
    calls.filter((call) => call.stage === stage).length
  ]))) as Readonly<Record<FreeV4DirectProbeStage, number>>;
}

const PROFILE = {
  organizationName: "凌顺速递", brandNames: ["凌顺速递", "凌顺国际物流"], legalEntity: "深圳市凌顺国际物流有限公司", domain: "shun-express.com",
  businessModel: "跨境物流、国际集运、仓储和海外末端派送服务",
  productsAndServices: ["台湾海运和空运专线", "菲律宾双清专线", "国际集运", "跨境仓储", "海外末端派送"],
  capabilities: ["集货与仓储", "订舱与报关", "跨境运输", "海外清关", "物流轨迹追踪"],
  targetAudiences: ["需要从中国发货至台湾、菲律宾、中东等市场的跨境卖家和买家"],
  marketsAndRegions: ["中国大陆", "台湾", "菲律宾", "阿联酋", "沙特阿拉伯"],
  summary: "总部位于深圳的跨境物流服务商，提供国际集运、专线运输、仓储、清关和末端派送。",
  confidence: "high" as const,
  evidence: [{ url: "https://shun-express.com/", quote: "提供全球化便捷式跨境物流仓配一体化的海外综合服务平台。" }]
};

const MODEL_QUESTION_OUTPUT = {
  questions: [
    { purpose: "core_service_discovery", text: "哪些服务商提供跨境物流、国际集运和海外末端派送服务？" },
    { purpose: "customer_region_fit", text: "哪些跨境物流方案适合需要从中国发往台湾、菲律宾和中东市场的买家？" },
    { purpose: "purchase_delivery_risk", text: "采购跨境物流服务前，买家应核验哪些清关、交付和货运追踪风险？" }
  ]
} as const;

export function createFreeV4DirectProbeQuestionSet(confirmedAt: Date = new Date()) {
  const candidates = createModelBusinessQuestionCandidates({
    locale: "zh-CN",
    region: "CN",
    profile: PROFILE,
    modelOutput: MODEL_QUESTION_OUTPUT
  });
  return confirmBusinessQuestionSet({
    candidates,
    finalTexts: candidates.questions.map(({ neutralPublicText }) => neutralPublicText),
    acknowledgedLowConfidence: false,
    confirmedAt: confirmedAt.toISOString()
  });
}

export interface FreeV4DirectProbeDependencies {
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  resolveRuntime?: typeof resolveProviderProfileRuntime;
  structuredInvoker?: Pick<ReportV4StructuredInvoker, "invoke">;
  answerProvider?: GenerativeSearchAnswerProvider;
  siteSynthesisProvider?: Pick<ReportV4MimoSiteSynthesisProvider, "analyzePage" | "synthesizeWebsite">;
  diagnosisProvider?: ReportV4DiagnosisProvider;
  getDiagnosisTokenBudget?: ReportV4DiagnosisEnhancerInput["getTokenBudget"];
  discoverSite?: typeof discoverSite;
  fetchEvidencePage?: typeof fetchEvidencePage;
  selectDiagnosisTargetPages?: typeof selectReportV4DiagnosisTargetPages;
}

export async function runFreeV4DirectSemanticsProbe(input: {
  outputDirectory?: string;
  now?: () => Date;
  dependencies?: FreeV4DirectProbeDependencies;
} = {}) {
  const now = input.now ?? (() => new Date());
  const outputDirectory = input.outputDirectory ? resolve(input.outputDirectory) : null;
  const environment = input.dependencies?.environment ?? process.env;
  const transportCalls: Array<{ stage: FreeV4DirectProbeStage; endpoint: string }> = [];
  let activeStage: FreeV4DirectProbeStage = "site_read";
  const baseFetch = input.dependencies?.fetch ?? globalThis.fetch;
  if (typeof baseFetch !== "function") throw new Error("A fetch implementation is required for the live Direct probe.");
  const guardedFetch: typeof fetch = async (resource, init) => {
    const endpoint = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
    transportCalls.push({ stage: activeStage, endpoint: new URL(endpoint).origin });
    return baseFetch(resource, init);
  };
  const completedStages: FreeV4DirectProbeStage[] = [];
  let persistedPageSummary: unknown = null;
  let persistedAnswerResults: unknown = null;
  let persistedWebsiteSynthesis: unknown = null;
  let persistedCoreReport: unknown = null;
  let persistedDiagnosisResults: unknown = null;
  let persistedReport: unknown = null;
  const persist = async (value: unknown) => {
    if (!outputDirectory) return;
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(resolve(outputDirectory, RESULT_FILE), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  await persist({ version: FREE_V4_DIRECT_SEMANTICS_VERSION, status: "running", generatedAt: now().toISOString(), callSequence: CALL_SEQUENCE, completedStages });

  try {
    const needsRuntime = !input.dependencies?.answerProvider
      || !input.dependencies?.structuredInvoker
      || !input.dependencies?.siteSynthesisProvider
      || !input.dependencies?.diagnosisProvider;
    const runtime = needsRuntime
      ? (input.dependencies?.resolveRuntime ?? resolveProviderProfileRuntime)(environment, { fetch: guardedFetch, now })
      : null;
    const confirmed = createFreeV4DirectProbeQuestionSet(now());
    const questions = confirmed.questions.map(({ neutralPublicText }) => neutralPublicText);
    const canonicalQuestions = toCanonicalBuyerQuestionSet(confirmed).questions;
    const signal = AbortSignal.timeout(900_000);

    activeStage = "site_read";
    const discovered = await (input.dependencies?.discoverSite ?? discoverSite)(TARGET_URL, "free");
    const fetched = await (input.dependencies?.fetchEvidencePage ?? fetchEvidencePage)({
      url: discovered.targetUrl,
      pageType: "home",
      priority: 100,
      reason: "Real local Report V4 homepage acceptance."
    }, discovered.robotsPolicy, signal);
    completedStages.push("site_read");

    const siteSynthesisProvider = input.dependencies?.siteSynthesisProvider
      ?? runtime!.createSiteSynthesisProvider();
    activeStage = "page_analysis";
    const pageSummary = await siteSynthesisProvider.analyzePage({
      context: {
        pageId: "submitted-homepage",
        url: fetched.page.url,
        contentHash: fetched.contentHash,
        readability: fetched.browserRendered ? "js_dependent" : "direct_readable",
        sourceLength: fetched.page.text.length
      },
      retainedText: fetched.page.text
    }, signal);
    persistedPageSummary = pageSummary;
    completedStages.push("page_analysis");

    activeStage = "website_synthesis";
    const websiteSynthesis = await siteSynthesisProvider.synthesizeWebsite({
      targetUrl: discovered.targetUrl,
      locale: "zh-CN",
      pages: [pageSummary]
    }, signal);
    persistedWebsiteSynthesis = websiteSynthesis;
    completedStages.push("website_synthesis");

    const answerProvider = input.dependencies?.answerProvider ?? runtime!.createQuestionAnswerProvider({
      locale: "zh-CN",
      region: "CN"
    });
    activeStage = "question_answers";
    const answerResolution = await resolveGenerativeAnswerFirstV3({
      questionSet: confirmed,
      provider: answerProvider,
      locale: "zh-CN",
      region: "CN",
      targetUrl: discovered.targetUrl,
      targetAliases: confirmed.identityExclusions,
      semanticValidation: "free_direct",
      now,
      signal
    });
    const answerResults = answerResolution.checkpoint.answerResults;
    const answerCards = answerResolution.answerCards;
    persistedAnswerResults = answerResults.map((result) => ({
      questionId: result.questionId,
      answerText: result.answerText,
      refusal: result.refusal,
      sources: result.sources,
      searchedAt: result.searchedAt,
      completedAt: result.completedAt
    }));
    if (answerCards.some((card) => card.refusal || !card.answerText.trim())) {
      throw new TypeError("Real local Report V4 acceptance requires all three buyer questions to be answered.");
    }
    completedStages.push("question_answers");

    const answerResult = answerResults[0];

    const sourceAliases = answerResult.sources.map((source, index) => ({
      handle: `S${index + 1}`, title: source.title, url: source.canonicalUrl, citedText: source.citedText
    }));
    const targetAliases = [{
      handle: "T1", url: discovered.targetUrl,
      summary: pageSummary.chunks.map(({ summary }) => summary).join(" ")
    }];
    const handleBindings = [
      ...answerResult.sources.map((source, index) => ({ handle: `S${index + 1}`, evidenceRef: source.sourceId })),
      { handle: "T1", evidenceRef: "submitted-homepage-summary" }
    ];
    const structuredInvoker = input.dependencies?.structuredInvoker ?? runtime!.createStructuredInvoker();
    activeStage = "q1_analysis";
    const rawAnalysis = await structuredInvoker.invoke({
      operation: "sourceDiagnosis",
      systemText: "Analyze the unchanged answer or refusal and supplied S/T evidence aliases. targetIdentity is authoritative: when naming the submitted target, use targetIdentity.canonicalName exactly and do not translate, abbreviate, or invent another target name; its aliases and domain identify the same target. Return one JSON object with summary, observations, recommendations, and evidenceHandles. Lists may contain any appropriate number of items, including zero. Extra fields are ignored. Do not browse or invent evidence handles. List every S/T handle actually relied on. T pages are unassessed candidates: do not recommend adding the target merely because T exists.",
      inputText: JSON.stringify({
        locale: "zh-CN", question: questions[0],
        answer: { answerText: answerResult.answerText, refusal: answerResult.refusal },
        answerSources: sourceAliases,
        targetIdentity: {
          canonicalName: PROFILE.organizationName,
          aliases: [PROFILE.organizationName, ...PROFILE.brandNames.filter((name) => name !== PROFILE.organizationName), PROFILE.legalEntity],
          domain: PROFILE.domain
        },
        submittedSitePages: targetAliases
      }),
      signal
    });
    const analysis = parseFreeV4DirectAnalysis(rawAnalysis, {
      allowedEvidenceHandles: handleBindings.map(({ handle }) => handle)
    });
    completedStages.push("q1_analysis");
    const probeId = randomUUID();
    const coreInput = {
      questionSetIdentity: confirmed.contentHash,
      questions,
      questionId: canonicalQuestions[0]!.id,
      questionText: questions[0]!,
      answer: answerResult,
      sources: answerResult.sources,
      providerResponseId: answerResult.providerResponseId,
      providerId: answerProvider.providerId,
      model: answerProvider.model,
      searchMode: answerProvider.searchMode,
      searchedAt: answerResult.searchedAt,
      completedAt: answerResult.completedAt,
      nonProseProjection: { probeId, callSequence: CALL_SEQUENCE }
    } as const;
    const coreReceipt = createFreeV4DirectCoreReceipt(coreInput);
    verifyFreeV4DirectCoreReceipt(coreReceipt, coreInput);
    const analysisInput = {
      coreReceiptHash: coreReceipt.receiptHash,
      analysis,
      handleBindings,
      nonProseProjection: { probeId, analysisStatus: "completed" }
    } as const;
    const analysisReceipt = createFreeV4DirectAnalysisReceipt(analysisInput);
    verifyFreeV4DirectAnalysisReceipt(analysisReceipt, analysisInput);

    const coreQuestions = answerCards.map((card, index) => ({
      order: (index + 1) as 1 | 2 | 3,
      questionId: card.questionId,
      questionText: card.exactQuestion,
      status: "answered" as const,
      answer: card.answerText,
      sources: card.sources.slice(0, 5).map((source) => ({
        questionId: card.questionId,
        sourceId: `q${index + 1}-${sha({ sourceId: source.sourceId, canonicalUrl: source.canonicalUrl }).slice(0, 32)}`,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        citedText: source.citedText,
        retrievalStatus: "not_checked" as const
      }))
    }));
    const coreReport = parseCombinedGeoReportV4({
      version: 4,
      artifactContract: "combined_geo_report_v4",
      reportId: `local-report-${probeId}`,
      artifactRevisionId: `local-artifact-${probeId}`,
      targetUrl: discovered.targetUrl,
      locale: "zh-CN",
      generatedAt: now().toISOString(),
      status: "completed",
      websiteSynthesis: { status: "available", ...websiteSynthesis },
      pageCoverage: {
        counts: { total: 1, analyzed: 1, crawlUnavailable: 0, excluded: 0, analysisUnavailable: 0 },
        pages: [{
          ordinal: 1,
          pageId: pageSummary.pageId,
          url: pageSummary.url,
          status: "analyzed",
          readMode: pageSummary.readability,
          reasonCode: null
        }]
      },
      questions: coreQuestions
    });
    persistedCoreReport = coreReport;

    const sourceLocations = pageSummary.chunks.flatMap(({ sourceLocations }) => sourceLocations);
    if (sourceLocations.length === 0) {
      throw new TypeError("Real homepage analysis produced no source locations for diagnosis.");
    }
    const diagnosisProvider = input.dependencies?.diagnosisProvider ?? runtime!.createDiagnosisProvider();
    const getDiagnosisTokenBudget = input.dependencies?.getDiagnosisTokenBudget
      ?? ((request: Parameters<ReportV4DiagnosisEnhancerInput["getTokenBudget"]>[0]) => {
        if (!runtime) throw new Error("The real diagnosis token budget requires the resolved provider runtime.");
        return buildReportV4MimoDiagnosisTokenBudget({ runtime: runtime.modelRuntime, request });
      });
    activeStage = "diagnoses";
    const selectDiagnosisTargetPages = input.dependencies?.selectDiagnosisTargetPages
      ?? selectReportV4DiagnosisTargetPages;
    const diagnosisResults = await Promise.all(coreReport.questions.map((question) => {
      const targetPages = selectDiagnosisTargetPages({
        questionId: question.questionId,
        question: question.questionText,
        answer: question.answer ?? "",
        pages: [pageSummary]
      });
      return enhanceReportV4QuestionDiagnosis({
        question,
        locale: "zh-CN",
        targetPages,
        provider: diagnosisProvider,
        getTokenBudget: getDiagnosisTokenBudget,
        signal,
        semanticValidation: "deferred"
      });
    }));
    if (diagnosisResults.some((result) => result.status !== "completed")) {
      const failures = diagnosisResults.flatMap((result, index): readonly FreeV4DirectDiagnosisFailureSummary[] => (
        result.status === "failed" ? [Object.freeze({
          order: (index + 1) as 1 | 2 | 3,
          questionId: result.question.questionId,
          providerAttempts: result.providerAttempts,
          stage: result.failure.stage,
          code: result.failure.code,
          parserPath: result.failure.parserPath
        })] : []
      ));
      throw new FreeV4DirectDiagnosisContractFailure(Object.freeze(failures));
    }
    persistedDiagnosisResults = diagnosisResults;
    completedStages.push("diagnoses");

    const report = parseCombinedGeoReportV4({
      ...coreReport,
      questions: coreReport.questions.map((question, index) => ({
        ...question,
        diagnosis: diagnosisResults[index]!.status === "completed"
          ? diagnosisResults[index]!.diagnosis
          : undefined
      }))
    });
    persistedReport = report;
    activeStage = "report_render";
    const html = await renderReportV4Html({ stage: "enhancement", report, signal });
    if (!html.trim()) throw new FreeV4DirectReportArtifactFailure("report_html_empty", null, []);
    const visibleText = htmlVisibleText(html);
    for (const question of report.questions) {
      const visibleFields: Readonly<Record<FreeV4DirectMissingVisibleField, string>> = {
        questionText: question.questionText,
        answer: question.answer ?? "",
        selectionSummary: question.diagnosis!.selectionSummary,
        targetGap: question.diagnosis!.targetGap
      };
      const missingFields = (Object.entries(visibleFields) as Array<[FreeV4DirectMissingVisibleField, string]>)
        .filter(([, value]) => !visibleText.includes(value))
        .map(([field]) => field);
      if (missingFields.length > 0) {
        throw new FreeV4DirectReportArtifactFailure(
          "report_html_missing_visible_content",
          question.order,
          Object.freeze(missingFields)
        );
      }
    }
    const htmlSha256 = sha(html);
    if (outputDirectory) await writeFile(resolve(outputDirectory, REPORT_FILE), html, "utf8");
    completedStages.push("report_render");
    const diagnosisProviderAttempts = diagnosisResults.reduce((total, result) => total + result.providerAttempts, 0);

    const result = {
      version: FREE_V4_DIRECT_SEMANTICS_VERSION,
      status: "passed" as const,
      generatedAt: now().toISOString(),
      callSequence: CALL_SEQUENCE,
      completedStages,
      modelCallCount: 2 + answerCards.length + 1 + diagnosisProviderAttempts,
      transportRequestCount: transportCalls.length,
      transportRequestCountByStage: countTransportRequestsByStage(transportCalls),
      providerProfile: runtime?.summary ?? null,
      answerProvider: {
        providerId: answerProvider.providerId,
        model: answerProvider.model,
        searchMode: answerProvider.searchMode
      },
      globalReviewCallCount: 0,
      questions,
      site: {
        targetUrl: discovered.targetUrl,
        homepageUrl: fetched.page.url,
        homepageContentHash: fetched.contentHash,
        browserRendered: fetched.browserRendered,
        analyzedChunkCount: pageSummary.chunks.length,
        dnsResolverMode: environment.OGC_PUBLIC_DNS_DOH_URL?.trim() ? "configured_doh" : "system"
      },
      answers: report.questions.map(({ order, questionId, questionText, answer: answerText, sources }) => ({
        order, questionId, questionText, status: "answered" as const, answerText, sources
      })),
      q1: { status: answerResult.refusal ? "refused" : "answered", answerText: answerResult.answerText, refusal: answerResult.refusal, sources: answerResult.sources },
      analysis,
      handleBindings,
      diagnoses: report.questions.map(({ order, questionId, diagnosis }) => ({
        order, questionId, status: "completed" as const, diagnosis
      })),
      report,
      reportArtifact: {
        file: REPORT_FILE,
        htmlSha256,
        htmlBytes: Buffer.byteLength(html, "utf8")
      },
      checkoutAvailable: true,
      coreReceipt,
      analysisReceipt
    };
    await persist(result);
    return result;
  } catch (error) {
    const diagnostic: FreeV4DirectProbeFailureDiagnostic = Object.freeze({
      stage: activeStage,
      ...classifyFreeV4DirectProbeFailure(error),
      completedStages: Object.freeze([...completedStages]),
      transportRequestCount: transportCalls.length,
      transportRequestCountByStage: countTransportRequestsByStage(transportCalls),
      ...(error instanceof FreeV4DirectDiagnosisContractFailure
        ? { diagnosisFailures: error.failures }
        : {}),
      ...(error instanceof FreeV4DirectReportArtifactFailure
        ? { reportArtifactFailure: {
            questionOrder: error.questionOrder,
            missingFields: error.missingFields
          } }
        : {})
    });
    const failure = new FreeV4DirectProbeFailure(activeStage, diagnostic);
    const intermediate = {
      ...(persistedPageSummary ? { pageSummary: persistedPageSummary } : {}),
      ...(persistedAnswerResults ? { answerResults: persistedAnswerResults } : {}),
      ...(persistedWebsiteSynthesis ? { websiteSynthesis: persistedWebsiteSynthesis } : {}),
      ...(persistedCoreReport ? { coreReport: persistedCoreReport } : {}),
      ...(persistedDiagnosisResults ? { diagnosisResults: persistedDiagnosisResults } : {}),
      ...(persistedReport ? { report: persistedReport } : {})
    };
    await persist({
      version: FREE_V4_DIRECT_SEMANTICS_VERSION, status: "failed", generatedAt: now().toISOString(),
      failure: diagnostic,
      ...(Object.keys(intermediate).length > 0 ? { intermediate } : {})
    });
    throw failure;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.includes("--system-dns")) delete process.env.OGC_PUBLIC_DNS_DOH_URL;
  const outputFlag = process.argv.indexOf("--output");
  const configuredOutput = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
  const outputDirectory = configuredOutput ?? resolve(
    ".data", "test-runs", "free-v4-direct-real",
    `direct-${new Date().toISOString().replace(/[-:.TZ]/gu, "")}-${randomUUID().slice(0, 8)}`
  );
  runFreeV4DirectSemanticsProbe({ outputDirectory })
    .then((result) => process.stdout.write(`${JSON.stringify({ status: result.status, outputDirectory, modelCallCount: result.modelCallCount })}\n`))
    .catch((error) => {
      if (error instanceof FreeV4DirectProbeFailure && error.diagnostic) {
        process.stdout.write(`${JSON.stringify({ status: "failed", ...error.diagnostic })}\n`);
      }
      process.exitCode = 1;
    });
}

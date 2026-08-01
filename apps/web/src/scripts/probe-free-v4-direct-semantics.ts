import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  parseFreeV4DirectAnalysis,
  parseGenerativeSearchAnswerResult,
  verifyFreeV4DirectAnalysisReceipt,
  verifyFreeV4DirectCoreReceipt,
  type GenerativeSearchAnswerProvider
} from "@open-geo-console/ai-report-engine";
import {
  confirmBusinessQuestionSet,
  generateBusinessQuestionCandidates,
  toCanonicalBuyerQuestionSet
} from "@open-geo-console/public-search-observer";
import {
  createReportV4MimoStructuredInvoker,
  type ReportV4MimoStructuredInvoker
} from "@/report-v4/mimo-provider";
import { loadReportV4ModelRuntimeConfig } from "@/report-v4/model-runtime-config";
import { resolveGenerativeSearchAnswerProvider } from "@/public-source-forensics/production-runtime";

const RESULT_FILE = "direct-semantics-receipt.json";
const CALL_SEQUENCE = ["q1_answer", "analysis"] as const;
type ProbeStage = typeof CALL_SEQUENCE[number];

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

export interface FreeV4DirectProbeDependencies {
  environment?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  structuredInvoker?: Pick<ReportV4MimoStructuredInvoker, "invoke">;
  answerProvider?: GenerativeSearchAnswerProvider;
}

export async function runFreeV4DirectSemanticsProbe(input: {
  outputDirectory?: string;
  now?: () => Date;
  dependencies?: FreeV4DirectProbeDependencies;
} = {}) {
  const now = input.now ?? (() => new Date());
  const outputDirectory = input.outputDirectory ? resolve(input.outputDirectory) : null;
  const environment = input.dependencies?.environment ?? process.env;
  const injected = Boolean(input.dependencies?.structuredInvoker || input.dependencies?.answerProvider);
  const transportCalls: Array<{ stage: ProbeStage; endpoint: string }> = [];
  let activeStage: ProbeStage = "q1_answer";
  const baseFetch = input.dependencies?.fetch ?? globalThis.fetch;
  if (typeof baseFetch !== "function") throw new Error("A fetch implementation is required for the live Direct probe.");
  const guardedFetch: typeof fetch = async (resource, init) => {
    if (transportCalls.length >= 2) throw new Error("Free Direct probe rejected a request beyond its two-call budget.");
    const endpoint = typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url;
    transportCalls.push({ stage: activeStage, endpoint: new URL(endpoint).origin });
    return baseFetch(resource, init);
  };
  const completedStages: ProbeStage[] = [];
  const persist = async (value: unknown) => {
    if (!outputDirectory) return;
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(resolve(outputDirectory, RESULT_FILE), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  };
  await persist({ version: FREE_V4_DIRECT_SEMANTICS_VERSION, status: "running", generatedAt: now().toISOString(), callSequence: CALL_SEQUENCE, completedStages });

  try {
    const candidates = generateBusinessQuestionCandidates({ locale: "zh-CN", region: "CN", profile: PROFILE });
    const confirmed = confirmBusinessQuestionSet({
      candidates,
      finalTexts: candidates.questions.map(({ neutralPublicText }) => neutralPublicText),
      acknowledgedLowConfidence: false,
      confirmedAt: now().toISOString()
    });
    const questions = confirmed.questions.map(({ neutralPublicText }) => neutralPublicText);
    const canonicalQ1 = toCanonicalBuyerQuestionSet(confirmed).questions[0]!;
    const answerProvider = input.dependencies?.answerProvider ?? resolveGenerativeSearchAnswerProvider(
      environment, { locale: "zh-CN", region: "CN" }, { fetch: guardedFetch, now }
    );
    activeStage = "q1_answer";
    const answerResult = parseGenerativeSearchAnswerResult(await answerProvider.answerWithSources({
      questionId: canonicalQ1.id,
      question: questions[0]!,
      locale: "zh-CN",
      region: "CN",
      signal: AbortSignal.timeout(180_000),
      semanticValidation: "free_direct"
    }), { expectedQuestionId: canonicalQ1.id, locale: "zh-CN", semanticValidation: "free_direct" });
    completedStages.push("q1_answer");

    const sourceAliases = answerResult.sources.map((source, index) => ({
      handle: `S${index + 1}`, title: source.title, url: source.canonicalUrl, citedText: source.citedText
    }));
    const targetAliases = [{
      handle: "T1", url: "https://shun-express.com/",
      summary: "未经分析的提交网站候选页，介绍国际集运、跨境专线、仓储、清关和海外末端派送服务。"
    }];
    const handleBindings = [
      ...answerResult.sources.map((source, index) => ({ handle: `S${index + 1}`, evidenceRef: source.sourceId })),
      { handle: "T1", evidenceRef: "submitted-site-summary" }
    ];
    const structuredInvoker = input.dependencies?.structuredInvoker ?? createReportV4MimoStructuredInvoker({
      environment,
      lockedRuntime: loadReportV4ModelRuntimeConfig(environment),
      fetch: guardedFetch
    });
    activeStage = "analysis";
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
      signal: AbortSignal.timeout(180_000)
    });
    const analysis = parseFreeV4DirectAnalysis(rawAnalysis, {
      allowedEvidenceHandles: handleBindings.map(({ handle }) => handle)
    });
    completedStages.push("analysis");
    if (!injected && transportCalls.length !== 2) {
      throw new Error(`Free Direct probe expected exactly 2 external requests, observed ${transportCalls.length}.`);
    }

    const probeId = randomUUID();
    const coreInput = {
      questionSetIdentity: confirmed.contentHash,
      questions,
      questionId: canonicalQ1.id,
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
    const result = {
      version: FREE_V4_DIRECT_SEMANTICS_VERSION,
      status: "passed" as const,
      generatedAt: now().toISOString(),
      callSequence: CALL_SEQUENCE,
      completedStages,
      modelCallCount: 2,
      transportRequestCount: injected ? null : transportCalls.length,
      transportCalls,
      globalReviewCallCount: 0,
      questions,
      q1: { status: answerResult.refusal ? "refused" : "answered", answerText: answerResult.answerText, refusal: answerResult.refusal, sources: answerResult.sources },
      analysis,
      handleBindings,
      checkoutAvailable: true,
      coreReceipt,
      analysisReceipt
    };
    await persist(result);
    return result;
  } catch (error) {
    await persist({
      version: FREE_V4_DIRECT_SEMANTICS_VERSION, status: "failed", generatedAt: now().toISOString(),
      failedStage: activeStage, completedStages, modelCallCount: transportCalls.length, transportCalls,
      error: error instanceof Error ? { name: error.name, message: error.message } : { name: "Error", message: "Unknown failure" }
    });
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputFlag = process.argv.indexOf("--output");
  const configuredOutput = outputFlag >= 0 ? process.argv[outputFlag + 1] : undefined;
  const outputDirectory = configuredOutput ?? resolve(
    ".data", "test-runs", "free-v4-direct-real",
    `direct-${new Date().toISOString().replace(/[-:.TZ]/gu, "")}-${randomUUID().slice(0, 8)}`
  );
  runFreeV4DirectSemanticsProbe({ outputDirectory })
    .then((result) => process.stdout.write(`${JSON.stringify({ status: result.status, outputDirectory, modelCallCount: result.modelCallCount })}\n`))
    .catch(() => { process.exitCode = 1; });
}

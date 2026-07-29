import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPORT_SEMANTIC_REVIEW_CONTRACT, applyReportSemanticReview, buildFreeV4ReportSemanticReviewSystemPrompt, createReportSemanticReviewInput, parseReportSemanticReviewOutput, parseReportV4DiagnosisInput, verifyReportSemanticReviewReceipt, type ReportSemanticReviewInput, type ReportSemanticReviewInputCore, type ReportSemanticReviewOutput } from "@open-geo-console/ai-report-engine";
import { createMarketSnapshotIdentity, deterministicId, toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet, type SearchQueryFanout } from "@open-geo-console/public-search-observer";
import { combinedV3ArtifactFixture } from "@/components/combined-artifact-fixtures";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  confirm: vi.fn(),
  getConfirmed: vi.fn(),
  resolveRuntime: vi.fn(),
  answerWithSources: vi.fn(),
  fanouts: vi.fn(),
  resolveSnapshot: vi.fn(),
  enhanceDiagnosis: vi.fn(),
  diagnosisProvider: vi.fn(() => ({ id: "diagnosis-provider" })),
  diagnosisBudget: vi.fn(() => ({ maxInputTokens: 1000, maxOutputTokens: 1000 })),
  modelRuntime: vi.fn(() => ({ modelProfile: { operations: { websiteSynthesis: { model: "fixture-review-model" } } } })),
  getMarketSnapshotBundle: vi.fn(),
  semanticInvoke: vi.fn(),
  structuredInvoker: vi.fn()
}));

vi.mock("@/db/business-questions", () => ({
  prepareBusinessQuestionCandidates: mocks.prepare,
  confirmBusinessQuestions: mocks.confirm,
  getConfirmedBusinessQuestionSet: mocks.getConfirmed
}));
vi.mock("@/db/public-search-authority", () => ({ getActivePublicSearchSurfaceAuthority: vi.fn() }));
vi.mock("@/db/market-snapshots", () => ({ getMarketSnapshotBundle: mocks.getMarketSnapshotBundle }));
vi.mock("@/public-source-forensics/production-runtime", () => ({
  resolveProductionPublicSearchRuntime: mocks.resolveRuntime,
  resolveGenerativeSearchAnswerProvider: () => ({
    providerId: "fixture",
    model: "fixture-model",
    searchMode: "native_web_search",
    answerWithSources: mocks.answerWithSources
  })
}));
vi.mock("@/report-v4/mimo-provider", () => ({
  createReportV4MimoDiagnosisProvider: mocks.diagnosisProvider,
  buildReportV4MimoDiagnosisTokenBudget: mocks.diagnosisBudget,
  createReportV4MimoStructuredInvoker: mocks.structuredInvoker
}));
vi.mock("@/report-v4/model-runtime-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/report-v4/model-runtime-config")>()),
  loadReportV4ModelRuntimeConfig: mocks.modelRuntime
}));
vi.mock("./report-v4-diagnosis-enhancer", () => ({
  enhanceReportV4QuestionDiagnosis: mocks.enhanceDiagnosis,
  formatReportV4DiagnosisFailure: (
    failure: { stage: string; code: string; parserPath: string | null },
    providerAttempts: number
  ) => `stage=${failure.stage}; code=${failure.code}; providerAttempts=${providerAttempts}${failure.parserPath ? `; parserPath=${failure.parserPath}` : ""}`
}));
vi.mock("./public-source-forensics", () => ({ createPublicSourceQuestionFanouts: mocks.fanouts }));
vi.mock("./public-source-snapshot-resolver", () => ({ resolvePublicSourceSnapshot: mocks.resolveSnapshot }));

import {
  buildFreeTeaserDiagnosisTargetPages,
  FreeTeaserDiagnosisFailedError,
  FreeTeaserQ1IncompleteError,
  generateFreeTeaser,
  loadConfirmedFreeTeaserQuestionSet,
  parseReadyFreeTeaserCheckpoint,
  type FreeTeaserCheckpointV1
} from "./report-v4-free-teaser";
import {
  classifyFreeTeaserResumeKind,
  createInMemoryFreeTeaserCheckpointSink,
  expectedExpensiveCallsOnMarkedResume,
  matchesExpensiveCallBudget,
  type FreeTeaserResumeKind
} from "./report-v4-free-teaser-resume-harness";

const CP13_SMOKE_RUN_ID = "cp13-synthetic-mimo-smoke-adc08-r06";
const CP13_PROMPT_SENTINEL = "CP13_SYNTHETIC_CUSTOMER_PROSE_MUST_NOT_APPEAR";
const cp13SmokeEnabled = () => process.env.OGC_CP13_SYNTHETIC_MIMO_SMOKE === "1" && process.env.OGC_CP13_SMOKE_RUN_ID === CP13_SMOKE_RUN_ID;

function syntheticCp13ReviewInput(modelId = "synthetic-mimo-model"): ReportSemanticReviewInput {
  const sourceId = "synthetic-answer-source";
  const targetIds = ["synthetic-diagnosis-target-a", "synthetic-diagnosis-target-b"];
  const field = (path: string, mutability: "mutable" | "read_only", questionId: string | null, allowedEvidenceIds: string[] = [], allowedSourceIds: string[] = []) => ({
    path, originalText: `${CP13_PROMPT_SENTINEL}:${path}`, originalTextHash: textHash(`${CP13_PROMPT_SENTINEL}:${path}`), mutability, questionId, allowedEvidenceIds, allowedSourceIds
  });
  const fields = [
    ...["overview", "strengths[0]", "strengths[1]", "strengths[2]", "keyRisks[0]", "topPriorities[0]"].map((key) => field(`executiveSummary.${key}`, "read_only", null)),
    field("organizationProfile.summary", "read_only", null),
    ...[0, 1, 2].map((index) => field(`questions[${index}].text`, "read_only", `synthetic-q${index + 1}`)),
    field("q1AnswerCard.answerText", "mutable", "synthetic-q1", [sourceId], [sourceId]),
    field("q1Diagnosis.selectionSummary", "mutable", "synthetic-q1", targetIds),
    ...[0, 1, 2].map((index) => field(`q1Diagnosis.observableFactors[${index}].observation`, "mutable", "synthetic-q1", [targetIds[index % 2]!])),
    field("q1Diagnosis.targetGap", "mutable", "synthetic-q1", targetIds),
    ...[0, 1, 2].map((index) => field(`q1Diagnosis.recommendedActions[${index}].action`, "mutable", "synthetic-q1", [targetIds[index % 2]!]))
  ];
  return createReportSemanticReviewInput({
    version: REPORT_SEMANTIC_REVIEW_CONTRACT, lifecycle: "free_v4", locale: "en", target: { siteKey: "synthetic.example", targetUrl: "https://synthetic.example/", aliases: ["Synthetic"] }, expectedModel: { providerId: "xiaomi-mimo", modelId },
    questions: [1, 2, 3].map((index) => ({ questionId: `synthetic-q${index}`, originalText: `Synthetic question ${index}?`, originalTextHash: textHash(`Synthetic question ${index}?`) })),
    sources: [{ sourceId, questionId: "synthetic-q1", canonicalUrl: "https://source.synthetic.example/", originalText: "Synthetic answer source.", originalTextHash: textHash("Synthetic answer source.") }],
    evidence: [{ evidenceId: sourceId, questionId: "synthetic-q1", sourceId, originalText: "Synthetic answer evidence.", originalTextHash: textHash("Synthetic answer evidence.") }, ...targetIds.map((evidenceId) => ({ evidenceId, questionId: "synthetic-q1", sourceId: null, originalText: `Synthetic diagnosis target ${evidenceId}.`, originalTextHash: textHash(`Synthetic diagnosis target ${evidenceId}.`) }))],
    observationResults: [{ observationId: "synthetic-observation", resultId: "synthetic-result", questionId: "synthetic-q1", originalText: "Synthetic observation.", originalTextHash: textHash("Synthetic observation.") }], entities: [{ entityId: "synthetic-competitor", questionId: "synthetic-q1", kind: "competitor_candidate", originalText: "Synthetic competitor.", originalTextHash: textHash("Synthetic competitor.") }], answerSubjects: [{ questionId: "synthetic-q1", fieldPath: "q1AnswerCard.answerText" }], fields, nonProseProjectionHash: textHash("synthetic-non-prose")
  });
}

async function runCp13Smoke(input: ReportSemanticReviewInput, invoke: (request: { task: "unified_report_semantic_review"; input: ReportSemanticReviewInput }) => Promise<unknown>) {
  let calls = 0;
  const raw = await invoke({ task: "unified_report_semantic_review", input });
  if (++calls !== 1) throw new Error("CP13 smoke attempted more than one provider request.");
  const review = parseReportSemanticReviewOutput(raw, input);
  const applied = applyReportSemanticReview(input, review);
  return { review, applied, calls };
}

function questionSet(): ConfirmedBusinessQuestionSet {
  const texts = ["哪些供应商能够提供跨境物流服务？", "哪些供应商适合中国出口企业？", "采购跨境物流服务时应如何比较交付风险？"];
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  return {
    version: "business-questions-v1",
    id: "free-questions",
    revision: 1,
    locale: "zh-CN",
    region: "CN",
    confidence: "high",
    requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile",
    identityExclusions: ["目标品牌"],
    acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z",
    contentHash: `confirmed-business-question-set-${"d".repeat(64)}`,
    questions: purposes.map((purpose, index) => ({
      purpose,
      generatedText: texts[index]!,
      privateText: texts[index]!,
      neutralPublicText: texts[index]!,
      evidenceUrls: [],
      service: "跨境物流",
      audience: "出口企业",
      marketRegion: "中国",
      edited: false,
      neutralizationVersion: "identity-neutral-v1",
      neutralContentHash: `q${index + 1}`
    })) as unknown as ConfirmedBusinessQuestionSet["questions"]
  };
}

function fixtureFanouts(canonical: ReturnType<typeof toCanonicalBuyerQuestionSet>["questions"]): SearchQueryFanout[] {
  return canonical.map(({ id }) => ({
    questionId: id,
    questionSetVersion: "question-set-v1",
    fanoutVersion: "fanout-v1",
    surface: { surfaceId: "surface-1", providerId: "provider-1", productId: "product-1", surfaceKind: "documented_api", contractVersion: "contract-v1", surfaceVersion: "surface-v1", adapterVersion: "adapter-v1", locale: "zh-CN", region: "CN" },
    queries: Array.from({ length: 6 }, (_, index) => ({
      id: `${id}-query-${index + 1}`,
      questionId: id,
      fanoutVersion: "fanout-v1",
      locale: "zh-CN",
      region: "CN",
      exactQuery: `query ${index + 1}`,
      derivationRuleId: `query-rule-${index + 1}`,
      resultDepth: 3
    })),
    budget: { maxRequests: 1, maxResults: 3, timeoutMs: 30_000, maxCostMicros: 100_000 }
  }));
}

function admission() {
  return {
    snapshot: {
      id: "admission-1",
      reportId: "report-1",
      siteKey: "target.example",
      collectorConfigIdentityHash: "a".repeat(64),
      capturedAt: new Date("2030-01-01T00:00:00.000Z"),
      status: "completed" as const,
      completedAt: new Date("2030-01-01T00:00:01.000Z"),
      contentIdentityHash: "b".repeat(64),
      candidateUrlCount: 1,
      analyzablePageCount: 1,
      excludedPageCount: 0,
      createdAt: new Date("2030-01-01T00:00:00.000Z")
    },
    pages: [{
      id: "target-page-1",
      ordinal: 1,
      normalizedUrl: "https://target.example/service",
      analyzable: true,
      readMode: "direct" as const,
      summary: "目标官网描述跨境物流服务，但没有说明具体路线条件。",
      contentHash: "c".repeat(64),
      exclusionReason: null,
      snapshotId: "admission-1",
      retainedText: null,
      createdAt: new Date("2030-01-01T00:00:00.000Z")
    }]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const questions = questionSet();
  mocks.prepare.mockResolvedValue(questions);
  mocks.confirm.mockResolvedValue(questions);
  mocks.getConfirmed.mockResolvedValue(questions);
  mocks.resolveRuntime.mockResolvedValue({
    authority: { authorityId: "authority-1", surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "zh-CN", region: "CN" } },
    adapter: { id: "adapter-1" }
  });
  const canonical = toCanonicalBuyerQuestionSet(questions).questions;
  mocks.fanouts.mockReturnValue(fixtureFanouts(canonical));
  mocks.resolveSnapshot.mockImplementation(async (input: { question: { id: string } }) => {
    const index = canonical.findIndex(({ id }) => id === input.question.id);
    const target = index === 0;
    return {
      snapshotId: `snapshot-${index + 1}`,
      observations: [{
        observationId: `observation-${index + 1}`,
        queryId: `query-${index + 1}`,
        exactQuery: `query ${index + 1}`,
        requestedAt: "2030-01-01T00:00:00.000Z",
        completedAt: "2030-01-01T00:00:01.000Z",
        status: "complete",
        usage: { requestCount: 1, resultCount: 2 },
        results: [
          ...(target ? [{ surfaceResultOrder: 1, url: "https://target.example/service", title: "目标品牌", snippet: "跨境物流", displayedHost: "target.example" }] : []),
          { surfaceResultOrder: 2, url: `https://competitor-${index}.example/`, title: `竞品 ${index}`, snippet: "跨境物流", displayedHost: `competitor-${index}.example` }
        ]
      }]
    };
  });
  mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => ({
    questionId: request.questionId,
    answerText: "目标品牌提供跨境物流服务，采购方应核验具体路线条件。",
    sources: [{
      sourceId: "q1-source",
      title: "公开服务页",
      canonicalUrl: "https://public.example/service",
      registrableDomain: "public.example",
      citedText: "公开页面描述跨境物流服务。",
      providerResultOrder: 1
    }],
    refusal: null,
    searchedAt: "2030-01-01T00:00:02.000Z",
    completedAt: "2030-01-01T00:00:03.000Z",
    providerResponseId: "response-1"
  }));
  mocks.enhanceDiagnosis.mockImplementation(async (input: { question: { questionId: string; sources: Array<{ sourceId: string }> }; targetPages: Array<{ sourceLocations: Array<{ locationId: string }> }> }) => {
    const sourceId = input.question.sources[0]!.sourceId;
    const targetRef = input.targetPages[0]!.sourceLocations[0]!.locationId;
    return {
      status: "completed",
      diagnosis: {
        selectionSummary: "来源与目标页提供了可直接比较的公开事实。",
        observableFactors: [
          { kind: "problem_match", observation: "来源直接回答本题。", evidenceRefs: [sourceId] },
          { kind: "factual_specificity", observation: "来源包含具体服务事实。", evidenceRefs: [sourceId] },
          { kind: "target_clarity", observation: "目标页缺少路线条件。", evidenceRefs: [targetRef] }
        ],
        targetGap: "目标官网没有清楚说明路线条件。",
        recommendedActions: [
          { priority: 1, action: "在服务页补充路线条件。", evidenceRefs: [targetRef] },
          { priority: 2, action: "把服务能力与买家问题对应起来。", evidenceRefs: [sourceId, targetRef] },
          { priority: 3, action: "持续维护可核验的公开事实。", evidenceRefs: [targetRef] }
        ],
        detailedEvidenceRefs: [sourceId, targetRef]
      }
    };
  });
  mocks.getMarketSnapshotBundle.mockImplementation(defaultMarketSnapshotBundle);
  mocks.structuredInvoker.mockReturnValue({ invoke: mocks.semanticInvoke });
  mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
    const parsed = JSON.parse(request.inputText) as {
      batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
      input: ReportSemanticReviewInput;
    };
    return semanticReviewBatchSlice(parsed.input, parsed.batchId);
  });
});

describe("free teaser orchestration", () => {
  it("keeps the CP13 synthetic MiMo harness skipped by default and bounded to one non-persistent invocation", async () => {
    expect(cp13SmokeEnabled()).toBe(process.env.OGC_CP13_SYNTHETIC_MIMO_SMOKE === "1" && process.env.OGC_CP13_SMOKE_RUN_ID === CP13_SMOKE_RUN_ID);
    const input = syntheticCp13ReviewInput();
    const prompt = buildFreeV4ReportSemanticReviewSystemPrompt(input);
    let fetches = 0;
    const persistence = vi.fn();
    const result = await runCp13Smoke(input, async ({ input: exactInput }) => {
      if (++fetches > 1) throw new Error("CP13 smoke attempted more than one fetch.");
      return semanticReviewPass(exactInput);
    });

    expect(fetches).toBe(1); expect(result.calls).toBe(1);
    expect(persistence).not.toHaveBeenCalled();
    expect(result.review.fields).toHaveLength(19);
    expect(result.review.fields[10]!.path).toBe("q1AnswerCard.answerText");
    expect(prompt).toContain("Blueprint-only index is an ordering aid; omit index from every output field object.");
    expect(prompt).toContain(`"path":"${input.fields[10]!.path}"`);
    expect(prompt).not.toContain(CP13_PROMPT_SENTINEL); expect(prompt).not.toContain(input.fields[10]!.originalText);
    expect(result.review.fields.every((field) => !Object.hasOwn(field, "index"))).toBe(true);
    expect(result.review.fields.filter(({ decision }) => decision === "corrected").every((field) => field.correctedText !== input.fields.find(({ path }) => path === field.path)!.originalText)).toBe(true);
    expect(verifyReportSemanticReviewReceipt(result.applied.receipt, input, result.review, result.applied.fields)).toEqual(result.applied.receipt);
  });

  it("constructs the actual MiMo invoker from a fake opt-in environment with a single-fetch guard", async () => {
    const mimo = await vi.importActual<typeof import("@/report-v4/mimo-provider")>("@/report-v4/mimo-provider");
    const runtimeModule = await vi.importActual<typeof import("@/report-v4/model-runtime-config")>("@/report-v4/model-runtime-config");
    const environment = { OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-mimo-v2.5-pro-v1", OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "synthetic-key" };
    let fetches = 0;
    const invoker = mimo.createReportV4MimoStructuredInvoker({ environment, lockedRuntime: runtimeModule.loadReportV4ModelRuntimeConfig(environment), fetch: async () => {
      if (++fetches > 1) throw new Error("CP13 smoke attempted more than one fetch.");
      return new Response("{}", { status: 500 });
    } });

    await expect(invoker.invoke({ operation: "websiteSynthesis", systemText: "synthetic", inputText: "{}", signal: AbortSignal.timeout(1_000) })).rejects.toThrow();
    expect(fetches).toBe(1);
  });

  it("finishes a hanging fake fetch through a short abort before the outer timeout", async () => {
    const mimo = await vi.importActual<typeof import("@/report-v4/mimo-provider")>("@/report-v4/mimo-provider");
    const runtimeModule = await vi.importActual<typeof import("@/report-v4/model-runtime-config")>("@/report-v4/model-runtime-config");
    const environment = { OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-mimo-v2.5-pro-v1", OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "synthetic-key" };
    let fetches = 0;
    const invoker = mimo.createReportV4MimoStructuredInvoker({ environment, lockedRuntime: runtimeModule.loadReportV4ModelRuntimeConfig(environment), fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      if (++fetches > 1) throw new Error("CP13 smoke attempted more than one fetch.");
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }) });
    await expect(invoker.invoke({ operation: "websiteSynthesis", systemText: "synthetic", inputText: "{}", signal: AbortSignal.timeout(20) })).rejects.toThrow();
    expect(fetches).toBe(1);
  }, 1_000);

  it.skipIf(!cp13SmokeEnabled())("runs the process-local CP13 synthetic MiMo smoke once without persistence", async () => {
    const mimo = await vi.importActual<typeof import("@/report-v4/mimo-provider")>("@/report-v4/mimo-provider");
    const runtimeModule = await vi.importActual<typeof import("@/report-v4/model-runtime-config")>("@/report-v4/model-runtime-config");
    const runtime = runtimeModule.loadReportV4ModelRuntimeConfig(process.env);
    const input = syntheticCp13ReviewInput(runtime.modelProfile.operations.websiteSynthesis.model);
    let fetches = 0;
    const provider = mimo.createReportV4MimoStructuredInvoker({
      environment: process.env,
      lockedRuntime: runtime,
      fetch: (...args) => {
        if (++fetches > 1) throw new Error("CP13 smoke attempted more than one fetch.");
        return globalThis.fetch(...args);
      }
    });
    let status = "provider_error";
    let result: Awaited<ReturnType<typeof runCp13Smoke>> | undefined;
    try { result = await runCp13Smoke(input, ({ task, input: exactInput }) => provider.invoke({
      operation: "websiteSynthesis",
      systemText: buildFreeV4ReportSemanticReviewSystemPrompt(exactInput),
      inputText: JSON.stringify({ task, input: exactInput }),
      signal: AbortSignal.timeout(180_000)
    }));

    expect(fetches).toBe(1);
    expect(result.calls).toBe(1);
    expect(result.review.fields).toHaveLength(19); expect(result.review.fields[10]!.path).toBe("q1AnswerCard.answerText");
    expect(result.review.fields[10]!.evidenceIds).toEqual(["synthetic-answer-source"]);
    expect(result.review.fields[10]!.sourceIds).toEqual(["synthetic-answer-source"]);
    expect(result.review.fields[10]!.evidenceIds).not.toContain("synthetic-diagnosis-target-a");
    expect(result.review.fields.filter(({ path }) => path.startsWith("q1Diagnosis.")).some(({ evidenceIds }) => evidenceIds.includes("synthetic-diagnosis-target-a"))).toBe(true);
    expect(result.review.fields.filter(({ decision }) => decision === "corrected").every((field) => field.correctedText !== input.fields.find(({ path }) => path === field.path)!.originalText)).toBe(true);
    expect(verifyReportSemanticReviewReceipt(result.applied.receipt, input, result.review, result.applied.fields)).toEqual(result.applied.receipt);
    status = "success";
    } finally { console.info(JSON.stringify({ runId: CP13_SMOKE_RUN_ID, fetches, status, inputHash: input.inputHash, ...(result ? { fields: result.review.fields.length, receiptHash: result.applied.receipt.reviewHash } : {}) })); }
  }, 200_000);

  it("throws a durable typed FreeTeaserDiagnosisFailedError without exposing provider output", async () => {
    mocks.enhanceDiagnosis.mockResolvedValueOnce({
      status: "failed",
      providerAttempts: 1,
      failure: {
        stage: "semantic_contract",
        code: "invalid_semantic_output",
        parserPath: "$diagnosisSemanticOutput.observableFactors"
      }
    });

    let error: unknown;
    try {
      await generateFreeTeaser({
        reportId: "report-1",
        jobId: "job-1",
        targetUrl: "https://target.example/",
        foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
        locale: "zh",
        admission: admission(),
        semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
        saveCheckpoint: vi.fn()
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(FreeTeaserDiagnosisFailedError);
    const typed = error as FreeTeaserDiagnosisFailedError;
    expect(typed).toMatchObject({
      name: "FreeTeaserDiagnosisFailedError",
      code: "free_teaser_diagnosis_semantic_contract",
      classification: "permanent",
      diagnosisStage: "semantic_contract",
      diagnosisCode: "invalid_semantic_output",
      providerAttempts: 1
    });
    expect(typed.message).toBe(
      "stage=semantic_contract; code=invalid_semantic_output; providerAttempts=1; parserPath=$diagnosisSemanticOutput.observableFactors"
    );
    expect(typed.code).not.toBe("unexpected_internal_error");
    expect(JSON.stringify(error)).not.toContain("raw provider");
  });

  it("maps a retryable diagnosis provider stage to a transient free-teaser diagnosis code", async () => {
    mocks.enhanceDiagnosis.mockResolvedValueOnce({
      status: "failed",
      providerAttempts: 2,
      failure: {
        stage: "provider",
        code: "provider_transport",
        parserPath: null
      }
    });

    await expect(generateFreeTeaser({
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh",
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: vi.fn()
    })).rejects.toMatchObject({
      name: "FreeTeaserDiagnosisFailedError",
      code: "free_teaser_diagnosis_provider",
      classification: "transient",
      diagnosisCode: "provider_transport",
      providerAttempts: 2
    });
  });

  it("throws FreeTeaserQ1IncompleteError when Q1 has answer text but no sources", async () => {
    mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => ({
      questionId: request.questionId,
      answerText: "目标品牌提供跨境物流服务，采购方应核验具体路线条件。",
      sources: [],
      refusal: null,
      searchedAt: "2030-01-01T00:00:02.000Z",
      completedAt: "2030-01-01T00:00:03.000Z",
      providerResponseId: "response-1"
    }));

    let incomplete: unknown;
    try {
      await generateFreeTeaser({
        reportId: "report-1",
        jobId: "job-1",
        targetUrl: "https://target.example/",
        foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
        locale: "zh",
        admission: admission(),
        saveCheckpoint: vi.fn()
      });
    } catch (caught) {
      incomplete = caught;
    }

    expect(incomplete).toBeInstanceOf(FreeTeaserQ1IncompleteError);
    expect(incomplete).toMatchObject({
      name: "FreeTeaserQ1IncompleteError",
      code: "free_teaser_q1_incomplete",
      classification: "transient",
      message: "Free teaser Q1 requires one complete answer with sources."
    });
  });

  it("resolves the three public-search snapshots in ordinal order with one question active at a time", async () => {
    const original = mocks.resolveSnapshot.getMockImplementation()!;
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    mocks.resolveSnapshot.mockImplementation(async (input) => {
      const result = await original(input);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return result;
    });
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: vi.fn()
    };
    const pending = generateFreeTeaser(input);

    await vi.waitFor(() => expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(1));
    releases.shift()!();
    await vi.waitFor(() => expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(2));
    releases.shift()!();
    await vi.waitFor(() => expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3));
    releases.shift()!();
    await pending;

    expect(maxActive).toBe(1);
    expect(mocks.resolveSnapshot.mock.calls.map(([request]) => request.question.id)).toEqual(
      toCanonicalBuyerQuestionSet(questionSet()).questions.map(({ id }) => id)
    );
    for (const [request] of mocks.resolveSnapshot.mock.calls) {
      expect(request.searchConcurrency).toBe(1);
      expect(request.fanout.budget.timeoutMs).toBe(60_000);
      expect(request.fanout.queries).toHaveLength(3);
      expect(request.fanout.queries.map(({ derivationRuleId }: { derivationRuleId: string }) => derivationRuleId)).toEqual([
        "query-rule-1", "query-rule-2", "query-rule-3"
      ]);
    }
  });

  it("keeps every answer-card source while bounding diagnosis input to the stable first five", async () => {
    mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => ({
      questionId: request.questionId,
      answerText: "\u8be5\u670d\u52a1\u5546\u516c\u5f00\u63d0\u4f9b\u8de8\u5883\u7269\u6d41\u670d\u52a1\u3002",
      sources: Array.from({ length: 7 }, (_, index) => ({
        sourceId: `q1-source-${index + 1}`,
        title: `\u516c\u5f00\u670d\u52a1\u9875 ${index + 1}`,
        canonicalUrl: `https://public-${index + 1}.example/service`,
        registrableDomain: `public-${index + 1}.example`,
        citedText: `\u516c\u5f00\u8bc1\u636e ${index + 1}`,
        providerResultOrder: index + 1
      })),
      refusal: null,
      searchedAt: "2030-01-01T00:00:02.000Z",
      completedAt: "2030-01-01T00:00:03.000Z",
      providerResponseId: "response-many-sources"
    }));
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: vi.fn()
    };

    const first = await generateFreeTeaser(input);
    const diagnosisQuestion = mocks.enhanceDiagnosis.mock.calls[0]![0].question;
    expect(first.q1AnswerCard.sources.map(({ sourceId }) => sourceId)).toEqual(
      Array.from({ length: 7 }, (_, index) => `q1-source-${index + 1}`)
    );
    expect(diagnosisQuestion.sources.map(({ sourceId }: { sourceId: string }) => sourceId)).toEqual(
      Array.from({ length: 5 }, (_, index) => `q1-source-${index + 1}`)
    );

    await generateFreeTeaser({ ...input, checkpoint: first.checkpoint });
    expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
  });

  it("checkpoints every expensive stage and resumes a ready teaser without repeating search or model calls", async () => {
    const saved: FreeTeaserCheckpointV1[] = [];
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: {
        ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
        organizationProfile: {
          ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport.organizationProfile,
          organizationName: "目标品牌",
          brandNames: ["目标品牌"],
          legalEntity: null
        }
      },
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: async (checkpoint: FreeTeaserCheckpointV1) => { saved.push(checkpoint); }
    };
    const first = await generateFreeTeaser(input);

    expect(saved.map(({ stage }) => stage)).toEqual(["questions_ready", "observations_ready", "q1_answer_ready", "ready"]);
    expect(first.metrics).toEqual({ questionCount: 3, brandMentionCount: 1, competitorMentionCount: 3 });
    expect(first.q1AnswerCard.diagnosis?.observableFactors).toHaveLength(3);
    expect(mocks.answerWithSources.mock.calls[0]![0]).not.toHaveProperty("semanticValidation");
    expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
    expect(parseReadyFreeTeaserCheckpoint(first.checkpoint).q1AnswerCard).toEqual(first.q1AnswerCard);

    for (const invalidIdentity of [
      "d".repeat(64),
      `other-question-set-${"d".repeat(64)}`,
      `confirmed-business-question-set-${"d".repeat(63)}`,
      `confirmed-business-question-set-${"D".repeat(64)}`,
      `confirmed-business-question-set-${"g".repeat(64)}`
    ]) {
      expect(() => parseReadyFreeTeaserCheckpoint({
        ...first.checkpoint,
        questionSetIdentity: invalidIdentity
      })).toThrow("Free teaser checkpoint is incomplete.");
    }

    const secondSaved: FreeTeaserCheckpointV1[] = [];
    const second = await generateFreeTeaser({ ...input, checkpoint: first.checkpoint, saveCheckpoint: async (checkpoint) => { secondSaved.push(checkpoint); } });
    expect(second.q1AnswerCard).toEqual(first.q1AnswerCard);
    expect(secondSaved).toEqual([]);
    expect(mocks.resolveSnapshot).toHaveBeenCalledTimes(3);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
  });

  it("runs one durable unified review for a marked Free V4 lineage and verifies every persisted projection on resume", async () => {
    const diagnosisImplementation = mocks.enhanceDiagnosis.getMockImplementation()!;
    mocks.enhanceDiagnosis.mockImplementation(async (request) => {
      const result = await diagnosisImplementation(request);
      return request.semanticValidation === "deferred"
        ? {
            ...result,
            diagnosis: {
              ...result.diagnosis,
              selectionSummary: "The model selected these sources because they rank higher."
            }
          }
        : result;
    });
    const currentBundle = await defaultMarketSnapshotBundle("snapshot-1");
    const sharedOriginBundle = await defaultMarketSnapshotBundle("snapshot-1", "origin-report");
    expect(sharedOriginBundle.snapshot.cacheIdentity).toBe(currentBundle.snapshot.cacheIdentity);
    expect(sharedOriginBundle.snapshot.queryFanoutHash).not.toBe(currentBundle.snapshot.queryFanoutHash);
    expect(sharedOriginBundle.queries.map(({ id }) => id)).not.toEqual(currentBundle.queries.map(({ id }) => id));
    mocks.getMarketSnapshotBundle.mockImplementation(async (snapshotId: string) => {
      const bundle = await defaultMarketSnapshotBundle(snapshotId, "origin-report");
      if (snapshotId !== "snapshot-1") return bundle;
      const attempt = {
        ...bundle.attempts[0]!,
        id: "snapshot-1-attempt-4",
        attemptNumber: 4,
        idempotencyReference: "snapshot-1-attempt-ref-4"
      };
      return {
        ...bundle,
        attempts: [...bundle.attempts, attempt],
        observations: [...bundle.observations, {
          ...bundle.observations[0]!,
          id: "stored-result-1-second-attempt",
          attemptId: attempt.id,
          surfaceResultOrder: 2,
          canonicalUrl: "https://second-attempt.example/",
          resultUrl: "https://second-attempt.example/",
          title: "Second attempt result",
          snippet: "A distinct persisted attempt result"
        }]
      };
    });
    const saved: FreeTeaserCheckpointV1[] = [];
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: {
        ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
        organizationProfile: {
          ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport.organizationProfile,
          organizationName: "Target Organization",
          legalEntity: "Target Legal Entity",
          brandNames: ["Target Brand", "Target Organization", "  "]
        },
        executiveSummary: {
          ...combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport.executiveSummary,
          strengths: [
            "The site states its primary logistics service.",
            "The service language is consistently customer-facing.",
            "The organization profile preserves its customer-facing identity."
          ]
        }
      },
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: async (checkpoint: FreeTeaserCheckpointV1) => { saved.push(checkpoint); }
    };

    const first = await generateFreeTeaser(input);

    expect(saved.map(({ stage }) => stage)).toEqual([
      "questions_ready", "observations_ready", "q1_answer_ready", "q1_answer_ready", "ready"
    ]);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ deferSemanticDistinctness: true }));
    expect(mocks.answerWithSources).toHaveBeenCalledWith(expect.objectContaining({ semanticValidation: "deferred" }));
    expect(mocks.semanticInvoke.mock.calls.length).toBeGreaterThanOrEqual(2);
    const batchPayloads = mocks.semanticInvoke.mock.calls.map((call) => JSON.parse(call[0].inputText) as {
      batchId: string;
      input: ReportSemanticReviewInput;
    });
    expect(new Set(batchPayloads.map(({ batchId }) => batchId)).size).toBe(batchPayloads.length);
    const reviewRequest = batchPayloads[0]!;
    expect(mocks.semanticInvoke.mock.calls.every((call) => String(call[0].systemText).includes("BATCH MODE"))).toBe(true);
    expect(reviewRequest.input.fields).toHaveLength(19);
    const answerField = reviewRequest.input.fields[10]!;
    expect(answerField.path).toBe("q1AnswerCard.answerText");
    const diagnosisTargetIds = reviewRequest.input.evidence
      .filter(({ sourceId }) => sourceId === null)
      .map(({ evidenceId }) => evidenceId);
    const diagnosisFields = reviewRequest.input.fields.filter(({ path }) => path.startsWith("q1Diagnosis."));
    expect(reviewRequest.input.evidencePolicy).toBeUndefined();
    expect(answerField.allowedEvidenceIds).toEqual(["q1-source"]);
    expect(answerField.allowedSourceIds).toEqual(["q1-source"]);
    expect(diagnosisTargetIds).not.toEqual([]);
    expect(diagnosisFields.every(({ allowedEvidenceIds }) => allowedEvidenceIds.length > 0)).toBe(true);
    const foundationFields = reviewRequest.input.fields.filter(({ path }) => path.startsWith("foundation."));
    expect(foundationFields.length).toBeGreaterThan(0);
    expect(foundationFields.every(({ allowedEvidenceIds, allowedSourceIds }) =>
      allowedEvidenceIds.length === 0 && allowedSourceIds.length === 0
    )).toBe(true);
    const allSystem = mocks.semanticInvoke.mock.calls.map((call) => String(call[0].systemText)).join("\n");
    expect(allSystem).toContain(`"path":"${answerField.path}"`);
    expect(allSystem).toContain('"referenceRequirement":"at_least_one_exact_local_id"');
    expect(allSystem).toContain('"referenceRequirement":"none"');
    expect(allSystem).not.toContain("at_least_one_exact_global_id");
    expect(allSystem).toContain("Blueprint-only index is an ordering aid; omit index from every output field object.");
    expect(allSystem).not.toContain(answerField.originalText);
    expect(reviewRequest.input.target.aliases).toEqual([
      "target.example", "Target Organization", "Target Legal Entity", "Target Brand"
    ]);
    expect(reviewRequest.input.observationResults.map(({ observationId }) => observationId)).toEqual([
      "snapshot-1-attempt-1", "snapshot-1-attempt-4", "snapshot-2-attempt-1", "snapshot-3-attempt-1"
    ]);
    expect(first.q1AnswerCard.answerText).toBe("已审阅的目标品牌跨境物流答案。");
    expect(first.q1AnswerCard.diagnosis!.selectionSummary).toBe("Reviewed evidence-bound source selection.");
    expect(first.q1AnswerCard.geoDiagnosis).toMatchObject({
      targetMentioned: true,
      targetFirstSentence: 1,
      targetRoles: ["answer subject"]
    });
    expect(first.metrics).toEqual({ questionCount: 3, brandMentionCount: 2, competitorMentionCount: 1 });
    expect(first.checkpoint.q1AnswerDraft).toBeUndefined();
    expect(first.checkpoint.q1DiagnosisDraft).toBeUndefined();
    expect(() => parseReadyFreeTeaserCheckpoint(first.checkpoint)).toThrow(/root semantic-review lineage/i);
    expect(parseReadyFreeTeaserCheckpoint(first.checkpoint, {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).toEqual(first.checkpoint);
    expect(() => parseReadyFreeTeaserCheckpoint(reorderJsonKeys(first.checkpoint), {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).not.toThrow();
    // The report page loader must forward the root marker when re-parsing.
    await expect(loadConfirmedFreeTeaserQuestionSet("report-1", first.checkpoint, {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).resolves.toMatchObject({ id: "free-questions" });
    await expect(loadConfirmedFreeTeaserQuestionSet("report-1", first.checkpoint))
      .rejects.toThrow(/root semantic-review lineage/i);

    mocks.prepare.mockClear();
    mocks.confirm.mockClear();
    const stableBundleImplementation = mocks.getMarketSnapshotBundle.getMockImplementation()!;
    mocks.getMarketSnapshotBundle.mockImplementation(async (snapshotId: string) => {
      const bundle = await stableBundleImplementation(snapshotId);
      return { ...bundle, observations: [...bundle.observations].reverse() };
    });
    const resumedReady = await generateFreeTeaser({ ...input, checkpoint: first.checkpoint, saveCheckpoint: vi.fn() });
    expect(resumedReady.checkpoint.semanticReview!.input.inputHash).toBe(first.checkpoint.semanticReview!.input.inputHash);
    mocks.getMarketSnapshotBundle.mockImplementation(stableBundleImplementation);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(5);

    const forgedCatalog = structuredClone(first.checkpoint);
    const persistedCore = Object.fromEntries(Object.entries(forgedCatalog.semanticReview!.input)
      .filter(([key]) => key !== "inputHash")) as unknown as ReportSemanticReviewInputCore;
    const forgedOriginalText = JSON.stringify({ canonicalUrl: "https://forged.example/", title: "Forged persisted result", snippet: null });
    const forgedCore = {
      ...persistedCore,
      observationResults: persistedCore.observationResults.map((row, index) => index === 0 ? {
        ...row,
        originalText: forgedOriginalText,
        originalTextHash: textHash(forgedOriginalText)
      } : row)
    };
    const forgedInput = createReportSemanticReviewInput(forgedCore);
    const forgedOutput = semanticReviewPass(forgedInput);
    const forgedCheckpoint = {
      ...forgedCatalog,
      semanticReview: {
        version: REPORT_SEMANTIC_REVIEW_CONTRACT,
        input: forgedInput,
        output: forgedOutput,
        applied: applyReportSemanticReview(forgedInput, forgedOutput)
      }
    };
    const callsBeforeForgedResume = mocks.semanticInvoke.mock.calls.length;
    await expect(generateFreeTeaser({ ...input, checkpoint: forgedCheckpoint, saveCheckpoint: vi.fn() }))
      .rejects.toThrow(/ready semantic authority/i);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(callsBeforeForgedResume);

    const observationsReady = saved[1]!;
    const answerCallsBeforeCorruptResume = mocks.answerWithSources.mock.calls.length;
    const diagnosisCallsBeforeCorruptResume = mocks.enhanceDiagnosis.mock.calls.length;
    const reviewCallsBeforeCorruptResume = mocks.semanticInvoke.mock.calls.length;
    const corruptBundle = async (kind: "cache" | "authority" | "query" | "query-order" | "query-text" | "query-rule" | "query-id" | "duplicate-query-id" | "origin-hash" | "attempt" | "attempt-status" | "status", snapshotId: string) => {
      const bundle = await defaultMarketSnapshotBundle(snapshotId);
      if (kind === "cache") return { ...bundle, snapshot: { ...bundle.snapshot, cacheIdentity: "forged-cache-identity" } };
      if (kind === "authority") return { ...bundle, snapshot: { ...bundle.snapshot, surfaceAuthorityVersion: "forged-authority" } };
      if (kind === "query") return { ...bundle, queries: bundle.queries.map((query, index) => index === 0 ? { ...query, queryHash: "f".repeat(64) } : query) };
      if (kind === "query-order") return { ...bundle, queries: bundle.queries.map((query, index) => index === 0 ? { ...query, queryOrder: 2 } : query) };
      if (kind === "query-text") return { ...bundle, queries: bundle.queries.map((query, index) => index === 0 ? { ...query, queryText: "forged query" } : query) };
      if (kind === "query-rule") return { ...bundle, queries: bundle.queries.map((query, index) => index === 0 ? { ...query, derivationRule: "forged-rule" } : query) };
      if (kind === "query-id") return { ...bundle, queries: bundle.queries.map((query, index) => index === 0 ? { ...query, id: "malformed-query-id" } : query) };
      if (kind === "duplicate-query-id") return { ...bundle, queries: bundle.queries.map((query, index) => index === 1 ? { ...query, id: bundle.queries[0]!.id } : query) };
      if (kind === "origin-hash") return { ...bundle, snapshot: { ...bundle.snapshot, queryFanoutHash: "malformed-origin-hash" } };
      if (kind === "attempt") return { ...bundle, observations: bundle.observations.map((row, index) => index === 0 ? { ...row, attemptId: "unknown-attempt" } : row) };
      if (kind === "attempt-status") return { ...bundle, attempts: bundle.attempts.map((attempt, index) => index === 0 ? { ...attempt, requestStatus: "pending" } : attempt) };
      return { ...bundle, observations: bundle.observations.map((row, index) => index === 0 ? { ...row, resultStatus: "filtered" } : row) };
    };
    for (const kind of ["cache", "authority", "query", "query-order", "query-text", "query-rule", "query-id", "duplicate-query-id", "origin-hash", "attempt", "attempt-status", "status"] as const) {
      mocks.getMarketSnapshotBundle.mockImplementationOnce((snapshotId: string) => corruptBundle(kind, snapshotId));
      await expect(generateFreeTeaser({ ...input, checkpoint: observationsReady, saveCheckpoint: vi.fn() }))
        .rejects.toThrow(/snapshot authority/i);
    }
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(answerCallsBeforeCorruptResume);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(diagnosisCallsBeforeCorruptResume);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(reviewCallsBeforeCorruptResume);

    const sourceTamper = structuredClone(first.checkpoint);
    sourceTamper.q1AnswerResult!.sources[0]!.title = "Substituted source";
    expect(() => parseReadyFreeTeaserCheckpoint(sourceTamper, {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).toThrow(/answer hash|source provenance/i);

    const geoTamper = structuredClone(first.checkpoint);
    geoTamper.q1AnswerCard!.geoDiagnosis.targetRoles = ["tampered role"];
    expect(() => parseReadyFreeTeaserCheckpoint(geoTamper, {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).toThrow(/verified annotations/i);

    const nonProseTamper = structuredClone(first.checkpoint);
    nonProseTamper.q1AnswerCard!.provenance.providerId = "substituted-provider";
    expect(() => parseReadyFreeTeaserCheckpoint(nonProseTamper, {
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).toThrow(/non-prose projection/i);

    const preReview = saved[3]!;
    mocks.getMarketSnapshotBundle.mockImplementationOnce(async (snapshotId: string) => {
      const original = await defaultMarketSnapshotBundle(snapshotId);
      return { ...original, snapshot: { ...original.snapshot, questionHash: "f".repeat(64) } };
    });
    const beforeReviewCalls = mocks.semanticInvoke.mock.calls.length;
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: vi.fn() }))
      .rejects.toThrow(/snapshot authority/i);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(beforeReviewCalls);

    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      if (parsed.batchId === "B_answers") {
        const full = semanticReviewPass(parsed.input);
        full.annotations.answers[0]!.entityRole = "ambiguous";
        return { answers: full.annotations.answers };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: vi.fn() }))
      .rejects.toMatchObject({
        name: "OrchestrationInvariantError",
        code: "orchestration_invariant",
        classification: "permanent",
        message: expect.stringMatching(/contradictory Q1 entity semantics/i)
      });

    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      if (parsed.batchId === "B_answers") {
        const full = semanticReviewPass(parsed.input);
        const annotation = full.annotations.answers[0]!;
        delete annotation.targetPresence;
        delete annotation.targetFirstSentence;
        delete annotation.targetRoles;
        delete annotation.competitorEntityIds;
        return { answers: full.annotations.answers };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: vi.fn() }))
      .rejects.toMatchObject({
        name: "OrchestrationInvariantError",
        code: "orchestration_invariant",
        classification: "permanent",
        message: expect.stringMatching(/omitted durable Q1 diagnosis semantics/i)
      });

    const degradedFieldSave = vi.fn();
    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      if (parsed.batchId === "B_fields_readonly") {
        const full = semanticReviewPass(parsed.input);
        return {
          fields: full.fields
            .filter((field) => parsed.input.fields.find((m) => m.path === field.path)?.mutability === "read_only")
            .slice(1)
        };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    // A batch field missing from the model output degrades to a synthesized
    // pass entry instead of killing the Free job.
    const degradedFieldRun = await generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: degradedFieldSave });
    expect(degradedFieldRun.checkpoint.stage).toBe("ready");
    expect(degradedFieldRun.checkpoint.semanticReview!.output.fields.find(({ path }) => path === "questions[0].text"))
      .toMatchObject({ decision: "pass", reason: "degraded: contract violation" });
    expect(degradedFieldSave).toHaveBeenCalled();

    const nonResponsiveSave = vi.fn();
    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      if (parsed.batchId === "B_answers") {
        const full = semanticReviewPass(parsed.input);
        full.annotations.answers[0]!.relevance = "not_responsive";
        return { answers: full.annotations.answers };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    // Free overallDecision is recomputed from sanitized field decisions, so a
    // model-reported nonresponsive answer can no longer block the review.
    const nonResponsiveRun = await generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: nonResponsiveSave });
    expect(nonResponsiveRun.checkpoint.stage).toBe("ready");
    expect(nonResponsiveRun.checkpoint.semanticReview!.output.annotations.answers[0]!.relevance).toBe("not_responsive");
    expect(nonResponsiveRun.checkpoint.semanticReview!.output.overallDecision).toBe("corrected");
    expect(nonResponsiveSave).toHaveBeenCalled();

    const mismatchedSave = vi.fn();
    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      // Force modelId mismatch via answers batch identity is not enough; corrupt mutable fields provider/model is in assembled output from input.expectedModel.
      // Substitute model by returning answers that assemble then fail modelId — inject by patching expected model through a fake full batch that still uses wrong model on assemble from input.
      // Instead return valid slices but change input.expectedModel is fixed; use field batch returning wrong originalTextHash via pass then overall parse fails modelId only if we change provider fields in assembled raw - assembly copies expectedModel from input.
      // Fail by transport-like contract: return batch with wrong top-level key for first batch.
      if (parsed.batchId === "B_fields_readonly") {
        return { notFields: true };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: mismatchedSave }))
      .rejects.toThrow(/fields|B_fields_readonly|unknown field|must be/i);
    expect(mismatchedSave).not.toHaveBeenCalled();

    const transportSave = vi.fn();
    mocks.semanticInvoke.mockImplementation(async () => {
      throw new Error("semantic review transport failed");
    });
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: transportSave }))
      .rejects.toThrow(/transport failed/i);
    expect(transportSave).not.toHaveBeenCalled();
  });

  it("rejects a degraded Q1 review annotation transiently instead of persisting fabricated semantics", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: sink.saveCheckpoint
    };
    await generateFreeTeaser(input);
    const preReview = sink.firstByKind().q1_diagnosis_ready!;

    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      if (parsed.batchId === "B_answers") {
        const full = semanticReviewPass(parsed.input);
        // Present target requires a positive first sentence; zero is a contract
        // violation that degrades the row to the synthesized fallback.
        full.annotations.answers[0]!.targetFirstSentence = 0;
        return { answers: full.annotations.answers };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    const degradedSave = vi.fn();
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: degradedSave }))
      .rejects.toMatchObject({
        name: "FreeTeaserQ1AnnotationDegradedError",
        code: "free_teaser_q1_annotation_degraded",
        classification: "transient"
      });
    // The fabricated targetPresence/entityRole/targetFirstSentence never reached a checkpoint.
    expect(degradedSave).not.toHaveBeenCalled();
  });

  it("fails an out-of-locale post-review Q1 answer through the mechanical language gate before persistence", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: sink.saveCheckpoint
    };
    await generateFreeTeaser(input);
    const preReview = sink.firstByKind().q1_diagnosis_ready!;

    mocks.semanticInvoke.mockImplementation(async (request: { inputText: string }) => {
      const parsed = JSON.parse(request.inputText) as {
        batchId?: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use";
        input: ReportSemanticReviewInput;
      };
      if (parsed.batchId === "B_fields_mutable") {
        const full = semanticReviewPass(parsed.input);
        return {
          fields: full.fields
            .filter((field) => parsed.input.fields.find((manifest) => manifest.path === field.path)?.mutability === "mutable")
            .map((field) => field.path === "q1AnswerCard.answerText"
              ? { ...field, correctedText: "Reviewed Brand-X FBA answer." }
              : field)
        };
      }
      return semanticReviewBatchSlice(parsed.input, parsed.batchId);
    });
    const gatedSave = vi.fn();
    // The deferred parse skipped the language gate; the applied English text in
    // a zh-CN report must surface the typed transient error before persistence.
    await expect(generateFreeTeaser({ ...input, checkpoint: preReview, saveCheckpoint: gatedSave }))
      .rejects.toMatchObject({ name: "ReportLanguageValidationError" });
    expect(gatedSave).not.toHaveBeenCalled();
  });

  it("asserts persisted Q1 entityRole consistency when the ready checkpoint is re-verified", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: sink.saveCheckpoint
    };
    const first = await generateFreeTeaser(input);
    const options = { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT } as const;
    expect(() => parseReadyFreeTeaserCheckpoint(first.checkpoint, options)).not.toThrow();
    expect(first.checkpoint.semanticReview!.output.annotations.answers[0]!.entityRole).toBe("mixed");

    // Forge an entityRole contradicting the persisted presence/competitor
    // semantics while keeping every receipt hash consistent; verification fails.
    const forged = structuredClone(first.checkpoint);
    const output = structuredClone(forged.semanticReview!.output);
    output.annotations.answers[0]!.entityRole = "target";
    const applied = applyReportSemanticReview(forged.semanticReview!.input, output);
    forged.semanticReview = { ...forged.semanticReview!, output, applied };
    expect(() => parseReadyFreeTeaserCheckpoint(forged, options)).toThrow(/verified annotations/i);
  });

  it("classifies marked draft-checkpoint guards as transient model incompleteness or permanent invariant", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: sink.saveCheckpoint
    };
    await generateFreeTeaser(input);
    const answerReady = sink.firstByKind().q1_answer_ready!;
    const diagnosisReady = sink.firstByKind().q1_diagnosis_ready!;
    const draft = answerReady.q1AnswerDraft!;
    const result = answerReady.q1AnswerResult!;
    const diagnosis = diagnosisReady.q1DiagnosisDraft!;

    // Persisted model-output incompleteness -> transient typed error.
    await expect(generateFreeTeaser({
      ...input,
      checkpoint: { ...answerReady, q1AnswerResult: { ...result, sources: [] } },
      saveCheckpoint: vi.fn()
    })).rejects.toMatchObject({
      name: "FreeTeaserQ1IncompleteError",
      code: "free_teaser_q1_incomplete",
      classification: "transient"
    });

    // Result/draft divergence and provenance binding drift -> permanent invariants.
    await expect(generateFreeTeaser({
      ...input,
      checkpoint: { ...answerReady, q1AnswerResult: { ...result, answerText: `${result.answerText} altered` } },
      saveCheckpoint: vi.fn()
    })).rejects.toMatchObject({ name: "OrchestrationInvariantError", code: "orchestration_invariant", classification: "permanent" });
    await expect(generateFreeTeaser({
      ...input,
      checkpoint: { ...answerReady, q1AnswerDraft: { ...draft, provenance: { ...draft.provenance, searchedAt: "2030-01-01T00:00:09.000Z" } } },
      saveCheckpoint: vi.fn()
    })).rejects.toMatchObject({ name: "OrchestrationInvariantError", code: "orchestration_invariant", classification: "permanent" });

    // Diagnosis refs outside the current source/target evidence -> permanent invariant.
    const targetRef = diagnosis.detailedEvidenceRefs.find((ref) => ref.includes(":target:"))!;
    const forgedTargetRef = `${draft.questionId}:target:${"f".repeat(64)}`;
    const replaceTargetRefs = (refs: readonly string[]) => refs.map((ref) => ref === targetRef ? forgedTargetRef : ref);
    await expect(generateFreeTeaser({
      ...input,
      checkpoint: { ...diagnosisReady, q1DiagnosisDraft: {
        ...diagnosis,
        detailedEvidenceRefs: replaceTargetRefs(diagnosis.detailedEvidenceRefs),
        observableFactors: diagnosis.observableFactors.map((factor) => ({ ...factor, evidenceRefs: replaceTargetRefs(factor.evidenceRefs) })) as never,
        recommendedActions: diagnosis.recommendedActions.map((action) => ({ ...action, evidenceRefs: replaceTargetRefs(action.evidenceRefs) })) as never
      } },
      saveCheckpoint: vi.fn()
    })).rejects.toMatchObject({ name: "OrchestrationInvariantError", code: "orchestration_invariant", classification: "permanent" });
  });

  it("resumes each marked partial checkpoint without repeating an already durable expensive stage", async () => {
    const saved: FreeTeaserCheckpointV1[] = [];
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: async (checkpoint: FreeTeaserCheckpointV1) => { saved.push(checkpoint); }
    };
    await generateFreeTeaser(input);
    const observationsReady = saved[1]!;
    const answerReady = saved[2]!;
    const diagnosisReady = saved[3]!;

    mocks.prepare.mockClear();
    mocks.confirm.mockClear();
    mocks.answerWithSources.mockClear();
    mocks.enhanceDiagnosis.mockClear();
    mocks.semanticInvoke.mockClear();
    for (const invalid of [
      { ...answerReady, q1AnswerDraft: undefined },
      { ...answerReady, q1AnswerResult: undefined },
      { ...observationsReady, q1DiagnosisDraft: diagnosisReady.q1DiagnosisDraft }
    ]) {
      await expect(generateFreeTeaser({ ...input, checkpoint: invalid, saveCheckpoint: vi.fn() }))
        .rejects.toThrow(/stage shape/i);
    }
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.enhanceDiagnosis).not.toHaveBeenCalled();
    expect(mocks.semanticInvoke).not.toHaveBeenCalled();

    const draft = answerReady.q1AnswerDraft!;
    const diagnosis = diagnosisReady.q1DiagnosisDraft!;
    const targetRef = diagnosis.detailedEvidenceRefs.find((ref) => ref.includes(":target:"))!;
    const forgedTargetRef = `${draft.questionId}:target:${"f".repeat(64)}`;
    const replaceTargetRefs = (refs: readonly string[]) => refs.map((ref) => ref === targetRef ? forgedTargetRef : ref);
    const invalidContentCheckpoints: FreeTeaserCheckpointV1[] = [
      { ...answerReady, q1AnswerDraft: { ...draft, sources: draft.sources.map((source, index) => index === 0 ? { ...source, title: "Substituted source title" } : source) } },
      { ...answerReady, q1AnswerDraft: { ...draft, answerText: `${draft.answerText} altered` } },
      { ...answerReady, q1AnswerDraft: { ...draft, provenance: { ...draft.provenance, answerHash: "f".repeat(64) } } },
      { ...answerReady, q1AnswerDraft: { ...draft, provenance: { ...draft.provenance, searchedAt: "2030-01-01T00:00:09.000Z" } } },
      { ...diagnosisReady, q1DiagnosisDraft: { ...diagnosis, observableFactors: diagnosis.observableFactors.slice(0, 2) as never } },
      { ...diagnosisReady, q1DiagnosisDraft: {
        ...diagnosis,
        detailedEvidenceRefs: replaceTargetRefs(diagnosis.detailedEvidenceRefs),
        observableFactors: diagnosis.observableFactors.map((factor) => ({ ...factor, evidenceRefs: replaceTargetRefs(factor.evidenceRefs) })) as never,
        recommendedActions: diagnosis.recommendedActions.map((action) => ({ ...action, evidenceRefs: replaceTargetRefs(action.evidenceRefs) })) as never
      } }
    ];
    for (const invalid of invalidContentCheckpoints) {
      const invalidSave = vi.fn();
      await expect(generateFreeTeaser({ ...input, checkpoint: invalid, saveCheckpoint: invalidSave }))
        .rejects.toThrow(/answer draft|diagnosis/i);
      expect(invalidSave).not.toHaveBeenCalled();
    }
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.enhanceDiagnosis).not.toHaveBeenCalled();
    expect(mocks.semanticInvoke).not.toHaveBeenCalled();

    mocks.resolveSnapshot.mockClear();
    mocks.answerWithSources.mockClear();
    mocks.enhanceDiagnosis.mockClear();
    mocks.semanticInvoke.mockClear();
    await generateFreeTeaser({ ...input, checkpoint: observationsReady, saveCheckpoint: vi.fn() });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(5);

    mocks.resolveSnapshot.mockClear();
    mocks.answerWithSources.mockClear();
    mocks.enhanceDiagnosis.mockClear();
    mocks.semanticInvoke.mockClear();
    await generateFreeTeaser({ ...input, checkpoint: answerReady, saveCheckpoint: vi.fn() });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(1);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(5);

    mocks.resolveSnapshot.mockClear();
    mocks.answerWithSources.mockClear();
    mocks.enhanceDiagnosis.mockClear();
    mocks.semanticInvoke.mockClear();
    await generateFreeTeaser({ ...input, checkpoint: diagnosisReady, saveCheckpoint: vi.fn() });
    expect(mocks.resolveSnapshot).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.enhanceDiagnosis).not.toHaveBeenCalled();
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(5);
  });

  it("fails closed when the root marker and nested checkpoint shape disagree without invoking models", async () => {
    const baseInput = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      saveCheckpoint: vi.fn()
    };
    const legacy = await generateFreeTeaser(baseInput);
    const answerCalls = mocks.answerWithSources.mock.calls.length;
    const diagnosisCalls = mocks.enhanceDiagnosis.mock.calls.length;
    const reviewCalls = mocks.semanticInvoke.mock.calls.length;

    await expect(generateFreeTeaser({
      ...baseInput,
      checkpoint: legacy.checkpoint,
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).rejects.toThrow(/semantic-review lineage/i);

    await expect(generateFreeTeaser({
      ...baseInput,
      checkpoint: { ...legacy.checkpoint, semanticReview: {} as never }
    })).rejects.toThrow(/cannot consume a semantic-review checkpoint/i);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(answerCalls);
    expect(mocks.enhanceDiagnosis).toHaveBeenCalledTimes(diagnosisCalls);
    expect(mocks.semanticInvoke).toHaveBeenCalledTimes(reviewCalls);
  });

  it("runs the marked Free V4 resume matrix via the in-memory dry harness", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: sink.saveCheckpoint
    };

    await generateFreeTeaser(input);
    expect(sink.stageSequence()).toEqual([
      "questions_ready",
      "observations_ready",
      "q1_answer_ready",
      "q1_answer_ready",
      "ready"
    ]);

    const byKind = sink.firstByKind();
    const kinds = [
      "questions_ready",
      "observations_ready",
      "q1_answer_ready",
      "q1_diagnosis_ready",
      "ready"
    ] as const satisfies readonly FreeTeaserResumeKind[];
    for (const kind of kinds) {
      expect(byKind[kind], `missing durable checkpoint for ${kind}`).toBeDefined();
      expect(classifyFreeTeaserResumeKind(byKind[kind]!)).toBe(kind);
    }

    for (const kind of kinds) {
      mocks.resolveSnapshot.mockClear();
      mocks.answerWithSources.mockClear();
      mocks.enhanceDiagnosis.mockClear();
      mocks.semanticInvoke.mockClear();

      const resumeSink = createInMemoryFreeTeaserCheckpointSink();
      await generateFreeTeaser({
        ...input,
        checkpoint: byKind[kind]!,
        saveCheckpoint: resumeSink.saveCheckpoint
      });

      const observed = {
        resolveSnapshot: mocks.resolveSnapshot.mock.calls.length,
        answerWithSources: mocks.answerWithSources.mock.calls.length,
        enhanceDiagnosis: mocks.enhanceDiagnosis.mock.calls.length,
        semanticInvoke: mocks.semanticInvoke.mock.calls.length
      };
      const expected = expectedExpensiveCallsOnMarkedResume(kind);
      expect(
        matchesExpensiveCallBudget(observed, expected),
        `resume kind ${kind}: observed ${JSON.stringify(observed)} expected ${JSON.stringify(expected)}`
      ).toBe(true);
      expect(classifyFreeTeaserResumeKind(resumeSink.saved.at(-1) ?? byKind[kind]!)).toBe("ready");
    }
  });

  it("after typed diagnosis failure, resumes from q1_answer_ready without re-answering Q1", async () => {
    const sink = createInMemoryFreeTeaserCheckpointSink();
    const input = {
      reportId: "report-1",
      jobId: "job-1",
      targetUrl: "https://target.example/",
      foundation: combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport,
      locale: "zh" as const,
      admission: admission(),
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      saveCheckpoint: sink.saveCheckpoint
    };

    mocks.enhanceDiagnosis.mockResolvedValueOnce({
      status: "failed",
      providerAttempts: 1,
      failure: {
        stage: "semantic_contract",
        code: "invalid_semantic_output",
        parserPath: "$diagnosisSemanticOutput.targetGap"
      }
    });

    await expect(generateFreeTeaser(input)).rejects.toBeInstanceOf(FreeTeaserDiagnosisFailedError);

    const answerReady = sink.firstByKind().q1_answer_ready;
    expect(answerReady).toBeDefined();
    expect(answerReady!.q1DiagnosisDraft).toBeUndefined();
    expect(classifyFreeTeaserResumeKind(answerReady!)).toBe("q1_answer_ready");
    // Diagnosis failure must not persist a partial diagnosis or ready checkpoint.
    expect(sink.firstByKind().q1_diagnosis_ready).toBeUndefined();
    expect(sink.firstByKind().ready).toBeUndefined();

    mocks.resolveSnapshot.mockClear();
    mocks.answerWithSources.mockClear();
    mocks.enhanceDiagnosis.mockClear();
    mocks.semanticInvoke.mockClear();

    const resumed = await generateFreeTeaser({
      ...input,
      checkpoint: answerReady!,
      saveCheckpoint: createInMemoryFreeTeaserCheckpointSink().saveCheckpoint
    });

    expect(classifyFreeTeaserResumeKind(resumed.checkpoint)).toBe("ready");
    expect(matchesExpensiveCallBudget({
      resolveSnapshot: mocks.resolveSnapshot.mock.calls.length,
      answerWithSources: mocks.answerWithSources.mock.calls.length,
      enhanceDiagnosis: mocks.enhanceDiagnosis.mock.calls.length,
      semanticInvoke: mocks.semanticInvoke.mock.calls.length
    }, expectedExpensiveCallsOnMarkedResume("q1_answer_ready"))).toBe(true);
  });

  it("binds target evidence locations to the containing question", () => {
    const pages = buildFreeTeaserDiagnosisTargetPages("question-1", admission());
    expect(pages).toHaveLength(1);
    expect(pages[0]!.sourceLocations[0]!.locationId).toMatch(/^question-1:target:[a-f0-9]{64}$/u);
  });

  it("builds target evidence that passes the complete diagnosis-input customer-prose boundary", () => {
    const targetPages = buildFreeTeaserDiagnosisTargetPages("question-1", admission());
    expect(targetPages[0]!.relevanceReason)
      .toBe("The page contains directly verifiable information relevant to this question.");

    expect(() => parseReportV4DiagnosisInput({
      question: { questionId: "question-1", text: "Which service fits this route?" },
      answer: "The available service supports this route under stated conditions.",
      locale: "en",
      sources: [{
        questionId: "question-1",
        sourceId: "source-1",
        title: "Public service page",
        canonicalUrl: "https://public.example/service",
        excerpt: "The public page states the route conditions.",
        retrievalStatus: "available"
      }],
      targetPages
    })).not.toThrow();
  });
});

async function defaultMarketSnapshotBundle(snapshotId: string, originSuffix?: string) {
  const index = Number(snapshotId.replace("snapshot-", "")) - 1;
  const question = toCanonicalBuyerQuestionSet(questionSet()).questions[index]!;
  const baseFanout = fixtureFanouts(toCanonicalBuyerQuestionSet(questionSet()).questions)[index]!;
  const currentFanout: SearchQueryFanout = {
    ...baseFanout,
    queries: baseFanout.queries.slice(0, 3),
    budget: { ...baseFanout.budget, timeoutMs: 60_000 }
  };
  const fanout: SearchQueryFanout = originSuffix ? {
    ...currentFanout,
    questionId: `${currentFanout.questionId}-${originSuffix}`,
    questionSetVersion: `${currentFanout.questionSetVersion}-${originSuffix}`,
    queries: currentFanout.queries.map((query) => ({
      ...query,
      id: deterministicId("query", [query.id, originSuffix]),
      questionId: `${query.questionId}-${originSuffix}`
    }))
  } : currentFanout;
  const identity = createMarketSnapshotIdentity({ question, surface: fanout.surface, fanout });
  const queries = fanout.queries.map((query, queryOrder) => ({
    id: deterministicId("market-snapshot-query", [snapshotId, query.id]),
    snapshotId,
    queryOrder,
    queryText: query.exactQuery,
    queryHash: textHash(query.exactQuery),
    derivationRule: query.derivationRuleId,
    createdAt: new Date("2030-01-01T00:00:00.000Z")
  }));
  const attempts = queries.map((query, attemptIndex) => ({
    id: `${snapshotId}-attempt-${attemptIndex + 1}`,
    snapshotId,
    queryId: query.id,
    authorityVersion: "authority-1",
    attemptNumber: attemptIndex + 1,
    requestStatus: "succeeded",
    idempotencyReference: `${snapshotId}-attempt-ref-${attemptIndex + 1}`,
    usage: {},
    configuredCostMicros: 0,
    providerCostMicros: 0,
    costUncertain: false,
    sanitizedError: null,
    startedAt: new Date("2030-01-01T00:00:00.000Z"),
    completedAt: new Date("2030-01-01T00:00:01.000Z"),
    createdAt: new Date("2030-01-01T00:00:00.000Z")
  }));
  const queryFanoutHash = textHash(JSON.stringify({
    questionId: fanout.questionId,
    questionSetVersion: fanout.questionSetVersion,
    fanoutVersion: fanout.fanoutVersion,
    surface: fanout.surface,
    queries: fanout.queries.map(({ id, exactQuery, derivationRuleId, resultDepth }) => ({ id, exactQuery, derivationRuleId, resultDepth }))
  }));
  return {
    snapshot: {
      id: snapshotId,
      cacheIdentity: identity.id,
      status: "completed",
      normalizedQuestion: question.normalizedText,
      questionHash: textHash(question.normalizedText),
      locale: question.locale,
      region: question.region,
      surfaceAuthorityVersion: "authority-1",
      surfaceId: "surface-1",
      surfaceVersion: "surface-v1",
      fanoutVersion: "fanout-v1",
      snapshotKind: "standard_question",
      parentSnapshotId: null,
      candidateSetHash: null,
      queryPlanVersion: "fanout-v1",
      completionVersion: 1,
      queryFanoutHash,
      completedAt: new Date("2030-01-01T00:00:01.000Z"),
      createdAt: new Date("2030-01-01T00:00:00.000Z")
    },
    observations: [{
      id: `stored-result-${index + 1}`,
      snapshotId,
      queryId: queries[0]!.id,
      attemptId: attempts[0]!.id,
      surfaceResultOrder: 1,
      resultUrl: `https://competitor-${index + 1}.example/`,
      canonicalUrl: `https://competitor-${index + 1}.example/`,
      title: `Competitor ${index + 1}`,
      snippet: `Public result ${index + 1}`,
      resultStatus: "returned",
      resultMetadata: {},
      contentHash: textHash(`Public result ${index + 1}`),
      observedAt: new Date("2030-01-01T00:00:01.000Z"),
      createdAt: new Date("2030-01-01T00:00:01.000Z")
    }],
    queries,
    attempts,
    sources: []
  };
}

function semanticReviewBatchSlice(
  input: ReportSemanticReviewInput,
  batchId: "B_fields_readonly" | "B_fields_mutable" | "B_obs" | "B_answers" | "B_evidence_use" | undefined
): unknown {
  const full = semanticReviewPass(input);
  if (!batchId) return full;
  switch (batchId) {
    case "B_fields_readonly":
      return {
        fields: full.fields.filter((field) =>
          input.fields.find((manifest) => manifest.path === field.path)?.mutability === "read_only"
        )
      };
    case "B_fields_mutable":
      return {
        fields: full.fields.filter((field) =>
          input.fields.find((manifest) => manifest.path === field.path)?.mutability === "mutable"
        )
      };
    case "B_obs":
      return { observationResults: full.annotations.observationResults };
    case "B_answers":
      return { answers: full.annotations.answers };
    case "B_evidence_use":
      return { evidenceUse: full.annotations.evidenceUse };
    default:
      return full;
  }
}

function semanticReviewPass(input: ReportSemanticReviewInput): ReportSemanticReviewOutput {
  const global = input.evidencePolicy === "report_global_v1";
  const globalEvidenceIds = global
    ? [input.evidence.find(({ eligible }) => eligible === true)?.evidenceId].filter((id): id is string => Boolean(id))
    : undefined;
  const refs = (field: ReportSemanticReviewInput["fields"][number]) => ({
    evidenceIds: globalEvidenceIds ?? [...field.allowedEvidenceIds],
    sourceIds: global ? [] as string[] : [...field.allowedSourceIds]
  });
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT,
    inputHash: input.inputHash,
    providerId: input.expectedModel.providerId,
    modelId: input.expectedModel.modelId,
    fields: input.fields.map((field) => field.path === "q1AnswerCard.answerText" ? {
      path: field.path,
      originalTextHash: field.originalTextHash,
      decision: "corrected",
      correctedText: "已审阅的目标品牌跨境物流答案。",
      issueCodes: ["language_quality"],
      reason: "The answer needed a clearer direct response.",
      ...refs(field),
      ...(global ? { rejectedEvidence: [], rejectedSources: [] } : {}),
      retainedOriginalTerms: []
    } : field.path === "q1Diagnosis.selectionSummary" && field.originalText.includes("model selected") ? {
      path: field.path,
      originalTextHash: field.originalTextHash,
      decision: "corrected",
      correctedText: "Reviewed evidence-bound source selection.",
      issueCodes: ["unsupported_causal_claim"],
      reason: "The source selection description must remain evidence-bound.",
      ...refs(field),
      ...(global ? { rejectedEvidence: [], rejectedSources: [] } : {}),
      retainedOriginalTerms: []
    } : {
      path: field.path,
      originalTextHash: field.originalTextHash,
      decision: "pass",
      issueCodes: [],
      reason: "The prose is natural and faithful to its bound evidence.",
      ...refs(field),
      ...(global ? { rejectedEvidence: [], rejectedSources: [] } : {}),
      retainedOriginalTerms: []
    }),
    questionDistinctness: {
      decision: "distinct",
      duplicateGroups: [],
      reason: "The three questions request different buyer decisions."
    },
    annotations: {
      observationResults: input.observationResults.map((row, index) => ({
        observationId: row.observationId,
        resultId: row.resultId,
        targetPresence: index < 2 ? "present" : "absent",
        competitorPresence: index === 2 ? "present" : "absent",
        reason: "The exact persisted result was classified from its supplied text."
      })),
      answers: input.answerSubjects.map((subject) => {
        const field = input.fields.find(({ path }) => path === subject.fieldPath)!;
        return {
          questionId: subject.questionId,
          relevance: "responsive",
          entityRole: "mixed",
          targetPresence: "present",
          targetFirstSentence: 1,
          targetRoles: ["answer subject"],
          competitorEntityIds: input.entities.slice(0, 1).map(({ entityId }) => entityId),
          ...refs(field),
          reason: "The answer directly responds to the owned question."
        };
      }),
      evidenceUse: input.fields.map((field) => ({
        path: field.path,
        ...refs(field),
        reason: "Uses only the exact references bound to this field."
      }))
    },
    overallDecision: "corrected"
  };
}

function textHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function reorderJsonKeys<Value>(value: Value): Value {
  if (Array.isArray(value)) return value.map(reorderJsonKeys) as Value;
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, item]) => [key, reorderJsonKeys(item)])) as Value;
}

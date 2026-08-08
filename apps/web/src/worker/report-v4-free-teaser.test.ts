import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  type AiWebsiteReportV1
} from "@open-geo-console/ai-report-engine";
import {
  type ConfirmedBusinessQuestionSet
} from "@open-geo-console/public-search-observer";

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  confirm: vi.fn(),
  getConfirmed: vi.fn(),
  resolveRuntime: vi.fn(),
  answerWithSources: vi.fn(),
  structuredInvoke: vi.fn()
}));

vi.mock("@/db/business-questions", () => ({
  prepareBusinessQuestionCandidates: mocks.prepare,
  confirmBusinessQuestions: mocks.confirm,
  getConfirmedBusinessQuestionSet: mocks.getConfirmed
}));
vi.mock("@/db/public-search-authority", () => ({ getActivePublicSearchSurfaceAuthority: vi.fn() }));
vi.mock("@/db/market-snapshots", () => ({ getMarketSnapshotBundle: vi.fn() }));
vi.mock("@/public-source-forensics/production-runtime", () => ({
  resolveProductionPublicSearchRuntime: mocks.resolveRuntime,
  resolveGenerativeSearchAnswerProvider: () => ({
    providerId: "fixture-provider",
    model: "fixture-model",
    searchMode: "native_web_search",
    answerWithSources: mocks.answerWithSources
  })
}));
vi.mock("@/report-v4/mimo-provider", () => ({
  createReportV4MimoDiagnosisProvider: vi.fn(),
  buildReportV4MimoDiagnosisTokenBudget: vi.fn(),
  createReportV4MimoStructuredInvoker: () => ({ invoke: mocks.structuredInvoke })
}));
vi.mock("@/report-v4/model-runtime-config", () => ({
  loadReportV4ModelRuntimeConfig: () => ({ modelProfile: { operations: { sourceDiagnosis: { model: "fixture-model" } } } })
}));
vi.mock("@/provider-profile/runtime", () => ({
  getPreparedProviderProfileRuntime: () => ({
    profileId: "mimo_native",
    modelRuntime: { modelProfile: { operations: { sourceDiagnosis: { model: "fixture-model" }, websiteSynthesis: { model: "fixture-model" } } } },
    publicSearchRuntime: {
      authority: {
        authorityId: "authority-1",
        surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "en-US", region: "US" }
      },
      adapter: { id: "adapter-1" }
    },
    createQuestionAnswerProvider: () => ({
      providerId: "fixture-provider", model: "fixture-model", searchMode: "native_web_search",
      answerWithSources: mocks.answerWithSources
    }),
    createStructuredInvoker: () => ({ invoke: mocks.structuredInvoke }),
    createDiagnosisProvider: vi.fn()
  })
}));
vi.mock("./report-v4-diagnosis-enhancer", () => ({
  enhanceReportV4QuestionDiagnosis: vi.fn(),
  formatReportV4DiagnosisFailure: vi.fn()
}));
vi.mock("./public-source-forensics", () => ({ createPublicSourceQuestionFanouts: vi.fn() }));
vi.mock("./public-source-snapshot-resolver", () => ({ resolvePublicSourceSnapshot: vi.fn() }));

import {
  buildFreeTeaserDiagnosisTargetPages,
  FREE_V4_QUESTION_GENERATION_CONTRACT,
  FreeTeaserQuestionGenerationError,
  generateFreeTeaser,
  parseReadyFreeTeaserCheckpoint,
  type FreeTeaserCheckpointV1
} from "./report-v4-free-teaser";

const finalQuestionTexts = [
  "Which providers offer this service?",
  "Which providers serve this region?",
  "Which delivery risks should a buyer verify?"
] as const;

function modelQuestionOutput() {
  return {
    version: FREE_V4_QUESTION_GENERATION_CONTRACT,
    question: "Which provider best fits this buyer's actual need?"
  };
}

function candidateModelOutput() {
  return {
    questions: finalQuestionTexts.map((text, index) => ({
      purpose: ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][index],
      text
    }))
  };
}

function defaultAnalysisOutput() {
  return {
    summary: "The source supports the service claim, while the submitted site is not named in the answer.",
    observations: ["The answer names Provider A."],
    recommendations: ["Clarify the submitted site's service proof."],
    evidenceHandles: ["S1", "T1"],
    checkoutEligible: true,
    harmlessExtra: { naturalModelDetail: true }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  let persisted = confirmedQuestionSet();
  mocks.prepare.mockResolvedValue(candidateSet());
  mocks.confirm.mockImplementation(async (input: { finalTexts: string[] }) => {
    persisted = confirmedQuestionSet(input.finalTexts as unknown as typeof finalQuestionTexts);
    return persisted;
  });
  mocks.getConfirmed.mockImplementation(async () => persisted);
  mocks.resolveRuntime.mockResolvedValue({
    authority: {
      authorityId: "authority-1",
      surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "en-US", region: "US" }
    },
    adapter: { id: "adapter-1" }
  });
  mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => answerResult(request.questionId));
  mocks.structuredInvoke.mockImplementation(async (request: { operation: string; systemText: string }) => request.operation === "websiteSynthesis"
    ? request.systemText.includes("single free-preview") ? modelQuestionOutput() : candidateModelOutput()
    : defaultAnalysisOutput());
});

describe("Free V4 direct teaser orchestration", () => {
  it("asks the model for buyer questions before Q1 answer and analysis, with no code-authored fallback", async () => {
    const events: string[] = [];
    const questionGeneration = mocks.structuredInvoke.getMockImplementation()!;
    mocks.structuredInvoke.mockImplementation(async (request) => {
      events.push(request.operation === "websiteSynthesis" ? "question_generation" : "analysis");
      return questionGeneration(request);
    });
    const answer = mocks.answerWithSources.getMockImplementation()!;
    mocks.answerWithSources.mockImplementation(async (request) => {
      events.push("q1_answer");
      return answer(request);
    });
    const saved: FreeTeaserCheckpointV1[] = [];
    const result = await generateFreeTeaser({
      ...baseInput(),
      saveCheckpoint: async (checkpoint) => { saved.push(checkpoint); }
    });

    expect(events).toEqual(["question_generation", "question_generation", "q1_answer", "analysis"]);
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.structuredInvoke).toHaveBeenCalledTimes(3);
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.answerWithSources.mock.calls[0]![0]).toMatchObject({ semanticValidation: "free_direct" });
    expect(mocks.structuredInvoke.mock.calls[0]![0]).toMatchObject({ operation: "websiteSynthesis" });
    const freeQuestionPrompt = mocks.structuredInvoke.mock.calls[0]![0].systemText as string;
    const paidQuestionPrompt = mocks.structuredInvoke.mock.calls[1]![0].systemText as string;
    expect(freeQuestionPrompt).toContain("single free-preview question");
    expect(freeQuestionPrompt).toContain("primary service theme");
    expect(freeQuestionPrompt).toContain("ordinary work problem");
    expect(freeQuestionPrompt).toContain("prospective customer's point of view");
    expect(freeQuestionPrompt).toContain("provider-discovery question");
    expect(freeQuestionPrompt).toContain("贵公司");
    expect(freeQuestionPrompt).toContain("only when the website foundation supports it");
    expect(freeQuestionPrompt).toContain("silently self-check");
    expect(paidQuestionPrompt).toContain("primary service theme");
    expect(paidQuestionPrompt).toContain("ordinary work problem");
    expect(paidQuestionPrompt).toContain("core_service_discovery asks what companies or providers can solve");
    expect(paidQuestionPrompt).toContain("customer_region_fit asks what kind of service or solution fits");
    expect(paidQuestionPrompt).toContain("purchase_delivery_risk asks what the customer should compare or verify");
    expect(paidQuestionPrompt).toContain("same prospective-customer identity");
    expect(paidQuestionPrompt).toContain("贵公司");
    expect(paidQuestionPrompt).toContain("silently self-check");
    expect(paidQuestionPrompt).not.toContain("Do not review, score, explain, or correct them");
    expect(JSON.parse(mocks.structuredInvoke.mock.calls[0]![0].inputText)).toMatchObject({
      locale: "en-US", region: "US", websiteFoundation: { organizationProfile: { organizationName: "Target Co" } }
    });
    expect(mocks.prepare.mock.calls[0]![0]).toMatchObject({ modelOutput: candidateModelOutput(), preserveModelText: true });
    expect(mocks.structuredInvoke.mock.calls[2]![0]).toMatchObject({ operation: "sourceDiagnosis" });
    expect(mocks.structuredInvoke.mock.calls[2]![0].inputText).toContain('"handle":"S1"');
    expect(JSON.parse(mocks.structuredInvoke.mock.calls[2]![0].inputText)).toMatchObject({
      targetIdentity: {
        canonicalName: "Target Co",
        aliases: ["Target Co"],
        domain: "target.example"
      }
    });
    expect(mocks.structuredInvoke.mock.calls[2]![0].systemText).toContain("targetIdentity");
    expect(result.q1AnswerCore.answerText).toContain("Provider A");
    expect(result.checkpoint.directAnalysis?.observations).toHaveLength(1);
    expect(result.checkpoint.directAnalysisReceipt).toBeDefined();
    expect(result.freeQuestion).toBe(modelQuestionOutput().question);
    expect(result.checkpoint.paidQuestionSetId).toBe(candidateSet().id);
    expect(saved.map(({ stage }) => stage)).toEqual(["questions_ready", "q1_answer_ready", "ready"]);
    expect(saved[1]!.directCoreReceipt).toBeDefined();
    expect(saved[1]!.directAnalysisStatus).toBeUndefined();
  });

  it("accepts zero sources and variable empty analysis lists", async () => {
    mocks.answerWithSources.mockImplementationOnce(async (request: { questionId: string }) => ({
      ...answerResult(request.questionId),
      answerText: "A complete answer without provider annotations.",
      sources: []
    }));
    mocks.structuredInvoke.mockImplementation(async (request: { operation: string; systemText: string }) => request.operation === "websiteSynthesis"
      ? request.systemText.includes("single free-preview") ? modelQuestionOutput() : candidateModelOutput()
      : {
      summary: "No annotated source was returned, so the source basis is limited.",
      observations: [], recommendations: [], evidenceHandles: [], checkoutEligible: false,
      extraNarrative: "ignored"
      });
    const result = await generateFreeTeaser(baseInput());
    expect(result.q1AnswerCore.sources).toEqual([]);
    expect(result.checkpoint.directAnalysisStatus).toBe("completed");
    expect(result.checkpoint.directAnalysis).toMatchObject({ observations: [], recommendations: [] });
  });

  it("retains same-response annotations on a normalized provider refusal through checkpoint receipts", async () => {
    mocks.answerWithSources.mockImplementationOnce(async (request: { questionId: string }) => ({
      ...answerResult(request.questionId),
      answerText: "",
      refusal: { code: "provider_refusal", reason: "The provider returned a nonstandard refusal." }
    }));
    mocks.structuredInvoke.mockImplementation(async (request: { operation: string; systemText: string }) => request.operation === "websiteSynthesis"
      ? request.systemText.includes("single free-preview") ? modelQuestionOutput() : candidateModelOutput()
      : {
      summary: "The provider returned a refusal; no target judgment is available.",
      observations: [], recommendations: [], evidenceHandles: ["S1"], checkoutEligible: false
      });
    const result = await generateFreeTeaser(baseInput());
    expect(result.q1AnswerCore.status).toBe("refused");
    expect(result.q1AnswerCore.sources).toHaveLength(1);
    expect(result.q1AnswerCore.refusal?.code).toBe("provider_refusal");
    expect(result.checkpoint.directAnalysisStatus).toBe("completed");
    expect(result.checkpoint.directCoreReceipt).toBeDefined();
  });

  it.each([
    ["wrong version", { version: "wrong", question: "A question" }],
    ["blank question", { version: FREE_V4_QUESTION_GENERATION_CONTRACT, question: "" }]
  ])("fails before persistence when the free question payload has %s", async (_label, output) => {
    mocks.structuredInvoke.mockResolvedValueOnce(output);
    const saveCheckpoint = vi.fn();

    await expect(generateFreeTeaser({ ...baseInput(), saveCheckpoint })).rejects.toBeInstanceOf(
      FreeTeaserQuestionGenerationError
    );
    expect(mocks.structuredInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(saveCheckpoint).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown handle", {
      summary: "Analysis.", observations: [], recommendations: [], evidenceHandles: ["S99"], checkoutEligible: true
    }],
    ["missing minimum field", {
      summary: "Analysis.", observations: [], recommendations: [], checkoutEligible: true
    }]
  ])("keeps the receipt-verified Q1 core when analysis has %s", async (_label, rawAnalysis) => {
    mocks.structuredInvoke.mockImplementation(async (request: { operation: string; systemText: string }) => request.operation === "websiteSynthesis" ? request.systemText.includes("single free-preview") ? modelQuestionOutput() : candidateModelOutput() : rawAnalysis);
    const result = await generateFreeTeaser(baseInput());
    expect(result.q1AnswerCore.answerText).toContain("Provider A");
    expect(result.checkpoint.directCoreReceipt).toBeDefined();
    expect(result.checkpoint.directAnalysisStatus).toBe("incomplete");
    expect(result.checkpoint.directAnalysis).toBeUndefined();
    expect(result.checkpoint.directAnalysisReceipt).toBeUndefined();
  });

  it("turns one analysis transport failure into a terminal limited projection without retry", async () => {
    mocks.structuredInvoke.mockImplementation(async (request: { operation: string; systemText: string }) => request.operation === "websiteSynthesis" ? request.systemText.includes("single free-preview") ? modelQuestionOutput() : candidateModelOutput() : Promise.reject(new Error("provider unavailable")));
    const result = await generateFreeTeaser(baseInput());
    expect(result.checkpoint.stage).toBe("ready");
    expect(result.checkpoint.directAnalysisStatus).toBe("incomplete");
    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.structuredInvoke).toHaveBeenCalledTimes(3);
  });

  it("resumes questions_ready without regenerating either question set", async () => {
    const saved: FreeTeaserCheckpointV1[] = [];
    await generateFreeTeaser({ ...baseInput(), saveCheckpoint: async (checkpoint) => { saved.push(checkpoint); } });
    const questionsReady = saved[0]!;
    vi.clearAllMocks();
    mocks.resolveRuntime.mockResolvedValue({
      authority: { authorityId: "authority-1", surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "en-US", region: "US" } },
      adapter: { id: "adapter-1" }
    });
    mocks.answerWithSources.mockImplementation(async (request: { questionId: string }) => answerResult(request.questionId));
    mocks.structuredInvoke.mockImplementation(async () => defaultAnalysisOutput());

    const resumed = await generateFreeTeaser({ ...baseInput(), checkpoint: questionsReady });

    expect(mocks.answerWithSources).toHaveBeenCalledTimes(1);
    expect(mocks.structuredInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.structuredInvoke.mock.calls[0]![0]).toMatchObject({ operation: "sourceDiagnosis" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(resumed.checkpoint.freeQuestion).toBe(questionsReady.freeQuestion);
    expect(resumed.checkpoint.freeQuestionIdentity).toBe(questionsReady.freeQuestionIdentity);
    expect(resumed.checkpoint.paidQuestionSetId).toBe(questionsReady.paidQuestionSetId);
  });

  it("resumes q1_answer_ready without repeating questions or the grounded answer", async () => {
    const saved: FreeTeaserCheckpointV1[] = [];
    await generateFreeTeaser({ ...baseInput(), saveCheckpoint: async (checkpoint) => { saved.push(checkpoint); } });
    const answerReady = saved[1]!;
    vi.clearAllMocks();
    mocks.resolveRuntime.mockResolvedValue({
      authority: { authorityId: "authority-1", surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "en-US", region: "US" } },
      adapter: { id: "adapter-1" }
    });
    mocks.structuredInvoke.mockImplementation(async () => defaultAnalysisOutput());

    const resumed = await generateFreeTeaser({ ...baseInput(), checkpoint: answerReady });

    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.structuredInvoke).toHaveBeenCalledTimes(1);
    expect(mocks.structuredInvoke.mock.calls[0]![0]).toMatchObject({ operation: "sourceDiagnosis" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(resumed.checkpoint.freeQuestionIdentity).toBe(answerReady.freeQuestionIdentity);
  });

  it("reads an already ready Direct checkpoint without repeating either call", async () => {
    const first = await generateFreeTeaser(baseInput());
    vi.clearAllMocks();
    mocks.resolveRuntime.mockResolvedValue({
      authority: { authorityId: "authority-1", surface: { surfaceId: "surface-1", surfaceVersion: "surface-v1", locale: "en-US", region: "US" } },
      adapter: { id: "adapter-1" }
    });
    const second = await generateFreeTeaser({ ...baseInput(), checkpoint: first.checkpoint });
    expect(second.checkpoint).toEqual(first.checkpoint);
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.structuredInvoke).not.toHaveBeenCalled();
  });

  it("fails closed on core or analysis tampering", async () => {
    const result = await generateFreeTeaser(baseInput());
    expect(() => parseReadyFreeTeaserCheckpoint({
      ...result.checkpoint,
      q1AnswerDraft: { ...result.checkpoint.q1AnswerDraft!, answerText: "TAMPERED" }
    }, { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION })).toThrow();
    expect(() => parseReadyFreeTeaserCheckpoint({
      ...result.checkpoint,
      directAnalysis: { ...result.checkpoint.directAnalysis!, summary: "TAMPERED" }
    }, { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION })).toThrow();
    expect(() => parseReadyFreeTeaserCheckpoint({
      ...result.checkpoint,
      freeQuestion: "TAMPERED"
    }, { freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION })).toThrow();
  });

  it("rejects new unreviewed legacy Free generation before any semantic or provider work", async () => {
    const { freeDirectSemanticsVersion: _directVersion, ...legacyInput } = baseInput();
    void _directVersion;
    await expect(generateFreeTeaser(legacyInput)).rejects.toThrow(
      /legacy Free generation requires model-owned semantic review/i
    );
    expect(mocks.structuredInvoke).not.toHaveBeenCalled();
    expect(mocks.answerWithSources).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(legacyInput.saveCheckpoint).not.toHaveBeenCalled();
  });

  it("binds target evidence locations to the containing question", () => {
    const pages = buildFreeTeaserDiagnosisTargetPages("question-1", admission());
    expect(pages[0]!.sourceLocations[0]!.locationId).toMatch(/^question-1:target:[a-f0-9]{64}$/u);
  });
});

function baseInput() {
  return {
    reportId: "report-1", jobId: "job-1", targetUrl: "https://target.example/",
    foundation: foundation(), locale: "en" as const, admission: admission(),
    freeDirectSemanticsVersion: FREE_V4_DIRECT_SEMANTICS_VERSION,
    saveCheckpoint: vi.fn()
  };
}

function answerResult(questionId: string) {
  return {
    questionId,
    answerText: "MODEL_FINAL_ANSWER: Provider A offers the requested service.",
    sources: [{
      sourceId: "source-1", title: "Provider service page", canonicalUrl: "https://provider.example/service",
      registrableDomain: "provider.example", citedText: "Provider A offers the requested service.", providerResultOrder: 0
    }],
    refusal: null,
    searchedAt: "2030-01-01T00:00:02.000Z", completedAt: "2030-01-01T00:00:03.000Z",
    providerResponseId: "response-1"
  };
}

function candidateSet() {
  return {
    id: "candidate-questions", revision: 1, version: "business-questions-v1", locale: "en-US", region: "US",
    confidence: "high", requiresAcknowledgement: false, profileEvidenceIdentity: "profile-1", identityExclusions: ["Target Co"],
    questions: finalQuestionTexts.map((text, index) => ({
      purpose: ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][index],
      generatedText: text, neutralPublicText: text, evidenceUrls: [], service: "service", audience: "buyers", marketRegion: "US"
    }))
  };
}

function confirmedQuestionSet(texts: readonly [string, string, string] = finalQuestionTexts): ConfirmedBusinessQuestionSet {
  const candidate = candidateSet();
  return {
    ...candidate, id: "confirmed-questions", acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z",
    contentHash: `confirmed-business-question-set-${"d".repeat(64)}`,
    questions: candidate.questions.map((question, index) => ({
      ...question, privateText: texts[index], neutralPublicText: texts[index], edited: false,
      neutralizationVersion: "identity-neutral-v1", neutralContentHash: `neutral-${index + 1}`
    })) as unknown as ConfirmedBusinessQuestionSet["questions"]
  } as ConfirmedBusinessQuestionSet;
}

function foundation(): AiWebsiteReportV1 {
  return {
    version: 1, tier: "free", targetUrl: "https://target.example/",
    organizationProfile: {
      organizationName: "Target Co", brandNames: ["Target Co"], summary: "Target provides a business service.",
      businessModel: "B2B", productsAndServices: ["Business service"], capabilities: ["Delivery"],
      targetAudiences: ["Business buyers"], marketsAndRegions: ["US"], legalEntity: null,
      identityConsistency: "consistent", ownershipVerification: "not-performed", confidence: "high", evidence: []
    },
    executiveSummary: { overview: "Overview", strengths: [], keyRisks: [], topPriorities: [] },
    dimensionScores: [], pageTypeAnalyses: [], findings: [], roadmap: { immediate: [], nextPhase: [], ongoing: [] },
    coverage: { discoveredPages: 1, plannedPages: 1, analyzedPages: 1, failedPages: 0, samplingMethod: "homepage", pageTypesCovered: ["home"], limitations: [] },
    provenance: { reportVersion: 1, modelId: "fixture", promptVersion: "fixture", locale: "en", generatedAt: "2030-01-01T00:00:00.000Z", contentHash: "a".repeat(64) }
  };
}

function admission() {
  return {
    snapshot: {
      id: "admission-1", reportId: "report-1", siteKey: "target.example", collectorConfigIdentityHash: "a".repeat(64),
      capturedAt: new Date("2030-01-01T00:00:00.000Z"), status: "completed" as const,
      completedAt: new Date("2030-01-01T00:00:01.000Z"), contentIdentityHash: "b".repeat(64),
      candidateUrlCount: 1, analyzablePageCount: 1, excludedPageCount: 0, createdAt: new Date("2030-01-01T00:00:00.000Z")
    },
    pages: [{
      id: "target-page-1", ordinal: 1, normalizedUrl: "https://target.example/service", analyzable: true,
      readMode: "direct" as const, summary: "The target describes related capabilities without delivery conditions.",
      contentHash: "c".repeat(64), exclusionReason: null, snapshotId: "admission-1", retainedText: null,
      createdAt: new Date("2030-01-01T00:00:00.000Z")
    }]
  };
}

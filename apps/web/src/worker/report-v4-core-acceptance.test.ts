import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ModelTokenBudgetError,
  type ModelTokenBudgetInput
} from "@open-geo-console/ai-report-engine";
import type {
  ReportV4QuestionCheckpoint,
  ReportV4QuestionCheckpointInitializeInput,
  ReportV4QuestionCheckpointRepository,
  ReportV4QuestionCheckpointSaveAnsweredInput
} from "../db/report-v4-question-checkpoints";
import type { ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import type { ReportV4MimoSiteSynthesisProvider } from "../report-v4/mimo-site-synthesis-provider";
import { answerReportV4Questions, type ReportV4QuestionAnswerProvider } from "./report-v4-question-answerer";
import {
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserver
} from "./report-v4-acceptance-observer";
import type { ReportV4AcceptanceFaultController } from "./report-v4-acceptance-fault-controller";
import type { ReportV4CoreStageDependencies } from "./report-v4-orchestrator";
import {
  createReportV4CoreAcceptanceRuntime,
  observeReportV4CoreWebsiteBudgetRejection,
  withReportV4CoreAcceptancePageProvider,
  withReportV4CoreAcceptanceQuestions,
  withReportV4CoreAcceptanceStageDependencies,
  withReportV4CoreAcceptanceWebsiteProvider,
  type ReportV4CoreAcceptanceRuntime
} from "./report-v4-core-acceptance";

// @requirement GEO-V4-ACCEPT-01
// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02

describe("Report V4 Core acceptance production wrappers", () => {
  it("returns null without a session environment and never resolves acceptance state", async () => {
    const createObserver = vi.fn();
    const createFaultController = vi.fn();

    await expect(createReportV4CoreAcceptanceRuntime({
      environment: { NODE_ENV: "test" },
      coreJobId: "core-job",
      createObserver,
      createFaultController
    })).resolves.toBeNull();

    expect(createObserver).not.toHaveBeenCalled();
    expect(createFaultController).not.toHaveBeenCalled();
  });

  it("binds an active question-failure runtime to the exact Core job and immutable baseline", async () => {
    const scenario = acceptanceScenario("question_failure");
    const observer = runtimeFor("question_failure").observer;
    Object.assign(observer, { scenario });
    const faultController = runtimeFor("question_failure").faultController!;
    const createObserver = vi.fn(async () => observer);
    const createFaultController = vi.fn(async () => faultController);
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      OGC_REPORT_V4_ACCEPTANCE_SESSION_ID: scenario.sessionId
    };

    const runtime = await createReportV4CoreAcceptanceRuntime({
      environment,
      coreJobId: "core-job",
      createObserver,
      createFaultController
    });

    expect(runtime).toMatchObject({ observer, faultController });
    expect(runtime!.baselineFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(createObserver).toHaveBeenCalledExactlyOnceWith({ jobId: "core-job", environment });
    expect(createFaultController).toHaveBeenCalledExactlyOnceWith({ jobId: "core-job", environment });

    const driftedObserver = { ...observer, scenario: { ...scenario, coreJobId: "other-core" } } as ReportV4AcceptanceObserver;
    await expect(createReportV4CoreAcceptanceRuntime({
      environment,
      coreJobId: "core-job",
      createObserver: vi.fn(async () => driftedObserver),
      createFaultController
    })).rejects.toThrow(/exact Core job/i);
  });

  it("leaves original providers, repositories, and stage dependencies untouched without a runtime", () => {
    const pageProvider = siteProvider();
    const websiteProvider = siteProvider();
    const originalQuestionProvider = questionProvider();
    const repository = new MemoryCheckpointRepository();
    const stageDependencies = stageDependenciesFor();

    expect(withReportV4CoreAcceptancePageProvider({
      provider: pageProvider,
      runtime: null,
      tokenBudget: () => acceptedBudget()
    })).toBe(pageProvider);
    expect(withReportV4CoreAcceptanceWebsiteProvider({
      provider: websiteProvider,
      runtime: null,
      tokenBudget: () => acceptedBudget()
    })).toBe(websiteProvider);
    expect(withReportV4CoreAcceptanceQuestions({
      repository,
      provider: originalQuestionProvider,
      runtime: null,
      coreJobId: "core-job",
      questions: questionSpecs()
    })).toEqual({ repository, provider: originalQuestionProvider });
    expect(withReportV4CoreAcceptanceStageDependencies({
      dependencies: stageDependencies,
      runtime: null,
      coreArtifactRevisionId: "core-artifact"
    })).toBe(stageDependencies);
  });

  it("claims page analysis before the provider and records deterministic budget estimates", async () => {
    const order: string[] = [];
    const runtime = runtimeFor("success", {
      claimExternalIo: vi.fn(async (event) => {
        order.push("claim");
        return { event, inserted: true } as never;
      }),
      finishExternalIo: vi.fn(async (event) => {
        order.push(`finish:${event.phase}`);
        return { event, inserted: true } as never;
      })
    });
    const provider = siteProvider({
      analyzePage: vi.fn(async (input) => {
        order.push("provider");
        return { ...input.context, chunks: [] };
      })
    });
    const wrapped = withReportV4CoreAcceptancePageProvider({
      provider,
      runtime,
      tokenBudget: () => acceptedBudget()
    });

    await wrapped.analyzePage(pageInput(), new AbortController().signal);

    expect(order).toEqual(["claim", "provider", "finish:completed"]);
    expect(runtime.observer.claimExternalIo).toHaveBeenCalledExactlyOnceWith({
      kind: "model_operation",
      operation: "page_analysis",
      unitId: "page-1",
      attempt: 1,
      phase: "started",
      details: {
        providerCall: true,
        retry: false,
        budgetOutcome: "allowed",
        inputTokens: 12,
        outputTokens: 5
      }
    });
  });

  it("rejects page and website over-budget work with providerCall=false and no provider execution", async () => {
    const runtime = runtimeFor("success");
    const pageProvider = siteProvider();
    const wrappedPage = withReportV4CoreAcceptancePageProvider({
      provider: pageProvider,
      runtime,
      tokenBudget: () => rejectedBudget()
    });

    await expect(wrappedPage.analyzePage(pageInput(), new AbortController().signal))
      .rejects.toBeInstanceOf(ModelTokenBudgetError);
    await expect(observeReportV4CoreWebsiteBudgetRejection({
      runtime,
      unitId: "websiteSynthesis",
      tokenBudget: rejectedBudget()
    })).rejects.toBeInstanceOf(ModelTokenBudgetError);

    expect(pageProvider.analyzePage).not.toHaveBeenCalled();
    expect(runtime.observer.claimExternalIo).toHaveBeenNthCalledWith(1, expect.objectContaining({
      operation: "page_analysis",
      attempt: 0,
      phase: "started",
      details: expect.objectContaining({ providerCall: false, budgetOutcome: "rejected" })
    }));
    expect(runtime.observer.claimExternalIo).toHaveBeenNthCalledWith(2, expect.objectContaining({
      operation: "website_synthesis",
      attempt: 0,
      phase: "started",
      details: expect.objectContaining({ providerCall: false, budgetOutcome: "rejected" })
    }));
    expect(runtime.observer.finishExternalIo).toHaveBeenNthCalledWith(1, expect.objectContaining({ phase: "rejected" }));
    expect(runtime.observer.finishExternalIo).toHaveBeenNthCalledWith(2, expect.objectContaining({ phase: "rejected" }));
  });

  it("claims website synthesis before its supplied provider and blocks a duplicate physical call", async () => {
    const provider = siteProvider();
    const runtime = runtimeFor("success");
    const wrapped = withReportV4CoreAcceptanceWebsiteProvider({
      provider,
      runtime,
      tokenBudget: () => acceptedBudget()
    });
    const websiteInput = { targetUrl: "https://example.com/", locale: "en", pages: [] };

    await wrapped.synthesizeWebsite(websiteInput, new AbortController().signal);
    expect(provider.synthesizeWebsite).toHaveBeenCalledTimes(1);

    const duplicateProvider = siteProvider();
    const duplicateRuntime = runtimeFor("success", {
      claimExternalIo: vi.fn(async () => { throw new ReportV4AcceptanceIndeterminateOperationError(); })
    });
    const duplicate = withReportV4CoreAcceptanceWebsiteProvider({
      provider: duplicateProvider,
      runtime: duplicateRuntime,
      tokenBudget: () => acceptedBudget()
    });
    await expect(duplicate.synthesizeWebsite(websiteInput, new AbortController().signal))
      .rejects.toBeInstanceOf(ReportV4AcceptanceIndeterminateOperationError);
    expect(duplicateProvider.synthesizeWebsite).not.toHaveBeenCalled();
  });

  it("injects the exact question twice, leaves siblings unchanged, and terminalizes every attempt", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = questionProvider();
    const runtime = runtimeFor("question_failure", {
      consume: vi.fn(async (context) => (context.questionId === "q2"
        ? { status: "inject", fault: "question_failure", occurrence: context.occurrence, event: {} } as never
        : { status: "not_targeted", reason: "question" }) as never)
    });
    const wrapped = withReportV4CoreAcceptanceQuestions({
      repository,
      provider,
      runtime,
      coreJobId: "core-job",
      questions: questionSpecs()
    });

    const result = await answerReportV4Questions({
      reportId: "report",
      jobId: "core-job",
      questionSetId: "question-set",
      snapshotId: "snapshot",
      modelConfigIdentityHash: "a".repeat(64),
      locale: "en",
      region: "US",
      questions: questionSpecs(),
      repository: wrapped.repository,
      provider: wrapped.provider
    });

    expect(result.questions.map(({ status }) => status)).toEqual(["answered", "unavailable", "answered"]);
    expect(provider.answerWithSources).toHaveBeenCalledTimes(2);
    expect(vi.mocked(provider.answerWithSources).mock.calls.map(([request]) => request.questionId).sort())
      .toEqual(["q1", "q3"]);
    expect(runtime.faultController!.consume).toHaveBeenNthCalledWith(1, {
      jobId: "core-job", questionId: "q2", occurrence: 1, baselineFingerprint: "b".repeat(64)
    });
    expect(runtime.faultController!.consume).toHaveBeenNthCalledWith(2, {
      jobId: "core-job", questionId: "q2", occurrence: 2, baselineFingerprint: "b".repeat(64)
    });
    expect(repository.byOrdinal(1).providerCallCount).toBe(1);
    expect(repository.byOrdinal(2).providerCallCount).toBe(2);
    expect(repository.byOrdinal(3).providerCallCount).toBe(1);
    const targetTerminals = vi.mocked(runtime.observer.finishExternalIo).mock.calls
      .map(([event]) => event)
      .filter((event) => event.operation === "question_answer" && event.unitId === "q2");
    expect(targetTerminals).toEqual([]);
    const targetClaims = vi.mocked(runtime.observer.claimExternalIo).mock.calls
      .map(([event]) => event)
      .filter((event) => event.operation === "question_answer" && event.unitId === "q2");
    expect(targetClaims).toEqual([]);
    const checkpointEvents = vi.mocked(runtime.observer.observe).mock.calls
      .map(([event]) => event)
      .filter((event) => event.kind === "checkpoint_terminal");
    expect(checkpointEvents).toHaveLength(3);
    expect(checkpointEvents.map((event) => [event.operation, event.unitId, event.details.state]))
      .toEqual(expect.arrayContaining([
        ["question_answer", expect.any(String), "answered"],
        ["question_answer", expect.any(String), "unavailable"],
        ["question_answer", expect.any(String), "answered"]
      ]));
    expect(checkpointEvents.every((event) => /^[a-f0-9]{64}$/u.test(event.details.checkpointHash))).toBe(true);
  });

  it("records question budget rejection without provider execution", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = questionProvider();
    const runtime = runtimeFor("success");
    const specs = questionSpecs().map((question, index) => index === 0
      ? { ...question, tokenBudget: rejectedBudget() }
      : question) as ReturnType<typeof questionSpecs>;
    const wrapped = withReportV4CoreAcceptanceQuestions({
      repository,
      provider,
      runtime,
      coreJobId: "core-job",
      questions: specs
    });

    const result = await answerReportV4Questions({
      reportId: "report", jobId: "core-job", questionSetId: "question-set", snapshotId: "snapshot",
      modelConfigIdentityHash: "a".repeat(64), locale: "en", region: "US", questions: specs,
      repository: wrapped.repository, provider: wrapped.provider
    });

    expect(result.questions[0].status).toBe("unavailable");
    expect(vi.mocked(provider.answerWithSources).mock.calls.map(([request]) => request.questionId).sort())
      .toEqual(["q2", "q3"]);
    expect(runtime.observer.claimExternalIo).toHaveBeenCalledWith(expect.objectContaining({
      operation: "question_answer", unitId: "q1", attempt: 0,
      details: expect.objectContaining({ providerCall: false, budgetOutcome: "rejected" })
    }));
    expect(runtime.observer.finishExternalIo).toHaveBeenCalledWith(expect.objectContaining({
      operation: "question_answer", unitId: "q1", attempt: 0, phase: "rejected"
    }));
  });

  it("blocks a provider when an exact question attempt was already started", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = questionProvider();
    const runtime = runtimeFor("success", {
      claimExternalIo: vi.fn(async (event) => {
        if (event.operation === "question_answer" && event.unitId === "q1") {
          throw new ReportV4AcceptanceIndeterminateOperationError();
        }
        return { event, inserted: true } as never;
      })
    });
    const wrapped = withReportV4CoreAcceptanceQuestions({
      repository, provider, runtime, coreJobId: "core-job", questions: questionSpecs()
    });

    await expect(answerReportV4Questions({
      reportId: "report", jobId: "core-job", questionSetId: "question-set", snapshotId: "snapshot",
      modelConfigIdentityHash: "a".repeat(64), locale: "en", region: "US", questions: questionSpecs(),
      repository: wrapped.repository, provider: wrapped.provider
    })).rejects.toBeInstanceOf(ReportV4AcceptanceIndeterminateOperationError);

    expect(vi.mocked(provider.answerWithSources).mock.calls.some(([request]) => request.questionId === "q1"))
      .toBe(false);
    expect(repository.byOrdinal(1).providerCallCount).toBe(1);
    expect(repository.byOrdinal(1).state).toBe("answering");
  });

  it("fails closed on a recovered nonterminal checkpoint whose provider attempt was already claimed", async () => {
    const persisted = new MemoryCheckpointRepository();
    const repository: ReportV4QuestionCheckpointRepository = {
      ...persisted,
      async initialize(input) {
        const initialized = await persisted.initialize(input);
        return initialized.map((checkpoint, index) => index === 0 ? {
          ...checkpoint,
          state: "answering" as const,
          providerCallCount: 1 as const
        } : checkpoint) as [ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint];
      },
      load: persisted.load.bind(persisted),
      recordProviderCall: persisted.recordProviderCall.bind(persisted),
      saveAnswered: persisted.saveAnswered.bind(persisted),
      markUnavailable: persisted.markUnavailable.bind(persisted)
    };
    const provider = questionProvider();
    const runtime = runtimeFor("success");
    const wrapped = withReportV4CoreAcceptanceQuestions({
      repository, provider, runtime, coreJobId: "core-job", questions: questionSpecs()
    });

    await expect(answerReportV4Questions({
      reportId: "report", jobId: "core-job", questionSetId: "question-set", snapshotId: "snapshot",
      modelConfigIdentityHash: "a".repeat(64), locale: "en", region: "US", questions: questionSpecs(),
      repository: wrapped.repository, provider: wrapped.provider
    })).rejects.toBeInstanceOf(ReportV4AcceptanceIndeterminateOperationError);

    expect(provider.answerWithSources).not.toHaveBeenCalled();
    expect(runtime.observer.claimExternalIo).not.toHaveBeenCalled();
  });

  it("observes terminal checkpoint recovery without provider calls and with stable payloads", async () => {
    const persisted = new MemoryCheckpointRepository();
    const repository: ReportV4QuestionCheckpointRepository = {
      ...persisted,
      async initialize(input) {
        const initialized = await persisted.initialize(input);
        return initialized.map((checkpoint) => ({
          ...checkpoint,
          state: "answered" as const,
          providerCallCount: 1 as const,
          answerPayload: { order: checkpoint.ordinal, questionId: checkpoint.questionId, questionText: `Question ${checkpoint.ordinal}?`, status: "answered" as const, answer: `Persisted ${checkpoint.questionId}` },
          sourcePayload: [],
          answerContentHash: sha(JSON.stringify({ answerPayload: { order: checkpoint.ordinal, questionId: checkpoint.questionId, questionText: `Question ${checkpoint.ordinal}?`, status: "answered" as const, answer: `Persisted ${checkpoint.questionId}` }, sourcePayload: [] }))
        })) as [ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint];
      },
      load: persisted.load.bind(persisted), recordProviderCall: persisted.recordProviderCall.bind(persisted),
      saveAnswered: persisted.saveAnswered.bind(persisted), markUnavailable: persisted.markUnavailable.bind(persisted)
    };
    const provider = questionProvider();
    const runtime = runtimeFor("success");
    const wrapped = withReportV4CoreAcceptanceQuestions({ repository, provider, runtime, coreJobId: "core-job", questions: questionSpecs() });
    const request = { reportId: "report", jobId: "core-job", questionSetId: "question-set", snapshotId: "snapshot", modelConfigIdentityHash: "a".repeat(64), locale: "en", region: "US", questions: questionSpecs(), repository: wrapped.repository, provider: wrapped.provider };
    await answerReportV4Questions(request);
    await answerReportV4Questions(request);
    const events = vi.mocked(runtime.observer.observe).mock.calls.map(([event]) => event).filter((event) => event.kind === "checkpoint_terminal");
    expect(events).toHaveLength(6);
    expect(events.slice(0, 3)).toEqual(events.slice(3));
    expect(events.every((event) => event.operation === "question_answer" && /^[a-f0-9]{64}$/u.test(event.unitId) && /^[a-f0-9]{64}$/u.test(event.details.checkpointHash))).toBe(true);
    expect(provider.answerWithSources).not.toHaveBeenCalled();
  });

  it("deterministically replays an already-consumed question fault without provider or model claim", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = questionProvider();
    const runtime = runtimeFor("question_failure", {
      consume: vi.fn(async (context) => (context.questionId === "q2"
        ? { status: "already_consumed", fault: "question_failure", occurrence: context.occurrence }
        : { status: "not_targeted", reason: "question" }) as never)
    });
    const wrapped = withReportV4CoreAcceptanceQuestions({
      repository, provider, runtime, coreJobId: "core-job", questions: questionSpecs()
    });

    const result = await answerReportV4Questions({
      reportId: "report", jobId: "core-job", questionSetId: "question-set", snapshotId: "snapshot",
      modelConfigIdentityHash: "a".repeat(64), locale: "en", region: "US", questions: questionSpecs(),
      repository: wrapped.repository, provider: wrapped.provider
    });

    expect(result.questions[1].status).toBe("unavailable");
    expect(vi.mocked(provider.answerWithSources).mock.calls.some(([request]) => request.questionId === "q2"))
      .toBe(false);
    expect(runtime.faultController!.consume).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runtime.observer.claimExternalIo).mock.calls
      .some(([event]) => event.operation === "question_answer" && event.unitId === "q2")).toBe(false);
    expect(vi.mocked(runtime.observer.finishExternalIo).mock.calls
      .some(([event]) => event.operation === "question_answer" && event.unitId === "q2")).toBe(false);
  });

  it("repairs a rejected budget terminal after a crash without provider execution", async () => {
    const provider = siteProvider();
    const runtime = runtimeFor("success", {
      claimExternalIo: vi.fn(async () => { throw new ReportV4AcceptanceIndeterminateOperationError(); })
    });
    const wrapped = withReportV4CoreAcceptancePageProvider({
      provider,
      runtime,
      tokenBudget: () => rejectedBudget()
    });

    await expect(wrapped.analyzePage(pageInput(), new AbortController().signal))
      .rejects.toBeInstanceOf(ModelTokenBudgetError);

    expect(provider.analyzePage).not.toHaveBeenCalled();
    expect(runtime.observer.finishExternalIo).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      operation: "page_analysis",
      unitId: "page-1",
      attempt: 0,
      phase: "rejected",
      details: expect.objectContaining({ providerCall: false, budgetOutcome: "rejected" })
    }));
  });

  it("observes real Core persistence and activation and repairs missing events from persisted recovery", async () => {
    const runtime = runtimeFor("success");
    const dependencies = stageDependenciesFor();
    const wrapped = withReportV4CoreAcceptanceStageDependencies({
      dependencies,
      runtime,
      coreArtifactRevisionId: "core-artifact"
    });
    const html = "<html><body>Core report</body></html>";

    const persisted = await wrapped.persistCoreArtifact({ report: {} as never, html });
    await wrapped.activateCoreRevision({
      artifactRevisionId: "core-artifact", reportId: "report", orderId: "order", jobId: "core-job",
      configSnapshotId: "config", payloadIdentityHash: persisted.payloadIdentityHash,
      htmlSha256: persisted.htmlSha256
    });
    await wrapped.activateCoreRevision({
      artifactRevisionId: "core-artifact", reportId: "report", orderId: "order", jobId: "core-job",
      configSnapshotId: "config", payloadIdentityHash: persisted.payloadIdentityHash,
      htmlSha256: persisted.htmlSha256
    });
    await wrapped.loadCoreArtifact({ reportId: "report", coreArtifactRevisionId: "core-artifact" });

    expect(dependencies.persistCoreArtifact).toHaveBeenCalledTimes(1);
    expect(dependencies.activateCoreRevision).toHaveBeenCalledTimes(2);
    expect(runtime.observer.observe).toHaveBeenCalledWith({
      kind: "html_assembly", operation: "core_html", unitId: "core-artifact", attempt: 0, phase: "started",
      details: { artifactRevisionId: "core-artifact", htmlSha256: sha(html) }
    });
    expect(runtime.observer.observe).toHaveBeenCalledWith({
      kind: "html_assembly", operation: "core_html", unitId: "core-artifact", attempt: 0, phase: "completed",
      details: { artifactRevisionId: "core-artifact", htmlSha256: sha(html) }
    });
    expect(runtime.observer.observe).toHaveBeenCalledWith({
      kind: "artifact_activation", operation: "artifact_activation", unitId: "core-artifact", attempt: 0,
      phase: "observed", details: { artifactRevisionId: "core-artifact", htmlSha256: sha(html) }
    });
    const activationEvents = vi.mocked(runtime.observer.observe).mock.calls
      .map(([event]) => event)
      .filter((event) => event.kind === "artifact_activation");
    expect(activationEvents).toHaveLength(2);
    expect(activationEvents[1]).toEqual(activationEvents[0]);
  });
});

function runtimeFor(
  kind: "success" | "question_failure",
  overrides: {
    claimExternalIo?: ReportV4AcceptanceObserver["claimExternalIo"];
    finishExternalIo?: ReportV4AcceptanceObserver["finishExternalIo"];
    consume?: ReportV4AcceptanceFaultController["consume"];
  } = {}
): ReportV4CoreAcceptanceRuntime {
  const observer = {
    session: {},
    scenario: { kind, faultQuestionId: "q2" } as ReportV4AcceptanceScenario,
    observe: vi.fn(async (event) => ({ event, inserted: true }) as never),
    claimExternalIo: overrides.claimExternalIo ?? vi.fn(async (event) => ({ event, inserted: true }) as never),
    finishExternalIo: overrides.finishExternalIo ?? vi.fn(async (event) => ({ event, inserted: true }) as never)
  } as unknown as ReportV4AcceptanceObserver;
  const faultController = kind === "question_failure" ? {
    mode: "active" as const,
    consume: overrides.consume ?? vi.fn(async () => ({ status: "not_targeted", reason: "question" }))
  } as ReportV4AcceptanceFaultController : null;
  return { observer, faultController, baselineFingerprint: "b".repeat(64) };
}

function acceptanceScenario(kind: "question_failure"): ReportV4AcceptanceScenario {
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    scenarioId: "22222222-2222-4222-8222-222222222222",
    reportId: "report",
    orderId: "order",
    preAdmissionJobId: "pre-job",
    coreJobId: "core-job",
    enhancementJobId: null,
    siteSnapshotId: "snapshot",
    configSnapshotId: "config",
    questionSetId: "question-set",
    coreArtifactRevisionId: "core-artifact",
    enhancementArtifactRevisionId: null,
    kind,
    faultKind: "question_failure",
    faultQuestionId: "q2",
    faultSourceId: null,
    expectedFaultOccurrences: 2,
    baselineFingerprint: null,
    finalFingerprint: null,
    state: "collecting",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    terminalAt: null
  };
}

function acceptedBudget(): ModelTokenBudgetInput {
  return {
    contextWindowTokens: 100,
    maxInputTokens: 50,
    maxOutputTokens: 20,
    estimatedSystemTokens: 3,
    estimatedInputTokens: 9,
    reservedOutputTokens: 5,
    providerSafetyMarginTokens: 2
  };
}

function rejectedBudget(): ModelTokenBudgetInput {
  return { ...acceptedBudget(), maxInputTokens: 8 };
}

function pageInput() {
  return {
    context: {
      pageId: "page-1",
      url: "https://example.com/",
      contentHash: "a".repeat(64),
      readability: "direct_readable" as const,
      sourceLength: 4
    },
    retainedText: "text"
  };
}

function siteProvider(
  overrides: Partial<ReportV4MimoSiteSynthesisProvider> = {}
): ReportV4MimoSiteSynthesisProvider {
  return {
    analyzePage: vi.fn(async (input) => ({ ...input.context, chunks: [] })),
    synthesizeWebsite: vi.fn(async () => ({
      summary: "Summary", strengths: [], gaps: [], actions: []
    })),
    ...overrides
  };
}

function questionProvider(): ReportV4QuestionAnswerProvider {
  return {
    providerId: "provider",
    model: "model",
    searchMode: "search",
    answerWithSources: vi.fn(async (request) => ({
      questionId: request.questionId,
      answerText: `Answer for ${request.question}`,
      sources: [{
        sourceId: "source-1",
        title: "Source",
        canonicalUrl: `https://${request.questionId}.example/source`,
        registrableDomain: `${request.questionId}.example`,
        citedText: "Evidence.",
        providerResultOrder: 0
      }],
      refusal: null,
      searchedAt: "2030-01-01T00:00:00.000Z",
      completedAt: "2030-01-01T00:00:01.000Z",
      providerResponseId: `response-${request.questionId}`
    }))
  };
}

function questionSpecs() {
  return ([1, 2, 3] as const).map((order) => ({
    order,
    questionId: `q${order}`,
    question: `Question ${order}?`,
    tokenBudget: acceptedBudget()
  })) as [
    { order: 1; questionId: string; question: string; tokenBudget: ModelTokenBudgetInput },
    { order: 2; questionId: string; question: string; tokenBudget: ModelTokenBudgetInput },
    { order: 3; questionId: string; question: string; tokenBudget: ModelTokenBudgetInput }
  ];
}

function stageDependenciesFor(): ReportV4CoreStageDependencies {
  const html = "<html><body>Core report</body></html>";
  return {
    nowMs: () => 0,
    nowIso: () => "2030-01-01T00:00:00.000Z",
    loadCoreArtifact: vi.fn(async () => ({
      report: {} as never,
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: sha(html)
    })),
    resolveSnapshot: vi.fn(),
    synthesizeWebsite: vi.fn(),
    answerQuestions: vi.fn(),
    renderCoreHtml: vi.fn(),
    prepareCoreRevision: vi.fn(),
    persistCoreArtifact: vi.fn(async () => ({
      payloadIdentityHash: "c".repeat(64),
      htmlSha256: sha(html)
    })),
    activateCoreRevision: vi.fn(),
    terminalizeUnavailableCore: vi.fn(),
    terminalizeDeliverableCoreAndEnqueueEnhancement: vi.fn()
  };
}

class MemoryCheckpointRepository implements ReportV4QuestionCheckpointRepository {
  private readonly rows = new Map<number, ReportV4QuestionCheckpoint>();

  async initialize(input: ReportV4QuestionCheckpointInitializeInput) {
    if (this.rows.size === 0) {
      for (const seed of input.checkpoints) {
        this.rows.set(seed.ordinal, {
          ...seed,
          state: "queued",
          providerCallCount: 0,
          answerPayload: null,
          sourcePayload: [],
          answerContentHash: null
        });
      }
    }
    return this.ordered();
  }

  async load(jobId: string) {
    return this.ordered().filter((row) => row.jobId === jobId);
  }

  async recordProviderCall(input: { identityHash: string; expectedProviderCallCount: number }) {
    const row = this.byIdentity(input.identityHash);
    if (row.providerCallCount !== input.expectedProviderCallCount || row.providerCallCount >= 2) {
      throw new Error("Provider attempt conflict.");
    }
    const providerCallCount = row.providerCallCount + 1 as 1 | 2;
    const next = {
      ...row,
      state: providerCallCount === 1 ? "answering" as const : "retrying" as const,
      providerCallCount
    };
    this.rows.set(next.ordinal, next);
    return next;
  }

  async saveAnswered(input: ReportV4QuestionCheckpointSaveAnsweredInput) {
    const row = this.byIdentity(input.identityHash);
    const next = { ...row, ...input, state: "answered" as const };
    this.rows.set(next.ordinal, next);
    return next;
  }

  async markUnavailable(input: { identityHash: string; providerCallCount: number }) {
    const row = this.byIdentity(input.identityHash);
    const next = {
      ...row,
      state: "unavailable" as const,
      providerCallCount: input.providerCallCount as 0 | 1 | 2,
      answerPayload: null,
      sourcePayload: [],
      answerContentHash: null
    };
    this.rows.set(next.ordinal, next);
    return next;
  }

  byOrdinal(ordinal: number): ReportV4QuestionCheckpoint {
    return this.rows.get(ordinal)!;
  }

  private byIdentity(identityHash: string): ReportV4QuestionCheckpoint {
    const row = this.ordered().find((candidate) => candidate.identityHash === identityHash);
    if (!row) throw new Error("Checkpoint not found.");
    return row;
  }

  private ordered(): [ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint] {
    return [this.rows.get(1), this.rows.get(2), this.rows.get(3)].filter(Boolean) as [
      ReportV4QuestionCheckpoint,
      ReportV4QuestionCheckpoint,
      ReportV4QuestionCheckpoint
    ];
  }
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

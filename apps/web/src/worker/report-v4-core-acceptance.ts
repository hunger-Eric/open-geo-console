import { createHash } from "node:crypto";
import {
  evaluateModelTokenBudget,
  ModelTokenBudgetError,
  type ModelTokenBudgetInput
} from "@open-geo-console/ai-report-engine";
import type { ReportV4QuestionCheckpointRepository } from "../db/report-v4-question-checkpoints";
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "../report-v4/report-v4-acceptance-fingerprints";
import type {
  ReportV4MimoPageAnalysisInput,
  ReportV4MimoSiteSynthesisProvider,
  ReportV4MimoWebsiteSynthesisInput
} from "../report-v4/mimo-site-synthesis-provider";
import {
  createReportV4AcceptanceObserver,
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserver,
  type ReportV4AcceptanceObserverEvent
} from "./report-v4-acceptance-observer";
import {
  createReportV4AcceptanceFaultController,
  type ReportV4AcceptanceFaultController
} from "./report-v4-acceptance-fault-controller";
import {
  ReportV4QuestionProviderError,
  type ReportV4QuestionAnswerProvider,
  type ReportV4QuestionSpec
} from "./report-v4-question-answerer";
import type { ReportV4CoreStageDependencies } from "./report-v4-orchestrator";

export interface ReportV4CoreAcceptanceRuntime {
  readonly observer: ReportV4AcceptanceObserver;
  readonly faultController: ReportV4AcceptanceFaultController | null;
  readonly baselineFingerprint: string | null;
}

export async function createReportV4CoreAcceptanceRuntime(input: {
  readonly environment: NodeJS.ProcessEnv;
  readonly coreJobId: string;
  readonly createObserver?: typeof createReportV4AcceptanceObserver;
  readonly createFaultController?: typeof createReportV4AcceptanceFaultController;
}): Promise<ReportV4CoreAcceptanceRuntime | null> {
  const sessionId = input.environment.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
  if (sessionId === undefined || sessionId === "") return null;

  const observer = await (input.createObserver ?? createReportV4AcceptanceObserver)({
    jobId: input.coreJobId,
    environment: input.environment
  });
  if (!observer || observer.scenario.coreJobId !== input.coreJobId) {
    throw new Error("The Report V4 Core acceptance runtime requires the scenario's exact Core job.");
  }
  const faultController = observer.scenario.kind === "question_failure"
    ? await (input.createFaultController ?? createReportV4AcceptanceFaultController)({
        jobId: input.coreJobId,
        environment: input.environment
      })
    : null;
  return Object.freeze({
    observer,
    faultController,
    baselineFingerprint: observer.scenario.kind === "question_failure"
      ? computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(observer.scenario)
      : null
  });
}

export function withReportV4CoreAcceptancePageProvider(input: {
  readonly provider: ReportV4MimoSiteSynthesisProvider;
  readonly runtime: ReportV4CoreAcceptanceRuntime | null;
  readonly tokenBudget: (providerInput: ReportV4MimoPageAnalysisInput) => ModelTokenBudgetInput;
}): ReportV4MimoSiteSynthesisProvider {
  if (!input.runtime) return input.provider;
  return {
    analyzePage: async (providerInput, signal) => executeModelOperation({
      runtime: input.runtime!,
      operation: "page_analysis",
      unitId: providerInput.context.pageId,
      attempt: 1,
      tokenBudget: input.tokenBudget(providerInput),
      signal,
      call: () => input.provider.analyzePage(providerInput, signal)
    }),
    synthesizeWebsite: input.provider.synthesizeWebsite.bind(input.provider)
  };
}

export function withReportV4CoreAcceptanceWebsiteProvider(input: {
  readonly provider: ReportV4MimoSiteSynthesisProvider;
  readonly runtime: ReportV4CoreAcceptanceRuntime | null;
  readonly tokenBudget: (providerInput: ReportV4MimoWebsiteSynthesisInput) => ModelTokenBudgetInput;
}): ReportV4MimoSiteSynthesisProvider {
  if (!input.runtime) return input.provider;
  return {
    analyzePage: input.provider.analyzePage.bind(input.provider),
    synthesizeWebsite: async (providerInput, signal) => executeModelOperation({
      runtime: input.runtime!,
      operation: "website_synthesis",
      unitId: "websiteSynthesis",
      attempt: 1,
      tokenBudget: input.tokenBudget(providerInput),
      signal,
      call: () => input.provider.synthesizeWebsite(providerInput, signal)
    })
  };
}

export async function observeReportV4CoreWebsiteBudgetRejection(input: {
  readonly runtime: ReportV4CoreAcceptanceRuntime | null;
  readonly unitId: string;
  readonly tokenBudget: ModelTokenBudgetInput;
}): Promise<void> {
  if (!input.runtime) return;
  const evaluated = evaluateModelTokenBudget(input.tokenBudget);
  if (evaluated.accepted) return;
  throw await observeRejectedModelOperation({
    runtime: input.runtime,
    operation: "website_synthesis",
    unitId: input.unitId,
    tokenBudget: input.tokenBudget
  });
}

export function withReportV4CoreAcceptanceQuestions(input: {
  readonly repository: ReportV4QuestionCheckpointRepository;
  readonly provider: ReportV4QuestionAnswerProvider;
  readonly runtime: ReportV4CoreAcceptanceRuntime | null;
  readonly coreJobId: string;
  readonly questions: readonly ReportV4QuestionSpec[];
}): {
  readonly repository: ReportV4QuestionCheckpointRepository;
  readonly provider: ReportV4QuestionAnswerProvider;
} {
  if (!input.runtime) return { repository: input.repository, provider: input.provider };

  const questions = new Map(input.questions.map((question) => [question.questionId, question]));
  if (questions.size !== input.questions.length) throw new TypeError("Core acceptance question IDs must be unique.");
  const identities = new Map<string, string>();
  const activeAttempts = new Map<string, {
    readonly attempt: 1 | 2;
    readonly event: Extract<ReportV4AcceptanceObserverEvent, { kind: "model_operation" }>;
  }>();
  const indeterminateQuestions = new Set<string>();
  const runtime = input.runtime;

  const repository: ReportV4QuestionCheckpointRepository = {
    async initialize(value) {
      const initialized = await input.repository.initialize(value);
      for (const checkpoint of initialized) {
        if (!questions.has(checkpoint.questionId)) {
          throw new Error("A Core acceptance checkpoint does not belong to an exact requested question.");
        }
        identities.set(checkpoint.identityHash, checkpoint.questionId);
      }
      if (initialized.some((checkpoint) => checkpoint.providerCallCount > 0
        && checkpoint.state !== "answered" && checkpoint.state !== "unavailable")) {
        throw new ReportV4AcceptanceIndeterminateOperationError();
      }
      return initialized;
    },
    load: input.repository.load.bind(input.repository),
    async recordProviderCall(value) {
      const questionId = requiredQuestionIdentity(identities, value.identityHash);
      const question = questions.get(questionId)!;
      const evaluated = evaluateModelTokenBudget(question.tokenBudget);
      if (!evaluated.accepted) {
        throw new Error("A rejected Core question budget cannot authorize a provider call.");
      }
      const attempt = (value.expectedProviderCallCount + 1) as 1 | 2;
      if (attempt !== 1 && attempt !== 2) throw new Error("Core question attempts are limited to one retry.");
      const event = modelEvent({
        operation: "question_answer",
        unitId: questionId,
        attempt,
        phase: "started",
        providerCall: true,
        budgetOutcome: "allowed",
        tokenBudget: question.tokenBudget
      });
      const checkpoint = await input.repository.recordProviderCall(value);
      activeAttempts.set(questionId, { attempt, event });
      return checkpoint;
    },
    saveAnswered: input.repository.saveAnswered.bind(input.repository),
    async markUnavailable(value) {
      const questionId = requiredQuestionIdentity(identities, value.identityHash);
      if (indeterminateQuestions.has(questionId)) {
        throw new ReportV4AcceptanceIndeterminateOperationError();
      }
      if (value.providerCallCount === 0) {
        const question = questions.get(questionId)!;
        const evaluated = evaluateModelTokenBudget(question.tokenBudget);
        if (!evaluated.accepted) {
          await observeRejectedModelOperation({
            runtime,
            operation: "question_answer",
            unitId: questionId,
            tokenBudget: question.tokenBudget
          });
        }
      }
      return input.repository.markUnavailable(value);
    }
  };

  const provider: ReportV4QuestionAnswerProvider = {
    providerId: input.provider.providerId,
    model: input.provider.model,
    searchMode: input.provider.searchMode,
    async answerWithSources(providerInput) {
      const active = activeAttempts.get(providerInput.questionId);
      if (!active) throw new Error("A Core question provider call requires its exact claimed checkpoint attempt.");
      try {
        if (runtime.observer.scenario.kind === "question_failure"
          && providerInput.questionId === runtime.observer.scenario.faultQuestionId) {
          if (!runtime.faultController) {
            throw new Error("The question-failure scenario requires an active Core fault controller.");
          }
          if (!runtime.baselineFingerprint) {
            throw new Error("The question-failure scenario requires its exact immutable fault baseline.");
          }
          const fault = await runtime.faultController.consume({
            jobId: input.coreJobId,
            questionId: providerInput.questionId,
            occurrence: active.attempt,
            baselineFingerprint: runtime.baselineFingerprint
          });
          if (fault.status === "inject" && fault.fault !== "question_failure") {
            throw new Error("The Core question boundary received a non-question acceptance fault.");
          }
          if (fault.status === "inject" || fault.status === "already_consumed") {
            throw new ReportV4QuestionProviderError(
              "temporary_provider",
              "Protected staging replayed a bounded Report V4 question provider failure."
            );
          }
        }
        try {
          await runtime.observer.claimExternalIo(active.event);
        } catch (error) {
          if (error instanceof ReportV4AcceptanceIndeterminateOperationError) {
            indeterminateQuestions.add(providerInput.questionId);
          }
          throw error;
        }
        let result: unknown;
        try {
          result = await input.provider.answerWithSources(providerInput);
          providerInput.signal.throwIfAborted();
        } catch (error) {
          await runtime.observer.finishExternalIo({ ...active.event, phase: "failed" });
          throw error;
        }
        await runtime.observer.finishExternalIo({ ...active.event, phase: "completed" });
        return result;
      } finally {
        activeAttempts.delete(providerInput.questionId);
      }
    }
  };
  return { repository, provider };
}

export function withReportV4CoreAcceptanceStageDependencies(input: {
  readonly dependencies: ReportV4CoreStageDependencies;
  readonly runtime: ReportV4CoreAcceptanceRuntime | null;
  readonly coreArtifactRevisionId: string;
}): ReportV4CoreStageDependencies {
  if (!input.runtime) return input.dependencies;
  const runtime = input.runtime;
  return {
    ...input.dependencies,
    async loadCoreArtifact(value) {
      const existing = await input.dependencies.loadCoreArtifact(value);
      if (existing) {
        await observeHtml(runtime, input.coreArtifactRevisionId, existing.htmlSha256, "started");
        await observeHtml(runtime, input.coreArtifactRevisionId, existing.htmlSha256, "completed");
      }
      return existing;
    },
    async persistCoreArtifact(value) {
      const htmlSha256 = sha256(value.html);
      await observeHtml(runtime, input.coreArtifactRevisionId, htmlSha256, "started");
      let persisted: Awaited<ReturnType<ReportV4CoreStageDependencies["persistCoreArtifact"]>>;
      try {
        persisted = await input.dependencies.persistCoreArtifact(value);
      } catch (error) {
        await observeHtml(runtime, input.coreArtifactRevisionId, htmlSha256, "failed");
        throw error;
      }
      if (persisted.htmlSha256 !== htmlSha256) {
        await observeHtml(runtime, input.coreArtifactRevisionId, htmlSha256, "failed");
        throw new Error("The persisted Core HTML hash differs from the exact rendered HTML.");
      }
      await observeHtml(runtime, input.coreArtifactRevisionId, htmlSha256, "completed");
      return persisted;
    },
    async activateCoreRevision(value, signal) {
      const result = await input.dependencies.activateCoreRevision(value, signal);
      await runtime.observer.observe({
        kind: "artifact_activation",
        operation: "artifact_activation",
        unitId: input.coreArtifactRevisionId,
        attempt: 0,
        phase: "observed",
        details: {
          artifactRevisionId: input.coreArtifactRevisionId,
          htmlSha256: value.htmlSha256
        }
      });
      return result;
    }
  };
}

async function executeModelOperation<Result>(input: {
  readonly runtime: ReportV4CoreAcceptanceRuntime;
  readonly operation: "page_analysis" | "website_synthesis";
  readonly unitId: string;
  readonly attempt: 1;
  readonly tokenBudget: ModelTokenBudgetInput;
  readonly signal: AbortSignal;
  readonly call: () => Promise<Result>;
}): Promise<Result> {
  input.signal.throwIfAborted();
  const evaluated = evaluateModelTokenBudget(input.tokenBudget);
  if (!evaluated.accepted) {
    throw await observeRejectedModelOperation(input);
  }
  const event = modelEvent({
    operation: input.operation,
    unitId: input.unitId,
    attempt: input.attempt,
    phase: "started",
    providerCall: true,
    budgetOutcome: "allowed",
    tokenBudget: input.tokenBudget
  });
  await input.runtime.observer.claimExternalIo(event);
  let result: Result;
  try {
    result = await input.call();
    input.signal.throwIfAborted();
  } catch (error) {
    await input.runtime.observer.finishExternalIo({ ...event, phase: "failed" });
    throw error;
  }
  await input.runtime.observer.finishExternalIo({ ...event, phase: "completed" });
  return result;
}

async function observeRejectedModelOperation(input: {
  readonly runtime: ReportV4CoreAcceptanceRuntime;
  readonly operation: "page_analysis" | "website_synthesis" | "question_answer";
  readonly unitId: string;
  readonly tokenBudget: ModelTokenBudgetInput;
}): Promise<ModelTokenBudgetError> {
  const evaluated = evaluateModelTokenBudget(input.tokenBudget);
  if (evaluated.accepted) throw new Error("Only a rejected deterministic budget may emit a rejected model event.");
  const event = modelEvent({
    operation: input.operation,
    unitId: input.unitId,
    attempt: 0,
    phase: "started",
    providerCall: false,
    budgetOutcome: "rejected",
    tokenBudget: input.tokenBudget
  });
  try {
    await input.runtime.observer.claimExternalIo(event);
  } catch (error) {
    if (!(error instanceof ReportV4AcceptanceIndeterminateOperationError)) throw error;
  }
  await input.runtime.observer.finishExternalIo({ ...event, phase: "rejected" });
  return new ModelTokenBudgetError(evaluated);
}

function modelEvent(input: {
  readonly operation: "page_analysis" | "website_synthesis" | "question_answer";
  readonly unitId: string;
  readonly attempt: 0 | 1 | 2;
  readonly phase: "started";
  readonly providerCall: boolean;
  readonly budgetOutcome: "allowed" | "rejected";
  readonly tokenBudget: ModelTokenBudgetInput;
}): Extract<ReportV4AcceptanceObserverEvent, { kind: "model_operation" }> {
  return {
    kind: "model_operation",
    operation: input.operation,
    unitId: input.unitId,
    attempt: input.attempt,
    phase: input.phase,
    details: {
      providerCall: input.providerCall,
      retry: input.attempt === 2,
      budgetOutcome: input.budgetOutcome,
      // These are deterministic pre-call budget estimates, never vendor-reported usage.
      inputTokens: deterministicInputEstimate(input.tokenBudget),
      outputTokens: deterministicEstimate(input.tokenBudget.reservedOutputTokens)
    }
  };
}

function deterministicInputEstimate(budget: ModelTokenBudgetInput): number {
  const total = budget.estimatedSystemTokens + budget.estimatedInputTokens;
  return deterministicEstimate(total);
}

function deterministicEstimate(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

async function observeHtml(
  runtime: ReportV4CoreAcceptanceRuntime,
  artifactRevisionId: string,
  htmlSha256: string,
  phase: "started" | "completed" | "failed"
): Promise<void> {
  await runtime.observer.observe({
    kind: "html_assembly",
    operation: "core_html",
    unitId: artifactRevisionId,
    attempt: 0,
    phase,
    details: { artifactRevisionId, htmlSha256 }
  });
}

function requiredQuestionIdentity(identities: Map<string, string>, identityHash: string): string {
  const questionId = identities.get(identityHash);
  if (!questionId) throw new Error("A Core acceptance checkpoint identity is not initialized.");
  return questionId;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

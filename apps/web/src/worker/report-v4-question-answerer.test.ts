import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ReportV4QuestionCheckpoint,
  ReportV4QuestionCheckpointInitializeInput,
  ReportV4QuestionCheckpointRepository,
  ReportV4QuestionCheckpointSaveAnsweredInput
} from "../db/report-v4-question-checkpoints";
import {
  ReportV4QuestionProviderError,
  answerReportV4Questions,
  type ReportV4QuestionAnswerProvider,
  type ReportV4QuestionAnswererInput
} from "./report-v4-question-answerer";

// @requirement GEO-V4-ANSWER-01
// @requirement GEO-V4-ANSWER-02
describe("V4 local question answerer", () => {
  it("requires exactly three ordered questions and sends three independent provider inputs", async () => {
    const repository = new MemoryCheckpointRepository();
    const providerInputs: Array<Record<string, unknown>> = [];
    const provider = providerFrom(async (request) => {
      providerInputs.push({ ...request, signal: undefined });
      return providerAnswer(request.questionId, request.question, 6);
    });

    const result = await answerReportV4Questions({ ...answererInput(repository, provider), questions: questions() });

    expect(result.questions.map(({ order, questionId, status }) => ({ order, questionId, status }))).toEqual([
      { order: 1, questionId: "question-1", status: "answered" },
      { order: 2, questionId: "question-2", status: "answered" },
      { order: 3, questionId: "question-3", status: "answered" }
    ]);
    expect(providerInputs).toEqual(questions().map(({ questionId, question }) => ({
      questionId,
      question,
      locale: "en-US",
      region: "US",
      signal: undefined
    })));
    expect(result.questions.every(({ sources }) => sources.length === 5)).toBe(true);
    for (const question of result.questions) {
      expect(question.sources.every((source) => source.questionId === question.questionId && source.sourceId.startsWith(`${question.questionId}:`))).toBe(true);
    }

    await expect(answerReportV4Questions({ ...answererInput(new MemoryCheckpointRepository(), provider), questions: questions().slice(0, 2) })).rejects.toThrow(/exactly three/i);
    await expect(answerReportV4Questions({ ...answererInput(new MemoryCheckpointRepository(), provider), questions: [questions()[1]!, questions()[0]!, questions()[2]!] })).rejects.toThrow(/ordered|order/i);
  });

  it("serializes provider calls across questions to respect the locked runtime lane", async () => {
    const repository = new MemoryCheckpointRepository();
    let active = 0;
    let maximumActive = 0;
    const provider = providerFrom(async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return providerAnswer(request.questionId, request.question);
    });

    await answerReportV4Questions(answererInput(repository, provider));

    expect(maximumActive).toBe(1);
    expect(provider.calls.map(({ questionId }) => questionId)).toEqual(["question-1", "question-2", "question-3"]);
  });

  it("restores immutable answered checkpoints and skips their provider calls", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async (request) => providerAnswer(request.questionId, request.question));
    const initial = await answerReportV4Questions(answererInput(repository, provider));
    const preserved = structuredClone(repository.byOrdinal(1));
    provider.calls.length = 0;

    const resumed = await answerReportV4Questions(answererInput(repository, provider));

    expect(resumed.reusedQuestionIds).toEqual(["question-1", "question-2", "question-3"]);
    expect(provider.calls).toHaveLength(0);
    expect(repository.byOrdinal(1)).toEqual(preserved);
    expect(resumed.questions).toEqual(initial.questions);
  });

  it("retries only the failed question once and never reruns sibling questions or the whole report", async () => {
    const repository = new MemoryCheckpointRepository();
    const attempts = new Map<string, number>();
    const provider = providerFrom(async (request) => {
      const attempt = (attempts.get(request.questionId) ?? 0) + 1;
      attempts.set(request.questionId, attempt);
      if (request.questionId === "question-1" && attempt === 1) throw new ReportV4QuestionProviderError("transport", "temporary network failure");
      if (request.questionId === "question-2") throw new ReportV4QuestionProviderError("authentication", "invalid credentials");
      return providerAnswer(request.questionId, request.question);
    });

    const result = await answerReportV4Questions(answererInput(repository, provider));

    expect(attempts).toEqual(new Map([["question-1", 2], ["question-2", 1], ["question-3", 1]]));
    expect(result.questions.map(({ status }) => status)).toEqual(["answered", "unavailable", "answered"]);
    expect(repository.byOrdinal(1).providerCallCount).toBe(2);
    expect(repository.byOrdinal(2).providerCallCount).toBe(1);
    expect(repository.byOrdinal(3).providerCallCount).toBe(1);
  });

  it("caps a repeatedly retryable question at two provider attempts", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async (request) => {
      if (request.questionId === "question-1") throw new ReportV4QuestionProviderError("rate_limited", "try later");
      return providerAnswer(request.questionId, request.question);
    });

    const result = await answerReportV4Questions(answererInput(repository, provider));

    expect(provider.calls.filter(({ questionId }) => questionId === "question-1")).toHaveLength(2);
    expect(result.questions[0].status).toBe("unavailable");
    expect(result.questions.slice(1).every(({ status }) => status === "answered")).toBe(true);
  });

  it("makes zero provider calls for an over-budget question while siblings continue", async () => {
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async (request) => providerAnswer(request.questionId, request.question));
    const input = answererInput(repository, provider);
    input.questions = questions();
    input.questions[0] = { ...input.questions[0]!, tokenBudget: { ...tokenBudget(), estimatedInputTokens: 101, maxInputTokens: 100 } };

    const result = await answerReportV4Questions(input);

    expect(provider.calls.filter(({ questionId }) => questionId === "question-1")).toHaveLength(0);
    expect(provider.calls.filter(({ questionId }) => questionId !== "question-1")).toHaveLength(2);
    expect(result.questions.map(({ status }) => status)).toEqual(["unavailable", "answered", "answered"]);
    expect(repository.byOrdinal(1).providerCallCount).toBe(0);
  });

  it("retries one cross-question provider output locally and preserves sibling answers", async () => {
    const repository = new MemoryCheckpointRepository();
    let firstQuestionAttempts = 0;
    const provider = providerFrom(async (request) => {
      if (request.questionId === "question-1" && ++firstQuestionAttempts === 1) {
        return providerAnswer("question-2", request.question);
      }
      return providerAnswer(request.questionId, request.question);
    });

    const result = await answerReportV4Questions(answererInput(repository, provider));

    expect(result.questions.map(({ status }) => status)).toEqual(["answered", "answered", "answered"]);
    expect(provider.calls.filter(({ questionId }) => questionId === "question-1")).toHaveLength(2);
    expect(result.questions[1].sources.every(({ questionId }) => questionId === "question-2")).toBe(true);
  });

  it("retries one provider result-contract failure without rerunning sibling questions", async () => {
    const repository = new MemoryCheckpointRepository();
    let firstQuestionAttempts = 0;
    const provider = providerFrom(async (request) => {
      if (request.questionId === "question-1" && ++firstQuestionAttempts === 1) {
        throw new ReportV4QuestionProviderError("contract", "invalid provider result shape");
      }
      return providerAnswer(request.questionId, request.question);
    });

    const result = await answerReportV4Questions(answererInput(repository, provider));

    expect(result.questions.every(({ status }) => status === "answered")).toBe(true);
    expect(provider.calls.map(({ questionId }) => questionId)).toEqual([
      "question-1", "question-1", "question-2", "question-3"
    ]);
    expect(repository.byOrdinal(1).providerCallCount).toBe(2);
  });

  it("propagates a pre-aborted caller signal before checkpoint transitions or provider calls", async () => {
    const reason = new Error("caller stopped before answering");
    const controller = new AbortController();
    controller.abort(reason);
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async (request) => providerAnswer(request.questionId, request.question));

    await expect(answerReportV4Questions({ ...answererInput(repository, provider), signal: controller.signal })).rejects.toBe(reason);

    expect(provider.calls).toHaveLength(0);
    expect(repository.providerCallTransitions).toBe(0);
    expect(repository.unavailableWrites).toBe(0);
  });

  it("propagates the original caller abort reason when the provider aborts and throws", async () => {
    const reason = new Error("caller aborted inside provider");
    const controller = new AbortController();
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async () => {
      controller.abort(reason);
      throw reason;
    });

    await expect(answerReportV4Questions({ ...answererInput(repository, provider), signal: controller.signal })).rejects.toBe(reason);

    expect(repository.unavailableWrites).toBe(0);
    expect(repository.answeredWrites).toBe(0);
  });

  it("checks caller abort immediately after a provider resolves and never parses or saves that output", async () => {
    const reason = new Error("caller aborted before provider resolution was consumed");
    const controller = new AbortController();
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async (request) => {
      controller.abort(reason);
      return providerAnswer(request.questionId, request.question);
    });

    await expect(answerReportV4Questions({ ...answererInput(repository, provider), signal: controller.signal })).rejects.toBe(reason);

    expect(repository.unavailableWrites).toBe(0);
    expect(repository.answeredWrites).toBe(0);
  });

  it("propagates caller abort before retry classification and does not spend the local retry", async () => {
    const reason = new Error("caller abort wins over retryable provider error");
    const controller = new AbortController();
    const repository = new MemoryCheckpointRepository();
    const provider = providerFrom(async () => {
      controller.abort(reason);
      throw new ReportV4QuestionProviderError("temporary_provider", "provider asks for retry");
    });

    await expect(answerReportV4Questions({ ...answererInput(repository, provider), signal: controller.signal })).rejects.toBe(reason);

    expect(provider.calls).toHaveLength(1);
    expect(repository.byOrdinal(1).providerCallCount).toBe(1);
    expect(repository.unavailableWrites).toBe(0);
  });
});

function answererInput(repository: ReportV4QuestionCheckpointRepository, provider: ReportV4QuestionAnswerProvider): ReportV4QuestionAnswererInput {
  return {
    reportId: "report-1",
    jobId: "job-1",
    questionSetId: "question-set-1",
    snapshotId: "snapshot-1",
    modelConfigIdentityHash: sha("model-config"),
    locale: "en-US",
    region: "US",
    questions: questions(),
    repository,
    provider
  };
}

function questions() {
  return [1, 2, 3].map((order) => ({
    order: order as 1 | 2 | 3,
    questionId: `question-${order}`,
    question: `Question ${order}?`,
    tokenBudget: tokenBudget()
  }));
}

function tokenBudget() {
  return {
    contextWindowTokens: 1_000,
    maxInputTokens: 500,
    maxOutputTokens: 200,
    estimatedSystemTokens: 50,
    estimatedInputTokens: 100,
    reservedOutputTokens: 100,
    providerSafetyMarginTokens: 50
  };
}

function providerFrom(run: ReportV4QuestionAnswerProvider["answerWithSources"]): ReportV4QuestionAnswerProvider & { calls: Array<{ questionId: string; question: string }> } {
  const calls: Array<{ questionId: string; question: string }> = [];
  return {
    providerId: "provider-test",
    model: "model-test",
    searchMode: "search",
    calls,
    async answerWithSources(input) {
      calls.push({ questionId: input.questionId, question: input.question });
      return run(input);
    }
  };
}

function providerAnswer(questionId: string, question: string, sourceCount = 1) {
  return {
    questionId,
    answerText: `Answer for ${question}`,
    sources: Array.from({ length: sourceCount }, (_, index) => ({
      sourceId: `source-${index + 1}`,
      title: `Source ${index + 1}`,
      canonicalUrl: `https://source-${index + 1}.example/path`,
      registrableDomain: `source-${index + 1}.example`,
      citedText: `Evidence ${index + 1}.`,
      providerResultOrder: index
    })),
    refusal: null,
    searchedAt: "2030-01-01T00:00:00.000Z",
    completedAt: "2030-01-01T00:00:01.000Z",
    providerResponseId: `response-${questionId}`
  };
}

class MemoryCheckpointRepository implements ReportV4QuestionCheckpointRepository {
  private readonly rows = new Map<number, ReportV4QuestionCheckpoint>();
  providerCallTransitions = 0;
  unavailableWrites = 0;
  answeredWrites = 0;

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
    this.providerCallTransitions += 1;
    const row = this.byIdentity(input.identityHash);
    if (row.state === "answered" || row.state === "unavailable") throw new Error("Terminal checkpoint is immutable.");
    if (row.providerCallCount !== input.expectedProviderCallCount || row.providerCallCount >= 2) throw new Error("Provider attempt conflict.");
    const providerCallCount = row.providerCallCount + 1 as 1 | 2;
    const next = { ...row, state: providerCallCount === 1 ? "answering" as const : "retrying" as const, providerCallCount };
    this.rows.set(next.ordinal, next);
    return next;
  }

  async saveAnswered(input: ReportV4QuestionCheckpointSaveAnsweredInput) {
    this.answeredWrites += 1;
    const row = this.byIdentity(input.identityHash);
    if (row.state === "answered" || row.state === "unavailable") throw new Error("Terminal checkpoint is immutable.");
    const next = { ...row, ...input, state: "answered" as const };
    this.rows.set(next.ordinal, next);
    return next;
  }

  async markUnavailable(input: { identityHash: string; providerCallCount: number }) {
    this.unavailableWrites += 1;
    const row = this.byIdentity(input.identityHash);
    if (row.state === "answered" || row.state === "unavailable") throw new Error("Terminal checkpoint is immutable.");
    const next = { ...row, state: "unavailable" as const, providerCallCount: input.providerCallCount, answerPayload: null, sourcePayload: [], answerContentHash: null };
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
    return [this.rows.get(1), this.rows.get(2), this.rows.get(3)].filter(Boolean) as [ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint];
  }
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

import { describe, expect, it } from "vitest";
import type {
  CombinedGeoReportV4Question,
  ModelTokenBudgetInput,
  ReportV4DiagnosisTargetPage
} from "@open-geo-console/ai-report-engine";
import {
  ReportV4DiagnosisProviderError,
  enhanceReportV4QuestionDiagnosis,
  type ReportV4DiagnosisProvider,
  type ReportV4DiagnosisProviderRequest
} from "./report-v4-diagnosis-enhancer";

// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
describe("V4 question-level diagnosis enhancer", () => {
  it("sends only one immutable answered question, its owned sources and relevant target summaries", async () => {
    const question = answeredQuestion();
    const answer = question.answer;
    const provider = providerFrom(async () => validDiagnosis());

    const result = await enhanceReportV4QuestionDiagnosis(enhancerInput(question, provider));

    expect(result.status).toBe("completed");
    expect(result.question).toBe(question);
    expect(result.question.answer).toBe(answer);
    expect(result.providerAttempts).toBe(1);
    if (result.status !== "completed") throw new Error("expected completed diagnosis");
    expect(result.diagnosis.selectionSummary).toBe("The sources directly address the current operating question.");
    const request = provider.calls[0]!;
    expect(request.kind).toBe("diagnose");
    if (request.kind !== "diagnose") throw new Error("expected initial request");
    expect(request.input.question).toEqual({ questionId: question.questionId, text: question.questionText });
    expect(request.input.answer).toBe(answer);
    expect(request.input.sources.map(({ questionId, sourceId }) => ({ questionId, sourceId }))).toEqual([
      { questionId: "question-1", sourceId: "source-1" },
      { questionId: "question-1", sourceId: "source-2" }
    ]);
    expect(request.input.targetPages.every(({ questionId }) => questionId === question.questionId)).toBe(true);
    expect(JSON.stringify(request)).not.toContain("sibling-question");
  });

  it("fails locally with zero provider calls for unavailable, cross-question or over-five-source input", async () => {
    const provider = providerFrom(async () => validDiagnosis());
    const unavailable = Object.freeze({ ...answeredQuestion(), status: "unavailable" as const, answer: null, sources: [] });
    const sixSources = Object.freeze({
      ...answeredQuestion(),
      sources: Object.freeze(Array.from({ length: 6 }, (_, index) => source(index + 1)))
    });
    const wrongTarget = [{ ...targetPages()[0]!, questionId: "question-2" }];

    const results = await Promise.all([
      enhanceReportV4QuestionDiagnosis(enhancerInput(unavailable, provider)),
      enhanceReportV4QuestionDiagnosis(enhancerInput(sixSources, provider)),
      enhanceReportV4QuestionDiagnosis({ ...enhancerInput(answeredQuestion(), provider), targetPages: wrongTarget })
    ]);

    expect(results.every((result) => result.status === "failed" && result.diagnosis === undefined)).toBe(true);
    expect(results[0]!.question).toBe(unavailable);
    expect(provider.calls).toHaveLength(0);
  });

  it("performs one explicit field-only correction and preserves already valid fields", async () => {
    const first = validDiagnosis({ selectionSummary: "The model selected these sources because they rank higher." });
    const provider = providerFrom(async (request) => request.kind === "diagnose"
      ? first
      : {
          field: request.field,
          value: "These sources provide directly usable facts for the current question."
        });

    const result = await enhanceReportV4QuestionDiagnosis(enhancerInput(answeredQuestion(), provider));

    expect(result.status).toBe("completed");
    expect(result.providerAttempts).toBe(2);
    if (result.status !== "completed") throw new Error("expected corrected diagnosis");
    expect(result.diagnosis.selectionSummary).toBe("These sources provide directly usable facts for the current question.");
    expect(result.diagnosis.observableFactors).toEqual(first.observableFactors);
    expect(provider.calls.map(({ kind }) => kind)).toEqual(["diagnose", "correct"]);
    const correction = provider.calls[1]!;
    if (correction.kind !== "correct") throw new Error("expected correction request");
    expect(correction.field).toBe("selectionSummary");
    expect(correction.invalidValue).toBe(first.selectionSummary);
    expect(correction.failureReason).toMatch(/prohibited customer prose/i);
    expect(correction.evidence.question.questionId).toBe("question-1");
    expect(correction).not.toHaveProperty("observableFactors");
    expect(correction).not.toHaveProperty("recommendedActions");
  });

  it("rejects causal or SEO prose after the single correction without retracting the core question", async () => {
    const question = answeredQuestion();
    const provider = providerFrom(async (request) => request.kind === "diagnose"
      ? validDiagnosis({ targetGap: "Improve SEO keyword ranking." })
      : { field: request.field, value: "SEO remains the guaranteed ranking cause." });

    const result = await enhanceReportV4QuestionDiagnosis(enhancerInput(question, provider));

    expect(result).toMatchObject({ status: "failed", providerAttempts: 2 });
    expect(result.question).toBe(question);
    expect(result.question.answer).toBe(question.answer);
    expect(result.diagnosis).toBeUndefined();
    expect(provider.calls).toHaveLength(2);
  });

  it("spends its only retry on an explicitly retryable provider error and never switches provider", async () => {
    let attempts = 0;
    const provider = providerFrom(async (request) => {
      attempts += 1;
      if (attempts === 1) throw new ReportV4DiagnosisProviderError("transport", "temporary transport failure");
      expect(request.kind).toBe("retry");
      return validDiagnosis();
    });

    const result = await enhanceReportV4QuestionDiagnosis(enhancerInput(answeredQuestion(), provider));

    expect(result.status).toBe("completed");
    expect(result.providerAttempts).toBe(2);
    expect(provider.calls.map(({ kind }) => kind)).toEqual(["diagnose", "retry"]);
  });

  it("caps repeatedly retryable failures at two attempts and does not retry ordinary errors", async () => {
    const retryable = providerFrom(async () => { throw new ReportV4DiagnosisProviderError("rate_limited", "later"); });
    const ordinary = providerFrom(async () => { throw new Error("bad response"); });

    const [retried, notRetried] = await Promise.all([
      enhanceReportV4QuestionDiagnosis(enhancerInput(answeredQuestion(), retryable)),
      enhanceReportV4QuestionDiagnosis(enhancerInput(answeredQuestion(), ordinary))
    ]);

    expect(retried).toMatchObject({ status: "failed", providerAttempts: 2 });
    expect(notRetried).toMatchObject({ status: "failed", providerAttempts: 1 });
    expect(retryable.calls).toHaveLength(2);
    expect(ordinary.calls).toHaveLength(1);
  });

  it("uses the token gate before the first call and makes zero provider calls when over budget", async () => {
    const provider = providerFrom(async () => validDiagnosis());
    const budgetChecks: string[] = [];
    const result = await enhanceReportV4QuestionDiagnosis({
      ...enhancerInput(answeredQuestion(), provider),
      getTokenBudget(request) {
        budgetChecks.push(request.kind);
        return { ...tokenBudget(), estimatedInputTokens: 101, maxInputTokens: 100 };
      }
    });

    expect(result).toMatchObject({ status: "failed", providerAttempts: 0 });
    expect(budgetChecks).toEqual(["diagnose"]);
    expect(provider.calls).toHaveLength(0);
  });

  it("rechecks the token gate before correction and does not spend an over-budget second call", async () => {
    const provider = providerFrom(async () => validDiagnosis({ targetGap: "Improve SEO." }));
    const budgetChecks: string[] = [];
    const result = await enhanceReportV4QuestionDiagnosis({
      ...enhancerInput(answeredQuestion(), provider),
      getTokenBudget(request, attempt) {
        budgetChecks.push(`${attempt}:${request.kind}`);
        return attempt === 1 ? tokenBudget() : { ...tokenBudget(), reservedOutputTokens: 201, maxOutputTokens: 200 };
      }
    });

    expect(result).toMatchObject({ status: "failed", providerAttempts: 1 });
    expect(budgetChecks).toEqual(["1:diagnose", "2:correct"]);
    expect(provider.calls).toHaveLength(1);
  });

  it("propagates a pre-aborted caller reason without a provider call or business failure", async () => {
    const reason = new Error("caller stopped before diagnosis");
    const controller = new AbortController();
    controller.abort(reason);
    const provider = providerFrom(async () => validDiagnosis());

    await expect(enhanceReportV4QuestionDiagnosis({
      ...enhancerInput(answeredQuestion(), provider),
      signal: controller.signal
    })).rejects.toBe(reason);
    expect(provider.calls).toHaveLength(0);
  });

  it("propagates the original caller reason when the provider aborts and throws", async () => {
    const reason = new Error("caller aborted inside provider");
    const controller = new AbortController();
    const provider = providerFrom(async () => {
      controller.abort(reason);
      throw new ReportV4DiagnosisProviderError("temporary_provider", "provider also failed");
    });

    await expect(enhanceReportV4QuestionDiagnosis({
      ...enhancerInput(answeredQuestion(), provider),
      signal: controller.signal
    })).rejects.toBe(reason);
    expect(provider.calls).toHaveLength(1);
  });

  it("checks caller abort after a provider resolves and does not return a business failure", async () => {
    const reason = new Error("caller aborted before output consumption");
    const controller = new AbortController();
    const provider = providerFrom(async () => {
      controller.abort(reason);
      return validDiagnosis();
    });

    await expect(enhanceReportV4QuestionDiagnosis({
      ...enhancerInput(answeredQuestion(), provider),
      signal: controller.signal
    })).rejects.toBe(reason);
    expect(provider.calls).toHaveLength(1);
  });
});

function enhancerInput(question: CombinedGeoReportV4Question, provider: ReportV4DiagnosisProvider) {
  return {
    question,
    locale: "en-US",
    targetPages: targetPages(),
    provider,
    getTokenBudget: () => tokenBudget()
  };
}

function answeredQuestion(): CombinedGeoReportV4Question {
  return Object.freeze({
    order: 1,
    questionId: "question-1",
    questionText: "Which provider fits this operating need?",
    status: "answered",
    answer: "Provider One fits because its published service details match the stated need.",
    sources: Object.freeze([source(1), source(2)])
  });
}

function source(index: number) {
  return Object.freeze({
    questionId: "question-1",
    sourceId: `source-${index}`,
    title: `Source ${index}`,
    canonicalUrl: `https://source-${index}.example/evidence`,
    citedText: `Published fact ${index}.`,
    retrievalStatus: "available" as const
  });
}

function targetPages(): ReportV4DiagnosisTargetPage[] {
  return [{
    questionId: "question-1",
    pageId: "target-page-1",
    url: "https://target.example/service",
    relevanceReason: "This page describes the service in the current question.",
    summary: "The target page gives a broad service overview without operating conditions.",
    sourceLocations: [{ locationId: "target-loc-1", startOffset: 0, endOffset: 40 }]
  }];
}

function validDiagnosis(overrides: Record<string, unknown> = {}) {
  return {
    selectionSummary: "The sources directly address the current operating question.",
    observableFactors: [
      { kind: "problem_match", observation: "The source describes the requested service.", evidenceRefs: ["source-1"] },
      { kind: "factual_specificity", observation: "The source supplies concrete operating facts.", evidenceRefs: ["source-2"] },
      { kind: "target_clarity", observation: "The target summary remains broad.", evidenceRefs: ["target-loc-1"] }
    ],
    targetGap: "The target page does not state the operating conditions shown by the sources.",
    recommendedActions: [
      { priority: 1, action: "Publish the relevant operating conditions.", evidenceRefs: ["source-1", "target-loc-1"] },
      { priority: 2, action: "Clarify the supported service scenarios.", evidenceRefs: ["source-2", "target-loc-1"] },
      { priority: 3, action: "Keep the service facts current and publicly readable.", evidenceRefs: ["source-1"] }
    ],
    detailedEvidenceRefs: ["source-1", "source-2", "target-loc-1"],
    ...overrides
  };
}

function tokenBudget(): ModelTokenBudgetInput {
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

function providerFrom(run: ReportV4DiagnosisProvider["generate"]): ReportV4DiagnosisProvider & { calls: ReportV4DiagnosisProviderRequest[] } {
  const calls: ReportV4DiagnosisProviderRequest[] = [];
  return {
    calls,
    async generate(request) {
      calls.push(request);
      return run(request);
    }
  };
}

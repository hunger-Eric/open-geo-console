import { describe, expect, it, vi } from "vitest";
import {
  AnswerEngineRegistry,
  classifyCommercialCoverage,
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  generatePurchaseQuestions,
  observeAnswerMatrix,
  type AnswerAdapterErrorClass,
  type AnswerEngineAdapter,
  type AnswerEngineSurface,
  type AnswerQuestion,
  type AnswerSnapshotRunContract
} from "./index";

const run: AnswerSnapshotRunContract = {
  id: "run-1", reportId: "report-1", jobId: "job-1", locale: "en", region: "global",
  questionSetVersion: "purchase-v1", startedAt: "2026-07-12T00:00:00.000Z"
};

function surface(
  providerId: string,
  certificationState: AnswerEngineSurface["certificationState"],
  modelId = `${providerId}-model`
): AnswerEngineSurface {
  return {
    providerId, productId: `${providerId}-search`, modelId,
    collectionSurface: "developer_api", locale: "en", region: "global", certificationState
  };
}

function successfulAdapter(providerId: string, certificationState: AnswerEngineSurface["certificationState"], modelId?: string): AnswerEngineAdapter {
  const adapterSurface = surface(providerId, certificationState, modelId);
  return {
    surface: adapterSurface,
    async observe({ run: observedRun, question }) {
      const answerText = `Recommended supplier for ${question.exactText}`;
      return {
        id: createAnswerSnapshotCellId({ runId: observedRun.id, questionId: question.id, surface: adapterSurface }),
        runId: observedRun.id, questionId: question.id, surface: adapterSurface, status: "succeeded",
        answerText, responseHash: createAnswerResponseHash(answerText),
        sources: [{
          url: `https://sources.example/${providerId}/${question.id}`, title: "Source", providerOrder: 0,
          providerMetadata: { providerSourceId: `${providerId}-${question.id}` }
        }],
        recommendationOutcome: "recommendations_present", executedAt: "2026-07-12T00:00:01.000Z",
        executionDurationMs: 100
      };
    }
  };
}

function questions(): AnswerQuestion[] {
  return generatePurchaseQuestions({
    locale: "en", organizationName: "Example Logistics", brandAliases: ["Example Freight"],
    categories: ["freight forwarding"], capabilities: ["customs clearance"],
    sourceUrls: ["https://example.com"]
  }).questions;
}

function certify(registry: AnswerEngineRegistry, adapter: AnswerEngineAdapter, suffix: string): void {
  registry.register(adapter, {
    certifiedAt: "2026-07-12T00:00:00.000Z", environment: "protected_staging",
    evidenceReference: `acceptance/${suffix}`
  });
}

describe("answer-engine runtime", () => {
  it("requires organization identity and removes its name and aliases from deterministic questions", () => {
    expect(() => generatePurchaseQuestions({ locale: "en", sourceUrls: [] } as never)).toThrow(/organizationName/i);
    expect(() => generatePurchaseQuestions({
      locale: "en", organizationName: "", categories: ["freight forwarding"], sourceUrls: []
    })).toThrow(/organizationName/i);
    const generated = generatePurchaseQuestions({
      locale: "en", organizationName: "Example Logistics", brandAliases: ["Example Freight"],
      categories: ["Example Logistics freight forwarding"],
      capabilities: ["Example Freight customs clearance"], sourceUrls: ["https://example.com"]
    });
    expect(generated.questions).toHaveLength(4);
    expect(JSON.stringify(generated.questions)).not.toMatch(/Example Logistics|Example Freight/i);
    expect(generated).toMatchObject({ organizationName: "Example Logistics", brandAliases: ["Example Freight"] });

    const broad = generatePurchaseQuestions({
      locale: "zh", organizationName: "示例物流", brandAliases: ["示例货运"], sourceUrls: ["https://example.com"]
    });
    expect(broad).toMatchObject({ confidence: "low", fallbackReason: "insufficient_category_evidence" });
    expect(broad.questions).toHaveLength(3);
    expect(broad.questions.every((question) => /[\u4e00-\u9fff]/u.test(question.exactText))).toBe(true);
  });

  it("separates adapter existence from an immutable protected-staging authority snapshot", () => {
    const registry = new AnswerEngineRegistry();
    registry.register(successfulAdapter("candidate", "candidate_uncertified"));
    const certified = successfulAdapter("certified", "certified");
    certify(registry, certified, "certified");
    const authority = registry.createCertificationAuthoritySnapshot({
      authorityVersion: "authority-v1", capturedAt: "2026-07-12T01:00:00.000Z"
    });
    expect(authority.certifications).toHaveLength(1);
    expect(authority.certifications[0]?.surface.providerId).toBe("certified");
    expect(() => {
      (authority.certifications[0]!.surface as { providerId: string }).providerId = "tampered";
    }).toThrow();
    expect(() => registry.register(successfulAdapter("bad", "certified"))).toThrow(/certification evidence/i);
  });

  it("shares request and cost budgets across every model registered to one provider", async () => {
    const adapters = [
      successfulAdapter("shared", "candidate_uncertified", "model-a"),
      successfulAdapter("shared", "candidate_uncertified", "model-b")
    ];
    const spies = adapters.map((adapter) => vi.spyOn(adapter, "observe"));
    const result = await observeAnswerMatrix({
      run, questions: questions(), adapters,
      budgets: { shared: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(3);
    expect(result.cells).toHaveLength(3);
    expect(result.pendingCellIds).toHaveLength(5);

    const costly = successfulAdapter("cost-shared", "candidate_uncertified", "model-a");
    const originalObserve = costly.observe.bind(costly);
    costly.observe = vi.fn(async (input) => ({
      ...(await originalObserve(input)), usage: { estimatedCostMicros: 1_000 }
    }));
    const untouched = successfulAdapter("cost-shared", "candidate_uncertified", "model-b");
    const untouchedSpy = vi.spyOn(untouched, "observe");
    const costResult = await observeAnswerMatrix({
      run, questions: questions(), adapters: [costly, untouched],
      budgets: { "cost-shared": { maxRequests: 8, maxEstimatedCostMicros: 1_000, timeoutMs: 1_000 } }
    });
    expect(costly.observe).toHaveBeenCalledTimes(1);
    expect(untouchedSpy).not.toHaveBeenCalled();
    expect(costResult.pendingCellIds).toHaveLength(7);
  });

  it("checkpoints only successful cells and resumes budget-deferred missing cells", async () => {
    const adapter = successfulAdapter("candidate", "candidate_uncertified");
    const firstPersist = vi.fn();
    const first = await observeAnswerMatrix({
      run, questions: questions(), adapters: [adapter], persistCell: firstPersist,
      budgets: { candidate: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(first.cells).toHaveLength(3);
    expect(first.pendingCellIds).toHaveLength(1);
    expect(firstPersist).toHaveBeenCalledTimes(3);

    const secondPersist = vi.fn();
    const second = await observeAnswerMatrix({
      run, questions: questions(), adapters: [adapter], existingCells: first.cells, persistCell: secondPersist,
      budgets: { candidate: { maxRequests: 4, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(second.cells).toHaveLength(4);
    expect(second.pendingCellIds).toEqual([]);
    expect(secondPersist).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures without checkpointing them and persists only the later success", async () => {
    const adapter = successfulAdapter("retry", "candidate_uncertified");
    const success = adapter.observe.bind(adapter);
    const observe = vi.fn(async (input: Parameters<AnswerEngineAdapter["observe"]>[0]) => {
      if (observe.mock.calls.length === 1) throw new Error("temporary outage api_key=must-not-leak");
      return success(input);
    });
    adapter.observe = observe;
    adapter.classifyError = (): AnswerAdapterErrorClass => "provider-unavailable";
    const persist = vi.fn();
    const result = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], persistCell: persist,
      budgets: { retry: { maxRequests: 2, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 1 } }
    });
    expect(observe).toHaveBeenCalledTimes(2);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]?.status).toBe("succeeded");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|api_key/i);
  });

  it("aborts timed-out adapter work and terminalizes only after retry policy is exhausted", async () => {
    const adapter = successfulAdapter("slow", "candidate_uncertified");
    let signal: AbortSignal | undefined;
    adapter.observe = vi.fn(async (input) => {
      signal = input.signal;
      return await new Promise<never>((_resolve, reject) => {
        input.signal.addEventListener("abort", () => reject(new Error("secret=must-not-leak")), { once: true });
      });
    });
    const result = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter],
      budgets: { slow: { maxRequests: 1, maxEstimatedCostMicros: 10_000, timeoutMs: 5, maxTransientRetries: 0 } }
    });
    expect(signal?.aborted).toBe(true);
    expect(result.cells[0]).toMatchObject({
      status: "failed", errorClass: "timeout", attemptCount: 1, failureDisposition: "retry_exhausted"
    });
    expect(JSON.stringify(result)).not.toMatch(/must-not-leak|secret=/i);
  });

  it("leaves a transient cell missing when provider budget ends before retry exhaustion", async () => {
    const adapter = successfulAdapter("deferred", "candidate_uncertified");
    adapter.observe = vi.fn(async () => { throw new Error("temporary"); });
    adapter.classifyError = () => "rate-limit";
    const persist = vi.fn();
    const result = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], persistCell: persist,
      budgets: { deferred: { maxRequests: 1, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(result.cells).toEqual([]);
    expect(result.pendingCellIds).toHaveLength(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("persists retry-exhausted failure once and immutable resume does not repeat it", async () => {
    const adapter = successfulAdapter("exhausted", "candidate_uncertified");
    const observe = vi.fn(async () => { throw new Error("temporary"); });
    adapter.observe = observe;
    adapter.classifyError = () => "provider-unavailable";
    const persist = vi.fn();
    const first = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], persistCell: persist,
      budgets: { exhausted: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(observe).toHaveBeenCalledTimes(3);
    expect(first.cells[0]).toMatchObject({
      status: "failed", errorClass: "provider-unavailable", attemptCount: 3,
      failureDisposition: "retry_exhausted"
    });
    expect(persist).toHaveBeenCalledTimes(1);
    observe.mockClear();
    const resumed = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], existingCells: first.cells,
      budgets: { exhausted: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(observe).not.toHaveBeenCalled();
    expect(resumed.cells).toEqual(first.cells);
  });

  it("uses external certification and counts distinct providers rather than models", async () => {
    const q = questions().slice(0, 3);
    const modelA = successfulAdapter("same-provider", "certified", "model-a");
    const modelB = successfulAdapter("same-provider", "certified", "model-b");
    const independent = successfulAdapter("independent", "certified");
    const observations = await observeAnswerMatrix({ run, questions: q, adapters: [modelA, modelB, independent] });
    const emptyAuthority = { authorityVersion: "empty", capturedAt: "2026-07-12T01:00:00.000Z", certifications: [] } as const;
    expect(classifyCommercialCoverage(q, observations.cells, emptyAuthority)).toMatchObject({
      outcome: "failed", certifiedProviderCount: 0
    });

    const sameProviderRegistry = new AnswerEngineRegistry();
    certify(sameProviderRegistry, modelA, "model-a");
    certify(sameProviderRegistry, modelB, "model-b");
    const sameProviderAuthority = sameProviderRegistry.createCertificationAuthoritySnapshot({
      authorityVersion: "same-provider", capturedAt: "2026-07-12T01:00:00.000Z"
    });
    expect(classifyCommercialCoverage(q, observations.cells, sameProviderAuthority)).toMatchObject({
      outcome: "completed_limited", certifiedProviderCount: 1, qualifyingProviderCount: 1
    });

    const registry = new AnswerEngineRegistry();
    certify(registry, modelA, "model-a");
    certify(registry, modelB, "model-b");
    certify(registry, independent, "independent");
    const authority = registry.createCertificationAuthoritySnapshot({
      authorityVersion: "two-providers", capturedAt: "2026-07-12T01:00:00.000Z"
    });
    expect(classifyCommercialCoverage(q, observations.cells, authority)).toMatchObject({
      outcome: "qualified", certifiedProviderCount: 2, qualifyingProviderCount: 2
    });
  });
});

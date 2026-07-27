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

    const punctuationVariant = generatePurchaseQuestions({
      locale: "en", organizationName: "Acme Inc", brandAliases: [],
      categories: ["Acme, Inc. freight forwarding"], capabilities: ["customs clearance"], sourceUrls: []
    });
    expect(JSON.stringify(punctuationVariant.questions)).not.toMatch(/Acme/i);
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
      run, questions: questions(), adapters, expectedCheckpointRevision: 0,
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
      run, questions: questions(), adapters: [costly, untouched], expectedCheckpointRevision: 0,
      budgets: { "cost-shared": { maxRequests: 8, maxEstimatedCostMicros: 1_000, timeoutMs: 1_000 } }
    });
    expect(costly.observe).toHaveBeenCalledTimes(1);
    expect(untouchedSpy).not.toHaveBeenCalled();
    expect(costResult.pendingCellIds).toHaveLength(7);
    const costlyObserve = costly.observe as ReturnType<typeof vi.fn>;
    costlyObserve.mockClear();
    const costResumed = await observeAnswerMatrix({
      run, questions: questions(), adapters: [costly, untouched],
      existingCells: costResult.cells, existingExecutionState: costResult.executionState,
      expectedCheckpointRevision: costResult.executionState.checkpointRevision,
      budgets: { "cost-shared": { maxRequests: 8, maxEstimatedCostMicros: 1_000, timeoutMs: 1_000 } }
    });
    expect(costlyObserve).not.toHaveBeenCalled();
    expect(untouchedSpy).not.toHaveBeenCalled();
    expect(costResumed.executionState).toEqual(costResult.executionState);
  });

  it("checkpoints only successful cells and resumes budget-deferred missing cells", async () => {
    const adapter = successfulAdapter("candidate", "candidate_uncertified");
    const firstPersist = vi.fn();
    const first = await observeAnswerMatrix({
      run, questions: questions(), adapters: [adapter], expectedCheckpointRevision: 0,
      persistCheckpoint: firstPersist,
      budgets: { candidate: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(first.cells).toHaveLength(3);
    expect(first.pendingCellIds).toHaveLength(1);
    expect(firstPersist).toHaveBeenCalledTimes(3);

    const secondPersist = vi.fn();
    const second = await observeAnswerMatrix({
      run, questions: questions(), adapters: [adapter], existingCells: first.cells,
      existingExecutionState: first.executionState,
      expectedCheckpointRevision: first.executionState.checkpointRevision,
      persistCheckpoint: secondPersist,
      budgets: { candidate: { maxRequests: 4, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(second.cells).toHaveLength(4);
    expect(second.pendingCellIds).toEqual([]);
    expect(secondPersist).toHaveBeenCalledTimes(1);
    expect(second.executionState.providers.candidate).toMatchObject({ requestCount: 4 });
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
      run, questions: questions().slice(0, 1), adapters: [adapter], expectedCheckpointRevision: 0,
      persistCheckpoint: persist,
      budgets: { retry: { maxRequests: 2, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 1 } }
    });
    expect(observe).toHaveBeenCalledTimes(2);
    expect(result.cells).toHaveLength(1);
    expect(result.cells[0]?.status).toBe("succeeded");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls.map(([checkpoint]) => ({
      expectedRevision: checkpoint.expectedRevision,
      nextRevision: checkpoint.executionState.checkpointRevision,
      hasCell: Boolean(checkpoint.cell)
    }))).toEqual([
      { expectedRevision: 0, nextRevision: 1, hasCell: false },
      { expectedRevision: 1, nextRevision: 2, hasCell: true }
    ]);
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
      run, questions: questions().slice(0, 1), adapters: [adapter], expectedCheckpointRevision: 0,
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
    const observe = vi.fn(async () => { throw new Error("temporary"); });
    adapter.observe = observe;
    adapter.classifyError = () => "rate-limit";
    const persist = vi.fn();
    const result = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], expectedCheckpointRevision: 0,
      persistCheckpoint: persist,
      budgets: { deferred: { maxRequests: 1, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(result.cells).toEqual([]);
    expect(result.pendingCellIds).toHaveLength(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0]?.[0]).not.toHaveProperty("cell");
    expect(result.executionState.providers.deferred).toMatchObject({
      requestCount: 1,
      cells: { [result.pendingCellIds[0]!]: { attemptCount: 1, transientAttemptCount: 1 } }
    });

    observe.mockClear();
    const resumed = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter],
      existingExecutionState: result.executionState,
      expectedCheckpointRevision: result.executionState.checkpointRevision,
      budgets: { deferred: { maxRequests: 1, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(observe).not.toHaveBeenCalled();
    expect(resumed.pendingCellIds).toEqual(result.pendingCellIds);
    expect(resumed.executionState).toEqual(result.executionState);
  });

  it("persists retry-exhausted failure once and immutable resume does not repeat it", async () => {
    const adapter = successfulAdapter("exhausted", "candidate_uncertified");
    const observe = vi.fn(async () => { throw new Error("temporary"); });
    adapter.observe = observe;
    adapter.classifyError = () => "provider-unavailable";
    const persist = vi.fn();
    const first = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], expectedCheckpointRevision: 0,
      persistCheckpoint: persist,
      budgets: { exhausted: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(observe).toHaveBeenCalledTimes(3);
    expect(first.cells[0]).toMatchObject({
      status: "failed", errorClass: "provider-unavailable", attemptCount: 3,
      failureDisposition: "retry_exhausted"
    });
    expect(persist).toHaveBeenCalledTimes(3);
    expect(persist.mock.calls.map(([checkpoint]) => Boolean(checkpoint.cell))).toEqual([false, false, true]);
    observe.mockClear();
    const resumed = await observeAnswerMatrix({
      run, questions: questions().slice(0, 1), adapters: [adapter], existingCells: first.cells,
      existingExecutionState: first.executionState,
      expectedCheckpointRevision: first.executionState.checkpointRevision,
      budgets: { exhausted: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000, maxTransientRetries: 2 } }
    });
    expect(observe).not.toHaveBeenCalled();
    expect(resumed.cells).toEqual(first.cells);
  });

  it("fails closed on legacy failed cells without terminal disposition", async () => {
    const adapter = successfulAdapter("legacy", "candidate_uncertified");
    const q = questions().slice(0, 1);
    const adapterSurface = adapter.surface;
    const legacy = {
      id: createAnswerSnapshotCellId({ runId: run.id, questionId: q[0]!.id, surface: adapterSurface }),
      runId: run.id, questionId: q[0]!.id, surface: adapterSurface, status: "failed" as const,
      errorClass: "provider-unavailable" as const, executedAt: "2026-07-12T00:00:01.000Z",
      executionDurationMs: 10
    };
    await expect(observeAnswerMatrix({
      run, questions: q, adapters: [adapter], existingCells: [legacy],
      expectedCheckpointRevision: 0,
      existingExecutionState: {
        runId: run.id, checkpointRevision: 0,
        providers: { legacy: { requestCount: 1, estimatedCostMicros: 0, cells: { [legacy.id]: { attemptCount: 1, transientAttemptCount: 1 } } } }
      }
    })).rejects.toThrow(/terminal attempt metadata/i);
  });

  it("rejects stale revisions, unexpected ledger cells, and cost rollback", async () => {
    const adapter = successfulAdapter("cas", "candidate_uncertified");
    const original = adapter.observe.bind(adapter);
    adapter.observe = async (input) => ({
      ...(await original(input)), usage: { estimatedCostMicros: 500 }
    });
    const q = questions().slice(0, 1);
    const first = await observeAnswerMatrix({
      run, questions: q, adapters: [adapter], expectedCheckpointRevision: 0
    });
    await expect(observeAnswerMatrix({
      run, questions: q, adapters: [adapter], existingCells: first.cells,
      existingExecutionState: first.executionState, expectedCheckpointRevision: 0
    })).rejects.toThrow(/expectedCheckpointRevision/i);

    const unexpected = structuredClone(first.executionState);
    unexpected.providers.cas!.requestCount += 1;
    unexpected.providers.cas!.cells["foreign-cell"] = { attemptCount: 1, transientAttemptCount: 0 };
    await expect(observeAnswerMatrix({
      run, questions: q, adapters: [adapter], existingCells: first.cells,
      existingExecutionState: unexpected, expectedCheckpointRevision: unexpected.checkpointRevision
    })).rejects.toThrow(/unexpected cell identity/i);

    const rollback = structuredClone(first.executionState);
    rollback.providers.cas!.estimatedCostMicros = 0;
    await expect(observeAnswerMatrix({
      run, questions: q, adapters: [adapter], existingCells: first.cells,
      existingExecutionState: rollback, expectedCheckpointRevision: rollback.checkpointRevision
    })).rejects.toThrow(/cost cannot be lower/i);
  });

  it("rejects a valid cell identity moved into another provider ledger", async () => {
    const providerOne = successfulAdapter("p1", "candidate_uncertified");
    const providerTwo = successfulAdapter("p2", "candidate_uncertified");
    const q = questions().slice(0, 1);
    const first = await observeAnswerMatrix({
      run, questions: q, adapters: [providerOne, providerTwo], expectedCheckpointRevision: 0
    });
    const moved = structuredClone(first.executionState);
    const p1CellId = first.cells.find(({ surface }) => surface.providerId === "p1")!.id;
    const p1Ledger = moved.providers.p1!.cells[p1CellId]!;
    delete moved.providers.p1!.cells[p1CellId];
    moved.providers.p1!.requestCount -= p1Ledger.attemptCount;
    moved.providers.p2!.cells[p1CellId] = p1Ledger;
    moved.providers.p2!.requestCount += p1Ledger.attemptCount;

    await expect(observeAnswerMatrix({
      run, questions: q, adapters: [providerOne, providerTwo], existingCells: first.cells,
      existingExecutionState: moved, expectedCheckpointRevision: moved.checkpointRevision
    })).rejects.toThrow(/wrong provider/i);
  });

  it("uses external certification and counts distinct providers rather than models", async () => {
    const q = questions().slice(0, 3);
    const modelA = successfulAdapter("same-provider", "certified", "model-a");
    const modelB = successfulAdapter("same-provider", "certified", "model-b");
    const independent = successfulAdapter("independent", "certified");
    const observations = await observeAnswerMatrix({
      run, questions: q, adapters: [modelA, modelB, independent], expectedCheckpointRevision: 0
    });
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

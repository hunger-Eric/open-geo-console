import { describe, expect, it, vi } from "vitest";
import {
  AnswerEngineRegistry,
  classifyCommercialCoverage,
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  generatePurchaseQuestions,
  observeAnswerMatrix,
  type AnswerEngineAdapter,
  type AnswerEngineSurface,
  type AnswerQuestion,
  type AnswerSnapshotRunContract
} from "./index";

const run: AnswerSnapshotRunContract = {
  id: "run-1", reportId: "report-1", jobId: "job-1", locale: "en", region: "global",
  questionSetVersion: "purchase-v1", startedAt: "2026-07-12T00:00:00.000Z"
};

function surface(providerId: string, certificationState: AnswerEngineSurface["certificationState"]): AnswerEngineSurface {
  return {
    providerId, productId: `${providerId}-search`, modelId: `${providerId}-model`,
    collectionSurface: "developer_api", locale: "en", region: "global", certificationState
  };
}

function adapter(providerId: string, certificationState: AnswerEngineSurface["certificationState"]): AnswerEngineAdapter {
  const adapterSurface = surface(providerId, certificationState);
  return {
    surface: adapterSurface,
    async observe({ run: observedRun, question }) {
      const answerText = `Recommended supplier for ${question.exactText}`;
      return {
        id: createAnswerSnapshotCellId({ runId: observedRun.id, questionId: question.id, surface: adapterSurface }),
        runId: observedRun.id,
        questionId: question.id,
        surface: adapterSurface,
        status: "succeeded",
        answerText,
        responseHash: createAnswerResponseHash(answerText),
        sources: [{
          url: `https://sources.example/${providerId}/${question.id}`,
          title: "Source",
          providerOrder: 0,
          providerMetadata: { providerSourceId: `${providerId}-${question.id}` }
        }],
        recommendationOutcome: "recommendations_present",
        executedAt: "2026-07-12T00:00:01.000Z",
        executionDurationMs: 100
      };
    }
  };
}

describe("answer-engine runtime", () => {
  it("generates three to five non-branded purchase questions with a broad low-confidence fallback", () => {
    const specific = generatePurchaseQuestions({
      locale: "en", organizationName: "Example Logistics", categories: ["freight forwarding"],
      capabilities: ["customs clearance"], audiences: ["exporters"], sourceUrls: ["https://example.com"]
    });
    expect(specific.questions).toHaveLength(4);
    expect(specific.questions.every((question) => !question.exactText.includes("Example Logistics"))).toBe(true);
    expect(specific.confidence).toBe("high");

    const broad = generatePurchaseQuestions({ locale: "zh", sourceUrls: ["https://example.com"] });
    expect(broad.questions).toHaveLength(3);
    expect(broad.confidence).toBe("low");
    expect(broad.fallbackReason).toBe("insufficient_category_evidence");
    expect(broad.limitations).not.toHaveLength(0);
    expect(broad.questions.every((question) => /[\u4e00-\u9fff]/u.test(question.exactText))).toBe(true);

    const brandedCategory = generatePurchaseQuestions({
      locale: "en", organizationName: "Example Logistics",
      categories: ["Example Logistics freight forwarding"], capabilities: ["customs clearance"],
      sourceUrls: ["https://example.com"]
    });
    expect(brandedCategory.questions.every((question) => !/Example Logistics/i.test(question.exactText))).toBe(true);
  });

  it("keeps adapter existence separate from protected-staging certification", () => {
    const registry = new AnswerEngineRegistry();
    registry.register(adapter("candidate", "candidate_uncertified"));
    registry.register(adapter("certified", "certified"), {
      certifiedAt: "2026-07-12T00:00:00.000Z", environment: "protected_staging",
      evidenceReference: "acceptance/provider-certified"
    });
    expect(registry.list()).toHaveLength(2);
    expect(registry.listCertified()).toHaveLength(1);
    expect(() => registry.register(adapter("bad", "certified"))).toThrow("certification evidence");
  });

  it("executes only missing cells, persists each immutable result, and enforces request budgets", async () => {
    const questions = generatePurchaseQuestions({
      locale: "en", categories: ["freight forwarding"], capabilities: ["customs clearance"],
      sourceUrls: ["https://example.com"]
    }).questions;
    const candidate = adapter("candidate", "candidate_uncertified");
    const persistCell = vi.fn();
    const first = await observeAnswerMatrix({
      run, questions, adapters: [candidate], persistCell,
      budgets: { candidate: { maxRequests: 3, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(first.cells).toHaveLength(3);
    expect(first.cells.filter((cell) => cell.status === "succeeded")).toHaveLength(3);
    expect(first.pendingCellIds).toHaveLength(1);
    expect(persistCell).toHaveBeenCalledTimes(3);

    const secondPersist = vi.fn();
    const second = await observeAnswerMatrix({
      run, questions, adapters: [candidate], existingCells: first.cells, persistCell: secondPersist,
      budgets: { candidate: { maxRequests: 4, maxEstimatedCostMicros: 10_000, timeoutMs: 1_000 } }
    });
    expect(second.cells).toHaveLength(4);
    expect(second.pendingCellIds).toEqual([]);
    expect(secondPersist).toHaveBeenCalledTimes(1);

    const foreignCell = {
      ...second.cells[0]!,
      id: createAnswerSnapshotCellId({ runId: "foreign-run", questionId: second.cells[0]!.questionId, surface: second.cells[0]!.surface }),
      runId: "foreign-run"
    };
    await expect(observeAnswerMatrix({
      run, questions, adapters: [candidate], existingCells: [foreignCell]
    })).rejects.toThrow(/observed run/i);
  });

  it("aborts timed-out observations and stores only a sanitized deterministic failure", async () => {
    const questions = generatePurchaseQuestions({
      locale: "en", categories: ["freight forwarding"], capabilities: ["customs clearance"],
      sourceUrls: ["https://example.com"]
    }).questions.slice(0, 1);
    const adapterSurface = surface("slow", "candidate_uncertified");
    let observedSignal: AbortSignal | undefined;
    const slow: AnswerEngineAdapter = {
      surface: adapterSurface,
      observe({ signal }) {
        observedSignal = signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("api_key=must-not-leak")), { once: true });
        });
      }
    };
    const result = await observeAnswerMatrix({
      run, questions, adapters: [slow],
      budgets: { slow: { maxRequests: 1, maxEstimatedCostMicros: 10_000, timeoutMs: 5 } }
    });
    expect(observedSignal?.aborted).toBe(true);
    expect(result.cells[0]).toMatchObject({
      status: "failed", errorClass: "timeout", sanitizedError: "The provider request timed out."
    });
    expect(JSON.stringify(result.cells[0])).not.toMatch(/must-not-leak|api_key/i);
  });

  it("does not commercially qualify fixtures or uncertified adapters", async () => {
    const questions = generatePurchaseQuestions({
      locale: "en", categories: ["freight forwarding"], capabilities: ["customs clearance"],
      sourceUrls: ["https://example.com"]
    }).questions.slice(0, 3);
    const result = await observeAnswerMatrix({
      run, questions, adapters: [adapter("a", "candidate_uncertified"), adapter("b", "candidate_uncertified")]
    });
    expect(classifyCommercialCoverage(questions, result.cells, [])).toMatchObject({ outcome: "failed", certifiedSurfaceCount: 0 });
  });

  it("requires registry certification evidence before certified-looking cells can qualify", async () => {
    const questions: AnswerQuestion[] = generatePurchaseQuestions({
      locale: "en", categories: ["freight forwarding"], capabilities: ["customs clearance"],
      sourceUrls: ["https://example.com"]
    }).questions.slice(0, 3);
    const adapterA = adapter("a", "certified");
    const adapterB = adapter("b", "certified");
    const both = await observeAnswerMatrix({ run, questions, adapters: [adapterA, adapterB] });
    expect(classifyCommercialCoverage(questions, both.cells, []).outcome).toBe("failed");

    const registry = new AnswerEngineRegistry();
    registry.register(adapterA, {
      certifiedAt: "2026-07-12T00:00:00.000Z", environment: "protected_staging", evidenceReference: "acceptance/a"
    });
    registry.register(adapterB, {
      certifiedAt: "2026-07-12T00:00:00.000Z", environment: "protected_staging", evidenceReference: "acceptance/b"
    });
    const certifications = registry.listCertifications();
    expect(classifyCommercialCoverage(questions, both.cells, certifications).outcome).toBe("qualified");
    const one = both.cells.filter((cell) => cell.surface.providerId === "a");
    expect(classifyCommercialCoverage(questions, one, certifications).outcome).toBe("completed_limited");

    const providerBWithoutSources = both.cells.map((cell) =>
      cell.status === "succeeded" && cell.surface.providerId === "b"
        ? { ...cell, sources: [] }
        : cell
    );
    expect(classifyCommercialCoverage(questions, providerBWithoutSources, certifications).outcome).toBe("completed_limited");
  });
});

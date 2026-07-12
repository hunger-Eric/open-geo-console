import { createAnswerSnapshotCellId } from "./identity";
import type {
  AnswerAdapterErrorClass,
  AnswerEngineAdapter,
  AnswerQuestion,
  AnswerSnapshotCell,
  FailedAnswerSnapshotCell,
  ObserveAnswerMatrixInput,
  ObserveAnswerMatrixResult,
  ProviderExecutionBudget
} from "./types";
import { parseAnswerQuestion, parseAnswerSnapshotCell, parseAnswerSnapshotRun } from "./validation";

const DEFAULT_BUDGET: ProviderExecutionBudget = {
  maxRequests: 5,
  maxEstimatedCostMicros: 1_000_000,
  timeoutMs: 30_000
};

export async function observeAnswerMatrix(input: ObserveAnswerMatrixInput): Promise<ObserveAnswerMatrixResult> {
  const run = parseAnswerSnapshotRun(input.run);
  const questions = input.questions.map(parseAnswerQuestion);
  const cells = [...(input.existingCells ?? []).map(parseAnswerSnapshotCell)];
  if (cells.some((cell) => cell.runId !== run.id)) {
    throw new Error("Existing cells must belong to the observed run.");
  }
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) {
    throw new Error("Existing snapshot cell identities must be unique.");
  }
  const identities = new Set(cells.map((cell) => cell.id));
  const expectedCellIds: string[] = [];

  for (const adapter of input.adapters) {
    const budget = validatedBudget(input.budgets?.[adapter.surface.providerId] ?? DEFAULT_BUDGET);
    let requestCount = cells.filter((cell) => sameProvider(cell, adapter)).length;
    let spentMicros = cells
      .filter((cell) => sameProvider(cell, adapter))
      .reduce((sum, cell) => sum + (cell.usage?.estimatedCostMicros ?? 0), 0);
    for (const question of questions) {
      const id = createAnswerSnapshotCellId({ runId: run.id, questionId: question.id, surface: adapter.surface });
      expectedCellIds.push(id);
      if (identities.has(id)) continue;
      if (requestCount >= budget.maxRequests || spentMicros >= budget.maxEstimatedCostMicros) {
        continue;
      }
      requestCount += 1;
      let cell = await observeWithTimeout(adapter, run, question, budget.timeoutMs);
      spentMicros += cell.usage?.estimatedCostMicros ?? 0;
      cell = parseAnswerSnapshotCell(cell);
      if (cell.id !== id) throw new Error("Adapter returned a cell for a different run, question, or surface.");
      cells.push(cell);
      identities.add(cell.id);
      await input.persistCell?.(cell);
    }
  }
  return { cells, pendingCellIds: expectedCellIds.filter((id) => !identities.has(id)) };
}

async function observeWithTimeout(
  adapter: AnswerEngineAdapter,
  run: ObserveAnswerMatrixInput["run"],
  question: AnswerQuestion,
  timeoutMs: number
): Promise<AnswerSnapshotCell> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      adapter.observe({ run, question, surface: adapter.surface, signal: controller.signal }),
      new Promise<AnswerSnapshotCell>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new AdapterTimeoutError());
          controller.abort();
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    const errorClass = classifyAdapterError(adapter, error);
    return failedCell(
      run.id,
      question,
      adapter,
      errorClass,
      sanitizedFailureMessage(errorClass),
      Date.now() - startedAt
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function failedCell(
  runId: string,
  question: AnswerQuestion,
  adapter: AnswerEngineAdapter,
  errorClass: AnswerAdapterErrorClass,
  sanitizedError: string,
  executionDurationMs: number
): FailedAnswerSnapshotCell {
  return {
    id: createAnswerSnapshotCellId({ runId, questionId: question.id, surface: adapter.surface }),
    runId,
    questionId: question.id,
    surface: adapter.surface,
    status: "failed",
    errorClass,
    sanitizedError,
    executedAt: new Date().toISOString(),
    executionDurationMs
  };
}

function sameProvider(cell: AnswerSnapshotCell, adapter: AnswerEngineAdapter): boolean {
  return cell.surface.providerId === adapter.surface.providerId &&
    cell.surface.productId === adapter.surface.productId && cell.surface.modelId === adapter.surface.modelId;
}

function validatedBudget(budget: ProviderExecutionBudget): ProviderExecutionBudget {
  if (!Number.isSafeInteger(budget.maxRequests) || budget.maxRequests < 0 ||
      !Number.isSafeInteger(budget.maxEstimatedCostMicros) || budget.maxEstimatedCostMicros < 0 ||
      !Number.isSafeInteger(budget.timeoutMs) || budget.timeoutMs <= 0) {
    throw new TypeError("Provider execution budgets must be non-negative integers with a positive timeout.");
  }
  return budget;
}

class AdapterTimeoutError extends Error {}

function classifyAdapterError(adapter: AnswerEngineAdapter, error: unknown): AnswerAdapterErrorClass {
  if (error instanceof AdapterTimeoutError) return "timeout";
  try {
    return adapter.classifyError?.(error) ?? "provider-unavailable";
  } catch {
    return "provider-unavailable";
  }
}

function sanitizedFailureMessage(errorClass: AnswerAdapterErrorClass): string {
  const messages: Record<AnswerAdapterErrorClass, string> = {
    timeout: "The provider request timed out.",
    "rate-limit": "The provider rate limit prevented this observation.",
    authentication: "The provider rejected its configured credentials.",
    unsupported: "The provider does not support this observation.",
    "provider-unavailable": "The provider request was unavailable.",
    "invalid-response": "The provider returned an invalid response.",
    "policy-blocked": "The provider policy blocked this observation."
  };
  return messages[errorClass] ?? messages["provider-unavailable"];
}

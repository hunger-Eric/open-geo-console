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

interface ProviderExecutionState {
  requestCount: number;
  spentMicros: number;
}

interface ValidatedProviderExecutionBudget extends ProviderExecutionBudget {
  maxTransientRetries: number;
}

const DEFAULT_BUDGET: ValidatedProviderExecutionBudget = {
  maxRequests: 5,
  maxEstimatedCostMicros: 1_000_000,
  timeoutMs: 30_000,
  maxTransientRetries: 2
};

const TRANSIENT_ERRORS = new Set<AnswerAdapterErrorClass>(["timeout", "rate-limit", "provider-unavailable"]);

export async function observeAnswerMatrix(input: ObserveAnswerMatrixInput): Promise<ObserveAnswerMatrixResult> {
  const run = parseAnswerSnapshotRun(input.run);
  const questions = input.questions.map(parseAnswerQuestion);
  const cells = [...(input.existingCells ?? []).map(parseAnswerSnapshotCell)];
  if (cells.some((cell) => cell.runId !== run.id)) throw new Error("Existing cells must belong to the observed run.");
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) {
    throw new Error("Existing snapshot cell identities must be unique.");
  }
  const identities = new Set(cells.map((cell) => cell.id));
  const expectedCellIds: string[] = [];
  const providerStates = initializeProviderStates(cells);

  for (const adapter of input.adapters) {
    const providerId = adapter.surface.providerId;
    const budget = validatedBudget(input.budgets?.[providerId] ?? DEFAULT_BUDGET);
    const state = providerStates.get(providerId) ?? { requestCount: 0, spentMicros: 0 };
    providerStates.set(providerId, state);
    for (const question of questions) {
      const id = createAnswerSnapshotCellId({ runId: run.id, questionId: question.id, surface: adapter.surface });
      expectedCellIds.push(id);
      if (identities.has(id)) continue;
      const cell = await executeCellWithRecovery(adapter, run, question, id, budget, state);
      if (!cell) continue;
      cells.push(cell);
      identities.add(cell.id);
      await input.persistCell?.(cell);
    }
  }
  return { cells, pendingCellIds: expectedCellIds.filter((id) => !identities.has(id)) };
}

async function executeCellWithRecovery(
  adapter: AnswerEngineAdapter,
  run: ObserveAnswerMatrixInput["run"],
  question: AnswerQuestion,
  expectedId: string,
  budget: ValidatedProviderExecutionBudget,
  state: ProviderExecutionState
): Promise<AnswerSnapshotCell | undefined> {
  let attemptCount = 0;
  while (canExecute(state, budget)) {
    state.requestCount += 1;
    attemptCount += 1;
    const observed = parseAnswerSnapshotCell(await observeWithTimeout(adapter, run, question, budget.timeoutMs));
    if (observed.id !== expectedId) throw new Error("Adapter returned a cell for a different run, question, or surface.");
    state.spentMicros += observed.usage?.estimatedCostMicros ?? 0;
    if (observed.status === "succeeded") return observed;
    if (!TRANSIENT_ERRORS.has(observed.errorClass)) {
      return terminalFailure(observed, attemptCount, "non_retryable");
    }
    if (attemptCount > budget.maxTransientRetries) {
      return terminalFailure(observed, attemptCount, "retry_exhausted");
    }
  }
  return undefined;
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
      run.id, question, adapter, errorClass, sanitizedFailureMessage(errorClass), Date.now() - startedAt
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function terminalFailure(
  cell: FailedAnswerSnapshotCell,
  attemptCount: number,
  failureDisposition: NonNullable<FailedAnswerSnapshotCell["failureDisposition"]>
): FailedAnswerSnapshotCell {
  return parseAnswerSnapshotCell({ ...cell, attemptCount, failureDisposition }) as FailedAnswerSnapshotCell;
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
    runId, questionId: question.id, surface: adapter.surface, status: "failed", errorClass,
    sanitizedError, executedAt: new Date().toISOString(), executionDurationMs
  };
}

function initializeProviderStates(cells: AnswerSnapshotCell[]): Map<string, ProviderExecutionState> {
  const states = new Map<string, ProviderExecutionState>();
  for (const cell of cells) {
    const providerId = cell.surface.providerId;
    const state = states.get(providerId) ?? { requestCount: 0, spentMicros: 0 };
    state.requestCount += cell.status === "failed" ? (cell.attemptCount ?? 1) : 1;
    state.spentMicros += cell.usage?.estimatedCostMicros ?? 0;
    states.set(providerId, state);
  }
  return states;
}

function canExecute(state: ProviderExecutionState, budget: ValidatedProviderExecutionBudget): boolean {
  return state.requestCount < budget.maxRequests && state.spentMicros < budget.maxEstimatedCostMicros;
}

function validatedBudget(budget: ProviderExecutionBudget): ValidatedProviderExecutionBudget {
  const maxTransientRetries = budget.maxTransientRetries ?? DEFAULT_BUDGET.maxTransientRetries;
  if (!Number.isSafeInteger(budget.maxRequests) || budget.maxRequests < 0 ||
      !Number.isSafeInteger(budget.maxEstimatedCostMicros) || budget.maxEstimatedCostMicros < 0 ||
      !Number.isSafeInteger(budget.timeoutMs) || budget.timeoutMs <= 0 ||
      !Number.isSafeInteger(maxTransientRetries) || maxTransientRetries < 0) {
    throw new TypeError("Provider execution budgets require non-negative integer limits and a positive timeout.");
  }
  return { ...budget, maxTransientRetries };
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

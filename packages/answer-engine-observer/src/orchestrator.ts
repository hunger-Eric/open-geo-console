import { createAnswerSnapshotCellId } from "./identity";
import type {
  AnswerAdapterErrorClass,
  AnswerEngineAdapter,
  AnswerExecutionStateLedger,
  AnswerQuestion,
  AnswerSnapshotCell,
  FailedAnswerSnapshotCell,
  ObserveAnswerMatrixInput,
  ObserveAnswerMatrixResult,
  ProviderCellAttemptLedger,
  ProviderExecutionBudget,
  ProviderExecutionLedger
} from "./types";
import { parseAnswerQuestion, parseAnswerSnapshotCell, parseAnswerSnapshotRun } from "./validation";

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
  const questionIds = new Set(questions.map(({ id }) => id));
  if (cells.some((cell) => !questionIds.has(cell.questionId))) {
    throw new Error("Existing cells must belong to the observed question set.");
  }
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) {
    throw new Error("Existing snapshot cell identities must be unique.");
  }
  const expectedCellProviders = new Map<string, string>();
  for (const adapter of input.adapters) {
    for (const question of questions) {
      expectedCellProviders.set(
        createAnswerSnapshotCellId({ runId: run.id, questionId: question.id, surface: adapter.surface }),
        adapter.surface.providerId
      );
    }
  }
  const expectedProviderIds = new Set(input.adapters.map(({ surface }) => surface.providerId));
  const executionState = parseExecutionState(
    run.id, cells, input.existingExecutionState, input.expectedCheckpointRevision,
    expectedCellProviders, expectedProviderIds
  );
  const identities = new Set(cells.map((cell) => cell.id));
  const orderedExpectedCellIds: string[] = [];

  for (const adapter of input.adapters) {
    const providerId = adapter.surface.providerId;
    const budget = validatedBudget(input.budgets?.[providerId] ?? DEFAULT_BUDGET);
    const providerLedger = executionState.providers[providerId] ?? {
      requestCount: 0, estimatedCostMicros: 0, cells: {}
    };
    executionState.providers[providerId] = providerLedger;
    for (const question of questions) {
      const id = createAnswerSnapshotCellId({ runId: run.id, questionId: question.id, surface: adapter.surface });
      orderedExpectedCellIds.push(id);
      if (identities.has(id)) continue;
      const cell = await executeCellWithRecovery(
        adapter, run, question, id, budget, providerLedger, executionState, input.persistCheckpoint
      );
      if (!cell) continue;
      cells.push(cell);
      identities.add(cell.id);
    }
  }
  return {
    cells,
    pendingCellIds: orderedExpectedCellIds.filter((id) => !identities.has(id)),
    executionState: structuredClone(executionState)
  };
}

async function executeCellWithRecovery(
  adapter: AnswerEngineAdapter,
  run: ObserveAnswerMatrixInput["run"],
  question: AnswerQuestion,
  expectedId: string,
  budget: ValidatedProviderExecutionBudget,
  providerLedger: ProviderExecutionLedger,
  executionState: AnswerExecutionStateLedger,
  persistCheckpoint: ObserveAnswerMatrixInput["persistCheckpoint"]
): Promise<AnswerSnapshotCell | undefined> {
  const attemptLedger = providerLedger.cells[expectedId] ?? { attemptCount: 0, transientAttemptCount: 0 };
  providerLedger.cells[expectedId] = attemptLedger;
  while (canExecute(providerLedger, budget)) {
    providerLedger.requestCount += 1;
    attemptLedger.attemptCount += 1;
    const observed = parseAnswerSnapshotCell(await observeWithTimeout(adapter, run, question, budget.timeoutMs));
    if (observed.id !== expectedId) throw new Error("Adapter returned a cell for a different run, question, or surface.");
    providerLedger.estimatedCostMicros += observed.usage?.estimatedCostMicros ?? 0;
    if (observed.status === "succeeded") {
      await checkpoint(executionState, persistCheckpoint, observed);
      return observed;
    }
    if (!TRANSIENT_ERRORS.has(observed.errorClass)) {
      const terminal = terminalFailure(observed, attemptLedger.attemptCount, "non_retryable");
      await checkpoint(executionState, persistCheckpoint, terminal);
      return terminal;
    }
    attemptLedger.transientAttemptCount += 1;
    if (attemptLedger.transientAttemptCount > budget.maxTransientRetries) {
      const terminal = terminalFailure(observed, attemptLedger.attemptCount, "retry_exhausted");
      await checkpoint(executionState, persistCheckpoint, terminal);
      return terminal;
    }
    await checkpoint(executionState, persistCheckpoint);
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

function parseExecutionState(
  runId: string,
  cells: AnswerSnapshotCell[],
  existing: AnswerExecutionStateLedger | undefined,
  expectedCheckpointRevision: number,
  expectedCellProviders: Map<string, string>,
  expectedProviderIds: Set<string>
): AnswerExecutionStateLedger {
  if (!Number.isSafeInteger(expectedCheckpointRevision) || expectedCheckpointRevision < 0) {
    throw new Error("expectedCheckpointRevision must be a non-negative integer.");
  }
  if (!existing) {
    if (cells.length > 0) throw new Error("Existing cells require a persisted provider execution state ledger.");
    if (expectedCheckpointRevision !== 0) throw new Error("A new execution state must expect checkpoint revision zero.");
    return { runId, checkpointRevision: 0, providers: {} };
  }
  if (existing.runId !== runId || !existing.providers || typeof existing.providers !== "object") {
    throw new Error("Provider execution state ledger must belong to the observed run.");
  }
  const checkpointRevision = nonNegativeInteger(existing.checkpointRevision, "checkpointRevision");
  if (checkpointRevision !== expectedCheckpointRevision) {
    throw new Error("expectedCheckpointRevision does not match the persisted execution state.");
  }
  const result: AnswerExecutionStateLedger = { runId, checkpointRevision, providers: {} };
  for (const [providerId, raw] of Object.entries(existing.providers)) {
    if (!providerId.trim() || !raw || typeof raw !== "object") throw new Error("Provider execution ledger is invalid.");
    if (!expectedProviderIds.has(providerId)) throw new Error("Provider execution ledger contains an unexpected provider.");
    const requestCount = nonNegativeInteger(raw.requestCount, "provider requestCount");
    const estimatedCostMicros = nonNegativeInteger(raw.estimatedCostMicros, "provider estimatedCostMicros");
    const cellLedgers: Record<string, ProviderCellAttemptLedger> = {};
    for (const [cellId, ledger] of Object.entries(raw.cells ?? {})) {
      const expectedProviderId = expectedCellProviders.get(cellId);
      if (!expectedProviderId) throw new Error("Provider execution ledger contains an unexpected cell identity.");
      if (expectedProviderId !== providerId) {
        throw new Error("Provider execution ledger cell is stored under the wrong provider.");
      }
      const attemptCount = nonNegativeInteger(ledger.attemptCount, "cell attemptCount");
      const transientAttemptCount = nonNegativeInteger(ledger.transientAttemptCount, "cell transientAttemptCount");
      if (!cellId.trim() || transientAttemptCount > attemptCount) throw new Error("Provider cell attempt ledger is invalid.");
      cellLedgers[cellId] = { attemptCount, transientAttemptCount };
    }
    const recordedAttempts = Object.values(cellLedgers).reduce((sum, ledger) => sum + ledger.attemptCount, 0);
    if (recordedAttempts !== requestCount) throw new Error("Provider request count must equal its persisted cell attempts.");
    result.providers[providerId] = { requestCount, estimatedCostMicros, cells: cellLedgers };
  }
  for (const cell of cells) {
    if (cell.status === "failed" && (!cell.attemptCount || !cell.failureDisposition)) {
      throw new Error("Existing failed cells must carry terminal attempt metadata.");
    }
    const ledger = result.providers[cell.surface.providerId]?.cells[cell.id];
    if (!ledger || ledger.attemptCount < 1 ||
        (cell.status === "failed" && ledger.attemptCount !== cell.attemptCount)) {
      throw new Error("Existing cells must match the persisted provider execution state ledger.");
    }
    const providerCost = result.providers[cell.surface.providerId]!.estimatedCostMicros;
    const persistedCellCost = cells
      .filter(({ surface }) => surface.providerId === cell.surface.providerId)
      .reduce((sum, item) => sum + (item.usage?.estimatedCostMicros ?? 0), 0);
    if (providerCost < persistedCellCost) {
      throw new Error("Provider execution ledger cost cannot be lower than persisted cell usage.");
    }
    if (cell.status === "succeeded" && ledger.transientAttemptCount >= ledger.attemptCount) {
      throw new Error("Succeeded cells require a final non-transient success attempt.");
    }
    if (cell.status === "failed" && cell.failureDisposition === "retry_exhausted" &&
        ledger.transientAttemptCount !== ledger.attemptCount) {
      throw new Error("Retry-exhausted cells require every recorded attempt to be transient.");
    }
    if (cell.status === "failed" && cell.failureDisposition === "non_retryable" &&
        ledger.transientAttemptCount >= ledger.attemptCount) {
      throw new Error("Non-retryable cells require a final non-transient attempt.");
    }
  }
  return result;
}

async function checkpoint(
  executionState: AnswerExecutionStateLedger,
  persistCheckpoint: ObserveAnswerMatrixInput["persistCheckpoint"],
  cell?: AnswerSnapshotCell
): Promise<void> {
  const expectedRevision = executionState.checkpointRevision;
  executionState.checkpointRevision += 1;
  const snapshot = structuredClone(executionState);
  // Phase 3 PostgreSQL persistence MUST atomically compare expectedRevision and write the
  // monotonic next state together with the optional cell. This pure package cannot trust rollback state.
  await persistCheckpoint?.({ expectedRevision, executionState: snapshot, ...(cell ? { cell } : {}) });
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

function canExecute(ledger: ProviderExecutionLedger, budget: ValidatedProviderExecutionBudget): boolean {
  return ledger.requestCount < budget.maxRequests && ledger.estimatedCostMicros < budget.maxEstimatedCostMicros;
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

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value as number;
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

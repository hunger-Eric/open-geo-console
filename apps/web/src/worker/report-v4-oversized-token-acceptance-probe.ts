import {
  evaluateModelTokenBudget,
  ModelTokenBudgetError,
  runWithModelTokenBudget,
  type ModelTokenBudgetInput
} from "@open-geo-console/ai-report-engine";
import {
  buildReportV4MimoStructuredTokenBudget
} from "../report-v4/mimo-provider";
import type { ReportV4ModelRuntimeConfig } from "../report-v4/model-runtime-config";
import {
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserverEvent
} from "./report-v4-acceptance-observer";
import type { ReportV4CoreAcceptanceRuntime } from "./report-v4-core-acceptance";

export const REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID =
  "acceptance:oversized-token:page-analysis:v1" as const;

const PROBE_SYSTEM_TEXT =
  "Report V4 protected acceptance oversized-token probe. A provider call is forbidden.";
const PROBE_INPUT_PREFIX = "report-v4-oversized-token-acceptance-probe:v1\n";
const PROBE_ASCII_FILL = "A";
const MAX_RECIPE_DOUBLINGS = 30;

export interface ReportV4OversizedTokenAcceptanceProbeEvidence {
  readonly operation: "page_analysis";
  readonly unitId: typeof REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID;
  readonly estimatedSystemTokens: number;
  readonly estimatedInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly providerSafetyMarginTokens: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly contextWindowTokens: number;
}

export interface ReportV4OversizedTokenAcceptanceProbeRecipe {
  readonly budget: ModelTokenBudgetInput;
  readonly evidence: ReportV4OversizedTokenAcceptanceProbeEvidence;
}

type RunTokenBudget = <T>(
  input: ModelTokenBudgetInput,
  providerCall: () => Promise<T>
) => Promise<T>;

export interface ReportV4OversizedTokenAcceptanceProbeDependencies {
  readonly runBudget?: RunTokenBudget;
}

/**
 * Reconstructs the protected-acceptance probe solely from the locked model
 * runtime. The repeated ASCII recipe deliberately consults the real estimator
 * after every doubling; it never assumes that characters equal tokens.
 */
export function buildReportV4OversizedTokenAcceptanceProbe(
  modelRuntime: ReportV4ModelRuntimeConfig
): ReportV4OversizedTokenAcceptanceProbeRecipe {
  let asciiFill = PROBE_ASCII_FILL;
  for (let iteration = 0; iteration <= MAX_RECIPE_DOUBLINGS; iteration += 1) {
    const budget = buildReportV4MimoStructuredTokenBudget(modelRuntime, {
      operation: "pageAnalysis",
      systemText: PROBE_SYSTEM_TEXT,
      inputText: `${PROBE_INPUT_PREFIX}${asciiFill}`
    });
    if (budget.estimatedInputTokens > budget.maxInputTokens) {
      const evaluated = evaluateModelTokenBudget(budget);
      if (evaluated.accepted || evaluated.code !== "max_input_exceeded") {
        throw new Error("The fixed Report V4 oversized-token recipe did not produce the required max-input rejection.");
      }
      const frozenBudget = Object.freeze({ ...budget });
      return Object.freeze({
        budget: frozenBudget,
        evidence: Object.freeze({
          operation: "page_analysis",
          unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID,
          estimatedSystemTokens: frozenBudget.estimatedSystemTokens,
          estimatedInputTokens: frozenBudget.estimatedInputTokens,
          reservedOutputTokens: frozenBudget.reservedOutputTokens,
          providerSafetyMarginTokens: frozenBudget.providerSafetyMarginTokens,
          maxInputTokens: frozenBudget.maxInputTokens,
          maxOutputTokens: frozenBudget.maxOutputTokens,
          contextWindowTokens: frozenBudget.contextWindowTokens
        })
      });
    }
    asciiFill += asciiFill;
  }
  throw new Error("The fixed Report V4 oversized-token recipe could not exceed the locked page-analysis input limit.");
}

/**
 * Emits the deterministic started -> rejected proof only for a protected
 * acceptance runtime. No provider adapter is accepted by this boundary, and
 * reaching the budget runner's callback fails closed.
 */
export async function runReportV4OversizedTokenAcceptanceProbe(
  input: {
    readonly modelRuntime: ReportV4ModelRuntimeConfig;
    readonly acceptanceRuntime: ReportV4CoreAcceptanceRuntime | null;
    readonly signal?: AbortSignal;
  },
  dependencies: ReportV4OversizedTokenAcceptanceProbeDependencies = {}
): Promise<ReportV4OversizedTokenAcceptanceProbeEvidence | null> {
  if (!input.acceptanceRuntime) return null;
  input.signal?.throwIfAborted();

  const recipe = buildReportV4OversizedTokenAcceptanceProbe(input.modelRuntime);
  const started = modelEvent("started", recipe.budget);
  try {
    await input.acceptanceRuntime.observer.claimExternalIo(started);
  } catch (error) {
    if (!(error instanceof ReportV4AcceptanceIndeterminateOperationError)) throw error;
  }

  input.signal?.throwIfAborted();
  let providerCallbackReached = false;
  const unexpectedAcceptance = new Error(
    "The Report V4 oversized-token acceptance probe was unexpectedly accepted."
  );
  try {
    await (dependencies.runBudget ?? runWithModelTokenBudget)(recipe.budget, async () => {
      providerCallbackReached = true;
      throw new Error("The Report V4 oversized-token acceptance probe reached its forbidden provider callback.");
    });
    throw unexpectedAcceptance;
  } catch (error) {
    if (providerCallbackReached) throw error;
    if (error === unexpectedAcceptance) throw error;
    if (!(error instanceof ModelTokenBudgetError)
      || error.code !== "max_input_exceeded"
      || error.rejection.code !== "max_input_exceeded"
      || error.rejection.estimatedTokens !== recipe.budget.estimatedInputTokens
      || error.rejection.limitTokens !== recipe.budget.maxInputTokens) {
      throw new Error("The Report V4 oversized-token acceptance probe encountered an unexpected token-budget failure.", {
        cause: error
      });
    }
  }

  input.signal?.throwIfAborted();
  await input.acceptanceRuntime.observer.finishExternalIo({ ...started, phase: "rejected" });
  return recipe.evidence;
}

function modelEvent(
  phase: "started" | "rejected",
  budget: ModelTokenBudgetInput
): Extract<ReportV4AcceptanceObserverEvent, { kind: "model_operation" }> {
  return {
    kind: "model_operation",
    operation: "page_analysis",
    unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID,
    attempt: 0,
    phase,
    details: {
      providerCall: false,
      retry: false,
      budgetOutcome: "rejected",
      inputTokens: exactNonnegativeInteger(
        budget.estimatedSystemTokens + budget.estimatedInputTokens,
        "combined input estimate"
      ),
      outputTokens: exactNonnegativeInteger(budget.reservedOutputTokens, "reserved output estimate")
    }
  };
}

function exactNonnegativeInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`The Report V4 oversized-token probe ${field} must be a nonnegative safe integer.`);
  }
  return value;
}

import { describe, expect, it, vi } from "vitest";
import {
  ModelTokenBudgetError,
  runWithModelTokenBudget,
  type ModelTokenBudgetInput
} from "@open-geo-console/ai-report-engine";
import {
  loadReportV4ModelRuntimeConfig,
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID
} from "../report-v4/model-runtime-config";
import {
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserver
} from "./report-v4-acceptance-observer";
import type { ReportV4CoreAcceptanceRuntime } from "./report-v4-core-acceptance";
import {
  buildReportV4OversizedTokenAcceptanceProbe,
  REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID,
  runReportV4OversizedTokenAcceptanceProbe
} from "./report-v4-oversized-token-acceptance-probe";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02

describe("Report V4 oversized-token protected acceptance probe", () => {
  it("is a strict no-op without a protected acceptance runtime", async () => {
    const runtime = modelRuntime();
    const runBudget = vi.fn();

    await expect(runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: runtime,
      acceptanceRuntime: null
    }, { runBudget })).resolves.toBeNull();

    expect(runBudget).not.toHaveBeenCalled();
  });

  it("uses the real locked estimator and limits to prove max-input rejection with exact evidence and zero provider calls", async () => {
    const runtime = modelRuntime();
    const acceptance = acceptanceRuntime();
    const providerCall = vi.fn();
    const runBudget = vi.fn(async <T>(budget: ModelTokenBudgetInput, call: () => Promise<T>) =>
      runWithModelTokenBudget(budget, async () => {
        providerCall();
        return call();
      }));

    const evidence = await runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: runtime,
      acceptanceRuntime: acceptance
    }, { runBudget });

    const independentlyBuilt = buildReportV4OversizedTokenAcceptanceProbe(runtime);
    expect(evidence).toEqual(independentlyBuilt.evidence);
    expect(evidence).toEqual({
      operation: "page_analysis",
      unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID,
      estimatedSystemTokens: independentlyBuilt.budget.estimatedSystemTokens,
      estimatedInputTokens: independentlyBuilt.budget.estimatedInputTokens,
      reservedOutputTokens: independentlyBuilt.budget.reservedOutputTokens,
      providerSafetyMarginTokens: independentlyBuilt.budget.providerSafetyMarginTokens,
      maxInputTokens: independentlyBuilt.budget.maxInputTokens,
      maxOutputTokens: independentlyBuilt.budget.maxOutputTokens,
      contextWindowTokens: independentlyBuilt.budget.contextWindowTokens
    });
    expect(evidence!.estimatedInputTokens).toBeGreaterThan(evidence!.maxInputTokens);
    expect(acceptance.observer.claimExternalIo).toHaveBeenCalledExactlyOnceWith(modelEvent("started", independentlyBuilt.budget));
    expect(acceptance.observer.finishExternalIo).toHaveBeenCalledExactlyOnceWith(modelEvent("rejected", independentlyBuilt.budget));
    expect(runBudget).toHaveBeenCalledOnce();
    expect(providerCall).not.toHaveBeenCalled();
  });

  it("completes the rejected terminal event after an exact idempotent started replay", async () => {
    const acceptance = acceptanceRuntime({
      claimExternalIo: vi.fn(async () => {
        throw new ReportV4AcceptanceIndeterminateOperationError();
      })
    });

    await expect(runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: modelRuntime(),
      acceptanceRuntime: acceptance
    })).resolves.toMatchObject({ operation: "page_analysis" });

    expect(acceptance.observer.finishExternalIo).toHaveBeenCalledOnce();
  });

  it("fails closed if the budget runner unexpectedly accepts or reaches its provider callback", async () => {
    const acceptedWithoutCallback = vi.fn(async () => undefined);
    await expect(runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: modelRuntime(),
      acceptanceRuntime: acceptanceRuntime()
    }, { runBudget: acceptedWithoutCallback })).rejects.toThrow(/unexpectedly accepted/i);

    const callsProvider = vi.fn(async <T>(_budget: ModelTokenBudgetInput, call: () => Promise<T>) => call());
    await expect(runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: modelRuntime(),
      acceptanceRuntime: acceptanceRuntime()
    }, { runBudget: callsProvider })).rejects.toThrow(/provider callback/i);
  });

  it("fails closed on an unexpected runner error type and never emits a rejected terminal", async () => {
    const acceptance = acceptanceRuntime();
    await expect(runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: modelRuntime(),
      acceptanceRuntime: acceptance
    }, {
      runBudget: vi.fn(async () => {
        throw new Error("unexpected runner failure");
      })
    })).rejects.toThrow(/unexpected token-budget failure/i);

    expect(acceptance.observer.finishExternalIo).not.toHaveBeenCalled();
  });

  it("does not accept a different token-budget rejection as the oversized-input proof", async () => {
    const acceptance = acceptanceRuntime();
    await expect(runReportV4OversizedTokenAcceptanceProbe({
      modelRuntime: modelRuntime(),
      acceptanceRuntime: acceptance
    }, {
      runBudget: vi.fn(async () => {
        throw new ModelTokenBudgetError({
          accepted: false,
          code: "max_output_exceeded",
          estimatedTokens: 2,
          limitTokens: 1
        });
      })
    })).rejects.toThrow(/unexpected token-budget failure/i);

    expect(acceptance.observer.finishExternalIo).not.toHaveBeenCalled();
  });
});

function modelRuntime() {
  return loadReportV4ModelRuntimeConfig({
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID
  });
}

function acceptanceRuntime(overrides: Partial<ReportV4AcceptanceObserver> = {}): ReportV4CoreAcceptanceRuntime {
  const observer = {
    session: {},
    scenario: { kind: "success" },
    observe: vi.fn(async (event) => ({ event, inserted: true })),
    claimExternalIo: vi.fn(async (event) => ({ event, inserted: true })),
    finishExternalIo: vi.fn(async (event) => ({ event, inserted: true })),
    ...overrides
  } as unknown as ReportV4AcceptanceObserver;
  return { observer, faultController: null, baselineFingerprint: null };
}

function modelEvent(phase: "started" | "rejected", budget: ModelTokenBudgetInput) {
  return {
    kind: "model_operation" as const,
    operation: "page_analysis" as const,
    unitId: REPORT_V4_OVERSIZED_TOKEN_ACCEPTANCE_PROBE_UNIT_ID,
    attempt: 0 as const,
    phase,
    details: {
      providerCall: false,
      retry: false,
      budgetOutcome: "rejected" as const,
      inputTokens: budget.estimatedSystemTokens + budget.estimatedInputTokens,
      outputTokens: budget.reservedOutputTokens
    }
  };
}

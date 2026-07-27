import { describe, expect, it, vi } from "vitest";
import {
  ModelTokenBudgetError,
  evaluateModelTokenBudget,
  runWithModelTokenBudget,
  type ModelTokenBudgetInput
} from "./model-token-budget";

// @requirement GEO-V4-TOKEN-01

function budget(overrides: Partial<ModelTokenBudgetInput> = {}): ModelTokenBudgetInput {
  return {
    contextWindowTokens: 1_000,
    maxInputTokens: 600,
    maxOutputTokens: 200,
    estimatedSystemTokens: 100,
    estimatedInputTokens: 500,
    reservedOutputTokens: 200,
    providerSafetyMarginTokens: 100,
    ...overrides
  };
}

describe("model Token budget gate", () => {
  it("accepts equality in the exact approved context formula", () => {
    expect(evaluateModelTokenBudget(budget())).toEqual({
      accepted: true,
      estimatedTotalTokens: 900
    });
    expect(evaluateModelTokenBudget(budget({ estimatedInputTokens: 600 }))).toEqual({
      accepted: true,
      estimatedTotalTokens: 1_000
    });
  });

  it("rejects a total above the configured context window deterministically", () => {
    expect(evaluateModelTokenBudget(budget({ providerSafetyMarginTokens: 201 }))).toEqual({
      accepted: false,
      code: "context_window_exceeded",
      estimatedTotalTokens: 1_001,
      limitTokens: 1_000
    });
  });

  it("enforces operation maxInputTokens and maxOutputTokens independently", () => {
    expect(evaluateModelTokenBudget(budget({ estimatedInputTokens: 601, providerSafetyMarginTokens: 0 }))).toMatchObject({
      accepted: false,
      code: "max_input_exceeded",
      limitTokens: 600
    });
    expect(evaluateModelTokenBudget(budget({ reservedOutputTokens: 201, estimatedInputTokens: 400 }))).toMatchObject({
      accepted: false,
      code: "max_output_exceeded",
      limitTokens: 200
    });
  });

  it("returns a typed deterministic rejection for invalid token estimates", () => {
    expect(evaluateModelTokenBudget(budget({ estimatedSystemTokens: -1 }))).toEqual({
      accepted: false,
      code: "invalid_token_estimate",
      field: "estimatedSystemTokens"
    });
  });

  it("makes zero provider calls when rejected and marks the error non-retryable", async () => {
    const provider = vi.fn(async () => "provider-result");

    await expect(runWithModelTokenBudget(
      budget({ providerSafetyMarginTokens: 201 }),
      provider
    )).rejects.toMatchObject({
      name: "ModelTokenBudgetError",
      code: "context_window_exceeded",
      retryable: false
    });
    expect(provider).not.toHaveBeenCalled();
  });

  it("invokes the provider callback exactly once after acceptance", async () => {
    const provider = vi.fn(async () => "provider-result");

    await expect(runWithModelTokenBudget(budget(), provider)).resolves.toBe("provider-result");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("exposes one stable typed error class for rejected budgets", () => {
    const error = new ModelTokenBudgetError({
      accepted: false,
      code: "max_input_exceeded",
      estimatedTokens: 601,
      limitTokens: 600
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.retryable).toBe(false);
    expect(error.code).toBe("max_input_exceeded");
  });
});

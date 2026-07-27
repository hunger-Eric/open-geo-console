import { describe, expect, it } from "vitest";
import { evaluateModelTokenBudget } from "./model-token-budget";
import { parseModelProfile } from "./model-profile";
import {
  buildModelOperationTokenBudget,
  createModelTokenEstimatorRegistry
} from "./model-token-estimator";

// @requirement GEO-V4-TOKEN-01

describe("V4 injectable model Token estimator registry", () => {
  it("builds an immutable budget compatible with the existing pre-call gate", () => {
    const estimators = createModelTokenEstimatorRegistry([estimator()]);
    const budget = buildModelOperationTokenBudget({
      profile: parseModelProfile(profile()),
      operation: "pageAnalysis",
      estimate: {
        systemText: "system",
        inputText: "input",
        reservedOutputTokens: 200,
        providerSafetyMarginTokens: 100
      },
      estimators
    });

    expect(budget).toEqual({
      contextWindowTokens: 1_000,
      maxInputTokens: 600,
      maxOutputTokens: 200,
      estimatedSystemTokens: 6,
      estimatedInputTokens: 5,
      reservedOutputTokens: 200,
      providerSafetyMarginTokens: 100
    });
    expect(evaluateModelTokenBudget(budget)).toEqual({ accepted: true, estimatedTotalTokens: 311 });
    expect(Object.isFrozen(budget)).toBe(true);
    expect(Object.isFrozen(estimators)).toBe(true);
  });

  it("resolves only an exact tokenizer and exposes its stable estimator identity", () => {
    const estimators = createModelTokenEstimatorRegistry([estimator()]);
    expect(estimators.resolve("fixture-tokenizer")).toMatchObject({
      estimatorId: "fixture-estimator",
      tokenizer: "fixture-tokenizer"
    });
    expect(() => estimators.resolve("unknown-tokenizer")).toThrow(/unknown.*estimator|tokenizer/i);
  });

  it("rejects duplicate estimator and tokenizer identities", () => {
    expect(() => createModelTokenEstimatorRegistry([estimator(), estimator()])).toThrow(/duplicate.*estimator/i);
    expect(() => createModelTokenEstimatorRegistry([
      estimator(),
      { ...estimator(), estimatorId: "other-estimator" }
    ])).toThrow(/duplicate.*tokenizer/i);
    expect(() => createModelTokenEstimatorRegistry([
      estimator(),
      { ...estimator(), tokenizer: "other-tokenizer" }
    ])).toThrow(/duplicate.*estimator/i);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "fails closed when an injected estimator returns %s",
    (invalid) => {
      const estimators = createModelTokenEstimatorRegistry([{
        ...estimator(),
        estimateTokens: () => invalid
      }]);
      expect(() => buildModelOperationTokenBudget({
        profile: parseModelProfile(profile()),
        operation: "pageAnalysis",
        estimate: {
          systemText: "system",
          inputText: "input",
          reservedOutputTokens: 200,
          providerSafetyMarginTokens: 100
        },
        estimators
      })).toThrow(/estimate|nonnegative.*integer/i);
    }
  );

  it("rejects unknown fields and invalid estimate inputs", () => {
    const base = {
      profile: parseModelProfile(profile()),
      operation: "pageAnalysis" as const,
      estimate: {
        systemText: "system",
        inputText: "input",
        reservedOutputTokens: 200,
        providerSafetyMarginTokens: 100
      },
      estimators: createModelTokenEstimatorRegistry([estimator()])
    };
    expect(() => buildModelOperationTokenBudget({ ...base, rawPrompt: "must not cross boundary" }))
      .toThrow(/rawPrompt|unknown/i);
    expect(() => buildModelOperationTokenBudget({
      ...base,
      estimate: { ...base.estimate, reservedOutputTokens: -1 }
    })).toThrow(/reservedOutputTokens|nonnegative/i);
    expect(() => buildModelOperationTokenBudget({ ...base, operation: "providerDiscovery" as "pageAnalysis" }))
      .toThrow(/operation|providerDiscovery/i);
  });
});

function estimator() {
  return {
    estimatorId: "fixture-estimator",
    tokenizer: "fixture-tokenizer",
    estimateTokens: (text: string) => text.length
  };
}

function profile() {
  const operation = (model: string) => ({
    model,
    contextWindowTokens: 1_000,
    maxInputTokens: 600,
    maxOutputTokens: 200,
    timeoutMs: 30_000,
    nativeWebSearch: false,
    structuredOutput: true,
    tokenizer: "fixture-tokenizer"
  });
  return {
    profileId: "fixture-profile",
    provider: "fixture-provider",
    adapterId: "fixture-adapter",
    operations: {
      pageAnalysis: operation("fixture-page-model"),
      websiteSynthesis: operation("fixture-site-model"),
      questionAnswer: { ...operation("fixture-question-model"), nativeWebSearch: true },
      sourceDiagnosis: operation("fixture-diagnosis-model")
    }
  };
}

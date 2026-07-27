import { describe, expect, it } from "vitest";
import { createModelProfileRegistry, createModelProviderCapabilityRegistry } from "./model-profile-registry";
import { createModelTokenEstimatorRegistry } from "./model-token-estimator";

// @requirement GEO-V4-TOKEN-01

describe("V4 model profile runtime registry", () => {
  it("resolves exact provider, model, endpoint capability, tokenizer and estimator identity", () => {
    const registry = createModelProfileRegistry({
      profiles: [profile()],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    });

    const resolved = registry.load("fixture-profile");

    expect(resolved.provider).toBe("fixture-provider");
    expect(resolved.operations.questionAnswer).toMatchObject({
      model: "fixture-question-model",
      endpointCapability: "fixture-native-search-json",
      nativeWebSearch: true,
      structuredOutput: true,
      tokenizer: "fixture-tokenizer",
      estimatorId: "fixture-estimator"
    });
    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.operations)).toBe(true);
    expect(Object.isFrozen(resolved.operations.questionAnswer)).toBe(true);
  });

  it("fails closed for unknown profile, provider, adapter and estimator identities without fallback", () => {
    const registry = createModelProfileRegistry({
      profiles: [profile()],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    });
    expect(() => registry.load("unknown-profile")).toThrow(/unknown.*profile/i);

    expect(() => createModelProfileRegistry({
      profiles: [{ ...profile(), provider: "unsupported-provider" }],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    })).toThrow(/provider|adapter|unsupported/i);
    expect(() => createModelProfileRegistry({
      profiles: [{ ...profile(), adapterId: "missing-adapter" }],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    })).toThrow(/adapter|unsupported/i);

    const unknownEstimator = profile();
    unknownEstimator.operations.pageAnalysis.tokenizer = "unknown-tokenizer";
    expect(() => createModelProfileRegistry({
      profiles: [unknownEstimator],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    })).toThrow(/estimator|tokenizer|unknown/i);
  });

  it("rejects duplicate profile and provider adapter identities", () => {
    expect(() => createModelProfileRegistry({
      profiles: [profile(), profile()],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    })).toThrow(/duplicate.*profile/i);

    expect(() => createModelProviderCapabilityRegistry([providerCapability(), providerCapability()]))
      .toThrow(/duplicate.*adapter/i);
  });

  it("requires exactly one capability entry for each V4 operation", () => {
    const duplicate = providerCapability();
    duplicate.operations[1] = { ...duplicate.operations[0]! };
    expect(() => createModelProviderCapabilityRegistry([duplicate])).toThrow(/duplicate.*pageAnalysis/i);

    const missing = providerCapability();
    missing.operations.pop();
    expect(() => createModelProviderCapabilityRegistry([missing])).toThrow(/sourceDiagnosis|missing/i);

    const unknown = providerCapability() as unknown as { operations: Array<Record<string, unknown>> };
    unknown.operations[0]!.operation = "providerDiscovery";
    expect(() => createModelProviderCapabilityRegistry([unknown])).toThrow(/operation|providerDiscovery/i);
  });

  it("rejects unsupported endpoint capabilities instead of weakening the profile", () => {
    const noSearch = providerCapability();
    noSearch.operations[2]!.nativeWebSearch = false;
    expect(() => createModelProfileRegistry({
      profiles: [profile()],
      providers: createModelProviderCapabilityRegistry([noSearch]),
      estimators: estimatorRegistry()
    })).toThrow(/questionAnswer.*nativeWebSearch|capability/i);

    const noStructure = providerCapability();
    noStructure.operations[0]!.structuredOutput = false;
    expect(() => createModelProfileRegistry({
      profiles: [profile()],
      providers: createModelProviderCapabilityRegistry([noStructure]),
      estimators: estimatorRegistry()
    })).toThrow(/pageAnalysis.*structuredOutput|capability/i);
  });

  it("requires the approved V4 operation capabilities before runtime admission", () => {
    const missingSearch = profile();
    missingSearch.operations.questionAnswer.nativeWebSearch = false;
    expect(() => createModelProfileRegistry({
      profiles: [missingSearch],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    })).toThrow(/questionAnswer.*nativeWebSearch|required/i);

    const missingStructure = profile();
    missingStructure.operations.sourceDiagnosis.structuredOutput = false;
    expect(() => createModelProfileRegistry({
      profiles: [missingStructure],
      providers: providerRegistry(),
      estimators: estimatorRegistry()
    })).toThrow(/sourceDiagnosis.*structuredOutput|required/i);
  });

  it("rejects secret-like and unknown provider capability fields", () => {
    expect(() => createModelProviderCapabilityRegistry([{
      ...providerCapability(),
      apiKey: "must-not-enter-registry"
    }])).toThrow(/apiKey|secret|unknown/i);
    const nested = providerCapability() as unknown as { operations: Array<Record<string, unknown>> };
    nested.operations[0]!.endpointUrl = "https://user:secret@example.test";
    expect(() => createModelProviderCapabilityRegistry([nested])).toThrow(/endpointUrl|secret|unknown/i);
  });
});

function profile() {
  const operation = (model: string, nativeWebSearch = false) => ({
    model,
    contextWindowTokens: 1_000,
    maxInputTokens: 600,
    maxOutputTokens: 200,
    timeoutMs: 30_000,
    nativeWebSearch,
    structuredOutput: true,
    tokenizer: "fixture-tokenizer"
  });
  return {
    profileId: "fixture-profile",
    provider: "fixture-provider",
    adapterId: "fixture-adapter",
    operations: {
      pageAnalysis: operation("fixture-page-model"),
      websiteSynthesis: operation("fixture-website-model"),
      questionAnswer: operation("fixture-question-model", true),
      sourceDiagnosis: operation("fixture-diagnosis-model")
    }
  };
}

function providerCapability() {
  return {
    provider: "fixture-provider",
    adapterId: "fixture-adapter",
    operations: [
      capability("pageAnalysis", "fixture-structured-json"),
      capability("websiteSynthesis", "fixture-structured-json"),
      capability("questionAnswer", "fixture-native-search-json", true),
      capability("sourceDiagnosis", "fixture-structured-json")
    ]
  };
}

function capability(
  operation: "pageAnalysis" | "websiteSynthesis" | "questionAnswer" | "sourceDiagnosis",
  endpointCapability: string,
  nativeWebSearch = false
) {
  return { operation, endpointCapability, nativeWebSearch, structuredOutput: true };
}

function providerRegistry() {
  return createModelProviderCapabilityRegistry([providerCapability()]);
}

function estimatorRegistry() {
  return createModelTokenEstimatorRegistry([{
    estimatorId: "fixture-estimator",
    tokenizer: "fixture-tokenizer",
    estimateTokens: (text: string) => text.length
  }]);
}

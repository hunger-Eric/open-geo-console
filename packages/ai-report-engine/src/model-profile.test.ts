import { describe, expect, it } from "vitest";
import { MODEL_PROFILE_OPERATIONS, parseModelProfile } from "./model-profile";

// @requirement GEO-V4-TOKEN-01

function validProfile(): unknown {
  const operation = (model: string) => ({
    model,
    contextWindowTokens: 1_000,
    maxInputTokens: 600,
    maxOutputTokens: 200,
    timeoutMs: 30_000,
    nativeWebSearch: true,
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
      questionAnswer: operation("fixture-answer-model"),
      sourceDiagnosis: operation("fixture-diagnosis-model")
    }
  };
}

describe("model profile parsing", () => {
  it("accepts exactly the four approved operations and preserves their capabilities", () => {
    const parsed = parseModelProfile(validProfile());

    expect(MODEL_PROFILE_OPERATIONS).toEqual([
      "pageAnalysis",
      "websiteSynthesis",
      "questionAnswer",
      "sourceDiagnosis"
    ]);
    expect(Object.keys(parsed.operations)).toEqual(MODEL_PROFILE_OPERATIONS);
    expect(parsed.operations.questionAnswer).toMatchObject({
      model: "fixture-answer-model",
      nativeWebSearch: true,
      structuredOutput: true,
      tokenizer: "fixture-tokenizer"
    });
  });

  it.each(["profileId", "provider", "adapterId"] as const)("requires a nonblank %s", (field) => {
    const input = validProfile() as Record<string, unknown>;
    input[field] = "  ";
    expect(() => parseModelProfile(input)).toThrow(new RegExp(field, "i"));
  });

  it.each(["pageAnalysis", "websiteSynthesis", "questionAnswer", "sourceDiagnosis"] as const)(
    "requires the %s operation",
    (operation) => {
      const input = validProfile() as { operations: Record<string, unknown> };
      delete input.operations[operation];
      expect(() => parseModelProfile(input)).toThrow(new RegExp(operation, "i"));
    }
  );

  it("rejects unknown top-level, operation and operation-field keys", () => {
    const topLevel = validProfile() as Record<string, unknown>;
    topLevel["unexpected"] = true;
    expect(() => parseModelProfile(topLevel)).toThrow(/unknown.*unexpected/i);

    const operation = validProfile() as { operations: Record<string, unknown> };
    operation.operations["otherOperation"] = operation.operations["pageAnalysis"];
    expect(() => parseModelProfile(operation)).toThrow(/unknown.*otherOperation/i);

    const field = validProfile() as { operations: Record<string, Record<string, unknown>> };
    field.operations.pageAnalysis!["temperature"] = 0;
    expect(() => parseModelProfile(field)).toThrow(/unknown.*temperature/i);
  });

  it.each(["contextWindowTokens", "maxInputTokens", "maxOutputTokens", "timeoutMs"] as const)(
    "requires positive integer %s values",
    (field) => {
      for (const invalid of [0, -1, 1.5, Number.NaN]) {
        const input = validProfile() as { operations: Record<string, Record<string, unknown>> };
        input.operations.pageAnalysis![field] = invalid;
        expect(() => parseModelProfile(input)).toThrow(new RegExp(field, "i"));
      }
    }
  );

  it("requires model and tokenizer identifiers and capability booleans", () => {
    for (const field of ["model", "tokenizer"] as const) {
      const input = validProfile() as { operations: Record<string, Record<string, unknown>> };
      input.operations.questionAnswer![field] = "";
      expect(() => parseModelProfile(input)).toThrow(new RegExp(field, "i"));
    }
    for (const field of ["nativeWebSearch", "structuredOutput"] as const) {
      const input = validProfile() as { operations: Record<string, Record<string, unknown>> };
      input.operations.questionAnswer![field] = "true";
      expect(() => parseModelProfile(input)).toThrow(new RegExp(field, "i"));
    }
  });

  it("rejects operation limits that cannot fit inside the context window", () => {
    const input = validProfile() as { operations: Record<string, Record<string, unknown>> };
    input.operations.websiteSynthesis!.maxInputTokens = 900;
    input.operations.websiteSynthesis!.maxOutputTokens = 200;
    expect(() => parseModelProfile(input)).toThrow(/websiteSynthesis.*limits.*context/i);
  });
});

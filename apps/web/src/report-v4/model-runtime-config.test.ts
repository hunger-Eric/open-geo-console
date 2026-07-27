import {
  buildModelOperationTokenBudget,
  parseModelProfile,
  runWithModelTokenBudget
} from "@open-geo-console/ai-report-engine";
import { describe, expect, it, vi } from "vitest";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import {
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
  REPORT_V4_MODEL_CAPABILITY_EVIDENCE,
  loadReportV4ModelRuntimeConfig,
  resolveReportV4LockedModelRuntime
} from "./model-runtime-config";

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02

describe("Report V4 production model runtime configuration", () => {
  it("requires one exact compile-time profile ID without defaults, trimming, or fallback", () => {
    for (const environment of [
      {},
      { OGC_REPORT_V4_MODEL_PROFILE_ID: "" },
      { OGC_REPORT_V4_MODEL_PROFILE_ID: ` ${REPORT_V4_MIMO_V25_PRO_PROFILE_ID}` },
      { OGC_REPORT_V4_MODEL_PROFILE_ID: "unknown-profile", OGC_AI_MODEL: "mimo-v2.5-pro" }
    ]) {
      expect(() => loadReportV4ModelRuntimeConfig(environment)).toThrow(/OGC_REPORT_V4_MODEL_PROFILE_ID|profile/i);
    }
  });

  it("pins the exact four-operation capability matrix so profile drift fails visibly", () => {
    const runtime = loadReportV4ModelRuntimeConfig(environment());

    expect(runtime.modelProfile).toMatchObject({
      profileId: REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
      provider: "xiaomi-mimo",
      adapterId: "mimo-openai-chat-completions-v1"
    });
    expect(runtime.resolvedProfile.operations).toMatchObject({
      pageAnalysis: { endpointCapability: "openai-chat-completions-structured-output" },
      websiteSynthesis: { endpointCapability: "openai-chat-completions-structured-output" },
      questionAnswer: { endpointCapability: "openai-chat-completions-web-search-structured-output" },
      sourceDiagnosis: { endpointCapability: "openai-chat-completions-structured-output" }
    });
    expect(Object.fromEntries(Object.entries(runtime.modelProfile.operations).map(([operation, value]) => [
      operation,
      {
        model: value.model,
        nativeWebSearch: value.nativeWebSearch,
        structuredOutput: value.structuredOutput,
        tokenizer: value.tokenizer
      }
    ]))).toEqual({
      pageAnalysis: {
        model: "mimo-v2.5-pro",
        nativeWebSearch: false,
        structuredOutput: true,
        tokenizer: "mimo-v2.5-pro-utf8-conservative-v1"
      },
      websiteSynthesis: {
        model: "mimo-v2.5-pro",
        nativeWebSearch: false,
        structuredOutput: true,
        tokenizer: "mimo-v2.5-pro-utf8-conservative-v1"
      },
      questionAnswer: {
        model: "mimo-v2.5-pro",
        nativeWebSearch: true,
        structuredOutput: true,
        tokenizer: "mimo-v2.5-pro-utf8-conservative-v1"
      },
      sourceDiagnosis: {
        model: "mimo-v2.5-pro",
        nativeWebSearch: false,
        structuredOutput: true,
        tokenizer: "mimo-v2.5-pro-utf8-conservative-v1"
      }
    });
    for (const operation of Object.values(runtime.modelProfile.operations)) {
      expect(operation.contextWindowTokens).toBeLessThan(1_000_000);
      expect(operation.maxOutputTokens).toBeLessThan(128_000);
    }
  });

  it("records only official MiMo capability evidence with pinned document and verification dates", () => {
    expect(REPORT_V4_MODEL_CAPABILITY_EVIDENCE).toEqual([
      {
        capability: "model-limits-and-features",
        sourceUrl: "https://mimo.mi.com/docs/en-US/quick-start/model",
        documentVersion: "2026-06-29",
        verifiedOn: "2026-07-16"
      },
      {
        capability: "openai-chat-completions-endpoint-and-structured-output",
        sourceUrl: "https://mimo.mi.com/docs/en-US/api/chat/openai-api",
        documentVersion: "2026-06-29",
        verifiedOn: "2026-07-16"
      },
      {
        capability: "native-web-search",
        sourceUrl: "https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/tool-calling/web-search",
        documentVersion: "2026-06-29",
        verifiedOn: "2026-07-16"
      }
    ]);
    expect(Object.isFrozen(REPORT_V4_MODEL_CAPABILITY_EVIDENCE)).toBe(true);
    expect(REPORT_V4_MODEL_CAPABILITY_EVIDENCE.every(Object.isFrozen)).toBe(true);
  });

  it("returns a deeply frozen snapshot-ready profile and deterministic UTF-8 estimator", () => {
    const first = loadReportV4ModelRuntimeConfig(environment());
    const second = loadReportV4ModelRuntimeConfig(environment());

    expect(parseModelProfile(first.modelProfile)).toEqual(first.modelProfile);
    expect(first.tokenEstimator.estimateTokens("A中🙂")).toBe(8);
    expect(first.tokenEstimator.estimateTokens("A中🙂")).toBe(second.tokenEstimator.estimateTokens("A中🙂"));
    expect(first.tokenEstimator).toMatchObject({
      estimatorId: "mimo-v2.5-pro-utf8-byte-upper-bound-v1",
      tokenizer: "mimo-v2.5-pro-utf8-conservative-v1"
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.modelProfile)).toBe(true);
    expect(Object.isFrozen(first.modelProfile.operations.questionAnswer)).toBe(true);
    expect(Object.isFrozen(first.resolvedProfile)).toBe(true);
    expect(Object.isFrozen(first.resolvedProfile.operations.questionAnswer)).toBe(true);
    expect(Object.isFrozen(first.tokenEstimator)).toBe(true);
    expect(Object.isFrozen(first.tokenEstimators)).toBe(true);
  });

  it("does not load secrets, API keys, base URLs, or dynamic model overrides into public profile data", () => {
    const injectedSecret = "must-not-cross-public-profile-boundary";
    const runtime = loadReportV4ModelRuntimeConfig({
      ...environment(),
      OGC_AI_API_KEY: injectedSecret,
      OGC_AI_BASE_URL: `https://${injectedSecret}.example.test/v1`,
      OGC_AI_MODEL: "dynamic-model-must-be-ignored",
      OGC_PUBLIC_SEARCH_MIMO_API_KEY: injectedSecret
    });
    const serialized = JSON.stringify({ runtime, profilePayload });

    expect(serialized).not.toContain(injectedSecret);
    expect(serialized).not.toContain("dynamic-model-must-be-ignored");
    expect(serialized).not.toMatch(/apiKey|baseUrl|authorization|secret/i);
  });

  it("resolves an exact locked profile without consulting current environment admission", () => {
    const first = resolveReportV4LockedModelRuntime(structuredClone(profilePayload));
    const second = resolveReportV4LockedModelRuntime(structuredClone(profilePayload));

    expect(first).toBe(second);
    expect(first.modelProfile).toEqual(parseModelProfile(profilePayload));
    expect(first.modelProfile.operations.questionAnswer.model).toBe("mimo-v2.5-pro");
    expect(first.resolvedProfile.operations.questionAnswer.nativeWebSearch).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.modelProfile)).toBe(true);
    expect(Object.isFrozen(first.resolvedProfile)).toBe(true);
  });

  it.each([
    ["profile", (profile: Record<string, unknown>) => { profile.profileId = "unknown-profile"; }],
    ["provider", (profile: Record<string, unknown>) => { profile.provider = "unknown-provider"; }],
    ["adapter", (profile: Record<string, unknown>) => { profile.adapterId = "unknown-adapter"; }],
    ["model", (profile: Record<string, unknown>) => {
      operation(profile, "questionAnswer").model = "different-model";
    }],
    ["tokenizer", (profile: Record<string, unknown>) => {
      operation(profile, "questionAnswer").tokenizer = "unknown-tokenizer";
    }],
    ["web-search capability", (profile: Record<string, unknown>) => {
      operation(profile, "questionAnswer").nativeWebSearch = false;
    }],
    ["structured-output capability", (profile: Record<string, unknown>) => {
      operation(profile, "sourceDiagnosis").structuredOutput = false;
    }],
    ["limits", (profile: Record<string, unknown>) => {
      operation(profile, "pageAnalysis").maxInputTokens = 1;
    }]
  ])("rejects locked-profile %s drift instead of resolving another runtime", (_label, mutate) => {
    const candidate = structuredClone(profilePayload) as Record<string, unknown>;
    mutate(candidate);

    expect(() => resolveReportV4LockedModelRuntime(candidate)).toThrow(/locked|approved|profile|capability|drift/i);
  });

  it("rejects an oversized smallest unit before making any provider call", async () => {
    const runtime = loadReportV4ModelRuntimeConfig(environment());
    const provider = vi.fn(async () => "provider-result");
    const budget = buildModelOperationTokenBudget({
      profile: runtime.modelProfile,
      operation: "pageAnalysis",
      estimate: {
        systemText: "",
        inputText: "x".repeat(runtime.modelProfile.operations.pageAnalysis.maxInputTokens + 1),
        reservedOutputTokens: 1,
        providerSafetyMarginTokens: 0
      },
      estimators: runtime.tokenEstimators
    });

    await expect(runWithModelTokenBudget(budget, provider)).rejects.toMatchObject({
      name: "ModelTokenBudgetError",
      code: "max_input_exceeded",
      retryable: false
    });
    expect(provider).not.toHaveBeenCalled();
  });
});

function environment(): NodeJS.ProcessEnv {
  return { OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID };
}

function operation(profile: Record<string, unknown>, name: string): Record<string, unknown> {
  return (profile.operations as Record<string, Record<string, unknown>>)[name]!;
}

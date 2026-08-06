import { describe, expect, it, vi } from "vitest";
import {
  ProviderProfileRuntimeError,
  prepareProviderProfileRuntime,
  resolveProviderProfileRuntime
} from "./runtime";

describe("unified Worker provider profile runtime", () => {
  it.each([
    ["mimo_native", mimoEnvironment(), "mimo", "xiaomi-mimo", "mimo-v2.5-pro"],
    ["sensenova_anysearch", sensenovaEnvironment(), "anysearch", "sensenova", "mimo-v2.5-pro"]
  ] as const)("resolves one immutable complete %s bundle", (_id, environment, adapterId, providerId, modelId) => {
    const runtime = resolveProviderProfileRuntime(environment);
    expect(runtime).toMatchObject({ profileId: _id, publicSearchAdapterId: adapterId });
    expect(runtime.summary).toEqual({
      profileId: _id,
      modelProfileId: runtime.modelRuntime.modelProfile.profileId,
      providerId,
      modelId,
      publicSearchAdapterId: adapterId
    });
    expect(runtime.generalClient.configuredModel).toBe(modelId);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.isFrozen(runtime.summary)).toBe(true);
  });

  it.each([
    ["mimo_native", mimoEnvironment()],
    ["sensenova_anysearch", sensenovaEnvironment()]
  ] as const)("derives the %s general client timeout from the locked model profile", async (_id, environment) => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      const fetchMock = vi.fn(((_url: unknown, init?: RequestInit) => {
        observedSignal = init?.signal as AbortSignal | undefined;
        return new Promise((_resolve, reject) => {
          observedSignal?.addEventListener("abort", () => reject(observedSignal.reason), { once: true });
        });
      }) as unknown as typeof globalThis.fetch);
      const runtime = resolveProviderProfileRuntime(environment, { fetch: fetchMock });
      const expectedMs = Math.max(...Object.values(runtime.modelRuntime.modelProfile.operations).map((operation) => operation.timeoutMs));
      expect(expectedMs).toBeGreaterThan(60_000);
      const settled = runtime.generalClient.completeJson({ messages: [{ role: "user", content: "ping" }] })
        .then(() => "resolved", (error: unknown) => String(error));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(observedSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(expectedMs - 60_000);
      expect(observedSignal?.aborted).toBe(true);
      await expect(settled).resolves.toContain("AI request timed out.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed for missing, unknown, incomplete and half-switched profiles without exposing secrets", () => {
    const secret = "must-not-appear-in-errors";
    for (const environment of [
      { NODE_ENV: "test" },
      { NODE_ENV: "test", OGC_PROVIDER_PROFILE: "unknown" },
      { ...sensenovaEnvironment(), OGC_AI_API_KEY: "" },
      { ...sensenovaEnvironment(), OGC_PUBLIC_SEARCH_ADAPTER: "mimo" },
      { ...sensenovaEnvironment(), OGC_REPORT_V4_MIMO_API_KEY: secret },
      { ...mimoEnvironment(), OGC_PUBLIC_SEARCH_ADAPTER: "anysearch" }
    ]) {
      let thrown: unknown;
      try { resolveProviderProfileRuntime(environment as NodeJS.ProcessEnv); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(ProviderProfileRuntimeError);
      expect(String(thrown)).not.toContain(secret);
      expect(JSON.stringify(thrown)).not.toContain(secret);
    }
  });

  it("binds only an exact active authority matching the selected adapter", () => {
    const runtime = resolveProviderProfileRuntime(mimoEnvironment());
    const matching = publicRuntime("mimo", true);
    expect(prepareProviderProfileRuntime(runtime, matching as never).publicSearchRuntime).toBe(matching);
    expect(() => prepareProviderProfileRuntime(runtime, publicRuntime("anysearch", true) as never)).toThrow(/conflict/i);
    expect(() => prepareProviderProfileRuntime(runtime, publicRuntime("mimo", false) as never)).toThrow(/conflict/i);
  });

  it("constructs no opposite-profile operation", () => {
    expect(() => resolveProviderProfileRuntime({
      ...mimoEnvironment(),
      OGC_REPORT_V4_MIMO_BASE_URL: undefined,
      OGC_REPORT_V4_MIMO_API_KEY: undefined,
      OGC_AI_BASE_URL: "https://token.sensenova.cn/v1",
      OGC_AI_API_KEY: "sense-key",
      OGC_AI_MODEL: "mimo-v2.5-pro"
    })).toThrow(/incomplete|profile/i);
    expect(() => resolveProviderProfileRuntime({
      ...sensenovaEnvironment(),
      OGC_AI_BASE_URL: undefined,
      OGC_AI_API_KEY: undefined,
      OGC_AI_MODEL: undefined,
      OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
      OGC_REPORT_V4_MIMO_API_KEY: "mimo-key"
    })).toThrow(/conflict|incomplete/i);
  });

  it("rejects an incompatible locked snapshot instead of reinterpreting it", () => {
    const mimo = resolveProviderProfileRuntime(mimoEnvironment());
    const sense = resolveProviderProfileRuntime(sensenovaEnvironment());
    expect(() => mimo.createDiagnosisProvider(sense.modelRuntime)).toThrow(/locked|conflict/i);
    expect(() => sense.createStructuredInvoker(mimo.modelRuntime)).toThrow(/locked|conflict/i);
  });
});

function baseEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OGC_DEPLOYMENT_PROFILE: "staging",
    OGC_PUBLIC_SEARCH_RUNTIME_ENABLED: "true",
    OGC_PUBLIC_SEARCH_LOCALE: "zh-CN",
    OGC_PUBLIC_SEARCH_REGION: "CN"
  };
}

function mimoEnvironment(): NodeJS.ProcessEnv {
  return {
    ...baseEnvironment(),
    OGC_PROVIDER_PROFILE: "mimo_native",
    OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-mimo-v2.5-pro-v1",
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "mimo-key",
    OGC_PUBLIC_SEARCH_ADAPTER: "mimo",
    OGC_PUBLIC_SEARCH_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_PUBLIC_SEARCH_MIMO_API_KEY: "mimo-search-key",
    OGC_PUBLIC_SEARCH_MIMO_MODEL: "mimo-v2.5-pro"
  };
}

function sensenovaEnvironment(): NodeJS.ProcessEnv {
  return {
    ...baseEnvironment(),
    OGC_PROVIDER_PROFILE: "sensenova_anysearch",
    OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-sensenova-mimo-v2.5-pro-v1",
    OGC_AI_BASE_URL: "https://token.sensenova.cn/v1",
    OGC_AI_API_KEY: "sense-key",
    OGC_AI_MODEL: "mimo-v2.5-pro",
    OGC_AI_JSON_RESPONSE_FORMAT: "true",
    OGC_PUBLIC_SEARCH_ADAPTER: "anysearch",
    OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: "https://api.anysearch.com/v1/search",
    OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: "anysearch-key"
  };
}

function publicRuntime(adapterId: "mimo" | "anysearch", active: boolean) {
  return {
    adapter: {},
    authority: { active },
    identity: { adapterId }
  };
}

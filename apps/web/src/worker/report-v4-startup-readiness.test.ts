import { describe, expect, it, vi } from "vitest";
import {
  loadReportV4ModelRuntimeConfig,
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
  REPORT_V4_OPENAI_COMPATIBLE_MIMO_V25_PRO_PROFILE_ID,
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";
import type { ProviderProfileRuntime } from "../provider-profile/runtime";
import {
  assertReportV4WorkerStartupReadiness,
  prepareWorkerStartup
} from "./report-v4-startup-readiness";

describe("Report V4 Worker startup readiness", () => {
  it("fails closed on every missing selected-profile variable before database startup or claiming", async () => {
    for (const missing of [
      "OGC_PROVIDER_PROFILE",
      "OGC_REPORT_V4_MIMO_BASE_URL",
      "OGC_REPORT_V4_MIMO_API_KEY",
      "OGC_PUBLIC_SEARCH_MIMO_BASE_URL",
      "OGC_PUBLIC_SEARCH_MIMO_API_KEY",
      "OGC_PUBLIC_SEARCH_MIMO_MODEL",
      "OGC_TOKEN_HASH_SECRET"
    ] as const) {
      const environment = validEnvironment();
      delete environment[missing];
      const ensureDatabase = vi.fn();
      await expect(prepareWorkerStartup({ environment, ensureDatabase }))
        .rejects.toThrow(/profile|OGC_|MiMo|key|incomplete/i);
      expect(ensureDatabase, missing).not.toHaveBeenCalled();
    }
  });

  it("rejects the observed half-switch and secret errors before database startup", async () => {
    const secret = "must-not-appear";
    for (const environment of [
      { ...validEnvironment(), OGC_PROVIDER_PROFILE: "sensenova_anysearch" },
      { ...validEnvironment(), OGC_PUBLIC_SEARCH_ADAPTER: "anysearch" },
      { ...validEnvironment(), OGC_REPORT_V4_MIMO_BASE_URL: "https://other.example/v1", OGC_REPORT_V4_MIMO_API_KEY: secret }
    ]) {
      const ensureDatabase = vi.fn();
      let thrown: unknown;
      try { await prepareWorkerStartup({ environment, ensureDatabase }); } catch (error) { thrown = error; }
      expect(thrown).toBeInstanceOf(Error);
      expect(String(thrown)).not.toContain(secret);
      expect(ensureDatabase).not.toHaveBeenCalled();
    }
  });

  it("rejects a blank or undersized commercial token secret before database startup", async () => {
    for (const tokenSecret of ["", "too-short"]) {
      const ensureDatabase = vi.fn();
      await expect(prepareWorkerStartup({
        environment: { ...validEnvironment(), OGC_TOKEN_HASH_SECRET: tokenSecret },
        ensureDatabase
      })).rejects.toThrow(/OGC_TOKEN_HASH_SECRET|32 characters/i);
      expect(ensureDatabase).not.toHaveBeenCalled();
    }
  });

  it("rejects drifted structured-output, context and output-budget capabilities", () => {
    const runtime = loadReportV4ModelRuntimeConfig(validEnvironment());
    const questionAnswer = runtime.resolvedProfile.operations.questionAnswer;
    for (const candidate of [
      runtimeWith(runtime, { structuredOutput: false }),
      runtimeWith(runtime, { maxInputTokens: questionAnswer.contextWindowTokens }),
      runtimeWith(runtime, { maxOutputTokens: 0 })
    ]) {
      expect(() => assertReportV4WorkerStartupReadiness(validEnvironment(), {
        resolveProfileRuntime: () => ({ modelRuntime: candidate }) as ProviderProfileRuntime
      })).toThrow(/capability|structured|context|budget|output/i);
    }
  });

  it("prepares exact authority after database connectivity and publishes before returning", async () => {
    const calls: string[] = [];
    const publishRuntime = vi.fn(() => { calls.push("publish"); });
    const prepared = await prepareWorkerStartup({
      environment: validEnvironment(),
      ensureDatabase: async () => { calls.push("database"); },
      validateReportV4Readiness: () => { calls.push("profile"); },
      resolvePublicSearchRuntime: async () => { calls.push("authority"); return publicRuntime(); },
      publishRuntime
    });
    expect(prepared.profileId).toBe("mimo_native");
    expect(calls).toEqual(["profile", "database", "authority", "publish"]);
    expect(publishRuntime).toHaveBeenCalledWith(prepared);
  });

  it("prepares the canonical external-search synthesis route without a vendor-named alias", async () => {
    const publishRuntime = vi.fn();
    const prepared = await prepareWorkerStartup({
      environment: externalSearchEnvironment(),
      ensureDatabase: vi.fn(),
      resolvePublicSearchRuntime: async () => publicRuntime("anysearch"),
      publishRuntime
    });
    expect(prepared).toMatchObject({
      profileId: "external_search_synthesis",
      publicSearchAdapterId: "anysearch",
      summary: {
        profileId: "external_search_synthesis",
        modelProfileId: REPORT_V4_OPENAI_COMPATIBLE_MIMO_V25_PRO_PROFILE_ID,
        providerId: "openai-compatible",
        modelId: "mimo-v2.5-pro"
      }
    });
    expect(publishRuntime).toHaveBeenCalledWith(prepared);
  });

  it("retries a nested transient database cause once, then resolves authority", async () => {
    const calls: string[] = [];
    let attempt = 0;
    const ensureDatabase = vi.fn(async () => {
      calls.push("database");
      if (attempt++ === 0) throw { cause: { cause: { code: "ECONNRESET" } } };
    });
    await prepareWorkerStartup({
      environment: validEnvironment(), ensureDatabase,
      validateReportV4Readiness: () => { calls.push("profile"); },
      resolvePublicSearchRuntime: async () => { calls.push("authority"); return publicRuntime(); },
      publishRuntime: () => { calls.push("publish"); },
      delay: async (milliseconds) => { calls.push(`delay:${milliseconds}`); }
    });
    expect(calls).toEqual(["profile", "database", "delay:1000", "database", "authority", "publish"]);
  });

  it("uses all five attempts and never resolves authority before rethrowing the last transient error", async () => {
    const failure = { code: "CONNECT_TIMEOUT" };
    const ensureDatabase = vi.fn().mockRejectedValue(failure);
    const delays: number[] = [];
    const resolvePublicSearchRuntime = vi.fn(async () => publicRuntime());
    await expect(prepareWorkerStartup({
      environment: validEnvironment(), ensureDatabase, resolvePublicSearchRuntime,
      delay: async (milliseconds) => { delays.push(milliseconds); }
    })).rejects.toBe(failure);
    expect(ensureDatabase).toHaveBeenCalledTimes(5);
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
    expect(resolvePublicSearchRuntime).not.toHaveBeenCalled();
  });

  it("fails fast for non-transient database errors and profile errors", async () => {
    for (const failure of [{ code: "28P01" }, { code: "PROFILE_MISMATCH" }, { code: "42P01" }, { message: "CONNECT_TIMEOUT" }]) {
      const ensureDatabase = vi.fn().mockRejectedValue(failure);
      const delay = vi.fn(async () => undefined);
      await expect(prepareWorkerStartup({ environment: validEnvironment(), ensureDatabase, delay })).rejects.toBe(failure);
      expect(ensureDatabase).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
    }
    const ensureDatabase = vi.fn();
    await expect(prepareWorkerStartup({
      environment: validEnvironment(), ensureDatabase,
      validateReportV4Readiness: () => { throw new Error("profile readiness failed"); }
    })).rejects.toThrow("profile readiness failed");
    expect(ensureDatabase).not.toHaveBeenCalled();
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OGC_DEPLOYMENT_PROFILE: "staging",
    OGC_PROVIDER_PROFILE: "mimo_native",
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "v4-secret",
    OGC_PUBLIC_SEARCH_RUNTIME_ENABLED: "true",
    OGC_PUBLIC_SEARCH_ADAPTER: "mimo",
    OGC_PUBLIC_SEARCH_LOCALE: "zh-CN",
    OGC_PUBLIC_SEARCH_REGION: "CN",
    OGC_PUBLIC_SEARCH_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_PUBLIC_SEARCH_MIMO_API_KEY: "search-secret",
    OGC_PUBLIC_SEARCH_MIMO_MODEL: "mimo-v2.5-pro",
    OGC_TOKEN_HASH_SECRET: "v4-commercial-token-secret-at-least-32-characters"
  };
}

function externalSearchEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OGC_DEPLOYMENT_PROFILE: "staging",
    OGC_PROVIDER_PROFILE: "external_search_synthesis",
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_OPENAI_COMPATIBLE_MIMO_V25_PRO_PROFILE_ID,
    OGC_AI_BASE_URL: "https://opencode.ai/zen/go/v1",
    OGC_AI_API_KEY: "openai-compatible-secret",
    OGC_AI_MODEL: "mimo-v2.5-pro",
    OGC_AI_JSON_RESPONSE_FORMAT: "true",
    OGC_PUBLIC_SEARCH_RUNTIME_ENABLED: "true",
    OGC_PUBLIC_SEARCH_ADAPTER: "anysearch",
    OGC_PUBLIC_SEARCH_LOCALE: "zh-CN",
    OGC_PUBLIC_SEARCH_REGION: "CN",
    OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: "https://api.anysearch.com/v1/search",
    OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: "anysearch-secret",
    OGC_TOKEN_HASH_SECRET: "v4-commercial-token-secret-at-least-32-characters"
  };
}

function publicRuntime(adapterId: "mimo" | "anysearch" = "mimo") {
  return {
    adapter: {},
    authority: { active: true },
    identity: { adapterId }
  } as never;
}

function runtimeWith(
  runtime: ReportV4ModelRuntimeConfig,
  overrides: Partial<ReportV4ModelRuntimeConfig["resolvedProfile"]["operations"]["questionAnswer"]>
): ReportV4ModelRuntimeConfig {
  return {
    ...runtime,
    resolvedProfile: {
      ...runtime.resolvedProfile,
      operations: {
        ...runtime.resolvedProfile.operations,
        questionAnswer: { ...runtime.resolvedProfile.operations.questionAnswer, ...overrides }
      }
    }
  };
}

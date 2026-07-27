import { describe, expect, it, vi } from "vitest";
import {
  loadReportV4ModelRuntimeConfig,
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";
import {
  assertReportV4WorkerStartupReadiness,
  prepareWorkerStartup
} from "./report-v4-startup-readiness";

describe("Report V4 Worker startup readiness", () => {
  it("fails closed on every missing V4 runtime variable before database startup or claiming", async () => {
    for (const missing of [
      "OGC_REPORT_V4_MODEL_PROFILE_ID",
      "OGC_REPORT_V4_MIMO_BASE_URL",
      "OGC_REPORT_V4_MIMO_API_KEY",
      "OGC_TOKEN_HASH_SECRET"
    ] as const) {
      const environment = validEnvironment();
      delete environment[missing];
      const ensureDatabase = vi.fn();

      await expect(prepareWorkerStartup({ environment, ensureDatabase }))
        .rejects.toThrow(/Report V4|OGC_REPORT_V4|MiMo|profile|key/i);
      expect(ensureDatabase, missing).not.toHaveBeenCalled();
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

  it("rejects a non-approved MiMo endpoint without exposing the configured key", () => {
    const secret = "must-not-appear";
    const environment = {
      ...validEnvironment(),
      OGC_REPORT_V4_MIMO_BASE_URL: "https://other.example/v1",
      OGC_REPORT_V4_MIMO_API_KEY: secret
    };

    expect(() => assertReportV4WorkerStartupReadiness(environment)).toThrowError(
      expect.not.stringContaining(secret)
    );
  });

  it("rejects drifted structured-output, public-search, context, and output-budget capabilities", () => {
    const runtime = loadReportV4ModelRuntimeConfig(validEnvironment());
    const questionAnswer = runtime.resolvedProfile.operations.questionAnswer;
    const candidates = [
      runtimeWith(runtime, { structuredOutput: false }),
      runtimeWith(runtime, { nativeWebSearch: false }),
      runtimeWith(runtime, { maxInputTokens: questionAnswer.contextWindowTokens }),
      runtimeWith(runtime, { maxOutputTokens: 0 })
    ];

    for (const candidate of candidates) {
      expect(() => assertReportV4WorkerStartupReadiness(validEnvironment(), {
        loadModelRuntime: () => candidate,
        readMimoProviderConfig: () => ({ baseUrl: "https://api.xiaomimimo.com/v1", apiKey: "secret" })
      })).toThrow(/capability|structured|search|context|budget|output/i);
    }
  });

  it("admits the approved locked profile and MiMo configuration before database startup", async () => {
    const calls: string[] = [];
    const ensureDatabase = vi.fn(async () => { calls.push("database"); });

    await expect(prepareWorkerStartup({
      environment: validEnvironment(),
      ensureDatabase,
      validateReportV4Readiness: () => { calls.push("v4-readiness"); }
    })).resolves.toBeUndefined();
    expect(calls).toEqual(["v4-readiness", "database"]);
  });

  it("retries a nested transient database cause once, then succeeds", async () => {
    const calls: string[] = [];
    let attempt = 0;
    const ensureDatabase = vi.fn(async () => {
      calls.push("database");
      if (attempt++ === 0) throw { cause: { cause: { code: "ECONNRESET" } } };
    });
    await prepareWorkerStartup({
      environment: validEnvironment(), ensureDatabase,
      validateReportV4Readiness: () => { calls.push("model"); },
      delay: async (milliseconds) => { calls.push(`delay:${milliseconds}`); }
    });
    expect(calls).toEqual(["model", "database", "delay:1000", "database"]);
    expect(ensureDatabase).toHaveBeenCalledTimes(2);
  });

  it("uses all five attempts and exponential delays before rethrowing the last transient error", async () => {
    const failure = { code: "CONNECT_TIMEOUT" };
    const ensureDatabase = vi.fn().mockRejectedValue(failure);
    const delays: number[] = [];
    await expect(prepareWorkerStartup({ environment: validEnvironment(), ensureDatabase, delay: async (milliseconds) => { delays.push(milliseconds); } })).rejects.toBe(failure);
    expect(ensureDatabase).toHaveBeenCalledTimes(5);
    expect(delays).toEqual([1000, 2000, 4000, 8000]);
  });

  it("fails fast for auth, profile, schema, and message-only errors", async () => {
    for (const failure of [{ code: "28P01" }, { code: "PROFILE_MISMATCH" }, { code: "42P01" }, { message: "CONNECT_TIMEOUT" }]) {
      const ensureDatabase = vi.fn().mockRejectedValue(failure);
      const delay = vi.fn(async () => undefined);
      await expect(prepareWorkerStartup({ environment: validEnvironment(), ensureDatabase, delay })).rejects.toBe(failure);
      expect(ensureDatabase).toHaveBeenCalledTimes(1);
      expect(delay).not.toHaveBeenCalled();
    }
  });

  it("runs model readiness once before database attempts or delays", async () => {
    const ensureDatabase = vi.fn();
    const delay = vi.fn(async () => undefined);
    await expect(prepareWorkerStartup({
      environment: validEnvironment(), ensureDatabase, delay,
      validateReportV4Readiness: () => { throw new Error("model readiness failed"); }
    })).rejects.toThrow("model readiness failed");
    expect(ensureDatabase).not.toHaveBeenCalled();
    expect(delay).not.toHaveBeenCalled();
  });
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "v4-secret",
    OGC_TOKEN_HASH_SECRET: "v4-commercial-token-secret-at-least-32-characters"
  };
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

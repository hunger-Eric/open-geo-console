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
      "OGC_REPORT_V4_MIMO_API_KEY"
    ] as const) {
      const environment = validEnvironment();
      delete environment[missing];
      const ensureDatabase = vi.fn();

      await expect(prepareWorkerStartup({ environment, ensureDatabase }))
        .rejects.toThrow(/Report V4|OGC_REPORT_V4|MiMo|profile|key/i);
      expect(ensureDatabase, missing).not.toHaveBeenCalled();
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
});

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "v4-secret"
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

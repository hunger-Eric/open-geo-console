import { describe, expect, it, vi } from "vitest";
import { loadReportV4ModelRuntimeConfig } from "./model-runtime-config";
import {
  createReportV4OpenAiCompatibleStructuredInvoker,
  readSenseNovaConfig
} from "./openai-compatible-provider";

describe("SenseNova Report V4 OpenAI-compatible provider", () => {
  it("reuses the existing JSON client with the locked operation model and no native-search tool", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: "mimo-v2.5-pro",
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "existing-system" },
          { role: "user", content: "existing-input" }
        ]
      });
      expect(body).not.toHaveProperty("tools");
      return new Response(JSON.stringify({
        id: "sense-response",
        model: "mimo-v2.5-pro",
        choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }]
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const environment = env();
    const invoker = createReportV4OpenAiCompatibleStructuredInvoker({
      environment,
      runtime: loadReportV4ModelRuntimeConfig(environment),
      fetch: fetch as typeof globalThis.fetch
    });
    await expect(invoker.invoke({
      operation: "sourceDiagnosis",
      systemText: "existing-system",
      inputText: "existing-input",
      signal: new AbortController().signal
    })).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects native-search requests, endpoint/model drift and missing credentials before fetch", async () => {
    const environment = env();
    const fetch = vi.fn();
    const invoker = createReportV4OpenAiCompatibleStructuredInvoker({
      environment,
      runtime: loadReportV4ModelRuntimeConfig(environment),
      fetch: fetch as typeof globalThis.fetch
    });
    await expect(invoker.invoke({
      operation: "questionAnswer",
      systemText: "system",
      inputText: "input",
      signal: new AbortController().signal,
      webSearchLocation: { country: "CN", region: "CN" }
    })).rejects.toMatchObject({ code: "configuration" });
    expect(fetch).not.toHaveBeenCalled();
    for (const drift of [
      { OGC_AI_BASE_URL: "https://example.test/v1" },
      { OGC_AI_MODEL: "different-model" },
      { OGC_AI_API_KEY: "" },
      { OGC_AI_JSON_RESPONSE_FORMAT: "false" }
    ]) {
      expect(() => readSenseNovaConfig({ ...environment, ...drift })).toThrow(/SenseNova|OGC_AI|profile|endpoint|API key/i);
    }
  });

  it("accepts the approved OpenCode Go endpoint with trailing-slash normalization", () => {
    const environment = {
      ...env(),
      OGC_AI_BASE_URL: "https://opencode.ai/zen/go/v1/",
      OGC_AI_API_KEY: "opencode-key"
    };
    expect(readSenseNovaConfig(environment)).toEqual({
      baseUrl: "https://opencode.ai/zen/go/v1",
      apiKey: "opencode-key"
    });
  });
});

function env(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OGC_PROVIDER_PROFILE: "sensenova_anysearch",
    OGC_REPORT_V4_MODEL_PROFILE_ID: "report-v4-sensenova-mimo-v2.5-pro-v1",
    OGC_AI_BASE_URL: "https://token.sensenova.cn/v1",
    OGC_AI_API_KEY: "sense-key",
    OGC_AI_MODEL: "mimo-v2.5-pro",
    OGC_AI_JSON_RESPONSE_FORMAT: "true"
  };
}

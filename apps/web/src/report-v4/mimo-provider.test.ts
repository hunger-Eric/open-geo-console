import { readFileSync } from "node:fs";
import { ModelTokenBudgetError } from "@open-geo-console/ai-report-engine";
import { describe, expect, it, vi } from "vitest";
import {
  ReportV4DiagnosisProviderError,
  type ReportV4DiagnosisProviderRequest
} from "../worker/report-v4-diagnosis-enhancer";
import { ReportV4QuestionProviderError } from "../worker/report-v4-question-answerer";
import { REPORT_V4_MIMO_V25_PRO_PROFILE_ID } from "./model-runtime-config";
import {
  createReportV4MimoDiagnosisProvider,
  createReportV4MimoQuestionAnswerProvider,
  createReportV4MimoStructuredInvoker,
  readReportV4MimoProviderConfig
} from "./mimo-provider";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-ANSWER-01
// @requirement GEO-V4-ANSWER-02
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02

describe("Report V4 dedicated MiMo provider", () => {
  it("requires the exact official endpoint and dedicated key without legacy fallback", () => {
    expect(readReportV4MimoProviderConfig(environment())).toEqual({
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "v4-secret"
    });
    for (const candidate of [
      {},
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://other.example/v1", OGC_REPORT_V4_MIMO_API_KEY: "key" },
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "" },
      {
        OGC_AI_BASE_URL: "https://api.xiaomimimo.com/v1",
        OGC_AI_API_KEY: "legacy-key",
        OGC_PUBLIC_SEARCH_MIMO_API_KEY: "legacy-search-key"
      }
    ]) {
      expect(() => readReportV4MimoProviderConfig(candidate)).toThrow(/OGC_REPORT_V4_MIMO|endpoint|key/i);
    }
  });

  it.each([
    ["pageAnalysis", false],
    ["websiteSynthesis", false],
    ["questionAnswer", true],
    ["sourceDiagnosis", false]
  ] as const)("sends one locked structured request for %s and scopes web search exactly", async (operation, hasSearch) => {
    const requests: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init: init!, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return response({ ok: true });
    });
    const invoker = createReportV4MimoStructuredInvoker({ environment: environment(), fetch });

    await expect(invoker.invoke({
      operation,
      systemText: "Return JSON.",
      inputText: "bounded input",
      signal: new AbortController().signal,
      ...(hasSearch ? { webSearchLocation: { country: "CN", region: "CN" } } : {})
    })).resolves.toEqual({ ok: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(requests[0]!.url).toBe("https://api.xiaomimimo.com/v1/chat/completions");
    expect(requests[0]!.body).toMatchObject({
      model: "mimo-v2.5-pro",
      stream: false,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" }
    });
    expect(requests[0]!.body.messages).toEqual([
      { role: "system", content: "Return JSON." },
      { role: "user", content: "bounded input" }
    ]);
    expect(requests[0]!.body.tools).toEqual(hasSearch ? [{
      type: "web_search",
      force_search: true,
      max_keyword: 3,
      limit: 5,
      user_location: { type: "approximate", country: "CN", region: "CN" }
    }] : undefined);
    expect(String((requests[0]!.init.headers as Record<string, string>).Authorization)).toContain("v4-secret");
  });

  it("rejects an oversized unit before fetch and never retries inside the adapter", async () => {
    const fetch = vi.fn(async () => response({ ok: true }));
    const invoker = createReportV4MimoStructuredInvoker({ environment: environment(), fetch });

    await expect(invoker.invoke({
      operation: "pageAnalysis",
      systemText: "",
      inputText: "x".repeat(65_537),
      signal: new AbortController().signal
    })).rejects.toBeInstanceOf(ModelTokenBudgetError);
    expect(fetch).not.toHaveBeenCalled();

    const failingFetch = vi.fn(async () => { throw new Error("network unavailable"); });
    await expect(createReportV4MimoStructuredInvoker({ environment: environment(), fetch: failingFetch }).invoke({
      operation: "websiteSynthesis",
      systemText: "system",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: "transport", retryable: true });
    expect(failingFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "authentication", false],
    [403, "authentication", false],
    [429, "rate_limited", true],
    [500, "temporary_provider", true],
    [503, "temporary_provider", true],
    [400, "configuration", false]
  ] as const)("classifies HTTP %s without exposing response content", async (status, code, retryable) => {
    const secretBody = "raw-provider-secret-body";
    const provider = createReportV4MimoQuestionAnswerProvider({
      environment: environment(),
      fetch: vi.fn(async () => new Response(secretBody, { status }))
    });
    let error: unknown;
    try {
      await provider.answerWithSources(questionInput());
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ReportV4QuestionProviderError);
    expect(error).toMatchObject({ code, retryable });
    expect(String(error)).not.toContain(secretBody);
    expect(JSON.stringify(error)).not.toContain("v4-secret");
  });

  it("propagates caller abort and marks malformed provider JSON retryable for the outer checkpoint", async () => {
    const controller = new AbortController();
    const reason = new Error("caller cancelled");
    controller.abort(reason);
    const fetch = vi.fn(async () => response({ ok: true }));
    await expect(createReportV4MimoQuestionAnswerProvider({ environment: environment(), fetch }).answerWithSources({
      ...questionInput(),
      signal: controller.signal
    })).rejects.toBe(reason);
    expect(fetch).not.toHaveBeenCalled();

    const malformedFetch = vi.fn(async () => new Response("not-json", { status: 200 }));
    await expect(createReportV4MimoQuestionAnswerProvider({
      environment: environment(),
      fetch: malformedFetch
    }).answerWithSources(questionInput())).rejects.toMatchObject({
      name: "ReportV4QuestionProviderError",
      code: "temporary_provider",
      retryable: true
    });
    expect(malformedFetch).toHaveBeenCalledTimes(1);
  });

  it("binds question ownership locally and retains only canonical same-response annotations", async () => {
    const provider = createReportV4MimoQuestionAnswerProvider({
      environment: environment(),
      now: timeline(),
      fetch: vi.fn(async () => response({
        questionId: "model-controlled-id",
        answerText: "A complete answer.",
        refusal: null,
        sources: [{ canonicalUrl: "https://model-self-report.invalid/" }]
      }, 200, [
        annotation("https://one.example/a#fragment", "One"),
        annotation("https://two.example/b", "Two"),
        annotation("https://three.example/c", "Three"),
        annotation("https://four.example/d", "Four"),
        annotation("https://five.example/e", "Five"),
        annotation("https://six.example/f", "Six")
      ]))
    });

    const result = await provider.answerWithSources(questionInput());

    expect(result.questionId).toBe("question-local-1");
    expect(result.sources).toHaveLength(5);
    expect(result.sources[0]).toMatchObject({ canonicalUrl: "https://one.example/a", title: "One", providerResultOrder: 0 });
    expect(JSON.stringify(result)).not.toContain("model-self-report.invalid");
    expect(result).not.toHaveProperty("rawResponse");
    expect(result).not.toHaveProperty("prompt");
  });

  it("does not fabricate question sources when the same response has no URL annotations", async () => {
    const provider = createReportV4MimoQuestionAnswerProvider({
      environment: environment(),
      fetch: vi.fn(async () => response({
        questionId: "wrong",
        answerText: "A complete answer.",
        refusal: null,
        sources: [{ canonicalUrl: "https://self-reported.invalid/" }]
      }))
    });
    await expect(provider.answerWithSources(questionInput())).resolves.toMatchObject({
      questionId: "question-local-1",
      sources: []
    });
  });

  it("declares the exact question JSON contract and exposes the question-operation model identity", async () => {
    const bodies: Record<string, unknown>[] = [];
    const provider = createReportV4MimoQuestionAnswerProvider({
      environment: environment(),
      fetch: vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return response({ answerText: "A complete answer.", refusal: null });
      })
    });

    expect(provider.model).toBe("mimo-v2.5-pro");
    await provider.answerWithSources(questionInput());

    const systemText = String((bodies[0]!.messages as Array<{ content: string }>)[0]!.content);
    expect(systemText).toContain("exactly these fields and types");
    expect(systemText).toContain('"answerText": string');
    expect(systemText).toContain('"refusal": null');
    expect(systemText).toContain('"code": "safety_refusal" | "policy_refusal" | "high_risk_refusal"');
    expect(systemText).toContain("same-response provider URL annotations");
    expect(systemText).toContain("must never be self-reported");
    expect(systemText.length).toBeLessThanOrEqual(5_000);
  });

  it.each(["diagnose", "retry", "correct"] as const)("builds one bounded source-diagnosis request for %s without tools", async (kind) => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ selectionSummary: "result" });
    });
    const provider = createReportV4MimoDiagnosisProvider({ environment: environment(), fetch });
    const request = diagnosisRequest(kind);

    await expect(provider.generate(request)).resolves.toEqual({ selectionSummary: "result" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodies[0]).not.toHaveProperty("tools");
    expect(bodies[0]).toMatchObject({ model: "mimo-v2.5-pro", stream: false });
    expect(String((bodies[0]!.messages as Array<{ content: string }>)[1]!.content).length).toBeLessThanOrEqual(80_000);
    const systemText = String((bodies[0]!.messages as Array<{ content: string }>)[0]!.content);
    expect(systemText.length).toBeLessThanOrEqual(5_000);
    if (kind === "correct") {
      expect(systemText).toContain('exactly {"field":"selectionSummary","value":string}');
      expect(systemText).toContain("Correct only the requested diagnosis field");
      expect(systemText).toContain("no additional fields");
    } else {
      expect(systemText).toContain("exactly five fields");
      expect(systemText).toContain('"selectionSummary": string');
      expect(systemText).toContain('"observableFactors": exactly 3 objects');
      expect(systemText).toContain('"targetGap": string');
      expect(systemText).toContain('"recommendedActions": exactly 3 objects');
      expect(systemText).toContain('"detailedEvidenceRefs": string[]');
      expect(systemText).toContain('"priority": 1 then 2 then 3');
      expect(systemText).toContain("non-empty subset of detailedEvidenceRefs");
    }
  });

  it("maps diagnosis failures to the diagnosis provider error contract", async () => {
    const provider = createReportV4MimoDiagnosisProvider({
      environment: environment(),
      fetch: vi.fn(async () => new Response("rate limited raw body", { status: 429 }))
    });
    await expect(provider.generate(diagnosisRequest("diagnose"))).rejects.toBeInstanceOf(ReportV4DiagnosisProviderError);
    await expect(provider.generate(diagnosisRequest("diagnose"))).rejects.toMatchObject({
      code: "rate_limited",
      retryable: true
    });
  });

  it("has no dependency on the legacy MiMo adapters that contain their own retry behavior", () => {
    const source = readFileSync(new URL("./mimo-provider.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/public-search-adapters\/mimo|generative-answer|for\s*\([^)]*attempt/i);
  });
});

function environment(): NodeJS.ProcessEnv {
  return {
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "v4-secret"
  };
}

function questionInput() {
  return {
    questionId: "question-local-1",
    question: "Which provider should a buyer choose?",
    locale: "en-US",
    region: "CN",
    signal: new AbortController().signal
  };
}

function diagnosisRequest(kind: "diagnose" | "retry" | "correct"): ReportV4DiagnosisProviderRequest {
  const input = {
    question: { questionId: "q-1", text: "Which provider?" },
    answer: "Provider one.",
    locale: "en-US",
    sources: [],
    targetPages: []
  };
  return kind === "correct"
    ? { kind, field: "selectionSummary", invalidValue: "bad", failureReason: "too short", evidence: input, signal: new AbortController().signal }
    : { kind, input, signal: new AbortController().signal };
}

function annotation(url: string, title: string) {
  return { type: "url_citation", url, title, summary: `${title} summary` };
}

function response(value: unknown, status = 200, annotations: unknown[] = []): Response {
  return new Response(JSON.stringify({
    id: "response-1",
    choices: [{ message: { content: JSON.stringify(value), annotations } }]
  }), { status, headers: { "Content-Type": "application/json" } });
}

function timeline(): () => Date {
  const values = [new Date("2030-01-01T00:00:00.000Z"), new Date("2030-01-01T00:00:01.000Z")];
  return () => values.shift() ?? new Date("2030-01-01T00:00:01.000Z");
}

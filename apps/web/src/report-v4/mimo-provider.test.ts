import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ModelTokenBudgetError,
  buildModelOperationTokenBudget,
  evaluateModelTokenBudget
} from "@open-geo-console/ai-report-engine";
import { describe, expect, it, vi } from "vitest";
import {
  ReportV4DiagnosisProviderError,
  type ReportV4DiagnosisProviderRequest
} from "../worker/report-v4-diagnosis-enhancer";
import { ReportV4QuestionProviderError } from "../worker/report-v4-question-answerer";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";
import {
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
  resolveReportV4LockedModelRuntime
} from "./model-runtime-config";
import {
  MAX_STRUCTURED_CONTENT_CHARS,
  MAX_STRUCTURED_CONTENT_PARTS,
  MIMO_CONTENT_FILTERED_CODE,
  MIMO_INVALID_RESPONSE_CODE,
  MIMO_OUTPUT_TRUNCATED_CODE,
  MIMO_TIMEOUT_CODE,
  ReportV4MimoProviderError,
  buildReportV4MimoDiagnosisTokenBudget,
  buildReportV4MimoQuestionTokenBudget,
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
  it("binds approved pay-as-you-go and Token Plan endpoints to their dedicated key channels", () => {
    expect(readReportV4MimoProviderConfig(environment())).toEqual({
      baseUrl: "https://api.xiaomimimo.com/v1",
      apiKey: "v4-secret"
    });
    expect(readReportV4MimoProviderConfig(tokenPlanEnvironment())).toEqual({
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
      apiKey: "tp-v4-secret"
    });
    for (const candidate of [
      {},
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://other.example/v1", OGC_REPORT_V4_MIMO_API_KEY: "key" },
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "" },
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "tp-wrong-channel" },
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://token-plan-sgp.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "sk-wrong-channel" },
      { OGC_REPORT_V4_MIMO_BASE_URL: "https://token-plan-us.xiaomimimo.com/v1", OGC_REPORT_V4_MIMO_API_KEY: "tp-unknown-region" },
      {
        OGC_AI_BASE_URL: "https://api.xiaomimimo.com/v1",
        OGC_AI_API_KEY: "legacy-key",
        OGC_PUBLIC_SEARCH_MIMO_API_KEY: "legacy-search-key"
      }
    ]) {
      expect(() => readReportV4MimoProviderConfig(candidate)).toThrow(ReportV4MimoProviderError);
      try {
        readReportV4MimoProviderConfig(candidate);
      } catch (error) {
        expect(error).toMatchObject({ code: "configuration", retryable: false });
        expect(String(error)).toMatch(/OGC_REPORT_V4_MIMO|endpoint|key/i);
      }
    }
  });

  it("sends Token Plan requests to the configured approved regional endpoint", async () => {
    const fetch = vi.fn(async () => response({ ok: true }));
    const invoker = createReportV4MimoStructuredInvoker({ environment: tokenPlanEnvironment(), fetch });

    await invoker.invoke({
      operation: "pageAnalysis",
      systemText: "Return JSON.",
      inputText: "bounded input",
      signal: new AbortController().signal
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      expect.any(Object)
    );
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
      // The calibrated estimator charges ~1 token per 4 ASCII characters.
      inputText: "x".repeat(65_537 * 4),
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

  it("uses an explicit locked profile when environment profile admission is missing or different", async () => {
    const requests: Array<Record<string, unknown>> = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ answerText: "A complete answer.", refusal: null });
    });
    const provider = createReportV4MimoQuestionAnswerProvider({
      environment: providerEnvironment({ OGC_REPORT_V4_MODEL_PROFILE_ID: "different-current-profile" }),
      lockedModelProfile: structuredClone(profilePayload),
      fetch,
      now: timeline()
    });

    await expect(provider.answerWithSources(questionInput())).resolves.toMatchObject({
      questionId: "question-local-1",
      answerText: "A complete answer."
    });
    expect(requests[0]).toMatchObject({
      model: "mimo-v2.5-pro",
      max_completion_tokens: profilePayload.operations.questionAnswer.maxOutputTokens
    });

    const missingEnvironmentProvider = createReportV4MimoQuestionAnswerProvider({
      environment: providerEnvironment(),
      lockedRuntime: resolveReportV4LockedModelRuntime(profilePayload),
      fetch,
      now: timeline()
    });
    await expect(missingEnvironmentProvider.answerWithSources(questionInput())).resolves.toMatchObject({
      answerText: "A complete answer."
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["provider", (profile: Record<string, unknown>) => { profile.provider = "other-provider"; }],
    ["adapter", (profile: Record<string, unknown>) => { profile.adapterId = "other-adapter"; }],
    ["tokenizer", (profile: Record<string, unknown>) => {
      modelOperation(profile, "questionAnswer").tokenizer = "other-tokenizer";
    }],
    ["capability", (profile: Record<string, unknown>) => {
      modelOperation(profile, "questionAnswer").nativeWebSearch = false;
    }],
    ["limit", (profile: Record<string, unknown>) => {
      modelOperation(profile, "sourceDiagnosis").maxOutputTokens = 1;
    }]
  ])("rejects locked %s drift before fetch", (_label, mutate) => {
    const fetch = vi.fn(async () => response({ ok: true }));
    const candidate = structuredClone(profilePayload) as Record<string, unknown>;
    mutate(candidate);

    expect(() => createReportV4MimoQuestionAnswerProvider({
      environment: providerEnvironment(),
      lockedModelProfile: candidate,
      fetch
    })).toThrow(/locked|approved|profile|capability|drift/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a reconstructed locked runtime before fetch even when its nested profile looks approved", () => {
    const fetch = vi.fn(async () => response({ ok: true }));
    const approved = resolveReportV4LockedModelRuntime(profilePayload);
    const reconstructed = { ...approved };

    expect(() => createReportV4MimoQuestionAnswerProvider({
      environment: providerEnvironment(),
      lockedRuntime: reconstructed,
      fetch
    })).toThrow(/locked|approved|runtime|drift/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("builds the question budget from the exact request text and margin used by fetch", async () => {
    const runtime = resolveReportV4LockedModelRuntime(profilePayload);
    const bodies: Array<Record<string, unknown>> = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ answerText: "A complete answer.", refusal: null });
    });
    const input = questionInput();
    const first = buildReportV4MimoQuestionTokenBudget({ runtime, input });
    const second = buildReportV4MimoQuestionTokenBudget({ runtime, input });

    await createReportV4MimoQuestionAnswerProvider({
      environment: providerEnvironment(), lockedRuntime: runtime, fetch, now: timeline()
    }).answerWithSources(input);

    const messages = bodies[0]!.messages as Array<{ role: string; content: string }>;
    const expected = buildModelOperationTokenBudget({
      profile: runtime.modelProfile,
      operation: "questionAnswer",
      estimate: {
        systemText: messages[0]!.content,
        inputText: messages[1]!.content,
        reservedOutputTokens: runtime.modelProfile.operations.questionAnswer.maxOutputTokens,
        providerSafetyMarginTokens: 4_096
      },
      estimators: runtime.tokenEstimators
    });
    expect(first).toEqual(expected);
    expect(second).toEqual(first);
    expect(evaluateModelTokenBudget(first)).toEqual(evaluateModelTokenBudget(expected));
    expect(JSON.parse(messages[1]!.content)).toEqual({
      question: input.question,
      locale: input.locale,
      region: input.region
    });
  });

  it.each(["diagnose", "retry", "correct"] as const)(
    "builds the %s diagnosis budget from the exact request text and margin used by fetch",
    async (kind) => {
      const runtime = resolveReportV4LockedModelRuntime(profilePayload);
      let body: Record<string, unknown> | undefined;
      const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return response({ ok: true });
      });
      const request = diagnosisRequest(kind);
      const budget = buildReportV4MimoDiagnosisTokenBudget({ runtime, request });

      await createReportV4MimoDiagnosisProvider({
        environment: providerEnvironment(), lockedRuntime: runtime, fetch
      }).generate(request);

      const messages = body!.messages as Array<{ role: string; content: string }>;
      const expected = buildModelOperationTokenBudget({
        profile: runtime.modelProfile,
        operation: "sourceDiagnosis",
        estimate: {
          systemText: messages[0]!.content,
          inputText: messages[1]!.content,
          reservedOutputTokens: runtime.modelProfile.operations.sourceDiagnosis.maxOutputTokens,
          providerSafetyMarginTokens: 4_096
        },
        estimators: runtime.tokenEstimators
      });
      expect(budget).toEqual(expected);
      expect(buildReportV4MimoDiagnosisTokenBudget({ runtime, request })).toEqual(budget);
      expect(messages[0]!.content).toContain(kind === "correct" ? "Correct only" : `${kind} request`);
      expect(JSON.parse(messages[1]!.content)).toMatchObject({ kind });
      expect(body!.tools).toBeUndefined();
    }
  );

  it.each([
    [401, "authentication", false],
    [403, "authentication", false],
    [408, "temporary_provider", true],
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

  it("types structured payload parse failures as mimo_invalid_response without leaking bodies", async () => {
    const secretBody = "raw-provider-secret-body";
    const invoker = createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => new Response(secretBody, { status: 200 }))
    });
    await expect(invoker.invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      name: "ReportV4MimoProviderError",
      code: MIMO_INVALID_RESPONSE_CODE,
      retryable: true,
      message: "The MiMo provider returned an invalid response."
    });

    await expect(createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => new Response(JSON.stringify({ id: "r1", choices: [] }), { status: 200 }))
    }).invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: MIMO_INVALID_RESPONSE_CODE,
      message: "The MiMo provider response is missing choices."
    });

    await expect(createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => new Response(JSON.stringify({
        id: "r1",
        choices: [{ message: { content: null } }]
      }), { status: 200 }))
    }).invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: MIMO_INVALID_RESPONSE_CODE,
      message: "The MiMo provider response is missing content."
    });

    await expect(createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => new Response(JSON.stringify({
        id: "r1",
        choices: [{ message: { content: "not-json{" } }]
      }), { status: 200 }))
    }).invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      code: MIMO_INVALID_RESPONSE_CODE,
      message: "The MiMo provider response content is not valid JSON."
    });

    try {
      await invoker.invoke({
        operation: "websiteSynthesis",
        systemText: "Return JSON.",
        inputText: "input",
        signal: new AbortController().signal
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ReportV4MimoProviderError);
      expect(String(error)).not.toContain(secretBody);
    }
  });

  it("parses string content and supported text content parts for structured responses", async () => {
    const stringInvoker = createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => response({ ok: true, field: "string" }))
    });
    await expect(stringInvoker.invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).resolves.toEqual({ ok: true, field: "string" });

    const partsInvoker = createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => new Response(JSON.stringify({
        id: "response-parts",
        choices: [{
          message: {
            content: [
              { type: "text", text: '{"ok":' },
              { type: "text", text: "true}" }
            ]
          }
        }]
      }), { status: 200 }))
    });
    await expect(partsInvoker.invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).resolves.toEqual({ ok: true });
  });

  it.each([
    "websiteSynthesis",
    "questionAnswer",
    "sourceDiagnosis"
  ] as const)("applies the same strict content contract for shared %s parsing", async (operation) => {
    const secret = "raw-provider-secret-body-must-not-leak";
    const signal = new AbortController().signal;
    const location = operation === "questionAnswer" ? { country: "CN", region: "CN" } : undefined;
    const invokeStructured = async (body: unknown) => {
      const invoker = createReportV4MimoStructuredInvoker({
        environment: environment(),
        fetch: vi.fn(async () => new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }))
      });
      return invoker.invoke({
        operation,
        systemText: "Return JSON.",
        inputText: "input",
        signal,
        ...(location ? { webSearchLocation: location } : {})
      });
    };

    await expect(invokeStructured({
      id: "ok-string",
      choices: [{ message: { content: JSON.stringify({ ok: true, via: "string" }) } }]
    })).resolves.toEqual({ ok: true, via: "string" });

    await expect(invokeStructured({
      id: "ok-parts",
      choices: [{
        message: {
          content: [
            { type: "text", text: '{"ok":' },
            { text: 'true,"via":"parts"}', type: "text" }
          ]
        }
      }]
    })).resolves.toEqual({ ok: true, via: "parts" });

    const rejectCases: Array<{ label: string; body: unknown; message: string | RegExp }> = [
      {
        label: "bare string part",
        body: { id: "x", choices: [{ message: { content: ['{"ok":true}'] } }] },
        message: "unsupported_content_shape"
      },
      {
        label: "text without type",
        body: { id: "x", choices: [{ message: { content: [{ text: '{"ok":true}' }] } }] },
        message: "unsupported_content_shape"
      },
      {
        label: "content field object",
        body: { id: "x", choices: [{ message: { content: [{ type: "text", content: '{"ok":true}' }] } }] },
        message: "unsupported_content_shape"
      },
      {
        label: "extra tool_calls field",
        body: {
          id: "x",
          choices: [{
            message: {
              content: [{ type: "text", text: '{"ok":true}', tool_calls: [{ id: "c1" }] }]
            }
          }]
        },
        message: "unsupported_content_shape"
      },
      {
        label: "unknown extra field",
        body: {
          id: "x",
          choices: [{
            message: {
              content: [{ type: "text", text: '{"ok":true}', meta: "x" }]
            }
          }]
        },
        message: "unsupported_content_shape"
      },
      {
        label: "tool_call part",
        body: {
          id: "x",
          choices: [{ message: { content: [{ type: "tool_call", text: '{"ok":true}' }, { type: "text", text: '{"ok":true}' }] } }]
        },
        message: "unsupported_content_shape"
      },
      {
        label: "unknown type",
        body: { id: "x", choices: [{ message: { content: [{ type: "image", text: '{"ok":true}' }] } }] },
        message: "unsupported_content_shape"
      },
      {
        label: "empty text",
        body: { id: "x", choices: [{ message: { content: [{ type: "text", text: "" }] } }] },
        message: "unsupported_content_shape"
      },
      {
        label: "mixed legal and illegal",
        body: {
          id: "x",
          choices: [{
            message: {
              content: [
                { type: "text", text: '{"ok":' },
                { type: "tool_result", text: "true}" }
              ]
            }
          }]
        },
        message: "unsupported_content_shape"
      },
      {
        label: "empty array",
        body: { id: "x", choices: [{ message: { content: [] } }] },
        message: "unsupported_content_shape"
      },
      {
        label: "parts over limit",
        body: {
          id: "x",
          choices: [{
            message: {
              content: Array.from({ length: MAX_STRUCTURED_CONTENT_PARTS + 1 }, () => ({ type: "text", text: "a" }))
            }
          }]
        },
        message: "content_parts_limit_exceeded"
      },
      {
        label: "chars over limit",
        body: {
          id: "x",
          choices: [{
            message: {
              content: [
                { type: "text", text: "a".repeat(MAX_STRUCTURED_CONTENT_CHARS) },
                { type: "text", text: "b" }
              ]
            }
          }]
        },
        message: "content_length_limit_exceeded"
      }
    ];

    for (const sample of rejectCases) {
      try {
        await invokeStructured(sample.body);
        throw new Error(`expected rejection for ${sample.label}`);
      } catch (error) {
        expect(error, sample.label).toBeInstanceOf(ReportV4MimoProviderError);
        expect(error).toMatchObject({
          code: MIMO_INVALID_RESPONSE_CODE,
          retryable: true
        });
        expect(String((error as Error).message)).toMatch(sample.message);
        expect(JSON.stringify(error)).not.toContain(secret);
        expect(String(error)).not.toContain(secret);
      }
    }

    if (operation === "questionAnswer") {
      const questionProvider = createReportV4MimoQuestionAnswerProvider({
        environment: environment(),
        fetch: vi.fn(async () => new Response(JSON.stringify({
          id: "q-reject",
          choices: [{ message: { content: [{ type: "tool_call", text: secret }] }, annotations: [] }]
        }), { status: 200 }))
      });
      await expect(questionProvider.answerWithSources(questionInput())).rejects.toMatchObject({
        name: "ReportV4QuestionProviderError",
        code: "temporary_provider",
        retryable: true
      });
      try {
        await questionProvider.answerWithSources(questionInput());
      } catch (error) {
        expect(String(error)).not.toContain(secret);
      }
    }

    if (operation === "sourceDiagnosis") {
      const diagnosisProvider = createReportV4MimoDiagnosisProvider({
        environment: environment(),
        fetch: vi.fn(async () => new Response(JSON.stringify({
          id: "d-reject",
          choices: [{ message: { content: [{ type: "image", text: secret }] } }]
        }), { status: 200 }))
      });
      await expect(diagnosisProvider.generate(diagnosisRequest("diagnose"))).rejects.toMatchObject({
        name: "ReportV4DiagnosisProviderError",
        code: "temporary_provider",
        retryable: true
      });
      try {
        await diagnosisProvider.generate(diagnosisRequest("diagnose"));
      } catch (error) {
        expect(String(error)).not.toContain(secret);
      }
    }
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

  it("maps an invalid structured question result to one retryable outer contract failure", async () => {
    const provider = createReportV4MimoQuestionAnswerProvider({
      environment: environment(),
      fetch: vi.fn(async () => response({ answerText: { invalid: true }, refusal: null }))
    });

    await expect(provider.answerWithSources(questionInput())).rejects.toMatchObject({
      name: "ReportV4QuestionProviderError",
      code: "contract",
      retryable: true
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
    expect(systemText).toContain("answerText must be non-empty and refusal must be null unless an explicit typed");
    expect(systemText).toContain("Only for such a typed refusal may answerText be empty");
    expect(systemText).toContain("do not substitute research methodology, generic market background, or no-answer wording");
    expect(systemText.length).toBeLessThanOrEqual(5_000);
  });

  it.each([
    {
      intent: "provider discovery",
      question: "Which providers publicly offer enterprise geocoding APIs in China?",
      expectedBoundary: "name concrete providers and state the publicly offered service relevant to the question"
    },
    {
      intent: "solution fit",
      question: "Which geocoding solution fits an offline delivery scenario, and under what conditions?",
      expectedBoundary: "map each solution to its suitable scenario, delivery conditions, and limitations"
    },
    {
      intent: "purchase verification",
      question: "What should a buyer verify before purchasing an enterprise geocoding service?",
      expectedBoundary: "a practical checklist covering service scope, conditions, limitations, and risks"
    }
  ])("gives the $intent question its explicit direct-answer boundary", async ({ question, expectedBoundary }) => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ answerText: "A direct answer.", refusal: null });
    });
    const provider = createReportV4MimoQuestionAnswerProvider({ environment: environment(), fetch });

    await provider.answerWithSources({ ...questionInput(), question });

    expect(fetch).toHaveBeenCalledTimes(1);
    const messages = bodies[0]!.messages as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain("Lead answerText with a direct, useful answer");
    expect(messages[0]!.content).toContain(expectedBoundary);
    expect(JSON.parse(messages[1]!.content)).toEqual({
      question,
      locale: "en-US",
      region: "CN"
    });
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

  it("builds deferred diagnosis from semantic prose and short aliases without internal evidence IDs", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return response({ selectionSummary: "result" });
    });
    const request = semanticDiagnosisRequest("retry");

    await createReportV4MimoDiagnosisProvider({ environment: environment(), fetch }).generate(request);

    const messages = bodies[0]!.messages as Array<{ role: string; content: string }>;
    const systemText = messages[0]!.content;
    const input = JSON.parse(messages[1]!.content) as Record<string, unknown>;
    expect(systemText).toContain("exactly four semantic fields");
    expect(systemText).toContain('"evidenceKeys": string[]');
    expect(systemText).toContain("Code owns final hierarchy");
    expect(systemText).toContain("Do not return priorities, detailedEvidenceRefs, canonical IDs");
    expect(input).toMatchObject({
      kind: "retry",
      mode: "semantic",
      failureReason: "invalid_semantic_output at $diagnosisSemanticOutput.targetGap"
    });
    expect(JSON.stringify(input)).toContain('"evidenceKey":"S1"');
    expect(JSON.stringify(input)).toContain('"evidenceKey":"T1"');
    for (const internal of ["question-1", "source-1", "target-location-1", "target-page-1"]) {
      expect(JSON.stringify(input)).not.toContain(internal);
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

  it("classifies finish_reason length and content_filter without leaking bodies", async () => {
    const secret = "raw-provider-secret-must-not-leak";
    await expect(createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => new Response(JSON.stringify({
        id: "len",
        choices: [{ finish_reason: "length", message: { content: JSON.stringify({ secret }) } }]
      }), { status: 200 }))
    }).invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      name: "ReportV4MimoProviderError",
      code: MIMO_OUTPUT_TRUNCATED_CODE,
      retryable: true,
      message: "mimo_output_truncated"
    });

    try {
      await createReportV4MimoStructuredInvoker({
        environment: environment(),
        fetch: vi.fn(async () => new Response(JSON.stringify({
          id: "filter",
          choices: [{ finish_reason: "content_filter", message: { content: secret } }]
        }), { status: 200 }))
      }).invoke({
        operation: "websiteSynthesis",
        systemText: "Return JSON.",
        inputText: "input",
        signal: new AbortController().signal
      });
      throw new Error("expected content_filter rejection");
    } catch (error) {
      expect(error).toMatchObject({ code: MIMO_CONTENT_FILTERED_CODE, retryable: false, message: "mimo_content_filtered" });
      expect(String(error)).not.toContain(secret);
    }
  });

  it("classifies transport timeout and load fixture envelopes", async () => {
    const timeout = Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
    await expect(createReportV4MimoStructuredInvoker({
      environment: environment(),
      fetch: vi.fn(async () => { throw timeout; })
    }).invoke({
      operation: "websiteSynthesis",
      systemText: "Return JSON.",
      inputText: "input",
      signal: new AbortController().signal
    })).rejects.toMatchObject({ code: MIMO_TIMEOUT_CODE, retryable: true });

    for (const [name, code] of [
      ["missing-choices.json", MIMO_INVALID_RESPONSE_CODE],
      ["finish-length.json", MIMO_OUTPUT_TRUNCATED_CODE],
      ["finish-content-filter.json", MIMO_CONTENT_FILTERED_CODE],
      ["truncated-json.json", MIMO_INVALID_RESPONSE_CODE]
    ] as const) {
      const fixture = JSON.parse(readFileSync(
        fileURLToPath(new URL(`./__fixtures__/mimo-provider-errors/${name}`, import.meta.url)),
        "utf8"
      ));
      await expect(createReportV4MimoStructuredInvoker({
        environment: environment(),
        fetch: vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }))
      }).invoke({
        operation: "websiteSynthesis",
        systemText: "Return JSON.",
        inputText: "input",
        signal: new AbortController().signal
      })).rejects.toMatchObject({ name: "ReportV4MimoProviderError", code });
    }
  });

  it("rejects structurally invalid envelopes for 1000 fixed seeds (property/fuzz)", async () => {
    const seed = 0x96f41a01;
    const random = mulberry32(seed);
    let failures = 0;
    for (let i = 0; i < 1000; i += 1) {
      const envelope = randomInvalidEnvelope(random, i);
      try {
        await createReportV4MimoStructuredInvoker({
          environment: environment(),
          fetch: vi.fn(async () => new Response(JSON.stringify(envelope), { status: 200 }))
        }).invoke({
          operation: "websiteSynthesis",
          systemText: "Return JSON.",
          inputText: "input",
          signal: new AbortController().signal
        });
        throw new Error(`seed=${seed} index=${i} unexpectedly accepted envelope`);
      } catch (error) {
        if (!(error instanceof ReportV4MimoProviderError)) {
          throw new Error(`seed=${seed} index=${i} wrong error type: ${String(error)}`);
        }
        if (![
          MIMO_INVALID_RESPONSE_CODE,
          MIMO_OUTPUT_TRUNCATED_CODE,
          MIMO_CONTENT_FILTERED_CODE
        ].includes(error.code as typeof MIMO_INVALID_RESPONSE_CODE)) {
          throw new Error(`seed=${seed} index=${i} unexpected code=${error.code}`);
        }
        failures += 1;
      }
    }
    expect(failures).toBe(1000);
  });
});

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInvalidEnvelope(random: () => number, index: number): unknown {
  const kind = index % 10;
  if (kind === 0) return { id: "fuzz", choices: [] };
  if (kind === 1) return { id: "fuzz", choices: [{ message: { content: null } }] };
  if (kind === 2) return { id: "fuzz", choices: [{ finish_reason: "length", message: { content: "{\"a\":1}" } }] };
  if (kind === 3) return { id: "fuzz", choices: [{ finish_reason: "content_filter", message: { content: "{\"a\":1}" } }] };
  if (kind === 4) return { id: "fuzz", choices: [{ finish_reason: "stop", message: { content: "{not-json" } }] };
  if (kind === 5) return { id: "fuzz", choices: [{ finish_reason: "tool_calls", message: { content: "{\"a\":1}" } }] };
  if (kind === 6) return { id: "fuzz", choices: [{ message: { content: [{ type: "text", text: "{\"a\":1}", extra: random() }] } }] };
  if (kind === 7) return { id: "fuzz", choices: [{ message: { content: ["{\"a\":1}"] } }] };
  if (kind === 8) return { id: "fuzz", choices: [{ message: { content: [] } }] };
  return { id: "fuzz", choices: [{ message: {} }] };
}

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OGC_PROVIDER_PROFILE: "mimo_native",
    OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "v4-secret"
  };
}

function tokenPlanEnvironment(): NodeJS.ProcessEnv {
  return {
    ...environment(),
    OGC_REPORT_V4_MIMO_BASE_URL: "https://token-plan-sgp.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "tp-v4-secret"
  };
}

function providerEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    OGC_PROVIDER_PROFILE: "mimo_native",
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "v4-secret",
    ...overrides
  };
}

function modelOperation(profile: Record<string, unknown>, name: string): Record<string, unknown> {
  return (profile.operations as Record<string, Record<string, unknown>>)[name]!;
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

function semanticDiagnosisRequest(kind: "diagnose" | "retry"): ReportV4DiagnosisProviderRequest {
  return {
    kind,
    mode: "semantic",
    failureReason: kind === "retry"
      ? "invalid_semantic_output at $diagnosisSemanticOutput.targetGap"
      : undefined,
    input: {
      question: "Which provider?",
      answer: "Provider one.",
      locale: "en-US",
      evidence: [
        {
          evidenceKey: "S1",
          role: "answer_source",
          label: "Published service page",
          text: "Provider one publishes the requested service.",
          retrievalStatus: "available"
        },
        {
          evidenceKey: "T1",
          role: "target_page",
          label: "The target page is relevant.",
          text: "The target page omits operating conditions."
        }
      ]
    },
    signal: new AbortController().signal
  };
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

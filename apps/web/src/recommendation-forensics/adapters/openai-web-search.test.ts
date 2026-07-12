import type {
  AnswerEngineAdapter,
  ObserveAnswerInput
} from "@open-geo-console/answer-engine-observer";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyOpenAIWebSearchError,
  createOpenAIWebSearchAdapter,
  OpenAIWebSearchAdapterError
} from "./openai-web-search";

const SECRET = "sk-test-do-not-persist";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("OpenAI Responses web-search adapter", () => {
  it("parses the official source-bearing response shape and preserves citation order across text parts", async () => {
    const transport = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      void _url;
      void _init;
      return jsonResponse(officialResponse({
        id: "resp_01OfficialRequestId",
        output: [
          completedSearchCall(),
          {
            id: "msg_1",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: "Atlas and Beacon are established options.",
                annotations: [
                  citation("https://atlas.example/review", "Atlas review", 0, 5),
                  citation("https://beacon.example/guide", "Beacon guide", 10, 16)
                ]
              },
              {
                type: "output_text",
                text: "Atlas has the stronger regional coverage.",
                annotations: [
                  citation("https://atlas.example/review", "Repeated Atlas title", 0, 5),
                  citation("https://third.example/analysis", "Third analysis", 20, 28)
                ]
              }
            ]
          }
        ]
      }));
    });
    const now = vi.fn().mockReturnValueOnce(10_000).mockReturnValueOnce(10_123);
    const adapter = configuredAdapter({ fetch: transport, now });
    const controller = new AbortController();

    const cell = await adapter.observe(observation(adapter, controller.signal));

    expect(cell).toMatchObject({
      status: "succeeded",
      providerRequestId: "resp_01OfficialRequestId",
      answerText: "Atlas and Beacon are established options.\nAtlas has the stronger regional coverage.",
      executedAt: "2027-01-15T08:00:00.000Z",
      executionDurationMs: 123,
      usage: { inputTokens: 120, outputTokens: 42 },
      surface: {
        providerId: "openai",
        productId: "responses-web-search",
        modelId: "gpt-5.4-2026-03-05",
        collectionSurface: "developer_api",
        locale: "en-US",
        region: "US",
        certificationState: "candidate_uncertified"
      }
    });
    if (cell.status !== "succeeded") throw new Error("expected success");
    expect(cell.responseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(cell.sources).toEqual([
      {
        url: "https://atlas.example/review",
        title: "Atlas review",
        providerOrder: 0,
        providerMetadata: { sourceType: "url_citation" }
      },
      {
        url: "https://beacon.example/guide",
        title: "Beacon guide",
        providerOrder: 1,
        providerMetadata: { sourceType: "url_citation" }
      },
      {
        url: "https://third.example/analysis",
        title: "Third analysis",
        providerOrder: 2,
        providerMetadata: { sourceType: "url_citation" }
      }
    ]);

    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(init?.signal).toBe(controller.signal);
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET}`
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gpt-5.4-2026-03-05",
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      store: false,
      instructions: "Answer in en-US. Use web search and support the answer with URL citations.",
      input: "Which supplier is best for this requirement?"
    });
  });

  it("fails closed before network access when the dedicated API key is missing", async () => {
    vi.stubEnv("OGC_ANSWER_OPENAI_API_KEY", "");
    const transport = vi.fn();
    const adapter = configuredAdapter({ apiKey: undefined, fetch: transport });

    await expect(adapter.observe(observation(adapter))).rejects.toMatchObject({
      errorClass: "authentication"
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("classifies an aborted transport as timeout and passes the caller signal through", async () => {
    const controller = new AbortController();
    const transport = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal);
      throw new DOMException("fixture abort", "AbortError");
    });
    const adapter = configuredAdapter({ fetch: transport });

    const promise = adapter.observe(observation(adapter, controller.signal));
    controller.abort();
    await expect(promise).rejects.toMatchObject({ errorClass: "timeout" });
    expect(classifyOpenAIWebSearchError(new DOMException("abort", "AbortError"))).toBe("timeout");
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [408, "timeout"],
    [429, "rate-limit"],
    [400, "unsupported"],
    [422, "unsupported"],
    [500, "provider-unavailable"],
    [503, "provider-unavailable"]
  ] as const)("classifies HTTP %i without exposing provider error bodies", async (status, errorClass) => {
    const transport = vi.fn(async () => new Response(`Authorization: Bearer ${SECRET}`, { status }));
    const adapter = configuredAdapter({ fetch: transport });

    const error = await adapter.observe(observation(adapter)).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ errorClass });
    expect(String(error)).not.toContain(SECRET);
    expect(classifyOpenAIWebSearchError(error)).toBe(errorClass);
  });

  it("rejects malformed JSON as invalid-response", async () => {
    const adapter = configuredAdapter({
      fetch: vi.fn(async () => new Response("not json", { status: 200 }))
    });

    await expect(adapter.observe(observation(adapter))).rejects.toMatchObject({
      errorClass: "invalid-response"
    });
  });

  it("rejects responses without provider-returned URL citations", async () => {
    const payload = officialResponse({
      output: [
        completedSearchCall(),
        completedMessage("No cited source was returned.", [])
      ]
    });
    const adapter = configuredAdapter({ fetch: vi.fn(async () => jsonResponse(payload)) });

    await expect(adapter.observe(observation(adapter))).rejects.toMatchObject({
      errorClass: "invalid-response"
    });
  });

  it("rejects cited text when the response lacks a completed web-search call", async () => {
    const payload = officialResponse({
      output: [
        completedMessage("A cited answer.", [
          citation("https://source.example/evidence", "Evidence", 2, 7)
        ])
      ]
    });
    const adapter = configuredAdapter({ fetch: vi.fn(async () => jsonResponse(payload)) });

    await expect(adapter.observe(observation(adapter))).rejects.toMatchObject({
      errorClass: "invalid-response"
    });
  });

  it("rejects a response whose provider model does not match the certified surface", async () => {
    const payload = officialResponse({ model: "gpt-5.4-floating-alias-result" });
    const adapter = configuredAdapter({ fetch: vi.fn(async () => jsonResponse(payload)) });

    await expect(adapter.observe(observation(adapter))).rejects.toMatchObject({
      errorClass: "invalid-response"
    });
  });

  it("rejects malformed citation annotations", async () => {
    const payload = officialResponse({
      output: [
        completedSearchCall(),
        completedMessage("A cited answer.", [{
          type: "url_citation",
          start_index: 8,
          end_index: 2,
          url: "javascript:alert(1)",
          title: "Bad source"
        }])
      ]
    });
    const adapter = configuredAdapter({ fetch: vi.fn(async () => jsonResponse(payload)) });

    await expect(adapter.observe(observation(adapter))).rejects.toMatchObject({
      errorClass: "invalid-response"
    });
  });

  it("filters unsafe provider request IDs and persists only safe usage metadata", async () => {
    const payload = officialResponse({
      id: `Authorization: Bearer ${SECRET}`,
      usage: {
        input_tokens: 12,
        output_tokens: 4,
        total_tokens: 16,
        api_key: SECRET,
        estimated_cost: 999
      }
    });
    const adapter = configuredAdapter({ fetch: vi.fn(async () => jsonResponse(payload)) });

    const cell = await adapter.observe(observation(adapter));

    expect(cell.providerRequestId).toBeUndefined();
    expect(cell.usage).toEqual({ inputTokens: 12, outputTokens: 4 });
    expect(JSON.stringify(cell)).not.toContain(SECRET);
    expect(JSON.stringify(adapter)).not.toContain(SECRET);
  });

  it("requires a dedicated model configuration and never labels the API as a consumer app", () => {
    vi.stubEnv("OGC_ANSWER_OPENAI_MODEL", "");
    expect(() => createOpenAIWebSearchAdapter({
      locale: "en-US",
      region: "US",
      apiKey: SECRET
    })).toThrowError(OpenAIWebSearchAdapterError);

    const adapter = configuredAdapter();
    expect(adapter.surface.consumerApplicationLabel).toBeUndefined();
    expect(adapter.surface.collectionSurface).toBe("developer_api");
  });
});

function configuredAdapter(overrides: Partial<Parameters<typeof createOpenAIWebSearchAdapter>[0]> = {}) {
  return createOpenAIWebSearchAdapter({
    locale: "en-US",
    region: "US",
    apiKey: SECRET,
    model: "gpt-5.4-2026-03-05",
    fetch: vi.fn(async () => jsonResponse(officialResponse())),
    now: () => 10_000,
    ...overrides
  });
}

function observation(adapter: AnswerEngineAdapter, signal = new AbortController().signal): ObserveAnswerInput {
  return {
    run: {
      id: "run-openai-1",
      reportId: "report-1",
      jobId: "job-1",
      locale: "en-US",
      region: "US",
      questionSetVersion: "purchase-v1",
      startedAt: "2027-01-15T07:59:00.000Z"
    },
    question: {
      id: "question-1",
      locale: "en-US",
      category: "supplier_selection",
      exactText: "Which supplier is best for this requirement?",
      inferenceBasis: ["Customer requirement"]
    },
    surface: adapter.surface,
    signal
  };
}

function officialResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "resp_01OfficialFixture",
    object: "response",
    created_at: 1_800_000_000,
    status: "completed",
    model: "gpt-5.4-2026-03-05",
    output: [
      completedSearchCall(),
      completedMessage("Atlas is a cited option.", [
        citation("https://source.example/atlas", "Atlas evidence", 0, 5)
      ])
    ],
    usage: { input_tokens: 120, output_tokens: 42, total_tokens: 162 },
    ...overrides
  };
}

function completedSearchCall() {
  return {
    type: "web_search_call",
    id: "ws_01OfficialFixture",
    status: "completed",
    action: { type: "search", query: "supplier recommendation" }
  };
}

function completedMessage(text: string, annotations: unknown[]) {
  return {
    id: "msg_01OfficialFixture",
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text, annotations }]
  };
}

function citation(url: string, title: string, startIndex: number, endIndex: number) {
  return {
    type: "url_citation",
    start_index: startIndex,
    end_index: endIndex,
    url,
    title
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

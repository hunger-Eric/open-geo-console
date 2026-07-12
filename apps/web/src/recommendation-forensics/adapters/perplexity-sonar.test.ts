import type { ObserveAnswerInput } from "@open-geo-console/answer-engine-observer";
import {
  createPerplexitySonarAdapter,
  PerplexitySonarAdapterError
} from "./perplexity-sonar";

const API_KEY = "pplx-test-key-do-not-log";

function input(signal = new AbortController().signal): ObserveAnswerInput {
  return {
    run: {
      id: "run-1",
      reportId: "report-1",
      jobId: "job-1",
      locale: "en",
      region: "global",
      questionSetVersion: "purchase-v1",
      startedAt: "2030-01-01T00:00:00.000Z"
    },
    question: {
      id: "question-1",
      locale: "en",
      category: "supplier_selection",
      exactText: "Which freight forwarders are suitable for European exporters?",
      inferenceBasis: ["Public service evidence"]
    },
    surface: {
      providerId: "perplexity",
      productId: "sonar-api",
      modelId: "sonar-pro",
      collectionSurface: "developer_api",
      locale: "en",
      region: "global",
      certificationState: "candidate_uncertified"
    },
    signal
  };
}

function adapter(fetchImpl: typeof fetch) {
  return createPerplexitySonarAdapter({
    environment: {
      OGC_ANSWER_PERPLEXITY_API_KEY: API_KEY,
      OGC_ANSWER_PERPLEXITY_MODEL: "sonar-pro"
    },
    locale: "en",
    region: "global",
    fetchImpl,
    now: () => Date.parse("2030-01-01T00:00:01.250Z")
  });
}

function officialResponseFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    model: "sonar-pro",
    created: 1_893_456_001,
    object: "chat.completion",
    choices: [{
      index: 0,
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "Atlas and Beacon are suitable candidates.[1][2]"
      }
    }],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 315,
      total_tokens: 327,
      cost: { total_cost: 0.006257, request_cost: 0.006 }
    },
    citations: [
      "https://beacon.example/review#summary",
      "https://atlas.example/review",
      "https://beacon.example/review"
    ],
    search_results: [
      {
        title: "Atlas review",
        url: "https://atlas.example/review/",
        date: "2029-12-30",
        last_updated: "2029-12-31",
        snippet: "Ignored because snapshot metadata is intentionally narrow.",
        source: "web"
      },
      {
        title: "Beacon review",
        url: "https://beacon.example/review",
        date: "2029-12-29",
        source: "web"
      }
    ],
    ...overrides
  };
}

describe("Perplexity Sonar answer-engine adapter", () => {
  it("uses the canonical Sonar API and maps official citations to stable source-bearing cells", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(officialResponseFixture()));
    const observeInput = input();
    const observed = await adapter(fetchImpl).observe(observeInput);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.perplexity.ai/v1/sonar");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json"
      },
      signal: observeInput.signal
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "sonar-pro",
      messages: [{
        role: "user",
        content: "Which freight forwarders are suitable for European exporters?"
      }],
      language_preference: "en",
      search_language_filter: ["en"],
      stream: false
    });
    expect(observed).toMatchObject({
      runId: "run-1",
      questionId: "question-1",
      status: "succeeded",
      answerText: "Atlas and Beacon are suitable candidates.[1][2]",
      recommendationOutcome: "recommendations_present",
      executedAt: "2030-01-01T00:00:01.250Z",
      providerRequestId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      usage: { inputTokens: 12, outputTokens: 315, estimatedCostMicros: 6_257 },
      sources: [
        {
          url: "https://beacon.example/review#summary",
          title: "Beacon review",
          providerOrder: 0,
          providerMetadata: {
            publishedAt: "2029-12-29T00:00:00.000Z",
            sourceType: "web"
          }
        },
        {
          url: "https://atlas.example/review",
          title: "Atlas review",
          providerOrder: 1,
          providerMetadata: {
            publishedAt: "2029-12-30T00:00:00.000Z",
            lastUpdatedAt: "2029-12-31T00:00:00.000Z",
            sourceType: "web"
          }
        }
      ]
    });
    expect(observed.surface).toEqual({
      providerId: "perplexity",
      productId: "sonar-api",
      modelId: "sonar-pro",
      collectionSurface: "developer_api",
      locale: "en",
      region: "global",
      certificationState: "candidate_uncertified"
    });
  });

  it("uses a deterministic hostname title when a citation has no matching search result", async () => {
    const response = officialResponseFixture({
      citations: ["https://unpaired.example/evidence"],
      search_results: [{ title: "Other", url: "https://other.example/evidence" }]
    });
    const observed = await adapter(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).observe(input());
    expect(observed.status).toBe("succeeded");
    if (observed.status === "succeeded") {
      expect(observed.sources).toEqual([{
        url: "https://unpaired.example/evidence",
        title: "unpaired.example",
        providerOrder: 0,
        providerMetadata: {}
      }]);
    }
  });

  it.each([
    ["I cannot provide a specific recommendation from these sources.", "no_recommendation"],
    ["根据这些来源，没有明确推荐。", "no_recommendation"],
    ["Atlas is the preferred supplier.", "recommendations_present"],
    ["Atlas 是首选供应商。", "recommendations_present"]
  ] as const)("classifies explicit recommendation semantics: %s", async (content, outcome) => {
    const response = officialResponseFixture({
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }]
    });
    const observed = await adapter(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response))).observe(input());
    expect(observed).toMatchObject({ status: "succeeded", recommendationOutcome: outcome });
  });

  it("rejects a source-bearing but semantically ambiguous answer", async () => {
    const response = officialResponseFixture({
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Atlas appears in the sources." } }]
    });
    const instance = adapter(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
    await expect(instance.observe(input())).rejects.toMatchObject({ errorClass: "invalid-response" });
  });

  it.each([
    [undefined, "missing citations"],
    [null, "null citations"],
    [[], "empty citations"]
  ])("rejects a source-free response with invalid-response (%s)", async (citations) => {
    const response = officialResponseFixture({ citations });
    const instance = adapter(vi.fn<typeof fetch>().mockResolvedValue(Response.json(response)));
    const error = await instance.observe(input()).catch((caught) => caught);
    expect(error).toBeInstanceOf(PerplexitySonarAdapterError);
    expect(instance.classifyError?.(error)).toBe("invalid-response");
  });

  it("passes the caller AbortSignal through and classifies aborts as timeout", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    const instance = adapter(fetchImpl);
    const error = await instance.observe(input(controller.signal)).catch((caught) => caught);
    expect(instance.classifyError?.(error)).toBe("timeout");
  });

  it("rejects run locale, run region, and question locale drift before network", async () => {
    for (const drift of [
      (value: ObserveAnswerInput) => { value.run.locale = "zh"; },
      (value: ObserveAnswerInput) => { value.run.region = "CN"; },
      (value: ObserveAnswerInput) => { value.question.locale = "zh"; }
    ]) {
      const fetchImpl = vi.fn<typeof fetch>();
      const instance = adapter(fetchImpl);
      const value = input();
      drift(value);
      await expect(instance.observe(value)).rejects.toMatchObject({ errorClass: "unsupported" });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
    [408, "timeout"],
    [429, "rate-limit"],
    [451, "policy-blocked"],
    [500, "provider-unavailable"],
    [503, "provider-unavailable"],
    [422, "unsupported"]
  ] as const)("classifies HTTP %i without retaining provider error bodies", async (status, expected) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: `Authorization: Bearer ${API_KEY}` } }),
      { status }
    ));
    const instance = adapter(fetchImpl);
    const error = await instance.observe(input()).catch((caught) => caught);
    expect(instance.classifyError?.(error)).toBe(expected);
    expect(String(error)).not.toContain(API_KEY);
  });

  it.each([
    ["not-json", "malformed JSON"],
    [JSON.stringify(officialResponseFixture({ choices: [] })), "missing answer"],
    [JSON.stringify(officialResponseFixture({ id: `Bearer ${API_KEY}` })), "unsafe request id"]
  ])("classifies malformed or unsafe responses as invalid-response (%s)", async (body) => {
    const instance = adapter(vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 })));
    const error = await instance.observe(input()).catch((caught) => caught);
    expect(instance.classifyError?.(error)).toBe("invalid-response");
    expect(String(error)).not.toContain(API_KEY);
  });

  it.each([
    [{ OGC_ANSWER_PERPLEXITY_MODEL: "sonar-pro" }, "missing key"],
    [{ OGC_ANSWER_PERPLEXITY_API_KEY: API_KEY }, "missing model"],
    [{ OGC_ANSWER_PERPLEXITY_API_KEY: API_KEY, OGC_ANSWER_PERPLEXITY_MODEL: "consumer-app" }, "unsupported model"]
  ])("fails closed before network access for invalid explicit environment (%s)", (environment) => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(() => createPerplexitySonarAdapter({ environment, locale: "en", region: "global", fetchImpl })).toThrow(
      PerplexitySonarAdapterError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("supports only explicit en/zh locale and the global region until mapped location certification exists", () => {
    const environment = { OGC_ANSWER_PERPLEXITY_API_KEY: API_KEY, OGC_ANSWER_PERPLEXITY_MODEL: "sonar-pro" };
    expect(() => createPerplexitySonarAdapter({ environment, locale: "fr", region: "global" })).toThrow("only en or zh");
    expect(() => createPerplexitySonarAdapter({ environment, locale: "en", region: "US" })).toThrow("global region");
  });
});

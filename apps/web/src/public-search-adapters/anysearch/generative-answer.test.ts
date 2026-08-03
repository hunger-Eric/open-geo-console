import { describe, expect, it, vi } from "vitest";
import { AiClientError, type JsonCompletionClient } from "@open-geo-console/ai-report-engine";
import { createAnySearchGenerativeSearchAnswerProvider, resolveAnySearchGenerativeSearchAnswerProvider } from "./generative-answer";
import type { AnySearchPublicSearchConfig } from "./config";

const searchConfig: AnySearchPublicSearchConfig = { endpoint: "https://api.anysearch.com/v1/search", apiKey: "search-key", locale: "zh-CN", region: "CN", zone: "cn" };
const searchPayload = { code: 0, data: { results: [
  { title: "甲服务说明", url: "https://a.example/services", snippet: "甲提供国际物流服务", content: "discard this content" },
  { title: "乙服务说明", url: "https://b.example/services", snippet: "乙提供国内运输服务", content: "discard this too" }
] } };
const request = { questionId: "question-1", question: "谁提供国际物流服务？", locale: "zh-CN", region: "CN", signal: new AbortController().signal, semanticValidation: "free_direct" as const };
const client = (value: unknown): JsonCompletionClient => ({ configuredModel: "deepseek-v4-flash", completeJson: vi.fn(async () => ({ value, modelId: "deepseek-v4-flash", rawContent: JSON.stringify(value), requestId: "model-request" })) });
const search = vi.fn(async () => new Response(JSON.stringify(searchPayload), { status: 200 }));

describe("AnySearch grounded SenseNova answer provider", () => {
  it("uses one search and one synthesis call, then constructs sources locally", async () => {
    const model = client({ answerText: "甲提供国际物流服务。", refusal: null, usedSourceIndexes: [0] });
    const provider = createAnySearchGenerativeSearchAnswerProvider({ searchConfig, client: model, fetch: search, now: () => new Date("2030-01-01T00:00:00.000Z") });
    await expect(provider.answerWithSources(request)).resolves.toMatchObject({
      questionId: "question-1",
      answerText: "甲提供国际物流服务。",
      sources: [{ title: "甲服务说明", canonicalUrl: "https://a.example/services", citedText: "甲提供国际物流服务", providerResultOrder: 0 }],
      providerResponseId: "model-request"
    });
    expect(search).toHaveBeenCalledTimes(1);
    expect(model.completeJson).toHaveBeenCalledTimes(1);
    const modelRequest = vi.mocked(model.completeJson).mock.calls[0]![0];
    expect(modelRequest.messages[1]!.content).not.toContain("discard this content");
    expect(modelRequest.messages[1]!.content).not.toContain("https://a.example");
  });

  it("ignores model URLs and source metadata entirely", async () => {
    const value = { answerText: "甲提供国际物流服务。", refusal: null, usedSourceIndexes: [0], sources: [{ canonicalUrl: "http://127.0.0.1/private" }], url: "https://invented.example" };
    const result = await createAnySearchGenerativeSearchAnswerProvider({ searchConfig, client: client(value), fetch: search }).answerWithSources(request);
    expect(result.sources.map(({ canonicalUrl }) => canonicalUrl)).toEqual(["https://a.example/services"]);
    expect(JSON.stringify(result)).not.toContain("invented.example");
  });

  it("rejects ungrounded answers and invalid source indexes without retry", async () => {
    for (const value of [
      { answerText: "无来源答案", refusal: null, usedSourceIndexes: [] },
      { answerText: "错误索引", refusal: null, usedSourceIndexes: [9] }
    ]) {
      const model = client(value);
      await expect(createAnySearchGenerativeSearchAnswerProvider({ searchConfig, client: model, fetch: search }).answerWithSources(request)).rejects.toMatchObject({ code: "invalid_response" });
      expect(model.completeJson).toHaveBeenCalledTimes(1);
    }
  });

  it("maps search failures into sanitized AI client failures", async () => {
    const provider = createAnySearchGenerativeSearchAnswerProvider({ searchConfig, client: client({}), fetch: async () => new Response("secret", { status: 401 }) });
    await expect(provider.answerWithSources(request)).rejects.toMatchObject({ name: "AiClientError", code: "authentication" });
  });

  it("resolves dedicated search and generic model configuration", () => {
    expect(resolveAnySearchGenerativeSearchAnswerProvider({
      OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: searchConfig.endpoint,
      OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: searchConfig.apiKey,
      OGC_AI_BASE_URL: "https://model.example/v1",
      OGC_AI_API_KEY: "model-key",
      OGC_AI_MODEL: "deepseek-v4-flash"
    }, { locale: "zh-CN", region: "CN" }, { client: client({}) })).toMatchObject({ providerId: "anysearch+sensenova", model: "deepseek-v4-flash", searchMode: "anysearch_rest" });
    expect(() => resolveAnySearchGenerativeSearchAnswerProvider({ OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL: searchConfig.endpoint, OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY: searchConfig.apiKey }, { locale: "zh-CN", region: "CN" }, { client: client({}) })).toThrow(AiClientError);
  });
});

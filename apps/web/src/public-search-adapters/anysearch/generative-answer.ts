import {
  AiClientError,
  createOpenAiCompatibleClient,
  parseGenerativeSearchAnswerResult,
  type GenerativeSearchAnswerProvider,
  type JsonCompletionClient
} from "@open-geo-console/ai-report-engine";
import { fetchAnySearchResults, AnySearchPublicSearchAdapterError } from "./adapter";
import { readAnySearchPublicSearchConfig, type AnySearchPublicSearchConfig } from "./config";

const SYSTEM = `Return JSON only.
Answer the buyer question directly from the supplied search-result titles and snippets.
Do not claim facts that are absent from those results. Do not discuss evidence scarcity or the research process.
Choose only the source indexes actually supporting the answer. Never emit URLs or source metadata.
Use exactly this shape: {"answerText":"complete answer","refusal":null,"usedSourceIndexes":[0]}.
For a genuine safety, policy, or high-risk refusal only, return an empty answerText, an empty usedSourceIndexes array, and refusal {"code":"safety_refusal|policy_refusal|high_risk_refusal","reason":"localized reason"}.`;

interface SynthesizedAnswer {
  answerText: string;
  refusal: null | { code: "safety_refusal" | "policy_refusal" | "high_risk_refusal"; reason: string };
  usedSourceIndexes: number[];
}

export function createAnySearchGenerativeSearchAnswerProvider(input: {
  searchConfig: AnySearchPublicSearchConfig;
  client: JsonCompletionClient;
  fetch?: typeof fetch;
  now?: () => Date;
}): GenerativeSearchAnswerProvider {
  const now = input.now ?? (() => new Date());
  return {
    providerId: "anysearch+sensenova",
    model: input.client.configuredModel,
    searchMode: "anysearch_rest",
    async answerWithSources(request) {
      const searchedAt = now().toISOString();
      let results;
      try {
        results = await fetchAnySearchResults({
          config: input.searchConfig,
          query: request.question,
          maxResults: 10,
          signal: request.signal,
          fetch: input.fetch
        });
      } catch (error) {
        throw asAiClientError(error);
      }
      if (!results.length) throw new AiClientError("AnySearch returned no usable public sources.", { code: "invalid_response" });

      const completion = await input.client.completeJson({
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: JSON.stringify({
              question: request.question,
              locale: request.locale,
              region: request.region,
              sources: results.map((result, index) => ({ index, title: result.title, snippet: result.snippet }))
            })
          }
        ],
        temperature: 0.1,
        maxTokens: 2_500,
        signal: request.signal
      });
      const synthesized = parseSynthesizedAnswer(completion.value, results.length);
      const raw = {
        questionId: request.questionId,
        answerText: synthesized.answerText,
        refusal: synthesized.refusal,
        sources: synthesized.usedSourceIndexes.map((index) => ({
          sourceId: `anysearch-result-${request.questionId}-${index + 1}`,
          title: results[index]!.title,
          canonicalUrl: results[index]!.url,
          citedText: results[index]!.snippet,
          providerResultOrder: index
        })),
        searchedAt,
        completedAt: now().toISOString(),
        providerResponseId: completion.requestId ?? null
      };
      try {
        return parseGenerativeSearchAnswerResult(raw, {
          expectedQuestionId: request.questionId,
          locale: request.locale,
          semanticValidation: request.semanticValidation
        });
      } catch (error) {
        throw new AiClientError(error instanceof Error ? error.message : "SenseNova answer failed validation.", { code: "invalid_response", cause: error });
      }
    }
  };
}

export function resolveAnySearchGenerativeSearchAnswerProvider(
  environment: NodeJS.ProcessEnv,
  input: { locale: string; region: string },
  dependencies: { fetch?: typeof fetch; now?: () => Date; client?: JsonCompletionClient } = {}
): GenerativeSearchAnswerProvider {
  const baseUrl = required(environment.OGC_AI_BASE_URL, "OGC_AI_BASE_URL");
  const apiKey = required(environment.OGC_AI_API_KEY, "OGC_AI_API_KEY");
  const model = required(environment.OGC_AI_MODEL, "OGC_AI_MODEL");
  const client = dependencies.client ?? createOpenAiCompatibleClient({
    baseUrl,
    apiKey,
    model,
    fetch: dependencies.fetch,
    useJsonResponseFormat: true
  });
  return createAnySearchGenerativeSearchAnswerProvider({
    searchConfig: readAnySearchPublicSearchConfig(environment, input.locale, input.region),
    client,
    fetch: dependencies.fetch,
    now: dependencies.now
  });
}

function parseSynthesizedAnswer(value: unknown, sourceCount: number): SynthesizedAnswer {
  const row = record(value);
  if (!row || typeof row.answerText !== "string" || !Array.isArray(row.usedSourceIndexes)) {
    throw new AiClientError("SenseNova returned an invalid grounded-answer contract.", { code: "invalid_response" });
  }
  const answerText = row.answerText.trim();
  const refusal = parseRefusal(row.refusal);
  const indexes = row.usedSourceIndexes;
  if (!indexes.every((index): index is number => Number.isSafeInteger(index) && index >= 0 && index < sourceCount)) {
    throw new AiClientError("SenseNova selected an invalid source index.", { code: "invalid_response" });
  }
  const usedSourceIndexes = [...new Set(indexes)];
  if (answerText && refusal) throw new AiClientError("SenseNova returned both an answer and refusal.", { code: "invalid_response" });
  if (answerText && !usedSourceIndexes.length) throw new AiClientError("SenseNova returned an ungrounded answer.", { code: "invalid_response" });
  if (!answerText && !refusal) throw new AiClientError("SenseNova returned neither an answer nor typed refusal.", { code: "invalid_response" });
  if (refusal && usedSourceIndexes.length) throw new AiClientError("SenseNova refusal must not retain sources.", { code: "invalid_response" });
  return { answerText, refusal, usedSourceIndexes };
}

function parseRefusal(value: unknown): SynthesizedAnswer["refusal"] {
  if (value == null) return null;
  const row = record(value);
  if (!row || (row.code !== "safety_refusal" && row.code !== "policy_refusal" && row.code !== "high_risk_refusal") || typeof row.reason !== "string" || !row.reason.trim()) {
    throw new AiClientError("SenseNova returned an invalid refusal.", { code: "invalid_response" });
  }
  return { code: row.code, reason: row.reason.trim() };
}

function asAiClientError(error: unknown): AiClientError {
  if (!(error instanceof AnySearchPublicSearchAdapterError)) return new AiClientError("AnySearch request failed.", { code: "network", cause: error });
  const code = error.errorClass === "authentication" ? "authentication"
    : error.errorClass === "rate_limited" ? "rate_limited"
    : error.errorClass === "aborted" ? "aborted"
    : error.errorClass === "malformed" || error.errorClass === "unsupported" ? "invalid_response"
    : "temporary_provider";
  return new AiClientError(error.message, { code, cause: error });
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new AiClientError(`${name} is required.`, { code: "configuration" });
  return value.trim();
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

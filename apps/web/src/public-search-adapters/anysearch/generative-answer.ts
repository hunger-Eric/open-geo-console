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
If the supplied results do not support a grounded answer, return an empty answerText and refusal {"code":"insufficient_evidence","reason":"localized reason"}.
For a genuine safety, policy, or high-risk refusal, return an empty answerText and refusal {"code":"safety_refusal|policy_refusal|high_risk_refusal","reason":"localized reason"}.
A refusal may retain usedSourceIndexes when those supplied results genuinely explain or support the refusal; otherwise use an empty array.`;

interface SynthesizedAnswer {
  answerText: string;
  refusal: null | { code: "safety_refusal" | "policy_refusal" | "high_risk_refusal" | "insufficient_evidence" | "provider_refusal"; reason: string };
  usedSourceIndexes: number[];
}

export function createAnySearchGenerativeSearchAnswerProvider(input: {
  searchConfig: AnySearchPublicSearchConfig;
  client: JsonCompletionClient;
  maxOutputTokens?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}): GenerativeSearchAnswerProvider {
  const now = input.now ?? (() => new Date());
  const maxTokens = boundedMaxOutputTokens(input.maxOutputTokens, 2_500);
  return {
    providerId: "anysearch+openai-compatible",
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
        maxTokens,
        signal: request.signal
      });
      const synthesized = parseSynthesizedAnswer(completion.value, results.length, request.locale);
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
          semanticValidation: request.semanticValidation,
          sourceOverflow: "truncate"
        });
      } catch (error) {
        throw new AiClientError(error instanceof Error ? error.message : "OpenAI-compatible answer failed validation.", { code: "invalid_response", cause: error });
      }
    }
  };
}

export function resolveAnySearchGenerativeSearchAnswerProvider(
  environment: NodeJS.ProcessEnv,
  input: { locale: string; region: string },
  dependencies: { fetch?: typeof fetch; now?: () => Date; client?: JsonCompletionClient; maxOutputTokens?: number } = {}
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
    maxOutputTokens: dependencies.maxOutputTokens,
    fetch: dependencies.fetch,
    now: dependencies.now
  });
}

function boundedMaxOutputTokens(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(32_768, Math.max(256, Math.trunc(value))) : fallback;
}

function parseSynthesizedAnswer(value: unknown, sourceCount: number, locale: string): SynthesizedAnswer {
  const row = record(value);
  if (row?.usedSourceIndexes !== undefined && !Array.isArray(row.usedSourceIndexes)) {
    throw new AiClientError("The OpenAI-compatible model returned an invalid grounded-answer contract.", { code: "invalid_response" });
  }
  const indexes = row?.usedSourceIndexes ?? [];
  if (!indexes.every((index): index is number => Number.isSafeInteger(index) && index >= 0 && index < sourceCount)) {
    throw new AiClientError("The OpenAI-compatible model selected an invalid source index.", { code: "invalid_response" });
  }
  const usedSourceIndexes = [...new Set(indexes)];
  const answerText = typeof row?.answerText === "string" ? row.answerText.trim() : "";
  const refusal = parseRefusal(row?.refusal, locale);
  if (answerText && refusal) {
    return {
      answerText: "",
      refusal: providerRefusal(locale, "conflicting_answer_and_refusal"),
      usedSourceIndexes
    };
  }
  if (answerText && !usedSourceIndexes.length) {
    return {
      answerText: "",
      refusal: {
        code: "insufficient_evidence",
        reason: locale.toLowerCase().startsWith("zh")
          ? "当前公开来源不足以形成可验证回答。"
          : "The current public sources do not support a verifiable answer."
      },
      usedSourceIndexes: []
    };
  }
  if (!answerText && refusal) return { answerText, refusal, usedSourceIndexes };
  if (!answerText) {
    return {
      answerText: "",
      refusal: providerRefusal(locale, "missing_answer_and_refusal"),
      usedSourceIndexes
    };
  }
  return { answerText, refusal, usedSourceIndexes };
}

function parseRefusal(value: unknown, locale: string): SynthesizedAnswer["refusal"] {
  if (value == null) return null;
  const row = record(value);
  const reason = typeof row?.reason === "string" ? row.reason.trim() : "";
  const hasBoundedReason = Boolean(reason) && reason.length <= 500;
  if (row && (row.code === "safety_refusal" || row.code === "policy_refusal" || row.code === "high_risk_refusal" || row.code === "insufficient_evidence") && hasBoundedReason) {
    return { code: row.code, reason };
  }
  return providerRefusal(locale, "invalid_refusal", hasBoundedReason ? reason : undefined);
}

function providerRefusal(locale: string, kind: "conflicting_answer_and_refusal" | "missing_answer_and_refusal" | "invalid_refusal", retainedReason?: string): NonNullable<SynthesizedAnswer["refusal"]> {
  if (retainedReason) return { code: "provider_refusal", reason: retainedReason };
  const zh = locale.toLowerCase().startsWith("zh");
  const reason = kind === "conflicting_answer_and_refusal"
    ? (zh ? "供应商同时返回了回答和拒绝，本问题已降级处理。" : "The provider returned both an answer and a refusal, so this question was degraded.")
    : kind === "missing_answer_and_refusal"
      ? (zh ? "供应商未返回可用回答或拒绝，本问题已降级处理。" : "The provider returned neither a usable answer nor refusal, so this question was degraded.")
      : (zh ? "供应商返回了无法识别的拒绝结果，本问题已降级处理。" : "The provider returned an unrecognized refusal, so this question was degraded.");
  return { code: "provider_refusal", reason };
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

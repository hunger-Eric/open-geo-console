import {
  classifyRecommendationOutcomeText,
  createAnswerResponseHash,
  createAnswerSnapshotCellId,
  parseAnswerSnapshotCell,
  type AnswerAdapterErrorClass,
  type AnswerEngineAdapter,
  type AnswerEngineCertificationState,
  type AnswerEngineSurface,
  type AnswerSnapshotProviderMetadata,
  type AnswerSnapshotSource,
  type ObserveAnswerInput,
  type SuccessfulAnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";

const OPENAI_RESPONSES_ENDPOINT = "https://api.openai.com/v1/responses";
const PROVIDER_ID = "openai";
const PRODUCT_ID = "responses-web-search";

type FetchTransport = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export interface OpenAIWebSearchAdapterOptions {
  locale: string;
  region: string;
  certificationState?: AnswerEngineCertificationState;
  apiKey?: string;
  model?: string;
  fetch?: FetchTransport;
  now?: () => number;
}

interface OpenAIUrlCitation {
  type: "url_citation";
  startIndex: number;
  endIndex: number;
  url: string;
  title: string;
}

interface ParsedOpenAIResponse {
  responseId?: string;
  createdAt: string;
  answerText: string;
  citations: OpenAIUrlCitation[];
  usage?: SuccessfulAnswerSnapshotCell["usage"];
}

export class OpenAIWebSearchAdapterError extends Error {
  readonly errorClass: AnswerAdapterErrorClass;

  constructor(errorClass: AnswerAdapterErrorClass, message: string) {
    super(message);
    this.name = "OpenAIWebSearchAdapterError";
    this.errorClass = errorClass;
  }
}

export function createOpenAIWebSearchAdapter(
  options: OpenAIWebSearchAdapterOptions
): AnswerEngineAdapter {
  const model = requiredConfiguration(
    options.model ?? process.env.OGC_ANSWER_OPENAI_MODEL,
    "OGC_ANSWER_OPENAI_MODEL"
  );
  const locale = requiredLocale(options.locale);
  const region = requiredGlobalRegion(options.region);
  const apiKey = options.apiKey ?? process.env.OGC_ANSWER_OPENAI_API_KEY;
  const transport = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const surface: AnswerEngineSurface = {
    providerId: PROVIDER_ID,
    productId: PRODUCT_ID,
    modelId: model,
    collectionSurface: "developer_api",
    locale,
    region,
    certificationState: options.certificationState ?? "candidate_uncertified"
  };

  return {
    surface,
    classifyError: classifyOpenAIWebSearchError,
    async observe(input: ObserveAnswerInput) {
      assertObservationSurface(input, surface);
      const configuredKey = usableApiKey(apiKey);
      const startedAt = now();
      let response: Response;
      try {
        response = await transport(OPENAI_RESPONSES_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${configuredKey}`
          },
          body: JSON.stringify({
            model,
            tools: [{ type: "web_search" }],
            tool_choice: "required",
            store: false,
            instructions: `Answer in ${locale}. Use web search and support the answer with URL citations.`,
            input: input.question.exactText
          }),
          signal: input.signal
        });
      } catch (error) {
        throw transportError(error);
      }

      if (!response.ok) throw httpError(response.status);
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw invalidResponse();
      }
      const parsed = parseOpenAIResponse(payload, model);
      const sources = toSnapshotSources(parsed.citations);
      const executionDurationMs = Math.max(0, Math.round(now() - startedAt));
      return parseAnswerSnapshotCell({
        id: createAnswerSnapshotCellId({
          runId: input.run.id,
          questionId: input.question.id,
          surface
        }),
        runId: input.run.id,
        questionId: input.question.id,
        surface,
        status: "succeeded",
        answerText: parsed.answerText,
        responseHash: createAnswerResponseHash(parsed.answerText),
        sources,
        recommendationOutcome: requiredRecommendationOutcome(parsed.answerText),
        executedAt: parsed.createdAt,
        executionDurationMs,
        ...(parsed.responseId ? { providerRequestId: parsed.responseId } : {}),
        ...(parsed.usage ? { usage: parsed.usage } : {})
      } satisfies SuccessfulAnswerSnapshotCell);
    }
  };
}

export function classifyOpenAIWebSearchError(error: unknown): AnswerAdapterErrorClass {
  if (error instanceof OpenAIWebSearchAdapterError) return error.errorClass;
  if (isAbortError(error)) return "timeout";
  return "provider-unavailable";
}

function requiredConfiguration(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenAIWebSearchAdapterError("unsupported", `${name} is not configured.`);
  }
  return value.trim();
}

function requiredLocale(value: string): string {
  const locale = requiredConfiguration(value, "locale");
  if (locale !== "en" && locale !== "zh") throw new OpenAIWebSearchAdapterError("unsupported", "OpenAI certification currently supports only en or zh locale.");
  return locale;
}

function requiredGlobalRegion(value: string): string {
  const region = requiredConfiguration(value, "region");
  if (region !== "global") throw new OpenAIWebSearchAdapterError("unsupported", "OpenAI certification currently supports only the global region.");
  return region;
}

function usableApiKey(value: string | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenAIWebSearchAdapterError(
      "authentication",
      "The OpenAI answer-engine credential is not configured."
    );
  }
  return value.trim();
}

function assertObservationSurface(input: ObserveAnswerInput, expected: AnswerEngineSurface): void {
  const actual = input.surface;
  const exactSurface =
    actual.providerId === expected.providerId &&
    actual.productId === expected.productId &&
    actual.modelId === expected.modelId &&
    actual.collectionSurface === "developer_api" &&
    actual.locale === expected.locale &&
    actual.region === expected.region &&
    actual.certificationState === expected.certificationState &&
    actual.consumerApplicationLabel === undefined;
  if (
    !exactSurface ||
    input.run.locale !== expected.locale ||
    input.run.region !== expected.region ||
    input.question.locale !== expected.locale
  ) {
    throw new OpenAIWebSearchAdapterError(
      "unsupported",
      "The observation does not match the configured OpenAI developer API surface."
    );
  }
}

function httpError(status: number): OpenAIWebSearchAdapterError {
  if (status === 401 || status === 403) {
    return new OpenAIWebSearchAdapterError("authentication", "OpenAI rejected the configured credential.");
  }
  if (status === 408 || status === 504) {
    return new OpenAIWebSearchAdapterError("timeout", "The OpenAI request timed out.");
  }
  if (status === 429) {
    return new OpenAIWebSearchAdapterError("rate-limit", "OpenAI rate-limited the request.");
  }
  if (status === 400 || status === 404 || status === 422) {
    return new OpenAIWebSearchAdapterError(
      "unsupported",
      "OpenAI rejected the configured model or web-search request."
    );
  }
  return new OpenAIWebSearchAdapterError("provider-unavailable", "OpenAI was unavailable.");
}

function transportError(error: unknown): OpenAIWebSearchAdapterError {
  if (isAbortError(error)) {
    return new OpenAIWebSearchAdapterError("timeout", "The OpenAI request timed out.");
  }
  return new OpenAIWebSearchAdapterError("provider-unavailable", "OpenAI was unavailable.");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : isRecord(error) && error.name === "AbortError";
}

function invalidResponse(): OpenAIWebSearchAdapterError {
  return new OpenAIWebSearchAdapterError("invalid-response", "OpenAI returned an invalid response.");
}

function parseOpenAIResponse(value: unknown, expectedModel: string): ParsedOpenAIResponse {
  const response = asRecord(value);
  if (
    response.status !== "completed" ||
    response.model !== expectedModel ||
    !Array.isArray(response.output)
  ) {
    throw invalidResponse();
  }
  if (!response.output.some(isCompletedWebSearchCall)) throw invalidResponse();

  const createdAt = providerTimestamp(response.created_at);
  const textParts: string[] = [];
  const citations: OpenAIUrlCitation[] = [];
  for (const itemValue of response.output) {
    const item = asOptionalRecord(itemValue);
    if (!item || item.type !== "message" || item.status !== "completed" || !Array.isArray(item.content)) {
      continue;
    }
    for (const contentValue of item.content) {
      const content = asOptionalRecord(contentValue);
      if (!content || content.type !== "output_text" || typeof content.text !== "string") continue;
      if (content.text.trim().length === 0 || !Array.isArray(content.annotations)) throw invalidResponse();
      textParts.push(content.text);
      for (const annotationValue of content.annotations) {
        const annotation = asOptionalRecord(annotationValue);
        if (!annotation || annotation.type !== "url_citation") continue;
        citations.push(parseCitation(annotation, content.text));
      }
    }
  }
  if (textParts.length === 0 || citations.length === 0) throw invalidResponse();

  const responseId = safeProviderRequestId(response.id);
  const usage = parseUsage(response.usage);
  return {
    ...(responseId ? { responseId } : {}),
    createdAt,
    answerText: textParts.join("\n"),
    citations,
    ...(usage ? { usage } : {})
  };
}

function isCompletedWebSearchCall(value: unknown): boolean {
  const item = asOptionalRecord(value);
  return item?.type === "web_search_call" && item.status === "completed";
}

function parseCitation(annotation: Record<string, unknown>, answerText: string): OpenAIUrlCitation {
  if (
    typeof annotation.url !== "string" ||
    typeof annotation.title !== "string" ||
    annotation.title.trim().length === 0 ||
    !Number.isSafeInteger(annotation.start_index) ||
    (annotation.start_index as number) < 0 ||
    !Number.isSafeInteger(annotation.end_index) ||
    (annotation.end_index as number) <= (annotation.start_index as number) ||
    (annotation.end_index as number) > answerText.length
  ) {
    throw invalidResponse();
  }
  let parsed: URL;
  try {
    parsed = new URL(annotation.url);
  } catch {
    throw invalidResponse();
  }
  if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") || !parsed.hostname ||
      parsed.username || parsed.password || annotation.url.length > 4_096) {
    throw invalidResponse();
  }
  return {
    type: "url_citation",
    startIndex: annotation.start_index as number,
    endIndex: annotation.end_index as number,
    url: annotation.url,
    title: annotation.title
  };
}

function toSnapshotSources(citations: OpenAIUrlCitation[]): AnswerSnapshotSource[] {
  const seen = new Set<string>();
  const sources: AnswerSnapshotSource[] = [];
  for (const citation of citations) {
    const url = canonicalProviderUrl(citation.url);
    if (seen.has(url)) continue;
    seen.add(url);
    const providerMetadata: AnswerSnapshotProviderMetadata = { sourceType: citation.type };
    sources.push({
      url,
      title: citation.title,
      providerOrder: sources.length,
      providerMetadata
    });
  }
  return sources;
}

function canonicalProviderUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

function providerTimestamp(value: unknown): string {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalidResponse();
  const timestamp = new Date((value as number) * 1_000);
  if (!Number.isFinite(timestamp.getTime())) throw invalidResponse();
  return timestamp.toISOString();
}

function parseUsage(value: unknown): SuccessfulAnswerSnapshotCell["usage"] | undefined {
  if (value === undefined || value === null) return undefined;
  const usage = asRecord(value);
  const inputTokens = safeNonNegativeInteger(usage.input_tokens);
  const outputTokens = safeNonNegativeInteger(usage.output_tokens);
  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens })
  };
}

function safeNonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : undefined;
}

function safeProviderRequestId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^resp_[A-Za-z0-9_-]{1,480}$/.test(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  const result = asOptionalRecord(value);
  if (!result) throw invalidResponse();
  return result;
}

function asOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return asOptionalRecord(value) !== undefined;
}

function requiredRecommendationOutcome(answerText: string): "recommendations_present" | "no_recommendation" {
  const outcome = classifyRecommendationOutcomeText(answerText);
  if (!outcome) throw invalidResponse();
  return outcome;
}

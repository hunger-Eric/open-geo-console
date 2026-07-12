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
  type AnswerSnapshotUsage,
  type ObserveAnswerInput
} from "@open-geo-console/answer-engine-observer";

const PERPLEXITY_SONAR_ENDPOINT = "https://api.perplexity.ai/v1/sonar";
const SUPPORTED_MODELS = new Set([
  "sonar",
  "sonar-pro",
  "sonar-deep-research",
  "sonar-reasoning-pro"
]);

export interface PerplexitySonarEnvironment {
  OGC_ANSWER_PERPLEXITY_API_KEY?: string;
  OGC_ANSWER_PERPLEXITY_MODEL?: string;
}

export interface CreatePerplexitySonarAdapterOptions {
  environment: PerplexitySonarEnvironment;
  locale: string;
  region: string;
  certificationState?: AnswerEngineCertificationState;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class PerplexitySonarAdapterError extends Error {
  constructor(readonly errorClass: AnswerAdapterErrorClass, message: string) {
    super(message);
    this.name = "PerplexitySonarAdapterError";
  }
}

interface SearchResult {
  url: string;
  title?: string;
  date?: string;
  lastUpdated?: string;
  source?: string;
}

interface ParsedSonarResponse {
  requestId: string;
  answerText: string;
  sources: AnswerSnapshotSource[];
  usage?: AnswerSnapshotUsage;
}

export function createPerplexitySonarAdapter(
  options: CreatePerplexitySonarAdapterOptions
): AnswerEngineAdapter {
  const apiKey = requiredSecret(options.environment.OGC_ANSWER_PERPLEXITY_API_KEY);
  const model = requiredModel(options.environment.OGC_ANSWER_PERPLEXITY_MODEL);
  const locale = requiredLabel(options.locale, "locale");
  const region = requiredLabel(options.region, "region");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new PerplexitySonarAdapterError("provider-unavailable", "Perplexity API transport is unavailable.");
  }
  const now = options.now ?? Date.now;
  const surface: AnswerEngineSurface = {
    providerId: "perplexity",
    productId: "sonar-api",
    modelId: model,
    collectionSurface: "developer_api",
    locale,
    region,
    certificationState: options.certificationState ?? "candidate_uncertified"
  };

  return {
    surface,
    async observe(input: ObserveAnswerInput) {
      assertMatchingSurface(input.surface, surface);
      const startedAt = now();
      let response: Response;
      try {
        response = await fetchImpl(PERPLEXITY_SONAR_ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: input.question.exactText }],
            stream: false
          }),
          signal: input.signal
        });
      } catch (error) {
        if (isAbortError(error) || input.signal.aborted) {
          throw new PerplexitySonarAdapterError("timeout", "Perplexity API request was aborted.");
        }
        throw new PerplexitySonarAdapterError("provider-unavailable", "Perplexity API request failed.");
      }

      if (!response.ok) throw httpError(response.status);
      const payload = await safeJson(response);
      const parsed = parseResponse(payload, model, apiKey);
      const finishedAt = now();
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
        sources: parsed.sources,
        recommendationOutcome: requiredRecommendationOutcome(parsed.answerText),
        providerRequestId: parsed.requestId,
        ...(parsed.usage ? { usage: parsed.usage } : {}),
        executedAt: new Date(finishedAt).toISOString(),
        executionDurationMs: Math.max(0, Math.round(finishedAt - startedAt))
      });
    },
    classifyError(error: unknown): AnswerAdapterErrorClass {
      if (error instanceof PerplexitySonarAdapterError) return error.errorClass;
      if (isAbortError(error)) return "timeout";
      return "provider-unavailable";
    }
  };
}

function parseResponse(payload: unknown, configuredModel: string, apiKey: string): ParsedSonarResponse {
  const response = asRecord(payload);
  if (!response) throw invalidResponse();
  const requestId = safeRequestId(response.id, apiKey);
  if (response.model !== configuredModel) throw invalidResponse();
  if (!Array.isArray(response.choices) || response.choices.length === 0) throw invalidResponse();
  const choice = asRecord(response.choices[0]);
  const message = asRecord(choice?.message);
  const answerText = nonEmptyText(message?.content, 100_000);
  if (!answerText) throw invalidResponse();
  const sources = parseSources(response.citations, response.search_results);
  if (sources.length === 0) throw invalidResponse();
  const usage = parseUsage(response.usage);
  return { requestId, answerText, sources, ...(usage ? { usage } : {}) };
}

function parseSources(citationsValue: unknown, searchResultsValue: unknown): AnswerSnapshotSource[] {
  if (!Array.isArray(citationsValue) || citationsValue.length === 0) throw invalidResponse();
  const results = parseSearchResults(searchResultsValue);
  const resultsByUrl = new Map<string, SearchResult>();
  for (const result of results) {
    const key = normalizedUrlKey(result.url);
    if (key && !resultsByUrl.has(key)) resultsByUrl.set(key, result);
  }

  const seen = new Set<string>();
  const sources: AnswerSnapshotSource[] = [];
  for (const citation of citationsValue) {
    if (typeof citation !== "string") throw invalidResponse();
    const url = absoluteHttpUrl(citation);
    if (!url) throw invalidResponse();
    const key = normalizedUrlKey(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const result = resultsByUrl.get(key);
    sources.push({
      url,
      title: nonEmptyText(result?.title, 1_000) ?? new URL(url).hostname,
      providerOrder: sources.length,
      providerMetadata: providerMetadata(result)
    });
  }
  return sources;
}

function parseSearchResults(value: unknown): SearchResult[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw invalidResponse();
  const results: SearchResult[] = [];
  for (const item of value) {
    const raw = asRecord(item);
    const url = absoluteHttpUrl(raw?.url);
    if (!raw || !url) continue;
    results.push({
      url,
      ...(nonEmptyText(raw.title, 1_000) ? { title: nonEmptyText(raw.title, 1_000) } : {}),
      ...(nonEmptyText(raw.date, 64) ? { date: nonEmptyText(raw.date, 64) } : {}),
      ...(nonEmptyText(raw.last_updated, 64) ? { lastUpdated: nonEmptyText(raw.last_updated, 64) } : {}),
      ...(nonEmptyText(raw.source, 100) ? { source: nonEmptyText(raw.source, 100) } : {})
    });
  }
  return results;
}

function providerMetadata(result: SearchResult | undefined): AnswerSnapshotProviderMetadata {
  if (!result) return {};
  const publishedAt = normalizedTimestamp(result.date);
  const lastUpdatedAt = normalizedTimestamp(result.lastUpdated);
  return {
    ...(publishedAt ? { publishedAt } : {}),
    ...(lastUpdatedAt ? { lastUpdatedAt } : {}),
    ...(result.source ? { sourceType: result.source } : {})
  };
}

function parseUsage(value: unknown): AnswerSnapshotUsage | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;
  const inputTokens = safeInteger(raw.prompt_tokens);
  const outputTokens = safeInteger(raw.completion_tokens);
  const cost = asRecord(raw.cost);
  const totalCost = typeof cost?.total_cost === "number" ? cost.total_cost : undefined;
  const estimatedCostMicros = totalCost !== undefined && Number.isFinite(totalCost) && totalCost >= 0
    ? safeInteger(Math.round(totalCost * 1_000_000))
    : undefined;
  const usage: AnswerSnapshotUsage = {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(estimatedCostMicros !== undefined ? { estimatedCostMicros } : {})
  };
  return Object.keys(usage).length > 0 ? usage : undefined;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw invalidResponse();
  }
}

function requiredSecret(value: string | undefined): string {
  if (!value?.trim()) {
    throw new PerplexitySonarAdapterError(
      "authentication",
      "OGC_ANSWER_PERPLEXITY_API_KEY is required for the Perplexity adapter."
    );
  }
  return value.trim();
}

function requiredModel(value: string | undefined): string {
  const model = value?.trim();
  if (!model || !SUPPORTED_MODELS.has(model)) {
    throw new PerplexitySonarAdapterError(
      "unsupported",
      "OGC_ANSWER_PERPLEXITY_MODEL must name a supported Sonar API model."
    );
  }
  return model;
}

function requiredLabel(value: string, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 64) {
    throw new PerplexitySonarAdapterError("unsupported", `Perplexity adapter ${label} is invalid.`);
  }
  return value.trim();
}

function assertMatchingSurface(actual: AnswerEngineSurface, expected: AnswerEngineSurface): void {
  for (const key of [
    "providerId", "productId", "modelId", "collectionSurface", "locale", "region", "certificationState"
  ] as const) {
    if (actual[key] !== expected[key]) throw invalidResponse();
  }
  if (actual.consumerApplicationLabel !== undefined) throw invalidResponse();
}

function safeRequestId(value: unknown, apiKey: string): string {
  const id = nonEmptyText(value, 200);
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id) || id.includes(apiKey) || /bearer/i.test(id)) {
    throw invalidResponse();
  }
  return id;
}

function absoluteHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096) return undefined;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname &&
      !url.username && !url.password ? value : undefined;
  } catch {
    return undefined;
  }
}

function normalizedUrlKey(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.hash = "";
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.href;
  } catch {
    return undefined;
  }
}

function normalizedTimestamp(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function nonEmptyText(value: unknown, maxLength: number): string | undefined {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredRecommendationOutcome(answerText: string): "recommendations_present" | "no_recommendation" {
  const outcome = classifyRecommendationOutcomeText(answerText);
  if (!outcome) throw invalidResponse();
  return outcome;
}

function httpError(status: number): PerplexitySonarAdapterError {
  if (status === 401 || status === 403) {
    return new PerplexitySonarAdapterError("authentication", "Perplexity API rejected its configured credentials.");
  }
  if (status === 408 || status === 499 || status === 504) {
    return new PerplexitySonarAdapterError("timeout", "Perplexity API request timed out.");
  }
  if (status === 429) {
    return new PerplexitySonarAdapterError("rate-limit", "Perplexity API rate limit was reached.");
  }
  if (status === 451) {
    return new PerplexitySonarAdapterError("policy-blocked", "Perplexity API policy blocked this request.");
  }
  if ([400, 404, 405, 409, 422].includes(status)) {
    return new PerplexitySonarAdapterError("unsupported", "Perplexity API rejected this request contract.");
  }
  return new PerplexitySonarAdapterError("provider-unavailable", "Perplexity API returned an unavailable response.");
}

function invalidResponse(): PerplexitySonarAdapterError {
  return new PerplexitySonarAdapterError("invalid-response", "Perplexity API returned an invalid response.");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

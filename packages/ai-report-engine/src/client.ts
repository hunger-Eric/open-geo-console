export interface JsonCompletionMessage {
  role: "system" | "user";
  content: string;
}

export interface JsonCompletionRequest {
  messages: JsonCompletionMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface JsonCompletionResult {
  value: unknown;
  modelId: string;
  rawContent: string;
  requestId?: string;
}

export interface JsonCompletionClient {
  readonly configuredModel: string;
  completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult>;
}

export interface OpenAiCompatibleClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  useJsonResponseFormat?: boolean;
  defaultHeaders?: Record<string, string>;
}

export type AiClientErrorCode = "invalid_json" | "non_json_response" | "invalid_response" | "empty_content" | "output_truncated"
  | "timeout" | "aborted" | "network" | "rate_limited" | "temporary_provider"
  | "authentication" | "configuration" | "request_rejected";

const RETRYABLE_AI_CLIENT_CODES = new Set<AiClientErrorCode>([
  "invalid_json", "non_json_response", "invalid_response", "empty_content", "output_truncated", "timeout", "network", "rate_limited", "temporary_provider"
]);

export class AiClientError extends Error {
  readonly code: AiClientErrorCode; readonly retryable: boolean; readonly status?: number;
  readonly finishReason?: string; readonly responseChars?: number; readonly outputTokens?: number;

  constructor(message: string, options: {
    code?: AiClientErrorCode; status?: number; finishReason?: string; responseChars?: number; outputTokens?: number; cause?: unknown;
  } = {}) {
    super(message, { cause: options.cause });
    this.name = "AiClientError";
    this.code = options.code ?? inferAiClientErrorCode(message, options.status);
    this.retryable = RETRYABLE_AI_CLIENT_CODES.has(this.code);
    this.status = options.status;
    this.finishReason = safeFinishReason(options.finishReason);
    this.responseChars = safeCount(options.responseChars);
    this.outputTokens = safeCount(options.outputTokens);
  }
}

export function isRetryableAiClientError(error: unknown): error is AiClientError { return error instanceof AiClientError && error.retryable; }

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function extractMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return typeof part.text === "string" ? part.text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

export function parseJsonContent(content: string, metadata: { status?: number; finishReason?: string; outputTokens?: number } = {}): unknown {
  const trimmed = content.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenceMatch?.[1] ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch (firstError) {
    const objectStart = candidate.indexOf("{");
    const arrayStart = candidate.indexOf("[");
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    const start = starts.length > 0 ? Math.min(...starts) : -1;
    const objectEnd = candidate.lastIndexOf("}");
    const arrayEnd = candidate.lastIndexOf("]");
    const end = Math.max(objectEnd, arrayEnd);

    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Report the original parse error below so callers receive one stable error type.
      }
    }

    throw new AiClientError("The model returned invalid JSON.", {
      code: metadata.finishReason === "length" ? "output_truncated" : "invalid_json",
      status: metadata.status, finishReason: metadata.finishReason, responseChars: content.length, outputTokens: metadata.outputTokens, cause: firstError
    });
  }
}

export class OpenAiCompatibleClient implements JsonCompletionClient {
  readonly configuredModel: string;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly timeoutMs: number;
  private readonly useJsonResponseFormat: boolean;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: OpenAiCompatibleClientOptions) {
    if (!options.baseUrl.trim()) throw new AiClientError("AI base URL is required.");
    if (!options.apiKey.trim()) throw new AiClientError("AI API key is required.");
    if (!options.model.trim()) throw new AiClientError("AI model is required.");

    this.endpoint = chatCompletionsUrl(options.baseUrl);
    this.apiKey = options.apiKey;
    this.configuredModel = options.model;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.useJsonResponseFormat = options.useJsonResponseFormat ?? true;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async completeJson(request: JsonCompletionRequest): Promise<JsonCompletionResult> {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(new Error("AI request timed out.")); }, this.timeoutMs);
    const abortFromCaller = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener("abort", abortFromCaller, { once: true });

    const body: Record<string, unknown> = {
      model: this.configuredModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.1
    };
    if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    if (this.useJsonResponseFormat) body.response_format = { type: "json_object" };

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          ...this.defaultHeaders
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const responseText = await response.text();

      if (!response.ok) {
        throw new AiClientError(`AI request failed with HTTP ${response.status}.`, {
          status: response.status, code: statusErrorCode(response.status), responseChars: responseText.length
        });
      }

      let envelope: unknown;
      try {
        envelope = JSON.parse(responseText);
      } catch (cause) {
        throw new AiClientError("AI endpoint returned a non-JSON response.", {
          code: "non_json_response", status: response.status, responseChars: responseText.length, cause
        });
      }

      if (!envelope || typeof envelope !== "object") {
        throw new AiClientError("AI endpoint returned an invalid response envelope.", {
          code: "invalid_response", status: response.status, responseChars: responseText.length
        });
      }

      const record = envelope as Record<string, unknown>;
      const choices = Array.isArray(record.choices) ? record.choices : [];
      const firstChoice = choices[0];
      const choiceRecord = firstChoice && typeof firstChoice === "object" ? firstChoice as Record<string, unknown> : {};
      const finishReason = typeof choiceRecord.finish_reason === "string" ? choiceRecord.finish_reason : undefined;
      const usage = record.usage && typeof record.usage === "object" ? record.usage as Record<string, unknown> : {};
      const outputTokens = safeCount(usage.completion_tokens ?? usage.output_tokens);
      const message = firstChoice && typeof firstChoice === "object"
        ? choiceRecord.message
        : undefined;
      const content = message && typeof message === "object"
        ? extractMessageContent((message as Record<string, unknown>).content)
        : "";

      const responseMetadata = { status: response.status, finishReason, responseChars: content.length, outputTokens };
      if (finishReason === "length") {
        throw new AiClientError("AI endpoint truncated the model output.", { code: "output_truncated", ...responseMetadata });
      }
      if (!content.trim()) {
        throw new AiClientError("AI endpoint returned no message content.", { code: "empty_content", ...responseMetadata });
      }

      return {
        value: parseJsonContent(content, { status: response.status, finishReason, outputTokens }),
        rawContent: content,
        modelId: typeof record.model === "string" ? record.model : this.configuredModel,
        requestId: response.headers.get("x-request-id") ?? undefined
      };
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      if (controller.signal.aborted) {
        throw new AiClientError(timedOut ? "AI request timed out." : "AI request was aborted.", {
          code: timedOut ? "timeout" : "aborted", cause: error
        });
      }
      throw new AiClientError("AI request failed.", { code: "network", cause: error });
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

function safeCount(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined; }
function safeFinishReason(value: unknown): string | undefined { return typeof value === "string" && /^[a-z0-9_-]{1,40}$/i.test(value) ? value : undefined; }

function statusErrorCode(status: number): AiClientErrorCode {
  return status === 401 || status === 403 ? "authentication" : status === 429 ? "rate_limited" : status >= 500 ? "temporary_provider" : "request_rejected";
}

function inferAiClientErrorCode(message: string, status?: number): AiClientErrorCode {
  if (status !== undefined) return statusErrorCode(status);
  if (/invalid json/i.test(message)) return "invalid_json";
  if (/non-json/i.test(message)) return "non_json_response";
  if (/no message content/i.test(message)) return "empty_content";
  if (/base URL|API key|model is required/i.test(message)) return "configuration";
  if (/aborted/i.test(message)) return "aborted";
  if (/timed out/i.test(message)) return "timeout";
  return "network";
}

export function createOpenAiCompatibleClient(
  options: OpenAiCompatibleClientOptions
): OpenAiCompatibleClient {
  return new OpenAiCompatibleClient(options);
}

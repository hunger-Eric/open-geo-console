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

export class AiClientError extends Error {
  readonly status?: number;
  readonly responseBody?: string;

  constructor(message: string, options: { status?: number; responseBody?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "AiClientError";
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

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

export function parseJsonContent(content: string): unknown {
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
      responseBody: content.slice(0, 2_000),
      cause: firstError
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
    const timeout = setTimeout(() => controller.abort(new Error("AI request timed out.")), this.timeoutMs);
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
          status: response.status,
          responseBody: responseText.slice(0, 2_000)
        });
      }

      let envelope: unknown;
      try {
        envelope = JSON.parse(responseText);
      } catch (cause) {
        throw new AiClientError("AI endpoint returned a non-JSON response.", {
          status: response.status,
          responseBody: responseText.slice(0, 2_000),
          cause
        });
      }

      if (!envelope || typeof envelope !== "object") {
        throw new AiClientError("AI endpoint returned an invalid response envelope.");
      }

      const record = envelope as Record<string, unknown>;
      const choices = Array.isArray(record.choices) ? record.choices : [];
      const firstChoice = choices[0];
      const message = firstChoice && typeof firstChoice === "object"
        ? (firstChoice as Record<string, unknown>).message
        : undefined;
      const content = message && typeof message === "object"
        ? extractMessageContent((message as Record<string, unknown>).content)
        : "";

      if (!content) throw new AiClientError("AI endpoint returned no message content.");

      return {
        value: parseJsonContent(content),
        rawContent: content,
        modelId: typeof record.model === "string" ? record.model : this.configuredModel,
        requestId: response.headers.get("x-request-id") ?? undefined
      };
    } catch (error) {
      if (error instanceof AiClientError) throw error;
      if (controller.signal.aborted) {
        throw new AiClientError("AI request was aborted or timed out.", { cause: error });
      }
      throw new AiClientError("AI request failed.", { cause: error });
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

export function createOpenAiCompatibleClient(
  options: OpenAiCompatibleClientOptions
): OpenAiCompatibleClient {
  return new OpenAiCompatibleClient(options);
}

import {
  AiClientError,
  createOpenAiCompatibleClient,
  runWithModelTokenBudget
} from "@open-geo-console/ai-report-engine";
import {
  buildReportV4DiagnosisInvocation,
  buildReportV4StructuredTokenBudget,
  createReportV4DiagnosisProvider,
  type ReportV4StructuredInvoker
} from "./mimo-provider";
import { createReportV4SiteSynthesisProvider } from "./mimo-site-synthesis-provider";
import {
  REPORT_V4_SENSENOVA_MIMO_V25_PRO_PROFILE_ID,
  resolveReportV4LockedModelRuntime,
  type ReportV4ModelRuntimeConfig
} from "./model-runtime-config";
import {
  ReportV4DiagnosisProviderError,
  type ReportV4DiagnosisProvider
} from "../worker/report-v4-diagnosis-enhancer";

const SENSENOVA_BASE_URL = "https://token.sensenova.cn/v1";
const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const APPROVED_AI_BASE_URLS = new Set([SENSENOVA_BASE_URL, OPENCODE_GO_BASE_URL]);
const SENSENOVA_MODEL = "mimo-v2.5-pro";

export interface ReportV4OpenAiCompatibleProviderDependencies {
  readonly environment: NodeJS.ProcessEnv;
  readonly runtime: ReportV4ModelRuntimeConfig;
  readonly fetch?: typeof globalThis.fetch;
}

export function createReportV4OpenAiCompatibleStructuredInvoker(
  input: ReportV4OpenAiCompatibleProviderDependencies
): ReportV4StructuredInvoker {
  const config = readSenseNovaConfig(input.environment);
  const runtime = requireSenseNovaRuntime(input.runtime);
  return Object.freeze({
    async invoke(request: Parameters<ReportV4StructuredInvoker["invoke"]>[0]) {
      request.signal.throwIfAborted();
      if (request.webSearchLocation) {
        throw new AiClientError("SenseNova structured operations do not provide native web search.", { code: "configuration" });
      }
      const operation = runtime.modelProfile.operations[request.operation];
      const client = createOpenAiCompatibleClient({
        ...config,
        model: operation.model,
        timeoutMs: operation.timeoutMs,
        useJsonResponseFormat: true,
        fetch: input.fetch
      });
      const budget = buildReportV4StructuredTokenBudget(runtime, request);
      return runWithModelTokenBudget(budget, async () => (
        await client.completeJson({
          messages: [
            { role: "system", content: request.systemText },
            { role: "user", content: request.inputText }
          ],
          temperature: 0.1,
          maxTokens: operation.maxOutputTokens,
          signal: request.signal
        })
      ).value);
    }
  });
}

export function createReportV4SenseNovaSiteSynthesisProvider(
  input: ReportV4OpenAiCompatibleProviderDependencies
) {
  return createReportV4SiteSynthesisProvider(
    createReportV4OpenAiCompatibleStructuredInvoker(input),
    "SenseNova"
  );
}

export function createReportV4SenseNovaDiagnosisProvider(
  input: ReportV4OpenAiCompatibleProviderDependencies
): ReportV4DiagnosisProvider {
  const invoker = createReportV4OpenAiCompatibleStructuredInvoker(input);
  return createReportV4DiagnosisProvider(invoker, mapDiagnosisError);
}

export function assertReportV4SenseNovaDiagnosisInput(
  runtime: ReportV4ModelRuntimeConfig,
  request: Parameters<typeof buildReportV4DiagnosisInvocation>[0]
): void {
  buildReportV4StructuredTokenBudget(runtime, buildReportV4DiagnosisInvocation(request));
}

export function readSenseNovaConfig(environment: NodeJS.ProcessEnv): {
  readonly baseUrl: string;
  readonly apiKey: string;
} {
  const baseUrl = normalizeAiBaseUrl(environment.OGC_AI_BASE_URL);
  if (!baseUrl || !APPROVED_AI_BASE_URLS.has(baseUrl)) {
    throw new AiClientError("OGC_AI_BASE_URL must use an approved OpenAI-compatible endpoint.", { code: "configuration" });
  }
  if (environment.OGC_AI_MODEL !== SENSENOVA_MODEL) {
    throw new AiClientError("OGC_AI_MODEL conflicts with the selected SenseNova profile.", { code: "configuration" });
  }
  if (environment.OGC_AI_JSON_RESPONSE_FORMAT !== undefined
      && environment.OGC_AI_JSON_RESPONSE_FORMAT !== "true") {
    throw new AiClientError("OGC_AI_JSON_RESPONSE_FORMAT must be true for the SenseNova profile.", { code: "configuration" });
  }
  const apiKey = environment.OGC_AI_API_KEY;
  if (!apiKey?.trim() || apiKey !== apiKey.trim() || apiKey.length > 4_096) {
    throw new AiClientError("OGC_AI_API_KEY must contain a bounded API key.", { code: "configuration" });
  }
  return Object.freeze({ baseUrl, apiKey });
}

function normalizeAiBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

function requireSenseNovaRuntime(runtime: ReportV4ModelRuntimeConfig): ReportV4ModelRuntimeConfig {
  const approved = resolveReportV4LockedModelRuntime(runtime.modelProfile);
  if (approved !== runtime
      || runtime.modelProfile.profileId !== REPORT_V4_SENSENOVA_MIMO_V25_PRO_PROFILE_ID
      || Object.values(runtime.modelProfile.operations).some(({ model }) => model !== SENSENOVA_MODEL)) {
    throw new AiClientError("The locked Report V4 runtime conflicts with the SenseNova profile.", { code: "configuration" });
  }
  return runtime;
}

function mapDiagnosisError(error: unknown): unknown {
  if (!(error instanceof AiClientError)) return error;
  const code = error.code === "authentication" ? "authentication"
    : error.code === "rate_limited" ? "rate_limited"
    : error.code === "configuration" || error.code === "request_rejected" ? "configuration"
    : error.code === "aborted" ? "transport"
    : error.code === "invalid_json" || error.code === "non_json_response"
      || error.code === "invalid_response" || error.code === "empty_content"
      || error.code === "output_truncated" ? "temporary_provider"
    : "temporary_provider";
  return new ReportV4DiagnosisProviderError(code, error.message);
}

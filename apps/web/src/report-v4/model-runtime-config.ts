import {
  createModelProfileRegistry,
  createModelProviderCapabilityRegistry,
  createModelTokenEstimatorRegistry,
  parseModelProfile,
  type ModelProfile,
  type ModelTokenEstimator,
  type ModelTokenEstimatorRegistry,
  type ResolvedModelProfile
} from "@open-geo-console/ai-report-engine";
import profilePayload from "../../../../config/model-profiles/report-v4-mimo-v2.5-pro.json";

export const REPORT_V4_MIMO_V25_PRO_PROFILE_ID = "report-v4-mimo-v2.5-pro-v1" as const;

export const REPORT_V4_MODEL_PROFILE_IDS = Object.freeze([
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID
] as const);

export interface ReportV4ModelCapabilityEvidence {
  readonly capability:
    | "model-limits-and-features"
    | "openai-chat-completions-endpoint-and-structured-output"
    | "native-web-search";
  readonly sourceUrl: string;
  readonly documentVersion: "2026-06-29";
  readonly verifiedOn: "2026-07-16";
}

export interface ReportV4ModelRuntimeConfig {
  /** Capability-resolved, public profile payload accepted directly by the immutable config-snapshot boundary. */
  readonly modelProfile: ModelProfile;
  readonly resolvedProfile: ResolvedModelProfile;
  readonly tokenEstimator: ModelTokenEstimator;
  readonly tokenEstimators: ModelTokenEstimatorRegistry;
}

export const REPORT_V4_MODEL_CAPABILITY_EVIDENCE: readonly ReportV4ModelCapabilityEvidence[] = Object.freeze([
  Object.freeze({
    capability: "model-limits-and-features",
    sourceUrl: "https://mimo.mi.com/docs/en-US/quick-start/model",
    documentVersion: "2026-06-29",
    verifiedOn: "2026-07-16"
  }),
  Object.freeze({
    capability: "openai-chat-completions-endpoint-and-structured-output",
    sourceUrl: "https://mimo.mi.com/docs/en-US/api/chat/openai-api",
    documentVersion: "2026-06-29",
    verifiedOn: "2026-07-16"
  }),
  Object.freeze({
    capability: "native-web-search",
    sourceUrl: "https://mimo.mi.com/docs/en-US/quick-start/usage-guide/text-generation/tool-calling/web-search",
    documentVersion: "2026-06-29",
    verifiedOn: "2026-07-16"
  })
]);

const TOKENIZER_ID = "mimo-v2.5-pro-utf8-conservative-v1";
const ESTIMATOR_ID = "mimo-v2.5-pro-utf8-byte-upper-bound-v1";
const utf8 = new TextEncoder();

const tokenEstimators = createModelTokenEstimatorRegistry([{
  estimatorId: ESTIMATOR_ID,
  tokenizer: TOKENIZER_ID,
  estimateTokens(text: string): number {
    return utf8.encode(text).byteLength;
  }
}]);

const providerCapabilities = createModelProviderCapabilityRegistry([{
  provider: "xiaomi-mimo",
  adapterId: "mimo-openai-chat-completions-v1",
  operations: [
    operationCapability("pageAnalysis", "openai-chat-completions-structured-output", false),
    operationCapability("websiteSynthesis", "openai-chat-completions-structured-output", false),
    operationCapability("questionAnswer", "openai-chat-completions-web-search-structured-output", true),
    operationCapability("sourceDiagnosis", "openai-chat-completions-structured-output", false)
  ]
}]);

const modelProfile = parseModelProfile(profilePayload);
const profileRegistry = createModelProfileRegistry({
  profiles: [modelProfile],
  providers: providerCapabilities,
  estimators: tokenEstimators
});

// Resolve once at module initialization so capability/profile drift fails before
// any report is admitted. The snapshot-safe profile remains the strict public
// ModelProfile shape; endpoint and estimator resolution are admission checks.
const resolvedProfile = profileRegistry.load(REPORT_V4_MIMO_V25_PRO_PROFILE_ID);

const runtime = Object.freeze({
  modelProfile,
  resolvedProfile,
  tokenEstimator: tokenEstimators.resolve(TOKENIZER_ID),
  tokenEstimators
});

const APPROVED_RUNTIMES: Readonly<Record<typeof REPORT_V4_MIMO_V25_PRO_PROFILE_ID, ReportV4ModelRuntimeConfig>> =
  Object.freeze({
    [REPORT_V4_MIMO_V25_PRO_PROFILE_ID]: runtime
  });

export function loadReportV4ModelRuntimeConfig(
  environment: NodeJS.ProcessEnv
): ReportV4ModelRuntimeConfig {
  const profileId = environment.OGC_REPORT_V4_MODEL_PROFILE_ID;
  if (typeof profileId !== "string" || profileId.length === 0) {
    throw new Error("OGC_REPORT_V4_MODEL_PROFILE_ID is required for Report V4 runtime admission.");
  }
  if (profileId !== REPORT_V4_MIMO_V25_PRO_PROFILE_ID) {
    throw new Error(`Unsupported OGC_REPORT_V4_MODEL_PROFILE_ID ${JSON.stringify(profileId)}; no fallback is allowed.`);
  }
  return APPROVED_RUNTIMES[profileId];
}

function operationCapability(
  operation: "pageAnalysis" | "websiteSynthesis" | "questionAnswer" | "sourceDiagnosis",
  endpointCapability: string,
  nativeWebSearch: boolean
) {
  return {
    operation,
    endpointCapability,
    nativeWebSearch,
    structuredOutput: true
  };
}

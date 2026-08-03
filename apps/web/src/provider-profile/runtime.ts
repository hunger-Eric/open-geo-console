import {
  createOpenAiCompatibleClient,
  type GenerativeSearchAnswerProvider,
  type JsonCompletionClient
} from "@open-geo-console/ai-report-engine";
import type {
  PublicSearchSurfaceAdapter,
  PublicSearchSurfaceAuthority
} from "@open-geo-console/public-search-observer";
import { readAnySearchPublicSearchConfig } from "@/public-search-adapters/anysearch/config";
import { resolveAnySearchGenerativeSearchAnswerProvider } from "@/public-search-adapters/anysearch/generative-answer";
import { readMiMoPublicSearchConfig } from "@/public-search-adapters/mimo/config";
import { resolveMiMoGenerativeSearchAnswerProvider } from "@/public-search-adapters/mimo/generative-answer";
import type { PublicSearchAdapterIdentity } from "@/public-search-adapters/types";
import {
  createReportV4MimoDiagnosisProvider,
  createReportV4MimoQuestionAnswerProvider,
  createReportV4MimoStructuredInvoker,
  readReportV4MimoProviderConfig,
  type ReportV4StructuredInvoker
} from "@/report-v4/mimo-provider";
import { createReportV4MimoSiteSynthesisProvider } from "@/report-v4/mimo-site-synthesis-provider";
import {
  createReportV4OpenAiCompatibleStructuredInvoker,
  createReportV4SenseNovaDiagnosisProvider,
  createReportV4SenseNovaSiteSynthesisProvider,
  readSenseNovaConfig
} from "@/report-v4/openai-compatible-provider";
import {
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID,
  REPORT_V4_SENSENOVA_DEEPSEEK_V4_FLASH_PROFILE_ID,
  loadReportV4ModelRuntimeConfig,
  resolveReportV4LockedModelRuntime,
  type ReportV4ModelRuntimeConfig
} from "@/report-v4/model-runtime-config";
import type { ReportV4MimoSiteSynthesisProvider } from "@/report-v4/mimo-site-synthesis-provider";
import type { ReportV4DiagnosisProvider } from "@/worker/report-v4-diagnosis-enhancer";
import type { ReportV4QuestionAnswerProvider } from "@/worker/report-v4-question-answerer";

export const PROVIDER_PROFILE_IDS = Object.freeze(["mimo_native", "sensenova_anysearch"] as const);
export type ProviderProfileId = (typeof PROVIDER_PROFILE_IDS)[number];
export type ProviderProfileAdapterId = "mimo" | "anysearch";

export type ProviderProfileRuntimeErrorCode =
  | "provider_profile_missing"
  | "provider_profile_unsupported"
  | "provider_profile_conflict"
  | "provider_profile_incomplete"
  | "provider_profile_not_prepared";

export class ProviderProfileRuntimeError extends Error {
  constructor(readonly code: ProviderProfileRuntimeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ProviderProfileRuntimeError";
  }
}

export interface ProviderProfilePublicSearchRuntime {
  readonly adapter: PublicSearchSurfaceAdapter;
  readonly authority: PublicSearchSurfaceAuthority;
  readonly identity: PublicSearchAdapterIdentity;
}

export interface ProviderProfileRuntimeSummary {
  readonly profileId: ProviderProfileId;
  readonly modelProfileId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly publicSearchAdapterId: ProviderProfileAdapterId;
}

export interface ProviderProfileRuntime {
  readonly profileId: ProviderProfileId;
  readonly modelRuntime: ReportV4ModelRuntimeConfig;
  readonly generalClient: JsonCompletionClient;
  readonly publicSearchAdapterId: ProviderProfileAdapterId;
  readonly summary: ProviderProfileRuntimeSummary;
  readonly createStructuredInvoker: (lockedRuntime?: ReportV4ModelRuntimeConfig) => ReportV4StructuredInvoker;
  readonly createSiteSynthesisProvider: (lockedRuntime?: ReportV4ModelRuntimeConfig) => ReportV4MimoSiteSynthesisProvider;
  readonly createQuestionAnswerProvider: (input: {
    readonly locale: string;
    readonly region: string;
    readonly lockedRuntime?: ReportV4ModelRuntimeConfig;
  }) => ReportV4QuestionAnswerProvider & GenerativeSearchAnswerProvider;
  readonly createDiagnosisProvider: (lockedRuntime?: ReportV4ModelRuntimeConfig) => ReportV4DiagnosisProvider;
}

export interface PreparedProviderProfileRuntime extends ProviderProfileRuntime {
  readonly publicSearchRuntime: ProviderProfilePublicSearchRuntime;
}

export interface ResolveProviderProfileRuntimeDependencies {
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
}

let preparedRuntime: PreparedProviderProfileRuntime | undefined;

export function resolveProviderProfileId(environment: NodeJS.ProcessEnv): ProviderProfileId {
  const value = environment.OGC_PROVIDER_PROFILE;
  if (!value) {
    throw new ProviderProfileRuntimeError("provider_profile_missing", "OGC_PROVIDER_PROFILE is required; no default is allowed.");
  }
  if (value !== "mimo_native" && value !== "sensenova_anysearch") {
    throw new ProviderProfileRuntimeError("provider_profile_unsupported", "OGC_PROVIDER_PROFILE is unsupported; no fallback is allowed.");
  }
  return value;
}

export function publicSearchAdapterIdForProviderProfile(profileId: ProviderProfileId): ProviderProfileAdapterId {
  return profileId === "mimo_native" ? "mimo" : "anysearch";
}

export function resolveProviderProfileRuntime(
  environment: NodeJS.ProcessEnv,
  dependencies: ResolveProviderProfileRuntimeDependencies = {}
): ProviderProfileRuntime {
  try {
    const profileId = resolveProviderProfileId(environment);
    assertLegacyCompatibility(environment, profileId);
    const modelRuntime = loadReportV4ModelRuntimeConfig(environment);
    const locale = required(environment.OGC_PUBLIC_SEARCH_LOCALE, "OGC_PUBLIC_SEARCH_LOCALE");
    const region = required(environment.OGC_PUBLIC_SEARCH_REGION, "OGC_PUBLIC_SEARCH_REGION");
    if (environment.OGC_PUBLIC_SEARCH_RUNTIME_ENABLED !== "true") {
      throw new ProviderProfileRuntimeError("provider_profile_incomplete", "The selected provider profile requires enabled public search.");
    }
    return profileId === "mimo_native"
      ? createMiMoRuntime(environment, modelRuntime, locale, region, dependencies)
      : createSenseNovaRuntime(environment, modelRuntime, locale, region, dependencies);
  } catch (error) {
    if (error instanceof ProviderProfileRuntimeError) throw error;
    throw new ProviderProfileRuntimeError(
      "provider_profile_incomplete",
      "The selected provider profile is incomplete or incompatible.",
      { cause: error }
    );
  }
}

export function prepareProviderProfileRuntime(
  runtime: ProviderProfileRuntime,
  publicSearchRuntime: ProviderProfilePublicSearchRuntime
): PreparedProviderProfileRuntime {
  if (runtime.publicSearchAdapterId !== publicSearchRuntime.identity.adapterId
      || publicSearchRuntime.authority.active !== true) {
    throw new ProviderProfileRuntimeError(
      "provider_profile_conflict",
      "The active public-search authority conflicts with the selected provider profile."
    );
  }
  return Object.freeze({ ...runtime, publicSearchRuntime });
}

export function publishPreparedProviderProfileRuntime(runtime: PreparedProviderProfileRuntime): void {
  if (preparedRuntime && preparedRuntime !== runtime) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "A different provider profile is already prepared in this Worker.");
  }
  preparedRuntime = runtime;
}

export function getPreparedProviderProfileRuntime(): PreparedProviderProfileRuntime {
  if (!preparedRuntime) {
    throw new ProviderProfileRuntimeError("provider_profile_not_prepared", "The Worker provider profile was not prepared before use.");
  }
  return preparedRuntime;
}

export function clearPreparedProviderProfileRuntimeForTest(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "Prepared provider runtime reset is test-only.");
  }
  preparedRuntime = undefined;
}

function createMiMoRuntime(
  environment: NodeJS.ProcessEnv,
  modelRuntime: ReportV4ModelRuntimeConfig,
  locale: string,
  region: string,
  dependencies: ResolveProviderProfileRuntimeDependencies
): ProviderProfileRuntime {
  if (modelRuntime.modelProfile.profileId !== REPORT_V4_MIMO_V25_PRO_PROFILE_ID) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "The MiMo profile resolved an incompatible V4 model profile.");
  }
  const config = readReportV4MimoProviderConfig(environment);
  const publicConfig = readMiMoPublicSearchConfig(environment, locale, region);
  if (publicConfig.model !== modelRuntime.modelProfile.operations.questionAnswer.model) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "The MiMo report and public-search model identities do not match.");
  }
  const generalClient = createOpenAiCompatibleClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: modelRuntime.modelProfile.operations.pageAnalysis.model,
    timeoutMs: generalClientTimeoutMs(modelRuntime),
    fetch: dependencies.fetch,
    useJsonResponseFormat: true
  });
  const locked = (value?: ReportV4ModelRuntimeConfig) => assertLockedRuntime(modelRuntime, value);
  const runtime: ProviderProfileRuntime = {
    profileId: "mimo_native",
    modelRuntime,
    generalClient,
    publicSearchAdapterId: "mimo",
    summary: summary("mimo_native", modelRuntime, "mimo"),
    createStructuredInvoker: (value) => createReportV4MimoStructuredInvoker({
      environment, lockedRuntime: locked(value), fetch: dependencies.fetch, now: dependencies.now
    }),
    createSiteSynthesisProvider: (value) => createReportV4MimoSiteSynthesisProvider({
      environment, lockedRuntime: locked(value), fetch: dependencies.fetch, now: dependencies.now
    }),
    createQuestionAnswerProvider: ({ locale: requestedLocale, region: requestedRegion, lockedRuntime }) => {
      locked(lockedRuntime);
      if (requestedLocale !== locale || requestedRegion !== region) {
        throw new ProviderProfileRuntimeError("provider_profile_conflict", "The question locale or region conflicts with the prepared MiMo profile.");
      }
      return createReportV4MimoQuestionAnswerProvider({
        environment, lockedRuntime: modelRuntime, fetch: dependencies.fetch, now: dependencies.now
      }) as ReportV4QuestionAnswerProvider & GenerativeSearchAnswerProvider;
    },
    createDiagnosisProvider: (value) => createReportV4MimoDiagnosisProvider({
      environment, lockedRuntime: locked(value), fetch: dependencies.fetch, now: dependencies.now
    })
  };
  resolveMiMoGenerativeSearchAnswerProvider(environment, { locale, region }, dependencies);
  return Object.freeze(runtime);
}

function createSenseNovaRuntime(
  environment: NodeJS.ProcessEnv,
  modelRuntime: ReportV4ModelRuntimeConfig,
  locale: string,
  region: string,
  dependencies: ResolveProviderProfileRuntimeDependencies
): ProviderProfileRuntime {
  if (modelRuntime.modelProfile.profileId !== REPORT_V4_SENSENOVA_DEEPSEEK_V4_FLASH_PROFILE_ID) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "The SenseNova profile resolved an incompatible V4 model profile.");
  }
  const config = readSenseNovaConfig(environment);
  readAnySearchPublicSearchConfig(environment, locale, region);
  const generalClient = createOpenAiCompatibleClient({
    ...config,
    model: modelRuntime.modelProfile.operations.pageAnalysis.model,
    timeoutMs: generalClientTimeoutMs(modelRuntime),
    fetch: dependencies.fetch,
    useJsonResponseFormat: true
  });
  const locked = (value?: ReportV4ModelRuntimeConfig) => assertLockedRuntime(modelRuntime, value);
  const runtime: ProviderProfileRuntime = {
    profileId: "sensenova_anysearch",
    modelRuntime,
    generalClient,
    publicSearchAdapterId: "anysearch",
    summary: summary("sensenova_anysearch", modelRuntime, "anysearch"),
    createStructuredInvoker: (value) => createReportV4OpenAiCompatibleStructuredInvoker({
      environment, runtime: locked(value), fetch: dependencies.fetch
    }),
    createSiteSynthesisProvider: (value) => createReportV4SenseNovaSiteSynthesisProvider({
      environment, runtime: locked(value), fetch: dependencies.fetch
    }),
    createQuestionAnswerProvider: ({ locale: requestedLocale, region: requestedRegion, lockedRuntime }) => {
      locked(lockedRuntime);
      if (requestedLocale !== locale || requestedRegion !== region) {
        throw new ProviderProfileRuntimeError("provider_profile_conflict", "The question locale or region conflicts with the prepared SenseNova profile.");
      }
      return resolveAnySearchGenerativeSearchAnswerProvider(
        environment,
        { locale, region },
        { ...dependencies, client: generalClient }
      ) as ReportV4QuestionAnswerProvider & GenerativeSearchAnswerProvider;
    },
    createDiagnosisProvider: (value) => createReportV4SenseNovaDiagnosisProvider({
      environment, runtime: locked(value), fetch: dependencies.fetch
    })
  };
  resolveAnySearchGenerativeSearchAnswerProvider(environment, { locale, region }, { ...dependencies, client: generalClient });
  return Object.freeze(runtime);
}

function generalClientTimeoutMs(runtime: ReportV4ModelRuntimeConfig): number {
  // generalClient serves every profile operation; cover the slowest declared one.
  return Math.max(...Object.values(runtime.modelProfile.operations).map((operation) => operation.timeoutMs));
}

function assertLockedRuntime(
  expected: ReportV4ModelRuntimeConfig,
  value?: ReportV4ModelRuntimeConfig
): ReportV4ModelRuntimeConfig {
  const runtime = value ?? expected;
  const approved = resolveReportV4LockedModelRuntime(runtime.modelProfile);
  if (runtime !== approved || approved !== expected) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "The locked report model profile conflicts with the running provider profile.");
  }
  return runtime;
}

function assertLegacyCompatibility(environment: NodeJS.ProcessEnv, profileId: ProviderProfileId): void {
  const expectedAdapter = publicSearchAdapterIdForProviderProfile(profileId);
  const legacyAdapter = environment.OGC_PUBLIC_SEARCH_ADAPTER;
  if (legacyAdapter !== undefined && legacyAdapter !== expectedAdapter) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "OGC_PUBLIC_SEARCH_ADAPTER conflicts with OGC_PROVIDER_PROFILE.");
  }
  if (profileId === "sensenova_anysearch"
      && (environment.OGC_REPORT_V4_MIMO_BASE_URL?.trim() || environment.OGC_REPORT_V4_MIMO_API_KEY?.trim())) {
    throw new ProviderProfileRuntimeError("provider_profile_conflict", "Stale MiMo V4 routing values conflict with OGC_PROVIDER_PROFILE.");
  }
}

function summary(
  profileId: ProviderProfileId,
  runtime: ReportV4ModelRuntimeConfig,
  adapterId: ProviderProfileAdapterId
): ProviderProfileRuntimeSummary {
  const operation = runtime.modelProfile.operations.pageAnalysis;
  return Object.freeze({
    profileId,
    modelProfileId: runtime.modelProfile.profileId,
    providerId: runtime.modelProfile.provider,
    modelId: operation.model,
    publicSearchAdapterId: adapterId
  });
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim() || value !== value.trim()) {
    throw new ProviderProfileRuntimeError("provider_profile_incomplete", `${name} is required by the selected provider profile.`);
  }
  return value;
}

export function resolveProfileGenerativeAnswerProvider(input: {
  readonly runtime?: ProviderProfileRuntime;
  readonly locale: string;
  readonly region: string;
}): GenerativeSearchAnswerProvider {
  const runtime = input.runtime ?? getPreparedProviderProfileRuntime();
  return runtime.createQuestionAnswerProvider(input) as GenerativeSearchAnswerProvider;
}

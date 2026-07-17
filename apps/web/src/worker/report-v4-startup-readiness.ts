import { MODEL_PROFILE_OPERATIONS, type ModelProfileOperation } from "@open-geo-console/ai-report-engine";
import {
  loadReportV4ModelRuntimeConfig,
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";
import {
  readReportV4MimoProviderConfig,
  type ReportV4MimoProviderConfig
} from "../report-v4/mimo-provider";

export interface ReportV4WorkerStartupReadinessDependencies {
  readonly loadModelRuntime: (environment: NodeJS.ProcessEnv) => ReportV4ModelRuntimeConfig;
  readonly readMimoProviderConfig: (environment: NodeJS.ProcessEnv) => ReportV4MimoProviderConfig;
}

const liveDependencies: ReportV4WorkerStartupReadinessDependencies = {
  loadModelRuntime: loadReportV4ModelRuntimeConfig,
  readMimoProviderConfig: readReportV4MimoProviderConfig
};

/**
 * Validates the dedicated V4 model boundary without retaining or returning its
 * credential. This must run before a Worker announces readiness or claims work.
 */
export function assertReportV4WorkerStartupReadiness(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: ReportV4WorkerStartupReadinessDependencies = liveDependencies
): void {
  const runtime = dependencies.loadModelRuntime(environment);
  assertLockedCapabilities(runtime);
  dependencies.readMimoProviderConfig(environment);
}

export async function prepareWorkerStartup(input: {
  readonly environment?: NodeJS.ProcessEnv;
  readonly ensureDatabase: () => Promise<void>;
  readonly validateReportV4Readiness?: (environment: NodeJS.ProcessEnv) => void;
}): Promise<void> {
  const environment = input.environment ?? process.env;
  (input.validateReportV4Readiness ?? assertReportV4WorkerStartupReadiness)(environment);
  await input.ensureDatabase();
}

function assertLockedCapabilities(runtime: ReportV4ModelRuntimeConfig): void {
  if (!runtime || typeof runtime !== "object" || !runtime.modelProfile || !runtime.resolvedProfile) {
    throw new Error("The locked Report V4 model runtime capability is missing.");
  }
  for (const operation of MODEL_PROFILE_OPERATIONS) assertOperation(runtime, operation);
}

function assertOperation(runtime: ReportV4ModelRuntimeConfig, operation: ModelProfileOperation): void {
  const locked = runtime.modelProfile.operations[operation];
  const resolved = runtime.resolvedProfile.operations[operation];
  if (!locked || !resolved || resolved.structuredOutput !== true || !resolved.endpointCapability?.trim()) {
    throw new Error(`The locked Report V4 ${operation} structured-output capability is unavailable.`);
  }
  const requiresPublicSearch = operation === "questionAnswer";
  if (resolved.nativeWebSearch !== requiresPublicSearch) {
    throw new Error(`The locked Report V4 ${operation} public-search capability has drifted.`);
  }
  const budgets = [resolved.contextWindowTokens, resolved.maxInputTokens, resolved.maxOutputTokens];
  if (!budgets.every((value) => Number.isSafeInteger(value) && value > 0)
      || resolved.maxInputTokens + resolved.maxOutputTokens > resolved.contextWindowTokens) {
    throw new Error(`The locked Report V4 ${operation} context or output budget capability is invalid.`);
  }
  if (resolved.model !== locked.model || resolved.contextWindowTokens !== locked.contextWindowTokens
      || resolved.maxInputTokens !== locked.maxInputTokens || resolved.maxOutputTokens !== locked.maxOutputTokens
      || resolved.timeoutMs !== locked.timeoutMs || resolved.nativeWebSearch !== locked.nativeWebSearch
      || resolved.structuredOutput !== locked.structuredOutput || resolved.tokenizer !== locked.tokenizer) {
    throw new Error(`The locked Report V4 ${operation} capability has drifted from its immutable model profile.`);
  }
}

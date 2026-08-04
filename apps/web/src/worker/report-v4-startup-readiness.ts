import { MODEL_PROFILE_OPERATIONS, type ModelProfileOperation } from "@open-geo-console/ai-report-engine";
import {
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";
import {
  prepareProviderProfileRuntime,
  publishPreparedProviderProfileRuntime,
  resolveProviderProfileRuntime,
  type PreparedProviderProfileRuntime,
  type ProviderProfileRuntime
} from "../provider-profile/runtime";
import { resolveProductionPublicSearchRuntime } from "../public-source-forensics/production-runtime";
import { getActivePublicSearchSurfaceAuthority } from "../db/public-search-authority";

export interface ReportV4WorkerStartupReadinessDependencies {
  readonly resolveProfileRuntime: (environment: NodeJS.ProcessEnv) => ProviderProfileRuntime;
}

const liveDependencies: ReportV4WorkerStartupReadinessDependencies = {
  resolveProfileRuntime: resolveProviderProfileRuntime
};

/**
 * Validates the dedicated V4 model boundary without retaining or returning its
 * credential. This must run before a Worker announces readiness or claims work.
 */
export function assertReportV4WorkerStartupReadiness(
  environment: NodeJS.ProcessEnv = process.env,
  dependencies: ReportV4WorkerStartupReadinessDependencies = liveDependencies
): void {
  const runtime = dependencies.resolveProfileRuntime(environment);
  assertLockedCapabilities(runtime.modelRuntime);
  assertCommercialTokenSecret(environment);
}

export async function prepareWorkerStartup(input: {
  readonly environment?: NodeJS.ProcessEnv;
  readonly ensureDatabase: () => Promise<void>;
  readonly validateReportV4Readiness?: (environment: NodeJS.ProcessEnv) => void;
  readonly resolveProfileRuntime?: (environment: NodeJS.ProcessEnv) => ProviderProfileRuntime;
  readonly resolvePublicSearchRuntime?: typeof resolveProductionPublicSearchRuntime;
  readonly publishRuntime?: (runtime: PreparedProviderProfileRuntime) => void;
  readonly delay?: (milliseconds: number) => Promise<void>;
}): Promise<PreparedProviderProfileRuntime> {
  const environment = input.environment ?? process.env;
  const profileRuntime = (input.resolveProfileRuntime ?? resolveProviderProfileRuntime)(environment);
  (input.validateReportV4Readiness ?? ((value) => {
    assertLockedCapabilities(profileRuntime.modelRuntime);
    assertCommercialTokenSecret(value);
  }))(environment);
  const delay = input.delay ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  let databasePrepared = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await input.ensureDatabase();
      databasePrepared = true;
      break;
    } catch (error) {
      lastError = error;
      if (!isTransientStartupDatabaseError(error)) throw error;
      if (attempt < 4) await delay(1000 * 2 ** attempt);
    }
  }
  if (!databasePrepared) throw lastError;
  const publicSearchRuntime = await (input.resolvePublicSearchRuntime ?? resolveProductionPublicSearchRuntime)({
    environment,
    getAuthority: getActivePublicSearchSurfaceAuthority
  });
  const prepared = prepareProviderProfileRuntime(profileRuntime, publicSearchRuntime);
  (input.publishRuntime ?? publishPreparedProviderProfileRuntime)(prepared);
  return prepared;
}

const TRANSIENT_STARTUP_DATABASE_CODES = new Set(["CONNECT_TIMEOUT", "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE"]);

function isTransientStartupDatabaseError(error: unknown): boolean {
  const seen = new Set<object>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object" && !seen.has(current); depth += 1) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && TRANSIENT_STARTUP_DATABASE_CODES.has(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function assertLockedCapabilities(runtime: ReportV4ModelRuntimeConfig): void {
  if (!runtime || typeof runtime !== "object" || !runtime.modelProfile || !runtime.resolvedProfile) {
    throw new Error("The locked Report V4 model runtime capability is missing.");
  }
  for (const operation of MODEL_PROFILE_OPERATIONS) assertOperation(runtime, operation);
}

function assertCommercialTokenSecret(environment: NodeJS.ProcessEnv): void {
  const tokenHashSecret = environment.OGC_TOKEN_HASH_SECRET?.trim();
  if (!tokenHashSecret || tokenHashSecret.length < 32) {
    throw new Error("OGC_TOKEN_HASH_SECRET key must be configured with at least 32 characters.");
  }
}

function assertOperation(runtime: ReportV4ModelRuntimeConfig, operation: ModelProfileOperation): void {
  const locked = runtime.modelProfile.operations[operation];
  const resolved = runtime.resolvedProfile.operations[operation];
  if (!locked || !resolved || resolved.structuredOutput !== true || !resolved.endpointCapability?.trim()) {
    throw new Error(`The locked Report V4 ${operation} structured-output capability is unavailable.`);
  }
  if (operation !== "questionAnswer" && resolved.nativeWebSearch) {
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

import {
  parseReportV4SiteSynthesisInput,
  runWithModelTokenBudget,
  type ReportV4PageSummary,
  type ReportV4WebsiteSynthesisOutput
} from "@open-geo-console/ai-report-engine";
import {
  buildReportV4WebsiteSynthesisInputAuthority,
  type WebsiteSynthesisCheckpoint,
  type WebsiteSynthesisLineage,
  type WebsiteSynthesisRepository
} from "../db/report-v4-website-synthesis-checkpoints";
import {
  buildReportV4MimoWebsiteSynthesisTokenBudget,
  createReportV4MimoSiteSynthesisProvider,
  type ReportV4MimoSiteSynthesisProvider
} from "../report-v4/mimo-site-synthesis-provider";
import {
  MIMO_CONTENT_FILTERED_CODE,
  MIMO_INVALID_RESPONSE_CODE,
  MIMO_OUTPUT_TRUNCATED_CODE,
  MIMO_TIMEOUT_CODE,
  ReportV4MimoProviderError
} from "../report-v4/mimo-provider";
import {
  resolveReportV4LockedModelRuntime,
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";

export const REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID = "websiteSynthesis" as const;

export class ReportV4WebsiteSynthesisUnavailableError extends Error {
  readonly providerCalls = 1 as const;

  constructor(cause: unknown) {
    super("The V4 website-synthesis provider was unavailable.", { cause });
    this.name = "ReportV4WebsiteSynthesisUnavailableError";
  }
}

export interface ReportV4WebsiteSynthesisProductionInput extends WebsiteSynthesisLineage {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly targetUrl: string;
  readonly locale: string;
  readonly pages: readonly ReportV4PageSummary[];
  readonly signal: AbortSignal;
}

export interface ReportV4WebsiteSynthesisProductionResult {
  readonly checkpoint: WebsiteSynthesisCheckpoint;
  readonly output: ReportV4WebsiteSynthesisOutput;
  readonly providerCalls: 0 | 1;
  readonly reused: boolean;
}

export interface ReportV4WebsiteSynthesisProductionDependencies {
  readonly environment: NodeJS.ProcessEnv;
  readonly lockedModelProfile: unknown;
  readonly repository: WebsiteSynthesisRepository;
  readonly fetch?: typeof globalThis.fetch;
  readonly provider?: Pick<ReportV4MimoSiteSynthesisProvider, "synthesizeWebsite">;
}

export function createReportV4WebsiteSynthesisProduction(
  dependencies: ReportV4WebsiteSynthesisProductionDependencies
) {
  const runtime = resolveReportV4LockedModelRuntime(dependencies.lockedModelProfile);
  const provider = dependencies.provider ?? createReportV4MimoSiteSynthesisProvider({
    environment: dependencies.environment,
    lockedRuntime: runtime,
    fetch: dependencies.fetch
  });
  return createRunner(dependencies.repository, provider, runtime);
}

function createRunner(
  repository: WebsiteSynthesisRepository,
  provider: Pick<ReportV4MimoSiteSynthesisProvider, "synthesizeWebsite">,
  runtime: ReportV4ModelRuntimeConfig
) {
  return async function run(
    input: ReportV4WebsiteSynthesisProductionInput
  ): Promise<ReportV4WebsiteSynthesisProductionResult> {
    input.signal.throwIfAborted();
    if (input.profileId !== runtime.modelProfile.profileId) {
      throw new Error("The V4 website-synthesis checkpoint profile has drifted from the locked model profile.");
    }
    if (input.operationId !== REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID) {
      throw new Error("The V4 website-synthesis checkpoint operation has drifted from websiteSynthesis.");
    }
    const providerInput = parseReportV4SiteSynthesisInput({
      targetUrl: input.targetUrl,
      locale: input.locale,
      pages: input.pages
    });
    const budget = buildReportV4MimoWebsiteSynthesisTokenBudget(runtime, providerInput);
    await runWithModelTokenBudget(budget, async () => undefined);
    input.signal.throwIfAborted();

    const lineage = exactLineage(input);
    const inputAuthority = buildReportV4WebsiteSynthesisInputAuthority({
      ...lineage,
      ...providerInput,
      modelProfile: runtime.modelProfile
    });
    const checkpointIdentity = Object.freeze({ ...lineage, ...inputAuthority });
    const initialized = await repository.initialize(checkpointIdentity);
    if (initialized.state === "completed") return completedResult(initialized, 0, true);
    input.signal.throwIfAborted();
    const claimed = await repository.claim({ ...checkpointIdentity, workerId: input.workerId, leaseMs: input.leaseMs });
    if (claimed.state === "completed") return completedResult(claimed, 0, true);
    input.signal.throwIfAborted();
    await repository.beginProviderCall({ ...checkpointIdentity, workerId: input.workerId });

    let output: ReportV4WebsiteSynthesisOutput;
    try {
      output = await provider.synthesizeWebsite(providerInput, input.signal);
    } catch (error) {
      if (input.signal.aborted) throw error;
      await repository.fail({ ...checkpointIdentity, workerId: input.workerId, errorCode: boundedErrorCode(error) });
      if (isWebsiteSynthesisProviderFailure(error)) {
        throw new ReportV4WebsiteSynthesisUnavailableError(error);
      }
      throw error;
    }
    input.signal.throwIfAborted();
    const completed = await repository.complete({ ...checkpointIdentity, workerId: input.workerId, output });
    return completedResult(completed, 1, false);
  };
}

function isWebsiteSynthesisProviderFailure(error: unknown): boolean {
  if (!(error instanceof ReportV4MimoProviderError)) return false;
  return error.code === "transport"
    || error.code === "rate_limited"
    || error.code === "temporary_provider"
    || error.code === MIMO_INVALID_RESPONSE_CODE
    || error.code === MIMO_OUTPUT_TRUNCATED_CODE
    || error.code === MIMO_CONTENT_FILTERED_CODE
    || error.code === MIMO_TIMEOUT_CODE;
}

function exactLineage(input: ReportV4WebsiteSynthesisProductionInput): WebsiteSynthesisLineage {
  return Object.freeze({
    reportId: input.reportId,
    orderId: input.orderId,
    coreJobId: input.coreJobId,
    configSnapshotId: input.configSnapshotId,
    siteSnapshotId: input.siteSnapshotId,
    operationId: input.operationId,
    profileId: input.profileId
  });
}

function completedResult(
  checkpoint: WebsiteSynthesisCheckpoint,
  providerCalls: 0 | 1,
  reused: boolean
): ReportV4WebsiteSynthesisProductionResult {
  if (checkpoint.state !== "completed" || !checkpoint.output) {
    throw new Error("The V4 website-synthesis completion checkpoint is invalid.");
  }
  return Object.freeze({ checkpoint, output: checkpoint.output, providerCalls, reused });
}

function boundedErrorCode(error: unknown): string {
  const candidate = error && typeof error === "object" && "code" in error
    ? String((error as { readonly code?: unknown }).code)
    : "provider_error";
  const safe = candidate.toLowerCase().replace(/[^a-z0-9_-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 160);
  return `website_synthesis_${safe || "provider_error"}`;
}

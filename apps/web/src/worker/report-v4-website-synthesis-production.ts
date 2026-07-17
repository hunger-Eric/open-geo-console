import {
  runWithModelTokenBudget,
  type ReportV4PageSummary,
  type ReportV4WebsiteSynthesisOutput
} from "@open-geo-console/ai-report-engine";
import {
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
  resolveReportV4LockedModelRuntime,
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";

export const REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID = "websiteSynthesis" as const;

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
    const providerInput = { targetUrl: input.targetUrl, locale: input.locale, pages: input.pages };
    const budget = buildReportV4MimoWebsiteSynthesisTokenBudget(runtime, providerInput);
    await runWithModelTokenBudget(budget, async () => undefined);
    input.signal.throwIfAborted();

    const lineage = exactLineage(input);
    const initialized = await repository.initialize(lineage);
    if (initialized.state === "completed") return completedResult(initialized, 0, true);
    input.signal.throwIfAborted();
    const claimed = await repository.claim({ ...lineage, workerId: input.workerId, leaseMs: input.leaseMs });
    if (claimed.state === "completed") return completedResult(claimed, 0, true);
    input.signal.throwIfAborted();
    await repository.beginProviderCall({ ...lineage, workerId: input.workerId });

    try {
      const output = await provider.synthesizeWebsite(providerInput, input.signal);
      input.signal.throwIfAborted();
      const completed = await repository.complete({ ...lineage, workerId: input.workerId, output });
      return completedResult(completed, 1, false);
    } catch (error) {
      if (input.signal.aborted) throw error;
      await repository.fail({ ...lineage, workerId: input.workerId, errorCode: boundedErrorCode(error) });
      throw error;
    }
  };
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

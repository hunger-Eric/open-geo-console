import { createHash } from "node:crypto";
import {
  activateReportV4CoreRevision,
  createPostgresReportV4ArtifactRevisionExecutor,
  prepareReportV4CoreGeneration
} from "../db/report-v4-artifact-revisions";
import {
  createPostgresReportV4ArtifactPersistenceStore,
  getReportV4ArtifactPayload,
  persistReportV4ArtifactPayload
} from "../db/report-v4-artifact-persistence";
import type { ReportV4ConfigSnapshotRow } from "../db/report-v4-config-snapshots";
import { createReportV4ConfigSnapshotRepository } from "../db/report-v4-config-snapshots";
import {
  createReportV4ProductionJobRepository,
  type ReportV4PaidCoreContext,
  type ReportV4Locale
} from "../db/report-v4-production-jobs";
import {
  createReportV4PageSummaryRepository,
  loadReportV4PageSummariesForWebsiteSynthesis
} from "../db/report-v4-page-summaries";
import {
  createReportV4QuestionCheckpointRepository,
  type ReportV4QuestionCheckpointSqlExecutor
} from "../db/report-v4-question-checkpoints";
import { createPostgresReportV4WebsiteSynthesisCheckpointRepository } from "../db/report-v4-website-synthesis-checkpoints";
import { resolvePaidReportV4SiteSnapshot } from "../db/report-v4-site-snapshots";
import { ensureDatabase, getSqlClient } from "../db";
import {
  terminalizePaidReportV4Core,
  terminalizeUnavailablePaidReportV4Core,
  enqueuePaidReportV4DiagnosisEnhancement
} from "../db/public-source-commerce";
import {
  buildReportV4MimoQuestionTokenBudget,
  createReportV4MimoQuestionAnswerProvider
} from "../report-v4/mimo-provider";
import {
  buildReportV4MimoPageAnalysisTokenBudget,
  buildReportV4MimoWebsiteSynthesisTokenBudget,
  createReportV4MimoSiteSynthesisProvider
} from "../report-v4/mimo-site-synthesis-provider";
import {
  resolveReportV4LockedModelRuntime,
  type ReportV4ModelRuntimeConfig
} from "../report-v4/model-runtime-config";
import {
  loadReportV4ReportRuntimeConfig,
  type ReportV4ReportRuntimeConfig
} from "../report-v4/report-runtime-config";
import { renderReportV4Html } from "../report/report-v4-html";
import {
  createReportV4ProductionPageAnalysis
} from "./report-v4-page-analysis-production";
import {
  answerReportV4Questions,
  ReportV4QuestionProviderError,
  type ReportV4QuestionAnswerProvider
} from "./report-v4-question-answerer";
import { StagingLiveDrillFaultError } from "./job-errors";
import type { StagingLiveDrill } from "./staging-live-drill";
import {
  createReportV4WebsiteSynthesisProduction,
  REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID
} from "./report-v4-website-synthesis-production";
import {
  runReportV4CoreStage,
  type ReportV4CoreStageDependencies,
  type ReportV4OrchestratorResult
} from "./report-v4-orchestrator";
import {
  createReportV4CoreAcceptanceRuntime,
  observeReportV4CoreWebsiteBudgetRejection,
  withReportV4CoreAcceptancePageProvider,
  withReportV4CoreAcceptanceQuestions,
  withReportV4CoreAcceptanceStageDependencies,
  withReportV4CoreAcceptanceWebsiteProvider,
  type ReportV4CoreAcceptanceRuntime
} from "./report-v4-core-acceptance";
import { runReportV4OversizedTokenAcceptanceProbe } from "./report-v4-oversized-token-acceptance-probe";

export interface ReportV4CoreProductionInput {
  readonly reportId: string;
  readonly orderId: string;
  readonly coreJobId: string;
  readonly configSnapshotId: string;
  readonly siteSnapshotId: string;
  readonly questionSetId: string;
  readonly locale: ReportV4Locale;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly signal: AbortSignal;
}

export interface ReportV4ClaimedCoreProductionInput {
  readonly coreJobId: string;
  readonly workerId: string;
  readonly leaseMs: number;
  readonly signal: AbortSignal;
}

export interface ReportV4CoreProductionOptions {
  readonly environment: NodeJS.ProcessEnv;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly liveDrill?: StagingLiveDrill;
}

export interface ReportV4CoreProductionLockedConfiguration {
  readonly modelRuntime: ReportV4ModelRuntimeConfig;
  readonly reportRuntime: ReportV4ReportRuntimeConfig;
}

export interface ReportV4CoreProductionExecution extends ReportV4CoreProductionLockedConfiguration {
  readonly input: ReportV4CoreProductionInput;
  readonly context: ReportV4PaidCoreContext;
  readonly configSnapshot: ReportV4ConfigSnapshotRow;
  readonly coreArtifactRevisionId: string;
}

export interface ReportV4CoreProductionDependencies {
  readonly loadPaidCoreContext: (input: { readonly coreJobId: string }) => Promise<ReportV4PaidCoreContext>;
  readonly loadConfigSnapshot: (configSnapshotId: string) => Promise<ReportV4ConfigSnapshotRow | null>;
  readonly resolveLockedConfiguration: (input: {
    readonly context: ReportV4PaidCoreContext;
    readonly configSnapshot: ReportV4ConfigSnapshotRow;
    readonly locale: ReportV4Locale;
  }) => ReportV4CoreProductionLockedConfiguration;
  readonly loadAcceptanceRuntime?: (
    execution: ReportV4CoreProductionExecution
  ) => Promise<ReportV4CoreAcceptanceRuntime | null>;
  readonly runOversizedTokenAcceptanceProbe?: (
    execution: ReportV4CoreProductionExecution,
    acceptanceRuntime: ReportV4CoreAcceptanceRuntime
  ) => Promise<void>;
  readonly createCoreStageDependencies: (
    execution: ReportV4CoreProductionExecution,
    acceptanceRuntime?: ReportV4CoreAcceptanceRuntime | null
  ) => ReportV4CoreStageDependencies;
}

/**
 * Live production entry point for a core job already claimed by the worker.
 * All remaining lineage is loaded from PostgreSQL; processors never guess or
 * reconstruct order, snapshot, question-set, or configuration identities.
 */
export function createReportV4CoreProduction(options: ReportV4CoreProductionOptions) {
  const jobs = createReportV4ProductionJobRepository();
  const live = liveDependencies(options);
  return async function runClaimedCore(
    claimedValue: ReportV4ClaimedCoreProductionInput
  ): Promise<ReportV4OrchestratorResult> {
    const claimed = parseClaimedInput(claimedValue);
    claimed.signal.throwIfAborted();
    const context = await jobs.loadClaimedPaidCoreContext({
      coreJobId: claimed.coreJobId,
      workerId: claimed.workerId
    });
    claimed.signal.throwIfAborted();
    const input: ReportV4CoreProductionInput = {
      reportId: context.report.id,
      orderId: context.order.id,
      coreJobId: context.coreJob.id,
      configSnapshotId: context.config.id,
      siteSnapshotId: context.siteSnapshot.id,
      questionSetId: context.questionSet.id,
      locale: context.coreJob.locale as ReportV4Locale,
      workerId: claimed.workerId,
      leaseMs: claimed.leaseMs,
      signal: claimed.signal
    };
    return createReportV4CoreProductionWithDependencies({
      ...live,
      async loadPaidCoreContext(request) {
        if (request.coreJobId !== context.coreJob.id) {
          throw new Error("The claimed Report V4 core job changed during authoritative lineage loading.");
        }
        return context;
      }
    })(input);
  };
}

/**
 * Dependency-injected composition seam. The production factory below this
 * boundary owns all live Postgres and provider adapters; this seam exists so
 * exact ordering and fail-closed behavior remain deterministic in unit tests.
 */
export function createReportV4CoreProductionWithDependencies(
  dependencies: ReportV4CoreProductionDependencies
) {
  return async function run(inputValue: ReportV4CoreProductionInput): Promise<ReportV4OrchestratorResult> {
    const input = parseInput(inputValue);
    input.signal.throwIfAborted();

    const context = await dependencies.loadPaidCoreContext({ coreJobId: input.coreJobId });
    input.signal.throwIfAborted();
    assertClaimedContext(input, context);

    const configSnapshot = await dependencies.loadConfigSnapshot(input.configSnapshotId);
    input.signal.throwIfAborted();
    if (!configSnapshot) throw new Error("The exact locked Report V4 configuration snapshot is missing.");
    assertConfigLineage(context, configSnapshot);

    const locked = dependencies.resolveLockedConfiguration({ context, configSnapshot, locale: input.locale });
    input.signal.throwIfAborted();
    const coreArtifactRevisionId = buildReportV4CoreArtifactRevisionId(input);
    assertSettledRecoveryIdentity(context, coreArtifactRevisionId);

    const execution: ReportV4CoreProductionExecution = Object.freeze({
      input,
      context,
      configSnapshot,
      coreArtifactRevisionId,
      ...locked
    });
    const acceptanceRuntime = dependencies.loadAcceptanceRuntime
      ? await dependencies.loadAcceptanceRuntime(execution)
      : null;
    input.signal.throwIfAborted();
    if (acceptanceRuntime) {
      if (!dependencies.runOversizedTokenAcceptanceProbe) {
        throw new Error("The protected Report V4 Core acceptance runtime requires the oversized-token probe boundary.");
      }
      await dependencies.runOversizedTokenAcceptanceProbe(execution, acceptanceRuntime);
      input.signal.throwIfAborted();
    }
    const questions = [...context.questions]
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((question, index) => ({
        order: (index + 1) as 1 | 2 | 3,
        questionId: question.id,
        questionText: question.privateText!
      })) as [
        { order: 1; questionId: string; questionText: string },
        { order: 2; questionId: string; questionText: string },
        { order: 3; questionId: string; questionText: string }
      ];

    const stageDependencies = dependencies.createCoreStageDependencies(execution, acceptanceRuntime);
    const observedStageDependencies = withReportV4CoreAcceptanceStageDependencies({
      dependencies: stageDependencies,
      runtime: acceptanceRuntime,
      coreArtifactRevisionId
    });
    const guardedStageDependencies: ReportV4CoreStageDependencies = {
      ...observedStageDependencies,
      async resolveSnapshot(snapshotInput) {
        const snapshot = await observedStageDependencies.resolveSnapshot(snapshotInput);
        if (snapshot.snapshot.analyzablePageCount < 1) {
          throw new Error("A paid Report V4 production snapshot must contain at least one analyzable page; zero-page admission is upstream-only.");
        }
        return snapshot;
      }
    };

    return runReportV4CoreStage({
      reportId: input.reportId,
      orderId: input.orderId,
      coreJobId: input.coreJobId,
      configSnapshotId: input.configSnapshotId,
      questionSetId: input.questionSetId,
      coreArtifactRevisionId,
      targetUrl: context.targetUrl,
      locale: input.locale,
      snapshotIdentity: {
        id: context.siteSnapshot.id,
        reportId: context.report.id,
        siteKey: context.siteSnapshot.siteKey,
        collectorConfigIdentityHash: context.siteSnapshot.collectorConfigIdentityHash,
        contentIdentityHash: context.siteSnapshot.contentIdentityHash!
      },
      questions,
      signal: input.signal
    }, guardedStageDependencies);
  };
}

function liveDependencies(options: ReportV4CoreProductionOptions): ReportV4CoreProductionDependencies {
  const configSnapshots = createReportV4ConfigSnapshotRepository();
  const revisions = createPostgresReportV4ArtifactRevisionExecutor();
  const artifacts = createPostgresReportV4ArtifactPersistenceStore();
  const pageSummaries = createReportV4PageSummaryRepository();
  const websiteCheckpoints = createPostgresReportV4WebsiteSynthesisCheckpointRepository();
  const questionCheckpoints = createReportV4QuestionCheckpointRepository(liveQuestionCheckpointExecutor());
  const now = options.now ?? (() => new Date());

  return {
    loadPaidCoreContext: (input) => createReportV4ProductionJobRepository().loadPaidCoreContext(input),
    loadConfigSnapshot: (id) => configSnapshots.getById(id),
    resolveLockedConfiguration({ context, configSnapshot, locale }) {
      const modelRuntime = resolveReportV4LockedModelRuntime(configSnapshot.modelProfile);
      const reportRuntime = loadReportV4ReportRuntimeConfig(locale);
      if (modelRuntime.modelProfile.profileId !== configSnapshot.modelProfileId
        || hashStable(modelRuntime.modelProfile) !== configSnapshot.modelProfileHash
        || reportRuntime.reportProfile.profileId !== configSnapshot.reportProfileId
        || hashStable(reportRuntime.reportProfile) !== configSnapshot.reportProfileHash
        || stableJson(reportRuntime.reportProfile) !== stableJson(configSnapshot.reportProfile)
        || context.config.modelProfileId !== modelRuntime.modelProfile.profileId
        || context.config.reportProfileId !== reportRuntime.reportProfile.profileId) {
        throw new Error("The locked Report V4 model or report runtime has drifted from the paid configuration snapshot.");
      }
      return { modelRuntime, reportRuntime };
    },
    loadAcceptanceRuntime(execution) {
      return createReportV4CoreAcceptanceRuntime({
        environment: options.environment,
        coreJobId: execution.input.coreJobId
      });
    },
    async runOversizedTokenAcceptanceProbe(execution, acceptanceRuntime) {
      await runReportV4OversizedTokenAcceptanceProbe({
        modelRuntime: execution.modelRuntime,
        acceptanceRuntime,
        signal: execution.input.signal
      });
    },
    createCoreStageDependencies(execution, acceptanceRuntime = null) {
      return {
        nowMs: () => now().getTime(),
        nowIso: () => now().toISOString(),
        async loadCoreArtifact({ coreArtifactRevisionId, signal }) {
          signal?.throwIfAborted();
          const persisted = await getReportV4ArtifactPayload(coreArtifactRevisionId, artifacts);
          signal?.throwIfAborted();
          if (!persisted) return null;
          return {
            report: persisted.report,
            payloadIdentityHash: persisted.payloadIdentityHash,
            htmlSha256: persisted.htmlSha256
          };
        },
        async resolveSnapshot({ identity, signal }) {
          signal?.throwIfAborted();
          const snapshot = await resolvePaidReportV4SiteSnapshot(identity);
          signal?.throwIfAborted();
          return snapshot;
        },
        async synthesizeWebsite({ snapshot, signal }) {
          const activeSignal = signal ?? execution.input.signal;
          activeSignal.throwIfAborted();
          const basePageProvider = createReportV4MimoSiteSynthesisProvider(providerDependencies(options, execution.modelRuntime));
          const provider = withReportV4CoreAcceptancePageProvider({
            provider: basePageProvider,
            runtime: acceptanceRuntime,
            tokenBudget: (providerInput) => buildReportV4MimoPageAnalysisTokenBudget(
              execution.modelRuntime,
              providerInput
            )
          });
          const analyzePage = createReportV4ProductionPageAnalysis({ repository: pageSummaries, provider });
          const pageResults = await Promise.all(snapshot.pages.filter(({ analyzable }) => analyzable).map((page) => {
            if (!page.readMode || !page.contentHash || !page.retainedText) {
              throw new Error("An analyzable paid Report V4 page is missing retained immutable content.");
            }
            return analyzePage({
              reportId: execution.input.reportId,
              siteSnapshotId: execution.input.siteSnapshotId,
              pageId: page.id,
              url: page.normalizedUrl,
              contentHash: page.contentHash,
              readability: page.readMode,
              sourceLength: page.retainedText.length,
              retainedText: page.retainedText,
              snapshotContentIdentityHash: snapshot.snapshot.contentIdentityHash!,
              signal: activeSignal
            });
          }));
          activeSignal.throwIfAborted();
          const pages = await loadReportV4PageSummariesForWebsiteSynthesis({
            reportId: execution.input.reportId,
            snapshotId: execution.input.siteSnapshotId,
            contentIdentityHash: snapshot.snapshot.contentIdentityHash!
          }, pageSummaries);
          activeSignal.throwIfAborted();
          const websiteProviderInput = {
            targetUrl: execution.context.targetUrl,
            locale: execution.input.locale,
            pages
          };
          let acceptanceWebsiteProvider;
          if (acceptanceRuntime) {
            const websiteBudget = buildReportV4MimoWebsiteSynthesisTokenBudget(
              execution.modelRuntime,
              websiteProviderInput
            );
            await observeReportV4CoreWebsiteBudgetRejection({
              runtime: acceptanceRuntime,
              unitId: REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID,
              tokenBudget: websiteBudget
            });
            acceptanceWebsiteProvider = withReportV4CoreAcceptanceWebsiteProvider({
              provider: createReportV4MimoSiteSynthesisProvider(providerDependencies(options, execution.modelRuntime)),
              runtime: acceptanceRuntime,
              tokenBudget: (providerInput) => buildReportV4MimoWebsiteSynthesisTokenBudget(
                execution.modelRuntime,
                providerInput
              )
            });
          }
          const synthesize = createReportV4WebsiteSynthesisProduction({
            environment: options.environment,
            lockedModelProfile: execution.configSnapshot.modelProfile,
            repository: websiteCheckpoints,
            ...(options.fetch ? { fetch: options.fetch } : {}),
            ...(acceptanceWebsiteProvider ? { provider: acceptanceWebsiteProvider } : {})
          });
          const synthesis = await synthesize({
            reportId: execution.input.reportId,
            orderId: execution.input.orderId,
            coreJobId: execution.input.coreJobId,
            configSnapshotId: execution.input.configSnapshotId,
            siteSnapshotId: execution.input.siteSnapshotId,
            operationId: REPORT_V4_WEBSITE_SYNTHESIS_OPERATION_ID,
            profileId: execution.configSnapshot.modelProfileId,
            workerId: execution.input.workerId,
            leaseMs: execution.input.leaseMs,
            targetUrl: execution.context.targetUrl,
            locale: execution.input.locale,
            pages,
            signal: activeSignal
          });
          return {
            websiteSynthesis: synthesis.output,
            modelCalls: pageResults.reduce((total, result) => total + result.providerCalls, 0) + synthesis.providerCalls
          };
        },
        async answerQuestions({ questions, signal }) {
          const activeSignal = signal ?? execution.input.signal;
          activeSignal.throwIfAborted();
          const baseProvider = withReportV4QuestionFailureDrill({
            provider: createReportV4MimoQuestionAnswerProvider(providerDependencies(options, execution.modelRuntime)),
            coreJobId: execution.input.coreJobId,
            liveDrill: options.liveDrill
          });
          const callCounts = new Map<string, number>();
          const countedProvider: ReportV4QuestionAnswerProvider = {
            providerId: baseProvider.providerId,
            model: baseProvider.model,
            searchMode: baseProvider.searchMode,
            async answerWithSources(providerInput) {
              callCounts.set(providerInput.questionId, (callCounts.get(providerInput.questionId) ?? 0) + 1);
              return baseProvider.answerWithSources(providerInput);
            }
          };
          const questionSpecs = questions.map((question) => {
            const providerInput = {
              questionId: question.questionId,
              question: question.questionText,
              locale: execution.input.locale,
              region: execution.context.questionSet.region,
              signal: activeSignal
            };
            return {
              order: question.order,
              questionId: question.questionId,
              question: question.questionText,
              tokenBudget: buildReportV4MimoQuestionTokenBudget({ runtime: execution.modelRuntime, input: providerInput })
            };
          });
          const acceptanceQuestions = withReportV4CoreAcceptanceQuestions({
            repository: questionCheckpoints,
            provider: countedProvider,
            runtime: acceptanceRuntime,
            coreJobId: execution.input.coreJobId,
            questions: questionSpecs
          });
          const result = await answerReportV4Questions({
            reportId: execution.input.reportId,
            jobId: execution.input.coreJobId,
            questionSetId: execution.input.questionSetId,
            snapshotId: execution.input.siteSnapshotId,
            modelConfigIdentityHash: execution.configSnapshot.modelProfileHash,
            locale: execution.input.locale,
            region: execution.context.questionSet.region,
            questions: questionSpecs,
            repository: acceptanceQuestions.repository,
            provider: acceptanceQuestions.provider,
            signal: activeSignal
          });
          const modelCalls = [...callCounts.values()].reduce((total, count) => total + count, 0);
          const providerRetries = [...callCounts.values()].reduce((total, count) => total + Math.max(0, count - 1), 0);
          return { ...result, modelCalls, providerRetries };
        },
        prepareCoreRevision: (input, signal) => {
          signal?.throwIfAborted();
          return prepareReportV4CoreGeneration(input, revisions);
        },
        renderCoreHtml: ({ report, signal }) => renderReportV4Html({ stage: "core", report, signal }),
        async persistCoreArtifact({ report, html, signal }) {
          signal?.throwIfAborted();
          const persisted = await persistReportV4ArtifactPayload({
            report,
            canonicalHtml: html,
            artifactRevisionId: execution.coreArtifactRevisionId,
            reportId: execution.input.reportId,
            orderId: execution.input.orderId,
            jobId: execution.input.coreJobId,
            coreJobId: execution.input.coreJobId,
            questionSetId: execution.input.questionSetId,
            configSnapshotId: execution.input.configSnapshotId,
            siteSnapshotId: execution.input.siteSnapshotId,
            revisionKind: "generation",
            sourceArtifactRevisionId: null
          }, artifacts);
          signal?.throwIfAborted();
          return { payloadIdentityHash: persisted.payloadIdentityHash, htmlSha256: persisted.htmlSha256 };
        },
        activateCoreRevision: (input, signal) => {
          signal?.throwIfAborted();
          return activateReportV4CoreRevision(input, revisions);
        },
        async terminalizeUnavailableCore({ signal }) {
          signal?.throwIfAborted();
          return terminalizeUnavailablePaidReportV4Core({
            reportId: execution.input.reportId,
            coreJobId: execution.input.coreJobId,
            orderId: execution.input.orderId,
            siteSnapshotId: execution.input.siteSnapshotId,
            questionSetId: execution.input.questionSetId,
            configSnapshotId: execution.input.configSnapshotId,
            locale: execution.input.locale,
            workerId: execution.input.workerId
          });
        },
        async terminalizeCoreCommercial({ report, signal }) {
          signal?.throwIfAborted();
          return terminalizePaidReportV4Core({ report, workerId: execution.input.workerId });
        },
        async enqueueDiagnosisEnhancement({ reportId, orderId, coreJobId, configSnapshotId, siteSnapshotId, questionSetId, locale, signal }) {
          signal?.throwIfAborted();
          return enqueuePaidReportV4DiagnosisEnhancement({ reportId, orderId, coreJobId, configSnapshotId, siteSnapshotId, questionSetId, locale });
        }
      };
    }
  };
}

export function withReportV4QuestionFailureDrill(input: {
  readonly provider: ReportV4QuestionAnswerProvider;
  readonly coreJobId: string;
  readonly liveDrill?: StagingLiveDrill;
}): ReportV4QuestionAnswerProvider {
  if (!input.liveDrill) return input.provider;
  return {
    providerId: input.provider.providerId,
    model: input.provider.model,
    searchMode: input.provider.searchMode,
    async answerWithSources(providerInput) {
      try {
        input.liveDrill!.inject({
          jobId: input.coreJobId,
          fault: "question_failure",
          questionId: providerInput.questionId
        });
      } catch (error) {
        if (error instanceof StagingLiveDrillFaultError) {
          throw new ReportV4QuestionProviderError(
            "temporary_provider",
            "Protected staging injected a bounded Report V4 question provider failure.",
            { cause: error }
          );
        }
        throw error;
      }
      return input.provider.answerWithSources(providerInput);
    }
  };
}

function liveQuestionCheckpointExecutor(): ReportV4QuestionCheckpointSqlExecutor {
  return async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T[]> => {
    await ensureDatabase();
    const execute = getSqlClient() as unknown as ReportV4QuestionCheckpointSqlExecutor;
    return execute<T>(strings, ...values);
  };
}

function providerDependencies(
  options: ReportV4CoreProductionOptions,
  modelRuntime: ReportV4ModelRuntimeConfig
) {
  return {
    environment: options.environment,
    lockedRuntime: modelRuntime,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.now ? { now: options.now } : {})
  };
}

function parseClaimedInput(input: ReportV4ClaimedCoreProductionInput): ReportV4ClaimedCoreProductionInput {
  if (!input || typeof input !== "object") throw new TypeError("A claimed Report V4 core job is required.");
  if (!(input.signal instanceof AbortSignal)) throw new TypeError("A claimed Report V4 core abort signal is required.");
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 || input.leaseMs > 86_400_000) {
    throw new TypeError("Claimed Report V4 core leaseMs must be between 1 and 86400000.");
  }
  return Object.freeze({
    coreJobId: requiredText(input.coreJobId, "coreJobId"),
    workerId: requiredText(input.workerId, "workerId"),
    leaseMs: input.leaseMs,
    signal: input.signal
  });
}

export function buildReportV4CoreArtifactRevisionId(
  input: Pick<ReportV4CoreProductionInput,
    "reportId" | "orderId" | "coreJobId" | "configSnapshotId" | "siteSnapshotId" | "questionSetId" | "locale">
): string {
  const digest = createHash("sha256").update(stableJson({
    reportId: requiredText(input.reportId, "reportId"),
    orderId: requiredText(input.orderId, "orderId"),
    coreJobId: requiredText(input.coreJobId, "coreJobId"),
    configSnapshotId: requiredText(input.configSnapshotId, "configSnapshotId"),
    siteSnapshotId: requiredText(input.siteSnapshotId, "siteSnapshotId"),
    questionSetId: requiredText(input.questionSetId, "questionSetId"),
    locale: locale(input.locale)
  })).digest("hex");
  return `report-v4-core-${digest}`;
}

function parseInput(input: ReportV4CoreProductionInput): ReportV4CoreProductionInput {
  if (!input || typeof input !== "object") throw new TypeError("A claimed Report V4 core input is required.");
  if (!(input.signal instanceof AbortSignal)) throw new TypeError("A Report V4 core abort signal is required.");
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 || input.leaseMs > 86_400_000) {
    throw new TypeError("Report V4 core leaseMs must be between 1 and 86400000.");
  }
  return Object.freeze({
    reportId: requiredText(input.reportId, "reportId"),
    orderId: requiredText(input.orderId, "orderId"),
    coreJobId: requiredText(input.coreJobId, "coreJobId"),
    configSnapshotId: requiredText(input.configSnapshotId, "configSnapshotId"),
    siteSnapshotId: requiredText(input.siteSnapshotId, "siteSnapshotId"),
    questionSetId: requiredText(input.questionSetId, "questionSetId"),
    locale: locale(input.locale),
    workerId: requiredText(input.workerId, "workerId"),
    leaseMs: input.leaseMs,
    signal: input.signal
  });
}

function assertClaimedContext(input: ReportV4CoreProductionInput, context: ReportV4PaidCoreContext): void {
  if (context.report.id !== input.reportId || context.order.id !== input.orderId || context.coreJob.id !== input.coreJobId
    || context.config.id !== input.configSnapshotId || context.siteSnapshot.id !== input.siteSnapshotId
    || context.questionSet.id !== input.questionSetId || context.coreJob.locale !== input.locale
    || context.order.reportLocale !== input.locale || context.questionSet.locale !== input.locale) {
    throw new Error("The independently claimed Report V4 core lineage conflicts with its paid production context.");
  }
}

function assertConfigLineage(context: ReportV4PaidCoreContext, snapshot: ReportV4ConfigSnapshotRow): void {
  const expected = context.config;
  if (snapshot.id !== expected.id || snapshot.reportId !== context.report.id || snapshot.orderId !== context.order.id
    || snapshot.coreJobId !== context.coreJob.id || snapshot.identityHash !== expected.identityHash
    || snapshot.modelProfileId !== expected.modelProfileId || snapshot.modelProfileHash !== expected.modelProfileHash
    || snapshot.reportProfileId !== expected.reportProfileId || snapshot.reportProfileHash !== expected.reportProfileHash) {
    throw new Error("The locked Report V4 configuration lineage has drifted from the paid core context.");
  }
}

function assertSettledRecoveryIdentity(context: ReportV4PaidCoreContext, coreArtifactRevisionId: string): void {
  if ((context.commercePhase === "settled" || context.commercePhase === "reserved_active")
    && context.activeCoreArtifact?.id !== coreArtifactRevisionId) {
    throw new Error("The settled Report V4 core artifact conflicts with its deterministic revision identity.");
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 500) {
    throw new TypeError(`${field} must be non-empty bounded text.`);
  }
  return value.trim();
}

function locale(value: unknown): ReportV4Locale {
  if (value !== "en" && value !== "zh") throw new TypeError("Report V4 locale must be exact en or zh.");
  return value;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashStable(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

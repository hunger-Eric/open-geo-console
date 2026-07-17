import { createHash } from "node:crypto";
import {
  parseReportV4DiagnosisInput,
  type CombinedGeoReportV4Question,
  type ReportV4DiagnosisInput,
  type ReportV4DiagnosisTargetPage,
  type ReportV4PageSummary
} from "@open-geo-console/ai-report-engine";
import type { ScanJobRow } from "../db/schema";
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "../report-v4/report-v4-acceptance-fingerprints";
import {
  createReportV4ConfigSnapshotRepository,
  type ReportV4ConfigSnapshotRow
} from "../db/report-v4-config-snapshots";
import {
  activateReportV4DiagnosisEnhancement,
  createPostgresReportV4ArtifactRevisionExecutor,
  failReportV4DiagnosisEnhancement,
  prepareReportV4DiagnosisEnhancement
} from "../db/report-v4-artifact-revisions";
import {
  createPostgresReportV4ArtifactPersistenceStore,
  getReportV4ArtifactPayload,
  persistReportV4ArtifactPayload
} from "../db/report-v4-artifact-persistence";
import {
  createReportV4DiagnosisCheckpointRepository,
  type ReportV4DiagnosisCheckpoint,
  type ReportV4DiagnosisCheckpointRepository,
  type ReportV4DiagnosisSourceAudit
} from "../db/report-v4-diagnosis-checkpoints";
import { terminalizeReportV4EnhancementJob } from "../db/report-v4-enhancement-terminalization";
import {
  createReportV4PageSummaryRepository,
  loadReportV4PageSummariesForWebsiteSynthesis
} from "../db/report-v4-page-summaries";
import type {
  ReportV4PaidCoreContext,
  ReportV4ProductionEnhancementJob,
  ReportV4ProductionLineage
} from "../db/report-v4-production-jobs";
import { createReportV4ProductionJobRepository } from "../db/report-v4-production-jobs";
import { resolvePaidReportV4SiteSnapshot } from "../db/report-v4-site-snapshots";
import { createProductionReportV4AcceptanceSiteReadManifestRepository } from "../db/report-v4-site-read-manifest";
import {
  buildReportV4MimoDiagnosisTokenBudget,
  createReportV4MimoDiagnosisProvider
} from "../report-v4/mimo-provider";
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
  enhanceReportV4QuestionDiagnosis,
  ReportV4DiagnosisProviderError,
  type ReportV4DiagnosisProvider
} from "./report-v4-diagnosis-enhancer";
import { StagingLiveDrillFaultError } from "./job-errors";
import type { StagingLiveDrill } from "./staging-live-drill";
import { selectReportV4DiagnosisTargetPages } from "./report-v4-diagnosis-target-pages";
import {
  runReportV4EnhancementStage,
  type ReportV4EnhancementStageDependencies,
  type ReportV4EnhancementStageInput,
  type ReportV4OrchestratorSourceAuditResult,
  type ReportV4OrchestratorResult
} from "./report-v4-orchestrator";
import {
  createReportV4SourceAuditProductionDependencies,
  type ReportV4SourceAuditProductionOptions
} from "./report-v4-source-audit-production";
import { auditReportV4Sources } from "./report-v4-source-audit";
import type { ReportV4SourceAuditDependencies, ReportV4SourceAuditRead } from "./report-v4-source-audit";
import { createReportV4AcceptanceObserver } from "./report-v4-acceptance-observer";
import { createReportV4AcceptanceFaultController } from "./report-v4-acceptance-fault-controller";
import {
  observeReportV4EnhancementActivation,
  observeReportV4DiagnosisTerminalCheckpoint,
  observeReportV4EnhancementHtmlPersistence,
  observeReportV4RecoveredEnhancementActivation,
  withReportV4EnhancementAcceptanceDiagnosisProvider,
  withReportV4EnhancementAcceptanceSourceAudit,
  type ReportV4EnhancementAcceptanceRuntime
} from "./report-v4-enhancement-acceptance";

export type ClaimedReportV4EnhancementJob = Pick<ScanJobRow,
  "id" | "reportId" | "siteSnapshotId" | "tier" | "productContract" | "fulfillmentMethodology" |
  "recommendationReportVersion" | "artifactContract" | "businessQuestionSetId" | "locale" | "reason" |
  "stage" | "executionState" | "leaseOwner" | "leaseExpiresAt" | "creditReservationId" | "correctionId" |
  "replacementFulfillmentId"
>;

export interface RunReportV4EnhancementProductionInput {
  readonly job: ClaimedReportV4EnhancementJob;
  readonly workerId: string;
  readonly signal: AbortSignal;
}

export interface ReportV4EnhancementProductionOptions {
  readonly environment: NodeJS.ProcessEnv;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => Date;
  readonly sourceAudit?: Omit<ReportV4SourceAuditProductionOptions, "fetchImpl">;
  readonly liveDrill?: StagingLiveDrill;
}

export interface ClaimedReportV4EnhancementContext {
  readonly enhancementJob: ReportV4ProductionEnhancementJob & {
    readonly executionState: "running";
    readonly leaseOwner: string;
    readonly leaseExpiresAt: Date;
  };
  readonly core: ReportV4PaidCoreContext & {
    readonly commercePhase: "settled";
    readonly activeCoreArtifact: NonNullable<ReportV4PaidCoreContext["activeCoreArtifact"]>;
  };
  readonly lineage: ReportV4ProductionLineage;
}

export interface ReportV4EnhancementLockedConfiguration {
  readonly modelRuntime: ReportV4ModelRuntimeConfig;
  readonly reportRuntime: ReportV4ReportRuntimeConfig;
}

export interface ReportV4EnhancementProductionExecution extends ReportV4EnhancementLockedConfiguration {
  readonly input: RunReportV4EnhancementProductionInput;
  readonly context: ClaimedReportV4EnhancementContext;
  readonly configSnapshot: ReportV4ConfigSnapshotRow;
  readonly stageInput: ReportV4EnhancementStageInput;
}

export interface ReportV4EnhancementProductionDependencies {
  readonly now: () => Date;
  readonly createAcceptanceRuntime?: (
    enhancementJobId: string
  ) => Promise<ReportV4EnhancementAcceptanceRuntime>;
  readonly loadClaimedContext: (input: {
    readonly enhancementJobId: string;
    readonly workerId: string;
  }) => Promise<ClaimedReportV4EnhancementContext>;
  readonly loadConfigSnapshot: (configSnapshotId: string) => Promise<ReportV4ConfigSnapshotRow | null>;
  readonly resolveLockedConfiguration: (input: {
    readonly context: ClaimedReportV4EnhancementContext;
    readonly configSnapshot: ReportV4ConfigSnapshotRow;
  }) => ReportV4EnhancementLockedConfiguration;
  readonly createStageDependencies: (
    execution: ReportV4EnhancementProductionExecution,
    acceptanceRuntime?: ReportV4EnhancementAcceptanceRuntime
  ) => ReportV4EnhancementStageDependencies;
  readonly runStage?: typeof runReportV4EnhancementStage;
}

/**
 * Live production runner for an enhancement job already claimed by the worker.
 * PostgreSQL remains authoritative for the lease and every persisted lineage.
 */
export function createReportV4EnhancementProduction(options: ReportV4EnhancementProductionOptions) {
  const jobs = createReportV4ProductionJobRepository();
  return createReportV4EnhancementProductionWithDependencies({
    ...liveDependencies(options),
    loadClaimedContext: (input) => jobs.loadClaimedDiagnosisEnhancementContext(input)
  });
}

export function createReportV4EnhancementProductionWithDependencies(
  dependencies: ReportV4EnhancementProductionDependencies
) {
  return async function run(inputValue: RunReportV4EnhancementProductionInput): Promise<ReportV4OrchestratorResult> {
    const input = exactClaim(inputValue);
    input.signal.throwIfAborted();
    const acceptanceRuntime = dependencies.createAcceptanceRuntime
      ? await dependencies.createAcceptanceRuntime(input.job.id)
      : undefined;
    input.signal.throwIfAborted();
    const context = await dependencies.loadClaimedContext({
      enhancementJobId: input.job.id,
      workerId: input.workerId
    });
    input.signal.throwIfAborted();
    assertAuthorityMatchesClaim(input, context);
    const configSnapshot = await dependencies.loadConfigSnapshot(context.lineage.configSnapshotId);
    input.signal.throwIfAborted();
    if (!configSnapshot) throw new Error("The exact locked Report V4 enhancement configuration is missing.");
    assertConfigLineage(context, configSnapshot);
    const locked = dependencies.resolveLockedConfiguration({ context, configSnapshot });
    input.signal.throwIfAborted();
    const stageInput = buildStageInput(input, context);
    const execution = Object.freeze({ input, context, configSnapshot, stageInput, ...locked });
    return (dependencies.runStage ?? runReportV4EnhancementStage)(
      { ...stageInput, signal: input.signal },
      dependencies.createStageDependencies(execution, acceptanceRuntime)
    );
  };
}

function liveDependencies(
  options: ReportV4EnhancementProductionOptions
): Omit<ReportV4EnhancementProductionDependencies, "loadClaimedContext"> {
  const configSnapshots = createReportV4ConfigSnapshotRepository();
  const revisions = createPostgresReportV4ArtifactRevisionExecutor();
  const artifacts = createPostgresReportV4ArtifactPersistenceStore();
  const diagnosisCheckpoints = createReportV4DiagnosisCheckpointRepository();
  const pageSummaries = createReportV4PageSummaryRepository();
  const clock = options.now ?? (() => new Date());

  return {
    now: clock,
    ...(options.environment.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID !== undefined
      && options.environment.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID !== ""
      ? {
          async createAcceptanceRuntime(enhancementJobId: string): Promise<ReportV4EnhancementAcceptanceRuntime> {
            const [observer, faultController] = await Promise.all([
              createReportV4AcceptanceObserver({ jobId: enhancementJobId, environment: options.environment }),
              createReportV4AcceptanceFaultController({ jobId: enhancementJobId, environment: options.environment })
            ]);
            if (!observer || faultController.mode !== "active") {
              throw new Error("The configured Report V4 acceptance session did not create an active enhancement runtime.");
            }
            return {
              observer,
              faultController,
              siteReadManifestRepository: createProductionReportV4AcceptanceSiteReadManifestRepository(options.environment)
            };
          }
        }
      : {}),
    loadConfigSnapshot: (id) => configSnapshots.getById(id),
    resolveLockedConfiguration({ context, configSnapshot }) {
      const modelRuntime = resolveReportV4LockedModelRuntime(configSnapshot.modelProfile);
      const reportRuntime = loadReportV4ReportRuntimeConfig(context.lineage.locale);
      if (modelRuntime.modelProfile.profileId !== configSnapshot.modelProfileId
        || hashStable(modelRuntime.modelProfile) !== configSnapshot.modelProfileHash
        || reportRuntime.reportProfile.profileId !== configSnapshot.reportProfileId
        || hashStable(reportRuntime.reportProfile) !== configSnapshot.reportProfileHash
        || stableJson(reportRuntime.reportProfile) !== stableJson(configSnapshot.reportProfile)) {
        throw new Error("The locked Report V4 enhancement model or report runtime has drifted from its configuration snapshot.");
      }
      return { modelRuntime, reportRuntime };
    },
    createStageDependencies(execution, acceptanceRuntime) {
      return createLiveStageDependencies({
        execution,
        acceptanceRuntime,
        options,
        revisions,
        artifacts,
        diagnosisCheckpoints,
        pageSummaries,
        clock
      });
    }
  };
}

function createLiveStageDependencies(input: {
  readonly execution: ReportV4EnhancementProductionExecution;
  readonly acceptanceRuntime?: ReportV4EnhancementAcceptanceRuntime;
  readonly options: ReportV4EnhancementProductionOptions;
  readonly revisions: ReturnType<typeof createPostgresReportV4ArtifactRevisionExecutor>;
  readonly artifacts: ReturnType<typeof createPostgresReportV4ArtifactPersistenceStore>;
  readonly diagnosisCheckpoints: ReportV4DiagnosisCheckpointRepository;
  readonly pageSummaries: ReturnType<typeof createReportV4PageSummaryRepository>;
  readonly clock: () => Date;
}): ReportV4EnhancementStageDependencies {
  const { execution } = input;
  const acceptanceBaseline = input.acceptanceRuntime
    ? computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(input.acceptanceRuntime.observer.scenario)
    : null;
  let diagnosis: DiagnosisCoordinator | null = null;

  return {
    nowMs: () => input.clock().getTime(),
    nowIso: () => input.clock().toISOString(),
    async loadClaimedEnhancementContext(request) {
      request.signal?.throwIfAborted();
      assertExactStageRequest(execution, request);
      const source = await getReportV4ArtifactPayload(execution.stageInput.sourceCoreArtifactRevisionId, input.artifacts);
      request.signal?.throwIfAborted();
      if (!source || source.revisionKind !== "generation" || source.sourceArtifactRevisionId !== null) {
        throw new Error("The exact persisted Report V4 source core artifact is missing.");
      }
      const activeRevisionId = execution.context.core.report.activeArtifactRevisionId;
      if (!activeRevisionId) throw new Error("The settled Report V4 source core has no active artifact.");
      if (activeRevisionId !== execution.stageInput.sourceCoreArtifactRevisionId
        && activeRevisionId !== execution.stageInput.enhancementArtifactRevisionId) {
        throw new Error("The active Report V4 artifact is outside the exact enhancement lineage.");
      }
      const active = activeRevisionId === source.artifactRevisionId
        ? source
        : await getReportV4ArtifactPayload(activeRevisionId, input.artifacts);
      request.signal?.throwIfAborted();
      if (!active) throw new Error("The exact active Report V4 artifact payload is missing.");
      await observeReportV4RecoveredEnhancementActivation({
        runtime: input.acceptanceRuntime ?? null,
        activeArtifactRevisionId: active.artifactRevisionId,
        enhancementArtifactRevisionId: execution.stageInput.enhancementArtifactRevisionId,
        htmlSha256: active.htmlSha256
      });
      request.signal?.throwIfAborted();
      const snapshot = await resolvePaidReportV4SiteSnapshot({
        id: execution.context.lineage.siteSnapshotId,
        reportId: execution.context.lineage.reportId,
        siteKey: execution.context.core.siteSnapshot.siteKey,
        collectorConfigIdentityHash: execution.context.core.siteSnapshot.collectorConfigIdentityHash,
        contentIdentityHash: execution.context.core.siteSnapshot.contentIdentityHash!
      });
      request.signal?.throwIfAborted();
      if (activeRevisionId === source.artifactRevisionId) {
        const pages = await loadReportV4PageSummariesForWebsiteSynthesis({
          reportId: execution.context.lineage.reportId,
          snapshotId: execution.context.lineage.siteSnapshotId,
          contentIdentityHash: execution.context.core.siteSnapshot.contentIdentityHash!
        }, input.pageSummaries);
        request.signal?.throwIfAborted();
        const terminalSeeds = await input.diagnosisCheckpoints.loadTerminalRecovery(execution.input.job.id);
        diagnosis = terminalSeeds
          ? await initializeRecoveredDiagnosisCoordinator({
              execution,
              questions: source.report.questions,
              checkpoints: terminalSeeds,
              signal: request.signal
            })
          : await initializeDiagnosisCoordinator({
              execution,
              questions: source.report.questions,
              pages,
              auditDependencies: acceptanceSourceAuditDependencies({
                acceptanceRuntime: input.acceptanceRuntime,
                baselineFingerprint: acceptanceBaseline,
                enhancementJobId: execution.input.job.id,
                dependencies: withReportV4IndependentSourceReadFailureDrill({
                dependencies: createReportV4SourceAuditProductionDependencies({
                  ...(input.options.sourceAudit ?? {}),
                  ...(input.options.fetch ? { fetchImpl: input.options.fetch } : {})
                }),
                enhancementJobId: execution.input.job.id,
                liveDrill: input.options.liveDrill
                })
              }),
              repository: input.diagnosisCheckpoints,
              provider: createReportV4MimoDiagnosisProvider({
                environment: input.options.environment,
                lockedRuntime: execution.modelRuntime,
                ...(input.options.fetch ? { fetch: input.options.fetch } : {}),
                ...(input.options.now ? { now: input.options.now } : {})
              }),
              acceptanceRuntime: input.acceptanceRuntime ?? null,
              signal: request.signal
            });
        // Validate the complete recovered lineage/order before recording any
        // terminal checkpoint evidence. Invalid recovery must produce zero
        // checkpoint_terminal observations and must never authorize I/O.
        if (terminalSeeds && input.acceptanceRuntime) {
          for (const checkpoint of terminalSeeds) await observeReportV4DiagnosisTerminalCheckpoint(input.acceptanceRuntime, checkpoint);
        }
      }
      return {
        enhancementJobId: execution.input.job.id,
        sourceCore: source.report,
        activeArtifact: active.report,
        snapshot,
        coreCommerceStatus: "settled",
        coreAccessStatus: "active"
      };
    },
    async auditQuestionSources({ question, signal }) {
      signal?.throwIfAborted();
      const coordinator = requireDiagnosisCoordinator(diagnosis);
      const audit = coordinator.audits.get(question.questionId);
      if (!audit) throw new Error("The exact persisted V4 diagnosis source-audit input is missing.");
      return audit;
    },
    async diagnoseQuestion({ question, sourceAudits, snapshot, locale, signal }) {
      signal?.throwIfAborted();
      const coordinator = requireDiagnosisCoordinator(diagnosis);
      if (snapshot.snapshot.id !== execution.context.lineage.siteSnapshotId || locale !== execution.context.lineage.locale) {
        throw new Error("The V4 diagnosis runtime drifted from its exact snapshot or locale lineage.");
      }
      const unit = coordinator.units.get(question.questionId);
      if (!unit || stableJson(unit.sourceAudits) !== stableJson(sourceAudits)) {
        throw new Error("The V4 diagnosis source-audit lineage changed after checkpoint initialization.");
      }
      if (unit.checkpoint.state === "completed") {
        if (!unit.checkpoint.diagnosis) throw new Error("A completed V4 diagnosis checkpoint is missing its diagnosis.");
        return { status: "completed", diagnosis: unit.checkpoint.diagnosis, providerAttempts: 0 };
      }
      if (unit.checkpoint.state === "failed") {
        return { status: "failed", providerAttempts: 0 };
      }
      let persistedCallCount = unit.checkpoint.providerCallCount;
      const drilledProvider = withReportV4DiagnosisFailureDrill({
        provider: coordinator.provider,
        enhancementJobId: execution.input.job.id,
        questionId: question.questionId,
        liveDrill: input.options.liveDrill
      });
      const checkpointingProvider: ReportV4DiagnosisProvider = {
        async generate(request) {
          const expected = persistedCallCount === 0 ? 0 : 1;
          unit.checkpoint = await input.diagnosisCheckpoints.startAttempt({
            identityHash: unit.checkpoint.identityHash,
            expectedProviderCallCount: expected,
            diagnosisInput: unit.diagnosisInput,
            sourceAudits: unit.sourceAudits
          });
          persistedCallCount = unit.checkpoint.providerCallCount;
          request.signal.throwIfAborted();
          const provider = acceptanceDiagnosisProvider({
            acceptanceRuntime: input.acceptanceRuntime,
            baselineFingerprint: acceptanceBaseline,
            enhancementJobId: execution.input.job.id,
            questionId: question.questionId,
            attempt: exactProviderAttempt(persistedCallCount),
            provider: drilledProvider
          });
          return provider.generate(request);
        }
      };
      const result = await enhanceReportV4QuestionDiagnosis({
        question,
        locale,
        targetPages: unit.targetPages,
        provider: checkpointingProvider,
        getTokenBudget: (request) => buildReportV4MimoDiagnosisTokenBudget({
          runtime: execution.modelRuntime,
          request
        }),
        signal
      });
      signal?.throwIfAborted();
      if (result.status === "completed") {
        unit.checkpoint = await input.diagnosisCheckpoints.complete({
          identityHash: unit.checkpoint.identityHash,
          providerCallCount: persistedCallCount as 1 | 2,
          diagnosisInput: unit.diagnosisInput,
          diagnosis: result.diagnosis
        });
        if (input.acceptanceRuntime) await observeReportV4DiagnosisTerminalCheckpoint(input.acceptanceRuntime, unit.checkpoint);
        return { status: "completed", diagnosis: result.diagnosis, providerAttempts: result.providerAttempts };
      }
      unit.checkpoint = await input.diagnosisCheckpoints.markFailed({
        identityHash: unit.checkpoint.identityHash,
        providerCallCount: persistedCallCount,
        diagnosisInput: unit.diagnosisInput
      });
      if (input.acceptanceRuntime) await observeReportV4DiagnosisTerminalCheckpoint(input.acceptanceRuntime, unit.checkpoint);
      return { status: "failed", providerAttempts: result.providerAttempts };
    },
    prepareEnhancementRevision: (identity, signal) => {
      signal?.throwIfAborted();
      return prepareReportV4DiagnosisEnhancement(identity, input.revisions);
    },
    renderEnhancementHtml: ({ report, signal }) => renderReportV4Html({ stage: "enhancement", report, signal }),
    async persistEnhancementArtifact({ report, html, signal }) {
      signal?.throwIfAborted();
      const persist = () => persistReportV4ArtifactPayload({
        report, canonicalHtml: html,
        artifactRevisionId: execution.stageInput.enhancementArtifactRevisionId,
        reportId: execution.context.lineage.reportId, orderId: execution.context.lineage.orderId,
        jobId: execution.input.job.id, coreJobId: execution.context.lineage.coreJobId,
        questionSetId: execution.context.lineage.questionSetId,
        configSnapshotId: execution.context.lineage.configSnapshotId,
        siteSnapshotId: execution.context.lineage.siteSnapshotId,
        revisionKind: "diagnosis_enhancement",
        sourceArtifactRevisionId: execution.context.lineage.coreArtifactRevisionId
      }, input.artifacts);
      const persisted = input.acceptanceRuntime
        ? await observeReportV4EnhancementHtmlPersistence({
            runtime: input.acceptanceRuntime,
            artifactRevisionId: execution.stageInput.enhancementArtifactRevisionId,
            html,
            persist
          })
        : await persist();
      signal?.throwIfAborted();
      return { payloadIdentityHash: persisted.payloadIdentityHash, htmlSha256: persisted.htmlSha256 };
    },
    activateEnhancementRevision: input.acceptanceRuntime
      ? (identity, signal) => {
          signal?.throwIfAborted();
          return observeReportV4EnhancementActivation({
            runtime: input.acceptanceRuntime!,
            artifactRevisionId: identity.artifactRevisionId,
            htmlSha256: identity.htmlSha256,
            activate: () => activateReportV4DiagnosisEnhancement(identity, input.revisions)
          });
        }
      : (identity, signal) => {
          signal?.throwIfAborted();
          return activateReportV4DiagnosisEnhancement(identity, input.revisions);
        },
    failEnhancementRevision: (identity, signal) => {
      signal?.throwIfAborted();
      return failReportV4DiagnosisEnhancement(identity, input.revisions);
    },
    terminalizeEnhancementJob: ({ signal, ...terminal }) => {
      signal?.throwIfAborted();
      return terminalizeReportV4EnhancementJob({ ...terminal, workerId: execution.input.workerId });
    }
  };
}

export function withReportV4DiagnosisFailureDrill(input: {
  readonly provider: ReportV4DiagnosisProvider;
  readonly enhancementJobId: string;
  readonly questionId: string;
  readonly liveDrill?: StagingLiveDrill;
}): ReportV4DiagnosisProvider {
  if (!input.liveDrill) return input.provider;
  return {
    async generate(request) {
      try {
        input.liveDrill!.inject({
          jobId: input.enhancementJobId,
          fault: "diagnosis_failure",
          questionId: input.questionId
        });
      } catch (error) {
        if (error instanceof StagingLiveDrillFaultError) {
          throw new ReportV4DiagnosisProviderError(
            "temporary_provider",
            "Protected staging injected a bounded Report V4 diagnosis provider failure.",
            { cause: error }
          );
        }
        throw error;
      }
      return input.provider.generate(request);
    }
  };
}

export function withReportV4IndependentSourceReadFailureDrill(input: {
  readonly dependencies: ReportV4SourceAuditDependencies;
  readonly enhancementJobId: string;
  readonly liveDrill?: StagingLiveDrill;
}): ReportV4SourceAuditDependencies {
  if (!input.liveDrill) return input.dependencies;
  return {
    async readRawSource(source, signal) {
      input.liveDrill!.inject({
        jobId: input.enhancementJobId,
        fault: "independent_source_read_failure",
        questionId: source.questionId,
        sourceId: source.sourceId
      });
      return input.dependencies.readRawSource(source, signal);
    },
    renderBrowserSource: (source, signal) => input.dependencies.renderBrowserSource(source, signal)
  };
}

function acceptanceSourceAuditDependencies(input: {
  readonly dependencies: ReportV4SourceAuditDependencies;
  readonly acceptanceRuntime?: ReportV4EnhancementAcceptanceRuntime;
  readonly baselineFingerprint: string | null;
  readonly enhancementJobId: string;
}): ReportV4SourceAuditDependencies {
  if (!input.acceptanceRuntime) return input.dependencies;
  if (!input.baselineFingerprint) {
    throw new Error("The active Report V4 enhancement acceptance runtime is missing its fault-provenance baseline.");
  }
  return withReportV4EnhancementAcceptanceSourceAudit({
    dependencies: input.dependencies,
    runtime: input.acceptanceRuntime,
    enhancementJobId: input.enhancementJobId,
    baselineFingerprint: input.baselineFingerprint
  });
}

function acceptanceDiagnosisProvider(input: {
  readonly provider: ReportV4DiagnosisProvider;
  readonly acceptanceRuntime?: ReportV4EnhancementAcceptanceRuntime;
  readonly baselineFingerprint: string | null;
  readonly enhancementJobId: string;
  readonly questionId: string;
  readonly attempt: 1 | 2;
}): ReportV4DiagnosisProvider {
  if (!input.acceptanceRuntime) return input.provider;
  if (!input.baselineFingerprint) {
    throw new Error("The active Report V4 enhancement acceptance runtime is missing its fault-provenance baseline.");
  }
  return withReportV4EnhancementAcceptanceDiagnosisProvider({
    provider: input.provider,
    runtime: input.acceptanceRuntime,
    enhancementJobId: input.enhancementJobId,
    questionId: input.questionId,
    attempt: input.attempt,
    baselineFingerprint: input.baselineFingerprint
  });
}

function exactProviderAttempt(value: number): 1 | 2 {
  if (value !== 1 && value !== 2) {
    throw new Error("A real Report V4 diagnosis provider attempt must be exactly 1 or 2.");
  }
  return value;
}

interface DiagnosisUnit {
  readonly diagnosisInput: ReportV4DiagnosisInput;
  readonly sourceAudits: readonly ReportV4DiagnosisSourceAudit[];
  readonly targetPages: readonly ReportV4DiagnosisTargetPage[];
  checkpoint: ReportV4DiagnosisCheckpoint;
}

interface DiagnosisCoordinator {
  readonly audits: ReadonlyMap<string, ReportV4OrchestratorSourceAuditResult>;
  readonly units: ReadonlyMap<string, DiagnosisUnit>;
  readonly provider: ReportV4DiagnosisProvider;
}

async function initializeRecoveredDiagnosisCoordinator(input: {
  readonly execution: ReportV4EnhancementProductionExecution;
  readonly questions: readonly CombinedGeoReportV4Question[];
  readonly checkpoints: readonly [ReportV4DiagnosisCheckpoint, ReportV4DiagnosisCheckpoint, ReportV4DiagnosisCheckpoint];
  readonly signal?: AbortSignal;
}): Promise<DiagnosisCoordinator> {
  const questions = [...input.questions].sort((left, right) => left.order - right.order);
  const prepared = questions.map((question, index) => {
    const checkpoint = input.checkpoints[index]!;
    assertRecoveredCheckpointLineage(input.execution, checkpoint, question, index + 1);
    if (checkpoint.ordinal !== index + 1 || checkpoint.questionId !== question.questionId) {
      throw new Error("The terminal V4 diagnosis checkpoint does not match the source-core question order.");
    }
    const auditedQuestion = applyAuditsForCheckpoint(question, checkpoint.sourceAudits);
    assertPersistedDiagnosisInputCore(checkpoint.diagnosisInput, auditedQuestion, input.execution.context.lineage.locale);
    return {
      question,
      sourceAudits: checkpoint.sourceAudits,
      targetPages: checkpoint.diagnosisInput.targetPages,
      diagnosisInput: checkpoint.diagnosisInput,
      checkpoint
    };
  });
  input.signal?.throwIfAborted();
  const audits = new Map<string, ReportV4OrchestratorSourceAuditResult>();
  const units = new Map<string, DiagnosisUnit>();
  prepared.forEach((unit) => {
    const checkpoint = unit.checkpoint;
    audits.set(unit.question.questionId, { sourceAudits: unit.sourceAudits, rawReads: 0, browserReads: 0 });
    units.set(unit.question.questionId, {
      diagnosisInput: unit.diagnosisInput,
      sourceAudits: unit.sourceAudits,
      targetPages: unit.targetPages,
      checkpoint
    });
  });
  return {
    audits,
    units,
    provider: { async generate() { throw new Error("A terminal V4 diagnosis checkpoint must not invoke a provider."); } }
  };
}

async function initializeDiagnosisCoordinator(input: {
  readonly execution: ReportV4EnhancementProductionExecution;
  readonly questions: readonly CombinedGeoReportV4Question[];
  readonly pages: readonly ReportV4PageSummary[];
  readonly auditDependencies: ReportV4SourceAuditDependencies;
  readonly repository: ReportV4DiagnosisCheckpointRepository;
  readonly provider: ReportV4DiagnosisProvider;
  readonly acceptanceRuntime: ReportV4EnhancementAcceptanceRuntime | null;
  readonly signal?: AbortSignal;
}): Promise<DiagnosisCoordinator> {
  const questions = [...input.questions].sort((left, right) => left.order - right.order);
  if (questions.length !== 3 || questions.some((question, index) => question.order !== index + 1)) {
    throw new Error("Report V4 diagnosis checkpoint initialization requires exactly three ordered core questions.");
  }
  const sharedReads = createSharedSourceAuditReads(input.auditDependencies);
  const prepared = await Promise.all(questions.map(async (question) => {
    input.signal?.throwIfAborted();
    let rawReads = 0;
    let browserReads = 0;
    const counted: ReportV4SourceAuditDependencies = {
      async readRawSource(source, signal) {
        const read = await sharedReads.readRawSource(source, signal);
        if (read.performed) rawReads += 1;
        return read.value;
      },
      async renderBrowserSource(source, signal) {
        const read = await sharedReads.renderBrowserSource(source, signal);
        if (read.performed) browserReads += 1;
        return read.value;
      }
    };
    const audit = question.status === "answered"
      ? (await auditReportV4Sources([question], counted, input.signal))[0]!
      : { question, sourceAudits: [] };
    const auditedQuestion = applyAuditsForCheckpoint(question, audit.sourceAudits);
    const targetPages = question.status === "answered"
      ? selectReportV4DiagnosisTargetPages({
          questionId: question.questionId,
          question: question.questionText,
          answer: answeredText(question.answer),
          pages: input.pages
        })
      : [];
    const diagnosisInput = diagnosisInputFor(auditedQuestion, targetPages, input.execution.context.lineage.locale);
    return {
      question,
      sourceAudits: audit.sourceAudits,
      targetPages,
      diagnosisInput,
      auditResult: { sourceAudits: audit.sourceAudits, rawReads, browserReads }
    };
  }));
  input.signal?.throwIfAborted();
  const initialized = await input.repository.initialize(checkpointInitialization(input.execution, prepared));
  input.signal?.throwIfAborted();
  const audits = new Map<string, ReportV4OrchestratorSourceAuditResult>();
  const units = new Map<string, DiagnosisUnit>();
  for (let index = 0; index < prepared.length; index += 1) {
    const unit = prepared[index]!;
    let checkpoint = initialized[index]!;
    if (unit.question.status !== "answered" && checkpoint.state !== "failed") {
      if (checkpoint.state !== "queued" || checkpoint.providerCallCount !== 0) {
        throw new Error("An unavailable V4 question has a non-terminal diagnosis checkpoint.");
      }
      checkpoint = await input.repository.markFailed({
        identityHash: checkpoint.identityHash,
        providerCallCount: 0,
        diagnosisInput: unit.diagnosisInput
      });
      if (input.acceptanceRuntime) await observeReportV4DiagnosisTerminalCheckpoint(input.acceptanceRuntime, checkpoint);
    }
    audits.set(unit.question.questionId, unit.auditResult);
    units.set(unit.question.questionId, {
      diagnosisInput: unit.diagnosisInput,
      sourceAudits: unit.sourceAudits,
      targetPages: unit.targetPages,
      checkpoint
    });
  }
  return { audits, units, provider: input.provider };
}

function applyAuditsForCheckpoint(
  question: CombinedGeoReportV4Question,
  audits: readonly ReportV4DiagnosisSourceAudit[]
): CombinedGeoReportV4Question {
  const sources = new Map(question.sources.map((source) => [source.sourceId, source]));
  const bySource = new Map<string, ReportV4DiagnosisSourceAudit>();
  for (const audit of audits) {
    const source = sources.get(audit.sourceId);
    if (!source || bySource.has(audit.sourceId) || audit.questionId !== question.questionId
      || audit.canonicalUrl !== source.canonicalUrl) {
      throw new Error("The V4 diagnosis source audit is outside its exact question lineage.");
    }
    bySource.set(audit.sourceId, audit);
  }
  return {
    ...question,
    sources: question.sources.map((source) => {
      const audit = bySource.get(source.sourceId);
      return audit ? { ...source, retrievalStatus: audit.status } : source;
    })
  };
}

function assertRecoveredCheckpointLineage(
  execution: ReportV4EnhancementProductionExecution,
  checkpoint: ReportV4DiagnosisCheckpoint,
  question: CombinedGeoReportV4Question,
  ordinalValue: number
): void {
  const lineage = execution.context.lineage;
  if (checkpoint.reportId !== lineage.reportId || checkpoint.enhancementJobId !== execution.input.job.id
    || checkpoint.coreArtifactRevisionId !== lineage.coreArtifactRevisionId
    || checkpoint.configSnapshotId !== lineage.configSnapshotId
    || checkpoint.questionSetId !== lineage.questionSetId || checkpoint.snapshotId !== lineage.siteSnapshotId
    || checkpoint.questionId !== question.questionId || checkpoint.ordinal !== ordinalValue
    || (checkpoint.state !== "completed" && checkpoint.state !== "failed")) {
    throw new Error("The terminal V4 diagnosis checkpoint is outside the authoritative enhancement lineage.");
  }
}

function assertPersistedDiagnosisInputCore(
  persisted: ReportV4DiagnosisInput,
  question: CombinedGeoReportV4Question,
  localeValue: string
): void {
  const expectedSources = question.sources.map((source) => ({
    questionId: source.questionId,
    sourceId: source.sourceId,
    title: source.title,
    canonicalUrl: source.canonicalUrl,
    excerpt: source.citedText,
    retrievalStatus: source.retrievalStatus
  }));
  if (persisted.question.questionId !== question.questionId || persisted.question.text !== question.questionText
    || persisted.answer !== (question.status === "answered" ? answeredText(question.answer) : null)
    || persisted.locale !== localeValue || stableJson(persisted.sources) !== stableJson(expectedSources)) {
    throw new Error("The persisted V4 diagnosis input conflicts with immutable source-core question evidence.");
  }
}

function diagnosisInputFor(
  question: CombinedGeoReportV4Question,
  targetPages: readonly ReportV4DiagnosisTargetPage[],
  localeValue: string
): ReportV4DiagnosisInput {
  return parseReportV4DiagnosisInput({
    question: { questionId: question.questionId, text: question.questionText },
    answer: question.status === "answered" ? answeredText(question.answer) : null,
    locale: localeValue,
    sources: question.sources.map((source) => ({
      questionId: source.questionId,
      sourceId: source.sourceId,
      title: source.title,
      canonicalUrl: source.canonicalUrl,
      excerpt: source.citedText,
      retrievalStatus: source.retrievalStatus
    })),
    targetPages
  });
}

function checkpointInitialization(
  execution: ReportV4EnhancementProductionExecution,
  prepared: ReadonlyArray<{
    readonly question: CombinedGeoReportV4Question;
    readonly diagnosisInput: ReportV4DiagnosisInput;
  }>
) {
  if (prepared.length !== 3) throw new Error("Exactly three V4 diagnosis inputs are required.");
  return {
    reportId: execution.context.lineage.reportId,
    enhancementJobId: execution.input.job.id,
    coreArtifactRevisionId: execution.context.lineage.coreArtifactRevisionId,
    configSnapshotId: execution.context.lineage.configSnapshotId,
    questionSetId: execution.context.lineage.questionSetId,
    snapshotId: execution.context.lineage.siteSnapshotId,
    checkpoints: prepared.map((unit, index) => ({
      ordinal: (index + 1) as 1 | 2 | 3,
      questionId: unit.question.questionId,
      diagnosisInput: unit.diagnosisInput
    })) as unknown as [
      { ordinal: 1; questionId: string; diagnosisInput: unknown },
      { ordinal: 2; questionId: string; diagnosisInput: unknown },
      { ordinal: 3; questionId: string; diagnosisInput: unknown }
    ]
  };
}

function createSharedSourceAuditReads(base: ReportV4SourceAuditDependencies) {
  const raw = new Map<string, Promise<ReportV4SourceAuditRead>>();
  const browser = new Map<string, Promise<ReportV4SourceAuditRead>>();
  const read = async (
    cache: Map<string, Promise<ReportV4SourceAuditRead>>,
    source: CombinedGeoReportV4Question["sources"][number],
    signal: AbortSignal | undefined,
    operation: ReportV4SourceAuditDependencies["readRawSource"]
  ) => {
    const key = new URL(source.canonicalUrl).href;
    let promise = cache.get(key);
    const performed = !promise;
    if (!promise) {
      promise = operation(source, signal);
      cache.set(key, promise);
    }
    return { value: await promise, performed };
  };
  return {
    readRawSource: (source: CombinedGeoReportV4Question["sources"][number], signal?: AbortSignal) => (
      read(raw, source, signal, base.readRawSource)
    ),
    renderBrowserSource: (source: CombinedGeoReportV4Question["sources"][number], signal?: AbortSignal) => (
      read(browser, source, signal, base.renderBrowserSource)
    )
  };
}

function requireDiagnosisCoordinator(value: DiagnosisCoordinator | null): DiagnosisCoordinator {
  if (!value) throw new Error("The exact V4 diagnosis checkpoint coordinator is unavailable for this active lineage.");
  return value;
}

function assertExactStageRequest(
  execution: ReportV4EnhancementProductionExecution,
  request: Parameters<ReportV4EnhancementStageDependencies["loadClaimedEnhancementContext"]>[0]
): void {
  const expected = execution.stageInput;
  if (request.reportId !== expected.reportId || request.coreJobId !== expected.coreJobId
    || request.enhancementJobId !== expected.enhancementJobId
    || request.sourceCoreArtifactRevisionId !== expected.sourceCoreArtifactRevisionId
    || request.enhancementArtifactRevisionId !== expected.enhancementArtifactRevisionId) {
    throw new Error("The Report V4 enhancement stage request drifted from its authoritative claimed lineage.");
  }
}

export function buildReportV4EnhancementArtifactRevisionId(lineage: ReportV4ProductionLineage): string {
  const digest = createHash("sha256").update(stableJson({
    reportId: text(lineage.reportId, "reportId"), orderId: text(lineage.orderId, "orderId"),
    coreJobId: text(lineage.coreJobId, "coreJobId"), coreArtifactRevisionId: text(lineage.coreArtifactRevisionId, "coreArtifactRevisionId"),
    configSnapshotId: text(lineage.configSnapshotId, "configSnapshotId"), siteSnapshotId: text(lineage.siteSnapshotId, "siteSnapshotId"),
    questionSetId: text(lineage.questionSetId, "questionSetId"), locale: locale(lineage.locale)
  })).digest("hex");
  return `report-v4-enhancement-${digest}`;
}

function buildStageInput(
  input: RunReportV4EnhancementProductionInput,
  context: ClaimedReportV4EnhancementContext
): ReportV4EnhancementStageInput {
  const core = context.core;
  const questions = [...core.questions].sort((a, b) => a.ordinal - b.ordinal).map((question, index) => ({
    order: (index + 1) as 1 | 2 | 3,
    questionId: question.id,
    questionText: question.privateText!
  })) as unknown as ReportV4EnhancementStageInput["questions"];
  return {
    reportId: context.lineage.reportId,
    orderId: context.lineage.orderId,
    coreJobId: context.lineage.coreJobId,
    configSnapshotId: context.lineage.configSnapshotId,
    questionSetId: context.lineage.questionSetId,
    targetUrl: core.targetUrl,
    locale: context.lineage.locale,
    snapshotIdentity: {
      id: core.siteSnapshot.id,
      reportId: core.report.id,
      siteKey: core.siteSnapshot.siteKey,
      collectorConfigIdentityHash: core.siteSnapshot.collectorConfigIdentityHash,
      contentIdentityHash: core.siteSnapshot.contentIdentityHash!
    },
    questions,
    sourceCoreArtifactRevisionId: context.lineage.coreArtifactRevisionId,
    enhancementJobId: input.job.id,
    enhancementArtifactRevisionId: buildReportV4EnhancementArtifactRevisionId(context.lineage)
  };
}

function exactClaim(input: RunReportV4EnhancementProductionInput): RunReportV4EnhancementProductionInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("A claimed V4 enhancement job input is required.");
  if (!(input.signal instanceof AbortSignal)) throw new TypeError("A V4 enhancement abort signal is required.");
  const job = input.job;
  const workerId = text(input.workerId, "workerId");
  if (!job || job.id !== text(job.id, "enhancement job id") || job.reportId !== text(job.reportId, "enhancement report id") ||
      job.siteSnapshotId !== null || job.tier !== "deep" || job.productContract !== "recommendation_forensics_v1" ||
      job.fulfillmentMethodology !== "two_stage_geo_report_v4" || job.recommendationReportVersion !== 4 ||
      job.artifactContract !== "combined_geo_report_v4" || !job.businessQuestionSetId ||
      (job.locale !== "en" && job.locale !== "zh") || job.reason !== "v4_diagnosis_enhancement" ||
      job.creditReservationId !== null || job.correctionId !== null || job.replacementFulfillmentId !== null ||
      job.executionState !== "running" || job.leaseOwner !== workerId || !(job.leaseExpiresAt instanceof Date) ||
      !Number.isFinite(job.leaseExpiresAt.getTime()) || terminal(job.stage)) {
    throw new Error("The V4 diagnosis enhancement job was not independently claimed with its exact live no-credit identity.");
  }
  return Object.freeze({ job, workerId, signal: input.signal });
}

function assertAuthorityMatchesClaim(
  input: RunReportV4EnhancementProductionInput,
  context: ClaimedReportV4EnhancementContext
): void {
  const authoritative = context.enhancementJob;
  if (authoritative.id !== input.job.id || authoritative.reportId !== input.job.reportId ||
      authoritative.questionSetId !== input.job.businessQuestionSetId || authoritative.locale !== input.job.locale ||
      authoritative.executionState !== "running" || authoritative.leaseOwner !== input.workerId ||
      !(authoritative.leaseExpiresAt instanceof Date) || !Number.isFinite(authoritative.leaseExpiresAt.getTime())) {
    throw new Error("The authoritative V4 enhancement lineage or live lease conflicts with the claimed job.");
  }
  if (context.lineage.reportId !== authoritative.reportId || context.lineage.questionSetId !== authoritative.questionSetId ||
      context.lineage.locale !== authoritative.locale || context.core.commercePhase !== "settled" || !context.core.activeCoreArtifact) {
    throw new Error("The authoritative V4 enhancement lineage conflicts with its settled source core.");
  }
}

function assertConfigLineage(context: ClaimedReportV4EnhancementContext, snapshot: ReportV4ConfigSnapshotRow): void {
  const config = context.core.config;
  if (snapshot.id !== config.id || snapshot.reportId !== context.lineage.reportId || snapshot.orderId !== context.lineage.orderId ||
      snapshot.coreJobId !== context.lineage.coreJobId || snapshot.identityHash !== config.identityHash ||
      snapshot.modelProfileId !== config.modelProfileId || snapshot.modelProfileHash !== config.modelProfileHash ||
      snapshot.reportProfileId !== config.reportProfileId || snapshot.reportProfileHash !== config.reportProfileHash) {
    throw new Error("The locked V4 enhancement configuration lineage has drifted.");
  }
}

function terminal(stage: string): boolean {
  return stage === "completed" || stage === "completed_limited" || stage === "failed";
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > 500) throw new TypeError(`An exact ${field} is required.`);
  return value;
}

function locale(value: unknown): "en" | "zh" {
  if (value !== "en" && value !== "zh") throw new TypeError("V4 locale must be exact en or zh.");
  return value;
}

function answeredText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("An answered V4 question requires its exact saved answer.");
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

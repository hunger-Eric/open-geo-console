import { createHash } from "node:crypto";
import { buildPublicSourceEvidenceGraph, type RetrievedPublicSourceFact } from "@open-geo-console/citation-intelligence";
import { createSearchQueryFanout, DEFAULT_QUERY_BUDGET, generateCanonicalBuyerQuestions, toCanonicalBuyerQuestionSet, type CanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet, type CustomerIdentityExclusion, type MarketSearchObservation, type PublicSearchSurfaceAuthority, type SearchQueryFanout } from "@open-geo-console/public-search-observer";
import type { AiWebsiteReportV1, RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { decidePublicSourceCommercialCoverage } from "@/public-source-forensics/coverage";
import { buildPublicSourceForensicReport, type PublicSourceForensicReportBuilderInput } from "@/public-source-forensics/report-builder";
import { createConcurrencyGate, type ConcurrencyGate } from "./bounded-scheduler";
import {
  JobError,
  PublicSourceQueryVariantCoverageError,
  PublicSourceSnapshotQueryBindingError
} from "./job-errors";
import { stableJsonHash } from "./provider-discovery-pipeline";
import { tracePaidV3DirectStep, type PaidV3DirectDebugTrace, type PaidV3DirectDebugTraceDetails } from "./paid-v3-direct-debug-trace";
import {
  fanoutQueryIds,
  hasExtraObservedQueryIds,
  isProperSubsetOfPlan,
  observationQueryIds,
  projectFanoutsToObservedQueryIds,
  queryIdSetsEqual
} from "./public-source-query-coverage";

export interface ResolvedPublicSourceSnapshot {
  snapshotId: string; cacheIdentity: string; questionId: string; observedAt: string; ageMs: number;
  collectedForThisRun: boolean; refreshAttempted: boolean; refreshFailed: boolean; sufficientlyEvidenced: boolean;
  availableSourceCount: number;
  observations: MarketSearchObservation[]; retrievals: RetrievedPublicSourceFact[];
  actualCostMicros: number; allocatedCostMicros: number; avoidedCostMicros: number;
}

export interface PublicSourcePipelineCheckpoint {
  identityHash: string; methodology: "public_search_source_forensics_v1"; questionSetVersion: string;
  fanoutVersion: string; authorityId: string; snapshotIds: string[]; websiteFoundationHash: string;
  evidenceCutoffAt: string; locale: string; region: string; adapterIdentityHash: string;
}

export interface PublicSourceCommercialSnapshotRef {
  snapshotId: string;
  cacheIdentity: string;
  freshnessState: "fresh" | "historical" | "insufficient";
  actualCostMicros: number;
  allocatedCostMicros: number;
  avoidedCostMicros: number;
}

export interface PublicSourceForensicsDependencies {
  authority: PublicSearchSurfaceAuthority;
  resolveSnapshot(input: { questionId: string; fanout: SearchQueryFanout; evidenceCutoffAt: string; retrievalGate: ConcurrencyGate }): Promise<ResolvedPublicSourceSnapshot>;
  /**
   * Resume path: loads a snapshot persisted by a prior attempt by its exact
   * ID, bypassing the `completed_at <= evidenceCutoffAt` cache search that
   * would exclude the job's own fresher product. Returns null when the exact
   * ID is missing or not completed so the caller re-collects that question
   * through the normal resolution path.
   */
  resolveSnapshotById?(input: { snapshotId: string; questionId: string; fanout: SearchQueryFanout; evidenceCutoffAt: string; retrievalGate: ConcurrencyGate }): Promise<ResolvedPublicSourceSnapshot | null>;
  getCheckpoint(jobId: string): Promise<PublicSourcePipelineCheckpoint | null>;
  saveCheckpoint(jobId: string, checkpoint: PublicSourcePipelineCheckpoint): Promise<void>;
  getReport(jobId: string): Promise<RecommendationForensicReportV2 | null>;
  saveReport(report: unknown): Promise<RecommendationForensicReportV2>;
  artifactReadiness: ArtifactReadinessGate;
  /** Persists the complete pre-artifact payload before the real gate runs. */
  prepareArtifactVerification?(input: {
    jobId: string;
    report: RecommendationForensicReportV2;
    checkpoint: PublicSourcePipelineCheckpoint;
    commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[];
  }): Promise<void>;
  buildReport?: (input: PublicSourceForensicReportBuilderInput) => RecommendationForensicReportV2;
  now?: () => Date;
  costCapMicros?: number;
  deferReportPersistence?: boolean;
}

export interface ArtifactReadinessGate { verify(report: RecommendationForensicReportV2): Promise<void>; }
export const FAIL_CLOSED_ARTIFACT_READINESS: ArtifactReadinessGate = { async verify() { throw new PublicSourceArtifactUnavailableError(); } };

export async function runPublicSourceForensicsPipeline(input: {
  reportId: string; jobId: string; locale: string; region: string; targetUrl: string;
  websiteFoundation: AiWebsiteReportV1; businessQuestionSet?: ConfirmedBusinessQuestionSet; dependencies: PublicSourceForensicsDependencies; signal?: AbortSignal;
  fanoutOverrides?: ReadonlyMap<string, SearchQueryFanout>;
  semanticValidation?: "legacy" | "deferred";
  trace?: PaidV3DirectDebugTrace;
}): Promise<{ report: RecommendationForensicReportV2; checkpoint: PublicSourcePipelineCheckpoint; commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[] }> {
  input.signal?.throwIfAborted();
  const existing = await tracePaidV3DirectStep(input.trace, "public_source_report_load", {
    phase: "source_retrieval"
  }, () => input.dependencies.getReport(input.jobId));
  if (existing) return { report: existing, checkpoint: checkpointFromReport(existing, input.websiteFoundation), commercialSnapshotRefs: [] };
  const authority = runForensicsTraceGate(input.trace, "public_source_authority", {
    phase: "public_source_preflight"
  }, () => {
    const value = input.dependencies.authority;
    if (!value.active || value.surface.locale !== input.locale || value.surface.region !== input.region) throw new PublicSourceAuthorityUnavailableError();
    return value;
  });
  const profile = input.websiteFoundation.organizationProfile;
  const questions = runForensicsTraceGate(input.trace, "public_source_questions", {
    phase: "public_source_preflight", completedCount: 3
  }, () => {
    const value = input.businessQuestionSet ? toCanonicalBuyerQuestionSet(input.businessQuestionSet) : generateCanonicalBuyerQuestions({ locale: input.locale, region: input.region,
      categoryEvidence: profile.productsAndServices.map((item, index) => ({ value: item, confidence: "high" as const, sourceId: `website-foundation-category-${index}` })),
      capabilityEvidence: profile.productsAndServices.map((item, index) => ({ value: item, confidence: "high" as const, sourceId: `website-foundation-capability-${index}` })),
      broadCategory: profile.businessModel || "business services",
      excludedIdentities: [{ kind: "customer_domain", value: new URL(input.targetUrl).hostname },
        ...(profile.brandNames.map((item) => ({ kind: "customer_brand" as const, value: item })))] });
    if (value.questions.length !== 3 || (!input.businessQuestionSet && value.confidence !== "high")) throw new PublicSourceQuestionGenerationError();
    return value;
  });
  const excludedIdentities: CustomerIdentityExclusion[] = [{ kind: "customer_domain", value: new URL(input.targetUrl).hostname }, ...profile.brandNames.map((value) => ({ kind: "customer_brand" as const, value }))];
  const fanouts = runForensicsTraceGate(input.trace, "public_source_fanout", {
    phase: "public_source_preflight", questionOrdinal: 1
  }, () => {
    const value = createPublicSourceQuestionFanouts({ questions, authority, excludedIdentities }).map((fanout) => input.fanoutOverrides?.get(fanout.questionId) ?? fanout);
    if (value.some((fanout) => fanout.surface.surfaceId !== authority.surface.surfaceId || fanout.surface.surfaceVersion !== authority.surface.surfaceVersion || fanout.questionSetVersion !== questions.questionSetVersion)) throw new PublicSourceAuthorityUnavailableError("Public-source fanout override identity is invalid.");
    return value;
  });
  const prior = await tracePaidV3DirectStep(input.trace, "public_source_checkpoint_load", {
    phase: "source_retrieval"
  }, () => input.dependencies.getCheckpoint(input.jobId));
  // Resume freezes the foundation hash from the prior checkpoint so DB/JSON
  // round-trips of the same website foundation cannot force a full rematch.
  const websiteFoundationHash = prior?.websiteFoundationHash ?? stableJsonHash(input.websiteFoundation);
  if (prior && (prior.methodology !== "public_search_source_forensics_v1" || prior.questionSetVersion !== questions.questionSetVersion ||
      prior.fanoutVersion !== fanouts[0]!.fanoutVersion || prior.authorityId !== authority.authorityId || prior.websiteFoundationHash !== websiteFoundationHash ||
      prior.locale !== input.locale || prior.region !== input.region ||
      prior.adapterIdentityHash !== adapterIdentityHash(authority))) throw new PublicSourceResumeIdentityMismatchError();
  const evidenceCutoffAt = prior?.evidenceCutoffAt ?? (input.dependencies.now ?? (() => new Date()))().toISOString();
  const retrievalGate = createConcurrencyGate(4);
  const resolutions = await Promise.all(fanouts.map((fanout, index) => tracePaidV3DirectStep(input.trace, "public_source_snapshot_resolution", {
    phase: "source_retrieval", snapshotOrdinal: index + 1, snapshotCount: fanouts.length
  }, async () => {
    input.signal?.throwIfAborted();
    const priorSnapshotId = prior && prior.snapshotIds.length === fanouts.length ? prior.snapshotIds[index]! : null;
    if (priorSnapshotId && input.dependencies.resolveSnapshotById) {
      const resumed = await input.dependencies.resolveSnapshotById({ snapshotId: priorSnapshotId, questionId: fanout.questionId, fanout, evidenceCutoffAt, retrievalGate });
      if (resumed) {
        if (resumed.snapshotId !== priorSnapshotId || resumed.questionId !== fanout.questionId) throw new PublicSourceResumeIdentityMismatchError();
        return { snapshot: resumed, reFetched: false };
      }
    }
    // A prior snapshot unavailable at resume is re-collected through the normal
    // resolution path; the checkpoint below is updated to the new fetch instead
    // of failing on the resulting identity change.
    return { snapshot: await input.dependencies.resolveSnapshot({ questionId: fanout.questionId, fanout, evidenceCutoffAt, retrievalGate }), reFetched: priorSnapshotId !== null };
  })));
  const snapshots = resolutions.map(({ snapshot }) => snapshot);
  input.signal?.throwIfAborted();
  const coverageStarted = Date.now(); input.trace?.emit("step_started", "public_source_coverage_guard", { phase: "source_retrieval", snapshotCount: snapshots.length });
  const observations = snapshots.flatMap(({ observations: values }) => values);
  const planQueryIds = fanoutQueryIds(fanouts);
  const observedIds = observationQueryIds(observations);
  // W-B: observations with IDs outside the current plan are a hard identity fault.
  if (hasExtraObservedQueryIds(observedIds, planQueryIds)) {
    failForensicsGate(input.trace, "public_source_coverage_guard", coverageStarted, new PublicSourceQueryVariantCoverageError(
      "$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.", { safeDiagnostics: forensicsTrace("pre_graph_guard", fanouts, snapshots, observedIds, []) }
    ));
  }
  // W-B: proper subset (prefix/stale fallback) → effective plan = observed set; never full completed.
  const partialQueryCoverage = isProperSubsetOfPlan(observedIds, planQueryIds);
  if (partialQueryCoverage && observedIds.length === 0) {
    failForensicsGate(input.trace, "public_source_coverage_guard", coverageStarted, new PublicSourceQueryVariantCoverageError(
      "$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.", { safeDiagnostics: forensicsTrace("pre_graph_guard", fanouts, snapshots, observedIds, []) }
    ));
  }
  if (!partialQueryCoverage && !queryIdSetsEqual(observedIds, planQueryIds) && observedIds.length > 0) {
    // Same size but different members (or other non-subset mismatch) — permanent.
    failForensicsGate(input.trace, "public_source_coverage_guard", coverageStarted, new PublicSourceQueryVariantCoverageError(
      "$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.", { safeDiagnostics: forensicsTrace("pre_graph_guard", fanouts, snapshots, observedIds, []) }
    ));
  }
  let effectiveFanouts: SearchQueryFanout[];
  try {
    effectiveFanouts = partialQueryCoverage
      ? projectFanoutsToObservedQueryIds(fanouts, new Set(observedIds))
      : fanouts;
  } catch (error) {
    input.trace?.failed("public_source_coverage_guard", { phase: "source_retrieval", durationMs: Date.now() - coverageStarted }, error);
    throw mapForensicReportContractError(error, forensicsTrace("pre_graph_guard", fanouts, snapshots, observedIds, []));
  }
  input.trace?.emit("step_succeeded", "public_source_coverage_guard", { phase: "source_retrieval", disposition: partialQueryCoverage ? "partial" : "complete", durationMs: Date.now() - coverageStarted });

  const actualCostMicros = snapshots.reduce((sum, item) => sum + item.actualCostMicros, 0);
  let decision = decidePublicSourceCommercialCoverage({ authorityReady: true, evidenceIsolated: snapshots.every((item) => item.questionId && item.snapshotId),
    artifactReady: true, costCapExceeded: actualCostMicros > (input.dependencies.costCapMicros ?? Number.MAX_SAFE_INTEGER),
    questions: snapshots.map((item) => ({ questionId: item.questionId, ageMs: item.ageMs, sufficientlyEvidenced: item.sufficientlyEvidenced,
      availableSourceCount: item.availableSourceCount, requiredSourceCount: 3,
      refreshAttempted: item.refreshAttempted, refreshFailed: item.refreshFailed || partialQueryCoverage })) });
  if (partialQueryCoverage && decision.outcome === "completed") {
    decision = {
      ...decision,
      outcome: "completed_limited",
      settlement: "refund",
      reasons: uniqueReasons([
        ...decision.reasons,
        "Partial public-search query coverage from prefix or incomplete observation set."
      ])
    };
  }
  const retrievals = snapshots.flatMap(({ retrievals: values }) => values);
  const sourceGraph = runForensicsTraceGate(input.trace, "public_source_evidence_graph_build", { phase: "source_retrieval", sourceCount: retrievals.length },
    () => buildPublicSourceEvidenceGraph({ observations, retrievals,
      customerRegistrableDomain: new URL(input.targetUrl).hostname, competitorRegistrableDomains: [] }));
  const graphGuardStarted = Date.now(); input.trace?.emit("step_started", "public_source_evidence_graph_contract", { phase: "source_retrieval", sourceCount: retrievals.length });
  // Graph dimensions must equal effective plan before we freeze resume identity (B4: parse before checkpoint).
  if (!queryIdSetsEqual(sourceGraph.dimensions.queryVariantIds, fanoutQueryIds(effectiveFanouts))) {
    failForensicsGate(input.trace, "public_source_evidence_graph_contract", graphGuardStarted, new PublicSourceQueryVariantCoverageError(
      "$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.", { safeDiagnostics: forensicsTrace("pre_graph_guard", fanouts, snapshots, observedIds, effectiveFanouts, sourceGraph) }
    ));
  }
  input.trace?.emit("step_succeeded", "public_source_evidence_graph_contract", {
    phase: "source_retrieval", snapshotCount: snapshots.length, sourceCount: retrievals.length,
    disposition: partialQueryCoverage ? "partial" : "complete", durationMs: Date.now() - graphGuardStarted
  });
  const priceMicros = 29_000_000;
  const zh = input.locale.toLowerCase().startsWith("zh");
  const partialLimitation = partialQueryCoverage
    ? (zh
      ? "公开搜索查询仅为部分覆盖（前缀/不完整观测复用）；结果为受限交付，不是完整 fanout 审计。"
      : "Public-search query coverage is partial (prefix or incomplete observation reuse); delivery is limited, not a full-fanout audit.")
    : null;
  const snapshotRefs = snapshots.map((snapshot, index) => ({ snapshotId: snapshot.snapshotId,
    questionId: snapshot.questionId, queryVariantIds: effectiveFanouts[index]!.queries.map(({ id }) => id), observationIds: snapshot.observations.map(({ observationId }) => observationId),
    freshness: snapshot.ageMs <= 7*24*60*60*1_000 ? ("fresh" as const) : snapshot.ageMs <= 30*24*60*60*1_000 ? ("stale" as const) : ("expired" as const),
    observedAt: snapshot.observedAt, collectedForThisRun: snapshot.collectedForThisRun }));
  let report: RecommendationForensicReportV2; const reportBuildStarted = Date.now(); input.trace?.emit("step_started", "public_source_report_build", { phase: "source_retrieval" });
  try {
    report = (input.dependencies.buildReport ?? buildPublicSourceForensicReport)({ reportId: input.reportId, jobId: input.jobId,
      targetUrl: input.targetUrl, locale: input.locale, region: input.region, generatedAt: evidenceCutoffAt, evidenceCutoffAt,
      questions, fanouts: effectiveFanouts, authority, snapshotRefs,
      coverage: { status: decision.outcome === "completed" ? "complete" : decision.outcome === "completed_limited" ? "partial" : "insufficient",
        completedQueryCount: observations.filter(({ status }) => status === "complete" || status === "partial").length,
        expectedQueryCount: effectiveFanouts.reduce((sum, fanout) => sum + fanout.queries.length, 0), observedResultCount: observations.reduce((sum, item) => sum + item.results.length, 0),
        surfaceDomainCount: new Set(observations.flatMap(({ results }) => results.map(({ displayedHost }) => displayedHost))).size, reasons: decision.reasons },
      sourceGraph, websiteFoundationAppendix: input.websiteFoundation, commercialOutcome: decision.outcome,
      cost: { searchCostMicros: actualCostMicros, retrievalCostMicros: 0, synthesisCostMicros: 0, artifactCostMicros: 0, deliveryCostMicros: 0,
        allocatedSharedCostMicros: snapshots.reduce((sum,item)=>sum+item.allocatedCostMicros,0), avoidedCostMicros: snapshots.reduce((sum,item)=>sum+item.avoidedCostMicros,0),
        priceMicros, refundMicros: decision.settlement === "refund" ? priceMicros : 0 },
      ...(partialLimitation ? { additionalLimitations: [partialLimitation] } : {}),
      ...(input.semanticValidation === "deferred" ? { semanticValidation: "deferred" as const } : {}) });
  } catch (error) {
    input.trace?.failed("public_source_report_build", { phase: "source_retrieval", durationMs: Date.now() - reportBuildStarted }, error);
    throw mapForensicReportContractError(error, forensicsTrace("report_parser", fanouts, snapshots, observedIds, effectiveFanouts, sourceGraph, snapshotRefs));
  }
  input.trace?.emit("step_succeeded", "public_source_report_build", {
    phase: "source_retrieval", snapshotCount: snapshots.length, outcome: decision.outcome, durationMs: Date.now() - reportBuildStarted
  });
  // B4: only after a parseable report do we freeze publicSourceForensics resume identity.
  const checkpoint = createCheckpoint({ input, questions, fanouts: effectiveFanouts, snapshots, evidenceCutoffAt, authority });
  if (prior && prior.identityHash !== checkpoint.identityHash) {
    // Only a re-fetch of an unavailable prior snapshot may move the checkpoint
    // identity; genuine authority drift (question set, foundation hash) already
    // failed above and any other divergence stays permanent.
    if (!resolutions.some(({ reFetched }) => reFetched)) throw new PublicSourceResumeIdentityMismatchError();
    await tracePaidV3DirectStep(input.trace, "public_source_checkpoint_persist", {
      phase: "source_retrieval", snapshotCount: snapshots.length
    }, () => input.dependencies.saveCheckpoint(input.jobId, checkpoint));
  } else if (!prior) {
    await tracePaidV3DirectStep(input.trace, "public_source_checkpoint_persist", {
      phase: "source_retrieval", snapshotCount: snapshots.length
    }, () => input.dependencies.saveCheckpoint(input.jobId, checkpoint));
  }
  const commercialSnapshotRefs: PublicSourceCommercialSnapshotRef[] = snapshots.map((item) => ({
    snapshotId: item.snapshotId, cacheIdentity: item.cacheIdentity,
    freshnessState: item.ageMs <= 7 * 24 * 60 * 60 * 1_000 ? "fresh" : item.ageMs <= 30 * 24 * 60 * 60 * 1_000 ? "historical" : "insufficient",
    actualCostMicros: item.actualCostMicros, allocatedCostMicros: item.allocatedCostMicros, avoidedCostMicros: item.avoidedCostMicros
  }));
  input.signal?.throwIfAborted();
  if (input.dependencies.prepareArtifactVerification) await tracePaidV3DirectStep(input.trace, "public_source_prepare_artifact", {
    phase: "artifact_verification", snapshotCount: snapshots.length
  }, () => input.dependencies.prepareArtifactVerification!({ jobId: input.jobId, report, checkpoint, commercialSnapshotRefs }));
  input.signal?.throwIfAborted();
  await tracePaidV3DirectStep(input.trace, "public_source_artifact_readiness", {
    phase: "artifact_verification"
  }, () => input.dependencies.artifactReadiness.verify(report));
  input.signal?.throwIfAborted();
  const stored = input.dependencies.deferReportPersistence ? report : await tracePaidV3DirectStep(input.trace, "public_source_report_persist", {
    phase: "source_retrieval", outcome: decision.outcome
  }, () => input.dependencies.saveReport(report));
  if (stored.reportId !== input.reportId || stored.jobId !== input.jobId || stored.commercialOutcome !== decision.outcome) throw new PublicSourceReportOutcomeMismatchError();
  input.trace?.emit("gate_result", "public_source_forensics_summary", {
    phase: "source_retrieval", snapshotCount: snapshots.length, sourceCount: retrievals.length,
    outcome: decision.outcome, disposition: "ready"
  });
  return { report: stored, checkpoint, commercialSnapshotRefs };
}

function runForensicsTraceGate<T>(trace: PaidV3DirectDebugTrace | undefined, step: string, details: PaidV3DirectDebugTraceDetails, operation: () => T): T {
  const started = Date.now(), finished = () => ({ ...details, durationMs: Date.now() - started }); trace?.emit("step_started", step, details);
  try {
    const value = operation();
    trace?.emit("step_succeeded", step, finished());
    return value;
  } catch (error) {
    trace?.failed(step, finished(), error);
    throw error;
  }
}

function failForensicsGate(trace: PaidV3DirectDebugTrace | undefined, step: string, started: number, error: Error): never { trace?.failed(step, { phase: "source_retrieval", durationMs: Date.now() - started }, error); throw error; }

function uniqueReasons(reasons: readonly string[]): string[] {
  return [...new Set(reasons.filter((reason) => reason.trim()))];
}

/** Map forensic parse TypeErrors for query/snapshot set mismatches to permanent JobErrors (W-A). */
export function mapForensicReportContractError(error: unknown, safeDiagnostics?: import("./job-errors").SafeDiagnostics): never {
  if (error instanceof PublicSourceQueryVariantCoverageError || error instanceof PublicSourceSnapshotQueryBindingError) {
    throw (error as JobError).attachSafeDiagnostics(safeDiagnostics);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("$.sourceGraph.dimensions.queryVariantIds")) {
    throw new PublicSourceQueryVariantCoverageError(message, { cause: error instanceof Error ? error : undefined, safeDiagnostics });
  }
  if (message.includes("$.snapshotRefs") && /query|snapshot reference/i.test(message)) {
    throw new PublicSourceSnapshotQueryBindingError(message, { cause: error instanceof Error ? error : undefined, safeDiagnostics });
  }
  throw error;
}

function forensicsTrace(origin: "pre_graph_guard" | "report_parser", planned: SearchQueryFanout[], snapshots: ResolvedPublicSourceSnapshot[], observed: string[], effective: SearchQueryFanout[], graph?: { dimensions: { queryVariantIds: readonly string[] } }, snapshotRefs: readonly { questionId: string; queryVariantIds: readonly string[] }[] = []): import("./job-errors").SafeDiagnostics | undefined {
  try {
    const plan = fanoutQueryIds(planned), graphIds = graph?.dimensions.queryVariantIds ?? [], ref = new Map(snapshotRefs.map((item) => [item.questionId, item.queryVariantIds]));
    const q = planned.map((fanout, i) => { const ids = fanoutQueryIds([fanout]), observedIds = observationsForQuestion(snapshots, fanout.questionId), effectiveIds = fanoutQueryIds(effective.filter((item) => item.questionId === fanout.questionId)); const graphForQuestion = graphIds.filter((id) => ids.includes(id)); const refIds = ref.get(fanout.questionId) ?? []; return { i, p: ids.length, ph: traceHash(ids), o: observedIds.length, oh: traceHash(observedIds), e: effectiveIds.length, eh: traceHash(effectiveIds), g: graphForQuestion.length, gh: traceHash(graphForQuestion), s: refIds.length, sh: traceHash(refIds) }; });
    return { version: 1, origin, revision: deploymentRevision(), questions: q, global: traceCounts(plan, observed, fanoutQueryIds(effective), graphIds, snapshotRefs.flatMap((item) => item.queryVariantIds)), flags: { d: [plan, snapshots.flatMap((item) => item.observations.map(({ queryId }) => queryId)), graphIds].some((ids) => new Set(ids).size !== ids.length), x: hasExtraObservedQueryIds(observed, plan), z: planned.some((fanout) => !observationsForQuestion(snapshots, fanout.questionId).length) } };
  } catch { return undefined; }
}
function observationsForQuestion(snapshots: ResolvedPublicSourceSnapshot[], questionId: string): string[] { return observationQueryIds(snapshots.filter((item) => item.questionId === questionId).flatMap((item) => item.observations)); }
function traceHash(ids: readonly string[]): string { return createHash("sha256").update(JSON.stringify([...new Set(ids)].sort())).digest("hex").slice(0, 12); }
function traceCounts(plan: readonly string[], observed: readonly string[], effective: readonly string[], graph: readonly string[], refs: readonly string[]): Record<string, unknown> { return { p0: plan.length, ph0: traceHash(plan), o0: observed.length, oh0: traceHash(observed), e0: effective.length, eh0: traceHash(effective), g0: graph.length, gh0: traceHash(graph), s0: refs.length, sh0: traceHash(refs) }; }
function deploymentRevision(): string { const value = process.env.OGC_DEPLOYMENT_VERSION?.trim(); return value && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : "unknown"; }

export function createPublicSourceQuestionFanouts(input: {
  questions: CanonicalBuyerQuestionSet;
  authority: PublicSearchSurfaceAuthority;
  excludedIdentities: readonly CustomerIdentityExclusion[];
  ordinals?: readonly number[];
}): SearchQueryFanout[] {
  const ordinals = input.ordinals ?? input.questions.questions.map((_, index) => index);
  if (!ordinals.length || new Set(ordinals).size !== ordinals.length || ordinals.some((ordinal) => !Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= input.questions.questions.length)) throw new TypeError("Public-source fanout ordinals are invalid.");
  return ordinals.map((ordinal) => createSearchQueryFanout({
    question: input.questions.questions[ordinal]!, surface: input.authority.surface, resultDepth: 3,
    budget: { ...DEFAULT_QUERY_BUDGET, maxResults: 3, timeoutMs: 60_000 }, excludedIdentities: input.excludedIdentities
  }));
}

function createCheckpoint(value: { input: Parameters<typeof runPublicSourceForensicsPipeline>[0]; questions: ReturnType<typeof generateCanonicalBuyerQuestions>; fanouts: SearchQueryFanout[]; snapshots: ResolvedPublicSourceSnapshot[]; evidenceCutoffAt: string; authority: PublicSearchSurfaceAuthority }): PublicSourcePipelineCheckpoint {
  const core = { methodology: "public_search_source_forensics_v1" as const, questionSetVersion: value.questions.questionSetVersion,
    fanoutVersion: value.fanouts[0]!.fanoutVersion, authorityId: value.authority.authorityId,
    snapshotIds: value.snapshots.map(({ snapshotId }) => snapshotId), websiteFoundationHash: stableJsonHash(value.input.websiteFoundation),
    evidenceCutoffAt: value.evidenceCutoffAt, locale: value.input.locale, region: value.input.region,
    adapterIdentityHash: adapterIdentityHash(value.authority) };
  return { ...core, identityHash: sha(core) };
}
function checkpointFromReport(report: RecommendationForensicReportV2, foundation: AiWebsiteReportV1): PublicSourcePipelineCheckpoint { const core={ methodology: report.methodology, questionSetVersion: report.questions.questionSetVersion, fanoutVersion: report.fanouts[0]!.fanoutVersion, authorityId: report.authority.authorityId, snapshotIds: report.snapshotRefs.map(({snapshotId})=>snapshotId), websiteFoundationHash:stableJsonHash(foundation), evidenceCutoffAt:report.evidenceCutoffAt, locale:report.locale, region:report.region, adapterIdentityHash:adapterIdentityHash(report.authority) }; return {...core,identityHash:sha(core)}; }
function adapterIdentityHash(authority: PublicSearchSurfaceAuthority): string { return sha({ adapterVersion: authority.surface.adapterVersion, providerId: authority.surface.providerId, productId: authority.surface.productId, modelSurface: authority.surface.surfaceId, surfaceVersion: authority.surface.surfaceVersion, locale: authority.surface.locale, region: authority.surface.region }); }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export class PublicSourceAuthorityUnavailableError extends Error {}
export class PublicSourceQuestionGenerationError extends Error {}
export class PublicSourceResumeIdentityMismatchError extends Error {
  constructor(message?: string) { super(message); this.name = new.target.name; }
}
export class PublicSourceArtifactUnavailableError extends Error {}
export class PublicSourceReportOutcomeMismatchError extends Error {}

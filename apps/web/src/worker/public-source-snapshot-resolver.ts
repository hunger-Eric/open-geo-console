import { createHash } from "node:crypto";
import type { ProviderEvidencePassage, RetrievedPublicSourceFact } from "@open-geo-console/citation-intelligence";
import {
  createMarketSnapshotIdentity,
  deterministicId,
  observePublicSearch,
  type CanonicalBuyerQuestion,
  type MarketSearchObservation,
  type PublicSearchSurfaceAdapter,
  type PublicSearchSurfaceAuthority,
  type SearchObservationStatus,
  type SearchQueryFanout,
  type SearchQueryVariant
} from "@open-geo-console/public-search-observer";
import { canonicalizePublicSourceUrl } from "@open-geo-console/citation-intelligence";
import {
  acquireMarketSnapshotLease,
  appendMarketSearchObservations,
  appendMarketSnapshotQueries,
  appendMarketSourceEvidence,
  beginMarketSearchAttempt,
  completeMarketSearchAttempt,
  completeMarketSnapshotLease,
  createMarketSnapshotRefresh,
  findResumableMarketSnapshot,
  findExactMarketSnapshot,
  getMarketSnapshotBundle,
  releaseFailedMarketSnapshotLease,
  waitForMarketSnapshot,
  type SourceEvidenceInput
} from "@/db/market-snapshots";
import { appendMarketSourcePassages } from "@/db/provider-evidence";
import { createConcurrencyGate, mapWithConcurrency, type ConcurrencyGate } from "./bounded-scheduler";
import { JobError } from "./job-errors";
import { createPublicSourceRetrievalPlan } from "./public-source-plan";

export interface ResolvedPublicSourceSnapshotValue {
  snapshotId: string;
  cacheIdentity: string;
  questionId: string;
  observedAt: string;
  ageMs: number;
  collectedForThisRun: boolean;
  refreshAttempted: boolean;
  refreshFailed: boolean;
  sufficientlyEvidenced: boolean;
  availableSourceCount: number;
  observations: MarketSearchObservation[];
  retrievals: RetrievedPublicSourceFact[];
  actualCostMicros: number;
  allocatedCostMicros: number;
  avoidedCostMicros: number;
}

export interface InjectedPublicSourceRetrieval {
  fact: RetrievedPublicSourceFact;
  source: Omit<SourceEvidenceInput, "id" | "snapshotId" | "observationId" | "canonicalUrl" | "registrableDomain" | "retrievedAt" | "expiresAt">;
}

export type PublicSourceRetriever = (input: {
  observation: MarketSearchObservation;
  result: MarketSearchObservation["results"][number];
  signal: AbortSignal;
}) => Promise<InjectedPublicSourceRetrieval>;

export interface ResolvePublicSourceSnapshotInput {
  authority: PublicSearchSurfaceAuthority;
  adapter: PublicSearchSurfaceAdapter;
  question: CanonicalBuyerQuestion;
  fanout: SearchQueryFanout;
  evidenceCutoffAt: string;
  leaseOwner: string;
  leaseDurationMs?: number;
  waitDeadlineMs?: number;
  signal?: AbortSignal;
  retrieveSource?: PublicSourceRetriever;
  retrievalGate?: ConcurrencyGate;
  forceRefresh?: boolean;
  forceRefreshAfter?: string;
  maxSourceRetrievals?: number;
  maxAvailableSources?: number;
  maxSourcesPerDomain?: number;
  selectProviderPassages?: (input: { fact: RetrievedPublicSourceFact; sourceEvidenceId: string }) => ProviderEvidencePassage[];
  snapshotMetadata?: {
    snapshotKind: "standard_question" | "provider_discovery" | "candidate_verification";
    parentSnapshotId?: string | null;
    candidateSetHash?: string | null;
    queryPlanVersion: string;
  };
}

const DEFAULT_LEASE_DURATION_MS = 5 * 60_000;
const DEFAULT_WAIT_DEADLINE_MS = 15_000;

export async function resolvePublicSourceSnapshot(input: ResolvePublicSourceSnapshotInput): Promise<ResolvedPublicSourceSnapshotValue> {
  assertExactRuntime(input);
  const evidenceCutoff = date(input.evidenceCutoffAt, "evidenceCutoffAt");
  const identity = createMarketSnapshotIdentity({ question: input.question, surface: input.authority.surface, fanoutVersion: input.fanout.fanoutVersion });
  const exactPrior = await findExactMarketSnapshot({ identity, evidenceCutoff });
  const prior = exactPrior && snapshotMetadataMatches(exactPrior.snapshot, input.snapshotMetadata) ? exactPrior : null;
  const metadataMismatch = Boolean(exactPrior && !prior);
  const refreshBoundary=input.forceRefreshAfter?date(input.forceRefreshAfter,"forceRefreshAfter"):null;
  const forceRefresh=input.forceRefresh===true||metadataMismatch||Boolean(refreshBoundary&&(!prior?.snapshot.completedAt||prior.snapshot.completedAt<refreshBoundary));
  if (prior&&!forceRefresh) return resolveExisting({ ...input, identity, evidenceCutoff, snapshotId: prior.snapshot.id, ageMs: prior.ageMs });

  const leaseDurationMs = positive(input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS, "leaseDurationMs");
  const claim = await acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: input.leaseOwner, leaseDurationMs, forceRefresh });
  if (!claim.acquired) {
    if (claim.state === "completed") {
      const terminal = claim.lease.terminalSnapshotId
        ? await getMarketSnapshotBundle(claim.lease.terminalSnapshotId)
        : null;
      if (!terminal || terminal.snapshot.surfaceAuthorityVersion !== input.authority.authorityId) {
        throw new PublicSourceSnapshotAuthorityMismatchError();
      }
      if (forceRefresh) throw new PublicSourceSnapshotAuthorityMismatchError();
      return resolvePublicSourceSnapshot({ ...input, forceRefresh: true, leaseDurationMs });
    }
    const waited = await waitForMarketSnapshot({
      identity,
      deadline: new Date(Date.now() + positive(input.waitDeadlineMs ?? DEFAULT_WAIT_DEADLINE_MS, "waitDeadlineMs")),
      signal: input.signal,
      acceptSnapshot: (snapshot) => snapshotMetadataMatches(snapshot, input.snapshotMetadata)
    });
    if (waited.status === "completed") return resolveExisting({ ...input, identity, evidenceCutoff, snapshotId: waited.snapshot.id, ageMs: Math.max(0, evidenceCutoff.getTime() - (waited.snapshot.completedAt?.getTime() ?? evidenceCutoff.getTime())) });
    if (waited.status === "takeover_available" || waited.status === "released_retryable") {
      return resolvePublicSourceSnapshot({ ...input, leaseDurationMs, waitDeadlineMs: input.waitDeadlineMs });
    }
    throw new PublicSourceSnapshotUnavailableError("lease_wait");
  }

  let snapshotId: string | undefined;
  let failureStage: PublicSourceSnapshotFailureStage = "search_execution";
  try {
    const resumable = claim.takeover && !forceRefresh ? await findResumableMarketSnapshot({ identity, authorityVersion: input.authority.authorityId }) : null;
    const resumed = resumable && snapshotMetadataMatches(resumable, input.snapshotMetadata) ? resumable : null;
    const snapshot = resumed ?? await createMarketSnapshotRefresh({
      identity, authorityVersion: input.authority.authorityId, token: claim.token, questionHash: sha(input.question.normalizedText),
      ...(input.snapshotMetadata ? {
        snapshotKind: input.snapshotMetadata.snapshotKind,
        parentSnapshotId: input.snapshotMetadata.parentSnapshotId,
        candidateSetHash: input.snapshotMetadata.candidateSetHash,
        queryPlanVersion: input.snapshotMetadata.queryPlanVersion
      } : {})
    });
    const currentSnapshotId = snapshot.id;
    snapshotId = currentSnapshotId;
    // A canonical fanout variant can be refreshed more than once. Its storage
    // row must therefore be snapshot-scoped; the table's primary key is global.
    const queries = input.fanout.queries.map((query, queryOrder) => ({
      id: snapshotQueryId(currentSnapshotId, query.id), queryOrder, queryText: query.exactQuery, queryHash: sha(query.exactQuery), derivationRule: query.derivationRuleId
    }));
    let observations: MarketSearchObservation[];
    let successful: Array<{ observation: MarketSearchObservation; attemptId: string; storedQueryId: string }>;
    if (resumed) {
      failureStage = "snapshot_materialization";
      const bundle = await getMarketSnapshotBundle(currentSnapshotId);
      if (!bundle || !isResumableSearchLedger(bundle, queries)) {
        await releaseFailedMarketSnapshotLease({ token: claim.token, snapshotId: currentSnapshotId });
        snapshotId = undefined;
        return resolvePublicSourceSnapshot({ ...input, leaseDurationMs, waitDeadlineMs: input.waitDeadlineMs });
      }
      observations = toObservations(bundle, input.authority.surface, input.fanout);
      successful = observations.filter(({ status }) => status === "complete" || status === "partial").map((observation) => {
        const attempt = bundle.attempts.find(({ id }) => id === observation.observationId);
        if (!attempt) throw new PublicSourceSnapshotUnavailableError("snapshot_materialization");
        return { observation, attemptId: attempt.id, storedQueryId: attempt.queryId };
      });
    } else {
      failureStage = "search_execution";
      await appendMarketSnapshotQueries({ snapshotId: currentSnapshotId, token: claim.token, queries });
      const queryResults = await mapWithConcurrency(input.fanout.queries, 2, async (query, queryOrder) => {
        input.signal?.throwIfAborted();
        const storedQuery = queries[queryOrder]!;
        const attempt = await beginMarketSearchAttempt({
          snapshotId: currentSnapshotId, queryId: storedQuery.id, token: claim.token,
          idempotencyReference: deterministicId("public-search-attempt", [currentSnapshotId, storedQuery.id]), configuredCostMicros: input.fanout.budget.maxCostMicros
        });
        const observed = await observePublicSearch({ adapter: input.adapter, query, budget: input.fanout.budget, signal: input.signal ?? new AbortController().signal });
        // Provider observation identifiers are not guaranteed to be unique
        // across fanout queries. The persisted attempt is the authoritative,
        // snapshot-scoped observation identity used by retrieval provenance.
        const observation = { ...observed, observationId: attempt.id, queryId: query.id };
        const requestStatus = attemptStatus(observation.status);
        const providerCostMicros = observation.usage.providerReportedCostMicros ?? observation.usage.estimatedCostMicros ?? null;
        await completeMarketSearchAttempt({
          attemptId: attempt.id, token: claim.token, requestStatus, usage: observation.usage, providerCostMicros,
          costUncertain: observation.usage.costUncertain ?? providerCostMicros === null, sanitizedError: observation.sanitizedError ?? null
        });
        return { observation, attemptId: attempt.id, storedQueryId: storedQuery.id, successful: requestStatus === "succeeded" || requestStatus === "partial" };
      }, input.signal);
      observations = queryResults.map(({ observation }) => observation);
      successful = queryResults.filter(({ successful: value }) => value).map(({ observation, attemptId, storedQueryId }) => ({ observation, attemptId, storedQueryId }));
    }
    if (successful.length === 0) throw new PublicSourceSnapshotUnavailableError("search_execution");

    if (!resumed) {
      failureStage = "observation_normalization";
      const rows = successful.flatMap(({ observation, attemptId, storedQueryId }) => observationRows(currentSnapshotId, attemptId, storedQueryId, observation));
      failureStage = "observation_persistence";
      if (rows.length) await appendMarketSearchObservations({ token: claim.token, observations: rows });
    }
    failureStage = "source_retrieval";
    await appendRetrievals({ input, snapshotId: currentSnapshotId, token: claim.token, observations: successful, evidenceCutoff });
    failureStage = "snapshot_materialization";
    const persistedBundle = await getMarketSnapshotBundle(currentSnapshotId);
    if (!persistedBundle) throw new PublicSourceSnapshotUnavailableError("snapshot_materialization");
    const retrievals = factsFromBundle(persistedBundle, input.fanout);
    failureStage = "snapshot_completion";
    const completed = await completeMarketSnapshotLease({ snapshotId: currentSnapshotId, token: claim.token, queryFanoutHash: fanoutHash(input.fanout), completedAt: new Date() });
    failureStage = "snapshot_materialization";
    return materialize({
      snapshot: completed,
      questionId: input.question.id,
      observations,
      retrievals,
      collectedForThisRun: true,
      evidenceCutoff
    });
  } catch (error) {
    await releaseFailedMarketSnapshotLease({ token: claim.token, ...(snapshotId ? { snapshotId } : {}), preserveRefreshingSnapshot: input.signal?.aborted === true }).catch(() => undefined);
    if (input.signal?.aborted) throw input.signal.reason;
    if (error instanceof PublicSourceSnapshotUnavailableError || error instanceof PublicSourceSnapshotAuthorityMismatchError) throw error;
    throw new PublicSourceSnapshotUnavailableError(failureStage, { cause: error });
  }
}

async function resolveExisting(input: ResolvePublicSourceSnapshotInput & { identity: ReturnType<typeof createMarketSnapshotIdentity>; evidenceCutoff: Date; snapshotId: string; ageMs: number }): Promise<ResolvedPublicSourceSnapshotValue> {
  const bundle = await getMarketSnapshotBundle(input.snapshotId);
  if (!bundle || bundle.snapshot.status !== "completed" || bundle.snapshot.surfaceAuthorityVersion !== input.authority.authorityId) {
    throw new PublicSourceSnapshotAuthorityMismatchError();
  }
  if (!snapshotMetadataMatches(bundle.snapshot, input.snapshotMetadata)) throw new PublicSourceSnapshotAuthorityMismatchError();
  const observations = toObservations(bundle, input.authority.surface, input.fanout);
  const retrievals = factsFromBundle(bundle, input.fanout);
  const cost = knownCost(bundle.attempts);
  return {
    snapshotId: bundle.snapshot.id, cacheIdentity: bundle.snapshot.cacheIdentity, questionId: input.question.id,
    observedAt: bundle.snapshot.completedAt!.toISOString(), ageMs: input.ageMs, collectedForThisRun: false, refreshAttempted: false,
    refreshFailed: false, sufficientlyEvidenced: retrievals.length > 0, availableSourceCount: retrievals.length, observations, retrievals,
    actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: cost
  };
}

async function appendRetrievals(input: { input: ResolvePublicSourceSnapshotInput; snapshotId: string; token: Parameters<typeof appendMarketSourceEvidence>[0]["token"]; observations: Array<{ observation: MarketSearchObservation; attemptId: string; storedQueryId: string }>; evidenceCutoff: Date }): Promise<RetrievedPublicSourceFact[]> {
  const maxSourceRetrievals = positive(input.input.maxSourceRetrievals ?? 12, "maxSourceRetrievals");
  const maxAvailableSources = positive(input.input.maxAvailableSources ?? 3, "maxAvailableSources");
  const plan = createPublicSourceRetrievalPlan(input.observations.map(({ observation }) => observation), {
    maxSources: maxSourceRetrievals,
    maxPerDomain: positive(input.input.maxSourcesPerDomain ?? 2, "maxSourcesPerDomain")
  });
  const existingBundle = await getMarketSnapshotBundle(input.snapshotId);
  const existingFacts = existingBundle ? factsFromBundle(existingBundle, input.input.fanout) : [];
  const existingSourceKeys = new Set(existingBundle?.sources.map((source) => `${source.observationId}\n${source.canonicalUrl}`) ?? []);
  const storedQueryIds = new Map(input.observations.map(({ observation, storedQueryId }) => [observation.observationId, storedQueryId]));
  const gate = input.input.retrievalGate ?? createConcurrencyGate(4);
  let availableCount = existingFacts.length;
  const retrieved = await Promise.all(plan.filter(({ observation, result, canonicalUrl }) => {
    const storedQueryId = storedQueryIds.get(observation.observationId);
    if (!storedQueryId) throw new PublicSourceSnapshotUnavailableError("source_retrieval");
    return !existingSourceKeys.has(`${observationId(input.snapshotId, storedQueryId, result.surfaceResultOrder, canonicalUrl)}\n${canonicalUrl}`);
  }
  ).map(({ observation, result, canonicalUrl, registrableDomain }) => gate.run(async () => {
    input.input.signal?.throwIfAborted();
    if (input.input.retrieveSource && availableCount >= maxAvailableSources) return null;
    const storedQueryId = storedQueryIds.get(observation.observationId);
    if (!storedQueryId) throw new PublicSourceSnapshotUnavailableError("source_retrieval");
    const base = { id: deterministicId("market-source", [input.snapshotId, storedQueryId, String(result.surfaceResultOrder), canonicalUrl]), snapshotId: input.snapshotId, observationId: observationId(input.snapshotId, storedQueryId, result.surfaceResultOrder, canonicalUrl), canonicalUrl, registrableDomain, retrievedAt: input.evidenceCutoff, expiresAt: new Date(input.evidenceCutoff.getTime() + 30 * 24 * 60 * 60 * 1_000) };
    if (!input.input.retrieveSource) {
      await appendMarketSourceEvidence({ token: input.token, sources: [{ ...base, retrievalState: "not_retrieved", sourceCategory: "unknown", entities: [], claims: [], contradictions: [], evidenceFamilyIdentity: deterministicId("evidence-family", [canonicalUrl]) }] });
      return null;
    }
    const value = await input.input.retrieveSource({ observation, result, signal: input.input.signal ?? new AbortController().signal });
    if (value.fact.observationId !== observation.observationId || value.fact.queryId !== observation.queryId || canonicalizePublicSourceUrl(value.fact.resultUrl) !== canonicalUrl) throw new PublicSourceSnapshotUnavailableError("source_retrieval");
    try {
      await appendMarketSourceEvidence({ token: input.token, sources: [{ ...base, ...value.source }] });
    } catch (error) {
      input.input.signal?.throwIfAborted();
      // Public pages can contain email addresses, IP literals, credential-like
      // examples, or unsupported annotation keys. The shared evidence store
      // intentionally rejects that material. Treat the individual source as
      // inaccessible instead of failing the entire question snapshot. A real
      // lease/database failure also rejects this safe fallback and therefore
      // still fails closed with the original error.
      try {
        await appendMarketSourceEvidence({ token: input.token, sources: [{
          ...base,
          retrievalState: "inaccessible",
          sourceCategory: "unknown",
          entities: [],
          claims: [],
          contradictions: [],
          evidenceFamilyIdentity: deterministicId("evidence-family", [canonicalUrl])
        }] });
      } catch {
        throw error;
      }
      return null;
    }
    if (value.fact.retrievalState === "available" && input.input.selectProviderPassages) {
      const passages = input.input.selectProviderPassages({ fact: value.fact, sourceEvidenceId: base.id });
      if (passages.length) await appendMarketSourcePassages({ token: input.token, passages });
    }
    if (value.fact.retrievalState === "available") availableCount += 1;
    return value.fact;
  }, input.input.signal)));
  return [...existingFacts, ...retrieved.filter((value): value is RetrievedPublicSourceFact => value !== null)];
}

function isResumableSearchLedger(bundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>, queries: Array<{ id: string; queryOrder: number; queryText: string; queryHash: string; derivationRule: string }>): boolean {
  const terminalStatuses = new Set(["succeeded", "partial", "timeout", "rate_limited", "unavailable", "malformed", "aborted", "authentication", "unsupported"]);
  return bundle.snapshot.status === "refreshing" && bundle.queries.length === queries.length &&
    queries.every((query, index) => bundle.queries[index]?.id === query.id && bundle.queries[index]?.queryText === query.queryText) &&
    bundle.attempts.length === queries.length && bundle.attempts.every(({ requestStatus }) => terminalStatuses.has(requestStatus)) &&
    bundle.attempts.some(({ requestStatus }) => requestStatus === "succeeded" || requestStatus === "partial") &&
    queries.every(({ id }) => bundle.attempts.some((attempt) => attempt.queryId === id));
}

function factsFromBundle(bundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>, fanout: SearchQueryFanout): RetrievedPublicSourceFact[] {
  return bundle.sources.flatMap((source) => {
    if (source.retrievalState !== "available" || !source.excerpt || !source.contentHash) return [];
    const storedObservation = bundle.observations.find((observation) => observation.id === source.observationId);
    const attempt = storedObservation && bundle.attempts.find((candidate) => candidate.id === storedObservation.attemptId);
    const storedQuery = storedObservation && bundle.queries.find((query) => query.id === storedObservation.queryId);
    const query = storedQuery && fanout.queries[storedQuery.queryOrder];
    if (!storedObservation || !attempt || !storedQuery || !query || query.exactQuery !== storedQuery.queryText) return [];
    return [{ observationId: attempt.id, queryId: query.id, resultUrl: source.canonicalUrl, finalUrl: source.canonicalUrl, retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true, accessBarrier: "none" as const, normalizedText: source.excerpt, normalizedContentHash: source.contentHash, verifiedExcerpt: source.excerpt }];
  });
}

function materialize(input: { snapshot: Awaited<ReturnType<typeof completeMarketSnapshotLease>>; questionId: string; observations: MarketSearchObservation[]; retrievals: RetrievedPublicSourceFact[]; collectedForThisRun: boolean; evidenceCutoff: Date }): ResolvedPublicSourceSnapshotValue {
  const cost = input.observations.reduce((total, observation) => total + (observation.usage.providerReportedCostMicros ?? observation.usage.estimatedCostMicros ?? 0), 0);
  return {
    snapshotId: input.snapshot.id, cacheIdentity: input.snapshot.cacheIdentity, questionId: input.questionId, observedAt: input.snapshot.completedAt!.toISOString(),
    ageMs: Math.max(0, input.evidenceCutoff.getTime() - input.snapshot.completedAt!.getTime()), collectedForThisRun: input.collectedForThisRun, refreshAttempted: true, refreshFailed: false,
    sufficientlyEvidenced: input.retrievals.length > 0, availableSourceCount: input.retrievals.length, observations: input.observations, retrievals: input.retrievals,
    actualCostMicros: cost, allocatedCostMicros: cost, avoidedCostMicros: 0
  };
}

function observationRows(snapshotId: string, attemptId: string, storedQueryId: string, observation: MarketSearchObservation) {
  return observation.results.map((result) => {
    const canonicalUrl = canonicalizePublicSourceUrl(result.url);
    return { id: observationId(snapshotId, storedQueryId, result.surfaceResultOrder, canonicalUrl), snapshotId, queryId: storedQueryId, attemptId,
      surfaceResultOrder: result.surfaceResultOrder, resultUrl: result.url, canonicalUrl, title: result.title, snippet: result.snippet,
      resultStatus: "returned" as const, resultMetadata: { domain: result.displayedHost, rank: result.surfaceResultOrder }, contentHash: sha(canonicalUrl), observedAt: date(observation.completedAt, "observation.completedAt") };
  });
}

function toObservations(bundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>, surface: PublicSearchSurfaceAdapter["surface"], fanout: SearchQueryFanout): MarketSearchObservation[] {
  return bundle.attempts.filter(({ requestStatus }) => requestStatus !== "pending").map((attempt) => {
    const storedQuery = bundle.queries.find(({ id }) => id === attempt.queryId);
    const query = storedQuery && fanout.queries[storedQuery.queryOrder];
    if (!storedQuery || !query || query.exactQuery !== storedQuery.queryText || !attempt.completedAt) throw new PublicSourceSnapshotUnavailableError("snapshot_materialization");
    const status = observationStatus(attempt.requestStatus);
    return { observationId: attempt.id, surface, queryId: query.id, exactQuery: query.exactQuery, requestedAt: attempt.startedAt.toISOString(), completedAt: attempt.completedAt.toISOString(), status,
      results: bundle.observations.filter((row) => row.attemptId === attempt.id && row.resultStatus === "returned").map((row) => ({ surfaceResultOrder: row.surfaceResultOrder, url: row.resultUrl, title: row.title, snippet: row.snippet ?? "", displayedHost: String((row.resultMetadata as { domain?: unknown })?.domain ?? new URL(row.resultUrl).hostname), metadata: { rank: row.surfaceResultOrder } })),
      usage: attempt.usage as MarketSearchObservation["usage"], ...(attempt.sanitizedError ? { sanitizedError: attempt.sanitizedError } : {}) };
  });
}

function assertExactRuntime(input: ResolvePublicSourceSnapshotInput): void {
  const authority = input.authority;
  if (!authority.active || input.adapter.authority.authorityId !== authority.authorityId || input.adapter.id.trim() === "" ||
      JSON.stringify(input.adapter.surface) !== JSON.stringify(authority.surface) || JSON.stringify(input.adapter.authority.surface) !== JSON.stringify(authority.surface) ||
      input.question.id !== input.fanout.questionId || input.question.questionSetVersion !== input.fanout.questionSetVersion ||
      input.question.locale !== authority.surface.locale || input.question.region !== authority.surface.region ||
      input.fanout.surface.surfaceId !== authority.surface.surfaceId || input.fanout.surface.surfaceVersion !== authority.surface.surfaceVersion ||
      input.fanout.surface.locale !== authority.surface.locale || input.fanout.surface.region !== authority.surface.region ||
      input.fanout.queries.length === 0 || input.fanout.queries.some((query) => !sameQuery(query, input.fanout))) throw new PublicSourceSnapshotAuthorityMismatchError();
}

function sameQuery(query: SearchQueryVariant, fanout: SearchQueryFanout): boolean { return query.questionId === fanout.questionId && query.fanoutVersion === fanout.fanoutVersion && query.locale === fanout.surface.locale && query.region === fanout.surface.region; }
function attemptStatus(status: SearchObservationStatus): "succeeded" | "partial" | "timeout" | Exclude<SearchObservationStatus, "complete" | "partial" | "timed_out"> { return status === "complete" ? "succeeded" : status === "timed_out" ? "timeout" : status; }
function observationStatus(status: string): SearchObservationStatus {
  if (status === "succeeded") return "complete";
  if (status === "timeout") return "timed_out";
  if (status === "partial" || status === "rate_limited" || status === "unavailable" || status === "malformed" || status === "aborted" || status === "authentication" || status === "unsupported") return status;
  throw new PublicSourceSnapshotUnavailableError("snapshot_materialization");
}
function observationId(snapshotId: string, queryId: string, order: number, canonicalUrl: string): string { return deterministicId("market-observation", [snapshotId, queryId, String(order), canonicalUrl]); }
function snapshotQueryId(snapshotId: string, queryId: string): string { return deterministicId("market-snapshot-query", [snapshotId, queryId]); }
function fanoutHash(fanout: SearchQueryFanout): string { return sha(JSON.stringify({ questionId: fanout.questionId, questionSetVersion: fanout.questionSetVersion, fanoutVersion: fanout.fanoutVersion, surface: fanout.surface, queries: fanout.queries.map(({ id, exactQuery, derivationRuleId, resultDepth }) => ({ id, exactQuery, derivationRuleId, resultDepth })) })); }
function knownCost(attempts: Array<{ providerCostMicros: number | null }>): number { return attempts.reduce((total, attempt) => total + (attempt.providerCostMicros ?? 0), 0); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function snapshotMetadataMatches(
  snapshot: { snapshotKind: string; parentSnapshotId: string | null; candidateSetHash: string | null; queryPlanVersion: string },
  expected: ResolvePublicSourceSnapshotInput["snapshotMetadata"]
): boolean {
  const metadata = expected ?? { snapshotKind: "standard_question" as const, parentSnapshotId: null, candidateSetHash: null, queryPlanVersion: "legacy-standard-v1" };
  return snapshot.snapshotKind === metadata.snapshotKind && snapshot.parentSnapshotId === (metadata.parentSnapshotId ?? null) &&
    snapshot.candidateSetHash === (metadata.candidateSetHash ?? null) && snapshot.queryPlanVersion === metadata.queryPlanVersion;
}
function date(value: string, label: string): Date { const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw new TypeError(`${label} must be an ISO timestamp.`); return parsed; }
function positive(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < 1 || value > 60 * 60_000) throw new TypeError(`${label} is invalid.`); return value; }

export class PublicSourceSnapshotAuthorityMismatchError extends Error {}
export type PublicSourceSnapshotFailureStage =
  | "lease_wait"
  | "search_execution"
  | "observation_normalization"
  | "observation_persistence"
  | "source_retrieval"
  | "snapshot_completion"
  | "snapshot_materialization";

export class PublicSourceSnapshotUnavailableError extends JobError {
  constructor(
    readonly stage: PublicSourceSnapshotFailureStage = "snapshot_materialization",
    options?: ErrorOptions
  ) {
    super(
      `Public-source snapshot is unavailable at ${stage}.`,
      `public_source_snapshot_${stage}`,
      "transient",
      options
    );
  }
}

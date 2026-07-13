import { createHash } from "node:crypto";
import type { RetrievedPublicSourceFact } from "@open-geo-console/citation-intelligence";
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
import { canonicalizePublicSourceUrl, getPublicSourceDomainIdentity } from "@open-geo-console/citation-intelligence";
import {
  acquireMarketSnapshotLease,
  appendMarketSearchObservations,
  appendMarketSnapshotQueries,
  appendMarketSourceEvidence,
  beginMarketSearchAttempt,
  completeMarketSearchAttempt,
  completeMarketSnapshotLease,
  createMarketSnapshotRefresh,
  findExactMarketSnapshot,
  getMarketSnapshotBundle,
  releaseFailedMarketSnapshotLease,
  waitForMarketSnapshot,
  type SourceEvidenceInput
} from "@/db/market-snapshots";

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
}

const DEFAULT_LEASE_DURATION_MS = 5 * 60_000;
const DEFAULT_WAIT_DEADLINE_MS = 15_000;

export async function resolvePublicSourceSnapshot(input: ResolvePublicSourceSnapshotInput): Promise<ResolvedPublicSourceSnapshotValue> {
  assertExactRuntime(input);
  const evidenceCutoff = date(input.evidenceCutoffAt, "evidenceCutoffAt");
  const identity = createMarketSnapshotIdentity({ question: input.question, surface: input.authority.surface, fanoutVersion: input.fanout.fanoutVersion });
  const prior = await findExactMarketSnapshot({ identity, evidenceCutoff });
  if (prior) return resolveExisting({ ...input, identity, evidenceCutoff, snapshotId: prior.snapshot.id, ageMs: prior.ageMs });

  const leaseDurationMs = positive(input.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS, "leaseDurationMs");
  const claim = await acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: input.leaseOwner, leaseDurationMs });
  if (!claim.acquired) {
    if (claim.state === "completed") throw new PublicSourceSnapshotAuthorityMismatchError();
    const waited = await waitForMarketSnapshot({ identity, deadline: new Date(Date.now() + positive(input.waitDeadlineMs ?? DEFAULT_WAIT_DEADLINE_MS, "waitDeadlineMs")), signal: input.signal });
    if (waited.status === "completed") return resolveExisting({ ...input, identity, evidenceCutoff, snapshotId: waited.snapshot.id, ageMs: Math.max(0, evidenceCutoff.getTime() - (waited.snapshot.completedAt?.getTime() ?? evidenceCutoff.getTime())) });
    if (waited.status === "takeover_available" || waited.status === "released_retryable") {
      return resolvePublicSourceSnapshot({ ...input, leaseDurationMs, waitDeadlineMs: input.waitDeadlineMs });
    }
    throw new PublicSourceSnapshotUnavailableError();
  }

  let snapshotId: string | undefined;
  try {
    const snapshot = await createMarketSnapshotRefresh({
      identity, authorityVersion: input.authority.authorityId, token: claim.token, questionHash: sha(input.question.normalizedText)
    });
    snapshotId = snapshot.id;
    const queries = input.fanout.queries.map((query, queryOrder) => ({
      id: query.id, queryOrder, queryText: query.exactQuery, queryHash: sha(query.exactQuery), derivationRule: query.derivationRuleId
    }));
    await appendMarketSnapshotQueries({ snapshotId, token: claim.token, queries });

    const observations: MarketSearchObservation[] = [];
    const successful: Array<{ observation: MarketSearchObservation; attemptId: string }> = [];
    for (const query of input.fanout.queries) {
      if (input.signal?.aborted) throw new PublicSourceSnapshotUnavailableError();
      const attempt = await beginMarketSearchAttempt({
        snapshotId, queryId: query.id, token: claim.token,
        idempotencyReference: deterministicId("public-search-attempt", [snapshotId, query.id]), configuredCostMicros: input.fanout.budget.maxCostMicros
      });
      const observation = await observePublicSearch({ adapter: input.adapter, query, budget: input.fanout.budget, signal: input.signal ?? new AbortController().signal });
      const requestStatus = attemptStatus(observation.status);
      const providerCostMicros = observation.usage.providerReportedCostMicros ?? observation.usage.estimatedCostMicros ?? null;
      await completeMarketSearchAttempt({
        attemptId: attempt.id, token: claim.token, requestStatus, usage: observation.usage, providerCostMicros,
        costUncertain: observation.usage.costUncertain ?? providerCostMicros === null, sanitizedError: observation.sanitizedError ?? null
      });
      observations.push(observation);
      if (requestStatus === "succeeded" || requestStatus === "partial") successful.push({ observation, attemptId: attempt.id });
    }
    if (successful.length === 0) throw new PublicSourceSnapshotUnavailableError();

    const rows = successful.flatMap(({ observation, attemptId }) => observationRows(snapshotId!, attemptId, observation));
    if (rows.length) await appendMarketSearchObservations({ token: claim.token, observations: rows });
    const retrievals = await appendRetrievals({ input, snapshotId, token: claim.token, observations: successful, evidenceCutoff });
    const completed = await completeMarketSnapshotLease({ snapshotId, token: claim.token, queryFanoutHash: fanoutHash(input.fanout), completedAt: new Date() });
    return materialize({
      snapshot: completed,
      questionId: input.question.id,
      observations,
      retrievals,
      collectedForThisRun: true,
      evidenceCutoff
    });
  } catch (error) {
    await releaseFailedMarketSnapshotLease({ token: claim.token, ...(snapshotId ? { snapshotId } : {}) }).catch(() => undefined);
    if (error instanceof PublicSourceSnapshotUnavailableError || error instanceof PublicSourceSnapshotAuthorityMismatchError) throw error;
    throw new PublicSourceSnapshotUnavailableError();
  }
}

async function resolveExisting(input: ResolvePublicSourceSnapshotInput & { identity: ReturnType<typeof createMarketSnapshotIdentity>; evidenceCutoff: Date; snapshotId: string; ageMs: number }): Promise<ResolvedPublicSourceSnapshotValue> {
  const bundle = await getMarketSnapshotBundle(input.snapshotId);
  if (!bundle || bundle.snapshot.status !== "completed" || bundle.snapshot.surfaceAuthorityVersion !== input.authority.authorityId) {
    throw new PublicSourceSnapshotAuthorityMismatchError();
  }
  const observations = toObservations(bundle, input.authority.surface);
  const retrievals = bundle.sources.flatMap((source) => {
    if (source.retrievalState !== "available" || !source.excerpt || !source.contentHash) return [];
    const storedObservation = bundle.observations.find((observation) => observation.id === source.observationId);
    const attempt = storedObservation && bundle.attempts.find((candidate) => candidate.id === storedObservation.attemptId);
    if (!storedObservation || !attempt) return [];
    return [{ observationId: attempt.id, queryId: storedObservation.queryId, resultUrl: source.canonicalUrl, finalUrl: source.canonicalUrl, retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true, accessBarrier: "none" as const, normalizedText: source.excerpt, normalizedContentHash: source.contentHash, verifiedExcerpt: source.excerpt }];
  });
  const cost = knownCost(bundle.attempts);
  return {
    snapshotId: bundle.snapshot.id, cacheIdentity: bundle.snapshot.cacheIdentity, questionId: input.question.id,
    observedAt: bundle.snapshot.completedAt!.toISOString(), ageMs: input.ageMs, collectedForThisRun: false, refreshAttempted: false,
    refreshFailed: false, sufficientlyEvidenced: retrievals.some(({ retrievalState }) => retrievalState === "available"), observations, retrievals,
    actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: cost
  };
}

async function appendRetrievals(input: { input: ResolvePublicSourceSnapshotInput; snapshotId: string; token: Parameters<typeof appendMarketSourceEvidence>[0]["token"]; observations: Array<{ observation: MarketSearchObservation; attemptId: string }>; evidenceCutoff: Date }): Promise<RetrievedPublicSourceFact[]> {
  const rows: SourceEvidenceInput[] = [];
  const retrievals: RetrievedPublicSourceFact[] = [];
  for (const { observation } of input.observations) for (const result of observation.results) {
    const canonicalUrl = canonicalizePublicSourceUrl(result.url);
    const domain = getPublicSourceDomainIdentity(canonicalUrl).registrableDomain;
    const base = { id: deterministicId("market-source", [input.snapshotId, observation.queryId, String(result.surfaceResultOrder), canonicalUrl]), snapshotId: input.snapshotId, observationId: observationId(input.snapshotId, observation.queryId, result.surfaceResultOrder, canonicalUrl), canonicalUrl, registrableDomain: domain, retrievedAt: input.evidenceCutoff, expiresAt: new Date(input.evidenceCutoff.getTime() + 30 * 24 * 60 * 60 * 1_000) };
    if (!input.input.retrieveSource) {
      rows.push({ ...base, retrievalState: "not_retrieved", sourceCategory: "unknown", entities: [], claims: [], contradictions: [], evidenceFamilyIdentity: deterministicId("evidence-family", [canonicalUrl]) });
      continue;
    }
    const retrieved = await input.input.retrieveSource({ observation, result, signal: input.input.signal ?? new AbortController().signal });
    if (retrieved.fact.observationId !== observation.observationId || retrieved.fact.queryId !== observation.queryId || canonicalizePublicSourceUrl(retrieved.fact.resultUrl) !== canonicalUrl) throw new PublicSourceSnapshotUnavailableError();
    rows.push({ ...base, ...retrieved.source });
    retrievals.push(retrieved.fact);
  }
  if (rows.length) await appendMarketSourceEvidence({ token: input.token, sources: rows });
  return retrievals;
}

function materialize(input: { snapshot: Awaited<ReturnType<typeof completeMarketSnapshotLease>>; questionId: string; observations: MarketSearchObservation[]; retrievals: RetrievedPublicSourceFact[]; collectedForThisRun: boolean; evidenceCutoff: Date }): ResolvedPublicSourceSnapshotValue {
  const cost = input.observations.reduce((total, observation) => total + (observation.usage.providerReportedCostMicros ?? observation.usage.estimatedCostMicros ?? 0), 0);
  return {
    snapshotId: input.snapshot.id, cacheIdentity: input.snapshot.cacheIdentity, questionId: input.questionId, observedAt: input.snapshot.completedAt!.toISOString(),
    ageMs: Math.max(0, input.evidenceCutoff.getTime() - input.snapshot.completedAt!.getTime()), collectedForThisRun: input.collectedForThisRun, refreshAttempted: true, refreshFailed: false,
    sufficientlyEvidenced: input.retrievals.some(({ retrievalState }) => retrievalState === "available"), observations: input.observations, retrievals: input.retrievals,
    actualCostMicros: cost, allocatedCostMicros: cost, avoidedCostMicros: 0
  };
}

function observationRows(snapshotId: string, attemptId: string, observation: MarketSearchObservation) {
  return observation.results.map((result) => {
    const canonicalUrl = canonicalizePublicSourceUrl(result.url);
    return { id: observationId(snapshotId, observation.queryId, result.surfaceResultOrder, canonicalUrl), snapshotId, queryId: observation.queryId, attemptId,
      surfaceResultOrder: result.surfaceResultOrder, resultUrl: result.url, canonicalUrl, title: result.title, snippet: result.snippet,
      resultStatus: "returned" as const, resultMetadata: { domain: result.displayedHost, rank: result.surfaceResultOrder }, contentHash: sha(canonicalUrl), observedAt: date(observation.completedAt, "observation.completedAt") };
  });
}

function toObservations(bundle: NonNullable<Awaited<ReturnType<typeof getMarketSnapshotBundle>>>, surface: PublicSearchSurfaceAdapter["surface"]): MarketSearchObservation[] {
  return bundle.attempts.filter(({ requestStatus }) => requestStatus === "succeeded" || requestStatus === "partial").map((attempt) => {
    const query = bundle.queries.find(({ id }) => id === attempt.queryId);
    if (!query || !attempt.completedAt) throw new PublicSourceSnapshotUnavailableError();
    return { observationId: attempt.id, surface, queryId: attempt.queryId, exactQuery: query.queryText, requestedAt: attempt.startedAt.toISOString(), completedAt: attempt.completedAt.toISOString(), status: attempt.requestStatus === "succeeded" ? "complete" : "partial",
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
function observationId(snapshotId: string, queryId: string, order: number, canonicalUrl: string): string { return deterministicId("market-observation", [snapshotId, queryId, String(order), canonicalUrl]); }
function fanoutHash(fanout: SearchQueryFanout): string { return sha(JSON.stringify({ questionId: fanout.questionId, questionSetVersion: fanout.questionSetVersion, fanoutVersion: fanout.fanoutVersion, surface: fanout.surface, queries: fanout.queries.map(({ id, exactQuery, derivationRuleId, resultDepth }) => ({ id, exactQuery, derivationRuleId, resultDepth })) })); }
function knownCost(attempts: Array<{ providerCostMicros: number | null }>): number { return attempts.reduce((total, attempt) => total + (attempt.providerCostMicros ?? 0), 0); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function date(value: string, label: string): Date { const parsed = new Date(value); if (!Number.isFinite(parsed.getTime())) throw new TypeError(`${label} must be an ISO timestamp.`); return parsed; }
function positive(value: number, label: string): number { if (!Number.isSafeInteger(value) || value < 1 || value > 60 * 60_000) throw new TypeError(`${label} is invalid.`); return value; }

export class PublicSourceSnapshotAuthorityMismatchError extends Error {}
export class PublicSourceSnapshotUnavailableError extends Error {}

import { createHash } from "node:crypto";
import {
  deterministicId,
  parseMarketSnapshotIdentity,
  type MarketSnapshotIdentity,
  type SnapshotFreshness
} from "@open-geo-console/public-search-observer";
import type postgres from "postgres";
import { readDeploymentProfile } from "@/security/deployment-policy";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import {
  memoryGetMarketSearchAttempt,
  memoryGetMarketSnapshotLease,
  memoryGetMarketSnapshotQuestion,
  memoryGetScanJob,
  memoryListMarketSearchAttempts,
  memoryListMarketSearchObservations,
  memoryListMarketSnapshotQueries,
  memoryListMarketSnapshotQuestions,
  memoryListMarketSourceEvidence,
  memoryListPublicSearchSurfaceAuthorities,
  memoryListReportMarketSnapshotRefs,
  memorySaveMarketSearchAttempt,
  memorySaveMarketSearchObservation,
  memorySaveMarketSnapshotLease,
  memorySaveMarketSnapshotQuery,
  memorySaveMarketSnapshotQuestion,
  memorySaveMarketSourceEvidence,
  memorySaveReportMarketSnapshotRef
} from "./memory";
import type {
  MarketSearchAttemptRow,
  MarketSearchObservationRow,
  MarketSnapshotLeaseRow,
  MarketSnapshotQueryRow,
  MarketSnapshotQuestionRow,
  MarketSourceEvidenceRow,
  ReportMarketSnapshotRefRow
} from "./schema";

const DAY_MS = 86_400_000;
const FRESH_MS = 7 * DAY_MS;
const STALE_MS = 30 * DAY_MS;
const TERMINAL_ATTEMPT_STATES = new Set(["succeeded", "partial", "timeout", "rate_limited", "unavailable", "malformed", "aborted", "authentication", "unsupported"]);
const SUCCESS_ATTEMPT_STATES = new Set(["succeeded", "partial"]);
const PUBLIC_METADATA_KEYS = new Set([
  "id", "name", "canonicalname", "type", "category", "kind", "status", "code", "version", "claim", "claims",
  "text", "quote", "title", "snippet", "field", "value", "values", "items", "sourceid", "observationid", "entityid",
  "confidence", "reason", "details", "relationship", "from", "to", "subject", "predicate", "object", "polarity", "domain",
  "registrabledomain", "language", "locale", "region", "mimetype", "publishedat", "updatedat", "retrievedat", "rank",
  "resulttype", "sourcekind", "inputtokens", "outputtokens", "totaltokens", "searchrequests", "currency", "costmicros",
  "billedunits", "requestunits", "cachehits", "billing", "unit", "count", "requestcount", "resultcount",
  "estimatedcostmicros", "providerreportedcostmicros", "costuncertain",
  "snapshotkind", "parentsnapshotid", "candidatesethash", "queryplanversion", "selectorversion",
  "policyid", "policyversion", "passageid", "claimid", "capability", "operatingmode", "servicescope", "routescope",
  "validationstatus", "rejectionreason", "extractionmodel", "extractioncontract", "relevancescore"
]);

export interface LeaseToken { cacheIdentity: string; leaseOwner: string; attemptNumber: number }
export type SnapshotLeaseToken = LeaseToken;
export type MarketSnapshotKind = "standard_question" | "provider_discovery" | "candidate_verification";
export type LeaseClaim = { acquired: true; takeover: boolean; token: LeaseToken; expiresAt: Date } |
  { acquired: false; state: "held" | "completed"; lease: MarketSnapshotLeaseRow };

export interface SnapshotQueryInput {
  id: string;
  queryOrder: number;
  queryText: string;
  queryHash: string;
  derivationRule: string;
}

export interface SearchObservationInput {
  id: string;
  snapshotId: string;
  queryId: string;
  attemptId: string;
  surfaceResultOrder: number;
  resultUrl: string;
  canonicalUrl: string;
  title: string;
  snippet?: string | null;
  resultStatus: "returned" | "duplicate" | "inaccessible" | "filtered";
  resultMetadata?: unknown;
  contentHash: string;
  observedAt: Date;
}

export interface SourceEvidenceInput {
  id: string;
  snapshotId: string;
  observationId: string;
  canonicalUrl: string;
  registrableDomain: string;
  retrievalState: "available" | "inaccessible" | "not_retrieved";
  excerpt?: string | null;
  excerptHash?: string | null;
  contentHash?: string | null;
  sourceCategory: "company_owned" | "earned_editorial" | "directory_or_reference" | "community_or_ugc" | "institution" | "social" | "unknown";
  entities?: unknown;
  claims?: unknown;
  contradictions?: unknown;
  evidenceFamilyIdentity: string;
  retrievedAt: Date;
  expiresAt: Date;
}

export async function acquireMarketSnapshotLease(input: {
  cacheIdentity: string; leaseOwner: string; leaseDurationMs: number; forceRefresh?: boolean;
}): Promise<LeaseClaim> {
  const cacheIdentity = identityText(input.cacheIdentity);
  const leaseOwner = opaqueOwner(input.leaseOwner);
  const leaseDurationMs = positiveInteger(input.leaseDurationMs, "leaseDurationMs", 15 * 60_000);
  if (isMemoryPersistence()) {
    const now = new Date();
    const existing = memoryGetMarketSnapshotLease(cacheIdentity);
    if (!existing) {
      const row = leaseRow(cacheIdentity, leaseOwner, 1, now, leaseDurationMs);
      memorySaveMarketSnapshotLease(row);
      return { acquired: true, takeover: false, token: token(row), expiresAt: new Date(row.expiresAt) };
    }
    if ((existing.state === "active" && existing.expiresAt.getTime() <= now.getTime()) || existing.state === "failed" || (existing.state === "completed" && input.forceRefresh === true)) {
      const row = leaseRow(cacheIdentity, leaseOwner, existing.attemptNumber + 1, now, leaseDurationMs);
      memorySaveMarketSnapshotLease(row);
      markUnfinishedAttemptsUncertainMemory(cacheIdentity, now);
      return { acquired: true, takeover: true, token: token(row), expiresAt: new Date(row.expiresAt) };
    }
    return { acquired: false, state: existing.state === "completed" ? "completed" : "held", lease: clone(existing) };
  }
  await ensureDatabase();
  const sql = getSqlClient();
  return sql.begin(async (tx) => {
    const acquired = await tx<Array<Record<string, unknown>>>`
      INSERT INTO market_snapshot_leases (
        cache_identity, lease_owner, state, acquired_at, heartbeat_at, expires_at, attempt_number, updated_at
      ) VALUES (
        ${cacheIdentity}, ${leaseOwner}, 'active', clock_timestamp(), clock_timestamp(),
        clock_timestamp() + (${leaseDurationMs} * interval '1 millisecond'), 1, clock_timestamp()
      )
      ON CONFLICT (cache_identity) DO UPDATE SET
        lease_owner = EXCLUDED.lease_owner, state = 'active', acquired_at = clock_timestamp(),
        heartbeat_at = clock_timestamp(), expires_at = clock_timestamp() + (${leaseDurationMs} * interval '1 millisecond'),
        attempt_number = market_snapshot_leases.attempt_number + 1, terminal_snapshot_id = NULL, updated_at = clock_timestamp()
      WHERE (market_snapshot_leases.state = 'active' AND market_snapshot_leases.expires_at <= clock_timestamp())
         OR market_snapshot_leases.state = 'failed'
         OR (market_snapshot_leases.state = 'completed' AND ${input.forceRefresh === true})
      RETURNING *, attempt_number > 1 AS takeover
    `;
    if (acquired[0]) {
      const row = dbLease(acquired[0]);
      if (Boolean(acquired[0].takeover)) await markUnfinishedAttemptsUncertain(tx, cacheIdentity);
      return { acquired: true, takeover: Boolean(acquired[0].takeover), token: token(row), expiresAt: row.expiresAt };
    }
    const existing = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_leases WHERE cache_identity=${cacheIdentity}`)[0];
    if (!existing) throw new Error("Market snapshot lease disappeared during acquisition.");
    const row = dbLease(existing);
    return { acquired: false, state: row.state === "completed" ? "completed" : "held", lease: row };
  });
}

export async function heartbeatMarketSnapshotLease(input: { token: LeaseToken; leaseDurationMs: number }): Promise<MarketSnapshotLeaseRow> {
  const leaseDurationMs = positiveInteger(input.leaseDurationMs, "leaseDurationMs", 15 * 60_000);
  const expected = parseToken(input.token);
  if (isMemoryPersistence()) {
    const row = requireMemoryLease(expected);
    const now = new Date();
    if (row.expiresAt <= now) throw new Error("Market snapshot lease expired.");
    const next = { ...row, heartbeatAt: now, expiresAt: new Date(now.getTime() + leaseDurationMs), updatedAt: now };
    memorySaveMarketSnapshotLease(next);
    return clone(next);
  }
  await ensureDatabase();
  const rows = await getSqlClient()<Array<Record<string, unknown>>>`
    UPDATE market_snapshot_leases SET heartbeat_at=clock_timestamp(),
      expires_at=clock_timestamp() + (${leaseDurationMs} * interval '1 millisecond'), updated_at=clock_timestamp()
    WHERE cache_identity=${expected.cacheIdentity} AND lease_owner=${expected.leaseOwner}
      AND attempt_number=${expected.attemptNumber} AND state='active' AND expires_at > clock_timestamp()
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Market snapshot lease ownership was lost.");
  return dbLease(rows[0]);
}

export async function createMarketSnapshotRefresh(input: {
  identity: MarketSnapshotIdentity; authorityVersion: string; leaseOwner?: string; token?: LeaseToken; questionHash: string;
  snapshotKind?: MarketSnapshotKind; parentSnapshotId?: string | null; candidateSetHash?: string | null; queryPlanVersion?: string;
}): Promise<MarketSnapshotQuestionRow> {
  const identity = exactIdentity(input.identity);
  const tokenInput = input.token ?? await legacyToken(identity.id, input.leaseOwner);
  const expected = parseToken(tokenInput);
  if (expected.cacheIdentity !== identity.id) throw new Error("Lease and snapshot cache identities do not match.");
  const authorityVersion = bounded(input.authorityVersion, "authorityVersion", 256);
  const questionHash = hashText(input.questionHash, "questionHash");
  const snapshotMetadata = parseSnapshotMetadata(input);
  if (isMemoryPersistence()) {
    requireMemoryLease(expected);
    assertMemoryAuthority(identity, authorityVersion);
    assertMemorySnapshotAncestry(snapshotMetadata);
    const completionVersion = Math.max(0, ...memoryListMarketSnapshotQuestions().filter((row) => row.cacheIdentity === identity.id).map((row) => row.completionVersion)) + 1;
    const row = snapshotRow(identity, authorityVersion, questionHash, completionVersion, snapshotMetadata);
    memorySaveMarketSnapshotQuestion(row);
    return clone(row);
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await requireLeaseTx(tx, expected);
    await requireAuthorityTx(tx, identity, authorityVersion);
    const versions = await tx<Array<{ version: number }>>`
      SELECT COALESCE(MAX(completion_version),0)+1 AS version FROM market_snapshot_questions WHERE cache_identity=${identity.id}
    `;
    const row = snapshotRow(identity, authorityVersion, questionHash, Number(versions[0]?.version ?? 1), snapshotMetadata);
    await tx`INSERT INTO market_snapshot_questions (
      id, cache_identity, normalized_question, question_hash, locale, region,
      surface_authority_version, surface_id, surface_version, fanout_version, snapshot_kind, parent_snapshot_id,
      candidate_set_hash, query_plan_version, status, completion_version
    ) VALUES (${row.id},${row.cacheIdentity},${row.normalizedQuestion},${row.questionHash},${row.locale},${row.region},
      ${row.surfaceAuthorityVersion},${row.surfaceId},${row.surfaceVersion},${row.fanoutVersion},${row.snapshotKind},
      ${row.parentSnapshotId},${row.candidateSetHash},${row.queryPlanVersion},'refreshing',${row.completionVersion})`;
    return row;
  });
}

export async function findResumableMarketSnapshot(input: {
  identity: MarketSnapshotIdentity;
  authorityVersion: string;
}): Promise<MarketSnapshotQuestionRow | null> {
  const identity = exactIdentity(input.identity);
  const authorityVersion = bounded(input.authorityVersion, "authorityVersion", 256);
  const rows = isMemoryPersistence()
    ? memoryListMarketSnapshotQuestions()
    : (await (async () => {
        await ensureDatabase();
        return (await getSqlClient()<Array<Record<string, unknown>>>`
          SELECT * FROM market_snapshot_questions
          WHERE cache_identity=${identity.id} AND surface_authority_version=${authorityVersion} AND status='refreshing'
          ORDER BY completion_version DESC
        `).map(dbSnapshot);
      })());
  return clone(rows.find((row) => row.status === "refreshing" && row.surfaceAuthorityVersion === authorityVersion && exactRow(row, identity)) ?? null);
}

export async function appendMarketSnapshotQueries(input: {
  snapshotId: string; leaseOwner?: string; token?: LeaseToken; queries: readonly SnapshotQueryInput[];
}): Promise<MarketSnapshotQueryRow[]> {
  const snapshotId = bounded(input.snapshotId, "snapshotId", 256);
  if (!Array.isArray(input.queries) || input.queries.length < 1 || input.queries.length > 12) throw new TypeError("A snapshot requires one to twelve queries.");
  const parsed = input.queries.map(parseQuery);
  if (new Set(parsed.map((row) => row.id)).size !== parsed.length || new Set(parsed.map((row) => row.queryOrder)).size !== parsed.length || parsed.some((row, index) => row.queryOrder !== index)) throw new TypeError("Snapshot query identity/order must be unique and contiguous from zero.");
  if (isMemoryPersistence()) {
    const snapshot = memoryGetMarketSnapshotQuestion(snapshotId);
    if (!snapshot || snapshot.status !== "refreshing") throw new Error("Refreshing market snapshot does not exist.");
    const writeToken = input.token ? parseToken(input.token) : await legacyToken(snapshot.cacheIdentity, input.leaseOwner);
    if (writeToken.cacheIdentity !== snapshot.cacheIdentity) throw new Error("Lease token cannot write a foreign snapshot identity.");
    requireMemoryLease(writeToken);
    if (memoryListMarketSnapshotQueries(snapshotId).length) throw new Error("Snapshot queries are immutable.");
    const rows = parsed.map((query) => ({ ...query, snapshotId, createdAt: new Date() }));
    rows.forEach(memorySaveMarketSnapshotQuery);
    return clone(rows);
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const snapshot = await requireRefreshingSnapshotTx(tx, snapshotId);
    const writeToken = input.token ? parseToken(input.token) : await legacyToken(snapshot.cache_identity as string, input.leaseOwner);
    if (writeToken.cacheIdentity !== String(snapshot.cache_identity)) throw new Error("Lease token cannot write a foreign snapshot identity.");
    await requireLeaseTx(tx, writeToken);
    for (const query of parsed) await tx`INSERT INTO market_snapshot_queries (id,snapshot_id,query_order,query_text,query_hash,derivation_rule) VALUES (${query.id},${snapshotId},${query.queryOrder},${query.queryText},${query.queryHash},${query.derivationRule})`;
    return parsed.map((query) => ({ ...query, snapshotId, createdAt: new Date() }));
  });
}

export async function beginMarketSearchAttempt(input: {
  snapshotId: string; queryId: string; leaseOwner?: string; token?: LeaseToken; idempotencyReference: string; configuredCostMicros: number;
}): Promise<MarketSearchAttemptRow> {
  const snapshotId = bounded(input.snapshotId, "snapshotId", 256);
  const queryId = bounded(input.queryId, "queryId", 256);
  const idempotencyReference = bounded(input.idempotencyReference, "idempotencyReference", 256);
  const configuredCostMicros = nonnegativeInteger(input.configuredCostMicros, "configuredCostMicros", 1_000_000_000);
  if (isMemoryPersistence()) {
    const snapshot = memoryGetMarketSnapshotQuestion(snapshotId);
    if (!snapshot || snapshot.status !== "refreshing" || !memoryListMarketSnapshotQueries(snapshotId).some((row) => row.id === queryId)) throw new Error("Attempt scope does not exist.");
    const writeToken = input.token ? parseToken(input.token) : await legacyToken(snapshot.cacheIdentity, input.leaseOwner);
    if (writeToken.cacheIdentity !== snapshot.cacheIdentity) throw new Error("Lease token cannot write a foreign snapshot identity.");
    requireMemoryLease(writeToken);
    const existing = memoryListMarketSearchAttempts().find((row) => row.idempotencyReference === idempotencyReference);
    if (existing) {
      assertAttemptStartEqual(existing, { snapshotId, queryId, configuredCostMicros });
      return clone(existing);
    }
    const attempts = memoryListMarketSearchAttempts(snapshotId);
    const row = attemptRow(snapshot, queryId, Math.max(0, ...attempts.map(({ attemptNumber }) => attemptNumber)) + 1, idempotencyReference, configuredCostMicros);
    memorySaveMarketSearchAttempt(row);
    return clone(row);
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const snapshot = await requireRefreshingSnapshotTx(tx, snapshotId);
    const writeToken = input.token ? parseToken(input.token) : await legacyToken(snapshot.cache_identity as string, input.leaseOwner);
    if (writeToken.cacheIdentity !== String(snapshot.cache_identity)) throw new Error("Lease token cannot write a foreign snapshot identity.");
    await requireLeaseTx(tx, writeToken);
    const query = (await tx<Array<{ id: string }>>`SELECT id FROM market_snapshot_queries WHERE id=${queryId} AND snapshot_id=${snapshotId}`)[0];
    if (!query) throw new Error("Market search query does not belong to the snapshot.");
    const existing = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_search_attempts WHERE idempotency_reference=${idempotencyReference}`)[0];
    if (existing) {
      const row = dbAttempt(existing);
      assertAttemptStartEqual(row, { snapshotId, queryId, configuredCostMicros });
      return row;
    }
    const next = await tx<Array<{ attempt_number: number }>>`SELECT COALESCE(MAX(attempt_number),0)+1 AS attempt_number FROM market_search_attempts WHERE snapshot_id=${snapshotId}`;
    const row = attemptRow(dbSnapshot(snapshot), queryId, Number(next[0]?.attempt_number ?? 1), idempotencyReference, configuredCostMicros);
    await tx`INSERT INTO market_search_attempts (id,snapshot_id,query_id,authority_version,attempt_number,request_status,idempotency_reference,usage,configured_cost_micros,cost_uncertain,started_at)
      VALUES (${row.id},${row.snapshotId},${row.queryId},${row.authorityVersion},${row.attemptNumber},'pending',${row.idempotencyReference},'{}'::jsonb,${row.configuredCostMicros},false,clock_timestamp())`;
    return row;
  });
}

export async function completeMarketSearchAttempt(input: {
  attemptId: string; leaseOwner?: string; token?: LeaseToken; requestStatus: string; usage: unknown;
  providerCostMicros: number | null; costUncertain: boolean; sanitizedError?: string | null;
}): Promise<MarketSearchAttemptRow> {
  const attemptId = bounded(input.attemptId, "attemptId", 256);
  if (!TERMINAL_ATTEMPT_STATES.has(input.requestStatus)) throw new TypeError("Attempt completion requires a supported terminal state.");
  const usage = validatePublicMetadata(input.usage, "usage");
  const providerCostMicros = input.providerCostMicros === null ? null : nonnegativeInteger(input.providerCostMicros, "providerCostMicros", 1_000_000_000);
  if (typeof input.costUncertain !== "boolean") throw new TypeError("costUncertain must be boolean.");
  if ((input.requestStatus === "timeout" || input.requestStatus === "aborted") && providerCostMicros === null && !input.costUncertain) throw new TypeError("A timeout/abort without provider cost must remain cost-uncertain.");
  const sanitizedError = input.sanitizedError == null ? null : bounded(input.sanitizedError, "sanitizedError", 500);
  if (isMemoryPersistence()) {
    const row = memoryGetMarketSearchAttempt(attemptId);
    if (!row) throw new Error("Market search attempt does not exist.");
    const snapshot = memoryGetMarketSnapshotQuestion(row.snapshotId)!;
    const completionToken = input.token ? parseToken(input.token) : await legacyToken(snapshot.cacheIdentity, input.leaseOwner);
    if (completionToken.cacheIdentity !== snapshot.cacheIdentity) throw new Error("Attempt completion token does not match its snapshot identity.");
    requireMemoryLeaseGeneration(completionToken);
    if (row.requestStatus !== "pending") {
      const expected = { ...row, requestStatus: input.requestStatus, usage, providerCostMicros, costUncertain: input.costUncertain, sanitizedError };
      assertAttemptCompletionEqual(row, expected);
      return clone(row);
    }
    const next = { ...row, requestStatus: input.requestStatus, usage, providerCostMicros, costUncertain: input.costUncertain, sanitizedError, completedAt: new Date() };
    memorySaveMarketSearchAttempt(next);
    return clone(next);
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const observed = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_search_attempts WHERE id=${attemptId}`)[0];
    if (!observed) throw new Error("Market search attempt does not exist.");
    const snapshot = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_questions WHERE id=${String(observed.snapshot_id)}`)[0]!;
    const completionToken = input.token ? parseToken(input.token) : await legacyToken(String(snapshot.cache_identity), input.leaseOwner);
    if (completionToken.cacheIdentity !== String(snapshot.cache_identity)) throw new Error("Attempt completion token does not match its snapshot identity.");
    await requireLeaseGenerationTx(tx, completionToken);
    const current = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_search_attempts WHERE id=${attemptId} FOR UPDATE`)[0];
    if (!current || current.snapshot_id !== observed.snapshot_id || current.query_id !== observed.query_id) throw new Error("Market search attempt identity changed during completion.");
    const row = dbAttempt(current);
    if (row.requestStatus !== "pending") {
      assertAttemptCompletionEqual(row, { ...row, requestStatus: input.requestStatus, usage, providerCostMicros, costUncertain: input.costUncertain, sanitizedError });
      return row;
    }
    const updated = (await tx<Array<Record<string, unknown>>>`UPDATE market_search_attempts SET request_status=${input.requestStatus},usage=${JSON.stringify(usage)}::jsonb,provider_cost_micros=${providerCostMicros},cost_uncertain=${input.costUncertain},sanitized_error=${sanitizedError},completed_at=clock_timestamp() WHERE id=${attemptId} AND request_status='pending' RETURNING *`)[0];
    if (!updated) throw new Error("Market search attempt completion lost its compare-and-swap.");
    return dbAttempt(updated);
  });
}

export async function appendMarketSearchObservations(input: { token: LeaseToken; observations: readonly SearchObservationInput[] }): Promise<MarketSearchObservationRow[]> {
  const tokenInput = parseToken(input.token);
  const observations = input.observations.map(parseObservation);
  if (isMemoryPersistence()) {
    requireMemoryLease(tokenInput);
    for (const row of observations) {
      const snapshot = memoryGetMarketSnapshotQuestion(row.snapshotId);
      if (!snapshot || snapshot.cacheIdentity !== tokenInput.cacheIdentity) throw new Error("Lease token cannot write a foreign snapshot identity.");
      const attempt = memoryGetMarketSearchAttempt(row.attemptId);
      if (!attempt || !SUCCESS_ATTEMPT_STATES.has(attempt.requestStatus) || attempt.snapshotId !== row.snapshotId || attempt.queryId !== row.queryId) throw new Error("Observation requires a successful matching attempt.");
      memorySaveMarketSearchObservation({ ...row, createdAt: new Date() });
    }
    return clone(observations.map((row) => ({ ...row, createdAt: new Date() })));
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await requireLeaseTx(tx, tokenInput);
    for (const row of observations) {
      const scoped = await tx<Array<{ id: string }>>`SELECT id FROM market_snapshot_questions WHERE id=${row.snapshotId} AND cache_identity=${tokenInput.cacheIdentity} AND status='refreshing'`;
      if (!scoped[0]) throw new Error("Lease token cannot write a foreign snapshot identity.");
      await tx`INSERT INTO market_search_observations (id,snapshot_id,query_id,attempt_id,surface_result_order,result_url,canonical_url,title,snippet,result_status,result_metadata,content_hash,observed_at) VALUES (${row.id},${row.snapshotId},${row.queryId},${row.attemptId},${row.surfaceResultOrder},${row.resultUrl},${row.canonicalUrl},${row.title},${row.snippet},${row.resultStatus},${JSON.stringify(row.resultMetadata)}::jsonb,${row.contentHash},${row.observedAt.toISOString()})`;
    }
    return observations.map((row) => ({ ...row, createdAt: new Date() }));
  });
}

export function validateMarketSearchObservationInput(input: SearchObservationInput): SearchObservationInput {
  parseObservation(input);
  return input;
}

export async function appendMarketSourceEvidence(input: { token: LeaseToken; sources: readonly SourceEvidenceInput[] }): Promise<MarketSourceEvidenceRow[]> {
  const tokenInput = parseToken(input.token);
  const sources = input.sources.map(parseSource);
  if (isMemoryPersistence()) {
    requireMemoryLease(tokenInput);
    for (const source of sources) {
      const snapshot = memoryGetMarketSnapshotQuestion(source.snapshotId);
      if (!snapshot || snapshot.cacheIdentity !== tokenInput.cacheIdentity) throw new Error("Lease token cannot write a foreign snapshot identity.");
      const observation = memoryListMarketSearchObservations(source.snapshotId).find(({ id }) => id === source.observationId);
      if (!observation || observation.canonicalUrl !== source.canonicalUrl) throw new Error("Source evidence must match its observation canonical URL.");
      const existing = memoryListMarketSourceEvidence(source.snapshotId).find(({ id }) => id === source.id);
      if (existing) assertSourceEvidenceEqual(existing, source);
      else memorySaveMarketSourceEvidence({ ...source, createdAt: new Date() });
    }
    return clone(sources.map((source) => ({ ...source, createdAt: new Date() })));
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await requireLeaseTx(tx, tokenInput);
    for (const row of sources) {
      const scoped = await tx<Array<{ id: string }>>`SELECT id FROM market_snapshot_questions WHERE id=${row.snapshotId} AND cache_identity=${tokenInput.cacheIdentity} AND status='refreshing'`;
      if (!scoped[0]) throw new Error("Lease token cannot write a foreign snapshot identity.");
      await tx`INSERT INTO market_source_evidence (id,snapshot_id,observation_id,canonical_url,registrable_domain,retrieval_state,excerpt,excerpt_hash,content_hash,source_category,entities,claims,contradictions,evidence_family_identity,retrieved_at,expires_at) VALUES (${row.id},${row.snapshotId},${row.observationId},${row.canonicalUrl},${row.registrableDomain},${row.retrievalState},${row.excerpt},${row.excerptHash},${row.contentHash},${row.sourceCategory},${JSON.stringify(row.entities)}::jsonb,${JSON.stringify(row.claims)}::jsonb,${JSON.stringify(row.contradictions)}::jsonb,${row.evidenceFamilyIdentity},${row.retrievedAt.toISOString()},${row.expiresAt.toISOString()}) ON CONFLICT (id) DO NOTHING`;
      const persisted = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_source_evidence WHERE id=${row.id}`)[0];
      if (!persisted) throw new Error("Source evidence idempotent write disappeared.");
      assertSourceEvidenceEqual(dbSource(persisted), row);
    }
    return sources.map((row) => ({ ...row, createdAt: new Date() }));
  });
}

export async function completeMarketSnapshotLease(input: {
  snapshotId: string; cacheIdentity?: string; leaseOwner?: string; token?: LeaseToken; queryFanoutHash: string; completedAt?: Date;
}): Promise<MarketSnapshotQuestionRow> {
  const snapshotId = bounded(input.snapshotId, "snapshotId", 256);
  const queryFanoutHash = hashText(input.queryFanoutHash, "queryFanoutHash");
  if (isMemoryPersistence()) {
    const snapshot = memoryGetMarketSnapshotQuestion(snapshotId);
    if (!snapshot || snapshot.status !== "refreshing") throw new Error("Refreshing market snapshot does not exist.");
    const expected = input.token ? parseToken(input.token) : await legacyToken(input.cacheIdentity ?? snapshot.cacheIdentity, input.leaseOwner);
    if (expected.cacheIdentity !== snapshot.cacheIdentity) throw new Error("Lease token cannot complete a foreign snapshot identity.");
    requireMemoryLease(expected);
    assertCompletionLedger(snapshotId);
    const completedAt = input.completedAt ? validDate(input.completedAt, "completedAt") : new Date();
    const next = { ...snapshot, status: "completed", queryFanoutHash, completedAt };
    memorySaveMarketSnapshotQuestion(next);
    const lease = requireMemoryLease(expected);
    memorySaveMarketSnapshotLease({ ...lease, state: "completed", terminalSnapshotId: snapshotId, updatedAt: new Date() });
    return clone(next);
  }
  await ensureDatabase();
  const expected = input.token ?? await legacyToken(input.cacheIdentity, input.leaseOwner);
  return getSqlClient().begin(async (tx) => {
    const lease = await requireLeaseTx(tx, parseToken(expected));
    const completedAt = input.completedAt ? validDate(input.completedAt, "completedAt") : null;
    const ledger = (await tx<Array<{ query_count: number; terminal_query_count: number; successful_count: number; pending_count: number }>>`
      SELECT
        (SELECT count(*)::integer FROM market_snapshot_queries query WHERE query.snapshot_id=${snapshotId}) AS query_count,
        (SELECT count(DISTINCT attempt.query_id)::integer FROM market_search_attempts attempt
          WHERE attempt.snapshot_id=${snapshotId} AND attempt.request_status IN ('succeeded','partial','timeout','rate_limited','unavailable','malformed','aborted','authentication','unsupported')) AS terminal_query_count,
        (SELECT count(*)::integer FROM market_search_attempts attempt
          WHERE attempt.snapshot_id=${snapshotId} AND attempt.request_status IN ('succeeded','partial')) AS successful_count,
        (SELECT count(*)::integer FROM market_search_attempts attempt
          WHERE attempt.snapshot_id=${snapshotId} AND attempt.request_status='pending') AS pending_count
    `)[0];
    if (!ledger || ledger.query_count < 1 || ledger.terminal_query_count !== ledger.query_count || ledger.successful_count < 1 || ledger.pending_count !== 0) {
      throw new Error("Completed snapshot requires a terminal attempt per query, no pending request, and at least one successful/partial ledger.");
    }
    const rows = await tx<Array<Record<string, unknown>>>`UPDATE market_snapshot_questions SET status='completed',query_fanout_hash=${queryFanoutHash},completed_at=COALESCE(${completedAt?.toISOString() ?? null}::timestamptz,clock_timestamp()) WHERE id=${snapshotId} AND cache_identity=${lease.cache_identity as string} AND status='refreshing' RETURNING *`;
    if (!rows[0]) throw new Error("Market snapshot completion lost its compare-and-swap.");
    const completed = await tx<Array<{ cache_identity: string }>>`UPDATE market_snapshot_leases SET state='completed',terminal_snapshot_id=${snapshotId},updated_at=clock_timestamp() WHERE cache_identity=${String(lease.cache_identity)} AND lease_owner=${String(lease.lease_owner)} AND attempt_number=${Number(lease.attempt_number)} AND state='active' RETURNING cache_identity`;
    if (!completed[0]) throw new Error("Market snapshot lease completion lost its compare-and-swap.");
    return dbSnapshot(rows[0]);
  });
}

export async function releaseFailedMarketSnapshotLease(input: { token: LeaseToken; snapshotId?: string; preserveRefreshingSnapshot?: boolean }): Promise<void> {
  const expected = parseToken(input.token);
  if (isMemoryPersistence()) {
    const lease = requireMemoryLease(expected);
    if (input.snapshotId) {
      const snapshot = memoryGetMarketSnapshotQuestion(input.snapshotId);
      if (snapshot && snapshot.cacheIdentity !== expected.cacheIdentity) throw new Error("Lease token cannot fail a foreign snapshot identity.");
      if (snapshot?.status === "refreshing" && !input.preserveRefreshingSnapshot) memorySaveMarketSnapshotQuestion({ ...snapshot, status: "failed" });
    }
    memorySaveMarketSnapshotLease({ ...lease, state: "failed", terminalSnapshotId: null, updatedAt: new Date() });
    return;
  }
  await ensureDatabase();
  await getSqlClient().begin(async (tx) => {
    await requireLeaseTx(tx, expected);
    if (input.snapshotId && !input.preserveRefreshingSnapshot) await tx`UPDATE market_snapshot_questions SET status='failed' WHERE id=${input.snapshotId} AND cache_identity=${expected.cacheIdentity} AND status='refreshing'`;
    const rows = await tx<Array<{ cache_identity: string }>>`UPDATE market_snapshot_leases SET state='failed',terminal_snapshot_id=NULL,updated_at=clock_timestamp() WHERE cache_identity=${expected.cacheIdentity} AND lease_owner=${expected.leaseOwner} AND attempt_number=${expected.attemptNumber} AND state='active' RETURNING cache_identity`;
    if (!rows[0]) throw new Error("Market snapshot lease failure lost its compare-and-swap.");
  });
}

export async function findExactMarketSnapshot(input: { identity: MarketSnapshotIdentity; evidenceCutoff: Date }): Promise<{ snapshot: MarketSnapshotQuestionRow; freshness: SnapshotFreshness; ageMs: number } | null> {
  let identity: MarketSnapshotIdentity;
  try { identity = exactIdentity(input.identity); } catch { return null; }
  const cutoff = validDate(input.evidenceCutoff, "evidenceCutoff");
  let rows: MarketSnapshotQuestionRow[];
  if (isMemoryPersistence()) rows = memoryListMarketSnapshotQuestions();
  else {
    await ensureDatabase();
    rows = (await getSqlClient()<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_questions WHERE cache_identity=${identity.id} AND status='completed' AND completed_at <= ${cutoff.toISOString()} ORDER BY completion_version DESC`).map(dbSnapshot);
  }
  const snapshot = rows.filter((row) => row.status === "completed" && row.completedAt && row.completedAt <= cutoff && exactRow(row, identity)).sort((a, b) => b.completionVersion - a.completionVersion)[0];
  if (!snapshot?.completedAt) return null;
  const ageMs = cutoff.getTime() - snapshot.completedAt.getTime();
  return { snapshot: clone(snapshot), freshness: ageMs <= FRESH_MS ? "fresh" : ageMs <= STALE_MS ? "stale" : "expired", ageMs };
}

export async function waitForMarketSnapshot(input: {
  identity: MarketSnapshotIdentity; deadline: Date; minBackoffMs?: number; maxBackoffMs?: number; signal?: AbortSignal;
  acceptSnapshot?: (snapshot: MarketSnapshotQuestionRow) => boolean;
}): Promise<{ status: "completed"; snapshot: MarketSnapshotQuestionRow } | { status: "takeover_available" | "released_retryable" | "deadline" | "aborted" }> {
  const identity = exactIdentity(input.identity);
  const deadline = validDate(input.deadline, "deadline");
  let backoff = positiveInteger(input.minBackoffMs ?? 25, "minBackoffMs", 5_000);
  const maxBackoff = positiveInteger(input.maxBackoffMs ?? 500, "maxBackoffMs", 5_000);
  while (true) {
    if (input.signal?.aborted) return { status: "aborted" };
    const now = await databaseTime();
    const found = await findExactMarketSnapshot({ identity, evidenceCutoff: now });
    if (found && (!input.acceptSnapshot || input.acceptSnapshot(found.snapshot))) return { status: "completed", snapshot: found.snapshot };
    const lease = await readLease(identity.id);
    if (lease?.state === "completed" && lease.terminalSnapshotId) {
      const bundle = await getMarketSnapshotBundle(lease.terminalSnapshotId);
      if (bundle?.snapshot.status === "completed" && exactRow(bundle.snapshot, identity)) {
        return !input.acceptSnapshot || input.acceptSnapshot(bundle.snapshot)
          ? { status: "completed", snapshot: bundle.snapshot }
          : { status: "released_retryable" };
      }
      throw new Error("Completed market snapshot lease has no exact terminal evidence.");
    }
    if (!lease || (lease.state === "active" && lease.expiresAt <= now)) return { status: "takeover_available" };
    if (lease.state === "failed") return { status: "released_retryable" };
    if (now >= deadline) return { status: "deadline" };
    await delay(Math.min(backoff, deadline.getTime() - now.getTime()), input.signal);
    backoff = Math.min(maxBackoff, Math.max(backoff + 1, backoff * 2));
  }
}

export async function getMarketSnapshotBundle(snapshotId: string): Promise<{ snapshot: MarketSnapshotQuestionRow; queries: MarketSnapshotQueryRow[]; attempts: MarketSearchAttemptRow[]; observations: MarketSearchObservationRow[]; sources: MarketSourceEvidenceRow[] } | null> {
  const id = bounded(snapshotId, "snapshotId", 256);
  if (isMemoryPersistence()) {
    const snapshot = memoryGetMarketSnapshotQuestion(id);
    return snapshot ? clone({ snapshot, queries: memoryListMarketSnapshotQueries(id), attempts: memoryListMarketSearchAttempts(id), observations: memoryListMarketSearchObservations(id), sources: memoryListMarketSourceEvidence(id) }) : null;
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const snapshotRaw = (await sql<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_questions WHERE id=${id}`)[0];
  if (!snapshotRaw) return null;
  const [queries, attempts, observations, sources] = await Promise.all([
    sql<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_queries WHERE snapshot_id=${id} ORDER BY query_order`,
    sql<Array<Record<string, unknown>>>`SELECT * FROM market_search_attempts WHERE snapshot_id=${id} ORDER BY attempt_number`,
    sql<Array<Record<string, unknown>>>`SELECT * FROM market_search_observations WHERE snapshot_id=${id} ORDER BY query_id,surface_result_order`,
    sql<Array<Record<string, unknown>>>`SELECT * FROM market_source_evidence WHERE snapshot_id=${id} ORDER BY id`
  ]);
  return { snapshot: dbSnapshot(snapshotRaw), queries: queries.map(dbQuery), attempts: attempts.map(dbAttempt), observations: observations.map(dbObservation), sources: sources.map(dbSource) };
}

export async function bindReportMarketSnapshotRefsAtomic(input: { reportId: string; jobId: string; evidenceCutoff: Date; refs: readonly { snapshotId: string; actualCostMicros: number; allocatedCostMicros: number; avoidedCostMicros: number }[] }): Promise<ReportMarketSnapshotRefRow[]> {
  const reportId = bounded(input.reportId, "reportId", 256), jobId = bounded(input.jobId, "jobId", 256), cutoff = validDate(input.evidenceCutoff, "evidenceCutoff");
  if (!input.refs.length || new Set(input.refs.map(({ snapshotId }) => snapshotId)).size !== input.refs.length) throw new TypeError("Snapshot refs must be non-empty and unique.");
  const parsedRefs = input.refs.map((ref) => ({ snapshotId: bounded(ref.snapshotId, "snapshotId", 256), actualCostMicros: nonnegativeInteger(ref.actualCostMicros, "actualCostMicros", 1_000_000_000), allocatedCostMicros: nonnegativeInteger(ref.allocatedCostMicros, "allocatedCostMicros", 1_000_000_000), avoidedCostMicros: nonnegativeInteger(ref.avoidedCostMicros, "avoidedCostMicros", 1_000_000_000) }));
  if (isMemoryPersistence()) {
    const job = memoryGetScanJob(jobId);
    if (!job || job.reportId !== reportId || job.productContract !== "recommendation_forensics_v1" || job.fulfillmentMethodology !== "public_search_source_forensics_v1" || job.recommendationReportVersion !== 2) throw new Error("Snapshot refs require an exact V2 report job.");
    const current = memoryListReportMarketSnapshotRefs(reportId);
    if (current.length) {
      assertRefBindingEqual(current, reportId, jobId, cutoff, parsedRefs);
      return clone(current);
    }
    const snapshots = parsedRefs.map((ref) => memoryGetMarketSnapshotQuestion(ref.snapshotId));
    if (snapshots.some((snapshot) => !snapshot || snapshot.status !== "completed" || !snapshot.completedAt || snapshot.completedAt > cutoff)) throw new Error("Snapshot refs require completed evidence at the cutoff.");
    if (new Set(snapshots.map((snapshot) => snapshot!.cacheIdentity)).size !== snapshots.length) throw new Error("A report cannot bind multiple versions of one cache identity.");
    const rows = parsedRefs.map((ref, index) => refRow(reportId, jobId, snapshots[index]!, cutoff, ref));
    rows.forEach(memorySaveReportMarketSnapshotRef);
    return clone(rows);
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const job = (await tx<Array<Record<string, unknown>>>`SELECT * FROM scan_jobs WHERE id=${jobId} AND report_id=${reportId} FOR UPDATE`)[0];
    if (!job || job.product_contract !== "recommendation_forensics_v1" || job.fulfillment_methodology !== "public_search_source_forensics_v1" || Number(job.recommendation_report_version) !== 2) throw new Error("Snapshot refs require an exact V2 report job.");
    const existing = await tx<Array<Record<string, unknown>>>`SELECT * FROM report_market_snapshot_refs WHERE report_id=${reportId} ORDER BY id`;
    if (existing.length) {
      const rows = existing.map(dbRef);
      assertRefBindingEqual(rows, reportId, jobId, cutoff, parsedRefs);
      return rows;
    }
    const snapshots: MarketSnapshotQuestionRow[] = [];
    for (const ref of parsedRefs) {
      const raw = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_questions WHERE id=${ref.snapshotId} FOR SHARE`)[0];
      const snapshot = raw && dbSnapshot(raw);
      if (!snapshot || snapshot.status !== "completed" || !snapshot.completedAt || snapshot.completedAt > cutoff) throw new Error("Snapshot refs require completed evidence at the cutoff.");
      snapshots.push(snapshot);
    }
    if (new Set(snapshots.map(({ cacheIdentity }) => cacheIdentity)).size !== snapshots.length) throw new Error("A report cannot bind multiple versions of one cache identity.");
    const rows = parsedRefs.map((ref, index) => refRow(reportId, jobId, snapshots[index]!, cutoff, ref));
    for (const row of rows) await tx`INSERT INTO report_market_snapshot_refs (id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash) VALUES (${row.id},${row.reportId},${row.jobId},${row.snapshotId},${row.cacheIdentity},${row.evidenceCutoff.toISOString()},${row.freshnessState},${row.actualCostMicros},${row.allocatedCostMicros},${row.avoidedCostMicros},${row.bindingHash})`;
    return rows;
  });
}

export async function expireMarketSourceExcerpts(now = new Date()): Promise<number> {
  const cutoff = validDate(now, "now");
  if (isMemoryPersistence()) {
    if (cutoff.getTime() > Date.now()) throw new Error("Market source expiry cutoff cannot be in the future.");
    let count = 0;
    for (const source of memoryListMarketSourceEvidence()) if (source.retrievalState === "available" && source.expiresAt <= cutoff) {
      memorySaveMarketSourceEvidence({ ...source, retrievalState: "expired", excerpt: null }); count++;
    }
    return count;
  }
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{ expired_count: number }>>`SELECT ogc_expire_market_source_excerpt(${cutoff.toISOString()}::timestamptz) AS expired_count`;
  return Number(rows[0]?.expired_count ?? 0);
}

async function requireLeaseTx(tx: postgres.TransactionSql, tokenInput: LeaseToken): Promise<Record<string, unknown>> {
  const row = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_leases WHERE cache_identity=${tokenInput.cacheIdentity} AND lease_owner=${tokenInput.leaseOwner} AND attempt_number=${tokenInput.attemptNumber} AND state='active' AND expires_at > clock_timestamp() FOR UPDATE`)[0];
  if (!row) throw new Error("Market snapshot lease ownership was lost or expired.");
  return row;
}
async function requireLeaseGenerationTx(tx: postgres.TransactionSql, tokenInput: LeaseToken): Promise<Record<string, unknown>> {
  const row = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_leases WHERE cache_identity=${tokenInput.cacheIdentity} AND lease_owner=${tokenInput.leaseOwner} AND attempt_number=${tokenInput.attemptNumber} FOR SHARE`)[0];
  if (!row) throw new Error("Market snapshot lease generation does not own this attempt.");
  return row;
}
async function requireRefreshingSnapshotTx(tx: postgres.TransactionSql, id: string): Promise<Record<string, unknown>> {
  const row = (await tx<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_questions WHERE id=${id} AND status='refreshing' FOR UPDATE`)[0];
  if (!row) throw new Error("Refreshing market snapshot does not exist.");
  return row;
}
async function requireAuthorityTx(tx: postgres.TransactionSql, identity: MarketSnapshotIdentity, authorityVersion: string): Promise<void> {
  const environment = readDeploymentProfile();
  const rows = await tx<Array<{ authority_version: string }>>`SELECT authority_version FROM public_search_surface_authorities WHERE authority_version=${authorityVersion} AND environment=${environment} AND active=true AND surface_id=${identity.surfaceId} AND surface_version=${identity.surfaceVersion} AND locale_capabilities @> ${JSON.stringify([identity.locale])}::jsonb AND region_capabilities @> ${JSON.stringify([identity.region])}::jsonb`;
  if (rows.length !== 1) throw new Error("Snapshot authority does not match the exact active surface capability.");
}
function assertMemoryAuthority(identity: MarketSnapshotIdentity, authorityVersion: string): void {
  const rows = memoryListPublicSearchSurfaceAuthorities().filter((row) => row.authorityVersion === authorityVersion && row.active && row.surfaceId === identity.surfaceId && row.surfaceVersion === identity.surfaceVersion && (row.localeCapabilities as string[]).includes(identity.locale) && (row.regionCapabilities as string[]).includes(identity.region));
  if (rows.length !== 1) throw new Error("Snapshot authority does not match the exact active surface capability.");
}
async function legacyToken(cacheIdentity?: string, leaseOwner?: string): Promise<LeaseToken> {
  if (!cacheIdentity || !leaseOwner) throw new TypeError("An exact lease token is required.");
  const lease = await readLease(cacheIdentity);
  if (!lease || lease.leaseOwner !== leaseOwner) throw new Error("Market snapshot lease ownership was lost.");
  return token(lease);
}
function requireMemoryLease(expected: LeaseToken): MarketSnapshotLeaseRow {
  const row = memoryGetMarketSnapshotLease(expected.cacheIdentity);
  if (!row || row.leaseOwner !== expected.leaseOwner || row.attemptNumber !== expected.attemptNumber || row.state !== "active" || row.expiresAt <= new Date()) throw new Error("Market snapshot lease ownership was lost or expired.");
  return row;
}
function requireMemoryLeaseGeneration(expected: LeaseToken): MarketSnapshotLeaseRow {
  const row = memoryGetMarketSnapshotLease(expected.cacheIdentity);
  if (!row || row.leaseOwner !== expected.leaseOwner || row.attemptNumber !== expected.attemptNumber) throw new Error("Market snapshot lease generation does not own this attempt.");
  return row;
}
async function readLease(cacheIdentity: string): Promise<MarketSnapshotLeaseRow | null> {
  if (isMemoryPersistence()) return clone(memoryGetMarketSnapshotLease(cacheIdentity));
  await ensureDatabase();
  const row = (await getSqlClient()<Array<Record<string, unknown>>>`SELECT * FROM market_snapshot_leases WHERE cache_identity=${cacheIdentity}`)[0];
  return row ? dbLease(row) : null;
}
async function databaseTime(): Promise<Date> {
  if (isMemoryPersistence()) return new Date();
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
  return new Date(rows[0]!.now);
}
async function markUnfinishedAttemptsUncertain(sql: ReturnType<typeof getSqlClient> | postgres.TransactionSql, cacheIdentity: string): Promise<void> {
  await sql`UPDATE market_search_attempts attempt SET request_status='timeout',cost_uncertain=true,completed_at=clock_timestamp(),sanitized_error=COALESCE(sanitized_error,'Lease expired before request outcome was recorded.') FROM market_snapshot_questions snapshot WHERE attempt.snapshot_id=snapshot.id AND snapshot.cache_identity=${cacheIdentity} AND attempt.request_status='pending'`;
}
function markUnfinishedAttemptsUncertainMemory(cacheIdentity: string, now: Date): void {
  const ids = new Set(memoryListMarketSnapshotQuestions().filter((row) => row.cacheIdentity === cacheIdentity).map(({ id }) => id));
  for (const row of memoryListMarketSearchAttempts()) if (ids.has(row.snapshotId) && row.requestStatus === "pending") memorySaveMarketSearchAttempt({ ...row, requestStatus: "timeout", costUncertain: true, completedAt: now, sanitizedError: "Lease expired before request outcome was recorded." });
}
function assertCompletionLedger(snapshotId: string): void {
  const queries = memoryListMarketSnapshotQueries(snapshotId), attempts = memoryListMarketSearchAttempts(snapshotId);
  if (!queries.length || attempts.some((attempt) => attempt.requestStatus === "pending") || !queries.every((query) => attempts.some((attempt) => attempt.queryId === query.id && TERMINAL_ATTEMPT_STATES.has(attempt.requestStatus))) || !attempts.some((attempt) => SUCCESS_ATTEMPT_STATES.has(attempt.requestStatus))) throw new Error("Completed snapshot requires a terminal attempt per query, no pending request, and at least one successful/partial ledger.");
}
function exactIdentity(value: MarketSnapshotIdentity): MarketSnapshotIdentity {
  const parsed = parseMarketSnapshotIdentity(value);
  const expected = deterministicId("market", [parsed.normalizedQuestion, parsed.locale, parsed.region, parsed.surfaceId, parsed.surfaceVersion, parsed.fanoutVersion, parsed.queryPlanHash].map((part) => part.trim().normalize("NFKC")));
  if (parsed.id !== expected) throw new TypeError("Market snapshot identity hash does not match its exact dimensions.");
  assertNoPrivateIdentity(parsed.normalizedQuestion);
  return parsed;
}
interface ParsedSnapshotMetadata {
  snapshotKind: MarketSnapshotKind;
  parentSnapshotId: string | null;
  candidateSetHash: string | null;
  queryPlanVersion: string;
}
function parseSnapshotMetadata(input: {
  snapshotKind?: MarketSnapshotKind; parentSnapshotId?: string | null; candidateSetHash?: string | null; queryPlanVersion?: string;
}): ParsedSnapshotMetadata {
  const snapshotKind = input.snapshotKind ?? "standard_question";
  if (!["standard_question", "provider_discovery", "candidate_verification"].includes(snapshotKind)) throw new TypeError("Unsupported market snapshot kind.");
  const parentSnapshotId = input.parentSnapshotId == null ? null : bounded(input.parentSnapshotId, "parentSnapshotId", 256);
  const candidateSetHash = input.candidateSetHash == null ? null : hashText(input.candidateSetHash, "candidateSetHash");
  const queryPlanVersion = bounded(input.queryPlanVersion ?? "legacy-standard-v1", "queryPlanVersion", 128);
  const verification = snapshotKind === "candidate_verification";
  if (verification !== (parentSnapshotId !== null && candidateSetHash !== null)) throw new TypeError("Candidate verification requires exact parent snapshot and candidate-set identities.");
  return { snapshotKind, parentSnapshotId, candidateSetHash, queryPlanVersion };
}
function assertMemorySnapshotAncestry(metadata: ParsedSnapshotMetadata): void {
  if (metadata.snapshotKind !== "candidate_verification") return;
  const parent = memoryGetMarketSnapshotQuestion(metadata.parentSnapshotId!);
  if (!parent || parent.snapshotKind !== "provider_discovery" || parent.status !== "completed") throw new Error("Candidate verification requires a completed provider-discovery parent snapshot.");
}
function snapshotRow(identity: MarketSnapshotIdentity, authorityVersion: string, questionHash: string, completionVersion: number, metadata: ParsedSnapshotMetadata): MarketSnapshotQuestionRow {
  return { id: deterministicId("snapshot", [identity.id, String(completionVersion)]), cacheIdentity: identity.id, normalizedQuestion: identity.normalizedQuestion, questionHash, locale: identity.locale, region: identity.region, surfaceAuthorityVersion: authorityVersion, surfaceId: identity.surfaceId, surfaceVersion: identity.surfaceVersion, fanoutVersion: identity.fanoutVersion, snapshotKind: metadata.snapshotKind, parentSnapshotId: metadata.parentSnapshotId, candidateSetHash: metadata.candidateSetHash, queryPlanVersion: metadata.queryPlanVersion, status: "refreshing", completionVersion, queryFanoutHash: null, completedAt: null, createdAt: new Date() };
}
function leaseRow(cacheIdentity: string, leaseOwner: string, attemptNumber: number, now: Date, duration: number): MarketSnapshotLeaseRow { return { cacheIdentity, leaseOwner, state: "active", acquiredAt: now, heartbeatAt: now, expiresAt: new Date(now.getTime() + duration), attemptNumber, terminalSnapshotId: null, updatedAt: now }; }
function attemptRow(snapshot: MarketSnapshotQuestionRow, queryId: string, attemptNumber: number, idempotencyReference: string, configuredCostMicros: number): MarketSearchAttemptRow { const now = new Date(); return { id: deterministicId("search-attempt", [snapshot.id, String(attemptNumber), idempotencyReference]), snapshotId: snapshot.id, queryId, authorityVersion: snapshot.surfaceAuthorityVersion, attemptNumber, requestStatus: "pending", idempotencyReference, usage: {}, configuredCostMicros, providerCostMicros: null, costUncertain: false, sanitizedError: null, startedAt: now, completedAt: null, createdAt: now }; }
function refRow(reportId: string, jobId: string, snapshot: MarketSnapshotQuestionRow, cutoff: Date, costs: { snapshotId: string; actualCostMicros: number; allocatedCostMicros: number; avoidedCostMicros: number }): ReportMarketSnapshotRefRow & { cacheIdentity: string } { const age = cutoff.getTime() - snapshot.completedAt!.getTime(); const freshnessState = age <= FRESH_MS ? "fresh" : age <= STALE_MS ? "historical" : "insufficient"; const bindingHash = sha(JSON.stringify([reportId, jobId, snapshot.id, snapshot.cacheIdentity, cutoff.toISOString(), freshnessState, costs.actualCostMicros, costs.allocatedCostMicros, costs.avoidedCostMicros])); return { id: deterministicId("report-snapshot-ref", [jobId, snapshot.id]), reportId, jobId, snapshotId: snapshot.id, cacheIdentity: snapshot.cacheIdentity, evidenceCutoff: cutoff, freshnessState, actualCostMicros: costs.actualCostMicros, allocatedCostMicros: costs.allocatedCostMicros, avoidedCostMicros: costs.avoidedCostMicros, bindingHash, createdAt: new Date() }; }
function parseQuery(input: SnapshotQueryInput): Omit<MarketSnapshotQueryRow, "snapshotId" | "createdAt"> { return { id: bounded(input.id, "query.id", 256), queryOrder: nonnegativeInteger(input.queryOrder, "query.queryOrder", 11), queryText: privateSafeText(input.queryText, "query.queryText", 2_000), queryHash: hashText(input.queryHash, "query.queryHash"), derivationRule: bounded(input.derivationRule, "query.derivationRule", 200) }; }
function parseObservation(input: SearchObservationInput): Omit<MarketSearchObservationRow, "createdAt"> { const resultUrl = publicUrl(input.resultUrl), canonicalUrl = publicUrl(input.canonicalUrl); if (!["returned","duplicate","inaccessible","filtered"].includes(input.resultStatus)) throw new TypeError("Unsupported search result status."); return { id: bounded(input.id, "observation.id", 256), snapshotId: bounded(input.snapshotId, "snapshotId", 256), queryId: bounded(input.queryId, "queryId", 256), attemptId: bounded(input.attemptId, "attemptId", 256), surfaceResultOrder: positiveInteger(input.surfaceResultOrder, "surfaceResultOrder", 100), resultUrl, canonicalUrl, title: privateSafeText(input.title, "title", 1_000), snippet: input.snippet == null ? null : privateSafeText(input.snippet, "snippet", 1_200), resultStatus: input.resultStatus, resultMetadata: validatePublicMetadata(input.resultMetadata ?? {}, "resultMetadata"), contentHash: hashText(input.contentHash, "contentHash"), observedAt: validDate(input.observedAt, "observedAt") }; }
function parseSource(input: SourceEvidenceInput): Omit<MarketSourceEvidenceRow, "createdAt"> { if (!["available","inaccessible","not_retrieved"].includes(input.retrievalState)) throw new TypeError("Unsupported source retrieval state."); if (!["company_owned","earned_editorial","directory_or_reference","community_or_ugc","institution","social","unknown"].includes(input.sourceCategory)) throw new TypeError("Unsupported source category."); const excerpt = input.excerpt == null ? null : publicEvidenceText(input.excerpt, "excerpt", 1_200); const excerptHash = input.excerptHash == null ? null : hashText(input.excerptHash, "excerptHash"), contentHash = input.contentHash == null ? null : hashText(input.contentHash, "contentHash"); if (input.retrievalState === "available" ? (!excerpt || !excerptHash || !contentHash) : (excerpt || excerptHash || contentHash)) throw new TypeError("Source retrieval state and retained content are inconsistent."); return { id: bounded(input.id, "source.id", 256), snapshotId: bounded(input.snapshotId, "snapshotId", 256), observationId: bounded(input.observationId, "observationId", 256), canonicalUrl: publicUrl(input.canonicalUrl), registrableDomain: bounded(input.registrableDomain, "registrableDomain", 255), retrievalState: input.retrievalState, excerpt, excerptHash, contentHash, sourceCategory: input.sourceCategory, entities: validatePublicMetadata(input.entities ?? [], "entities", 0, true), claims: validatePublicMetadata(input.claims ?? [], "claims", 0, true), contradictions: validatePublicMetadata(input.contradictions ?? [], "contradictions", 0, true), evidenceFamilyIdentity: bounded(input.evidenceFamilyIdentity, "evidenceFamilyIdentity", 256), retrievedAt: validDate(input.retrievedAt, "retrievedAt"), expiresAt: validDate(input.expiresAt, "expiresAt") }; }
function validatePublicMetadata(value: unknown, label: string, depth = 0, publicEvidence = false): unknown { if (depth > 4 || Buffer.byteLength(JSON.stringify(value), "utf8") > 8_192) throw new TypeError(`${label} exceeds public metadata bounds.`); if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value; if (typeof value === "string") { if (value.length > 2_048) throw new TypeError(`${label} string is too long.`); if (publicEvidence) assertNoSecretOrInternalIdentity(value); else assertNoPrivateIdentity(value); return value; } if (Array.isArray(value)) return value.map((item, index) => validatePublicMetadata(item, `${label}[${index}]`, depth + 1, publicEvidence)); if (value && typeof value === "object") { const output: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value)) { const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, ""); if (key.length > 64 || !PUBLIC_METADATA_KEYS.has(normalized)) throw new TypeError(`${label} contains unsupported key: ${key}`); output[key] = validatePublicMetadata(item, `${label}.${key}`, depth + 1, publicEvidence); } return output; } throw new TypeError(`${label} contains unsupported metadata.`); }
function assertNoPrivateIdentity(value: string): void { if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) || /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value) || /\b(?:[a-f0-9]{1,4}:){2,7}[a-f0-9]{1,4}\b/i.test(value)) throw new TypeError("Shared public-search data contains private or sensitive identity material."); assertNoSecretOrInternalIdentity(value); }
function assertNoSecretOrInternalIdentity(value: string): void { if (/\b(?:report|job|order|customer|token)[ _-]*(?:id|identity|identifier)\b/i.test(value) || /^(?:report|job|order|customer|token)[_-][a-z0-9-]{4,}$/i.test(value.trim()) || /authorization\s*[:=]|\bbearer\s+\S+|\b(?:api[-_ ]?key|access[-_ ]?token|client[-_ ]?secret|secret)\b\s*[:=]?\s*\S*/i.test(value) || /submitted[ _-]*url|client[ _-]*ip/i.test(value)) throw new TypeError("Shared public-search data contains private or sensitive identity material."); }
function parseToken(value: LeaseToken): LeaseToken { return { cacheIdentity: identityText(value.cacheIdentity), leaseOwner: opaqueOwner(value.leaseOwner), attemptNumber: positiveInteger(value.attemptNumber, "attemptNumber", 1_000_000) }; }
function token(row: MarketSnapshotLeaseRow): LeaseToken { return { cacheIdentity: row.cacheIdentity, leaseOwner: row.leaseOwner, attemptNumber: row.attemptNumber }; }
function opaqueOwner(value: unknown): string { const owner = bounded(value, "leaseOwner", 200); if (/\b(?:report|job|order|customer|email|token)\b/i.test(owner)) throw new TypeError("Lease owner must be an opaque worker identity."); return owner; }
function identityText(value: unknown): string { const parsed = bounded(value, "cacheIdentity", 128); if (!/^market-[a-f0-9]{64}$/.test(parsed)) throw new TypeError("cacheIdentity is invalid."); return parsed; }
function privateSafeText(value: unknown, label: string, max: number): string { const result = bounded(value, label, max); assertNoPrivateIdentity(result); return result; }
function publicEvidenceText(value: unknown, label: string, max: number): string { const result = bounded(value, label, max); assertNoSecretOrInternalIdentity(result); return result; }
function hashText(value: unknown, label: string): string { const result = bounded(value, label, 256); if (!/^[a-f0-9]{64}$/i.test(result)) throw new TypeError(`${label} must be a SHA-256 hash.`); return result.toLowerCase(); }
function bounded(value: unknown, label: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label} is invalid.`); return value.trim().normalize("NFC"); }
function positiveInteger(value: unknown, label: string, max: number): number { const result = nonnegativeInteger(value, label, max); if (result < 1) throw new TypeError(`${label} must be positive.`); return result; }
function nonnegativeInteger(value: unknown, label: string, max: number): number { if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > max) throw new TypeError(`${label} is invalid.`); return value as number; }
function validDate(value: unknown, label: string): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new TypeError(`${label} is invalid.`); return new Date(value); }
function publicUrl(value: unknown): string { const text = bounded(value, "url", 4_096), url = new URL(text); if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new TypeError("Only public HTTP(S) result URLs are accepted."); return url.toString(); }
function exactRow(row: MarketSnapshotQuestionRow, identity: MarketSnapshotIdentity): boolean { return row.cacheIdentity === identity.id && row.normalizedQuestion === identity.normalizedQuestion && row.locale === identity.locale && row.region === identity.region && row.surfaceId === identity.surfaceId && row.surfaceVersion === identity.surfaceVersion && row.fanoutVersion === identity.fanoutVersion; }
function assertAttemptCompletionEqual(actual: MarketSearchAttemptRow, expected: MarketSearchAttemptRow): void { if (actual.requestStatus !== expected.requestStatus || JSON.stringify(actual.usage) !== JSON.stringify(expected.usage) || actual.providerCostMicros !== expected.providerCostMicros || actual.costUncertain !== expected.costUncertain || actual.sanitizedError !== expected.sanitizedError) throw new Error("Market search attempt completion is immutable."); }
function assertAttemptStartEqual(actual: MarketSearchAttemptRow, expected: { snapshotId: string; queryId: string; configuredCostMicros: number }): void { if (actual.snapshotId !== expected.snapshotId || actual.queryId !== expected.queryId || actual.configuredCostMicros !== expected.configuredCostMicros) throw new Error("Market search attempt idempotency identity conflict."); }
function assertSourceEvidenceEqual(actual: Omit<MarketSourceEvidenceRow, "createdAt"> | MarketSourceEvidenceRow, expected: Omit<MarketSourceEvidenceRow, "createdAt">): void {
  const scalarKeys = ["id", "snapshotId", "observationId", "canonicalUrl", "registrableDomain", "retrievalState", "excerpt", "excerptHash", "contentHash", "sourceCategory", "evidenceFamilyIdentity"] as const;
  if (scalarKeys.some((key) => actual[key] !== expected[key]) ||
      JSON.stringify(actual.entities) !== JSON.stringify(expected.entities) || JSON.stringify(actual.claims) !== JSON.stringify(expected.claims) ||
      JSON.stringify(actual.contradictions) !== JSON.stringify(expected.contradictions) || actual.retrievedAt.getTime() !== expected.retrievedAt.getTime() ||
      actual.expiresAt.getTime() !== expected.expiresAt.getTime()) throw new Error("Market source evidence is immutable.");
}
function assertRefBindingEqual(actual: ReportMarketSnapshotRefRow[], reportId: string, jobId: string, cutoff: Date, refs: readonly { snapshotId: string; actualCostMicros: number; allocatedCostMicros: number; avoidedCostMicros: number }[]): void { const expected = [...refs].sort((a,b)=>a.snapshotId.localeCompare(b.snapshotId)); const stored = [...actual].sort((a,b)=>a.snapshotId.localeCompare(b.snapshotId)); if (stored.length !== expected.length || stored.some((row,index)=>row.reportId!==reportId || row.jobId!==jobId || row.snapshotId!==expected[index]!.snapshotId || row.evidenceCutoff.getTime()!==cutoff.getTime() || row.actualCostMicros!==expected[index]!.actualCostMicros || row.allocatedCostMicros!==expected[index]!.allocatedCostMicros || row.avoidedCostMicros!==expected[index]!.avoidedCostMicros)) throw new Error("Report market snapshot binding immutability conflict."); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function delay(ms: number, signal?: AbortSignal): Promise<void> { return new Promise((resolve) => { const finish = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); resolve(); }; const onAbort = () => finish(); const timer = setTimeout(finish, Math.max(0, ms)); signal?.addEventListener("abort", onAbort, { once: true }); }); }
function clone<T>(value: T): T { return structuredClone(value); }

function dbSnapshot(row: Record<string, unknown>): MarketSnapshotQuestionRow { return { id: String(row.id), cacheIdentity: String(row.cache_identity), normalizedQuestion: String(row.normalized_question), questionHash: String(row.question_hash), locale: String(row.locale), region: String(row.region), surfaceAuthorityVersion: String(row.surface_authority_version), surfaceId: String(row.surface_id), surfaceVersion: String(row.surface_version), fanoutVersion: String(row.fanout_version), snapshotKind: String(row.snapshot_kind ?? "standard_question"), parentSnapshotId: row.parent_snapshot_id == null ? null : String(row.parent_snapshot_id), candidateSetHash: row.candidate_set_hash == null ? null : String(row.candidate_set_hash), queryPlanVersion: String(row.query_plan_version ?? "legacy-standard-v1"), status: String(row.status), completionVersion: Number(row.completion_version), queryFanoutHash: row.query_fanout_hash == null ? null : String(row.query_fanout_hash), completedAt: row.completed_at == null ? null : new Date(row.completed_at as string | Date), createdAt: new Date(row.created_at as string | Date) }; }
function dbQuery(row: Record<string, unknown>): MarketSnapshotQueryRow { return { id: String(row.id), snapshotId: String(row.snapshot_id), queryOrder: Number(row.query_order), queryText: String(row.query_text), queryHash: String(row.query_hash), derivationRule: String(row.derivation_rule), createdAt: new Date(row.created_at as string | Date) }; }
function dbAttempt(row: Record<string, unknown>): MarketSearchAttemptRow { return { id: String(row.id), snapshotId: String(row.snapshot_id), queryId: String(row.query_id), authorityVersion: String(row.authority_version), attemptNumber: Number(row.attempt_number), requestStatus: String(row.request_status), idempotencyReference: String(row.idempotency_reference), usage: row.usage, configuredCostMicros: Number(row.configured_cost_micros), providerCostMicros: row.provider_cost_micros == null ? null : Number(row.provider_cost_micros), costUncertain: Boolean(row.cost_uncertain), sanitizedError: row.sanitized_error == null ? null : String(row.sanitized_error), startedAt: new Date(row.started_at as string | Date), completedAt: row.completed_at == null ? null : new Date(row.completed_at as string | Date), createdAt: new Date(row.created_at as string | Date) }; }
function dbObservation(row: Record<string, unknown>): MarketSearchObservationRow { return { id: String(row.id), snapshotId: String(row.snapshot_id), queryId: String(row.query_id), attemptId: String(row.attempt_id), surfaceResultOrder: Number(row.surface_result_order), resultUrl: String(row.result_url), canonicalUrl: String(row.canonical_url), title: String(row.title), snippet: row.snippet == null ? null : String(row.snippet), resultStatus: String(row.result_status), resultMetadata: row.result_metadata, contentHash: String(row.content_hash), observedAt: new Date(row.observed_at as string | Date), createdAt: new Date(row.created_at as string | Date) }; }
function dbSource(row: Record<string, unknown>): MarketSourceEvidenceRow { return { id: String(row.id), snapshotId: String(row.snapshot_id), observationId: String(row.observation_id), canonicalUrl: String(row.canonical_url), registrableDomain: String(row.registrable_domain), retrievalState: String(row.retrieval_state), excerpt: row.excerpt == null ? null : String(row.excerpt), excerptHash: row.excerpt_hash == null ? null : String(row.excerpt_hash), contentHash: row.content_hash == null ? null : String(row.content_hash), sourceCategory: String(row.source_category), entities: row.entities, claims: row.claims, contradictions: row.contradictions, evidenceFamilyIdentity: String(row.evidence_family_identity), retrievedAt: new Date(row.retrieved_at as string | Date), expiresAt: new Date(row.expires_at as string | Date), createdAt: new Date(row.created_at as string | Date) }; }
function dbLease(row: Record<string, unknown>): MarketSnapshotLeaseRow { return { cacheIdentity: String(row.cache_identity), leaseOwner: String(row.lease_owner), state: String(row.state), acquiredAt: new Date(row.acquired_at as string | Date), heartbeatAt: new Date(row.heartbeat_at as string | Date), expiresAt: new Date(row.expires_at as string | Date), attemptNumber: Number(row.attempt_number), terminalSnapshotId: row.terminal_snapshot_id == null ? null : String(row.terminal_snapshot_id), updatedAt: new Date(row.updated_at as string | Date) }; }
function dbRef(row: Record<string, unknown>): ReportMarketSnapshotRefRow { return { id: String(row.id), reportId: String(row.report_id), jobId: String(row.job_id), snapshotId: String(row.snapshot_id), cacheIdentity: String(row.cache_identity), evidenceCutoff: new Date(row.evidence_cutoff as string | Date), freshnessState: String(row.freshness_state), actualCostMicros: Number(row.actual_cost_micros), allocatedCostMicros: Number(row.allocated_cost_micros), avoidedCostMicros: Number(row.avoided_cost_micros), bindingHash: String(row.binding_hash), createdAt: new Date(row.created_at as string | Date) }; }

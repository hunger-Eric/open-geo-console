import { createHash } from "node:crypto";
import type { ProviderEvidencePassage } from "@open-geo-console/citation-intelligence";
import type postgres from "postgres";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import {
  memoryGetMarketSnapshotLease,
  memoryListMarketProviderClaims,
  memoryListMarketSnapshotQuestions,
  memoryListMarketSourceEvidence,
  memoryListMarketSourcePassages,
  memorySaveMarketProviderClaim,
  memorySaveMarketSourcePassage
} from "./memory";
import type { MarketProviderClaimRow, MarketSourcePassageRow } from "./schema";
import type { SnapshotLeaseToken } from "./market-snapshots";

export interface ProviderClaimPersistenceInput {
  id: string;
  passageId: string;
  providerEntityId: string;
  canonicalName: string;
  genericRole: string;
  policyRole: string;
  capability: string;
  operatingMode: string;
  serviceScope: readonly string[];
  routeScope: readonly string[];
  exactExcerpt: string;
  claimHash: string;
  extractionModel: string;
  extractionContract: string;
  validationStatus: "accepted" | "rejected";
  rejectionReason?: string | null;
}

export type StoredProviderClaim = MarketProviderClaimRow;
export interface MarketProviderEvidenceBundle {
  snapshotIds: string[];
  passages: MarketSourcePassageRow[];
  claims: StoredProviderClaim[];
}

export function providerClaimPersistenceHash(input: Omit<ProviderClaimPersistenceInput, "id" | "claimHash" | "extractionModel" | "extractionContract">): string {
  return sha(JSON.stringify({
    passageId: input.passageId,
    providerEntityId: input.providerEntityId,
    canonicalName: input.canonicalName,
    genericRole: input.genericRole,
    policyRole: input.policyRole,
    capability: input.capability,
    operatingMode: input.operatingMode,
    serviceScope: [...new Set(input.serviceScope)].sort(),
    routeScope: [...new Set(input.routeScope)].sort(),
    exactExcerpt: input.exactExcerpt,
    validationStatus: input.validationStatus,
    rejectionReason: input.rejectionReason ?? null
  }));
}

export async function appendMarketSourcePassages(input: {
  token: SnapshotLeaseToken;
  passages: readonly ProviderEvidencePassage[];
}): Promise<MarketSourcePassageRow[]> {
  const token = parseToken(input.token);
  if (!Array.isArray(input.passages) || input.passages.length < 1) throw new TypeError("Provider passages must be non-empty.");
  const rows = input.passages.map(parsePassage);
  assertUnique(rows.map(({ id }) => id), "Provider passage IDs");
  for (const sourceEvidenceId of new Set(rows.map(({ sourceEvidenceId }) => sourceEvidenceId))) {
    if (rows.filter((row) => row.sourceEvidenceId === sourceEvidenceId).length > 3) throw new TypeError("A market source retains at most three relevant passages.");
  }
  if (isMemoryPersistence()) return appendPassagesMemory(token, rows);
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await requireLease(tx, token);
    await requireSourcesForToken(tx, token, rows.map(({ sourceEvidenceId }) => sourceEvidenceId));
    const output: MarketSourcePassageRow[] = [];
    for (const row of rows) {
      await tx`INSERT INTO market_source_passages
        (id,source_evidence_id,passage_order,exact_excerpt,excerpt_hash,relevance_score,matched_entity_terms,
         matched_service_terms,matched_control_terms,matched_capability_terms,selector_version)
        VALUES (${row.id},${row.sourceEvidenceId},${row.passageOrder},${row.exactExcerpt},${row.excerptHash},${row.relevanceScore},
          ${JSON.stringify(row.matchedEntityTerms)}::jsonb,${JSON.stringify(row.matchedServiceTerms)}::jsonb,
          ${JSON.stringify(row.matchedControlTerms)}::jsonb,${JSON.stringify(row.matchedCapabilityTerms)}::jsonb,${row.selectorVersion})
        ON CONFLICT (id) DO NOTHING`;
      const stored = dbPassage((await tx<Array<Record<string, unknown>>>`SELECT * FROM market_source_passages WHERE id=${row.id}`)[0]!);
      assertPassageEqual(stored, row);
      output.push(stored);
    }
    return output;
  });
}

export async function appendMarketProviderClaims(input: {
  token: SnapshotLeaseToken;
  claims: readonly ProviderClaimPersistenceInput[];
}): Promise<StoredProviderClaim[]> {
  const token = parseToken(input.token);
  if (!Array.isArray(input.claims) || input.claims.length < 1) throw new TypeError("Provider claims must be non-empty.");
  const rows = input.claims.map(parseClaim);
  assertUnique(rows.map(({ id }) => id), "Provider claim IDs");
  if (isMemoryPersistence()) return appendClaimsMemory(token, rows);
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await requireLease(tx, token);
    const passages = await requirePassagesForToken(tx, token, rows.map(({ passageId }) => passageId));
    for (const row of rows) if (!passages.get(row.passageId)?.includes(row.exactExcerpt)) throw new TypeError("Provider claim excerpt is not bound to its passage.");
    const output: StoredProviderClaim[] = [];
    for (const row of rows) {
      await tx`INSERT INTO market_provider_claims
        (id,passage_id,provider_entity_id,canonical_name,generic_role,policy_role,capability,operating_mode,
         service_scope,route_scope,exact_excerpt,claim_hash,extraction_model,extraction_contract,validation_status,rejection_reason)
        VALUES (${row.id},${row.passageId},${row.providerEntityId},${row.canonicalName},${row.genericRole},${row.policyRole},
          ${row.capability},${row.operatingMode},${JSON.stringify(row.serviceScope)}::jsonb,${JSON.stringify(row.routeScope)}::jsonb,
          ${row.exactExcerpt},${row.claimHash},${row.extractionModel},${row.extractionContract},${row.validationStatus},${row.rejectionReason})
        ON CONFLICT (id) DO NOTHING`;
      const stored = dbClaim((await tx<Array<Record<string, unknown>>>`SELECT * FROM market_provider_claims WHERE id=${row.id}`)[0]!);
      assertClaimEqual(stored, row);
      output.push(stored);
    }
    return output;
  });
}

export async function getMarketProviderEvidenceBundle(snapshotIds: readonly string[]): Promise<MarketProviderEvidenceBundle> {
  const ids = [...new Set(snapshotIds.map((id) => bounded(id, "snapshotId", 256)))].sort();
  if (!ids.length) return { snapshotIds: [], passages: [], claims: [] };
  if (isMemoryPersistence()) {
    const sourceIds = memoryListMarketSourceEvidence().filter(({ snapshotId }) => ids.includes(snapshotId)).map(({ id }) => id);
    const passages = memoryListMarketSourcePassages(sourceIds).sort(comparePassage);
    const claims = memoryListMarketProviderClaims(passages.map(({ id }) => id)).sort(compareClaim);
    return clone({ snapshotIds: ids, passages, claims });
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const passages = (await sql<Array<Record<string, unknown>>>`
    SELECT passage.* FROM market_source_passages passage
    JOIN market_source_evidence source ON source.id=passage.source_evidence_id
    WHERE source.snapshot_id = ANY(${ids}) ORDER BY source.snapshot_id,passage.source_evidence_id,passage.passage_order
  `).map(dbPassage);
  const claims = passages.length ? (await sql<Array<Record<string, unknown>>>`
    SELECT * FROM market_provider_claims WHERE passage_id = ANY(${passages.map(({ id }) => id)}) ORDER BY provider_entity_id,id
  `).map(dbClaim) : [];
  return { snapshotIds: ids, passages, claims };
}

function appendPassagesMemory(token: SnapshotLeaseToken, rows: MarketSourcePassageRow[]): MarketSourcePassageRow[] {
  requireMemoryLease(token);
  const sources = memoryListMarketSourceEvidence();
  const snapshots = new Map(memoryListMarketSnapshotQuestions().map((row) => [row.id, row]));
  const output: MarketSourcePassageRow[] = [];
  for (const row of rows) {
    const source = sources.find(({ id }) => id === row.sourceEvidenceId);
    const snapshot = source && snapshots.get(source.snapshotId);
    if (!snapshot || snapshot.cacheIdentity !== token.cacheIdentity || snapshot.status !== "refreshing") throw new Error("Provider passage source does not belong to the active snapshot lease.");
    const existing = memoryListMarketSourcePassages().find(({ id }) => id === row.id);
    if (existing) assertPassageEqual(existing, row);
    else {
      const count = memoryListMarketSourcePassages([row.sourceEvidenceId]).length;
      if (count >= 3) throw new Error("A market source retains at most three relevant passages.");
      memorySaveMarketSourcePassage(row);
    }
    output.push(existing ?? row);
  }
  return clone(output);
}

function appendClaimsMemory(token: SnapshotLeaseToken, rows: StoredProviderClaim[]): StoredProviderClaim[] {
  requireMemoryLease(token);
  const passages = memoryListMarketSourcePassages();
  const sources = new Map(memoryListMarketSourceEvidence().map((row) => [row.id, row]));
  const snapshots = new Map(memoryListMarketSnapshotQuestions().map((row) => [row.id, row]));
  const output: StoredProviderClaim[] = [];
  for (const row of rows) {
    const passage = passages.find(({ id }) => id === row.passageId);
    const source = passage && sources.get(passage.sourceEvidenceId);
    const snapshot = source && snapshots.get(source.snapshotId);
    if (!snapshot || snapshot.cacheIdentity !== token.cacheIdentity || snapshot.status !== "refreshing") throw new Error("Provider claim passage does not belong to the active snapshot lease.");
    if (!passage!.exactExcerpt.includes(row.exactExcerpt)) throw new TypeError("Provider claim excerpt is not bound to its passage.");
    const existing = memoryListMarketProviderClaims().find(({ id }) => id === row.id);
    if (existing) assertClaimEqual(existing, row); else memorySaveMarketProviderClaim(row);
    output.push(existing ?? row);
  }
  return clone(output);
}

async function requireLease(tx: postgres.TransactionSql, token: SnapshotLeaseToken): Promise<void> {
  const rows = await tx`SELECT 1 FROM market_snapshot_leases WHERE cache_identity=${token.cacheIdentity} AND lease_owner=${token.leaseOwner} AND attempt_number=${token.attemptNumber} AND state='active' AND expires_at > clock_timestamp() FOR SHARE`;
  if (!rows.length) throw new Error("Market snapshot lease ownership was lost or expired.");
}
async function requireSourcesForToken(tx: postgres.TransactionSql, token: SnapshotLeaseToken, sourceIds: string[]): Promise<void> {
  const ids = [...new Set(sourceIds)];
  const rows = await tx<Array<{ id: string }>>`SELECT source.id FROM market_source_evidence source JOIN market_snapshot_questions snapshot ON snapshot.id=source.snapshot_id WHERE source.id=ANY(${ids}) AND snapshot.cache_identity=${token.cacheIdentity} AND snapshot.status='refreshing'`;
  if (rows.length !== ids.length) throw new Error("Provider passage source does not belong to the active snapshot lease.");
}
async function requirePassagesForToken(tx: postgres.TransactionSql, token: SnapshotLeaseToken, passageIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(passageIds)];
  const rows = await tx<Array<{ id: string; exact_excerpt: string }>>`SELECT passage.id,passage.exact_excerpt FROM market_source_passages passage JOIN market_source_evidence source ON source.id=passage.source_evidence_id JOIN market_snapshot_questions snapshot ON snapshot.id=source.snapshot_id WHERE passage.id=ANY(${ids}) AND snapshot.cache_identity=${token.cacheIdentity} AND snapshot.status='refreshing'`;
  if (rows.length !== ids.length) throw new Error("Provider claim passage does not belong to the active snapshot lease.");
  return new Map(rows.map((row) => [row.id, row.exact_excerpt]));
}
function requireMemoryLease(token: SnapshotLeaseToken): void {
  const lease = memoryGetMarketSnapshotLease(token.cacheIdentity);
  if (!lease || lease.leaseOwner !== token.leaseOwner || lease.attemptNumber !== token.attemptNumber || lease.state !== "active" || lease.expiresAt <= new Date()) throw new Error("Market snapshot lease ownership was lost or expired.");
}

function parsePassage(input: ProviderEvidencePassage): MarketSourcePassageRow {
  const exactExcerpt = evidenceText(input.exactExcerpt, "exactExcerpt", 1_200);
  const excerptHash = hash(input.excerptHash, "excerptHash");
  if (sha(exactExcerpt) !== excerptHash) throw new TypeError("Provider passage excerpt hash does not match.");
  return {
    id: bounded(input.passageId, "passageId", 256), sourceEvidenceId: bounded(input.sourceEvidenceId, "sourceEvidenceId", 256),
    passageOrder: integer(input.passageOrder, "passageOrder", 1_000_000), exactExcerpt, excerptHash,
    relevanceScore: integer(input.relevanceScore, "relevanceScore", 100), matchedEntityTerms: stringList(input.matchedEntityTerms, "matchedEntityTerms"),
    matchedServiceTerms: stringList(input.matchedServiceTerms, "matchedServiceTerms"), matchedControlTerms: stringList(input.matchedControlTerms, "matchedControlTerms"),
    matchedCapabilityTerms: stringList(input.matchedCapabilityTerms, "matchedCapabilityTerms"), selectorVersion: bounded(input.selectorVersion, "selectorVersion", 128), createdAt: new Date()
  };
}
function parseClaim(input: ProviderClaimPersistenceInput): StoredProviderClaim {
  const status = input.validationStatus;
  if (status !== "accepted" && status !== "rejected") throw new TypeError("Unsupported provider claim validation status.");
  const rejectionReason = input.rejectionReason == null ? null : bounded(input.rejectionReason, "rejectionReason", 240);
  if ((status === "accepted") !== (rejectionReason === null)) throw new TypeError("Provider claim rejection reason is inconsistent with validation status.");
  const exactExcerpt = evidenceText(input.exactExcerpt, "exactExcerpt", 1_200);
  const parsed: StoredProviderClaim = {
    id: bounded(input.id, "claim.id", 256), passageId: bounded(input.passageId, "passageId", 256), providerEntityId: bounded(input.providerEntityId, "providerEntityId", 256),
    canonicalName: evidenceText(input.canonicalName, "canonicalName", 300), genericRole: bounded(input.genericRole, "genericRole", 100), policyRole: bounded(input.policyRole, "policyRole", 100),
    capability: bounded(input.capability, "capability", 100), operatingMode: bounded(input.operatingMode, "operatingMode", 100), serviceScope: stringList(input.serviceScope, "serviceScope"),
    routeScope: stringList(input.routeScope, "routeScope"), exactExcerpt, claimHash: hash(input.claimHash, "claimHash"), extractionModel: bounded(input.extractionModel, "extractionModel", 200),
    extractionContract: bounded(input.extractionContract, "extractionContract", 128), validationStatus: status, rejectionReason, createdAt: new Date()
  };
  const expectedHash = providerClaimPersistenceHash({
    passageId: parsed.passageId, providerEntityId: parsed.providerEntityId, canonicalName: parsed.canonicalName,
    genericRole: parsed.genericRole, policyRole: parsed.policyRole, capability: parsed.capability, operatingMode: parsed.operatingMode,
    serviceScope: parsed.serviceScope, routeScope: parsed.routeScope, exactExcerpt: parsed.exactExcerpt,
    validationStatus: status, rejectionReason
  });
  if (parsed.claimHash !== expectedHash) throw new TypeError("Provider claim hash does not match its exact evidence identity.");
  return parsed;
}

function dbPassage(row: Record<string, unknown>): MarketSourcePassageRow { return { id: String(row.id), sourceEvidenceId: String(row.source_evidence_id), passageOrder: Number(row.passage_order), exactExcerpt: String(row.exact_excerpt), excerptHash: String(row.excerpt_hash), relevanceScore: Number(row.relevance_score), matchedEntityTerms: row.matched_entity_terms as string[], matchedServiceTerms: row.matched_service_terms as string[], matchedControlTerms: row.matched_control_terms as string[], matchedCapabilityTerms: row.matched_capability_terms as string[], selectorVersion: String(row.selector_version), createdAt: new Date(row.created_at as string | Date) }; }
function dbClaim(row: Record<string, unknown>): StoredProviderClaim { return { id: String(row.id), passageId: String(row.passage_id), providerEntityId: String(row.provider_entity_id), canonicalName: String(row.canonical_name), genericRole: String(row.generic_role), policyRole: String(row.policy_role), capability: String(row.capability), operatingMode: String(row.operating_mode), serviceScope: row.service_scope as string[], routeScope: row.route_scope as string[], exactExcerpt: String(row.exact_excerpt), claimHash: String(row.claim_hash), extractionModel: String(row.extraction_model), extractionContract: String(row.extraction_contract), validationStatus: String(row.validation_status), rejectionReason: row.rejection_reason == null ? null : String(row.rejection_reason), createdAt: new Date(row.created_at as string | Date) }; }
function assertPassageEqual(actual: MarketSourcePassageRow, expected: MarketSourcePassageRow): void { const omitTime = (row: MarketSourcePassageRow) => ({ ...row, createdAt: undefined }); if (JSON.stringify(omitTime(actual)) !== JSON.stringify(omitTime(expected))) throw new Error("Market source passage identity conflicts with immutable evidence."); }
function assertClaimEqual(actual: StoredProviderClaim, expected: StoredProviderClaim): void { const omitTime = (row: StoredProviderClaim) => ({ ...row, createdAt: undefined }); if (JSON.stringify(omitTime(actual)) !== JSON.stringify(omitTime(expected))) throw new Error("Market provider claim identity conflicts with immutable evidence."); }
function comparePassage(left: MarketSourcePassageRow, right: MarketSourcePassageRow): number { return left.sourceEvidenceId.localeCompare(right.sourceEvidenceId) || left.passageOrder - right.passageOrder; }
function compareClaim(left: StoredProviderClaim, right: StoredProviderClaim): number { return left.providerEntityId.localeCompare(right.providerEntityId) || left.id.localeCompare(right.id); }
function parseToken(value: SnapshotLeaseToken): SnapshotLeaseToken { return { cacheIdentity: bounded(value.cacheIdentity, "cacheIdentity", 128), leaseOwner: bounded(value.leaseOwner, "leaseOwner", 200), attemptNumber: integer(value.attemptNumber, "attemptNumber", 1_000_000, 1) }; }
function stringList(value: readonly string[], label: string): string[] { if (!Array.isArray(value) || value.length > 100) throw new TypeError(`${label} is invalid.`); return [...new Set(value.map((item) => evidenceText(item, label, 300)))].sort(); }
function evidenceText(value: unknown, label: string, max: number): string { const text = bounded(value, label, max); if (/authorization\s*[:=]|\bbearer\s+\S+|\b(?:api[-_ ]?key|access[-_ ]?token|client[-_ ]?secret)\b/i.test(text)) throw new TypeError(`${label} contains private material.`); return text; }
function bounded(value: unknown, label: string, max: number): string { if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label} is invalid.`); return value.normalize("NFC").trim(); }
function hash(value: unknown, label: string): string { const text = bounded(value, label, 64).toLocaleLowerCase(); if (!/^[a-f0-9]{64}$/.test(text)) throw new TypeError(`${label} must be a SHA-256 hash.`); return text; }
function integer(value: unknown, label: string, max: number, min = 0): number { if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) throw new TypeError(`${label} is invalid.`); return Number(value); }
function assertUnique(values: string[], label: string): void { if (new Set(values).size !== values.length) throw new TypeError(`${label} must be unique.`); }
function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function clone<T>(value: T): T { return structuredClone(value); }

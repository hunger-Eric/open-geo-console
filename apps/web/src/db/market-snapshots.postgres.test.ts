import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMarketSnapshotIdentity } from "@open-geo-console/public-search-observer";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import {
  acquireMarketSnapshotLease,
  appendMarketSnapshotQueries,
  beginMarketSearchAttempt,
  bindReportMarketSnapshotRefsAtomic,
  completeMarketSearchAttempt,
  completeMarketSnapshotLease,
  createMarketSnapshotRefresh,
  findExactMarketSnapshot,
  getMarketSnapshotBundle,
  heartbeatMarketSnapshotLease
} from "./market-snapshots";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "./public-search-authority";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres = adminUrl ? describe : describe.skip;

describePostgres("public-search market snapshot PostgreSQL authority", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseName = `ogc_market_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const surface = { surfaceId: `surface-${suffix}`, providerId: "fixture-provider", productId: "fixture-search", surfaceKind: "documented_api" as const, contractVersion: "1", surfaceVersion: "fixture-v1", adapterVersion: "1", locale: "zh-CN", region: "CN" };
  const question = { id: `q-${suffix}`, questionSetVersion: "1", locale: surface.locale, region: surface.region, kind: "supplier_discovery" as const, exactText: "深圳到台湾的运输公司有哪些？", normalizedText: "深圳到台湾的运输公司有哪些？", derivation: { ruleId: "direct", evidenceSourceIds: ["public-fixture"], subject: "深圳到台湾运输", broadened: false } };
  const identity = createMarketSnapshotIdentity({ question, surface, fanoutVersion: "fanout-v1" });
  const reportId = `market-report-${suffix}`;
  const jobId = `market-job-${suffix}`;
  const v1ReportId = `market-v1-report-${suffix}`;
  const v1JobId = `market-v1-job-${suffix}`;
  let authorityVersion = "";
  let snapshotId = "";

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    const databaseUrl = withDatabase(adminUrl!, databaseName);
    const bootstrap = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await bootstrap`CREATE TABLE deployment_environment (
        singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton=true),
        profile text NOT NULL CHECK (profile IN ('staging','production')),
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
      )`;
      await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    } finally {
      await bootstrap.end({ timeout: 5 });
    }
    process.env.DATABASE_URL = databaseUrl;
    await ensureDatabase();
    const installed = await installPublicSearchSurfaceAuthority({ environment: "staging", surfaceId: surface.surfaceId, surfaceVersion: surface.surfaceVersion, localeCapabilities: [surface.locale], regionCapabilities: [surface.region], termsReviewedAt: "2030-01-01T00:00:00.000Z", evidenceReferences: ["fixture-review"], capturedAt: "2030-01-02T00:00:00.000Z", active: false });
    const authority = await activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, environment: "staging", surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion });
    authorityVersion = authority.authorityVersion;
    const sql = getSqlClient();
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${reportId},'https://private.example.test','private.example.test','zh','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage) VALUES (${jobId},${reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'zh','queued')`;
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${v1ReportId},'https://legacy.example.test','legacy.example.test','en','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage) VALUES (${v1JobId},${v1ReportId},'deep','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',1,'en','queued')`;
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("uses one real PostgreSQL lease owner, takes over only after expiry, and preserves uncertain cost", async () => {
    const claims = await Promise.all([
      acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: `worker-a-${suffix}`, leaseDurationMs: 60_000 }),
      acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: `worker-b-${suffix}`, leaseDurationMs: 60_000 })
    ]);
    expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
    const winner = claims.find((claim) => claim.acquired);
    if (!winner?.acquired) throw new Error("Expected a lease winner.");
    const snapshot = await createMarketSnapshotRefresh({ identity, authorityVersion, token: winner.token, questionHash: sha(identity.normalizedQuestion) });
    snapshotId = snapshot.id;
    const query = { id: `query-${suffix}`, queryOrder: 0, queryText: "深圳 台湾 运输公司", queryHash: sha("深圳 台湾 运输公司"), derivationRule: "direct" };
    const foreignQuestion = { ...question, id: `foreign-${suffix}`, exactText: "深圳到台湾拼箱运输公司有哪些？", normalizedText: "深圳到台湾拼箱运输公司有哪些？" };
    const foreignIdentity = createMarketSnapshotIdentity({ question: foreignQuestion, surface, fanoutVersion: "fanout-v1" });
    const foreignClaim = await acquireMarketSnapshotLease({ cacheIdentity: foreignIdentity.id, leaseOwner: `foreign-worker-${suffix}`, leaseDurationMs: 60_000 });
    if (!foreignClaim.acquired) throw new Error("Expected foreign fixture lease.");
    await createMarketSnapshotRefresh({ identity: foreignIdentity, authorityVersion, token: foreignClaim.token, questionHash: sha(foreignIdentity.normalizedQuestion) });
    await expect(appendMarketSnapshotQueries({ snapshotId, token: foreignClaim.token, queries: [query] })).rejects.toThrow(/foreign snapshot identity/i);
    await appendMarketSnapshotQueries({ snapshotId, token: winner.token, queries: [query] });
    const uncertain = await beginMarketSearchAttempt({ snapshotId, queryId: query.id, token: winner.token, idempotencyReference: `pending-${suffix}`, configuredCostMicros: 100 });
    await expect(completeMarketSearchAttempt({ attemptId: uncertain.id, token: { ...winner.token, leaseOwner: `forged-${suffix}` }, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 0 }, providerCostMicros: 100, costUncertain: false })).rejects.toThrow(/generation/i);

    await getSqlClient()`UPDATE market_snapshot_leases SET expires_at=clock_timestamp()-interval '1 millisecond' WHERE cache_identity=${identity.id}`;
    const takeover = await acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: `worker-c-${suffix}`, leaseDurationMs: 60_000 });
    expect(takeover).toMatchObject({ acquired: true, takeover: true });
    if (!takeover.acquired) throw new Error("Expected lease takeover.");
    await expect(heartbeatMarketSnapshotLease({ token: winner.token, leaseDurationMs: 60_000 })).rejects.toThrow(/lost|expired/i);
    expect((await getMarketSnapshotBundle(snapshotId))?.attempts.find(({ id }) => id === uncertain.id)).toMatchObject({ requestStatus: "timeout", costUncertain: true, configuredCostMicros: 100 });

    const success = await beginMarketSearchAttempt({ snapshotId, queryId: query.id, token: takeover.token, idempotencyReference: `success-${suffix}`, configuredCostMicros: 100 });
    await completeMarketSearchAttempt({ attemptId: success.id, token: takeover.token, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 0, providerReportedCostMicros: 80, costUncertain: false }, providerCostMicros: 80, costUncertain: false });
    const pending = await beginMarketSearchAttempt({ snapshotId, queryId: query.id, token: takeover.token, idempotencyReference: `retry-${suffix}`, configuredCostMicros: 100 });
    await expect(completeMarketSnapshotLease({ snapshotId, token: takeover.token, queryFanoutHash: sha("fanout") })).rejects.toThrow(/pending/i);
    await completeMarketSearchAttempt({ attemptId: pending.id, token: takeover.token, requestStatus: "timeout", usage: { requestCount: 1, resultCount: 0, estimatedCostMicros: 100, costUncertain: true }, providerCostMicros: null, costUncertain: true });
    const completed = await completeMarketSnapshotLease({ snapshotId, token: takeover.token, queryFanoutHash: sha("fanout") });
    expect(completed.status).toBe("completed");
    const databaseCutoff = new Date((await getSqlClient()<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0]!.now);
    expect((await findExactMarketSnapshot({ identity, evidenceCutoff: databaseCutoff }))?.freshness).toBe("fresh");
  }, 120_000);

  it("binds refs only to an exact V2 job and never exposes private identity in shared rows", async () => {
    const cutoff = new Date((await getSqlClient()<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`)[0]!.now);
    const refs = await bindReportMarketSnapshotRefsAtomic({ reportId, jobId, evidenceCutoff: cutoff, refs: [{ snapshotId, actualCostMicros: 80, allocatedCostMicros: 80, avoidedCostMicros: 0 }] });
    expect(refs).toHaveLength(1);
    await expect(bindReportMarketSnapshotRefsAtomic({ reportId: v1ReportId, jobId: v1JobId, evidenceCutoff: cutoff, refs: [{ snapshotId, actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0 }] })).rejects.toThrow(/V2/i);
    const shared = await getSqlClient()<Array<{ document: string }>>`
      SELECT row_to_json(snapshot)::text AS document FROM market_snapshot_questions snapshot WHERE id=${snapshotId}
      UNION ALL SELECT row_to_json(attempt)::text FROM market_search_attempts attempt WHERE snapshot_id=${snapshotId}
    `;
    expect(shared.map(({ document }) => document).join("\n")).not.toMatch(new RegExp(`${reportId}|${jobId}|private\\.example`, "i"));
  }, 120_000);
});

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function quoteIdentifier(value: string): string { return `"${value.replaceAll('"','""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

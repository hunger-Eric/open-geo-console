import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createMarketSnapshotIdentity, type MarketSnapshotIdentity } from "@open-geo-console/public-search-observer";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "./public-search-authority";
import {
  acquireMarketSnapshotLease,
  appendMarketSnapshotQueries,
  beginMarketSearchAttempt,
  completeMarketSearchAttempt,
  completeMarketSnapshotLease,
  createMarketSnapshotRefresh,
  findExactMarketSnapshot,
  getMarketSnapshotBundle,
  releaseFailedMarketSnapshotLease,
  waitForMarketSnapshot
} from "./market-snapshots";

describe("market snapshot deterministic memory repository", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.OPEN_GEO_DB_PATH = `memory-market-${randomUUID()}`;
  });

  it("creates one immutable version and reuses only the exact fresh identity", async () => {
    const fixture = await setup();
    const lease = await acquireMarketSnapshotLease({ cacheIdentity: fixture.identity.id, leaseOwner: "worker-a", leaseDurationMs: 10_000 });
    expect(lease.acquired).toBe(true);
    const snapshot = await createMarketSnapshotRefresh({
      identity: fixture.identity, authorityVersion: fixture.authorityVersion, leaseOwner: "worker-a",
      questionHash: sha(fixture.identity.normalizedQuestion)
    });
    await appendMarketSnapshotQueries({ snapshotId: snapshot.id, leaseOwner: "worker-a", queries: [query(snapshot.id)] });
    const attempt = await beginMarketSearchAttempt({
      snapshotId: snapshot.id, queryId: query(snapshot.id).id, leaseOwner: "worker-a",
      idempotencyReference: `attempt-${snapshot.id}`, configuredCostMicros: 10
    });
    await completeMarketSearchAttempt({
      attemptId: attempt.id, leaseOwner: "worker-a", requestStatus: "succeeded",
      usage: { requestCount: 1, resultCount: 0, costMicros: 8 }, providerCostMicros: 8, costUncertain: false
    });
    const completedAt = new Date("2030-01-07T00:00:00.000Z");
    await completeMarketSnapshotLease({
      snapshotId: snapshot.id, cacheIdentity: fixture.identity.id, leaseOwner: "worker-a",
      queryFanoutHash: sha("fanout"), completedAt
    });

    expect((await findExactMarketSnapshot({ identity: fixture.identity, evidenceCutoff: new Date("2030-01-14T00:00:00.000Z") }))?.freshness).toBe("fresh");
    expect((await findExactMarketSnapshot({ identity: fixture.identity, evidenceCutoff: new Date("2030-01-14T00:00:00.001Z") }))?.freshness).toBe("stale");
    expect((await findExactMarketSnapshot({ identity: fixture.identity, evidenceCutoff: new Date("2030-02-06T00:00:00.000Z") }))?.freshness).toBe("stale");
    expect((await findExactMarketSnapshot({ identity: fixture.identity, evidenceCutoff: new Date("2030-02-06T00:00:00.001Z") }))?.freshness).toBe("expired");
    expect(await findExactMarketSnapshot({ identity: { ...fixture.identity, region: "TW" }, evidenceCutoff: completedAt })).toBeNull();

    const loser = await acquireMarketSnapshotLease({ cacheIdentity: fixture.identity.id, leaseOwner: "worker-b", leaseDurationMs: 10_000 });
    expect(loser.acquired).toBe(false);
    const waited = await waitForMarketSnapshot({ identity: fixture.identity, deadline: new Date(Date.now() + 500), minBackoffMs: 1, maxBackoffMs: 5 });
    expect(waited.status).toBe("completed");
    expect((await getMarketSnapshotBundle(snapshot.id))?.attempts).toHaveLength(1);
  });

  it("allows only one lease owner for concurrent claims", async () => {
    const { identity } = await setup();
    const claims = await Promise.all([
      acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: "worker-a", leaseDurationMs: 10_000 }),
      acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: "worker-b", leaseDurationMs: 10_000 })
    ]);
    expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
  });

  it("creates three first-report snapshots and an exact second report records zero new attempts", async () => {
    const fixtures = await Promise.all([setup("海运"), setup("空运"), setup("清关")]);
    const snapshots = [];
    for (const [index, fixture] of fixtures.entries()) snapshots.push(await completeFixture(fixture.identity, fixture.authorityVersion, `worker-${index}`));
    const before = (await Promise.all(snapshots.map(({ id }) => getMarketSnapshotBundle(id)))).reduce((count, bundle) => count + (bundle?.attempts.length ?? 0), 0);
    expect(before).toBe(3);
    const reused = await Promise.all(fixtures.map(({ identity }) => findExactMarketSnapshot({ identity, evidenceCutoff: new Date(Date.now() + 1_000) })));
    expect(reused.every(Boolean)).toBe(true);
    const after = (await Promise.all(snapshots.map(({ id }) => getMarketSnapshotBundle(id)))).reduce((count, bundle) => count + (bundle?.attempts.length ?? 0), 0);
    expect(after).toBe(before);
  });

  it("records a returned attempt after lease expiry but forbids the old owner from terminalizing the snapshot", async () => {
    const fixture = await setup("时效");
    const claim = await acquireMarketSnapshotLease({ cacheIdentity: fixture.identity.id, leaseOwner: "worker-expiring", leaseDurationMs: 20 });
    if (!claim.acquired) throw new Error("Expected fixture lease.");
    const snapshot = await createMarketSnapshotRefresh({ identity: fixture.identity, authorityVersion: fixture.authorityVersion, token: claim.token, questionHash: sha(fixture.identity.normalizedQuestion) });
    const fixtureQuery = query(snapshot.id);
    await appendMarketSnapshotQueries({ snapshotId: snapshot.id, token: claim.token, queries: [fixtureQuery] });
    const attempt = await beginMarketSearchAttempt({ snapshotId: snapshot.id, queryId: fixtureQuery.id, token: claim.token, idempotencyReference: `late-${snapshot.id}`, configuredCostMicros: 12 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(completeMarketSearchAttempt({ attemptId: attempt.id, token: { ...claim.token, leaseOwner: "forged-owner" }, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 0 }, providerCostMicros: 12, costUncertain: false })).rejects.toThrow(/generation/i);
    await expect(completeMarketSearchAttempt({ attemptId: attempt.id, token: claim.token, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 0 }, providerCostMicros: 12, costUncertain: false })).resolves.toMatchObject({ requestStatus: "succeeded", providerCostMicros: 12 });
    await expect(completeMarketSnapshotLease({ snapshotId: snapshot.id, token: claim.token, queryFanoutHash: sha("fanout") })).rejects.toThrow(/lost|expired/i);
  });

  it("rejects cross-identity lease writes and refuses completion while any retry is pending", async () => {
    const [a, b] = await Promise.all([setup("拼箱"), setup("整柜")]);
    const claimA = await acquireMarketSnapshotLease({ cacheIdentity: a.identity.id, leaseOwner: "worker-a", leaseDurationMs: 10_000 });
    const claimB = await acquireMarketSnapshotLease({ cacheIdentity: b.identity.id, leaseOwner: "worker-b", leaseDurationMs: 10_000 });
    if (!claimA.acquired || !claimB.acquired) throw new Error("Expected fixture leases.");
    const snapshotB = await createMarketSnapshotRefresh({ identity: b.identity, authorityVersion: b.authorityVersion, token: claimB.token, questionHash: sha(b.identity.normalizedQuestion) });
    await expect(appendMarketSnapshotQueries({ snapshotId: snapshotB.id, token: claimA.token, queries: [query(snapshotB.id)] })).rejects.toThrow(/foreign snapshot identity/i);
    await expect(completeMarketSnapshotLease({ snapshotId: snapshotB.id, token: claimA.token, queryFanoutHash: sha("foreign") })).rejects.toThrow(/foreign snapshot identity/i);
    await expect(releaseFailedMarketSnapshotLease({ token: claimA.token, snapshotId: snapshotB.id })).rejects.toThrow(/foreign snapshot identity/i);
    const fixtureQuery = query(snapshotB.id);
    await appendMarketSnapshotQueries({ snapshotId: snapshotB.id, token: claimB.token, queries: [fixtureQuery] });
    const success = await beginMarketSearchAttempt({ snapshotId: snapshotB.id, queryId: fixtureQuery.id, token: claimB.token, idempotencyReference: `success-${snapshotB.id}`, configuredCostMicros: 1 });
    await completeMarketSearchAttempt({ attemptId: success.id, token: claimB.token, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 0 }, providerCostMicros: 1, costUncertain: false });
    await beginMarketSearchAttempt({ snapshotId: snapshotB.id, queryId: fixtureQuery.id, token: claimB.token, idempotencyReference: `retry-${snapshotB.id}`, configuredCostMicros: 1 });
    await expect(completeMarketSnapshotLease({ snapshotId: snapshotB.id, token: claimB.token, queryFanoutHash: sha("fanout") })).rejects.toThrow(/pending/i);
  });
});

async function setup(variant = "") {
  const surface = { surfaceId: "surface-a", providerId: "provider-a", productId: "search", surfaceKind: "documented_api" as const, contractVersion: "1", surfaceVersion: "2026-07", adapterVersion: "1", locale: "zh-CN", region: "CN" };
  const installed = await installPublicSearchSurfaceAuthority({ environment: "staging", surfaceId: surface.surfaceId, surfaceVersion: surface.surfaceVersion, localeCapabilities: [surface.locale], regionCapabilities: [surface.region], termsReviewedAt: "2030-01-01T00:00:00.000Z", evidenceReferences: ["review"], capturedAt: "2030-01-02T00:00:00.000Z", active: false });
  const authority = installed.active ? installed : await activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, environment: "staging", surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion });
  const exactText = `深圳到台湾${variant}运输公司有哪些？`;
  const question = { id: `q1-${variant}`, questionSetVersion: "1", locale: surface.locale, region: surface.region, kind: "supplier_discovery" as const, exactText, normalizedText: exactText, derivation: { ruleId: "direct", evidenceSourceIds: ["public-site"], subject: `深圳到台湾${variant}运输`, broadened: false } };
  return { identity: createMarketSnapshotIdentity({ question, surface, fanoutVersion: "fanout-v1" }), authorityVersion: authority.authorityVersion };
}

async function completeFixture(identity: MarketSnapshotIdentity, authorityVersion: string, leaseOwner: string) {
  const claim = await acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner, leaseDurationMs: 10_000 });
  if (!claim.acquired) throw new Error("Expected fixture lease.");
  const snapshot = await createMarketSnapshotRefresh({ identity, authorityVersion, token: claim.token, questionHash: sha(identity.normalizedQuestion) });
  const fixtureQuery = query(snapshot.id);
  await appendMarketSnapshotQueries({ snapshotId: snapshot.id, token: claim.token, queries: [fixtureQuery] });
  const attempt = await beginMarketSearchAttempt({ snapshotId: snapshot.id, queryId: fixtureQuery.id, token: claim.token, idempotencyReference: `attempt-${snapshot.id}`, configuredCostMicros: 1 });
  await completeMarketSearchAttempt({ attemptId: attempt.id, token: claim.token, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 0 }, providerCostMicros: 1, costUncertain: false });
  return completeMarketSnapshotLease({ snapshotId: snapshot.id, token: claim.token, queryFanoutHash: sha(`fanout-${snapshot.id}`) });
}

function query(snapshotId: string) { return { id: `query-${sha(snapshotId).slice(0, 16)}`, queryOrder: 0, queryText: "深圳 台湾 运输公司", queryHash: sha("深圳 台湾 运输公司"), derivationRule: "direct" }; }
function sha(value: string) { return createHash("sha256").update(value).digest("hex"); }

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSearchQueryFanout,
  type CanonicalBuyerQuestion,
  type PublicSearchSurface,
  type PublicSearchSurfaceAdapter,
  type PublicSearchSurfaceAuthority
} from "@open-geo-console/public-search-observer";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import { PublicSourceSnapshotAuthorityMismatchError, PublicSourceSnapshotUnavailableError, resolvePublicSourceSnapshot } from "./public-source-snapshot-resolver";

const surface: PublicSearchSurface = {
  surfaceId: "fixture-public-search", providerId: "fixture-provider", productId: "fixture-search",
  surfaceKind: "documented_api", contractVersion: "public-search-surface-v1", surfaceVersion: "fixture-v1",
  adapterVersion: "fixture-adapter-v1", locale: "zh-CN", region: "CN"
};

const question: CanonicalBuyerQuestion = {
  id: "question-public-snapshot", questionSetVersion: "public-question-v1", locale: "zh-CN", region: "CN",
  kind: "supplier_discovery", exactText: "深圳到台湾货运服务商有哪些？", normalizedText: "深圳到台湾货运服务商有哪些？",
  derivation: { ruleId: "fixture", evidenceSourceIds: ["public-site"], subject: "深圳到台湾货运", broadened: false }
};

describe("public-source snapshot resolver", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.OPEN_GEO_DB_PATH = `memory-public-source-resolver-${randomUUID()}`;
  });

  it("writes only normalized annotations-derived observations and not_retrieved source rows, then reuses the exact authority-bound snapshot", async () => {
    const authority = await installAuthority("review-one");
    const search = vi.fn(async () => observationPayload("complete"));
    const adapter = fixtureAdapter(authority, search);
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const input = { authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-public-source" };

    const first = await resolvePublicSourceSnapshot(input);
    const bundle = await getMarketSnapshotBundle(first.snapshotId);

    expect(first).toMatchObject({ collectedForThisRun: true, refreshAttempted: true, refreshFailed: false, sufficientlyEvidenced: false });
    expect(first.observations).toEqual(expect.arrayContaining([expect.objectContaining({ status: "complete", results: expect.arrayContaining([expect.objectContaining({ url: "https://directory.example.test/shenzhen-taiwan" })]) })]));
    expect(bundle?.queries).toHaveLength(fanout.queries.length);
    expect(bundle?.attempts.every((attempt) => attempt.requestStatus === "succeeded")).toBe(true);
    expect(bundle?.observations).toHaveLength(fanout.queries.length);
    expect(bundle?.sources).toHaveLength(1);
    expect(bundle?.sources.every((source) => source.retrievalState === "not_retrieved" && source.excerpt === null && source.contentHash === null)).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain("generated prose");

    const reused = await resolvePublicSourceSnapshot(input);
    expect(reused).toMatchObject({ snapshotId: first.snapshotId, collectedForThisRun: false, refreshAttempted: false, refreshFailed: false, actualCostMicros: 0 });
    expect(reused.avoidedCostMicros).toBeGreaterThan(0);
    expect(search).toHaveBeenCalledTimes(fanout.queries.length);
  });

  it("runs no more than two search requests for one question at a time", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    let active = 0;
    let peak = 0;
    const search = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 3));
      active -= 1;
      return observationPayload("complete");
    });
    await resolvePublicSourceSnapshot({ authority, adapter: fixtureAdapter(authority, search), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-concurrency" });
    expect(peak).toBe(2);
  });

  it("never reuses a completed snapshot under a different authority version", async () => {
    const firstAuthority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    await resolvePublicSourceSnapshot({ authority: firstAuthority, adapter: fixtureAdapter(firstAuthority, async () => observationPayload("complete")), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-first" });
    const secondAuthority = await installAuthority("review-two");

    await expect(resolvePublicSourceSnapshot({ authority: secondAuthority, adapter: fixtureAdapter(secondAuthority, async () => observationPayload("complete")), question, fanout, evidenceCutoffAt: "2030-01-05T00:00:00.000Z", leaseOwner: "worker-second" }))
      .rejects.toBeInstanceOf(PublicSourceSnapshotAuthorityMismatchError);
  });

  it("releases a failed lease and throws a safe error when every query fails", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    await expect(resolvePublicSourceSnapshot({ authority, adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-failed" }))
      .rejects.toBeInstanceOf(PublicSourceSnapshotUnavailableError);
    await expect(resolvePublicSourceSnapshot({ authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-retry" })).resolves.toMatchObject({ collectedForThisRun: true });
  });
});

async function installAuthority(reference: string): Promise<PublicSearchSurfaceAuthority> {
  const installed = await installPublicSearchSurfaceAuthority({ environment: "staging", adapterId: "fixture", providerId: surface.providerId, productId: surface.productId, modelId: "fixture-model", adapterVersion: surface.adapterVersion, surfaceId: surface.surfaceId, surfaceVersion: surface.surfaceVersion, localeCapabilities: [surface.locale], regionCapabilities: [surface.region], termsReviewedAt: "2030-01-01T00:00:00.000Z", evidenceReferences: [reference], capturedAt: `2030-01-0${reference.endsWith("two") ? "3" : "2"}T00:00:00.000Z`, active: false });
  const active = await activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, environment: "staging", adapterId: installed.adapterId, providerId: installed.providerId, productId: installed.productId, modelId: installed.modelId, adapterVersion: installed.adapterVersion, surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion });
  return { authorityId: active.authorityVersion, environment: "test", surface, active: active.active, certifiedAt: active.capturedAt.toISOString(), evidenceReference: active.evidenceReferences[0]!, supportedLocales: active.localeCapabilities, supportedRegions: active.regionCapabilities };
}

function fixtureAdapter(authority: PublicSearchSurfaceAuthority, search: PublicSearchSurfaceAdapter["search"]): PublicSearchSurfaceAdapter {
  return { id: "fixture", surface, authority, search: async (input) => ({
    ...await search(input), queryId: input.query.id, exactQuery: input.query.exactQuery
  }), classifyError: () => "unavailable" };
}

function observationPayload(status: "complete" | "unavailable") {
  const now = "2030-01-02T00:00:00.000Z";
  return {
    observationId: `adapter-observation-${status}`, surface, queryId: "placeholder", exactQuery: "placeholder", requestedAt: now, completedAt: now,
    status, results: status === "complete" ? [{ surfaceResultOrder: 1, url: "https://directory.example.test/shenzhen-taiwan", title: "深圳台湾货运目录", snippet: "公开目录条目", displayedHost: "directory.example.test" }] : [],
    usage: { requestCount: 1, resultCount: status === "complete" ? 1 : 0, estimatedCostMicros: 42, costUncertain: false }
  };
}

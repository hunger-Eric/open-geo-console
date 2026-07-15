import { createHash, randomUUID } from "node:crypto";
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
import { getMarketProviderEvidenceBundle } from "@/db/provider-evidence";
import { PROVIDER_PASSAGE_SELECTOR_VERSION, selectProviderPassages } from "@open-geo-console/citation-intelligence";
import { PublicSourceSnapshotAuthorityMismatchError, PublicSourceSnapshotUnavailableError, resolvePublicSourceSnapshot } from "./public-source-snapshot-resolver";
import { createConcurrencyGate } from "./bounded-scheduler";

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
    expect(new Set(first.observations.map(({ observationId }) => observationId)).size).toBe(fanout.queries.length);
    expect(first.observations.map(({ queryId }) => queryId).sort()).toEqual(fanout.queries.map(({ id }) => id).sort());
    expect(bundle?.queries).toHaveLength(fanout.queries.length);
    expect(bundle?.attempts.every((attempt) => attempt.requestStatus === "succeeded")).toBe(true);
    expect(bundle?.observations).toHaveLength(fanout.queries.length);
    expect(bundle?.sources).toHaveLength(1);
    expect(bundle?.sources.every((source) => source.retrievalState === "not_retrieved" && source.excerpt === null && source.contentHash === null)).toBe(true);
    expect(JSON.stringify(bundle)).not.toContain("generated prose");

    const reused = await resolvePublicSourceSnapshot(input);
    expect(reused).toMatchObject({ snapshotId: first.snapshotId, collectedForThisRun: false, refreshAttempted: false, refreshFailed: false, actualCostMicros: 0 });
    expect(reused.observations.map(({ queryId }) => queryId).sort()).toEqual(first.observations.map(({ queryId }) => queryId).sort());
    expect(reused.avoidedCostMicros).toBeGreaterThan(0);
    expect(search).toHaveBeenCalledTimes(fanout.queries.length);

    const refreshed = await resolvePublicSourceSnapshot({ ...input, forceRefresh: true, evidenceCutoffAt: "2030-01-05T00:00:00.000Z" });
    expect(refreshed).toMatchObject({ collectedForThisRun: true, refreshAttempted: true });
    expect(refreshed.snapshotId).not.toBe(first.snapshotId);
    expect(search).toHaveBeenCalledTimes(fanout.queries.length * 2);
    const resumedRefresh = await resolvePublicSourceSnapshot({ ...input, forceRefreshAfter: "2020-01-01T00:00:00.000Z", evidenceCutoffAt: "2030-01-05T00:00:00.000Z" });
    expect(resumedRefresh).toMatchObject({ snapshotId: refreshed.snapshotId, collectedForThisRun: false });
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

  it("resumes a fully searched snapshot and skips source evidence persisted before abort", async () => {
    const authority = await installAuthority("review-one");
    const search = vi.fn(async () => ({
      ...observationPayload("complete"),
      results: ["one", "two"].map((path, index) => ({ surfaceResultOrder: index + 1, url: `https://source-${path}.example.test/page`, title: path, snippet: path, displayedHost: `source-${path}.example.test` })),
      usage: { requestCount: 1, resultCount: 2, estimatedCostMicros: 42, costUncertain: false }
    }));
    const adapter = fixtureAdapter(authority, search);
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const controller = new AbortController();
    const deadline = new Error("worker deadline");
    let firstAttemptRetrievals = 0;
    const firstInput = {
      authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-resume-first",
      signal: controller.signal, retrievalGate: createConcurrencyGate(1),
      retrieveSource: async ({ observation, result }: Parameters<NonNullable<Parameters<typeof resolvePublicSourceSnapshot>[0]["retrieveSource"]>>[0]) => {
        firstAttemptRetrievals += 1;
        if (firstAttemptRetrievals === 2) {
          controller.abort(deadline);
          throw deadline;
        }
        return availableRetrieval(observation, result);
      }
    };
    await expect(resolvePublicSourceSnapshot(firstInput)).rejects.toBe(deadline);
    expect(firstAttemptRetrievals).toBe(2);
    expect(controller.signal.reason).toBe(deadline);

    let resumedRetrievals = 0;
    const resumed = await resolvePublicSourceSnapshot({
      authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-resume-second",
      retrievalGate: createConcurrencyGate(1),
      retrieveSource: async ({ observation, result }) => {
        resumedRetrievals += 1;
        return availableRetrieval(observation, result);
      }
    });
    const bundle = await getMarketSnapshotBundle(resumed.snapshotId);
    expect(search).toHaveBeenCalledTimes(fanout.queries.length);
    expect(resumedRetrievals).toBe(1);
    expect(bundle?.sources).toHaveLength(2);
    expect(resumed.retrievals).toHaveLength(2);
    expect(resumed.sufficientlyEvidenced).toBe(true);
  });

  it("resumes a terminal mixed search ledger after retrieval abort", async () => {
    const authority = await installAuthority("review-one");
    let searchCalls = 0;
    const search = vi.fn(async () => observationPayload(searchCalls++ === 0 ? "complete" : "unavailable"));
    const adapter = fixtureAdapter(authority, search);
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const controller = new AbortController();
    const deadline = new Error("worker deadline after partial search success");

    await expect(resolvePublicSourceSnapshot({
      authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-mixed-first",
      signal: controller.signal,
      retrieveSource: async () => {
        controller.abort(deadline);
        throw deadline;
      }
    })).rejects.toBe(deadline);

    let resumedRetrievals = 0;
    const resumed = await resolvePublicSourceSnapshot({
      authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-mixed-second",
      retrieveSource: async ({ observation, result }) => {
        resumedRetrievals += 1;
        return availableRetrieval(observation, result);
      }
    });

    expect(search).toHaveBeenCalledTimes(fanout.queries.length);
    expect(resumedRetrievals).toBe(1);
    expect(resumed).toMatchObject({ collectedForThisRun: true, sufficientlyEvidenced: true, availableSourceCount: 1 });
  });

  it("persists public contact evidence without treating it as private customer identity", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const resolved = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-sensitive-source",
      retrieveSource: async ({ observation, result }) => {
        const value = availableRetrieval(observation, result);
        const excerpt = "Contact public-source@example.test for details.";
        return {
          ...value,
          fact: { ...value.fact, normalizedText: excerpt, verifiedExcerpt: excerpt },
          source: { ...value.source, excerpt }
        };
      }
    });
    const bundle = await getMarketSnapshotBundle(resolved.snapshotId);

    expect(resolved).toMatchObject({ collectedForThisRun: true, sufficientlyEvidenced: true, availableSourceCount: 1 });
    expect(resolved.retrievals).toHaveLength(1);
    expect(bundle?.snapshot.status).toBe("completed");
    expect(bundle?.sources).toEqual([
      expect.objectContaining({ retrievalState: "available", excerpt: "Contact public-source@example.test for details." })
    ]);
  });

  it("persists selected provider passages before completing the snapshot lease", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const resolved = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-provider-passages",
      retrieveSource: async ({ observation, result }) => {
        const value = availableRetrieval(observation, result);
        const excerpt = "Alpha Logistics provides self-operated freight using an owned fleet on a fixed route.";
        return { ...value, fact: { ...value.fact, normalizedText: excerpt, verifiedExcerpt: excerpt }, source: { ...value.source, excerpt, excerptHash: hash(excerpt), contentHash: hash(excerpt) } };
      },
      selectProviderPassages: ({ fact, sourceEvidenceId }) => selectProviderPassages({
        sourceEvidenceId, normalizedText: fact.normalizedText ?? "", candidateNames: ["Alpha Logistics"], serviceTerms: ["freight"],
        controlTerms: ["self-operated", "owned"], capabilityTerms: ["fleet", "fixed route"], selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION
      })
    });
    const provider = await getMarketProviderEvidenceBundle([resolved.snapshotId]);
    expect(provider.passages).toEqual([expect.objectContaining({ sourceEvidenceId: expect.any(String), exactExcerpt: expect.stringContaining("owned fleet") })]);
  });

  it("downgrades credential-like public content without failing the snapshot", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const resolved = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-credential-source",
      retrieveSource: async ({ observation, result }) => {
        const value = availableRetrieval(observation, result);
        const excerpt = "Authorization: Bearer public-example-token";
        return {
          ...value,
          fact: { ...value.fact, normalizedText: excerpt, verifiedExcerpt: excerpt },
          source: { ...value.source, excerpt }
        };
      }
    });
    const bundle = await getMarketSnapshotBundle(resolved.snapshotId);

    expect(resolved).toMatchObject({ sufficientlyEvidenced: false, availableSourceCount: 0 });
    expect(bundle?.snapshot.status).toBe("completed");
    expect(bundle?.sources).toEqual([
      expect.objectContaining({ retrievalState: "inaccessible", excerpt: null, excerptHash: null, contentHash: null })
    ]);
  });

  it("never reuses a completed snapshot under a different authority version", async () => {
    const firstAuthority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    await resolvePublicSourceSnapshot({ authority: firstAuthority, adapter: fixtureAdapter(firstAuthority, async () => observationPayload("complete")), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-first" });
    const secondAuthority = await installAuthority("review-two");

    await expect(resolvePublicSourceSnapshot({ authority: secondAuthority, adapter: fixtureAdapter(secondAuthority, async () => observationPayload("complete")), question, fanout, evidenceCutoffAt: "2030-01-05T00:00:00.000Z", leaseOwner: "worker-second" }))
      .rejects.toBeInstanceOf(PublicSourceSnapshotAuthorityMismatchError);
  });

  it("refreshes a completed same-authority lease when its terminal snapshot is outside the evidence cutoff", async () => {
    const authority = await installAuthority("review-one");
    const search = vi.fn(async () => observationPayload("complete"));
    const adapter = fixtureAdapter(authority, search);
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const first = await resolvePublicSourceSnapshot({
      authority, adapter, question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-cutoff-first"
    });

    const refreshed = await resolvePublicSourceSnapshot({
      authority, adapter, question, fanout,
      evidenceCutoffAt: "2020-01-01T00:00:00.000Z",
      leaseOwner: "worker-cutoff-refresh"
    });

    expect(refreshed).toMatchObject({ collectedForThisRun: true, refreshAttempted: true });
    expect(refreshed.snapshotId).not.toBe(first.snapshotId);
    expect(search).toHaveBeenCalledTimes(fanout.queries.length * 2);
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

function availableRetrieval(observation: Parameters<NonNullable<Parameters<typeof resolvePublicSourceSnapshot>[0]["retrieveSource"]>>[0]["observation"], result: Parameters<NonNullable<Parameters<typeof resolvePublicSourceSnapshot>[0]["retrieveSource"]>>[0]["result"]) {
  const digest = "a".repeat(64);
  return {
    fact: { observationId: observation.observationId, queryId: observation.queryId, resultUrl: result.url, finalUrl: result.url, retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true, accessBarrier: "none" as const, normalizedText: `Evidence for ${result.title}`, normalizedContentHash: `sha256:${digest}`, verifiedExcerpt: `Evidence for ${result.title}` },
    source: { retrievalState: "available" as const, excerpt: `Evidence for ${result.title}`, excerptHash: digest, contentHash: digest, sourceCategory: "unknown" as const, entities: [], claims: [], contradictions: [], evidenceFamilyIdentity: digest }
  };
}
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }

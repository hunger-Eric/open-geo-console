import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMarketSnapshotIdentity,
  createSearchQueryFanout,
  type CanonicalBuyerQuestion,
  type CanonicalBuyerQuestionSet,
  type PublicSearchSurface,
  type PublicSearchSurfaceAdapter,
  type PublicSearchSurfaceAuthority
} from "@open-geo-console/public-search-observer";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "@/db/public-search-authority";
import { getMarketSnapshotBundle } from "@/db/market-snapshots";
import * as marketSnapshots from "@/db/market-snapshots";
import { getMarketProviderEvidenceBundle } from "@/db/provider-evidence";
import { PROVIDER_PASSAGE_SELECTOR_VERSION, selectProviderPassages } from "@open-geo-console/citation-intelligence";
import { PublicSourceSnapshotAuthorityMismatchError, PublicSourceSnapshotUnavailableError, isDeferrablePublicSourceOutage, resolvePublicSourceSnapshot } from "./public-source-snapshot-resolver";
import { createConcurrencyGate } from "./bounded-scheduler";
import { createPublicSourceQuestionFanouts } from "./public-source-forensics";

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

  it("reuses one semantic snapshot across report-local question identities while projecting current query IDs", async () => {
    const authority = await installAuthority("review-cross-report-reuse");
    const search = vi.fn(async () => observationPayload("complete"));
    const adapter = fixtureAdapter(authority, search);
    const originFanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const currentQuestion = {
      ...question,
      id: "question-public-snapshot-current-report",
      questionSetVersion: "public-question-v2"
    };
    const currentFanout = createSearchQueryFanout({ question: currentQuestion, surface, excludedIdentities: [] });
    expect(currentFanout.queries.map(({ exactQuery }) => exactQuery)).toEqual(originFanout.queries.map(({ exactQuery }) => exactQuery));
    expect(currentFanout.queries.map(({ id }) => id)).not.toEqual(originFanout.queries.map(({ id }) => id));

    const first = await resolvePublicSourceSnapshot({
      authority, adapter, question, fanout: originFanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-origin"
    });
    const originBundle = await getMarketSnapshotBundle(first.snapshotId);
    const reused = await resolvePublicSourceSnapshot({
      authority, adapter, question: currentQuestion, fanout: currentFanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-current"
    });
    const reusedBundle = await getMarketSnapshotBundle(reused.snapshotId);

    expect(reused).toMatchObject({ snapshotId: first.snapshotId, collectedForThisRun: false, actualCostMicros: 0 });
    expect(reused.observations.map(({ queryId }) => queryId).sort()).toEqual(currentFanout.queries.map(({ id }) => id).sort());
    expect(reused.observations.map(({ queryId }) => queryId).sort()).not.toEqual(originFanout.queries.map(({ id }) => id).sort());
    expect(reusedBundle?.queries.map(({ id }) => id)).toEqual(originBundle?.queries.map(({ id }) => id));
    expect(reusedBundle?.attempts.map(({ id }) => id)).toEqual(originBundle?.attempts.map(({ id }) => id));
    expect(reusedBundle?.observations.map(({ id }) => id)).toEqual(originBundle?.observations.map(({ id }) => id));
    expect(search).toHaveBeenCalledTimes(originFanout.queries.length);
  });

  it("collects a new snapshot when the effective query plan changes under the same fanout version", async () => {
    const authority = await installAuthority("review-query-plan-identity");
    const search = vi.fn(async () => observationPayload("complete"));
    const adapter = fixtureAdapter(authority, search);
    const genericFanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const policyFanout = {
      ...genericFanout,
      queries: genericFanout.queries.map((query, index) => index === 1
        ? { ...query, exactQuery: `${question.normalizedText} 自有车队 固定运力` }
        : query)
    };
    const common = { authority, adapter, question, evidenceCutoffAt: "2030-01-04T00:00:00.000Z" };

    const first = await resolvePublicSourceSnapshot({ ...common, fanout: genericFanout, leaseOwner: "worker-generic-policy" });
    const second = await resolvePublicSourceSnapshot({ ...common, fanout: policyFanout, leaseOwner: "worker-logistics-policy" });

    expect(second.snapshotId).not.toBe(first.snapshotId);
    expect(second.collectedForThisRun).toBe(true);
    expect(search).toHaveBeenCalledTimes(genericFanout.queries.length + policyFanout.queries.length);
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

  it("reuses the provider-standard full fanout for the later forensic resolution without another adapter call", async () => {
    const authority = await installAuthority("review-provider-forensic-reuse");
    const questions: CanonicalBuyerQuestionSet = { questionSetVersion: question.questionSetVersion, locale: question.locale, region: question.region, confidence: "high", questions: [question], limitations: [] };
    const providerFanout = createPublicSourceQuestionFanouts({ questions, authority, excludedIdentities: [] })[0]!;
    const forensicFanout = createPublicSourceQuestionFanouts({ questions, authority, excludedIdentities: [] })[0]!;
    expect(createMarketSnapshotIdentity({ question, surface, fanout: providerFanout }).id)
      .toBe(createMarketSnapshotIdentity({ question, surface, fanout: forensicFanout }).id);
    const search = vi.fn(async () => observationPayload("complete"));
    const common = { authority, adapter: fixtureAdapter(authority, search), question, evidenceCutoffAt: "2030-01-04T00:00:00.000Z" };

    const provider = await resolvePublicSourceSnapshot({ ...common, fanout: providerFanout, leaseOwner: "worker-provider-standard" });
    const callsAfterProvider = search.mock.calls.length;
    const forensic = await resolvePublicSourceSnapshot({ ...common, fanout: forensicFanout, leaseOwner: "worker-forensic" });

    expect(providerFanout.queries).toHaveLength(6);
    expect(callsAfterProvider).toBe(6);
    expect(search).toHaveBeenCalledTimes(callsAfterProvider);
    expect(forensic).toMatchObject({ snapshotId: provider.snapshotId, collectedForThisRun: false, actualCostMicros: 0 });
  });

  it("allocates a search deadline per concurrency wave instead of per raw query", async () => {
    const authority = await installAuthority("review-concurrency-wave-budget");
    const baseFanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const fanout = { ...baseFanout, budget: { ...baseFanout.budget, timeoutMs: 60_000 } };
    let active = 0;
    let peak = 0;
    const search = vi.fn(async ({ signal }: Parameters<PublicSearchSurfaceAdapter["search"]>[0]) => {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 70);
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(signal.reason);
          }, { once: true });
        });
        return observationPayload("complete");
      } finally {
        active -= 1;
      }
    });

    await expect(resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, search),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-concurrency-wave-budget",
      executionBudget: { searchMs: 300, retrievalMs: 60_000 }
    })).resolves.toMatchObject({ collectedForThisRun: true, refreshFailed: false });
    expect(fanout.queries).toHaveLength(6);
    expect(search).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it("supports an explicit single-search lane without changing the default plan", async () => {
    const authority = await installAuthority("review-single-search-lane");
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

    const resolved = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, search),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-single-search-lane",
      searchConcurrency: 1
    });

    expect(peak).toBe(1);
    expect(search).toHaveBeenCalledTimes(fanout.queries.length);
    expect(resolved.observations).toHaveLength(fanout.queries.length);
  });

  it("renews the snapshot lease while slow source retrieval is still running", async () => {
    const authority = await installAuthority("review-slow-retrieval");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const retrieveSource = vi.fn(async ({ observation, result }) => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      return availableRetrieval(observation, result);
    });

    await expect(resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-slow-retrieval",
      leaseDurationMs: 500,
      retrieveSource,
      maxSourceRetrievals: 1
    })).resolves.toMatchObject({ collectedForThisRun: true, availableSourceCount: 1 });
  });

  it("waits for the matching metadata refresh instead of returning an older completed snapshot", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const discovery = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-metadata-discovery",
      snapshotMetadata: { snapshotKind: "provider_discovery", queryPlanVersion: "provider-query-plan-v1" }
    });
    let releaseSearch!: () => void;
    const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
    const search = vi.fn(async () => {
      await searchGate;
      return observationPayload("complete");
    });
    const candidateInput = {
      authority, adapter: fixtureAdapter(authority, search), question, fanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z",
      snapshotMetadata: {
        snapshotKind: "candidate_verification" as const,
        parentSnapshotId: discovery.snapshotId,
        candidateSetHash: "a".repeat(64),
        queryPlanVersion: "provider-query-plan-v1"
      }
    };

    const first = resolvePublicSourceSnapshot({ ...candidateInput, leaseOwner: "worker-metadata-first", waitDeadlineMs: 5_000 });
    await vi.waitFor(() => expect(search).toHaveBeenCalled());
    const second = resolvePublicSourceSnapshot({ ...candidateInput, leaseOwner: "worker-metadata-second", waitDeadlineMs: 5_000 });
    releaseSearch();

    const [created, reused] = await Promise.all([first, second]);
    expect(reused.snapshotId).toBe(created.snapshotId);
    expect(reused.collectedForThisRun).toBe(false);
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

  it("replaces an incomplete pending search ledger after Worker interruption", async () => {
    const authority = await installAuthority("review-one");
    const controller = new AbortController();
    const deadline = new Error("worker stopped during provider search");
    let interrupted = false;
    const search = vi.fn(async () => {
      if (!interrupted) {
        interrupted = true;
        controller.abort(deadline);
        throw deadline;
      }
      return observationPayload("complete");
    });
    const adapter = fixtureAdapter(authority, search);
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });

    await expect(resolvePublicSourceSnapshot({
      authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-interrupted-first",
      signal: controller.signal
    })).rejects.toBe(deadline);

    const resumed = await resolvePublicSourceSnapshot({
      authority, adapter, question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-interrupted-second"
    });

    expect(resumed).toMatchObject({ collectedForThisRun: true, refreshAttempted: true });
    expect(search.mock.calls.length).toBeGreaterThan(fanout.queries.length);
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

  it("falls back to the exact completed snapshot when a forced network refresh fails", async () => {
    const authority = await installAuthority("review-stale-if-error");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const first = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-stale-first"
    });

    const fallback = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z",
      leaseOwner: "worker-stale-refresh",
      forceRefresh: true
    });

    expect(fallback).toMatchObject({
      snapshotId: first.snapshotId,
      collectedForThisRun: false,
      refreshAttempted: true,
      refreshFailed: true
    });
  });

  it("releases a failed lease and throws a safe error when every query fails", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    await expect(resolvePublicSourceSnapshot({ authority, adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-failed" }))
      .rejects.toBeInstanceOf(PublicSourceSnapshotUnavailableError);
    await expect(resolvePublicSourceSnapshot({ authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout, evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-retry" })).resolves.toMatchObject({ collectedForThisRun: true });
  });

  it("completes exhausted candidate verification from failed supplemental searches", async () => {
    const authority = await installAuthority("review-candidate-exhaustion");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const discovery = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-candidate-discovery",
      snapshotMetadata: { snapshotKind: "provider_discovery", queryPlanVersion: "provider-query-plan-v1" }
    });

    const verification = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z",
      leaseOwner: "worker-candidate-exhausted",
      snapshotMetadata: {
        snapshotKind: "candidate_verification",
        parentSnapshotId: discovery.snapshotId,
        candidateSetHash: "b".repeat(64),
        queryPlanVersion: "provider-query-plan-v1"
      }
    });
    const bundle = await getMarketSnapshotBundle(verification.snapshotId);

    expect(verification).toMatchObject({ collectedForThisRun: true, availableSourceCount: 0, sufficientlyEvidenced: false });
    expect(verification.observations).toHaveLength(fanout.queries.length);
    expect(verification.observations.every(({ status }) => status === "unavailable")).toBe(true);
    expect(bundle?.snapshot.status).toBe("completed");
    expect(bundle?.attempts.every(({ requestStatus }) => !["pending", "succeeded", "partial"].includes(requestStatus))).toBe(true);
  });

  it("classifies observation persistence failures and releases the lease", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const append = vi.spyOn(marketSnapshots, "appendMarketSearchObservations")
      .mockRejectedValueOnce(new Error("database unavailable"));

    await expect(resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-observation-persistence-failed"
    })).rejects.toMatchObject({
      name: "PublicSourceSnapshotUnavailableError",
      stage: "observation_persistence",
      code: "public_source_snapshot_observation_persistence"
    });
    append.mockRestore();

    await expect(resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-observation-persistence-retry"
    })).resolves.toMatchObject({ collectedForThisRun: true });
  });

  it("classifies source retrieval failures and releases the lease", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });

    await expect(resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-source-retrieval-failed",
      retrieveSource: async () => { throw new Error("retrieval transport failed"); }
    })).rejects.toMatchObject({
      name: "PublicSourceSnapshotUnavailableError",
      stage: "source_retrieval",
      code: "public_source_snapshot_source_retrieval"
    });

    await expect(resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => observationPayload("complete")),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-source-retrieval-retry"
    })).resolves.toMatchObject({ collectedForThisRun: true });
  });

  it("filters invalid provider results before persistence, retrieval, and materialization", async () => {
    const authority = await installAuthority("review-one");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const retrieveSource = vi.fn(async ({ observation, result }) => availableRetrieval(observation, result));
    const resolved = await resolvePublicSourceSnapshot({
      authority,
      adapter: fixtureAdapter(authority, async () => ({
        ...observationPayload("complete"),
        results: [
          { surfaceResultOrder: 1, url: "https://valid.example/services?utm_source=search", title: "Valid service", snippet: "Public logistics service", displayedHost: "valid.example" },
          { surfaceResultOrder: 2, url: "https://contact.example/ip", title: "Contact 203.0.113.42", snippet: "discard", displayedHost: "contact.example" },
          { surfaceResultOrder: 3, url: "https://contact.example/email", title: "Contact private@example.test", snippet: "discard", displayedHost: "contact.example" }
        ],
        usage: { requestCount: 1, resultCount: 3, estimatedCostMicros: 42, costUncertain: false }
      })),
      question,
      fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z",
      leaseOwner: "worker-filter-invalid-results",
      retrieveSource
    });
    const bundle = await getMarketSnapshotBundle(resolved.snapshotId);
    const serialized = JSON.stringify({ bundle, resolved });

    expect(bundle?.snapshot.status).toBe("completed");
    expect(bundle?.observations).toHaveLength(fanout.queries.length);
    expect(bundle?.observations.every(({ surfaceResultOrder }) => surfaceResultOrder === 1)).toBe(true);
    expect(resolved.observations.every(({ results }) => results.length === 1 && results[0]?.surfaceResultOrder === 1)).toBe(true);
    expect(retrieveSource).toHaveBeenCalled();
    expect(retrieveSource.mock.calls.every(([input]) => input.result.surfaceResultOrder === 1)).toBe(true);
    expect(resolved.availableSourceCount).toBe(resolved.retrievals.length);
    expect(serialized).not.toContain("contact.example/ip");
    expect(serialized).not.toContain("203.0.113.42");
    expect(serialized).not.toContain("private@example.test");
  });

  it("downgrades a metadata-mismatched exact prior to stale-but-usable only when the forced refresh is impossible", async () => {
    const authority = await installAuthority("review-stale-metadata");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const search = vi.fn(async () => observationPayload("complete"));
    const first = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, search), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-stale-metadata-first"
    });
    const driftedMetadata = { snapshotKind: "standard_question" as const, queryPlanVersion: "standard-plan-v2" };

    const fallback = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")), question, fanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z", leaseOwner: "worker-stale-metadata-outage",
      snapshotMetadata: driftedMetadata
    });
    expect(fallback).toMatchObject({ snapshotId: first.snapshotId, collectedForThisRun: false, refreshAttempted: true, refreshFailed: true });

    // The exact-identity fresh refresh remains the primary path: with the
    // provider healthy, the mismatched metadata never reuses the stale prior.
    const refreshed = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, search), question, fanout,
      evidenceCutoffAt: "2030-01-06T00:00:00.000Z", leaseOwner: "worker-stale-metadata-refresh",
      snapshotMetadata: driftedMetadata
    });
    expect(refreshed).toMatchObject({ collectedForThisRun: true, refreshAttempted: true, refreshFailed: false });
    expect(refreshed.snapshotId).not.toBe(first.snapshotId);
  });

  it("waits out an actively-heartbeating lease holder instead of failing the lease wait", async () => {
    const authority = await installAuthority("review-heartbeat-wait");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    let releaseSearch!: () => void;
    const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve; });
    const holderSearch = vi.fn(async () => { await searchGate; return observationPayload("complete"); });
    const holder = resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, holderSearch), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-heartbeat-holder", leaseDurationMs: 400
    });
    await vi.waitFor(() => expect(holderSearch).toHaveBeenCalled());
    // The explicit 50 ms wait deadline is far inside the holder's refresh; the
    // resolver must wait through the holder's live lease instead of failing.
    const waiter = resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-heartbeat-waiter", waitDeadlineMs: 50
    });
    await new Promise((resolve) => setTimeout(resolve, 900));
    releaseSearch();

    const [created, reused] = await Promise.all([holder, waiter]);
    expect(reused.snapshotId).toBe(created.snapshotId);
    expect(reused.collectedForThisRun).toBe(false);
  });

  it("applies the propagated search sub-budget as a per-query deadline", async () => {
    const authority = await installAuthority("review-search-budget");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const search = vi.fn(async () => new Promise<never>(() => { /* a stalled provider never settles */ }));

    await expect(resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, search), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-search-budget",
      executionBudget: { searchMs: 60, retrievalMs: 60_000 }
    })).rejects.toMatchObject({ name: "PublicSourceSnapshotUnavailableError", stage: "search_execution" });
    expect(search).toHaveBeenCalled();
  });

  it("applies the propagated retrieval sub-budget as a per-source deadline", async () => {
    const authority = await installAuthority("review-retrieval-budget");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const stalled = vi.fn(async ({ signal }: { signal?: AbortSignal }) => new Promise<never>((_, reject) => {
      // A real retriever honors the deadline signal; a stalled one is cut off by it.
      signal?.addEventListener("abort", () => reject(new Error("retrieval exceeded the per-source deadline")));
    }));

    await expect(resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-retrieval-budget",
      retrieveSource: stalled,
      executionBudget: { searchMs: 60_000, retrievalMs: 12 }
    })).rejects.toMatchObject({ name: "PublicSourceSnapshotUnavailableError", stage: "source_retrieval" });
    expect(stalled).toHaveBeenCalled();

    await expect(resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-retrieval-budget-retry",
      retrieveSource: async ({ observation, result }) => availableRetrieval(observation, result),
      executionBudget: { searchMs: 60_000, retrievalMs: 60_000 }
    })).resolves.toMatchObject({ collectedForThisRun: true, availableSourceCount: 1 });
  });

  it("classifies provider-outage stages as deferrable and deterministic stages as ordinary transient", () => {
    expect(isDeferrablePublicSourceOutage(new PublicSourceSnapshotUnavailableError("lease_wait"))).toBe(true);
    expect(isDeferrablePublicSourceOutage(new PublicSourceSnapshotUnavailableError("search_execution"))).toBe(true);
    expect(isDeferrablePublicSourceOutage(new PublicSourceSnapshotUnavailableError("source_retrieval"))).toBe(true);
    expect(isDeferrablePublicSourceOutage(new PublicSourceSnapshotUnavailableError("observation_persistence"))).toBe(false);
    expect(isDeferrablePublicSourceOutage(new PublicSourceSnapshotUnavailableError("snapshot_materialization"))).toBe(false);
    expect(isDeferrablePublicSourceOutage(new PublicSourceSnapshotAuthorityMismatchError())).toBe(false);
    expect(isDeferrablePublicSourceOutage(new Error("other"))).toBe(false);
  });

  it("reuses a completed prefix-equivalent snapshot as fallback only when the refresh is impossible", async () => {
    const authority = await installAuthority("review-prefix-reuse");
    const search = vi.fn(async () => observationPayload("complete"));
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    // The staging incident shape: a completed three-query provider-pipeline
    // snapshot whose identity differs from the six-query forensics fanout.
    const prefixFanout = { ...fanout, queries: fanout.queries.slice(0, 3), budget: { ...fanout.budget, timeoutMs: 60_000 } };
    expect(createMarketSnapshotIdentity({ question, surface, fanout: prefixFanout }).id)
      .not.toBe(createMarketSnapshotIdentity({ question, surface, fanout }).id);
    const prefix = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, search), question, fanout: prefixFanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-prefix-plan"
    });

    const fallback = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")), question, fanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z", leaseOwner: "worker-prefix-outage"
    });
    expect(fallback).toMatchObject({ snapshotId: prefix.snapshotId, collectedForThisRun: false, refreshAttempted: true, refreshFailed: true });
    expect(fallback.observations).toHaveLength(3);

    // A provider-healthy fresh refresh succeeds and never uses the prefix path.
    const refreshed = await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, search), question, fanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z", leaseOwner: "worker-prefix-refresh"
    });
    expect(refreshed).toMatchObject({ collectedForThisRun: true, refreshAttempted: true, refreshFailed: false });
    expect(refreshed.snapshotId).not.toBe(prefix.snapshotId);
  });

  it("never falls back to a prefix snapshot across questions", async () => {
    const authority = await installAuthority("review-prefix-cross");
    const fanout = createSearchQueryFanout({ question, surface, excludedIdentities: [] });
    const prefixFanout = { ...fanout, queries: fanout.queries.slice(0, 3) };
    await resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("complete")), question, fanout: prefixFanout,
      evidenceCutoffAt: "2030-01-04T00:00:00.000Z", leaseOwner: "worker-prefix-cross-plan"
    });
    const otherQuestion = { ...question, id: "question-public-snapshot-other", exactText: "深圳到日本货运服务商有哪些？", normalizedText: "深圳到日本货运服务商有哪些？" };
    const otherFanout = createSearchQueryFanout({ question: otherQuestion, surface, excludedIdentities: [] });

    await expect(resolvePublicSourceSnapshot({
      authority, adapter: fixtureAdapter(authority, async () => observationPayload("unavailable")), question: otherQuestion, fanout: otherFanout,
      evidenceCutoffAt: "2030-01-05T00:00:00.000Z", leaseOwner: "worker-prefix-cross-question"
    })).rejects.toBeInstanceOf(PublicSourceSnapshotUnavailableError);
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

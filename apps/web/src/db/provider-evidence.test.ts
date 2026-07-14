import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { PROVIDER_PASSAGE_SELECTOR_VERSION, selectProviderPassages } from "@open-geo-console/citation-intelligence";
import { createMarketSnapshotIdentity } from "@open-geo-console/public-search-observer";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "./public-search-authority";
import {
  acquireMarketSnapshotLease,
  appendMarketSearchObservations,
  appendMarketSnapshotQueries,
  appendMarketSourceEvidence,
  beginMarketSearchAttempt,
  completeMarketSearchAttempt,
  completeMarketSnapshotLease,
  createMarketSnapshotRefresh
} from "./market-snapshots";
import {
  appendMarketProviderClaims,
  appendCompletedMarketProviderClaims,
  appendMarketSourcePassages,
  getMarketProviderEvidenceBundle,
  providerClaimPersistenceHash,
  type ProviderClaimPersistenceInput
} from "./provider-evidence";

describe("provider evidence memory repository", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.OPEN_GEO_DB_PATH = `memory-provider-evidence-${randomUUID()}`;
  });

  it("appends exact passages and claims idempotently and returns a snapshot bundle", async () => {
    const fixture = await sourceFixture();
    const passage = selectProviderPassages({
      sourceEvidenceId: fixture.sourceId,
      normalizedText: "Alpha Logistics provides self-operated freight with its owned fleet and warehouse on the Shanghai Chengdu route.",
      candidateNames: ["Alpha Logistics"], serviceTerms: ["freight"], controlTerms: ["self-operated", "owned"],
      capabilityTerms: ["fleet", "warehouse"], selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION
    })[0]!;
    const passages = await appendMarketSourcePassages({ token: fixture.token, passages: [passage] });
    await expect(appendMarketSourcePassages({ token: fixture.token, passages: [passage] })).resolves.toMatchObject(passages);

    const base = {
      passageId: passage.passageId, providerEntityId: "provider:alpha", canonicalName: "Alpha Logistics",
      genericRole: "service_provider", policyRole: "domestic_linehaul", capability: "transport_control", operatingMode: "owned",
      serviceScope: ["freight"], routeScope: ["Shanghai-Chengdu"], exactExcerpt: passage.exactExcerpt,
      validationStatus: "accepted" as const, rejectionReason: null
    };
    const claim: ProviderClaimPersistenceInput = {
      ...base, id: "provider-claim:alpha-transport", claimHash: providerClaimPersistenceHash(base),
      extractionModel: "fixture-model", extractionContract: "provider-claim-extraction-v1"
    };
    const claims = await appendMarketProviderClaims({ token: fixture.token, claims: [claim] });
    await expect(appendMarketProviderClaims({ token: fixture.token, claims: [claim] })).resolves.toMatchObject(claims);
    await expect(getMarketProviderEvidenceBundle([fixture.snapshotId])).resolves.toMatchObject({ snapshotIds: [fixture.snapshotId], passages: [{ id: passage.passageId }], claims: [{ id: claim.id }] });
  });

  it("rejects a fourth passage, a conflicting id and an unbound claim excerpt", async () => {
    const fixture = await sourceFixture();
    const passages = Array.from({ length: 4 }, (_, index) => {
      const exactExcerpt = `Alpha Logistics self-operated freight owned fleet warehouse route evidence ${index}`;
      return { passageId: `provider-passage:${index}`, sourceEvidenceId: fixture.sourceId, passageOrder: index, exactExcerpt, excerptHash: sha(exactExcerpt), relevanceScore: 100, matchedEntityTerms: ["Alpha Logistics"], matchedServiceTerms: ["freight"], matchedControlTerms: ["self-operated"], matchedCapabilityTerms: ["fleet"], selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION };
    });
    await expect(appendMarketSourcePassages({ token: fixture.token, passages })).rejects.toThrow(/three/i);
    await appendMarketSourcePassages({ token: fixture.token, passages: passages.slice(0, 1) });
    await expect(appendMarketSourcePassages({ token: fixture.token, passages: [{ ...passages[0]!, exactExcerpt: "changed", excerptHash: sha("changed") }] })).rejects.toThrow(/immutable/i);
    const base = { passageId: passages[0]!.passageId, providerEntityId: "provider:alpha", canonicalName: "Alpha Logistics", genericRole: "service_provider", policyRole: "domestic_linehaul", capability: "transport_control", operatingMode: "owned", serviceScope: ["freight"], routeScope: [], exactExcerpt: "not present", validationStatus: "accepted" as const, rejectionReason: null };
    await expect(appendMarketProviderClaims({ token: fixture.token, claims: [{ ...base, id: "bad", claimHash: providerClaimPersistenceHash(base), extractionModel: "fixture", extractionContract: "v1" }] })).rejects.toThrow(/not bound/i);
  });

  it("appends immutable extracted claims after the exact snapshot completes", async () => {
    const fixture = await sourceFixture();
    const passage = selectProviderPassages({
      sourceEvidenceId: fixture.sourceId,
      normalizedText: "Alpha Logistics provides self-operated freight with its owned fleet and warehouse on the Shanghai Chengdu route.",
      candidateNames: ["Alpha Logistics"], serviceTerms: ["freight"], controlTerms: ["self-operated", "owned"],
      capabilityTerms: ["fleet", "warehouse"], selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION
    })[0]!;
    await appendMarketSourcePassages({ token: fixture.token, passages: [passage] });
    await completeMarketSnapshotLease({ snapshotId: fixture.snapshotId, token: fixture.token, queryFanoutHash: sha("fanout"), completedAt: new Date() });
    const base = { passageId: passage.passageId, providerEntityId: "provider:alpha", canonicalName: "Alpha Logistics", genericRole: "service_provider", policyRole: "carrier", capability: "linehaul_fleet", operatingMode: "self_operated", serviceScope: ["freight"], routeScope: ["Shanghai-Chengdu"], exactExcerpt: passage.exactExcerpt, validationStatus: "accepted" as const, rejectionReason: null };
    const claim = { ...base, id: "provider-claim:completed", claimHash: providerClaimPersistenceHash(base), extractionModel: "fixture", extractionContract: "provider-claim-extraction-v1" };
    await expect(appendCompletedMarketProviderClaims({ snapshotId: fixture.snapshotId, claims: [claim] })).resolves.toMatchObject([{ id: claim.id }]);
    await expect(appendCompletedMarketProviderClaims({ snapshotId: fixture.snapshotId, claims: [claim] })).resolves.toMatchObject([{ id: claim.id }]);
  });
});

async function sourceFixture() {
  const surface = { surfaceId: "provider-fixture", providerId: "fixture", productId: "search", surfaceKind: "documented_api" as const, contractVersion: "1", surfaceVersion: "v1", adapterVersion: "v1", locale: "en", region: "US" };
  const installed = await installPublicSearchSurfaceAuthority({ environment: "staging", adapterId: "fixture", providerId: surface.providerId, productId: surface.productId, modelId: "fixture", adapterVersion: surface.adapterVersion, surfaceId: surface.surfaceId, surfaceVersion: surface.surfaceVersion, localeCapabilities: [surface.locale], regionCapabilities: [surface.region], termsReviewedAt: "2030-01-01T00:00:00.000Z", evidenceReferences: ["review"], capturedAt: "2030-01-02T00:00:00.000Z", active: false });
  const authority = await activatePublicSearchSurfaceAuthority({ authorityVersion: installed.authorityVersion, environment: "staging", adapterId: installed.adapterId, providerId: installed.providerId, productId: installed.productId, modelId: installed.modelId, adapterVersion: installed.adapterVersion, surfaceId: installed.surfaceId, surfaceVersion: installed.surfaceVersion });
  const question = { id: "provider-q1", questionSetVersion: "v1", locale: "en", region: "US", kind: "supplier_discovery" as const, exactText: "Which providers offer self-operated logistics?", normalizedText: "Which providers offer self-operated logistics?", derivation: { ruleId: "locked", evidenceSourceIds: [], subject: "self-operated logistics", broadened: false } };
  const identity = createMarketSnapshotIdentity({ question, surface, fanoutVersion: "provider-query-plan-v1" });
  const lease = await acquireMarketSnapshotLease({ cacheIdentity: identity.id, leaseOwner: "provider-worker", leaseDurationMs: 10_000 });
  if (!lease.acquired) throw new Error("Expected provider fixture lease.");
  const snapshot = await createMarketSnapshotRefresh({ identity, authorityVersion: authority.authorityVersion, token: lease.token, questionHash: sha(question.normalizedText), snapshotKind: "provider_discovery", queryPlanVersion: "provider-query-plan-v1" });
  const query = { id: "provider-query", queryOrder: 0, queryText: question.normalizedText, queryHash: sha(question.normalizedText), derivationRule: "canonical" };
  await appendMarketSnapshotQueries({ snapshotId: snapshot.id, token: lease.token, queries: [query] });
  const attempt = await beginMarketSearchAttempt({ snapshotId: snapshot.id, queryId: query.id, token: lease.token, idempotencyReference: "provider-attempt", configuredCostMicros: 1 });
  await completeMarketSearchAttempt({ attemptId: attempt.id, token: lease.token, requestStatus: "succeeded", usage: { requestCount: 1, resultCount: 1 }, providerCostMicros: 1, costUncertain: false });
  const url = "https://alpha.example/logistics";
  await appendMarketSearchObservations({ token: lease.token, observations: [{ id: "provider-observation", snapshotId: snapshot.id, queryId: query.id, attemptId: attempt.id, surfaceResultOrder: 1, resultUrl: url, canonicalUrl: url, title: "Alpha Logistics", resultStatus: "returned", contentHash: sha("page"), observedAt: new Date() }] });
  const excerpt = "Alpha Logistics provides self-operated freight with its owned fleet and warehouse on the Shanghai Chengdu route.";
  const sourceId = "provider-source";
  await appendMarketSourceEvidence({ token: lease.token, sources: [{ id: sourceId, snapshotId: snapshot.id, observationId: "provider-observation", canonicalUrl: url, registrableDomain: "alpha.example", retrievalState: "available", excerpt, excerptHash: sha(excerpt), contentHash: sha("page"), sourceCategory: "company_owned", evidenceFamilyIdentity: "alpha-family", retrievedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }] });
  return { token: lease.token, snapshotId: snapshot.id, sourceId };
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }

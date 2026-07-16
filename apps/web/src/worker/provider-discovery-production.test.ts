import { describe, expect, it, vi } from "vitest";
import type { ConfirmedBusinessQuestionSet, PublicSearchSurfaceAuthority } from "@open-geo-console/public-search-observer";
import {
  bindQuestionScopedDirectEvidence,
  createProductionProviderDiscoveryContext,
  isLikelyCompanyOwnedProviderDomain,
  resolveProviderCandidates,
  sanitizePreVerificationCheckpoint
} from "./provider-discovery-production";
import { runProviderDiscoveryPipeline } from "./provider-discovery-pipeline";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), providerBundle: vi.fn(), snapshotBundle: vi.fn(), appendClaims: vi.fn() }));
vi.mock("./public-source-snapshot-resolver", () => ({ resolvePublicSourceSnapshot: mocks.resolve }));
vi.mock("@/db/provider-evidence", () => ({
  getMarketProviderEvidenceBundle: mocks.providerBundle,
  appendCompletedMarketProviderClaims: mocks.appendClaims,
  providerClaimPersistenceHash: () => "d".repeat(64)
}));
vi.mock("@/db/market-snapshots", () => ({ getMarketSnapshotBundle: mocks.snapshotBundle }));

describe("production provider discovery composition", () => {
  it("binds only body excerpts that match the question to a traceable domain subject", () => {
    const fact = {
      observationId: "observation-1", queryId: "query-1", resultUrl: "https://www.ycs-express.com/service", finalUrl: "https://www.ycs-express.com/service",
      retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true, accessBarrier: "none" as const,
      contentBytes: 3_000_000, normalizedText: "YCS音速国际物流公开提供台湾海运、空运和清关服务。",
      normalizedContentHash: `sha256:${"a".repeat(64)}`
    };
    const question = { normalizedText: "哪些服务商公开提供台湾海运、空运或海快专线？", derivation: { subject: "台湾海运 空运 海快专线" } };
    const bound = bindQuestionScopedDirectEvidence({ fact, question, sourceTitle: "YCS音速国际物流" });

    expect(bound.verifiedExcerpt).toContain("台湾海运、空运和清关服务");
    expect(bound.entityMentions).toEqual([expect.objectContaining({ registrableDomain: "ycs-express.com" })]);
    expect(bound.claims).toEqual([expect.objectContaining({ directFactSupport: true, preciseEntityMapping: true, value: bound.verifiedExcerpt })]);

    const unrelated = bindQuestionScopedDirectEvidence({
      fact: { ...fact, normalizedText: "餐厅协会活动页面与播客目录。" }, question, sourceTitle: "Search results"
    });
    expect(unrelated.verifiedExcerpt).toBeUndefined();
    expect(unrelated.claims).toBeUndefined();
  });

  it("only treats a candidate domain as company-owned when the identity matches", () => {
    expect(isLikelyCompanyOwnedProviderDomain("Alpha Logistics", "alpha.example")).toBe(true);
    expect(isLikelyCompanyOwnedProviderDomain("Top logistics providers", "industry-directory.example")).toBe(false);
  });

  it("drops customer and identity-colliding search titles before provider verification", () => {
    const domains = new Map<string, string>();
    const observations = [{ results: [
      { surfaceResultOrder: 1, url: "https://shun-express.com/", title: "行业服务", snippet: "", displayedHost: "shun-express.com" },
      { surfaceResultOrder: 2, url: "https://directory.example/logistics", title: "物流", snippet: "", displayedHost: "directory.example" },
      { surfaceResultOrder: 3, url: "https://alpha.example/logistics", title: "Alpha Logistics", snippet: "", displayedHost: "alpha.example" }
    ] }] as never;

    const candidates = resolveProviderCandidates(observations, domains, [
      { kind: "private_identity", value: "凌顺国际物流" },
      { kind: "private_identity", value: "shun-express.com" }
    ]);

    expect(candidates.map(({ canonicalName }) => canonicalName)).toEqual(["Alpha Logistics"]);
    expect([...domains.values()]).toEqual(["alpha.example"]);
  });

  it("does not promote search questions, article headings, or generic provider roles into company identities", () => {
    const domains = new Map<string, string>();
    const observations = [{ results: [
      { surfaceResultOrder: 1, url: "https://question.example/overseas-warehouse", title: "有哪些比较好的美国海外仓服务商？", snippet: "", displayedHost: "question.example" },
      { surfaceResultOrder: 2, url: "https://generic.example/services", title: "您的海外仓服务供应商", snippet: "", displayedHost: "generic.example" },
      { surfaceResultOrder: 3, url: "https://news.example/notice", title: "关于开展跨境物流企业申报工作的通知", snippet: "", displayedHost: "news.example" },
      { surfaceResultOrder: 4, url: "https://winner.example/services", title: "永利八达通｜海外仓服务", snippet: "", displayedHost: "winner.example" }
    ] }] as never;

    const candidates = resolveProviderCandidates(observations, domains, []);

    expect(candidates.map(({ canonicalName }) => canonicalName)).toEqual(["永利八达通"]);
    expect([...domains.values()]).toEqual(["winner.example"]);
  });

  it("sanitizes a persisted pre-verification candidate set and invalidates only its old hash", () => {
    const checkpoint = {
      phase: "candidate_verification",
      candidateSetHash: "old-candidate-hash",
      artifacts: {
        discovery: {
          snapshotId: "snapshot-discovery",
          plannedQueries: 6,
          completedQueries: 3,
          returnedObservations: 14,
          candidates: [
            { entityId: "generic", canonicalName: "物流", rank: 7 },
            { entityId: "alpha", canonicalName: "Alpha Logistics", rank: 1 }
          ]
        }
      }
    } as never;

    const sanitized = sanitizePreVerificationCheckpoint(checkpoint, [
      { kind: "private_identity", value: "凌顺国际物流" }
    ]);

    expect(sanitized?.artifacts.discovery?.candidates).toEqual([
      { entityId: "alpha", canonicalName: "Alpha Logistics", rank: 1 }
    ]);
    expect(sanitized?.candidateSetHash).toBeNull();
    expect(sanitized?.phase).toBe("candidate_resolution");
  });

  it("reuses discovery, verification and two standard question snapshots", async () => {
    let checkpoint = null;
    mocks.resolve.mockImplementation(async (input: { question: { kind: string }; snapshotMetadata?: { snapshotKind: string }; fanout: { queries: unknown[] } }) => {
      const kind = input.snapshotMetadata?.snapshotKind ?? input.question.kind;
      const snapshotId = kind === "provider_discovery" ? "snapshot-discovery" : kind === "candidate_verification" ? "snapshot-verification" : kind === "capability_fit" ? "snapshot-q2" : "snapshot-q3";
      return { snapshotId, cacheIdentity: `${snapshotId}-cache`, questionId: "question", observedAt: "2030-01-01T00:00:00.000Z", ageMs: 0,
        collectedForThisRun: true, refreshAttempted: true, refreshFailed: false, sufficientlyEvidenced: true, availableSourceCount: 1,
        observations: [{ observationId: `${snapshotId}-observation`, queryId: "query", exactQuery: "query", requestedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:00.000Z", status: "complete", usage: { requestCount: 1, resultCount: 1 }, results: [{ surfaceResultOrder: 1, url: "https://alpha.example/logistics", title: "Alpha Logistics", snippet: "Self operated freight", displayedHost: "alpha.example" }] }],
        retrievals: [], actualCostMicros: 1, allocatedCostMicros: 1, avoidedCostMicros: 0 };
    });
    const passage = { id: "passage-alpha", sourceEvidenceId: "source-alpha", passageOrder: 0, exactExcerpt: "Alpha Logistics provides self operated freight with an owned fleet.", excerptHash: "a".repeat(64), relevanceScore: 100,
      matchedEntityTerms: ["Alpha Logistics"], matchedServiceTerms: ["freight"], matchedControlTerms: ["self operated", "owned"], matchedCapabilityTerms: ["fleet"], selectorVersion: "provider-passage-selector-v1", createdAt: new Date() };
    mocks.providerBundle.mockResolvedValue({ snapshotIds: ["snapshot-verification"], passages: [passage], claims: [] });
    mocks.snapshotBundle.mockResolvedValue({ snapshot: { id: "snapshot-verification", status: "completed", cacheIdentity: "verification-cache" }, attempts: [], queries: [],
      observations: [{ id: "observation-alpha", title: "Alpha Logistics" }], sources: [{ id: "source-alpha", observationId: "observation-alpha", canonicalUrl: "https://alpha.example/logistics", registrableDomain: "alpha.example", sourceCategory: "company_owned", retrievalState: "available", retrievedAt: new Date("2030-01-01T00:00:00.000Z") }] });
    mocks.appendClaims.mockResolvedValue([]);
    const runtime = { adapter: { id: "fixture", surface, authority, search: vi.fn() }, authority, identity: { adapterId: "fixture", providerId: "fixture", productId: "search", modelId: "fixture", adapterVersion: "v1", surface } };
    const context = createProductionProviderDiscoveryContext({ runtime, questionSet: questions(), artifactContract: "combined_geo_report_v3", websiteCategories: ["logistics"], websiteFoundationHash: "f".repeat(64), workerId: "worker", evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
      extractionModel: "fixture-model", extractionClient: { configuredModel: "fixture-model", completeJson: vi.fn(async () => ({ modelId: "fixture-model", value: { claims: [{ subjectName: "Alpha Logistics", genericRole: "service_provider", policyRole: "carrier", capability: "linehaul_fleet", operatingMode: "self_operated", serviceScope: ["freight"], routeScope: [], exactExcerpt: passage.exactExcerpt }] } })) },
      getCheckpoint: async () => checkpoint, saveCheckpoint: async (value) => { checkpoint = structuredClone(value) as never; } });
    const result = await runProviderDiscoveryPipeline({ identity: context.identity, dependencies: context.dependencies, hardDeadlineAt: "2030-01-01T01:00:00.000Z" });
    expect(context.identity.artifactContract).toBe("combined_geo_report_v3");
    expect(context.snapshotIds()).toEqual({ discovery: "snapshot-discovery", verification: "snapshot-verification", standard: ["snapshot-q2", "snapshot-q3"] });
    expect(result.providerDiscovery.strict).toEqual([]);
    expect(result.providerDiscovery.candidates).toEqual([expect.objectContaining({ canonicalName: "Alpha Logistics" })]);
    expect(result.providerDiscovery.execution.plannedQueries).toBeLessThanOrEqual(30);
    expect(mocks.appendClaims).toHaveBeenCalledOnce();
    expect(mocks.resolve.mock.calls.map(([request]) => request.maxSourceRetrievals).reduce((total, value) => total + (value ?? 0), 0)).toBe(60);

    let claimResumeCheckpoint = structuredClone(checkpoint) as NonNullable<typeof checkpoint> & {
      claimSetHash: string | null;
      phase: string;
      artifacts: Record<string, unknown>;
    };
    delete claimResumeCheckpoint.artifacts.claims;
    delete claimResumeCheckpoint.artifacts.qualification;
    delete claimResumeCheckpoint.artifacts.providerDiscovery;
    claimResumeCheckpoint.claimSetHash = null;
    claimResumeCheckpoint.phase = "provider_claim_extraction";
    mocks.snapshotBundle.mockClear();
    mocks.appendClaims.mockClear();
    const claimResumeClient = { configuredModel: "fixture-model", completeJson: vi.fn(async () => ({ modelId: "fixture-model", value: { claims: [{ subjectName: "Alpha Logistics", genericRole: "service_provider", policyRole: "carrier", capability: "linehaul_fleet", operatingMode: "self_operated", serviceScope: ["freight"], routeScope: [], exactExcerpt: passage.exactExcerpt }] } })) };
    const claimResumeContext = createProductionProviderDiscoveryContext({
      runtime,
      questionSet: questions(),
      artifactContract: "combined_geo_report_v3",
      websiteCategories: ["logistics"],
      websiteFoundationHash: "f".repeat(64),
      workerId: "worker",
      evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
      extractionModel: "fixture-model",
      extractionClient: claimResumeClient,
      getCheckpoint: async () => claimResumeCheckpoint as never,
      saveCheckpoint: async (value) => { claimResumeCheckpoint = structuredClone(value) as typeof claimResumeCheckpoint; }
    });

    const claimResumeResult = await runProviderDiscoveryPipeline({
      identity: claimResumeContext.identity,
      dependencies: claimResumeContext.dependencies,
      hardDeadlineAt: "2030-01-01T01:00:00.000Z"
    });
    expect(claimResumeClient.completeJson).toHaveBeenCalled();
    expect(claimResumeResult.checkpoint.artifacts.claims).toHaveLength(1);
    expect(claimResumeResult.providerDiscovery.execution.plannedQueries).toBeGreaterThan(0);
    expect(mocks.snapshotBundle).toHaveBeenCalledWith("snapshot-verification");
    expect(mocks.snapshotBundle).not.toHaveBeenCalledWith("");

    let rejectedClaimCheckpoint = structuredClone(checkpoint) as NonNullable<typeof checkpoint> & {
      claimSetHash: string | null;
      phase: string;
      artifacts: Record<string, unknown>;
    };
    delete rejectedClaimCheckpoint.artifacts.claims;
    delete rejectedClaimCheckpoint.artifacts.qualification;
    delete rejectedClaimCheckpoint.artifacts.providerDiscovery;
    rejectedClaimCheckpoint.claimSetHash = null;
    rejectedClaimCheckpoint.phase = "provider_claim_extraction";
    mocks.appendClaims.mockClear();
    const rejectedClaimClient = { configuredModel: "fixture-model", completeJson: vi.fn(async () => ({ modelId: "fixture-model", value: { claims: [{ subjectName: "Alpha Logistics", genericRole: "service_provider", policyRole: "carrier", capability: "linehaul_fleet", operatingMode: "self_operated", serviceScope: ["freight"], routeScope: [], exactExcerpt: "Unsupported model paraphrase." }] } })) };
    const rejectedClaimContext = createProductionProviderDiscoveryContext({
      runtime,
      questionSet: questions(),
      artifactContract: "combined_geo_report_v3",
      websiteCategories: ["logistics"],
      websiteFoundationHash: "f".repeat(64),
      workerId: "worker",
      evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
      extractionModel: "fixture-model",
      extractionClient: rejectedClaimClient,
      getCheckpoint: async () => rejectedClaimCheckpoint as never,
      saveCheckpoint: async (value) => { rejectedClaimCheckpoint = structuredClone(value) as typeof rejectedClaimCheckpoint; }
    });

    const rejectedClaimResult = await runProviderDiscoveryPipeline({
      identity: rejectedClaimContext.identity,
      dependencies: rejectedClaimContext.dependencies,
      hardDeadlineAt: "2030-01-01T01:00:00.000Z"
    });
    expect(rejectedClaimClient.completeJson).toHaveBeenCalledTimes(3);
    expect(rejectedClaimResult.checkpoint.artifacts.claims).toEqual([]);
    expect(rejectedClaimResult.providerDiscovery.strict).toEqual([]);
    expect(rejectedClaimResult.providerDiscovery.candidates).toEqual([expect.objectContaining({ canonicalName: "Alpha Logistics" })]);
    expect(mocks.appendClaims).not.toHaveBeenCalled();

    const resumedCheckpoint = structuredClone(checkpoint) as NonNullable<typeof checkpoint> & {
      artifacts: Record<string, unknown>;
    };
    delete resumedCheckpoint.artifacts.providerDiscovery;
    resumedCheckpoint.phase = "grounded_answer_synthesis";
    mocks.snapshotBundle.mockClear();
    const resumedContext = createProductionProviderDiscoveryContext({
      runtime,
      questionSet: questions(),
      artifactContract: "combined_geo_report_v3",
      websiteCategories: ["logistics"],
      websiteFoundationHash: "f".repeat(64),
      workerId: "worker",
      evidenceCutoffAt: "2030-01-01T00:00:00.000Z",
      extractionModel: "fixture-model",
      extractionClient: { configuredModel: "fixture-model", completeJson: vi.fn() },
      getCheckpoint: async () => resumedCheckpoint,
      saveCheckpoint: async () => undefined
    });

    await runProviderDiscoveryPipeline({
      identity: resumedContext.identity,
      dependencies: resumedContext.dependencies,
      hardDeadlineAt: "2030-01-01T01:00:00.000Z"
    });
    expect(mocks.snapshotBundle).toHaveBeenCalledWith("snapshot-verification");
    expect(mocks.snapshotBundle).not.toHaveBeenCalledWith("");
  });
});

const surface = { surfaceId: "fixture", providerId: "fixture", productId: "search", surfaceKind: "documented_api" as const, contractVersion: "1", surfaceVersion: "v1", adapterVersion: "v1", locale: "en", region: "US" };
const authority: PublicSearchSurfaceAuthority = { authorityId: "authority", environment: "test", surface, active: true, certifiedAt: "2030-01-01T00:00:00.000Z", evidenceReference: "review", supportedLocales: ["en"], supportedRegions: ["US"] };
function questions(): ConfirmedBusinessQuestionSet { const base = { generatedText: "", evidenceUrls: [], edited: false, neutralizationVersion: "business-question-neutralization-v1" as const }; return { version: "business-question-set-v1", id: "questions", revision: 1, locale: "en", region: "US", confidence: "high", requiresAcknowledgement: false, profileEvidenceIdentity: "profile", identityExclusions: [], acknowledgedLowConfidence: false, confirmedAt: "2030-01-01T00:00:00.000Z", contentHash: "questions-hash", questions: [
  { ...base, purpose: "core_service_discovery", service: "self operated logistics", audience: "buyers", marketRegion: "US", neutralPublicText: "Which providers offer self operated dedicated logistics services?", privateText: "Which providers offer self operated dedicated logistics services?", neutralContentHash: "q1" },
  { ...base, purpose: "customer_region_fit", service: "logistics", audience: "buyers", marketRegion: "US", neutralPublicText: "Which logistics services fit buyers in the target region?", privateText: "Which logistics services fit buyers in the target region?", neutralContentHash: "q2" },
  { ...base, purpose: "purchase_delivery_risk", service: "logistics", audience: "buyers", marketRegion: "US", neutralPublicText: "What logistics delivery conditions and risks should buyers compare?", privateText: "What logistics delivery conditions and risks should buyers compare?", neutralContentHash: "q3" }
] } as ConfirmedBusinessQuestionSet; }

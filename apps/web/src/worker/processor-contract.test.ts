import { describe, expect, it, vi } from "vitest";
import type { RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { PublicSearchSurfaceAdapter, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";
import type { AiReportRow, ScanJobRow } from "@/db/schema";
import {
  createWorkerPublicSourceForensicsDependencies,
  isMatchingRecommendationWebsiteFoundation,
  resolvePublicSourceRunScope,
  resolveRecommendationFulfillmentTarget,
  resolveRecommendationFoundationTarget
} from "./processor";

describe("recommendation website-foundation resume contract", () => {
  it("dispatches only from the persisted methodology and rejects a missing value", () => {
    expect(resolveRecommendationFulfillmentTarget({
      productContract: "recommendation_forensics_v1",
      fulfillmentMethodology: "answer_engine_recommendation_forensics_v1", recommendationReportVersion: 1
    })).toBe("recommendation_v1");
    expect(resolveRecommendationFulfillmentTarget({
      productContract: "recommendation_forensics_v1",
      fulfillmentMethodology: "public_search_source_forensics_v1", recommendationReportVersion: 2
    })).toBe("recommendation_v2");
    expect(() => resolveRecommendationFulfillmentTarget({
      productContract: "recommendation_forensics_v1",
      fulfillmentMethodology: null, recommendationReportVersion: null
    })).toThrow(/methodology/i);
  });
  it("reuses only the same new-product job/report/locale deep appendix", () => {
    const job = { id: "job-1", reportId: "report-1", locale: "en", productContract: "recommendation_forensics_v1" } as ScanJobRow;
    const foundation = { jobId: "job-1", reportId: "report-1", locale: "en", tier: "deep", payload: { tier: "deep", targetUrl: "https://example.com/" } } as AiReportRow;
    expect(isMatchingRecommendationWebsiteFoundation(job, "https://example.com/", foundation)).toBe(true);
    expect(isMatchingRecommendationWebsiteFoundation(job, "https://example.com/", { ...foundation, jobId: "legacy-job" })).toBe(false);
    expect(isMatchingRecommendationWebsiteFoundation({ ...job, productContract: "legacy_website_audit_v1" }, "https://example.com/", foundation)).toBe(false);
  });

  it("uses the discovered canonical root instead of the originally submitted path on restart", () => {
    const job = { id: "job-1", reportId: "report-1", locale: "en", productContract: "recommendation_forensics_v1" } as ScanJobRow;
    const foundation = { jobId: "job-1", reportId: "report-1", locale: "en", tier: "deep", payload: { tier: "deep", targetUrl: "https://x.example/" } } as AiReportRow;
    const target = resolveRecommendationFoundationTarget({
      discoverySnapshot: { targetUrl: "https://x.example/", candidates: [], robotsPolicy: { rules: [], sitemaps: [], userAgent: "OpenGeoConsoleBot" }, estimatedPages: 1 }
    }, foundation, "https://x.example/a");
    expect(target).toBe("https://x.example/");
    expect(isMatchingRecommendationWebsiteFoundation(job, target, foundation)).toBe(true);
  });
});

describe("worker V2 public-source collaborators", () => {
  it("uses the exact certified surface locale instead of compact report chrome locale", () => {
    expect(resolvePublicSourceRunScope(runtime())).toEqual({ locale: "zh-CN", region: "CN" });
  });

  it("binds snapshot resolution and persisted checkpoints to the leased job, while deferring report persistence to terminalization", async () => {
    const job = { id: "job-v2", reportId: "report-v2", locale: "zh-CN", productContract: "recommendation_forensics_v1" } as unknown as ScanJobRow;
    let checkpoint: ScanJobRow["checkpoint"] = {};
    const checkpointJob = vi.fn(async (input: { checkpoint?: ScanJobRow["checkpoint"] }) => {
      checkpoint = input.checkpoint ?? {};
      return { ...job, checkpoint, checkpointRevision: 1, currentPhase: "source_retrieval", phaseAttempt: 0, resumeGeneration: 0 };
    });
    const resolveSnapshot = vi.fn(async (input: { question: { id: string; normalizedText: string }; fanout: SearchQueryFanout; leaseOwner: string }) => {
      expect(input.question).toMatchObject({ id: "question-1", normalizedText: "independent logistics suppliers" });
      expect(input.leaseOwner).toBe("public-source:job-v2:worker-v2");
      return snapshot(input.fanout);
    });
    const liveDrill = { inject: vi.fn() };
    const dependencies = createWorkerPublicSourceForensicsDependencies({
      job,
      workerId: "worker-v2",
      coverage: { plannedPages: 3, successfulPages: 3, failedPages: 0 },
      readCheckpoint: () => checkpoint as never,
      onCheckpointSaved: async () => undefined,
      checkpointJob,
      liveDrill,
      artifactReadiness: { async verify() {} },
      retrieveSource: async () => ({ fact: retrieval(), source: sourceEvidence() }),
      collaborators: {
        resolveSnapshot,
        getReport: async () => null,
        saveReport: async (report) => report as RecommendationForensicReportV2
      }
    }, runtime());

    const fanout = fixtureFanout();
    await dependencies.resolveSnapshot({ questionId: fanout.questionId, fanout, evidenceCutoffAt: "2030-01-02T00:00:00.000Z" });
    await dependencies.saveCheckpoint(job.id, checkpointValue());

    expect(resolveSnapshot).toHaveBeenCalledOnce();
    expect(checkpointJob).toHaveBeenCalledWith(expect.objectContaining({
      stage: "synthesizing", phase: "source_retrieval", progress: 95,
      checkpoint: expect.objectContaining({ publicSourceForensics: checkpointValue() })
    }));
    expect(dependencies.deferReportPersistence).toBe(true);
    await dependencies.prepareArtifactVerification?.({
      jobId: job.id, report: {} as RecommendationForensicReportV2,
      checkpoint: checkpointValue(), commercialSnapshotRefs: []
    });
    expect(liveDrill.inject).toHaveBeenCalledWith({ jobId: job.id, fault: "artifact" });
    await expect(dependencies.getCheckpoint("other-job")).rejects.toThrow(/job/i);
    await expect(dependencies.saveCheckpoint("other-job", checkpointValue())).rejects.toThrow(/job/i);
  });

  it("fails closed when the safe retrieval or artifact collaborator is absent", () => {
    const input = {
      job: { id: "job-v2", reportId: "report-v2", locale: "zh-CN", productContract: "recommendation_forensics_v1" } as unknown as ScanJobRow,
      workerId: "worker-v2",
      coverage: { plannedPages: 3, successfulPages: 3, failedPages: 0 },
      readCheckpoint: () => ({}) as never,
      onCheckpointSaved: async () => undefined,
      checkpointJob: vi.fn(),
      collaborators: { resolveSnapshot: vi.fn(), getReport: async () => null, saveReport: async (report: unknown) => report as RecommendationForensicReportV2 }
    };
    expect(() => createWorkerPublicSourceForensicsDependencies(input, runtime())).toThrow(/collaborator/i);
  });
});

function runtime(): { adapter: PublicSearchSurfaceAdapter; authority: PublicSearchSurfaceAuthority } {
  const surface = { surfaceId: "mimo-native-web-search", providerId: "xiaomi-mimo", productId: "native-web-search", surfaceKind: "documented_api" as const,
    contractVersion: "public-search-surface-v1", surfaceVersion: "mimo-native-web-search-v1", adapterVersion: "mimo-web-search-adapter-v1", locale: "zh-CN", region: "CN" };
  const authority: PublicSearchSurfaceAuthority = { authorityId: "authority-v2", environment: "protected_staging", surface, active: true,
    certifiedAt: "2030-01-01T00:00:00.000Z", evidenceReference: "fixture://review", supportedLocales: ["zh-CN"], supportedRegions: ["CN"] };
  return { authority, adapter: { id: "mimo", surface, authority, search: async () => { throw new Error("not called"); }, classifyError: () => "unavailable" } };
}

function fixtureFanout(): SearchQueryFanout {
  const { authority } = runtime();
  return { questionId: "question-1", questionSetVersion: "buyer-questions-v1", fanoutVersion: "public-search-fanout-v1", surface: authority.surface,
    queries: [{ id: "query-1", questionId: "question-1", fanoutVersion: "public-search-fanout-v1", locale: "zh-CN", region: "CN", exactQuery: "independent logistics suppliers", derivationRuleId: "query-canonical-v1", resultDepth: 3 }],
    budget: { maxRequests: 1, maxResults: 3, timeoutMs: 30_000, maxCostMicros: 100 } };
}

function checkpointValue() {
  return { identityHash: "checkpoint-hash", methodology: "public_search_source_forensics_v1" as const, questionSetVersion: "buyer-questions-v1", fanoutVersion: "public-search-fanout-v1", authorityId: "authority-v2", snapshotIds: ["snapshot-1"], websiteFoundationHash: "foundation-hash", evidenceCutoffAt: "2030-01-02T00:00:00.000Z", locale: "zh-CN", region: "CN", adapterIdentityHash: "adapter-hash" };
}

function snapshot(fanout: SearchQueryFanout) {
  return { snapshotId: "snapshot-1", cacheIdentity: "cache-1", questionId: fanout.questionId, observedAt: "2030-01-02T00:00:00.000Z", ageMs: 0,
    collectedForThisRun: true, refreshAttempted: true, refreshFailed: false, sufficientlyEvidenced: true, observations: [], retrievals: [], actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0 };
}

function retrieval() {
  return { observationId: "observation-1", queryId: "query-1", resultUrl: "https://source.example/", retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true, accessBarrier: "none" as const, normalizedText: "source", normalizedContentHash: "sha256:fixture", verifiedExcerpt: "source" };
}

function sourceEvidence() {
  return { retrievalState: "available" as const, sourceCategory: "unknown" as const, entities: [], claims: [], contradictions: [], evidenceFamilyIdentity: "evidence-family" };
}

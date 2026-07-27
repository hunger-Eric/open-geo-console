import { describe, expect, it, vi } from "vitest";
import type { RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { PublicSearchSurfaceAdapter, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";
import type { AiReportRow, ScanJobRow } from "@/db/schema";
import {
  assertPaidV3ResumeSemanticAuthority,
  createWorkerPublicSourceForensicsDependencies,
  combinedV3ArtifactVerificationResume,
  combinedV3LanguageValidationScope,
  correctionArtifactVerificationResume,
  deferredPageAnalysisAuthority,
  executeReviewedPaidV3ArtifactBoundary,
  hashSynthesisInput,
  isMatchingRecommendationWebsiteFoundation,
  mergeCompletedAnalyses,
  publicSourceArtifactVerificationResume,
  publicSourceSynthesisResume,
  resolvePaidV3SemanticValidation,
  resolveRequiredDeferredPageAnalysisAuthority,
  resolveWebsiteAnalysisSemanticValidation,
  resolvePublicSourceRunScope,
  resolveRecommendationFulfillmentTarget,
  resolveRecommendationFoundationTarget,
  sourceEvidenceHash
} from "./processor";
import { resolveCombinedReportContract } from "@/report/combined-report-contract";
import {
  isCompatibleDeferredPageAnalysis,
  selectReusableCompletedPageAnalyses,
  type CompletedPageAnalysis
} from "./recovery";

describe("recommendation website-foundation resume contract", () => {
  it("does not revalidate an already accepted historical AI foundation during replacement delivery", () => {
    expect(combinedV3LanguageValidationScope("replacement_fulfillment")).toBe("presentation_refresh");
    expect(combinedV3LanguageValidationScope("staging_artifact_refresh")).toBe("presentation_refresh");
    expect(combinedV3LanguageValidationScope("standard")).toBeUndefined();
  });

  it("selects deferred Paid V3 semantics only from the immutable root marker on the ordinary lineage", () => {
    const paidV3 = {
      artifactContract: "combined_geo_report_v3",
      recommendationReportVersion: 3,
      reason: "standard"
    } as const;
    expect(resolvePaidV3SemanticValidation(paidV3, {})).toBe("legacy");
    expect(resolvePaidV3SemanticValidation(paidV3, {
      semanticReviewContractVersion: "report-semantic-review-v1"
    })).toBe("deferred");
    expect(() => resolvePaidV3SemanticValidation({
      ...paidV3,
      reason: "replacement_fulfillment"
    }, {
      semanticReviewContractVersion: "report-semantic-review-v1"
    })).toThrow(/ordinary immutable Paid lineage/i);
  });

  it("defers Free foundation only with root marker; marker-absent Free stays legacy; Paid marker unchanged", () => {
    const freeJob = {
      tier: "free",
      artifactContract: null,
      recommendationReportVersion: null,
      reason: "staging_regeneration"
    } as never;
    expect(resolveWebsiteAnalysisSemanticValidation(freeJob, {})).toBe("legacy");
    expect(resolveWebsiteAnalysisSemanticValidation(freeJob, {
      semanticReviewContractVersion: "report-semantic-review-v1"
    })).toBe("deferred");

    const paidV3 = {
      tier: "deep",
      artifactContract: "combined_geo_report_v3",
      recommendationReportVersion: 3,
      reason: "standard"
    } as never;
    expect(resolveWebsiteAnalysisSemanticValidation(paidV3, {})).toBe("legacy");
    expect(resolveWebsiteAnalysisSemanticValidation(paidV3, {
      semanticReviewContractVersion: "report-semantic-review-v1"
    })).toBe("deferred");
  });

  it("page-analysis authority: marker-present write/reuse contract; marker-absent omits identity", () => {
    const marker = "report-semantic-review-v1";
    const freeJob = {
      tier: "free",
      artifactContract: null,
      recommendationReportVersion: null,
      reason: "staging_regeneration"
    } as never;
    expect(resolveRequiredDeferredPageAnalysisAuthority("legacy", {})).toBeNull();
    expect(resolveRequiredDeferredPageAnalysisAuthority(
      resolveWebsiteAnalysisSemanticValidation(freeJob, { semanticReviewContractVersion: marker }),
      { semanticReviewContractVersion: marker }
    )).toEqual({ mode: "deferred", semanticContractVersion: marker });

    const url = "https://customer.example/";
    const page = {
      url,
      pageType: "home" as const,
      title: "Home",
      text: "body",
      headings: [] as string[],
      links: [] as string[],
      forms: [] as string[],
      images: [] as string[]
    };
    const evidence = { page, httpStatus: 200, contentHash: "hash-1" };
    const analysis = {
      url,
      pageType: "home" as const,
      summary: "summary",
      organizationSignals: [] as string[],
      strengths: [] as string[],
      findings: [] as never[]
    };

    const markerAbsentWrite = mergeCompletedAnalyses([], [analysis], new Map([[url, evidence]]));
    expect(markerAbsentWrite[0]!.analysisAuthority).toBeUndefined();

    const markerPresentWrite = mergeCompletedAnalyses(
      [],
      [analysis],
      new Map([[url, evidence]]),
      deferredPageAnalysisAuthority(marker)
    );
    expect(markerPresentWrite[0]!.analysisAuthority).toEqual({
      mode: "deferred",
      semanticContractVersion: marker
    });

    const required = { mode: "deferred" as const, semanticContractVersion: marker };
    const missing: CompletedPageAnalysis = { url, contentHash: "hash-1", analysis };
    const matching: CompletedPageAnalysis = {
      url,
      contentHash: "hash-1",
      analysis,
      analysisAuthority: { mode: "deferred", semanticContractVersion: marker }
    };
    expect(isCompatibleDeferredPageAnalysis(missing, required)).toBe(false);
    expect(isCompatibleDeferredPageAnalysis(matching, required)).toBe(true);
    expect(selectReusableCompletedPageAnalyses([missing, matching], {
      evidenceByUrl: new Map([[url, { contentHash: "hash-1" }]]),
      canonicalUrl: (value) => value,
      requiredDeferredAuthority: required
    })).toEqual([matching]);

    const coverage = { plannedPages: 1, analyzedPages: 1 };
    const unbound = hashSynthesisInput([evidence], [analysis], coverage);
    const bound = hashSynthesisInput([evidence], [analysis], coverage, {
      requiredDeferredAuthority: required,
      completedEntries: matching ? [matching] : []
    });
    expect(bound).not.toBe(unbound);
  });

  it("selects the combined artifact contract only from reviewed deployment configuration", () => {
    expect(resolveCombinedReportContract({ OGC_COMBINED_REPORT_CONTRACT: "combined_geo_report_v2" })).toBe("combined_geo_report_v2");
    expect(resolveCombinedReportContract({ OGC_COMBINED_REPORT_CONTRACT: "combined_geo_report_v3" })).toBe("combined_geo_report_v3");
    expect(resolveCombinedReportContract({})).toBe("combined_geo_report_v1");
    expect(() => resolveCombinedReportContract({ OGC_COMBINED_REPORT_CONTRACT: "request" })).toThrow(/reviewed/i);
  });
  it("resumes a correction artifact gate without resolving completed snapshots again", () => {
    const report = { reportId: "report-1", jobId: "job-1" } as RecommendationForensicReportV2;
    const publicSourceForensics = checkpointValue();
    const checkpoint = {
      recovery: { schemaVersion: 1, phase: "artifact_verification", revision: 2, phaseAttempt: 1,
        resumeGeneration: 1, identity: { jobId: "job-1", reportId: "report-1", productContract: "recommendation_forensics_v1",
          methodology: "public_search_source_forensics_v1", locale: "zh", authorityId: "authority-v2" }, inputHash: "input",
        completedArtifacts: ["public_source"], remainingWork: ["artifact_verification"], priorTransitionId: null },
      publicSourceForensics,
      pendingArtifactVerification: { report, commercialSnapshotRefs: [] }
    };
    expect(correctionArtifactVerificationResume(checkpoint as never)).toEqual({ report, checkpoint: publicSourceForensics, commercialSnapshotRefs: [] });
    expect(correctionArtifactVerificationResume({ ...checkpoint, recovery: { ...checkpoint.recovery, phase: "source_retrieval" } } as never)).toBeNull();
  });

  it("reuses the persisted public-source payload for paid combined terminalization", () => {
    const report = { reportId: "report-1", jobId: "job-1" } as RecommendationForensicReportV2;
    const publicSourceForensics = checkpointValue();
    const checkpoint = {
      recovery: { schemaVersion: 1, phase: "terminalization", revision: 3, phaseAttempt: 0,
        resumeGeneration: 1, identity: { jobId: "job-1", reportId: "report-1", productContract: "recommendation_forensics_v1",
          methodology: "public_search_source_forensics_v1", locale: "zh", authorityId: "authority-v2" }, inputHash: "input",
        completedArtifacts: ["public_source"], remainingWork: ["terminalization"], priorTransitionId: null },
      publicSourceForensics,
      pendingArtifactVerification: { report, commercialSnapshotRefs: [{ snapshotId: "snapshot-1", cacheIdentity: "cache-1",
        freshnessState: "fresh", actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0 }] }
    };
    expect(publicSourceArtifactVerificationResume(checkpoint as never)).toEqual({
      report,
      checkpoint: publicSourceForensics,
      commercialSnapshotRefs: checkpoint.pendingArtifactVerification.commercialSnapshotRefs
    });
  });

  it("reuses a complete V3 artifact checkpoint without returning to search or synthesis", () => {
    const report = { artifactContract: "combined_geo_report_v3", reportId: "report-v3", jobId: "job-v3" };
    const refs = [{ snapshotId: "snapshot-v3", cacheIdentity: "cache-v3", freshnessState: "fresh", actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0 }];
    const checkpoint = {
      recovery: { schemaVersion: 1, phase: "artifact_verification", revision: 4, phaseAttempt: 0, resumeGeneration: 1,
        identity: { jobId: "job-v3", reportId: "report-v3", productContract: "recommendation_forensics_v1", methodology: "public_search_source_forensics_v1", locale: "zh", authorityId: "authority-v3" },
        inputHash: "input-v3", completedArtifacts: ["answer_first_v3"], remainingWork: ["artifact_verification"], priorTransitionId: null },
      answerFirstV3: {
        version: "answer-first-v3-checkpoint-v2",
        stage: "cards_ready",
        identityHash: "answer-checkpoint",
        answerHash: "a".repeat(64),
        sourceHash: "b".repeat(64)
      },
      pendingArtifactVerification: { report, commercialSnapshotRefs: refs }
    };
    expect(combinedV3ArtifactVerificationResume(checkpoint as never)).toEqual({ report, checkpoint: checkpoint.answerFirstV3, commercialSnapshotRefs: refs });
    expect(combinedV3ArtifactVerificationResume({ ...checkpoint, recovery: { phase: "grounded_answer_synthesis" } } as never)).toBeNull();
  });

  it("rejects detached Paid receipts and incomplete reviewed projections on resume", () => {
    const base = {
      report: {
        artifactContract: "combined_geo_report_v3",
        reportId: "report-v3",
        jobId: "job-v3"
      },
      checkpoint: { version: "answer-first-v3-checkpoint-v2" },
      commercialSnapshotRefs: []
    };
    expect(() => assertPaidV3ResumeSemanticAuthority("legacy", base as never)).not.toThrow();
    expect(() => assertPaidV3ResumeSemanticAuthority("legacy", {
      ...base,
      report: { ...base.report, semanticReviewReceipt: { version: "report-semantic-review-v1" } }
    } as never)).toThrow(/root marker/i);
    expect(() => assertPaidV3ResumeSemanticAuthority("legacy", {
      ...base,
      semanticReview: { version: "report-semantic-review-v1" }
    } as never)).toThrow(/root marker/i);
    expect(() => assertPaidV3ResumeSemanticAuthority("deferred", base as never))
      .toThrow(/complete root-bound semantic projection and receipt/i);
  });

  it("persists one complete reviewed checkpoint before verification, materialization, and terminalization", async () => {
    const events: string[] = [];
    const persistedReport = {
      artifactContract: "combined_geo_report_v3",
      reportId: "report-v3",
      jobId: "job-v3",
      semanticReviewReceipt: { version: "report-semantic-review-v1" }
    };
    const ready = { report: structuredClone(persistedReport), artifact: "fixture" };
    const answerProvider = vi.fn();
    const diagnosisProvider = vi.fn();
    const semanticReviewer = vi.fn();
    const sourceSelectionSemanticConstructor = vi.fn();

    const result = await executeReviewedPaidV3ArtifactBoundary({
      persistedReport: persistedReport as never,
      persistCheckpoint: async () => { events.push("checkpoint"); },
      verifyProjection: async (report) => {
        events.push(report === persistedReport ? "verify:persisted" : "verify:ready");
      },
      materialize: async () => {
        events.push("materialize");
        return ready as never;
      },
      terminalize: async () => { events.push("terminalize"); }
    });

    expect(result).toBe(ready);
    expect(events).toEqual([
      "checkpoint",
      "verify:persisted",
      "materialize",
      "verify:ready",
      "terminalize"
    ]);
    expect(answerProvider).not.toHaveBeenCalled();
    expect(diagnosisProvider).not.toHaveBeenCalled();
    expect(semanticReviewer).not.toHaveBeenCalled();
    expect(sourceSelectionSemanticConstructor).not.toHaveBeenCalled();
  });

  it("resumes the reviewed artifact boundary without a write or semantic call and fails before materialization on tamper", async () => {
    const persistedReport = {
      artifactContract: "combined_geo_report_v3",
      reportId: "report-v3",
      jobId: "job-v3",
      semanticReviewReceipt: { version: "report-semantic-review-v1" }
    };
    const modelCalls = vi.fn();
    const materialize = vi.fn(async () => ({ report: structuredClone(persistedReport) as never }));
    const terminalize = vi.fn(async () => undefined);
    await executeReviewedPaidV3ArtifactBoundary({
      persistedReport: persistedReport as never,
      verifyProjection: async () => undefined,
      materialize,
      terminalize
    });
    expect(materialize).toHaveBeenCalledOnce();
    expect(terminalize).toHaveBeenCalledOnce();
    expect(modelCalls).not.toHaveBeenCalled();

    materialize.mockClear();
    terminalize.mockClear();
    await expect(executeReviewedPaidV3ArtifactBoundary({
      persistedReport: persistedReport as never,
      verifyProjection: async () => { throw new Error("semantic projection tampered"); },
      materialize,
      terminalize
    })).rejects.toThrow(/tampered/i);
    expect(materialize).not.toHaveBeenCalled();
    expect(terminalize).not.toHaveBeenCalled();
  });

  it("reuses prepared public-source evidence while rebuilding a V3 artifact after repair", () => {
    const report = {
      version: 2,
      reportId: "report-v3",
      jobId: "job-v3",
      snapshotRefs: [
        { snapshotId: "snapshot-1" },
        { snapshotId: "snapshot-2" },
        { snapshotId: "snapshot-3" }
      ]
    } as RecommendationForensicReportV2;
    const refs = ["snapshot-1", "snapshot-2", "snapshot-3"].map((snapshotId) => ({
      snapshotId,
      cacheIdentity: `cache-${snapshotId}`,
      freshnessState: "fresh" as const,
      actualCostMicros: 0,
      allocatedCostMicros: 0,
      avoidedCostMicros: 0
    }));
    const checkpoint = {
      recovery: {
        schemaVersion: 1,
        phase: "grounded_answer_synthesis",
        revision: 45,
        phaseAttempt: 0,
        resumeGeneration: 6,
        identity: {
          jobId: "job-v3",
          reportId: "report-v3",
          productContract: "recommendation_forensics_v1",
          methodology: "public_search_source_forensics_v1",
          locale: "zh",
          authorityId: "authority-v3"
        },
        inputHash: "input-v3",
        completedArtifacts: ["public_source"],
        remainingWork: ["grounded_answer_synthesis"],
        priorTransitionId: null
      },
      publicSourceForensics: checkpointValue(),
      pendingArtifactVerification: { report, commercialSnapshotRefs: refs }
    };

    expect(publicSourceSynthesisResume(checkpoint as never)).toEqual({
      report,
      checkpoint: checkpoint.publicSourceForensics,
      commercialSnapshotRefs: refs
    });
  });

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

  it("converts retrieval hash labels into the evidence store digest contract", () => {
    const digest = "a".repeat(64);
    expect(sourceEvidenceHash(`sha256:${digest}`)).toBe(digest);
    expect(sourceEvidenceHash(digest.toUpperCase())).toBe(digest);
    expect(() => sourceEvidenceHash("sha256:not-a-digest")).toThrow(/SHA-256/i);
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

    const deferredDependencies = createWorkerPublicSourceForensicsDependencies({
      job,
      workerId: "worker-v2",
      coverage: { plannedPages: 3, successfulPages: 3, failedPages: 0 },
      readCheckpoint: () => checkpoint as never,
      onCheckpointSaved: async () => undefined,
      checkpointJob,
      liveDrill,
      semanticValidation: "deferred",
      artifactReadiness: { async verify() {} },
      retrieveSource: async () => ({ fact: retrieval(), source: sourceEvidence() }),
      collaborators: {
        resolveSnapshot,
        getReport: async () => null,
        saveReport: async (report) => report as RecommendationForensicReportV2
      }
    }, runtime());
    expect(deferredDependencies.prepareArtifactVerification).toBeUndefined();
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
    collectedForThisRun: true, refreshAttempted: true, refreshFailed: false, sufficientlyEvidenced: true, availableSourceCount: 3, observations: [], retrievals: [], actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0 };
}

function retrieval() {
  return { observationId: "observation-1", queryId: "query-1", resultUrl: "https://source.example/", retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true, accessBarrier: "none" as const, normalizedText: "source", normalizedContentHash: "sha256:fixture", verifiedExcerpt: "source" };
}

function sourceEvidence() {
  return { retrievalState: "available" as const, sourceCategory: "unknown" as const, entities: [], claims: [], contradictions: [], evidenceFamilyIdentity: "evidence-family" };
}

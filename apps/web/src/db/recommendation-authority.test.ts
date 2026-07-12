import { createHash, randomUUID } from "node:crypto";
import {
  createAnswerSnapshotCellId,
  classifyCommercialCoverage,
  generatePurchaseQuestions,
  type AnswerExecutionStateLedger,
  type CertificationAuthoritySnapshot
} from "@open-geo-console/answer-engine-observer";
import {
  AI_WEBSITE_REPORT_VERSION,
  RECOMMENDATION_FORENSIC_REPORT_VERSION,
  type RecommendationForensicReportV1,
  type SourceClassificationAuthoritySnapshot
} from "@open-geo-console/ai-report-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memorySaveScanJob } from "./memory";
import { createGeoReportShell, deleteGeoReport, getGeoReport } from "./reports";
import { createAnswerSnapshotRun, getAnswerSnapshotBundleForJob } from "./recommendation-forensics";
import {
  compareAndSwapAnswerExecutionCheckpoint,
  getAnswerExecutionCheckpoint,
  getRecommendationForensicReportForJob,
  installRecommendationAuthoritiesFromProtectedConfig,
  saveRecommendationForensicReport
} from "./recommendation-authority";

describe("recommendation-forensic protected authority", () => {
  const original = {
    path: process.env.OPEN_GEO_DB_PATH,
    certification: process.env.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON,
    classification: process.env.OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON
  };
  let reportId: string;
  let jobId: string;
  let runId: string;

  beforeEach(async () => {
    process.env.OPEN_GEO_DB_PATH = `memory://${randomUUID()}`;
    reportId = randomUUID();
    jobId = randomUUID();
    runId = randomUUID();
    await createGeoReportShell({ id: reportId, url: "https://customer.example.com", siteKey: "example.com", reportLocale: "en" });
    memorySaveScanJob(memoryJob(jobId, reportId));
    await createAnswerSnapshotRun({
      id: runId, reportId, jobId, locale: "en", region: "global",
      questionSetVersion: "purchase-question-v1", startedAt: "2030-01-01T00:00:00.000Z"
    });
    process.env.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON = JSON.stringify(certificationAuthority());
    process.env.OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON = JSON.stringify(sourceAuthority());
    await installRecommendationAuthoritiesFromProtectedConfig();
  });

  afterEach(() => {
    restore("OPEN_GEO_DB_PATH", original.path);
    restore("OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON", original.certification);
    restore("OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON", original.classification);
  });

  it("atomically advances a monotonic checkpoint with its immutable cell and sources", async () => {
    const cell = successfulCell(runId);
    const next = ledger(runId, 1, cell.id, 1);
    await expect(compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 0, executionState: next, cell }))
      .resolves.toEqual(next);
    expect(await getAnswerExecutionCheckpoint(runId)).toEqual(next);
    await expect(compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 0, executionState: next, cell }))
      .rejects.toThrow(/revision/i);
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 1,
      executionState: ledger(runId, 2, cell.id, 2),
      cell: { ...cell, sources: [] }
    })).rejects.toThrow(/source set immutability/i);
    expect((await getAnswerExecutionCheckpoint(runId))?.checkpointRevision).toBe(1);
    const concurrent = await Promise.allSettled([
      compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 1, executionState: ledger(runId, 2, cell.id, 1) }),
      compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 1, executionState: ledger(runId, 2, cell.id, 1) })
    ]);
    expect(concurrent.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
  });

  it("rejects a new cell duplicated under a foreign provider without writing any checkpoint evidence", async () => {
    const cell = successfulCell(runId);
    const duplicated: AnswerExecutionStateLedger = {
      runId,
      checkpointRevision: 1,
      providers: {
        "provider-a": { requestCount: 1, estimatedCostMicros: 0, cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } } },
        "provider-b": { requestCount: 1, estimatedCostMicros: 0, cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } } }
      }
    };
    await expect(compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 0, executionState: duplicated, cell }))
      .rejects.toThrow(/only one provider|foreign provider/i);
    expect(await getAnswerExecutionCheckpoint(runId)).toBeNull();
    const bundle = await getAnswerSnapshotBundleForJob(jobId);
    expect(bundle?.runs[0]?.cells).toEqual([]);
  });

  it("rejects a sensitive provider request identifier before memory persistence", async () => {
    const cell = { ...successfulCell(runId), providerRequestId: "Authorization: Bearer sk-live-memory" };
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 0,
      executionState: ledger(runId, 1, cell.id, 1),
      cell
    })).rejects.toThrow(/providerRequestId.*sensitive/i);
    expect(await getAnswerExecutionCheckpoint(runId)).toBeNull();
    expect((await getAnswerSnapshotBundleForJob(jobId))?.runs[0]?.cells).toEqual([]);
  });

  it("rolls back the ledger when the optional cell is foreign or immutable data conflicts", async () => {
    const cell = successfulCell(runId);
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 0,
      executionState: { runId, checkpointRevision: 1, providers: { "provider-b": { requestCount: 1, estimatedCostMicros: 0, cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } } } } },
      cell
    })).rejects.toThrow(/provider/i);
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 0,
      executionState: ledger(runId, 1, cell.id, 1),
      cell: { ...cell, runId: "foreign-run" }
    })).rejects.toThrow(/identity|run/i);
    expect(await getAnswerExecutionCheckpoint(runId)).toBeNull();

    await compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 0, executionState: ledger(runId, 1, cell.id, 1), cell });
    const changed = "Changed answer";
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 1,
      executionState: ledger(runId, 2, cell.id, 2),
      cell: { ...cell, answerText: changed, responseHash: createHash("sha256").update(changed).digest("hex") }
    })).rejects.toThrow(/immutability/i);
    expect((await getAnswerExecutionCheckpoint(runId))?.checkpointRevision).toBe(1);
  });

  it("loads authority outside the payload, rejects authority tampering, and keeps the report private", async () => {
    const report = failedReport(reportId, jobId, runId);
    await expect(saveRecommendationForensicReport(report)).resolves.toMatchObject({ reportId, jobId });
    await expect(saveRecommendationForensicReport(report)).resolves.toMatchObject({ reportId, jobId });
    await expect(getRecommendationForensicReportForJob(jobId)).resolves.toEqual(report);
    expect(await getGeoReport(reportId)).not.toHaveProperty("recommendationForensicReport");

    const tampered = structuredClone(report);
    tampered.provenanceAndLimitations.certificationAuthorityVersion = "payload-self-certified";
    await expect(saveRecommendationForensicReport(tampered)).rejects.toThrow(/authority/i);
    await deleteGeoReport(reportId);
    await expect(getRecommendationForensicReportForJob(jobId)).resolves.toBeNull();
  });

  it("fails closed when protected config is absent or an installed authority version is mutated", async () => {
    delete process.env.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON;
    await expect(installRecommendationAuthoritiesFromProtectedConfig()).rejects.toThrow(/required/i);
    process.env.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON = JSON.stringify({
      ...certificationAuthority(), capturedAt: "2030-01-02T00:00:00.000Z"
    });
    await expect(installRecommendationAuthoritiesFromProtectedConfig()).rejects.toThrow(/immutability/i);
  });
});

function certificationAuthority(): CertificationAuthoritySnapshot {
  return { authorityVersion: "cert-authority-v1", capturedAt: "2030-01-01T00:00:00.000Z", certifications: [] };
}
function sourceAuthority(): SourceClassificationAuthoritySnapshot {
  return {
    authorityVersion: "source-authority-v1", capturedAt: "2030-01-01T00:00:00.000Z",
    context: { customerRegistrableDomain: "customer.example.com", competitorRegistrableDomains: [], knownDomains: {} }
  };
}
function ledger(runId: string, checkpointRevision: number, cellId: string, attemptCount: number): AnswerExecutionStateLedger {
  return { runId, checkpointRevision, providers: { "provider-a": { requestCount: attemptCount, estimatedCostMicros: 0, cells: { [cellId]: { attemptCount, transientAttemptCount: 0 } } } } };
}
function successfulCell(runId: string) {
  const surface = { providerId: "provider-a", productId: "api", modelId: "model", collectionSurface: "developer_api" as const, locale: "en", region: "global", certificationState: "candidate_uncertified" as const };
  const answerText = "Competitor Example is suitable.";
  return {
    id: createAnswerSnapshotCellId({ runId, questionId: "q-1", surface }), runId, questionId: "q-1", surface,
    status: "succeeded" as const, answerText, executedAt: "2030-01-01T00:00:01.000Z", executionDurationMs: 10,
    responseHash: createHash("sha256").update(answerText).digest("hex"), recommendationOutcome: "recommendations_present" as const,
    sources: [{ url: "https://editorial.example.org/review", title: "Review", providerOrder: 0, providerMetadata: {} }]
  };
}
function failedReport(reportId: string, jobId: string, runId: string): RecommendationForensicReportV1 {
  const questions = generatePurchaseQuestions({ locale: "en", organizationName: "Customer Example", brandAliases: ["Customer Co"], categories: ["freight forwarding"], capabilities: ["customs clearance"], sourceUrls: ["https://customer.example.com"] });
  return {
    version: RECOMMENDATION_FORENSIC_REPORT_VERSION, reportId, jobId, targetUrl: "https://customer.example.com",
    executiveVerdict: { summary: "No certified observations.", customerMentioned: "unknown", primaryGap: "Coverage unavailable.", evidenceCellIds: [], coverageOutcome: "failed" },
    generatedQuestions: questions,
    answerSnapshotMatrix: { run: { id: runId, reportId, jobId, locale: "en", region: "global", questionSetVersion: questions.version, startedAt: "2030-01-01T00:00:00.000Z" }, cells: [], commercialCoverage: classifyCommercialCoverage(questions.questions, [], certificationAuthority()) },
    recommendedEntities: [], citationSources: [], evidenceGrades: [], sourceCategoryBreakdown: [], customerVsCompetitorGaps: [],
    homepageVsFullSiteBlindSpot: { homepageSummary: "Homepage.", fullSiteSummary: "Full site.", omissions: [], contradictions: [], confidenceChanges: [], limitations: [] },
    executivePriorities: [1, 2, 3].map((order) => ({ order: order as 1 | 2 | 3, title: `Priority ${order}`, rationale: "Finding supports this priority.", evidenceCellIds: [], websiteFindingIds: ["finding-1"], citationSourceIds: [], gapIds: [] })) as RecommendationForensicReportV1["executivePriorities"],
    vendorTaskPackage: { version: "vendor-task-v1", tasks: [] },
    websiteFoundationAppendix: { version: AI_WEBSITE_REPORT_VERSION, tier: "deep", targetUrl: "https://customer.example.com", organizationProfile: { organizationName: "Customer Example", brandNames: ["Customer Example", "Customer Co"], summary: "Freight.", businessModel: "Services", productsAndServices: ["Freight forwarding"], targetAudiences: ["Exporters"], marketsAndRegions: [], legalEntity: null, identityConsistency: "Consistent.", ownershipVerification: "not-performed", confidence: "high", evidence: [{ url: "https://customer.example.com", quote: "Customer Example provides freight." }] }, executiveSummary: { overview: "Clear.", strengths: [], keyRisks: [], topPriorities: [] }, dimensionScores: ["organizationClarity", "informationArchitecture", "contentCitability", "trustEvidence", "entityConsistency", "geoUnderstandability"].map((dimension) => ({ dimension, score: 70, explanation: "Grounded.", confidence: "high", evidence: [{ url: "https://customer.example.com", quote: "Customer Example provides freight." }] })) as RecommendationForensicReportV1["websiteFoundationAppendix"]["dimensionScores"], pageTypeAnalyses: [], findings: [{ id: "finding-1", title: "Finding", severity: "opportunity", impact: "Impact.", evidence: [{ url: "https://customer.example.com", quote: "Customer Example provides freight." }], recommendation: "Clarify.", confidence: "high" }], roadmap: { immediate: [], nextPhase: [], ongoing: [] }, coverage: { discoveredPages: 1, plannedPages: 1, analyzedPages: 1, failedPages: 0, samplingMethod: "Deep crawl", pageTypesCovered: ["home"], limitations: [] }, provenance: { reportVersion: 1, modelId: "fixture", promptVersion: "v1", locale: "en", generatedAt: "2030-01-01T00:00:00.000Z", contentHash: "hash" } },
    provenanceAndLimitations: { generatedAt: "2030-01-01T00:01:00.000Z", locale: "en", region: "global", certificationAuthorityVersion: "cert-authority-v1", certificationCapturedAt: "2030-01-01T00:00:00.000Z", certificationProvenance: [], limitations: ["No certified provider."], methodology: "Observed outcomes only.", sourceCategoryContext: sourceAuthority().context, sourceClassificationAuthorityVersion: "source-authority-v1", sourceClassificationCapturedAt: "2030-01-01T00:00:00.000Z" }
  };
}
function memoryJob(id: string, reportId: string) { const now = new Date("2030-01-01T00:00:00.000Z"); return { id, reportId, tier: "deep" as const, productContract: "recommendation_forensics_v1" as const, locale: "en" as const, reason: "standard" as const, stage: "queued" as const, progress: 0, checkpoint: {}, plannedPages: 0, successfulPages: 0, failedPages: 0, attempts: 0, maxAttempts: 3, leaseOwner: null, leaseExpiresAt: null, errorCode: null, publicError: null, creditReservationId: null, createdAt: now, updatedAt: now }; }
function restore(key: string, value: string | undefined) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }

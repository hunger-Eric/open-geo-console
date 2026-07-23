import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { checkpointScanJob, failScanJob, getScanJob, resumeScanJobAfterRepair } from "./jobs";
import { PublicSourceRuntimeError, normalizeJobError } from "@/worker/job-errors";
import { recoveryEnvelope } from "@/worker/job-state";
import { createRecoveryCheckpointWriter } from "@/worker/processor";
import { createTestWebsiteFoundation } from "../public-source-forensics/testing";
import { PublicSourceArtifactUnavailableError, runPublicSourceForensicsPipeline, type PublicSourceForensicsDependencies, type PublicSourcePipelineCheckpoint } from "@/worker/public-source-forensics";
import { executeReviewedPaidV3ArtifactBoundary } from "@/worker/processor";
import { runPaidV3SemanticReview, verifyPersistedPaidV3SemanticReview } from "@/worker/paid-v3-semantic-review";
import {
  REPORT_SEMANTIC_REVIEW_CONTRACT,
  generativeSearchAnswerHash,
  hashReportSemanticReviewValue,
  reportSemanticTextHash,
  type GenerativeSearchAnswerResult,
  type ReportSemanticAnswerAnnotation,
  type ReportSemanticReviewAuthorityBindings,
  type ReportSemanticReviewInput
} from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import { createTestSourceForensicReport } from "../public-source-forensics/testing";
import { prepareCombinedGeoReportV3SemanticDraft, type PrepareCombinedGeoReportV3Input } from "../report/combined-artifact-readiness";
import type { PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";

const execFileAsync = promisify(execFile);
const configuredAdminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim() ?? "";
const runDisposablePostgres = process.env.OGC_RUN_DISPOSABLE_RECOVERY_POSTGRES === "1";
const describePostgres = configuredAdminUrl || runDisposablePostgres ? describe : describe.skip;

describePostgres("schema-v16 recovery checkpoint authority", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseName = `ogc_recovery_${suffix}`;
  let adminUrl = configuredAdminUrl;
  let containerName: string | null = null;
  let admin: postgres.Sql;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDeploymentProfile = process.env.OGC_DEPLOYMENT_PROFILE;
  const originalVercelEnvironment = process.env.VERCEL_ENV;
  const originalCommerceMode = process.env.COMMERCE_MODE;
  const rows = (["source_retrieval", "artifact_verification", "terminalization"] as const).map((phase) => ({
    phase,
    reportId: `recovery-report-${phase}-${suffix}`,
    jobId: `recovery-job-${phase}-${suffix}`,
    workerId: `recovery-worker-${phase}-${suffix}`
  }));
  const artifactGate = {
    reportId: `recovery-report-artifact-gate-${suffix}`,
    jobId: `recovery-job-artifact-gate-${suffix}`,
    workerId: `recovery-worker-artifact-gate-${suffix}`
  };
  const markedPaidV3 = {
    reportId: `recovery-report-marked-paid-v3-${suffix}`,
    jobId: `recovery-job-marked-paid-v3-${suffix}`,
    workerId: `recovery-worker-marked-paid-v3-${suffix}`
  };

  beforeAll(async () => {
    if (!adminUrl) {
      const disposable = await startDisposablePostgres();
      adminUrl = disposable.adminUrl;
      containerName = disposable.containerName;
    }
    admin = postgres(adminUrl, { max: 1, prepare: false });
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const databaseUrl = withDatabase(adminUrl, databaseName);
    const bootstrap = postgres(databaseUrl, { max: 1, prepare: false });
    try {
      await bootstrap`CREATE TABLE deployment_environment(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),profile text NOT NULL CHECK(profile IN ('staging','production')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
      await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    } finally {
      await bootstrap.end({ timeout: 5 });
    }
    await closeDatabase();
    process.env.DATABASE_URL = databaseUrl;
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.VERCEL_ENV = "preview";
    process.env.COMMERCE_MODE = "test";
    await ensureDatabase();
    const sql = getSqlClient();
    for (const row of rows) {
      await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status)
        VALUES (${row.reportId},'https://recovery.example','recovery.example','en','completed')`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage,execution_state,current_phase,lease_owner,lease_expires_at)
        VALUES (${row.jobId},${row.reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'en','synthesizing','running','public_source_preflight',${row.workerId},now()+interval '10 minutes')`;
    }
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status)
      VALUES (${artifactGate.reportId},'https://recovery-gate.example','recovery-gate.example','zh','completed')`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage,execution_state,current_phase,lease_owner,lease_expires_at)
      VALUES (${artifactGate.jobId},${artifactGate.reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'zh','synthesizing','running','source_retrieval',${artifactGate.workerId},now()+interval '10 minutes')`;
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status)
      VALUES (${markedPaidV3.reportId},'https://recovery-paid-v3.example','recovery-paid-v3.example','zh','completed')`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,stage,execution_state,current_phase,lease_owner,lease_expires_at,checkpoint)
      VALUES (${markedPaidV3.jobId},${markedPaidV3.reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3','zh','synthesizing','running','grounded_answer_synthesis',${markedPaidV3.workerId},now()+interval '10 minutes',${JSON.stringify({ semanticReviewContractVersion: "report-semantic-review-v1" })}::jsonb)`;
  }, 120_000);

  afterAll(async () => {
    const sql = getSqlClient();
    for (const row of rows) await sql`DELETE FROM scan_reports WHERE id=${row.reportId}`;
    await sql`DELETE FROM scan_reports WHERE id=${artifactGate.reportId}`;
    await sql`DELETE FROM scan_reports WHERE id=${markedPaidV3.reportId}`;
    await closeDatabase();
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    restoreEnvironment("OGC_DEPLOYMENT_PROFILE", originalDeploymentProfile);
    restoreEnvironment("VERCEL_ENV", originalVercelEnvironment);
    restoreEnvironment("COMMERCE_MODE", originalCommerceMode);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
    if (containerName) {
      await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 30_000 });
    }
  }, 120_000);

  it.each(rows)("persists $phase through repair_wait and resumes the verified V2 checkpoint", async (row) => {
    const initial = await getScanJob(row.jobId);
    if (!initial) throw new Error("Missing recovery fixture job.");
    const writer = createRecoveryCheckpointWriter({ job: initial, workerId: row.workerId });
    const written = await writer({
      stage: "synthesizing",
      phase: row.phase,
      progress: row.phase === "source_retrieval" ? 95 : 99,
      checkpoint: {
        discoverySnapshot: { targetUrl: "https://recovery.example/", candidates: [], robotsPolicy: { rules: [], sitemaps: [], userAgent: "test" }, estimatedPages: 1 },
        websiteFoundation: { completed: true, synthesisInputHash: `foundation-${row.phase}` },
        publicSourceForensics: { identityHash: `identity-${row.phase}`, methodology: "public_search_source_forensics_v1", questionSetVersion: "buyer-questions-v1", fanoutVersion: "public-search-fanout-v1", authorityId: "authority-test", snapshotIds: [], websiteFoundationHash: `foundation-${row.phase}`, evidenceCutoffAt: "2030-01-01T00:00:00.000Z", locale: "en", region: "CN", adapterIdentityHash: "adapter-test" }
      }
    });
    const envelope = recoveryEnvelope(written.checkpoint);
    expect(written).toMatchObject({ currentPhase: row.phase, checkpointRevision: 1, phaseAttempt: 0, resumeGeneration: 0 });
    expect(envelope).toMatchObject({ phase: row.phase, revision: written.checkpointRevision, phaseAttempt: written.phaseAttempt, resumeGeneration: written.resumeGeneration });
    expect(written.checkpoint).toMatchObject({ websiteFoundation: { completed: true }, discoverySnapshot: { targetUrl: "https://recovery.example/" } });

    await expect(checkpointScanJob(row.jobId, "stale-worker", {
      stage: "synthesizing", phase: row.phase, progress: 99, checkpoint: written.checkpoint, expectedCheckpointRevision: written.checkpointRevision
    })).rejects.toThrow(/lease/i);
    await expect(checkpointScanJob(row.jobId, row.workerId, {
      stage: "synthesizing", phase: row.phase, progress: 99, checkpoint: written.checkpoint, expectedCheckpointRevision: 0
    })).rejects.toThrow(/lease/i);

    const normalized = normalizeJobError(new PublicSourceRuntimeError(`Repair ${row.phase}`, "public_source_runtime_unavailable"), {
      jobId: row.jobId, phase: row.phase, phaseAttempt: written.phaseAttempt, resumeGeneration: written.resumeGeneration
    });
    const waiting = await failScanJob(row.jobId, row.workerId, {
      code: normalized.code, publicMessage: "The analysis is temporarily unavailable.", retryable: false,
      classification: "operator_repairable", internalError: normalized, phase: row.phase
    });
    expect(waiting).toMatchObject({ executionState: "repair_wait", currentPhase: row.phase, leaseOwner: null, checkpointRevision: 1 });
    const events = (await getSqlClient()<Array<{ error_phase: string; transition_phase: string; refunds: number; emails: number }>>`
      SELECT
        (SELECT phase FROM scan_job_error_events WHERE job_id=${row.jobId} ORDER BY recorded_at DESC LIMIT 1) AS error_phase,
        (SELECT phase FROM scan_job_transition_events WHERE job_id=${row.jobId} AND to_execution_state='repair_wait' ORDER BY recorded_at DESC LIMIT 1) AS transition_phase,
        (SELECT count(*)::integer FROM payment_refunds refund JOIN payment_orders orders ON orders.id=refund.order_id WHERE orders.fulfillment_job_id=${row.jobId}) AS refunds,
        (SELECT count(*)::integer FROM email_deliveries delivery JOIN payment_orders orders ON orders.id=delivery.order_id WHERE orders.fulfillment_job_id=${row.jobId}) AS emails
    `)[0]!;
    expect(events).toEqual({ error_phase: row.phase, transition_phase: row.phase, refunds: 0, emails: 0 });

    await expect(resumeScanJobAfterRepair({ id: row.jobId, inputHash: envelope!.inputHash, readiness: async () => { throw new Error("runtime still unavailable"); } })).rejects.toThrow(/unavailable/i);
    expect((await getScanJob(row.jobId))?.executionState).toBe("repair_wait");

    const resumed = await resumeScanJobAfterRepair({ id: row.jobId, inputHash: envelope!.inputHash, readiness: async () => undefined });
    expect(resumed).toMatchObject({ executionState: "queued", currentPhase: row.phase, stage: "synthesizing", checkpointRevision: written.checkpointRevision });
    expect(resumed.checkpoint).toMatchObject({ websiteFoundation: { completed: true }, discoverySnapshot: { targetUrl: "https://recovery.example/" } });
  }, 120_000);

  it("checkpoints the real artifact gate before it throws, then resumes without re-fetching public sources", async () => {
    const initial = await getScanJob(artifactGate.jobId);
    if (!initial) throw new Error("Missing artifact gate recovery fixture.");
    const writer = createRecoveryCheckpointWriter({ job: initial, workerId: artifactGate.workerId });
    let checkpoint = initial.checkpoint;
    let retrievalCalls = 0;
    const authority = fixtureAuthority();
    const dependencies: PublicSourceForensicsDependencies = {
      authority,
      getCheckpoint: async () => (checkpoint.publicSourceForensics as PublicSourcePipelineCheckpoint | undefined) ?? null,
      saveCheckpoint: async (_jobId, publicSourceForensics) => {
        const updated = await writer({ stage: "synthesizing", phase: "source_retrieval", progress: 95,
          checkpoint: { ...checkpoint, websiteFoundation: { completed: true }, publicSourceForensics } });
        checkpoint = updated.checkpoint;
      },
      prepareArtifactVerification: async ({ report, checkpoint: publicSourceForensics, commercialSnapshotRefs }) => {
        const updated = await writer({ stage: "synthesizing", phase: "artifact_verification", progress: 99,
          checkpoint: { ...checkpoint, recommendationForensics: { questionsGenerated: true, reportSaved: true }, publicSourceForensics,
            pendingArtifactVerification: { report, commercialSnapshotRefs } } });
        checkpoint = updated.checkpoint;
      },
      resolveSnapshot: async ({ fanout }) => {
        retrievalCalls++;
        return fixtureSnapshot(fanout, retrievalCalls);
      },
      getReport: async () => null,
      saveReport: async (report) => report as never,
      artifactReadiness: { async verify() { throw new PublicSourceArtifactUnavailableError(); } },
      now: () => new Date("2030-01-02T00:00:00.000Z"),
      costCapMicros: 1_000
    };
    await expect(runPublicSourceForensicsPipeline({ reportId: artifactGate.reportId, jobId: artifactGate.jobId, locale: "zh-CN", region: "CN",
      targetUrl: "https://customer-logistics.example/", websiteFoundation: createTestWebsiteFoundation(), dependencies })).rejects.toBeInstanceOf(PublicSourceArtifactUnavailableError);
    expect(retrievalCalls).toBe(3);
    const artifactCheckpoint = await getScanJob(artifactGate.jobId);
    const envelope = recoveryEnvelope(artifactCheckpoint!.checkpoint);
    expect(artifactCheckpoint).toMatchObject({ currentPhase: "artifact_verification", checkpointRevision: 2 });
    expect(artifactCheckpoint!.checkpoint).toMatchObject({ pendingArtifactVerification: { report: { reportId: artifactGate.reportId } } });

    const normalized = normalizeJobError(new PublicSourceRuntimeError("Artifact rendering is unavailable.", "artifact_unavailable"), {
      jobId: artifactGate.jobId, phase: "artifact_verification", phaseAttempt: 0, resumeGeneration: 0
    });
    await failScanJob(artifactGate.jobId, artifactGate.workerId, { code: normalized.code, publicMessage: "The analysis is temporarily unavailable.",
      retryable: false, classification: "operator_repairable", internalError: normalized, phase: "artifact_verification" });
    const event = (await getSqlClient()<Array<{ phase: string }>>`SELECT phase FROM scan_job_error_events WHERE job_id=${artifactGate.jobId} ORDER BY recorded_at DESC LIMIT 1`)[0];
    expect(event?.phase).toBe("artifact_verification");
    await resumeScanJobAfterRepair({ id: artifactGate.jobId, inputHash: envelope!.inputHash, readiness: async () => undefined });
    const resumed = await getScanJob(artifactGate.jobId);
    expect(resumed).toMatchObject({ executionState: "queued", currentPhase: "artifact_verification", stage: "synthesizing" });
    expect(resumed!.checkpoint).toMatchObject({ pendingArtifactVerification: { report: { reportId: artifactGate.reportId } } });
    expect(retrievalCalls).toBe(3);
  }, 120_000);

  it("persists a real marker-present Paid V3 semantic projection through repair, resumes it, and rejects a stale CAS writer", async () => {
    const initial = await getScanJob(markedPaidV3.jobId);
    if (!initial) throw new Error("Missing marked Paid V3 recovery fixture.");
    const fixture = await paidSemanticFixture(markedPaidV3);
    const reviewer = {
      review: vi.fn(async ({ inputText }: { inputText: string }) => {
        const { input } = JSON.parse(inputText) as { input: ReportSemanticReviewInput };
        return validPaidReview(input);
      })
    };
    const reviewed = await runPaidV3SemanticReview({ ...fixture, reviewer });
    const receipt = reviewed.report.semanticReviewReceipt;
    if (!receipt) throw new Error("Real Paid V3 fixture did not create a semantic receipt.");
    const semanticReview = {
      version: "report-semantic-review-v1" as const,
      input: reviewed.input,
      output: reviewed.output,
      applied: { fields: reviewed.applied.fields, annotations: reviewed.applied.annotations, receipt },
      finalReviewedReportProjectionHash: receipt.finalReviewedReportProjectionHash
    };
    const checkpoint = {
      ...initial.checkpoint,
      answerFirstV3: { version: "answer-first-v3-checkpoint-v2", stage: "cards_ready", identityHash: hashReportSemanticReviewValue(fixture.answerResults), answerHash: reviewed.report.engineProvenance.answerHash, sourceHash: hashReportSemanticReviewValue(fixture.answerResults.map((answer) => answer.sources)), answerResults: fixture.answerResults },
      pendingArtifactVerification: {
        report: reviewed.report,
        commercialSnapshotRefs: [{ snapshotId: "paid-v3-snapshot", cacheIdentity: "paid-v3-cache", freshnessState: "fresh", actualCostMicros: 0, allocatedCostMicros: 0, avoidedCostMicros: 0 }],
        semanticReview
      }
    };
    const serializedBoundary = canonicalJson({
      marker: checkpoint.semanticReviewContractVersion,
      report: checkpoint.pendingArtifactVerification.report,
      projection: checkpoint.pendingArtifactVerification.semanticReview
    });

    const writer = createRecoveryCheckpointWriter({
      job: initial,
      workerId: markedPaidV3.workerId
    });
    const written = await writer({
      stage: "synthesizing", phase: "artifact_verification", progress: 99, checkpoint
    });
    expect(written).toMatchObject({ currentPhase: "artifact_verification", checkpointRevision: initial.checkpointRevision + 1 });
    expect(reviewer.review).toHaveBeenCalledOnce();
    const persistedBoundary = canonicalJson({
      marker: written.checkpoint.semanticReviewContractVersion,
      report: (written.checkpoint.pendingArtifactVerification as { report: unknown }).report,
      projection: (written.checkpoint.pendingArtifactVerification as { semanticReview: unknown }).semanticReview
    });
    expect(persistedBoundary).toBe(serializedBoundary);

    await expect(checkpointScanJob(markedPaidV3.jobId, markedPaidV3.workerId, {
      stage: "synthesizing", phase: "artifact_verification", progress: 99, checkpoint: written.checkpoint, expectedCheckpointRevision: initial.checkpointRevision
    })).rejects.toThrow(/stale|conflicts|lease/i);

    const persisted = await getScanJob(markedPaidV3.jobId);
    if (!persisted?.checkpoint.answerFirstV3 || !persisted.checkpoint.pendingArtifactVerification) throw new Error("Missing persisted Paid V3 authority.");
    const persistedPending = persisted.checkpoint.pendingArtifactVerification as typeof checkpoint.pendingArtifactVerification;
    const persistedAnswers = persisted.checkpoint.answerFirstV3.answerResults as typeof fixture.answerResults;
    const verifyProjection = async (report: typeof reviewed.report) => verifyPersistedPaidV3SemanticReview({
      report,
      rawInput: persistedPending.semanticReview.input,
      rawReview: persistedPending.semanticReview.output,
      appliedFields: persistedPending.semanticReview.applied.fields,
      answerResults: persistedAnswers,
      reviewedFreeQ1: fixture.reviewedFreeQ1,
      reviewedFreeQ1Annotation: fixture.reviewedFreeQ1Annotation,
      expectedAuthorityBindings: fixture.manifest.authorityBindings
    });
    await verifyProjection(persistedPending.report);

    const normalized = normalizeJobError(new PublicSourceRuntimeError("Injected artifact verification failure.", "artifact_unavailable"), {
      jobId: markedPaidV3.jobId, phase: "artifact_verification", phaseAttempt: written.phaseAttempt, resumeGeneration: written.resumeGeneration
    });
    await failScanJob(markedPaidV3.jobId, markedPaidV3.workerId, {
      code: normalized.code, publicMessage: "The analysis is temporarily unavailable.", retryable: false,
      classification: "operator_repairable", internalError: normalized, phase: "artifact_verification"
    });

    const readiness = vi.fn(async () => undefined);
    const envelope = recoveryEnvelope(written.checkpoint);
    const resumed = await resumeScanJobAfterRepair({ id: markedPaidV3.jobId, inputHash: envelope!.inputHash, readiness });
    expect(readiness).toHaveBeenCalledOnce();
    expect(resumed).toMatchObject({ executionState: "queued", currentPhase: "artifact_verification", checkpointRevision: written.checkpointRevision });
    expect(canonicalJson({
      marker: resumed.checkpoint.semanticReviewContractVersion,
      report: (resumed.checkpoint.pendingArtifactVerification as { report: unknown }).report,
      projection: (resumed.checkpoint.pendingArtifactVerification as { semanticReview: unknown }).semanticReview
    })).toBe(persistedBoundary);

    if (!resumed.checkpoint.answerFirstV3 || !resumed.checkpoint.pendingArtifactVerification) {
      throw new Error("Resumed Paid V3 authority is incomplete.");
    }
    const resumedPending = resumed.checkpoint.pendingArtifactVerification as typeof checkpoint.pendingArtifactVerification;
    const resumedAnswers = resumed.checkpoint.answerFirstV3.answerResults as typeof fixture.answerResults;
    const verifyResumedProjection = async (report: typeof reviewed.report) => verifyPersistedPaidV3SemanticReview({
      report,
      rawInput: resumedPending.semanticReview.input,
      rawReview: resumedPending.semanticReview.output,
      appliedFields: resumedPending.semanticReview.applied.fields,
      answerResults: resumedAnswers,
      reviewedFreeQ1: fixture.reviewedFreeQ1,
      reviewedFreeQ1Annotation: fixture.reviewedFreeQ1Annotation,
      expectedAuthorityBindings: fixture.manifest.authorityBindings
    });
    const materialize = vi.fn(async () => ({ report: resumedPending.report, artifact: "fixture" }));
    const terminalize = vi.fn(async () => undefined);
    await executeReviewedPaidV3ArtifactBoundary({
      persistedReport: resumedPending.report,
      verifyProjection: verifyResumedProjection,
      materialize,
      terminalize
    });
    expect(materialize).toHaveBeenCalledOnce();
    expect(terminalize).toHaveBeenCalledOnce();

    materialize.mockClear();
    terminalize.mockClear();
    await expect(executeReviewedPaidV3ArtifactBoundary({
      persistedReport: { ...resumedPending.report, methodology: { ...resumedPending.report.methodology, technicalCoverage: "tampered" } },
      verifyProjection: verifyResumedProjection,
      materialize,
      terminalize
    })).rejects.toThrow();
    expect(materialize).not.toHaveBeenCalled();
    expect(terminalize).not.toHaveBeenCalled();
  }, 120_000);
});

async function paidSemanticFixture(ids: { reportId: string; jobId: string }) {
  const prepared = rewriteExactStrings(v3PreparationInput(), new Map([["report-v3", ids.reportId], ["job-v3", ids.jobId], ["order-v3", `order-${ids.reportId}`]]));
  const initialAnswerResults = prepared.answerCards.map((card, index) => ({
    questionId: card.questionId, answerText: card.answerText,
    sources: card.sources.map((source) => ({ sourceId: source.sourceId, title: source.title, canonicalUrl: source.canonicalUrl, registrableDomain: source.registrableDomain, citedText: source.citedText, providerResultOrder: source.providerResultOrder })),
    refusal: null, searchedAt: card.provenance.searchedAt, completedAt: card.provenance.completedAt, providerResponseId: `response-${index + 1}`
  })) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  const hashes = await Promise.all(initialAnswerResults.map((answer) => generativeSearchAnswerHash(answer, { locale: prepared.businessQuestionSet.locale, semanticValidation: "deferred" })));
  prepared.answerCards.forEach((card, index) => { card.provenance.answerHash = hashes[index]!; });
  const { sourceSelectionDiagnosis: _legacy, ...carrier } = prepared;
  void _legacy;
  const answerCards = prepared.answerCards.map((card, index) => {
    if (index === 0) return card;
    const { geoDiagnosis: _diagnosis, ...draft } = card;
    void _diagnosis;
    return draft;
  }) as never;
  const report = prepareCombinedGeoReportV3SemanticDraft({ ...carrier, answerCards });
  const cards = report.answerCards as typeof prepared.answerCards;
  const questions = cards.map((card) => ({ questionId: card.questionId, originalText: card.exactQuestion, originalTextHash: reportSemanticTextHash(card.exactQuestion) }));
  const sources = cards.map((card) => {
    const source = card.sources[0]!;
    const originalText = JSON.stringify(source);
    return { sourceId: source.sourceId, questionId: card.questionId, canonicalUrl: source.canonicalUrl, originalText, originalTextHash: reportSemanticTextHash(originalText) };
  });
  const evidence = sources.map((source) => ({ evidenceId: source.sourceId, questionId: source.questionId, sourceId: source.sourceId, originalText: source.originalText, originalTextHash: source.originalTextHash }));
  const observationResults = sources.map((source, index) => ({ observationId: `observation-${index + 1}`, resultId: `result-${index + 1}`, questionId: source.questionId, originalText: source.originalText, originalTextHash: source.originalTextHash }));
  const profileId = "profile-source-example";
  const sourceIds = sources.map(({ sourceId }) => sourceId);
  const sourceSelectionCatalogSeeds = [
    ...sources.map((source) => ({ kind: "contribution" as const, questionId: source.questionId, sourceId: source.sourceId, profileId, allowedEvidenceIds: [source.sourceId] })),
    { kind: "target_state" as const, slotId: "target-gap", questionId: null, sourceId: null, profileId, allowedEvidenceIds: sourceIds },
    ...["problem-match", "factual-specificity", "entity-clarity"].map((slotId) => ({ kind: "factor" as const, slotId, questionId: null, sourceId: null, profileId, allowedEvidenceIds: sourceIds })),
    ...["action-1", "action-2", "action-3"].map((actionId) => ({ kind: "action" as const, questionId: null, sourceId: null, profileId, actionId, allowedEvidenceIds: sourceIds }))
  ];
  const answerResults = cards.map((card, index) => ({
    questionId: card.questionId, answerText: card.answerText,
    sources: card.sources.map((source) => ({ sourceId: source.sourceId, title: source.title, canonicalUrl: source.canonicalUrl, registrableDomain: source.registrableDomain, citedText: source.citedText, providerResultOrder: source.providerResultOrder })),
    refusal: null, searchedAt: card.provenance.searchedAt, completedAt: card.provenance.completedAt, providerResponseId: `response-${index + 1}`
  })) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
  const authorityBindings = paidAuthorityBindings();
  const reviewedFreeQ1Annotation: ReportSemanticAnswerAnnotation = { questionId: cards[0].questionId, relevance: "responsive", entityRole: "target", targetPresence: "present", targetFirstSentence: 1, targetRoles: ["service provider"], competitorEntityIds: [], evidenceIds: [cards[0].sources[0]!.sourceId], sourceIds: [cards[0].sources[0]!.sourceId], reason: "The accepted Free review found a responsive target answer." };
  return {
    report,
    manifest: {
      locale: prepared.businessQuestionSet.locale,
      target: { siteKey: "customer-logistics.example", targetUrl: prepared.targetUrl, aliases: ["Customer Logistics"] },
      expectedModel: { providerId: "fixture", modelId: "review-model" }, questions, sources, evidence, observationResults, entities: [], authorityBindings,
      answerSubjects: cards.map((card, index) => ({ questionId: card.questionId, fieldPath: `answerCards[${index}].answerText` })), sourceSelectionCatalogSeeds,
      manifestCoverageOptions: { fieldOverrides: cards.flatMap((card, index) => [{ path: `answerCards[${index}].exactQuestion`, mutability: "read_only" as const, questionId: card.questionId }, { path: `answerCards[${index}].answerText`, questionId: card.questionId, allowedEvidenceIds: [card.sources[0]!.sourceId], allowedSourceIds: [card.sources[0]!.sourceId] }]) }
    },
    sourceSelectionContext: {
      questions: cards.map((card) => ({ questionId: card.questionId, answerText: card.answerText, sources: card.sources.map((source) => ({ ...source, questionId: card.questionId, auditExcerpt: null })) })),
      missingEvidenceFamiliesByQuestion: [cards[0].geoDiagnosis.missingEvidenceFamilies, ["regional_fit"], ["delivery_risk"]] as const,
      finalSourceSelectionInputIdentity: { sourceHash: "4".repeat(64), targetFoundationHash: "e".repeat(64), locale: "en" as const, contributionAnalyzerVersion: "deterministic-contribution-v1" as const, factorAnalyzerVersion: "observable-factor-v1" as const, targetComparatorVersion: "target-page-signal-v1" as const }
    },
    answerResults, reviewedFreeQ1: cards[0], reviewedFreeQ1Annotation
  };
}

function paidAuthorityBindings(): ReportSemanticReviewAuthorityBindings {
  return { rootMarker: REPORT_SEMANTIC_REVIEW_CONTRACT, artifactIdentityHash: "1".repeat(64), reviewedFreeAuthorityHash: "2".repeat(64), answerCheckpointHash: "3".repeat(64), commercialSnapshotsHash: "4".repeat(64), publicSourceHash: "5".repeat(64), providerDiscoveryHash: "6".repeat(64), technicalFoundationHash: "7".repeat(64), aiFoundationHash: "8".repeat(64), evidenceAssetsHash: "9".repeat(64) };
}

function validPaidReview(input: ReportSemanticReviewInput): Record<string, unknown> {
  const contributionItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "contribution");
  const targetStateItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "target_state");
  const factorItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "factor");
  const actionItems = input.sourceSelectionCatalog!.filter(({ kind }) => kind === "action");
  const factorKinds = ["problem_match", "factual_specificity", "entity_clarity"] as const;
  const actionFamilies = ["first_party_fact_page", "entity_relationship", "third_party_validation"] as const;
  const priorities = ["high", "medium", "low"] as const;
  const sourceSelectionDraft = {
    version: "source_selection_diagnosis_v1", status: "complete",
    inputIdentity: { answerHash: "a".repeat(64), sourceHash: "b".repeat(64), targetFoundationHash: "c".repeat(64), locale: "en", contributionAnalyzerVersion: "deterministic-contribution-v1", factorAnalyzerVersion: "observable-factor-v1", targetComparatorVersion: "target-page-signal-v1" },
    sourceProfiles: [{ profileId: "profile-source-example", registrableDomain: "source.example", sourceRefs: contributionItems.map(({ questionId, sourceId }) => ({ questionId, sourceId })), coveredQuestionIds: contributionItems.map(({ questionId }) => questionId), contributions: contributionItems.map(({ questionId, sourceId }) => ({ questionId, sourceId, role: "first_party_capability", summary: "The source contributes a directly observed service fact.", answerExcerpt: null, sourceExcerpt: null, basis: "provider_returned", confidence: "supported" })), targetGaps: targetStateItems.map(() => ({ factor: "problem_match", targetState: "missing", comparison: "The target needs a clearer evidence-backed comparison.", sourceEvidenceRefs: contributionItems.map(({ questionId, sourceId }) => ({ questionId, sourceId, factor: "problem_match" })), targetEvidenceRefs: [] })), observableFactors: factorItems.map((_, index) => ({ factor: factorKinds[index]!, observation: `Observed factor ${index + 1}.`, evidenceUrl: `https://source.example/q${index + 1}`, evidenceExcerpt: null, basis: "provider_returned", confidence: "supported" })), auditStatus: "verified" }],
    sharedPatterns: [], targetActions: actionItems.map(({ actionId }, index) => ({ actionId, priority: priorities[index]!, actionFamily: actionFamilies[index]!, title: `Evidence action ${index + 1}`, rationale: `The reviewed evidence supports action ${index + 1}.`, relatedProfileIds: ["profile-source-example"], relatedGapFactors: ["problem_match"] })), limitations: []
  };
  return {
    version: REPORT_SEMANTIC_REVIEW_CONTRACT, inputHash: input.inputHash, providerId: input.expectedModel.providerId, modelId: input.expectedModel.modelId,
    fields: input.fields.map((field) => ({ path: field.path, originalTextHash: field.originalTextHash, decision: "pass", issueCodes: [], reason: "The text is natural and supported by the exact evidence.", evidenceIds: field.allowedEvidenceIds, sourceIds: field.allowedSourceIds, retainedOriginalTerms: [] })),
    questionDistinctness: { decision: "distinct", duplicateGroups: [], reason: "The three buyer questions address different decisions." },
    annotations: {
      observationResults: input.observationResults.map(({ observationId, resultId }) => ({ observationId, resultId, targetPresence: "present", competitorPresence: "absent", reason: "The observation refers to the target." })),
      answers: input.answerSubjects.map(({ questionId }, index) => ({ questionId, relevance: "responsive", entityRole: "target", targetPresence: "present", targetFirstSentence: 1, targetRoles: ["service provider"], competitorEntityIds: [], evidenceIds: [`s${index + 1}`], sourceIds: [`s${index + 1}`], reason: "The answer responds directly using its owned source." })),
      evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: field.allowedEvidenceIds, sourceIds: field.allowedSourceIds, reason: "The exact references belong to this field." })),
      sourceSelection: input.sourceSelectionCatalog!.map((item) => { const factorIndex = factorItems.findIndex(({ itemId }) => itemId === item.itemId); const actionIndex = actionItems.findIndex(({ itemId }) => itemId === item.itemId); return { annotationId: item.annotationId, itemId: item.itemId, kind: item.kind, questionId: item.questionId, sourceId: item.sourceId, profileId: item.profileId, actionId: item.actionId, contributionRole: item.kind === "contribution" ? "first_party_capability" : null, targetState: item.kind === "target_state" ? "missing" : null, factorClassification: item.kind === "factor" ? factorKinds[factorIndex]! : null, actionFamily: item.kind === "action" ? actionFamilies[actionIndex]! : null, priority: item.kind === "action" ? priorities[actionIndex]! : null, evidenceIds: item.allowedEvidenceIds, reason: "The catalog-bound evidence supports this semantic value." }; })
    }, sourceSelectionDraft, sourceSelectionDraftHash: hashReportSemanticReviewValue(sourceSelectionDraft), overallDecision: "pass"
  };
}

function v3PreparationInput(): PrepareCombinedGeoReportV3Input {
  const forensic = createTestSourceForensicReport({ reportId: "report-v3", jobId: "job-v3" });
  const questionSet = {
    version: "business-questions-v1", id: "questions-v3", revision: 1, locale: forensic.locale, region: forensic.region, confidence: "high", requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile-v3", identityExclusions: [], acknowledgedLowConfidence: false, confirmedAt: "2030-01-01T00:00:00.000Z", contentHash: "questions-v3-hash",
    questions: forensic.questions.questions.map((question, index) => ({ purpose: (["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const)[index]!, generatedText: question.normalizedText, privateText: question.normalizedText, neutralPublicText: question.normalizedText, evidenceUrls: [], service: question.normalizedText, audience: "buyer", marketRegion: forensic.region, edited: false, neutralizationVersion: "identity-neutral-v1", neutralContentHash: `neutral-${question.id}` }))
  } as unknown as ConfirmedBusinessQuestionSet;
  const canonical = toCanonicalBuyerQuestionSet(questionSet).questions;
  const questionIdMap = new Map(forensic.questions.questions.map((question, index) => [question.id, canonical[index]!.id]));
  const alignedForensic = rewriteExactStrings(structuredClone(forensic), questionIdMap);
  const answerCards = canonical.map((question, index) => ({
    answerMode: "generative_search_v1" as const, questionId: question.id, exactQuestion: questionSet.questions[index]!.privateText, status: "answered" as const, answerText: `The public evidence answers buyer question ${index + 1}.`,
    sources: [{ sourceId: `s${index + 1}`, title: `Independent source ${index + 1}`, canonicalUrl: `https://source.example/q${index + 1}`, registrableDomain: "source.example", citedText: `Verified source fact ${index + 1}.`, providerResultOrder: index + 1, retrievalStatus: "verified_body" as const, ownershipCategory: "third_party_editorial" as const }],
    provenance: { providerId: "fixture", model: "fixture-model", searchMode: "native_web_search", promptVersion: "generative-search-answer-v1" as const, searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z", answerHash: "a".repeat(64), sourceHash: "b".repeat(64) },
    refusal: null,
    geoDiagnosis: { targetMentioned: true, targetFirstSentence: 1, targetRoles: ["service provider"], competitorEntityIds: [], citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 1, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 }, missingEvidenceFamilies: [], retestQuestion: questionSet.questions[index]!.privateText },
    audit: { verifiedBodyCount: 1, searchSourceOnlyCount: 0, inaccessibleCount: 0 }
  })) as PrepareCombinedGeoReportV3Input["answerCards"];
  const evidenceAssets = [{ id: "asset-v3", reportId: "report-v3", jobId: "job-v3", findingId: "finding-1", citationIndex: 0, kind: "context", status: "ready", sourceUrl: alignedForensic.targetUrl, quote: "The target website publishes a public service description.", pageElement: null, capturedAt: new Date("2030-01-01T00:00:00.000Z"), viewportWidth: 1280, viewportHeight: 720, contentHash: "f".repeat(64), evidenceHash: "1".repeat(64), assetHash: "2".repeat(64), storageProvider: "fixture", storageKey: "reports/report-v3/asset-v3.png", mimeType: "image/png", byteSize: 5, failureCode: null, createdAt: new Date("2030-01-01T00:00:00.000Z"), updatedAt: new Date("2030-01-01T00:00:00.000Z") }] as PrepareCombinedGeoReportV3Input["evidenceAssets"];
  return {
    artifactRevisionId: "artifact-v3", artifactRevision: 3, reportId: "report-v3", orderId: "order-v3", jobId: "job-v3", originalPaidJobId: "job-v3", targetUrl: alignedForensic.targetUrl,
    technicalReport: { url: alignedForensic.targetUrl, scannedAt: "2030-01-01T00:00:00.000Z", score: 80, pages: [{ url: alignedForensic.targetUrl, status: 200, title: "Customer Logistics", metaDescription: "Cross-border logistics services", h1: ["Customer Logistics"], h2: [], canonical: alignedForensic.targetUrl, hasOpenGraph: true, hasJsonLd: true, readableTextLength: 500, internalLinks: 2 }], findings: [], recommendations: [], machineReadableAssets: { robotsTxt: { url: `${alignedForensic.targetUrl}robots.txt`, present: true, summary: "robots.txt is available." }, sitemapXml: { url: `${alignedForensic.targetUrl}sitemap.xml`, present: true, summary: "sitemap.xml is available." }, llmsTxt: { url: `${alignedForensic.targetUrl}llms.txt`, present: false, summary: "llms.txt was not found." } } },
    aiReport: alignedForensic.websiteFoundationAppendix, evidenceAssets, businessQuestionSet: questionSet, answerCards, sourceSelectionDiagnosis: {} as never,
    engineProvenance: { engineId: "open_geo_public_search_answer_v1", searchSurface: "fixture/v1", queryPlanVersion: "v1", passageSelectorVersion: "v1", synthesisModel: "fixture-model", synthesisPromptVersion: "v1", locale: alignedForensic.locale, region: alignedForensic.region, searchedAt: "2030-01-01T00:00:00.000Z", evidenceCutoffAt: "2030-01-02T00:00:00.000Z", synthesizedAt: "2030-01-02T00:00:00.000Z", inputHash: "3".repeat(64), evidenceHash: "4".repeat(64), answerHash: "5".repeat(64) },
    publicSourceForensics: alignedForensic,
    providerDiscovery: { version: "provider-discovery-v1", policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" }, identity: { candidateSetHash: "6".repeat(64), queryPlanVersion: "v1", passageSelectorVersion: "v1", claimExtractionContract: "provider-claim-extraction-v1", claimExtractionModel: "fixture-model", claimSetHash: "7".repeat(64) }, execution: { plannedQueries: 1, completedQueries: 1, returnedObservations: 1, safelyRetrievedPages: 1, relevantPassages: 1, discoveredProviders: 1, strictProviders: 0, candidateProviders: 1, rejectedProviders: 0, coverage: "partial" }, strict: [], candidates: [{ entityId: "provider-1", canonicalName: "Logistics Provider", genericRole: "service_provider", policyRole: "carrier", leadEvidenceIds: ["provider-evidence-1"], missingProof: ["Direct asset evidence is unavailable."] }], evidence: [{ evidenceId: "provider-evidence-1", sourceEvidenceId: "source-provider-1", registrableDomain: "provider.example", title: "Logistics Provider", sourceAuthority: "company_owned", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "The provider publishes freight services.", capability: "linehaul_fleet" }], limitation: "Limited public evidence does not prove that a provider lacks capability." }
  };
}

function rewriteExactStrings<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  if (typeof value === "string") return (replacements.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => rewriteExactStrings(item, replacements)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewriteExactStrings(item, replacements)])) as T;
  return value;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function startDisposablePostgres(): Promise<{ adminUrl: string; containerName: string }> {
  const port = await freePort();
  const containerName = `ogc-recovery-pg-${randomUUID().slice(0, 8)}`;
  await execFileAsync("docker", [
    "run", "--rm", "-d", "--name", containerName,
    "-e", "POSTGRES_PASSWORD=postgres",
    "-p", `127.0.0.1:${port}:5432`,
    "postgres:17"
  ], { timeout: 120_000 });
  const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = postgres(adminUrl, { max: 1, connect_timeout: 1, prepare: false });
    try {
      await probe`SELECT 1`;
      await probe.end({ timeout: 1 });
      return { adminUrl, containerName };
    } catch (error) {
      lastError = error;
      await probe.end({ timeout: 1 }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 30_000 }).catch(() => undefined);
  throw lastError;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function restoreEnvironment(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function fixtureAuthority(): PublicSearchSurfaceAuthority {
  const surface = { surfaceId: "fixture-surface", providerId: "fixture-index", productId: "fixture-search", surfaceKind: "documented_api" as const,
    contractVersion: "public-search-surface-v1", surfaceVersion: "fixture-v1", adapterVersion: "fixture-adapter-v1", locale: "zh-CN", region: "CN" };
  return { authorityId: "fixture-authority", environment: "test", surface, active: true, certifiedAt: "2030-01-01T00:00:00.000Z",
    evidenceReference: "fixture://recovery", supportedLocales: ["zh-CN"], supportedRegions: ["CN"] };
}

function fixtureSnapshot(fanout: SearchQueryFanout, index: number) {
  const observations = fanout.queries.map((query, order) => ({ observationId: `recovery-observation-${index}-${order}`, surface: fixtureAuthority().surface,
    queryId: query.id, exactQuery: query.exactQuery, requestedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z",
    status: "complete" as const, results: [{ surfaceResultOrder: 0, url: `https://source-${index}-${order}.example/fact`, title: "Public source", snippet: "Public logistics capability.", displayedHost: `source-${index}-${order}.example` }],
    usage: { requestCount: 1, resultCount: 1, estimatedCostMicros: 1 } }));
  return { snapshotId: `recovery-snapshot-${fanout.questionId}`, cacheIdentity: `recovery-cache-${fanout.questionId}`, questionId: fanout.questionId,
    observedAt: "2030-01-01T00:00:01.000Z", ageMs: 60_000, collectedForThisRun: true, refreshAttempted: false, refreshFailed: false,
    sufficientlyEvidenced: true, availableSourceCount: 3, observations, retrievals: observations.flatMap((observation) => observation.results.map((result) => ({ observationId: observation.observationId,
      queryId: observation.queryId, resultUrl: result.url, retrievalState: "available" as const, publiclyRoutable: true, robotsAllowed: true,
      accessBarrier: "none" as const, contentBytes: 100, normalizedText: "Public logistics capability.", normalizedContentHash: `sha256:${"a".repeat(64)}`, verifiedExcerpt: "Public logistics capability." }))),
    actualCostMicros: 10, allocatedCostMicros: 0, avoidedCostMicros: 0 };
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { checkpointScanJob, failScanJob, getScanJob, resumeScanJobAfterRepair } from "./jobs";
import { PublicSourceRuntimeError, normalizeJobError } from "@/worker/job-errors";
import { recoveryEnvelope } from "@/worker/job-state";
import { createRecoveryCheckpointWriter } from "@/worker/processor";
import { createTestWebsiteFoundation } from "../public-source-forensics/testing";
import { PublicSourceArtifactUnavailableError, runPublicSourceForensicsPipeline, type PublicSourceForensicsDependencies, type PublicSourcePipelineCheckpoint } from "@/worker/public-source-forensics";
import type { PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";

const enabled = Boolean(process.env.DATABASE_URL && process.env.OGC_DEPLOYMENT_PROFILE === "staging");
const describePostgres = enabled ? describe : describe.skip;

describePostgres("schema-v16 recovery checkpoint authority", () => {
  const suffix = randomUUID().replaceAll("-", "");
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

  beforeAll(async () => {
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
  }, 120_000);

  afterAll(async () => {
    const sql = getSqlClient();
    for (const row of rows) await sql`DELETE FROM scan_reports WHERE id=${row.reportId}`;
    await sql`DELETE FROM scan_reports WHERE id=${artifactGate.reportId}`;
    await closeDatabase();
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
});

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

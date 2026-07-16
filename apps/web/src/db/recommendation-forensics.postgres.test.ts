import { createHash, randomUUID } from "node:crypto";
import { createAnswerSnapshotCellId } from "@open-geo-console/answer-engine-observer";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import {
  createAnswerSnapshotRun,
  deleteExpiredCitationSourceContent,
  getAnswerSnapshotBundleForJob,
  saveAnswerSnapshotCellImmutable,
  saveAnswerSnapshotSourcesImmutable,
  saveCitationSourceEvidenceImmutable
} from "./recommendation-forensics";
import {
  compareAndSwapAnswerExecutionCheckpoint,
  getAnswerExecutionCheckpoint
} from "./recommendation-authority";

const enabled = Boolean(process.env.DATABASE_URL && process.env.OGC_DEPLOYMENT_PROFILE === "staging");
const describePostgres = enabled ? describe : describe.skip;

describePostgres("recommendation-forensics PostgreSQL persistence", () => {
  const suffix = randomUUID();
  const reportId = `forensics-report-${suffix}`;
  const jobId = `forensics-job-${suffix}`;
  const runId = `forensics-run-${suffix}`;
  const surface = {
    providerId: "fixture-global-a",
    productId: "fixture-api",
    modelId: "fixture-model",
    collectionSurface: "developer_api" as const,
    locale: "en",
    region: "US",
    certificationState: "candidate_uncertified" as const
  };
  const cell = {
    id: createAnswerSnapshotCellId({ runId, questionId: "q-1", surface }),
    runId,
    questionId: "q-1",
    surface,
    status: "succeeded" as const,
    answerText: "Competitor Example is suitable.",
    executedAt: "2030-01-01T00:00:01.000Z",
    executionDurationMs: 100,
    responseHash: createHash("sha256").update("Competitor Example is suitable.").digest("hex"),
    sources: [],
    recommendationOutcome: "recommendations_present" as const
  };

  beforeAll(async () => {
    await ensureDatabase();
    const sql = getSqlClient();
    await sql`
      INSERT INTO scan_reports (id, url, site_key, report_locale, technical_status)
      VALUES (${reportId}, 'https://customer.example.com', 'example.com', 'en', 'pending')
    `;
    await sql`
      INSERT INTO scan_jobs (id, report_id, tier, product_contract, fulfillment_methodology, recommendation_report_version, locale)
      VALUES (${jobId}, ${reportId}, 'deep', 'recommendation_forensics_v1', 'answer_engine_recommendation_forensics_v1', 1, 'en')
    `;
  }, 60_000);

  afterAll(async () => {
    await getSqlClient()`DELETE FROM scan_reports WHERE id = ${reportId}`;
    await closeDatabase();
  }, 60_000);

  it("persists, orders, expires, and cascades an immutable bundle", async () => {
    await createAnswerSnapshotRun({
      id: runId,
      reportId,
      jobId,
      locale: "en",
      region: "US",
      questionSetVersion: "fixture-v1",
      startedAt: "2030-01-01T00:00:00.000Z"
    });
    const attackSource = { url: "https://attack.example.org/review", title: "Attack review", providerOrder: 0, providerMetadata: {} };
    const attackCell = { ...cell, sources: [attackSource] };
    const duplicatedLedger = {
      runId,
      checkpointRevision: 1,
      providers: {
        [surface.providerId]: { requestCount: 1, estimatedCostMicros: 0, cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } } },
        "foreign-provider": { requestCount: 1, estimatedCostMicros: 0, cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } } }
      }
    };
    await expect(compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 0, executionState: duplicatedLedger, cell: attackCell }))
      .rejects.toThrow(/only one provider|foreign provider/i);
    const attackWrites = await getSqlClient()<Array<{ checkpoints: number; cells: number; sources: number }>>`
      SELECT
        (SELECT count(*)::integer FROM answer_execution_checkpoints WHERE run_id = ${runId}) AS checkpoints,
        (SELECT count(*)::integer FROM answer_snapshot_cells WHERE id = ${cell.id}) AS cells,
        (SELECT count(*)::integer FROM answer_snapshot_sources source JOIN answer_snapshot_cells snapshot ON snapshot.id = source.cell_id WHERE snapshot.id = ${cell.id}) AS sources
    `;
    expect(attackWrites[0]).toEqual({ checkpoints: 0, cells: 0, sources: 0 });
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 0,
      executionState: {
        runId,
        checkpointRevision: 1,
        providers: { [surface.providerId]: { requestCount: 1, estimatedCostMicros: 0, cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } } } }
      },
      cell: { ...attackCell, providerRequestId: "Authorization: Bearer sk-live-postgres" }
    })).rejects.toThrow(/providerRequestId.*sensitive/i);
    const sensitiveWrites = await getSqlClient()<Array<{ checkpoints: number; cells: number; sources: number }>>`
      SELECT
        (SELECT count(*)::integer FROM answer_execution_checkpoints WHERE run_id = ${runId}) AS checkpoints,
        (SELECT count(*)::integer FROM answer_snapshot_cells WHERE id = ${cell.id}) AS cells,
        (SELECT count(*)::integer FROM answer_snapshot_sources source JOIN answer_snapshot_cells snapshot ON snapshot.id = source.cell_id WHERE snapshot.id = ${cell.id}) AS sources
    `;
    expect(sensitiveWrites[0]).toEqual({ checkpoints: 0, cells: 0, sources: 0 });
    await saveAnswerSnapshotCellImmutable(cell);
    await saveAnswerSnapshotCellImmutable(cell);
    const changedAnswer = "Changed";
    await expect(saveAnswerSnapshotCellImmutable({
      ...cell,
      answerText: changedAnswer,
      responseHash: createHash("sha256").update(changedAnswer).digest("hex")
    })).rejects.toThrow("immutability violation");
    const [source] = await saveAnswerSnapshotSourcesImmutable(cell.id, [{
      url: "https://editorial.example.org/review",
      title: "Review",
      providerOrder: 0,
      providerMetadata: {}
    }]);
    await saveCitationSourceEvidenceImmutable({
      id: `evidence-${suffix}`,
      sourceId: source.id,
      category: "earned_editorial",
      retrievalState: "available",
      excerpt: "A bounded verified excerpt.",
      excerptHash: "excerpt-hash",
      contentHash: "content-hash",
      grade: "A",
      retrievedAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-01-02T00:00:00.000Z"
    });
    const before = await getAnswerSnapshotBundleForJob(jobId);
    expect(before?.runs[0]?.cells[0]).toMatchObject({ id: cell.id, status: "succeeded" });
    expect(await deleteExpiredCitationSourceContent(new Date("2030-01-03T00:00:00.000Z"))).toBeGreaterThanOrEqual(1);
    const after = await getAnswerSnapshotBundleForJob(jobId);
    const stored = after?.runs[0]?.cells[0];
    expect(stored?.status).toBe("succeeded");
    if (stored?.status !== "succeeded") throw new Error("Expected successful fixture cell.");
    expect(stored.sources[0]?.evidence).toMatchObject({ excerpt: null, contentHash: "content-hash", retrievalState: "expired", grade: "A" });

    const executionState = {
      runId,
      checkpointRevision: 1,
      providers: {
        [surface.providerId]: {
          requestCount: 1,
          estimatedCostMicros: 0,
          cells: { [cell.id]: { attemptCount: 1, transientAttemptCount: 0 } }
        }
      }
    };
    const checkpointCell = {
      ...cell,
      sources: [{ url: "https://editorial.example.org/review", title: "Review", providerOrder: 0, providerMetadata: {} }]
    };
    await compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 0, executionState, cell: checkpointCell });
    const races = await Promise.allSettled([
      compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 1, executionState: { ...executionState, checkpointRevision: 2 } }),
      compareAndSwapAnswerExecutionCheckpoint({ expectedRevision: 1, executionState: { ...executionState, checkpointRevision: 2 } })
    ]);
    expect(races.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect((await getAnswerExecutionCheckpoint(runId))?.checkpointRevision).toBe(2);
    const checkpointChangedAnswer = "Changed after checkpoint";
    const revisionThree = {
      runId,
      checkpointRevision: 3,
      providers: {
        [surface.providerId]: {
          requestCount: 2,
          estimatedCostMicros: 0,
          cells: { [cell.id]: { attemptCount: 2, transientAttemptCount: 0 } }
        }
      }
    };
    await expect(compareAndSwapAnswerExecutionCheckpoint({
      expectedRevision: 2,
      executionState: revisionThree,
      cell: { ...checkpointCell, answerText: checkpointChangedAnswer, responseHash: createHash("sha256").update(checkpointChangedAnswer).digest("hex") }
    })).rejects.toThrow(/immutability/i);
    expect((await getAnswerExecutionCheckpoint(runId))?.checkpointRevision).toBe(2);

    await getSqlClient()`DELETE FROM scan_reports WHERE id = ${reportId}`;
    expect(await getAnswerSnapshotBundleForJob(jobId)).toBeNull();
    expect(await getAnswerExecutionCheckpoint(runId)).toBeNull();
  }, 60_000);

  it("enforces successful/failed exclusivity at the database boundary", async () => {
    const constraints = await getSqlClient()<Array<{ constraint_name: string }>>`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'answer_snapshot_cells'
    `;
    expect(constraints.map((row) => row.constraint_name)).toContain("answer_snapshot_cells_result_check");
    const privateColumns = await getSqlClient()<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (
        'answer_execution_checkpoints', 'recommendation_certification_authorities',
        'source_classification_authorities', 'recommendation_forensic_reports'
      )
    `;
    expect(new Set(privateColumns.map(({ table_name }) => table_name))).toEqual(new Set([
      "answer_execution_checkpoints", "recommendation_certification_authorities",
      "source_classification_authorities", "recommendation_forensic_reports"
    ]));
  });
});

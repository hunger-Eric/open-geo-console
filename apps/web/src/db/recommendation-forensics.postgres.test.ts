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
      INSERT INTO scan_jobs (id, report_id, tier, locale)
      VALUES (${jobId}, ${reportId}, 'deep', 'en')
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

    await getSqlClient()`DELETE FROM scan_reports WHERE id = ${reportId}`;
    expect(await getAnswerSnapshotBundleForJob(jobId)).toBeNull();
  }, 60_000);

  it("enforces successful/failed exclusivity at the database boundary", async () => {
    const constraints = await getSqlClient()<Array<{ constraint_name: string }>>`
      SELECT constraint_name FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'answer_snapshot_cells'
    `;
    expect(constraints.map((row) => row.constraint_name)).toContain("answer_snapshot_cells_result_check");
  });
});

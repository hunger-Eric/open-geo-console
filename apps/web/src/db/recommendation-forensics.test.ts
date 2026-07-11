import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createAnswerSnapshotCellId } from "@open-geo-console/answer-engine-observer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteGeoReport, createGeoReportShell, getGeoReport } from "./reports";
import { memorySaveScanJob } from "./memory";
import {
  createAnswerSnapshotRun,
  deleteExpiredCitationSourceContent,
  getAnswerSnapshotBundleForJob,
  saveAnswerSnapshotCellImmutable,
  saveAnswerSnapshotSourcesImmutable,
  saveCitationSourceEvidenceImmutable
} from "./recommendation-forensics";

describe("recommendation-forensics memory persistence", () => {
  const originalPath = process.env.OPEN_GEO_DB_PATH;
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
      id: runId,
      reportId,
      jobId,
      locale: "en",
      region: "US",
      questionSetVersion: "fixture-v1",
      startedAt: "2030-01-01T00:00:00.000Z"
    });
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env.OPEN_GEO_DB_PATH;
    else process.env.OPEN_GEO_DB_PATH = originalPath;
  });

  it("stores an immutable successful cell idempotently and rejects changed content", async () => {
    const cell = successCell(runId);
    await expect(saveAnswerSnapshotCellImmutable(cell)).resolves.toMatchObject({ id: cell.id, status: "succeeded" });
    await expect(saveAnswerSnapshotCellImmutable(cell)).resolves.toMatchObject({ id: cell.id, responseHash: cell.responseHash });
    const changedAnswer = "A changed answer";
    await expect(saveAnswerSnapshotCellImmutable({
      ...cell,
      answerText: changedAnswer,
      responseHash: createHash("sha256").update(changedAnswer).digest("hex")
    })).rejects.toThrow("immutability violation");
    await expect(saveAnswerSnapshotCellImmutable({
      ...cell,
      responseHash: createHash("sha256").update("different-response").digest("hex")
    })).rejects.toThrow("does not match");
  });

  it("rejects a missing or cross-report job binding", async () => {
    await expect(createAnswerSnapshotRun({
      id: randomUUID(), reportId, jobId: "missing-job", locale: "en", region: "US",
      questionSetVersion: "fixture-v1", startedAt: "2030-01-01T00:00:00.000Z"
    })).rejects.toThrow("does not belong");
    const otherReportId = randomUUID();
    await createGeoReportShell({ id: otherReportId, url: "https://other.example.org", siteKey: "example.org", reportLocale: "en" });
    const otherJobId = randomUUID();
    memorySaveScanJob(memoryJob(otherJobId, otherReportId));
    await expect(createAnswerSnapshotRun({
      id: randomUUID(), reportId, jobId: otherJobId, locale: "en", region: "US",
      questionSetVersion: "fixture-v1", startedAt: "2030-01-01T00:00:00.000Z"
    })).rejects.toThrow("does not belong");
  });

  it("keeps successful and failed cells mutually exclusive", async () => {
    await expect(saveAnswerSnapshotCellImmutable({
      ...successCell(runId),
      id: "invalid-success",
      status: "succeeded",
      errorClass: "timeout"
    } as never)).rejects.toThrow("successful snapshot cell");

    await expect(saveAnswerSnapshotCellImmutable({
      ...failedCell(runId),
      answerText: "fabricated"
    } as never)).rejects.toThrow("failed snapshot cell");
    await expect(saveAnswerSnapshotCellImmutable(failedCell(runId))).resolves.toMatchObject({ status: "failed", errorClass: "timeout" });
  });

  it("stores sources in stable order and rejects order or URL conflicts", async () => {
    const cell = successCell(runId);
    await saveAnswerSnapshotCellImmutable(cell);
    const sources = [
      { url: "https://editorial.example.org/review", title: "Review", providerOrder: 1, providerMetadata: {} },
      { url: "https://competitor.example.com/product", title: "Product", providerOrder: 0, providerMetadata: {} }
    ];
    await saveAnswerSnapshotSourcesImmutable(cell.id, sources);
    await expect(saveAnswerSnapshotSourcesImmutable(cell.id, sources)).resolves.toHaveLength(2);
    await expect(saveAnswerSnapshotSourcesImmutable(cell.id, [{ ...sources[0], providerOrder: 0 }])).rejects.toThrow("source identity conflict");
    const bundle = await getAnswerSnapshotBundleForJob(jobId);
    const stored = bundle?.runs[0]?.cells[0];
    expect(stored?.status).toBe("succeeded");
    if (stored?.status !== "succeeded") throw new Error("Expected successful fixture cell.");
    expect(stored.sources.map((source) => source.providerOrder)).toEqual([0, 1]);
  });

  it("expires bounded excerpts while retaining audit metadata", async () => {
    const cell = successCell(runId);
    await saveAnswerSnapshotCellImmutable(cell);
    const [source] = await saveAnswerSnapshotSourcesImmutable(cell.id, [{
      url: "https://editorial.example.org/review",
      title: "Review",
      providerOrder: 0,
      providerMetadata: {}
    }]);
    const evidence = {
      id: "evidence-1",
      sourceId: source.id,
      category: "earned_editorial" as const,
      retrievalState: "available" as const,
      excerpt: "A short verified excerpt.",
      excerptHash: "excerpt-hash",
      contentHash: "content-hash",
      grade: "A" as const,
      retrievedAt: new Date("2030-01-01T00:00:00.000Z"),
      expiresAt: new Date("2030-01-02T00:00:00.000Z")
    };
    await saveCitationSourceEvidenceImmutable(evidence);
    await expect(saveCitationSourceEvidenceImmutable(evidence)).resolves.toMatchObject({ id: evidence.id });
    await expect(saveCitationSourceEvidenceImmutable({ ...evidence, excerpt: "mutated" })).rejects.toThrow("immutability violation");
    await deleteExpiredCitationSourceContent(new Date("2030-01-03T00:00:00.000Z"));
    const bundle = await getAnswerSnapshotBundleForJob(jobId);
    const stored = bundle?.runs[0]?.cells[0];
    expect(stored?.status).toBe("succeeded");
    if (stored?.status !== "succeeded") throw new Error("Expected successful fixture cell.");
    expect(stored.sources[0]?.evidence).toMatchObject({
      excerpt: null,
      excerptHash: "excerpt-hash",
      contentHash: "content-hash",
      grade: "A",
      retrievalState: "expired"
    });
  });

  it("allows inaccessible evidence without content and cascades report deletion", async () => {
    const cell = successCell(runId);
    await saveAnswerSnapshotCellImmutable(cell);
    const [source] = await saveAnswerSnapshotSourcesImmutable(cell.id, [{
      url: "https://unavailable.example.org/source",
      title: "Unavailable",
      providerOrder: 0,
      providerMetadata: {}
    }]);
    await expect(saveCitationSourceEvidenceImmutable({
      id: "unavailable-evidence",
      sourceId: source.id,
      category: "unknown",
      retrievalState: "inaccessible",
      excerpt: null,
      excerptHash: null,
      contentHash: null,
      grade: "D",
      retrievedAt: new Date("2030-01-01T00:00:00.000Z"),
      expiresAt: new Date("2030-01-02T00:00:00.000Z")
    })).resolves.toMatchObject({ retrievalState: "inaccessible" });
    const publicReport = await getGeoReport(reportId);
    expect(publicReport).not.toHaveProperty("answerSnapshotRuns");
    expect(publicReport).not.toHaveProperty("citationSourceEvidence");
    await deleteGeoReport(reportId);
    await expect(getAnswerSnapshotBundleForJob(jobId)).resolves.toBeNull();
  });
});

function successCell(runId: string) {
  const surface = {
    providerId: "fixture-global-a",
    productId: "fixture-api",
    modelId: "fixture-model",
    collectionSurface: "developer_api" as const,
    locale: "en",
    region: "US",
    certificationState: "candidate_uncertified" as const
  };
  return {
    id: createAnswerSnapshotCellId({ runId, questionId: "q-1", surface }),
    runId,
    questionId: "q-1",
    surface,
    status: "succeeded" as const,
    answerText: "Competitor Example is a suitable choice.",
    executedAt: "2030-01-01T00:00:01.000Z",
    executionDurationMs: 250,
    responseHash: createHash("sha256").update("Competitor Example is a suitable choice.").digest("hex"),
    sources: [],
    recommendationOutcome: "recommendations_present" as const,
    providerRequestId: "request-1",
    usage: { inputTokens: 10, outputTokens: 20 }
  };
}

function memoryJob(id: string, reportId: string) {
  const now = new Date("2030-01-01T00:00:00.000Z");
  return {
    id, reportId, tier: "deep" as const, locale: "en" as const, reason: "standard" as const,
    stage: "queued" as const, progress: 0, checkpoint: {}, plannedPages: 0,
    successfulPages: 0, failedPages: 0, attempts: 0, maxAttempts: 3,
    leaseOwner: null, leaseExpiresAt: null, errorCode: null, publicError: null,
    creditReservationId: null, createdAt: now, updatedAt: now
  };
}

function failedCell(runId: string) {
  const surface = {
    providerId: "fixture-global-b",
    productId: "fixture-api",
    modelId: "fixture-model",
    collectionSurface: "developer_api" as const,
    locale: "en",
    region: "US",
    certificationState: "candidate_uncertified" as const
  };
  return {
    id: createAnswerSnapshotCellId({ runId, questionId: "q-2", surface }),
    runId,
    questionId: "q-2",
    surface,
    status: "failed" as const,
    executedAt: "2030-01-01T00:00:02.000Z",
    executionDurationMs: 1000,
    errorClass: "timeout" as const,
    sanitizedError: "provider_timeout"
  };
}

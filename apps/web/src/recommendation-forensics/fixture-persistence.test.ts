import { createHash, randomUUID } from "node:crypto";
import {
  createAnswerResponseHash,
  parseAnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";
import { answerObserverFixture } from "@open-geo-console/answer-engine-observer/testing";
import type { CitationSourceCategory } from "@open-geo-console/citation-intelligence";
import { citationIntelligenceFixture } from "@open-geo-console/citation-intelligence/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memorySaveScanJob } from "@/db/memory";
import {
  createAnswerSnapshotRun,
  deleteExpiredCitationSourceContent,
  getAnswerSnapshotBundleForJob,
  saveAnswerSnapshotCellImmutable,
  saveAnswerSnapshotSourcesImmutable,
  saveCitationSourceEvidenceImmutable
} from "@/db/recommendation-forensics";
import { createGeoReportShell } from "@/db/reports";

describe("recommendation-forensics fixture persistence", () => {
  const originalPath = process.env.OPEN_GEO_DB_PATH;

  beforeEach(async () => {
    process.env.OPEN_GEO_DB_PATH = `memory://${randomUUID()}`;
    await createGeoReportShell({
      id: answerObserverFixture.run.reportId,
      url: answerObserverFixture.organizations.customer.siteUrl,
      siteKey: "example.com",
      reportLocale: "en"
    });
    memorySaveScanJob(memoryJob(answerObserverFixture.run.jobId, answerObserverFixture.run.reportId));
  });

  afterEach(() => {
    if (originalPath === undefined) delete process.env.OPEN_GEO_DB_PATH;
    else process.env.OPEN_GEO_DB_PATH = originalPath;
  });

  it("round-trips the complete deterministic fixture without enabling runtime orchestration", async () => {
    await persistFixture();
    await persistFixture();

    const bundle = await getAnswerSnapshotBundleForJob(answerObserverFixture.run.jobId);
    expect(bundle?.jobId).toBe(answerObserverFixture.run.jobId);
    expect(bundle?.runs).toHaveLength(1);
    expect(bundle?.runs[0]?.run).toEqual(answerObserverFixture.run);
    expect(bundle?.runs[0]?.cells).toHaveLength(answerObserverFixture.cells.length);

    const storedCells = bundle?.runs[0]?.cells ?? [];
    for (const cell of storedCells) expect(() => parseAnswerSnapshotCell(cell)).not.toThrow();

    const storedGrades = storedCells
      .flatMap((cell) => cell.status === "succeeded" ? cell.sources : [])
      .flatMap((source) => source.evidence ? [source.evidence.grade] : [])
      .sort();
    expect(storedGrades).toEqual(citationIntelligenceFixture.evidence.map(({ grade }) => grade).sort());

    const successful = answerObserverFixture.cells.find((cell) => cell.status === "succeeded");
    if (!successful || successful.status !== "succeeded") throw new Error("The fixture requires a successful cell.");
    const changedAnswer = `${successful.answerText} Changed.`;
    await expect(saveAnswerSnapshotCellImmutable({
      ...successful,
      answerText: changedAnswer,
      responseHash: createAnswerResponseHash(changedAnswer)
    })).rejects.toThrow(/immutability violation/i);

    const expired = await deleteExpiredCitationSourceContent(new Date("2031-01-01T00:00:00.000Z"));
    expect(expired).toBe(citationIntelligenceFixture.evidence.filter(({ retrievalState }) => retrievalState === "available").length);
    const afterExpiry = await getAnswerSnapshotBundleForJob(answerObserverFixture.run.jobId);
    const expiredEvidence = (afterExpiry?.runs[0]?.cells ?? [])
      .flatMap((cell) => cell.status === "succeeded" ? cell.sources : [])
      .flatMap((source) => source.evidence?.retrievalState === "expired" ? [source.evidence] : []);
    expect(expiredEvidence).toHaveLength(expired);
    expect(expiredEvidence.every(({ excerpt, excerptHash, contentHash }) => !excerpt && Boolean(excerptHash) && Boolean(contentHash))).toBe(true);
  });
});

async function persistFixture(): Promise<void> {
  await createAnswerSnapshotRun(answerObserverFixture.run);
  const sourceIds = new Map<string, string>();

  for (const cell of answerObserverFixture.cells) {
    await saveAnswerSnapshotCellImmutable(cell);
    if (cell.status !== "succeeded") continue;
    const storedSources = await saveAnswerSnapshotSourcesImmutable(cell.id, cell.sources);
    for (const source of storedSources) sourceIds.set(sourceKey(cell.id, source.url), source.id);
  }

  const categories = new Map(
    citationIntelligenceFixture.sourceCategories.map(({ url, category }) => [url, category] as const)
  );
  const evidenceKeys = new Set<string>();
  for (const evidence of citationIntelligenceFixture.evidence) {
    if (!evidence.sourceUrl) throw new Error(`Fixture evidence ${evidence.evidenceId} requires a source URL.`);
    const key = sourceKey(evidence.cellId, evidence.sourceUrl);
    if (evidenceKeys.has(key)) throw new Error(`Fixture evidence must be unique per source: ${key}`);
    evidenceKeys.add(key);
    const sourceId = sourceIds.get(key);
    if (!sourceId) throw new Error(`Fixture evidence source is not present on its cell: ${key}`);
    const available = evidence.retrievalState === "available";
    const excerpt = available
      ? evidence.verifiedExcerpt ?? `Repeated ${evidence.repeatedPattern?.kind ?? "source"} pattern: ${evidence.repeatedPattern?.value ?? evidence.sourceUrl}`
      : null;
    await saveCitationSourceEvidenceImmutable({
      id: evidence.evidenceId,
      sourceId,
      category: categories.get(evidence.sourceUrl) ?? inferCategory(evidence.sourceUrl),
      retrievalState: available ? "available" : evidence.retrievalState,
      excerpt,
      excerptHash: excerpt ? sha256(excerpt) : null,
      contentHash: excerpt ? sha256(`${evidence.sourceUrl}\0${excerpt}`) : null,
      grade: evidence.grade,
      retrievedAt: "2030-01-01T00:00:00.000Z",
      expiresAt: "2030-07-12T00:00:00.000Z"
    });
  }
}

function sourceKey(cellId: string, url: string): string {
  return `${cellId}\0${url}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function inferCategory(url: string): CitationSourceCategory {
  const hostname = new URL(url).hostname;
  if (hostname.endsWith("example.org")) return "owned_competitor";
  if (hostname.endsWith("example.com")) return "earned_editorial";
  return "unknown";
}

function memoryJob(id: string, reportId: string) {
  const now = new Date("2030-01-01T00:00:00.000Z");
  return {
    id,
    reportId,
    tier: "deep" as const,
    productContract: "recommendation_forensics_v1" as const,
    fulfillmentMethodology: "answer_engine_recommendation_forensics_v1" as const,
    recommendationReportVersion: 1 as const,
    locale: "en" as const,
    reason: "standard" as const,
    stage: "queued" as const,
    progress: 0,
    checkpoint: {},
    plannedPages: 0,
    successfulPages: 0,
    failedPages: 0,
    attempts: 0,
    maxAttempts: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    errorCode: null,
    publicError: null,
    creditReservationId: null,
    createdAt: now,
    updatedAt: now
  };
}

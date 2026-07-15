import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendPublicSourceRetrievalAttempt,
  getQuestionAcquisitionCheckpoint,
  listPublicSourceRetrievalAttempts,
  saveQuestionAcquisitionCheckpoint,
  resetPublicSourceAcquisitionMemoryForTests
} from "./public-source-acquisition";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("public source acquisition repository", () => {
  beforeEach(() => resetPublicSourceAcquisitionMemoryForTests());

  it("appends immutable typed retrieval attempts", async () => {
    const attempt = {
      id: "attempt-1", reportId: "report-1", jobId: "job-1", questionId: "question-1", snapshotId: "snapshot-1", observationId: "observation-1",
      canonicalUrl: "https://example.com/page", registrableDomain: "example.com", method: "http" as const, attemptOrder: 0,
      stage: "robots_evaluation" as const, outcome: "robots_unavailable" as const, durationMs: 25, retryEligible: true, browserEligible: false,
      startedAt: new Date("2030-01-01T00:00:00Z"), completedAt: new Date("2030-01-01T00:00:00.025Z")
    };
    await appendPublicSourceRetrievalAttempt(attempt);
    await expect(appendPublicSourceRetrievalAttempt({ ...attempt, outcome: "robots_denied" })).rejects.toThrow(/immutable/i);
    expect(await listPublicSourceRetrievalAttempts({ jobId: "job-1", questionId: "question-1" })).toHaveLength(1);
  });

  it("advances checkpoints monotonically and never reopens terminal collection", async () => {
    const first = {
      identityHash: hash("identity"), reportId: "report-1", jobId: "job-1", questionId: "question-1", snapshotId: "snapshot-1", candidatePoolHash: hash("pool"), state: "collecting" as const,
      plannedCandidates: 2, attemptedCandidates: 1, remainingCandidates: 1, returnedObservations: 3, extractedDocuments: 0, eligibleEvidenceIds: [], independentDomains: [], queryRewritesUsed: 0, httpBudgetUsed: 1, browserBudgetUsed: 0, revision: 1
    };
    await saveQuestionAcquisitionCheckpoint(first);
    await saveQuestionAcquisitionCheckpoint({ ...first, state: "exhausted", attemptedCandidates: 2, remainingCandidates: 0, httpBudgetUsed: 2, revision: 2 });
    await expect(saveQuestionAcquisitionCheckpoint({ ...first, revision: 3 })).rejects.toThrow(/terminal/i);
    expect((await getQuestionAcquisitionCheckpoint({ jobId: "job-1", questionId: "question-1" }))?.state).toBe("exhausted");
  });
});

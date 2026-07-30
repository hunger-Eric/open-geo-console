import { describe, expect, it } from "vitest";
import { buildFreeV4SemanticReviewManifest } from "./report-semantic-review-manifests";
import {
  hashReportSemanticReviewValue,
  listFreeV4SemanticReviewBatches,
  reportSemanticTextHash,
  type FreeV4SemanticReviewBatchId,
  type ReportSemanticReviewInput
} from "./report-semantic-review";
import {
  runOfflineReportSemanticReview,
  runOfflineReportSemanticReviewBatched,
  type FreeV4SemanticReviewBatchEvidence
} from "./report-semantic-review-provider-adapter";

describe("offline semantic review adapter", () => {
  it("uses only the injected mock invoker and applies its verified response", async () => {
    const input = buildFreeV4SemanticReviewManifest({ locale: "zh-CN", target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["Target"] }, expectedModel: { providerId: "mock", modelId: "model" }, questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: questionId, originalTextHash: reportSemanticTextHash(questionId) })), sources: [], evidence: [], observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1", originalText: "Target", originalTextHash: reportSemanticTextHash("Target") }], answerSubjects: [{ questionId: "q1", fieldPath: "answer" }], fields: [{ path: "answer", text: "answer", mutability: "mutable", questionId: "q1", allowedEvidenceIds: [], allowedSourceIds: [] }], nonProseProjectionHash: hashReportSemanticReviewValue({ id: 1 }) });
    const result = await runOfflineReportSemanticReview(input, async ({ input }) => ({ version: "report-semantic-review-v1", inputHash: input.inputHash, providerId: "mock", modelId: "model", fields: input.fields.map((field) => ({ path: field.path, originalTextHash: field.originalTextHash, decision: "pass", issueCodes: [], reason: "ok", evidenceIds: [], sourceIds: [], retainedOriginalTerms: [] })), questionDistinctness: { decision: "distinct", duplicateGroups: [], reason: "different" }, annotations: { observationResults: [{ observationId: "o1", resultId: "r1", targetPresence: "ambiguous", competitorPresence: "ambiguous", reason: "uncertain" }], answers: input.answerSubjects.map((subject) => ({ questionId: subject.questionId, relevance: "responsive", entityRole: "none", evidenceIds: [], sourceIds: [], reason: "ok" })), evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: [], sourceIds: [], reason: "ok" })) }, overallDecision: "pass" }));
    expect(result.applied.receipt.decision).toBe("pass");
    expect(result.review.annotations.observationResults[0]?.targetPresence).toBe("ambiguous");
    expect(result.applied.annotations.observationResults).toHaveLength(1);
  });
});

describe("offline batched semantic review per-batch evidence", () => {
  function batchedInput(): ReportSemanticReviewInput {
    return buildFreeV4SemanticReviewManifest({
      locale: "zh-CN",
      target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["Target"] },
      expectedModel: { providerId: "mock", modelId: "model" },
      questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: `SENTINEL question prose ${questionId}`, originalTextHash: reportSemanticTextHash(`SENTINEL question prose ${questionId}`) })),
      sources: [],
      evidence: [],
      observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1", originalText: "SENTINEL observation prose", originalTextHash: reportSemanticTextHash("SENTINEL observation prose") }],
      answerSubjects: [{ questionId: "q1", fieldPath: "answer" }],
      fields: [{ path: "answer", text: "SENTINEL answer prose", mutability: "mutable", questionId: "q1", allowedEvidenceIds: [], allowedSourceIds: [] }],
      nonProseProjectionHash: hashReportSemanticReviewValue({ id: 1 })
    });
  }

  function batchPayloads(input: ReportSemanticReviewInput): Record<FreeV4SemanticReviewBatchId, unknown> {
    const fieldRow = (field: ReportSemanticReviewInput["fields"][number]) => ({
      path: field.path,
      originalTextHash: field.originalTextHash,
      decision: "pass",
      issueCodes: [],
      reason: "ok",
      evidenceIds: [...field.allowedEvidenceIds],
      sourceIds: [...field.allowedSourceIds],
      retainedOriginalTerms: []
    });
    return {
      B_fields_readonly: { fields: input.fields.filter((field) => field.mutability === "read_only").map(fieldRow) },
      B_fields_mutable: { fields: input.fields.filter((field) => field.mutability === "mutable").map(fieldRow) },
      B_obs: { observationResults: input.observationResults.map((row) => ({ observationId: row.observationId, resultId: row.resultId, targetPresence: "present", competitorPresence: "absent", reason: "ok" })) },
      B_answers: { answers: input.answerSubjects.map((subject) => ({ questionId: subject.questionId, relevance: "responsive", entityRole: "target", targetPresence: "present", targetFirstSentence: 1, targetRoles: ["answer subject"], competitorEntityIds: [], evidenceIds: [], sourceIds: [], reason: "ok" })) },
      B_evidence_use: { evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: [...field.allowedEvidenceIds], sourceIds: [...field.allowedSourceIds], reason: "ok" })) }
    };
  }

  it("invokes batches in manifest order, returns batchIds, merges identically, and emits one evidence entry per batch", async () => {
    const input = batchedInput();
    const payloads = batchPayloads(input);
    const invoked: FreeV4SemanticReviewBatchId[] = [];
    const evidence: FreeV4SemanticReviewBatchEvidence[] = [];
    const result = await runOfflineReportSemanticReviewBatched(input, async ({ batchId }) => {
      invoked.push(batchId);
      return payloads[batchId];
    }, undefined, { onBatchEvidence: (entry) => evidence.push(entry) });
    const expected = listFreeV4SemanticReviewBatches(input);
    expect(invoked).toEqual([...expected]);
    expect(result.batchIds).toEqual(expected);
    expect(result.review.fields).toHaveLength(input.fields.length);
    expect(result.applied.receipt.decision).toBe("pass");
    expect(evidence.map((entry) => entry.batchId)).toEqual([...expected]);
    for (const entry of evidence) {
      expect(entry.errorClass).toBeNull();
      expect(entry.requestSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(entry.requestBytes).toBeGreaterThan(0);
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.responseRowCount).toBeGreaterThanOrEqual(0);
    }
    expect(evidence.find((entry) => entry.batchId === "B_answers")?.responseIdentities).toEqual(["q1"]);
    expect(evidence.find((entry) => entry.batchId === "B_obs")?.responseIdentities).toEqual(["o1/r1"]);
    expect(evidence.find((entry) => entry.batchId === "B_answers")?.inputIdentities).toEqual(["q1@answer"]);
    expect(evidence.find((entry) => entry.batchId === "B_obs")?.inputIdentities).toEqual(["o1/r1"]);
  });

  it("attributes a transport failure to the failing batch and records nothing for later batches", async () => {
    const input = batchedInput();
    const payloads = batchPayloads(input);
    const failure = Object.assign(new Error("provider exploded"), { code: "ETEST" });
    const evidence: FreeV4SemanticReviewBatchEvidence[] = [];
    await expect(runOfflineReportSemanticReviewBatched(input, async ({ batchId }) => {
      if (batchId === "B_answers") throw failure;
      return payloads[batchId];
    }, undefined, { onBatchEvidence: (entry) => evidence.push(entry) })).rejects.toBe(failure);
    const batches = listFreeV4SemanticReviewBatches(input);
    const failedIndex = batches.indexOf("B_answers");
    expect(evidence.map((entry) => entry.batchId)).toEqual([...batches.slice(0, failedIndex + 1)]);
    expect(evidence.slice(0, failedIndex).every((entry) => entry.errorClass === null)).toBe(true);
    const failed = evidence[failedIndex]!;
    expect(failed.errorClass).toBe("Error:ETEST");
    expect(failed.responseRowCount).toBeNull();
    expect(failed.responseIdentities).toBeNull();
  });

  it("keeps evidence redacted to ids, hashes, counts and timings", async () => {
    const input = batchedInput();
    const evidence: FreeV4SemanticReviewBatchEvidence[] = [];
    await runOfflineReportSemanticReviewBatched(input, async ({ batchId }) => batchPayloads(input)[batchId], undefined, {
      onBatchEvidence: (entry) => evidence.push(entry)
    });
    const declaredKeys = ["batchId", "durationMs", "errorClass", "inputIdentities", "requestBytes", "requestSha256", "responseIdentities", "responseRowCount"];
    for (const entry of evidence) {
      expect(Object.keys(entry).sort()).toEqual(declaredKeys);
      const serialized = JSON.stringify(entry);
      expect(serialized).not.toContain("Bearer");
      expect(serialized).not.toContain("SENTINEL");
      for (const field of input.fields) expect(serialized).not.toContain(field.originalText);
      for (const row of input.observationResults) expect(serialized).not.toContain(row.originalText);
    }
  });

  it("strips an extra top-level envelope key so a benign model habit never kills the run (C3)", async () => {
    const input = batchedInput();
    const payloads = batchPayloads(input);
    const evidence: FreeV4SemanticReviewBatchEvidence[] = [];
    const result = await runOfflineReportSemanticReviewBatched(input, async ({ batchId }) =>
      batchId === "B_answers" ? { ...(payloads.B_answers as Record<string, unknown>), modelNote: "echoed envelope key" } : payloads[batchId],
    undefined, { onBatchEvidence: (entry) => evidence.push(entry) });
    // C3 contract: keys outside the declared batch envelope are ignored; only
    // the declared array key is read, so the run succeeds exactly as with a
    // clean envelope and no evidence entry carries an errorClass.
    expect(result.review.fields).toHaveLength(input.fields.length);
    expect(evidence).toHaveLength(listFreeV4SemanticReviewBatches(input).length);
    expect(evidence.every((entry) => entry.errorClass === null)).toBe(true);
  });

  it("ignores a throwing evidence sink so evidence never breaks the review", async () => {
    const input = batchedInput();
    const result = await runOfflineReportSemanticReviewBatched(input, async ({ batchId }) => batchPayloads(input)[batchId], undefined, {
      onBatchEvidence: () => {
        throw new Error("sink exploded");
      }
    });
    expect(result.review.fields).toHaveLength(input.fields.length);
  });
});

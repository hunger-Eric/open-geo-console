import { describe, expect, it } from "vitest";
import { buildFreeV4SemanticReviewManifest } from "./report-semantic-review-manifests";
import { hashReportSemanticReviewValue, reportSemanticTextHash } from "./report-semantic-review";
import { runOfflineReportSemanticReview } from "./report-semantic-review-provider-adapter";

describe("offline semantic review adapter", () => {
  it("uses only the injected mock invoker and applies its verified response", async () => {
    const input = buildFreeV4SemanticReviewManifest({ locale: "zh-CN", target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["Target"] }, expectedModel: { providerId: "mock", modelId: "model" }, questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: questionId, originalTextHash: reportSemanticTextHash(questionId) })), sources: [], evidence: [], observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1", originalText: "Target", originalTextHash: reportSemanticTextHash("Target") }], answerSubjects: [{ questionId: "q1", fieldPath: "answer" }], fields: [{ path: "answer", text: "answer", mutability: "mutable", questionId: "q1", allowedEvidenceIds: [], allowedSourceIds: [] }], nonProseProjectionHash: hashReportSemanticReviewValue({ id: 1 }) });
    const result = await runOfflineReportSemanticReview(input, async ({ input }) => ({ version: "report-semantic-review-v1", inputHash: input.inputHash, providerId: "mock", modelId: "model", fields: input.fields.map((field) => ({ path: field.path, originalTextHash: field.originalTextHash, decision: "pass", issueCodes: [], reason: "ok", evidenceIds: [], sourceIds: [], retainedOriginalTerms: [] })), questionDistinctness: { decision: "distinct", duplicateGroups: [], reason: "different" }, annotations: { observationResults: [{ observationId: "o1", resultId: "r1", targetPresence: "ambiguous", competitorPresence: "ambiguous", reason: "uncertain" }], answers: input.answerSubjects.map((subject) => ({ questionId: subject.questionId, relevance: "responsive", entityRole: "none", evidenceIds: [], sourceIds: [], reason: "ok" })), evidenceUse: input.fields.map((field) => ({ path: field.path, evidenceIds: [], sourceIds: [], reason: "ok" })) }, overallDecision: "pass" }));
    expect(result.applied.receipt.decision).toBe("pass");
    expect(result.review.annotations.observationResults[0]?.targetPresence).toBe("ambiguous");
    expect(result.applied.annotations.observationResults).toHaveLength(1);
  });
});

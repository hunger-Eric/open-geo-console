import { describe, expect, it } from "vitest";
import { buildFreeV4SemanticReviewManifest, buildPaidV3SemanticReviewManifest } from "./report-semantic-review-manifests";
import { hashReportSemanticReviewValue, reportSemanticTextHash } from "./report-semantic-review";

const seed = () => ({
  locale: "zh-CN", target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["target.example", "Target Organization", "Target Legal Entity", "Target Brand"] }, expectedModel: { providerId: "mock", modelId: "model" },
  questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: questionId, originalTextHash: reportSemanticTextHash(questionId) })),
  sources: [], evidence: [], observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1", originalText: "Target", originalTextHash: reportSemanticTextHash("Target") }], entities: [], answerSubjects: [{ questionId: "q1", fieldPath: "answer" }],
  fields: [{ path: "answer", text: "Target term remains untouched", mutability: "mutable" as const, questionId: "q1", allowedEvidenceIds: [], allowedSourceIds: [] }],
  nonProseProjectionHash: hashReportSemanticReviewValue({ id: 1 })
});

describe("semantic review manifests", () => {
  it("builds pure Free and Paid manifests from caller-shaped values", () => {
    const free = buildFreeV4SemanticReviewManifest(seed());
    const paid = buildPaidV3SemanticReviewManifest(seed());
    expect(free.lifecycle).toBe("free_v4");
    expect(free.fields[0]?.originalText).toBe("Target term remains untouched");
    expect(paid.lifecycle).toBe("paid_v3");
    expect(free.answerSubjects).toEqual([{ questionId: "q1", fieldPath: "answer" }]);
    expect(free.target.aliases).toEqual(["target.example", "Target Organization", "Target Legal Entity", "Target Brand"]);
  });
});

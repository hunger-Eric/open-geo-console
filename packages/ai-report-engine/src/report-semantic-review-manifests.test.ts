import { describe, expect, it } from "vitest";
import { buildFreeV4SemanticReviewManifest, buildPaidV3SemanticReviewManifest } from "./report-semantic-review-manifests";
import { hashReportSemanticReviewValue, reportSemanticTextHash } from "./report-semantic-review";

const seed = (lifecycle: "free_v4" | "paid_v3") => ({
  lifecycle, locale: "zh-CN", target: { siteKey: "target", targetUrl: "https://target.example/", aliases: ["Target"] }, expectedModel: { providerId: "mock", modelId: "model" },
  questions: ["q1", "q2", "q3"].map((questionId) => ({ questionId, originalText: questionId, originalTextHash: reportSemanticTextHash(questionId) })),
  sources: [], evidence: [], observationResults: [{ observationId: "o1", resultId: "r1", questionId: "q1" }],
  fields: [{ path: "answer", text: "Target term remains untouched", mutability: "mutable" as const, questionId: "q1", allowedEvidenceIds: [], allowedSourceIds: [] }],
  nonProseProjectionHash: hashReportSemanticReviewValue({ id: lifecycle })
});

describe("semantic review manifests", () => {
  it("builds pure Free and Paid manifests from caller-shaped values", () => {
    const free = buildFreeV4SemanticReviewManifest(seed("free_v4"));
    const paid = buildPaidV3SemanticReviewManifest(seed("paid_v3"));
    expect(free.fields[0]?.originalText).toBe("Target term remains untouched");
    expect(paid.lifecycle).toBe("paid_v3");
  });
});

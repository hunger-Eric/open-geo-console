import { REPORT_SEMANTIC_REVIEW_CONTRACT } from "@open-geo-console/ai-report-engine";
import { describe, expect, it } from "vitest";
import {
  assertSemanticReviewCarrierEquals,
  assertSemanticReviewCarrierUpdate,
  createSemanticReviewInitialCheckpoint,
  readSemanticReviewContractVersion,
  resolvePaidV3SemanticReviewContract
} from "./report-semantic-review-activation";

describe("semantic-review checkpoint carrier", () => {
  it("creates only absent or exact V1 initial authorities", () => {
    expect(createSemanticReviewInitialCheckpoint()).toEqual({});
    expect(createSemanticReviewInitialCheckpoint(REPORT_SEMANTIC_REVIEW_CONTRACT)).toEqual({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    });
    expect(readSemanticReviewContractVersion({})).toBeNull();
    expect(readSemanticReviewContractVersion({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
    })).toBe(REPORT_SEMANTIC_REVIEW_CONTRACT);
  });

  it.each([null, "", "report-semantic-review-v2", 1, {}, []])(
    "rejects invalid root carrier value %j",
    (semanticReviewContractVersion) => {
      expect(() => readSemanticReviewContractVersion({ semanticReviewContractVersion })).toThrow(/must equal/i);
    }
  );

  it("rejects a nested carrier even when the root is absent or valid", () => {
    expect(() => readSemanticReviewContractVersion({
      freeTeaser: { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    })).toThrow(/root/i);
    expect(() => readSemanticReviewContractVersion({
      semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
      freeTeaser: { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT }
    })).toThrow(/root/i);
  });

  it("allows omission or exact preservation but rejects late add, removal, and change", () => {
    const active = { semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT };
    expect(() => assertSemanticReviewCarrierUpdate({}, { stage: "planning" })).not.toThrow();
    expect(() => assertSemanticReviewCarrierUpdate(active, { stage: "planning" })).not.toThrow();
    expect(() => assertSemanticReviewCarrierUpdate(active, active)).not.toThrow();
    expect(() => assertSemanticReviewCarrierUpdate({}, active)).toThrow(/immutable/i);
    expect(() => assertSemanticReviewCarrierUpdate(active, { semanticReviewContractVersion: null })).toThrow();
    expect(() => assertSemanticReviewCarrierEquals(active, null)).toThrow(/authority/i);
  });

  it("resolves a marker only from an exact terminal ready Free-to-Paid lineage", () => {
    const checkpoint = readyCheckpoint();
    expect(resolvePaidV3SemanticReviewContract({
      checkpoint,
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toBe(REPORT_SEMANTIC_REVIEW_CONTRACT);
    expect(resolvePaidV3SemanticReviewContract({
      checkpoint: { freeTeaser: checkpoint.freeTeaser },
      stage: "synthesizing",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    })).toBeNull();
  });

  it.each([
    ["nonterminal job", { stage: "synthesizing" }],
    ["wrong report", { reportId: "report-other" }],
    ["wrong question set", { questionSetId: "questions-other" }],
    ["wrong question identity", { questionSetIdentity: "b".repeat(64) }]
  ])("blocks marker-bearing %s", (_label, overrides) => {
    expect(() => resolvePaidV3SemanticReviewContract({
      checkpoint: readyCheckpoint(),
      stage: "completed",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64),
      ...overrides
    } as Parameters<typeof resolvePaidV3SemanticReviewContract>[0])).toThrow(/terminal|lineage/i);
  });
});

function readyCheckpoint() {
  return {
    semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT,
    freeTeaser: {
      version: "free-teaser-checkpoint-v1",
      stage: "ready",
      reportId: "report-1",
      questionSetId: "questions-1",
      questionSetIdentity: "a".repeat(64)
    }
  };
}

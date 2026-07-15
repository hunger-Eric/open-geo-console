import { describe, expect, it } from "vitest";
import {
  PUBLIC_DOCUMENT_OUTCOMES,
  PUBLIC_DOCUMENT_STAGES,
  QUESTION_COLLECTION_STATES,
  isTerminalQuestionCollectionState,
  type PublicDocumentAttemptResult
} from "./public-document";

describe("public document acquisition contract", () => {
  it("keeps retrieval stages and outcomes separate", () => {
    const result: PublicDocumentAttemptResult = {
      method: "http",
      stage: "robots_evaluation",
      outcome: "robots_unavailable",
      canonicalUrl: "https://example.com/page",
      registrableDomain: "example.com",
      durationMs: 10,
      retryEligible: true,
      browserEligible: false
    };
    expect(result.stage).not.toBe("terminal");
    expect(result.outcome).toBe("robots_unavailable");
  });

  it("freezes the bounded vocabulary used by persistence", () => {
    expect(PUBLIC_DOCUMENT_STAGES).toContain("evidence_classification");
    expect(PUBLIC_DOCUMENT_OUTCOMES).toContain("irrelevant_to_question");
    expect(PUBLIC_DOCUMENT_OUTCOMES.includes("collection_failed" as never)).toBe(false);
    expect(QUESTION_COLLECTION_STATES).toEqual([
      "collecting", "evidence_target_met", "exhausted", "collection_failed"
    ]);
  });

  it("treats collection failure as terminal execution state", () => {
    expect(isTerminalQuestionCollectionState("collection_failed")).toBe(true);
    expect(isTerminalQuestionCollectionState("exhausted")).toBe(true);
    expect(isTerminalQuestionCollectionState("collecting")).toBe(false);
  });
});

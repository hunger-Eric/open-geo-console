import { describe, expect, it } from "vitest";
import { combinedV3CommercialOutcome, snapshotReferenceBinding } from "./combined-correction-terminalization";

describe("combined snapshot reference cutoff", () => {
  it("advances a search-start cutoff to the completed snapshot time", () => {
    expect(snapshotReferenceBinding(
      "2026-07-14T05:27:07.265Z",
      "2026-07-14T05:27:12.000Z",
      new Date("2026-07-14T05:28:00.000Z"),
    )).toEqual({ evidenceCutoff: "2026-07-14T05:27:12.000Z", freshnessState: "fresh" });
  });

  it("preserves a later report cutoff and derives database freshness", () => {
    expect(snapshotReferenceBinding(
      "2026-07-22T00:00:00.000Z",
      "2026-07-14T00:00:00.000Z",
      new Date("2026-08-20T00:00:00.000Z"),
    )).toEqual({ evidenceCutoff: "2026-07-22T00:00:00.000Z", freshnessState: "historical" });
  });
});

describe("combined V3 commercial outcome", () => {
  const card = (status: "answered" | "limited" | "unresolved" | "insufficient", groundedClaims: number) => ({
    status,
    sentences: Array.from({ length: groundedClaims }, (_, index) => ({
      sentenceId: `sentence-${index}`,
      kind: "grounded_claim",
      text: `Claim ${index}`,
      evidenceIds: [`evidence-${index}`]
    }))
  });

  it("settles only three fully answered cards", () => {
    expect(combinedV3CommercialOutcome([card("answered", 1), card("answered", 1), card("answered", 1)] as never)).toBe("completed");
  });

  it("refunds a useful but incomplete report as completed_limited", () => {
    expect(combinedV3CommercialOutcome([card("answered", 1), card("limited", 1), card("insufficient", 0)] as never)).toBe("completed_limited");
  });

  it("refunds a report with no grounded answer as failed", () => {
    expect(combinedV3CommercialOutcome([card("insufficient", 0), card("insufficient", 0), card("insufficient", 0)] as never)).toBe("failed");
  });

  it("activates an exhausted three-question report as completed_limited with a refund", () => {
    expect(combinedV3CommercialOutcome([card("unresolved", 0), card("unresolved", 0), card("unresolved", 0)] as never)).toBe("completed_limited");
  });
});

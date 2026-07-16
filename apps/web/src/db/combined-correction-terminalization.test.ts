import { describe, expect, it } from "vitest";
import type { GenerativeSearchAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, OpenGeoAnswerDiagnosisV3 } from "@open-geo-console/ai-report-engine";
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
  const card = (status: "answered" | "limited" | "unresolved" | "insufficient", groundedClaims: number): LegacyEvidenceBoundAnswerCardV3 => ({
    questionId: `question-${status}-${groundedClaims}`,
    exactQuestion: "Which provider is suitable?",
    status,
    sentences: Array.from({ length: groundedClaims }, (_, index) => ({
      sentenceId: `sentence-${index}`,
      kind: "grounded_claim",
      text: `Claim ${index}`,
      evidenceIds: [`evidence-${index}`], confidence: "verified" as const
    })),
    sourceEvidence: [],
    coverage: { plannedQueries: 1, completedQueries: 1, returnedResults: 1, attemptedRetrievals: 1, safelyRetrievedPages: 1, eligibleDirectEvidence: groundedClaims, reasons: [] },
    geoDiagnosis: diagnosis()
  });

  it("settles only three fully answered cards", () => {
    expect(combinedV3CommercialOutcome([card("answered", 1), card("answered", 1), card("answered", 1)])).toBe("completed");
  });

  it("refunds a useful but incomplete report as completed_limited", () => {
    expect(combinedV3CommercialOutcome([card("answered", 1), card("limited", 1), card("insufficient", 0)])).toBe("completed_limited");
  });

  it("refunds a report with no grounded answer as failed", () => {
    expect(combinedV3CommercialOutcome([card("insufficient", 0), card("insufficient", 0), card("insufficient", 0)])).toBe("failed");
  });

  it("activates an exhausted three-question report as completed_limited with a refund", () => {
    expect(combinedV3CommercialOutcome([card("unresolved", 0), card("unresolved", 0), card("unresolved", 0)])).toBe("completed_limited");
  });

  const generative = (status: "answered" | "source_limited" | "refused"): GenerativeSearchAnswerCardV3 => ({
    answerMode: "generative_search_v1" as const,
    questionId: `question-${status}`, exactQuestion: "Which provider is suitable?",
    status,
    answerText: status === "refused" ? "" : "Provider alpha is suitable.",
    sources: status === "answered" ? [{ sourceId: "source-1", title: "Provider", canonicalUrl: "https://provider.example", registrableDomain: "provider.example", citedText: null, providerResultOrder: 0, retrievalStatus: "search_source_only", ownershipCategory: "unknown" }] : [],
    provenance: { providerId: "mimo", model: "fixture", searchMode: "native_web_search", promptVersion: "generative-search-answer-v1", searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z", answerHash: "a".repeat(64), sourceHash: "b".repeat(64) },
    refusal: status === "refused" ? { code: "policy_refusal", reason: "Policy refusal." } : null,
    geoDiagnosis: diagnosis(), audit: { verifiedBodyCount: 0, searchSourceOnlyCount: status === "answered" ? 1 : 0, inaccessibleCount: 0 }
  });

  it.each([
    [[generative("answered"), generative("answered"), generative("answered")], "completed"],
    [[generative("answered"), generative("source_limited"), generative("answered")], "completed_limited"],
    [[generative("answered"), generative("refused"), generative("answered")], "completed_limited"],
    [[generative("source_limited"), generative("source_limited"), generative("source_limited")], "failed"],
  ] as const)("maps generative cards to %s", (cards, expected) => {
    expect(combinedV3CommercialOutcome(cards)).toBe(expected);
  });

  it("rejects mixed legacy and generative modes", () => {
    expect(() => combinedV3CommercialOutcome([
      card("answered", 1), generative("answered"), generative("answered"),
    ])).toThrow("rejects mixed answer modes");
  });
});

function diagnosis(): OpenGeoAnswerDiagnosisV3 { return { targetMentioned: false, targetFirstSentence: null, targetRoles: [], competitorEntityIds: [], citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 }, missingEvidenceFamilies: [], retestQuestion: "Which provider is suitable?" }; }

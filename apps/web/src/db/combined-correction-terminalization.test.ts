import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerativeSearchAnswerCardV3, LegacyEvidenceBoundAnswerCardV3, OpenGeoAnswerDiagnosisV3 } from "@open-geo-console/ai-report-engine";

const correctionTerminalGuard = vi.hoisted(() => {
  const state = { blockedSite: null as string | null, guardSites: [] as string[], delegatedSites: [] as string[] };
  const blocked = new Error("blocked by correction terminalization guard test");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});
const correctionTerminalDatabase = vi.hoisted(() => ({
  ensureDatabase: vi.fn(),
  begin: vi.fn(),
  getSqlClient: vi.fn()
}));

vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: correctionTerminalGuard.run
}));
vi.mock("./index", () => ({
  ensureDatabase: correctionTerminalDatabase.ensureDatabase,
  getSqlClient: correctionTerminalDatabase.getSqlClient
}));
vi.mock("@open-geo-console/ai-report-engine", () => ({
  requireReadyCombinedGeoReport: (value: unknown) => value,
  requireReadyCombinedGeoReportV2: (value: unknown) => value,
  requireReadyCombinedGeoReportV3: (value: unknown) => value
}));

import { combinedV3CommercialOutcome, snapshotReferenceBinding, terminalizeCombinedCorrection } from "./combined-correction-terminalization";

beforeEach(() => {
  vi.clearAllMocks();
  correctionTerminalGuard.state.blockedSite = null;
  correctionTerminalGuard.state.guardSites.length = 0;
  correctionTerminalGuard.state.delegatedSites.length = 0;
  correctionTerminalDatabase.ensureDatabase.mockResolvedValue(undefined);
  correctionTerminalDatabase.getSqlClient.mockReturnValue({ begin: correctionTerminalDatabase.begin });
});

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

  it("tolerates bounded application and database clock skew", () => {
    expect(snapshotReferenceBinding(
      "2026-07-14T05:27:15.000Z",
      "2026-07-14T05:27:15.000Z",
      new Date("2026-07-14T05:27:10.000Z"),
    )).toEqual({ evidenceCutoff: "2026-07-14T05:27:15.000Z", freshnessState: "fresh" });
  });

  it("rejects timestamps beyond the bounded clock-skew allowance", () => {
    expect(() => snapshotReferenceBinding(
      "2026-07-14T05:29:00.001Z",
      "2026-07-14T05:27:12.000Z",
      new Date("2026-07-14T05:28:00.000Z"),
    )).toThrow(/future/i);
  });
});

describe("combined correction terminalization prohibited-operation guard", () => {
  it("blocks correction terminalization before validation or SQL", async () => {
    correctionTerminalGuard.state.blockedSite = "correction_terminalize";

    await expect(terminalizeCombinedCorrection({} as never)).rejects.toBe(correctionTerminalGuard.blocked);

    expect(correctionTerminalGuard.state.guardSites).toEqual(["correction_terminalize"]);
    expect(correctionTerminalGuard.state.delegatedSites).toEqual([]);
    expect(correctionTerminalDatabase.ensureDatabase).not.toHaveBeenCalled();
    expect(correctionTerminalDatabase.getSqlClient).not.toHaveBeenCalled();
    expect(correctionTerminalDatabase.begin).not.toHaveBeenCalled();
  });

  it("delegates correction terminalization once and preserves its transaction failure", async () => {
    const failure = new Error("correction terminalization transaction failed");
    correctionTerminalDatabase.begin.mockRejectedValueOnce(failure);

    await expect(terminalizeCombinedCorrection({
      report: { artifactContract: "combined_geo_report_v3" },
      workerId: "worker-1",
      checkpointIdentityHash: "checkpoint-1",
      snapshotRefs: [],
      htmlSha256: "h".repeat(64),
      pdfSha256: "p".repeat(64),
      pdfStorageKey: "private/report.pdf",
      pageCount: 5
    })).rejects.toBe(failure);

    expect(correctionTerminalGuard.state.guardSites).toEqual(["correction_terminalize"]);
    expect(correctionTerminalGuard.state.delegatedSites).toEqual(["correction_terminalize"]);
    expect(correctionTerminalDatabase.ensureDatabase).toHaveBeenCalledTimes(1);
    expect(correctionTerminalDatabase.begin).toHaveBeenCalledTimes(1);
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

import {
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  assertPaidV3DirectAnswerCardBindings,
  hashPaidV3DirectAnswerCard,
  parsePaidV3DirectSemantics,
  type GenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerResult
} from "@open-geo-console/ai-report-engine";
import { describe, expect, it, vi } from "vitest";
import { buildPaidV3DirectSemantics } from "./paid-v3-direct-semantics";
import { PAID_V3_DIRECT_DEBUG_TRACE_PREFIX, createPaidV3DirectDebugTrace } from "./paid-v3-direct-debug-trace";

describe("Paid V3 Direct semantics", () => {
  it("reuses Q1, calls Q2/Q3 analysis once, and keeps an invalid analysis incomplete", async () => {
    const cards = [card("q1", 1), card("q2", 2), card("q3", 3)] as const;
    const answers = cards.map((value) => answer(value)) as [GenerativeSearchAnswerResult, GenerativeSearchAnswerResult, GenerativeSearchAnswerResult];
    const q1Core = createFreeV4DirectCoreReceipt({
      questionSetIdentity: "a".repeat(64), questions: cards.map(({ exactQuestion }) => exactQuestion), questionId: "q1",
      questionText: cards[0].exactQuestion, answer: answers[0], sources: cards[0].sources, providerResponseId: "response-q1",
      providerId: "provider", model: "model", searchMode: "native", searchedAt: cards[0].provenance.searchedAt,
      completedAt: cards[0].provenance.completedAt, nonProseProjection: { questionId: "q1" }
    });
    const q1Analysis = { summary: "Q1 analysis", observations: [], recommendations: [], evidenceHandles: ["S1"] };
    const q1Bindings = [{ handle: "S1", evidenceRef: "source-q1" }];
    const q1AnalysisReceipt = createFreeV4DirectAnalysisReceipt({
      coreReceiptHash: q1Core.receiptHash, analysis: q1Analysis, handleBindings: q1Bindings,
      nonProseProjection: { questionId: "q1", analysisStatus: "completed" }
    });
    const releases: Array<() => void> = [];
    let active = 0;
    let maxActive = 0;
    const analyze = vi.fn(async (payload: unknown) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => releases.push(() => { active -= 1; resolve(); }));
      const question = (payload as { question: string }).question;
      if (question === "Question 3") return { wrong: true };
      return { summary: "Q2 analysis", observations: ["Observation"], recommendations: [], evidenceHandles: ["S1"] };
    });
    const traceLines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 500_000,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => traceLines.push(line)
    })!;
    const pending = buildPaidV3DirectSemantics({
      questionSet: { contentHash: "a".repeat(64) } as never,
      answerCards: cards,
      answerCheckpoint: {
        version: "answer-first-v3-checkpoint-v2", identityHash: "identity", answerResults: answers
      } as never,
      freeCheckpoint: {
        directAnalysisStatus: "completed", directCoreReceipt: q1Core, directAnalysis: q1Analysis,
        directAnalysisHandleBindings: q1Bindings, directAnalysisReceipt: q1AnalysisReceipt, q1AnswerDraft: cards[0]
      } as never,
      admission: {
        snapshot: { id: "snapshot" },
        pages: [{ id: "page", normalizedUrl: "https://example.com/page", contentHash: "content", analyzable: true, summary: "Target page" }]
      } as never,
      targetUrl: "https://example.com",
      foundation: { organizationProfile: { organizationName: "Example", legalEntity: null, brandNames: [] } } as never,
      locale: "en",
      analyze,
      trace
    });
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(2));
    expect(maxActive).toBe(2);
    releases.splice(0).forEach((release) => release());
    const result = await pending;

    expect(analyze).toHaveBeenCalledTimes(2);
    expect(result.questions.map(({ analysisStatus }) => analysisStatus)).toEqual(["completed", "completed", "incomplete"]);
    expect(result.questions[0]!.coreReceipt).toBe(q1Core);
    expect(result.questions[1]!.analysis?.summary).toBe("Q2 analysis");
    expect(result.questions[2]!.analysis).toBeUndefined();
    const traceEvents = traceLines.map((line) => JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as { kind: string; step: string });
    expect(traceEvents.filter(({ kind }) => kind === "step_started").map(({ step }) => step).sort()).toEqual([
      "q2_direct_analysis", "q3_direct_analysis"
    ]);
    expect(traceEvents.filter(({ kind, step }) => kind === "step_succeeded" && step === "q2_direct_analysis")).toHaveLength(1);
    expect(traceEvents.filter(({ kind, step }) => kind === "step_failed" && step === "q3_direct_analysis")).toHaveLength(1);
    expect(parsePaidV3DirectSemantics(result, ["q1", "q2", "q3"])).toEqual(result);
    expect(() => assertPaidV3DirectAnswerCardBindings({
      questionSetIdentity: "a".repeat(64), answerCards: cards, directSemantics: result
    })).not.toThrow();
    const changedCards = [{ ...cards[0], answerText: "Different rendered answer" }, cards[1], cards[2]] as const;
    expect(() => assertPaidV3DirectAnswerCardBindings({
      questionSetIdentity: "a".repeat(64), answerCards: changedCards, directSemantics: result
    })).toThrow(/rendered answer card lineage/i);
    const changedHash = hashPaidV3DirectAnswerCard(changedCards[0]);
    expect(() => parsePaidV3DirectSemantics({
      ...result,
      questions: [{ ...result.questions[0], answerCardHash: changedHash }, result.questions[1], result.questions[2]]
    }, ["q1", "q2", "q3"])).toThrow(/answerCardReceipt/i);

    const incompleteAnalyze = vi.fn(async () => ({
      summary: "Paid analysis", observations: [], recommendations: [], evidenceHandles: []
    }));
    const withUnavailableFreeAnalysis = await buildPaidV3DirectSemantics({
      questionSet: { contentHash: "a".repeat(64) } as never,
      answerCards: cards,
      answerCheckpoint: { version: "answer-first-v3-checkpoint-v2", identityHash: "identity", answerResults: answers } as never,
      freeCheckpoint: {
        directAnalysisStatus: "incomplete", directCoreReceipt: q1Core, q1AnswerDraft: cards[0]
      } as never,
      admission: {
        snapshot: { id: "snapshot" },
        pages: [{ id: "page", normalizedUrl: "https://example.com/page", contentHash: "content", analyzable: true, summary: "Target page" }]
      } as never,
      targetUrl: "https://example.com",
      foundation: { organizationProfile: { organizationName: "Example", legalEntity: null, brandNames: [] } } as never,
      locale: "en",
      analyze: incompleteAnalyze
    });
    expect(incompleteAnalyze).toHaveBeenCalledTimes(2);
    expect(withUnavailableFreeAnalysis.questions[0]).toMatchObject({
      questionId: "q1", analysisStatus: "incomplete", coreReceipt: q1Core
    });
    expect(withUnavailableFreeAnalysis.questions[0]!.analysis).toBeUndefined();
    expect(() => parsePaidV3DirectSemantics(withUnavailableFreeAnalysis, ["q1", "q2", "q3"])).not.toThrow();
  });
});

function card(questionId: string, index: number): GenerativeSearchAnswerCardV3 {
  const sourceId = `source-${questionId}`;
  return {
    answerMode: "generative_search_v1", questionId, exactQuestion: `Question ${index}`, status: "answered",
    answerText: `Answer ${index}`,
    sources: [{ sourceId, title: `Source ${index}`, canonicalUrl: `https://source${index}.example/item`, registrableDomain: `source${index}.example`, citedText: `Citation ${index}`, providerResultOrder: 0, retrievalStatus: "search_source_only", ownershipCategory: "unknown" }],
    provenance: { providerId: "provider", model: "model", searchMode: "native", promptVersion: "generative-search-answer-v1", searchedAt: "2026-08-01T00:00:00.000Z", completedAt: "2026-08-01T00:00:01.000Z", answerHash: "b".repeat(64), sourceHash: "c".repeat(64) },
    refusal: null,
    geoDiagnosis: { targetMentioned: false, targetFirstSentence: null, targetRoles: [], competitorEntityIds: [], citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 1 }, missingEvidenceFamilies: [], retestQuestion: `Question ${index}` },
    audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 1, inaccessibleCount: 0 }
  };
}

function answer(card: GenerativeSearchAnswerCardV3): GenerativeSearchAnswerResult {
  return {
    questionId: card.questionId, answerText: card.answerText,
    sources: card.sources.map(({ sourceId, title, canonicalUrl, registrableDomain, citedText, providerResultOrder }) => ({ sourceId, title, canonicalUrl, registrableDomain, citedText, providerResultOrder })),
    refusal: null, providerResponseId: `response-${card.questionId}`,
    searchedAt: card.provenance.searchedAt, completedAt: card.provenance.completedAt
  };
}

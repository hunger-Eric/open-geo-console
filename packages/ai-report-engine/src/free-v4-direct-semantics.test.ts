import { describe, expect, it } from "vitest";
import {
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  parseFreeV4DirectAnalysis,
  verifyFreeV4DirectAnalysisReceipt,
  verifyFreeV4DirectCoreReceipt
} from "./free-v4-direct-semantics";

const coreInput = {
  questionSetIdentity: `confirmed-business-question-set-${"a".repeat(64)}`,
  questions: ["Question one?", "Question two?", "Question three?"],
  questionId: "q1",
  questionText: "Question one?",
  answer: {
    questionId: "q1",
    answerText: "A useful answer.",
    refusal: null,
    sources: [],
    searchedAt: "2026-08-01T00:00:00.000Z",
    completedAt: "2026-08-01T00:00:01.000Z",
    providerResponseId: "response-1"
  },
  sources: [],
  providerResponseId: "response-1",
  providerId: "xiaomi-mimo",
  model: "mimo-v2-flash",
  searchMode: "native_web_search",
  searchedAt: "2026-08-01T00:00:00.000Z",
  completedAt: "2026-08-01T00:00:01.000Z",
  nonProseProjection: { reportId: "report-1", jobId: "job-1" }
} as const;

describe("Free V4 direct semantics", () => {
  it.each([
    { observations: [], recommendations: [] },
    { observations: ["One observation."], recommendations: ["One action."] },
    { observations: ["One.", "Two.", "Three.", "Four."], recommendations: ["A.", "B."] }
  ])("accepts variable natural-language lists", ({ observations, recommendations }) => {
    expect(parseFreeV4DirectAnalysis({
      summary: "Natural analysis.",
      observations,
      recommendations,
      evidenceHandles: [],
      checkoutEligible: "ignored model extra",
      harmlessExtra: { modelOwned: true }
    }, { allowedEvidenceHandles: [] })).toEqual({
      summary: "Natural analysis.", observations, recommendations, evidenceHandles: []
    });
  });

  it("accepts negative outcomes and evidence handles from the current alias map", () => {
    expect(parseFreeV4DirectAnalysis({
      summary: "The answer refused and the target cannot be assessed.",
      observations: [],
      recommendations: [],
      evidenceHandles: ["S1", "T1"]
    }, { allowedEvidenceHandles: ["S1", "T1"] }).evidenceHandles).toEqual(["S1", "T1"]);
  });

  it("rejects only the analysis when it cites an unknown handle", () => {
    expect(() => parseFreeV4DirectAnalysis({
      summary: "Analysis.", observations: [], recommendations: [], evidenceHandles: ["S2"]
    }, { allowedEvidenceHandles: ["S1"] })).toThrow(/unknown handle S2/u);
  });

  it("requires the four minimum analysis fields with basic types", () => {
    expect(() => parseFreeV4DirectAnalysis({
      summary: "Analysis.", observations: "not-an-array", recommendations: [], evidenceHandles: []
    }, { allowedEvidenceHandles: [] })).toThrow(/observations/u);
  });

  it("seals and verifies the Q1 core independently", () => {
    const receipt = createFreeV4DirectCoreReceipt(coreInput);
    expect(verifyFreeV4DirectCoreReceipt(receipt, coreInput)).toEqual(receipt);
    expect(() => verifyFreeV4DirectCoreReceipt(
      { ...receipt, answerHash: "0".repeat(64) },
      coreInput
    )).toThrow(/answerHash/u);
  });

  it("binds a completed analysis to the core receipt and current aliases", () => {
    const coreReceipt = createFreeV4DirectCoreReceipt(coreInput);
    const analysis = parseFreeV4DirectAnalysis({
      summary: "Supported analysis.",
      observations: ["Observation."],
      recommendations: ["Recommendation."],
      evidenceHandles: ["S1"]
    }, { allowedEvidenceHandles: ["S1"] });
    const input = {
      coreReceiptHash: coreReceipt.receiptHash,
      analysis,
      handleBindings: [{ handle: "S1", evidenceRef: "source-1" }],
      nonProseProjection: { reportId: "report-1", analysisStatus: "completed" }
    } as const;
    const receipt = createFreeV4DirectAnalysisReceipt(input);
    expect(verifyFreeV4DirectAnalysisReceipt(receipt, input)).toEqual(receipt);
    expect(() => verifyFreeV4DirectAnalysisReceipt(receipt, {
      ...input,
      analysis: { ...analysis, summary: "Tampered analysis." }
    })).toThrow(/analysisHash/u);
  });

  it("rejects non-serializable receipt input", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => createFreeV4DirectCoreReceipt({ ...coreInput, nonProseProjection: cyclic })).toThrow(/cycles/u);
  });
});

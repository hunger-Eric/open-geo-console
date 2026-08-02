import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  createFreeV4DirectAnalysisReceipt,
  createFreeV4DirectCoreReceipt,
  createPaidV3DirectAnswerCardReceipt,
  hashPaidV3DirectAnswerCard,
  parseFreeV4DirectAnalysis,
  type GenerativeSearchAnswerCardV3,
  type GenerativeSearchAnswerResult,
  type PaidV3DirectQuestionSemantics,
  type PaidV3DirectSemantics
} from "@open-geo-console/ai-report-engine";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { ReportV4SiteSnapshotBundle } from "@/db/report-v4-site-snapshots";
import type { AnswerFirstV3CheckpointV2 } from "./answer-first-v3";
import type { PaidV3DirectDebugTrace } from "./paid-v3-direct-debug-trace";
import {
  buildFreeTeaserDiagnosisTargetPages,
  buildFreeV4DirectAnalysisInput,
  freeV4DirectTargetIdentity,
  invokeFreeV4DirectAnalysis,
  type FreeTeaserCheckpointV1
} from "./report-v4-free-teaser";

export async function buildPaidV3DirectSemantics(input: {
  questionSet: ConfirmedBusinessQuestionSet;
  answerCards: readonly [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
  answerCheckpoint: AnswerFirstV3CheckpointV2;
  freeCheckpoint: FreeTeaserCheckpointV1;
  admission: ReportV4SiteSnapshotBundle;
  targetUrl: string;
  foundation: AiWebsiteReportV1;
  locale: string;
  signal?: AbortSignal;
  analyze?: (payload: unknown, signal: AbortSignal) => Promise<unknown>;
  trace?: PaidV3DirectDebugTrace;
}): Promise<PaidV3DirectSemantics> {
  const free = input.freeCheckpoint;
  if (!free.directCoreReceipt || !free.q1AnswerDraft ||
      (free.directAnalysisStatus !== "completed" && free.directAnalysisStatus !== "incomplete")) {
    throw new TypeError("Paid Direct Q1 requires the completed Free Direct core receipt and a terminal analysis status.");
  }
  if (free.directAnalysisStatus === "completed" &&
      (!free.directAnalysis || !free.directAnalysisHandleBindings || !free.directAnalysisReceipt)) {
    throw new TypeError("Paid Direct Q1 completed analysis requires its verified projection and receipt.");
  }
  if (free.directAnalysisStatus === "incomplete" &&
      (free.directAnalysis || free.directAnalysisHandleBindings || free.directAnalysisReceipt)) {
    throw new TypeError("Paid Direct Q1 incomplete analysis cannot carry an unverified projection.");
  }
  const q1AnswerCardHash = hashPaidV3DirectAnswerCard(input.answerCards[0]);
  const q1: PaidV3DirectQuestionSemantics = Object.freeze({
    questionId: input.answerCards[0].questionId,
    answerCardHash: q1AnswerCardHash,
    answerCardReceipt: createPaidV3DirectAnswerCardReceipt({
      coreReceiptHash: free.directCoreReceipt.receiptHash, answerCardHash: q1AnswerCardHash
    }),
    analysisStatus: free.directAnalysisStatus,
    coreReceipt: free.directCoreReceipt,
    ...(free.directAnalysisStatus === "completed" ? {
      analysis: free.directAnalysis!,
      handleBindings: free.directAnalysisHandleBindings!,
      analysisReceipt: free.directAnalysisReceipt!
    } : {})
  });
  input.trace?.emit("gate_result", "q1_direct_semantics_status", {
    phase: "grounded_answer_synthesis", questionOrdinal: 1, outcome: q1.analysisStatus,
    disposition: q1.analysisStatus === "completed" ? "reused_verified_free_lineage" : "reused_incomplete_free_lineage"
  });
  const questions = input.answerCards.map(({ exactQuestion }) => exactQuestion);
  const targetIdentity = freeV4DirectTargetIdentity(input.targetUrl, input.foundation);
  const analyze = input.analyze ?? ((payload, signal) => invokeFreeV4DirectAnalysis({ payload, signal }));
  const generated = await Promise.all(([1, 2] as const).map(async (index): Promise<PaidV3DirectQuestionSemantics> => {
    const card = input.answerCards[index];
    const answer = input.answerCheckpoint.answerResults[index] as GenerativeSearchAnswerResult;
    if (answer.questionId !== card.questionId) throw new TypeError(`Paid Direct Q${index + 1} answer identity is invalid.`);
    const coreReceipt = createFreeV4DirectCoreReceipt({
      questionSetIdentity: input.questionSet.contentHash,
      questions,
      questionId: card.questionId,
      questionText: card.exactQuestion,
      answer,
      sources: card.sources,
      providerResponseId: answer.providerResponseId,
      providerId: card.provenance.providerId,
      model: card.provenance.model,
      searchMode: card.provenance.searchMode,
      searchedAt: card.provenance.searchedAt,
      completedAt: card.provenance.completedAt,
      nonProseProjection: {
        version: input.answerCheckpoint.version,
        identityHash: input.answerCheckpoint.identityHash,
        questionSetIdentity: input.questionSet.contentHash,
        questionId: card.questionId,
        answerHash: card.provenance.answerHash,
        sourceHash: card.provenance.sourceHash,
        locale: input.locale
      }
    });
    const answerCardHash = hashPaidV3DirectAnswerCard(card);
    const answerCardReceipt = createPaidV3DirectAnswerCardReceipt({ coreReceiptHash: coreReceipt.receiptHash, answerCardHash });
    const directInput = buildFreeV4DirectAnalysisInput({
      question: card.exactQuestion,
      answer: { answerText: card.answerText, refusal: card.refusal },
      sources: card.sources,
      targetPages: buildFreeTeaserDiagnosisTargetPages(card.questionId, input.admission),
      targetIdentity,
      locale: input.locale
    });
    try {
      const signal = input.signal ?? new AbortController().signal;
      signal.throwIfAborted();
      const invoke = async () => {
        const raw = await analyze(directInput.payload, signal);
        signal.throwIfAborted();
        return parseFreeV4DirectAnalysis(raw, {
          allowedEvidenceHandles: directInput.handleBindings.map(({ handle }) => handle)
        });
      };
      const analysis = input.trace
        ? await input.trace.span(`q${index + 1}_direct_analysis`, {
            phase: "grounded_answer_synthesis",
            providerCallOrdinal: 1,
            configuredMaxAttempts: 1
          }, invoke)
        : await invoke();
      const analysisReceipt = createFreeV4DirectAnalysisReceipt({
        coreReceiptHash: coreReceipt.receiptHash,
        analysis,
        handleBindings: directInput.handleBindings,
        nonProseProjection: {
          version: FREE_V4_DIRECT_SEMANTICS_VERSION,
          questionSetIdentity: input.questionSet.contentHash,
          questionId: card.questionId,
          analysisStatus: "completed"
        }
      });
      input.trace?.emit("gate_result", `q${index + 1}_direct_semantics_status`, {
        phase: "grounded_answer_synthesis", questionOrdinal: index + 1, outcome: "completed", disposition: "analysis_bound"
      });
      return Object.freeze({
        questionId: card.questionId,
        answerCardHash,
        answerCardReceipt,
        analysisStatus: "completed",
        coreReceipt,
        analysis,
        handleBindings: directInput.handleBindings,
        analysisReceipt
      });
    } catch (error) {
      input.signal?.throwIfAborted();
      input.trace?.degraded(`q${index + 1}_direct_semantics_status`, {
        phase: "grounded_answer_synthesis", questionOrdinal: index + 1, outcome: "incomplete",
        disposition: "analysis_failure_converted_to_incomplete"
      }, error);
      return Object.freeze({ questionId: card.questionId, answerCardHash, answerCardReceipt, analysisStatus: "incomplete", coreReceipt });
    }
  }));
  input.trace?.emit("gate_result", "paid_direct_semantics_summary", {
    phase: "grounded_answer_synthesis", completedCount: [q1, ...generated].filter(({ analysisStatus }) => analysisStatus === "completed").length,
    degradedCount: [q1, ...generated].filter(({ analysisStatus }) => analysisStatus === "incomplete").length,
    disposition: [q1, ...generated].every(({ analysisStatus }) => analysisStatus === "completed") ? "complete" : "complete_with_incomplete_analysis"
  });
  return Object.freeze({
    version: FREE_V4_DIRECT_SEMANTICS_VERSION,
    questions: Object.freeze([q1, generated[0], generated[1]]) as PaidV3DirectSemantics["questions"]
  });
}

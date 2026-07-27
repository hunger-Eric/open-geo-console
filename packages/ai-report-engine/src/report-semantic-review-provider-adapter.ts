import {
  applyReportSemanticReview,
  assembleFreeV4BatchedSemanticReviewRaw,
  buildFreeV4SemanticReviewBatchSystemPrompt,
  buildFreeV4SemanticReviewBatchUserPayload,
  listFreeV4SemanticReviewBatches,
  parseReportSemanticReviewOutput,
  type AppliedReportSemanticReview,
  type FreeV4SemanticReviewBatchId,
  type ReportSemanticReviewInput,
  type ReportSemanticReviewOutput
} from "./report-semantic-review";

export interface ReportSemanticReviewInvoker {
  (request: Readonly<{ task: "unified_report_semantic_review"; input: ReportSemanticReviewInput }>): Promise<unknown>;
}

/** Free V4 batch transport: caller supplies system/user text already built for the batch. */
export interface FreeV4SemanticReviewBatchInvoker {
  (request: Readonly<{
    batchId: FreeV4SemanticReviewBatchId;
    systemText: string;
    inputText: string;
  }>): Promise<unknown>;
}

export interface OfflineReportSemanticReviewResult {
  readonly review: ReportSemanticReviewOutput;
  readonly applied: AppliedReportSemanticReview;
}

/** An injectable adapter; callers own transport and this module owns no client/configuration. */
export async function runOfflineReportSemanticReview(
  input: ReportSemanticReviewInput,
  invoke: ReportSemanticReviewInvoker,
  currentNonProseProjectionHash?: string
): Promise<OfflineReportSemanticReviewResult> {
  const rawReview = await invoke({ task: "unified_report_semantic_review", input });
  const review = parseReportSemanticReviewOutput(rawReview, input);
  return { review, applied: applyReportSemanticReview(input, review, currentNonProseProjectionHash) };
}

/**
 * Free V4 only: structural multi-invoke review. Merges batch payloads then
 * validates with the existing full-output parser and apply path.
 */
export async function runOfflineReportSemanticReviewBatched(
  input: ReportSemanticReviewInput,
  invoke: FreeV4SemanticReviewBatchInvoker,
  currentNonProseProjectionHash?: string
): Promise<OfflineReportSemanticReviewResult & {
  readonly batchIds: readonly FreeV4SemanticReviewBatchId[];
}> {
  if (input.lifecycle !== "free_v4") {
    throw new TypeError("Batched semantic review requires Free V4 lifecycle.");
  }
  const batchIds = listFreeV4SemanticReviewBatches(input);
  const batchPayloads: Partial<Record<FreeV4SemanticReviewBatchId, unknown>> = {};
  for (const batchId of batchIds) {
    batchPayloads[batchId] = await invoke({
      batchId,
      systemText: buildFreeV4SemanticReviewBatchSystemPrompt(input, batchId),
      inputText: buildFreeV4SemanticReviewBatchUserPayload(input, batchId)
    });
  }
  const rawReview = assembleFreeV4BatchedSemanticReviewRaw(input, batchPayloads);
  const review = parseReportSemanticReviewOutput(rawReview, input);
  return {
    review,
    applied: applyReportSemanticReview(input, review, currentNonProseProjectionHash),
    batchIds
  };
}

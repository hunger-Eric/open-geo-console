import {
  applyReportSemanticReview,
  assembleFreeV4BatchedSemanticReviewRaw,
  buildFreeV4SemanticReviewBatchSystemPrompt,
  buildFreeV4SemanticReviewBatchUserPayload,
  hashReportSemanticReviewValue,
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

/**
 * Redacted per-batch evidence: structural identity ids, payload hash/size,
 * row counts, timings, and error class only. Never prompt/response prose or
 * secret material.
 */
export interface FreeV4SemanticReviewBatchEvidence {
  readonly batchId: FreeV4SemanticReviewBatchId;
  readonly inputIdentities: readonly string[];
  readonly requestSha256: string;
  readonly requestBytes: number;
  readonly responseRowCount: number | null;
  readonly responseIdentities: readonly string[] | null;
  readonly durationMs: number;
  readonly errorClass: string | null;
}

export interface FreeV4SemanticReviewBatchedOptions {
  /** Invoked once per batch after its invoke settles; sink errors are swallowed. */
  readonly onBatchEvidence?: (evidence: FreeV4SemanticReviewBatchEvidence) => void;
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
  currentNonProseProjectionHash?: string,
  options?: FreeV4SemanticReviewBatchedOptions
): Promise<OfflineReportSemanticReviewResult & {
  readonly batchIds: readonly FreeV4SemanticReviewBatchId[];
}> {
  if (input.lifecycle !== "free_v4") {
    throw new TypeError("Batched semantic review requires Free V4 lifecycle.");
  }
  const batchIds = listFreeV4SemanticReviewBatches(input);
  const batchPayloads: Partial<Record<FreeV4SemanticReviewBatchId, unknown>> = {};
  for (const batchId of batchIds) {
    const systemText = buildFreeV4SemanticReviewBatchSystemPrompt(input, batchId);
    const inputText = buildFreeV4SemanticReviewBatchUserPayload(input, batchId);
    const startedAt = Date.now();
    let payload: unknown;
    try {
      payload = await invoke({ batchId, systemText, inputText });
    } catch (error) {
      emitFreeV4BatchEvidence(options, freeV4BatchEvidence(input, batchId, systemText, inputText, startedAt, null, freeV4BatchErrorClass(error)));
      throw error;
    }
    emitFreeV4BatchEvidence(options, freeV4BatchEvidence(input, batchId, systemText, inputText, startedAt, payload, null));
    batchPayloads[batchId] = payload;
  }
  const rawReview = assembleFreeV4BatchedSemanticReviewRaw(input, batchPayloads);
  const review = parseReportSemanticReviewOutput(rawReview, input);
  return {
    review,
    applied: applyReportSemanticReview(input, review, currentNonProseProjectionHash),
    batchIds
  };
}

/** Evidence delivery is observational: a throwing sink must never break the review. */
function emitFreeV4BatchEvidence(options: FreeV4SemanticReviewBatchedOptions | undefined, evidence: FreeV4SemanticReviewBatchEvidence): void {
  if (!options?.onBatchEvidence) return;
  try {
    options.onBatchEvidence(evidence);
  } catch {
    // Intentionally swallowed.
  }
}

function freeV4BatchEvidence(
  input: ReportSemanticReviewInput, batchId: FreeV4SemanticReviewBatchId,
  systemText: string, inputText: string, startedAt: number,
  payload: unknown, errorClass: string | null
): FreeV4SemanticReviewBatchEvidence {
  const response = errorClass === null
    ? freeV4BatchResponseRows(payload, batchId)
    : { rowCount: null, identities: null };
  return {
    batchId,
    inputIdentities: freeV4BatchInputIdentities(input, batchId),
    requestSha256: hashReportSemanticReviewValue({ batchId, systemText, inputText }),
    requestBytes: Buffer.byteLength(systemText, "utf8") + Buffer.byteLength(inputText, "utf8"),
    responseRowCount: response.rowCount,
    responseIdentities: response.identities,
    durationMs: Date.now() - startedAt,
    errorClass
  };
}

function freeV4BatchErrorClass(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : typeof error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && code ? `${name}:${code}` : name;
}

function freeV4BatchInputIdentities(input: ReportSemanticReviewInput, batchId: FreeV4SemanticReviewBatchId): string[] {
  switch (batchId) {
    case "B_fields_readonly":
      return input.fields.filter((field) => field.mutability === "read_only").map((field) => `${field.path}#${field.originalTextHash}`);
    case "B_fields_mutable":
      return input.fields.filter((field) => field.mutability === "mutable").map((field) => `${field.path}#${field.originalTextHash}`);
    case "B_obs":
      return input.observationResults.map((row) => `${row.observationId}/${row.resultId}`);
    case "B_answers":
      return input.answerSubjects.map((subject) => `${subject.questionId}@${subject.fieldPath}`);
    case "B_evidence_use":
      return input.fields.map((field) => field.path);
    default: {
      const _exhaustive: never = batchId;
      throw new TypeError(`Unknown Free V4 review batch ${_exhaustive}`);
    }
  }
}

const FREE_V4_BATCH_RESPONSE_KEYS: Record<FreeV4SemanticReviewBatchId, string> = {
  B_fields_readonly: "fields",
  B_fields_mutable: "fields",
  B_obs: "observationResults",
  B_answers: "answers",
  B_evidence_use: "evidenceUse"
};

/** Read-only extraction of echoed row identities from a raw batch payload. */
function freeV4BatchResponseRows(
  payload: unknown,
  batchId: FreeV4SemanticReviewBatchId
): { rowCount: number | null; identities: string[] | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { rowCount: null, identities: null };
  }
  const rows = (payload as Record<string, unknown>)[FREE_V4_BATCH_RESPONSE_KEYS[batchId]];
  if (!Array.isArray(rows)) return { rowCount: null, identities: null };
  return { rowCount: rows.length, identities: rows.map((row) => freeV4EchoedRowIdentity(row, batchId)) };
}

function freeV4EchoedRowIdentity(row: unknown, batchId: FreeV4SemanticReviewBatchId): string {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "<malformed-row>";
  const record = row as Record<string, unknown>;
  if (batchId === "B_obs") {
    return typeof record.observationId === "string" && typeof record.resultId === "string"
      ? `${record.observationId}/${record.resultId}`
      : "<malformed-row>";
  }
  if (batchId === "B_answers") {
    return typeof record.questionId === "string" ? record.questionId : "<malformed-row>";
  }
  return typeof record.path === "string" ? record.path : "<malformed-row>";
}

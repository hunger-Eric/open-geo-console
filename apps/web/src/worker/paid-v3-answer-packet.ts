import {
  hashReportSemanticReviewValue,
  type GenerativeSearchAnswerCardV3
} from "@open-geo-console/ai-report-engine";
export const PAID_V3_ANSWER_PACKET_VERSION = "PaidV3AnswerPacketV1" as const;
export type PaidV3AnswerPacketStatus = "pending" | "completed" | "failed";
/** Explicit per-field bounds for fail-closed packet construction. */
export const PAID_V3_ANSWER_PACKET_BOUNDS = Object.freeze({
  questionIdMax: 200, questionMax: 4_000, answerMax: 12_000, claimMax: 2_000, claimsMax: 20,
  sourceIdsMax: 40, sourceIdMax: 300, shortEvidenceRefMax: 300, shortEvidenceRefsMax: 40,
  caveatMax: 1_000, caveatsMax: 12, diagnosisSummaryMax: 4_000, diagnosisGapMax: 4_000,
  diagnosisObservationMax: 2_000, diagnosisActionMax: 2_000, attemptCountMax: 1
});
export interface PaidV3AnswerPacketClaim {
  readonly text: string;
}
export interface PaidV3AnswerPacketDiagnosis {
  readonly selectionSummary: string;
  readonly targetGap: string;
  readonly observableFactors: readonly {
    readonly kind: string;
    readonly observation: string;
    readonly evidenceRefs: readonly string[];
  }[];
  readonly recommendedActions: readonly {
    readonly priority: number;
    readonly action: string;
    readonly evidenceRefs: readonly string[];
  }[];
  readonly detailedEvidenceRefs: readonly string[];
}
export interface PaidV3AnswerPacketV1 {
  readonly version: typeof PAID_V3_ANSWER_PACKET_VERSION;
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
  readonly claims: readonly PaidV3AnswerPacketClaim[];
  readonly sourceIds: readonly string[];
  readonly shortEvidenceRefs: readonly string[];
  readonly diagnosis: PaidV3AnswerPacketDiagnosis | null;
  readonly caveats: readonly string[];
  readonly inputHash: string;
  readonly outputHash: string;
  readonly authorityHash: string;
  readonly status: PaidV3AnswerPacketStatus;
  readonly attemptCount: number;
  readonly providerAttempts: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  /** Terminal failure metadata; null/absent when not failed. */
  readonly failureClassification: PaidV3PacketErrorClass | null;
  readonly failureRetryReason: string | null;
}
export type PaidV3PacketsByQuestion = Readonly<Record<string, PaidV3AnswerPacketV1>>;
export type PaidV3PacketErrorClass =
  | "transient_network"
  | "transient_provider_429"
  | "transient_provider_5xx"
  | "timeout"
  | "token_budget"
  | "contract"
  | "identity"
  | "permanent_provider"
  | "unknown_permanent";
export function classifyPaidV3PacketError(error: unknown): {
  readonly classification: PaidV3PacketErrorClass;
  readonly retryable: boolean;
} {
  const row = (error && typeof error === "object" ? error : {}) as {
    name?: string; code?: string; retryable?: boolean; status?: number; message?: string;
  };
  const msg = String(row.message ?? "");
  if (row.name === "ModelTokenBudgetError" || row.code === "model_token_budget_rejected" || row.code === "token_budget") {
    return { classification: "token_budget", retryable: false };
  }
  if (row.code === "identity" || /identity|hash drift|does not match/i.test(msg)) return { classification: "identity", retryable: false };
  if (row.code === "contract" || row.name === "TypeError" || /contract|parse|schema/i.test(msg)) return { classification: "contract", retryable: false };
  if (row.status === 429 || row.code === "rate_limited") return { classification: "transient_provider_429", retryable: true };
  if (typeof row.status === "number" && row.status >= 500) return { classification: "transient_provider_5xx", retryable: true };
  if (row.code === "timeout" || /timeout|aborted/i.test(msg)) return { classification: "timeout", retryable: true };
  if (row.retryable === true || row.code === "network" || /ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)) {
    return { classification: "transient_network", retryable: true };
  }
  return { classification: row.retryable === false ? "permanent_provider" : "unknown_permanent", retryable: false };
}
/** Always false: Paid V3 orchestration performs no automatic packet-layer retry. */
export function shouldRetryPaidV3PacketAttempt(
  _classification: PaidV3PacketErrorClass,
  _attemptCountAfterFailure: number
): boolean {
  return false;
}
export function serializePaidV3AnswerPacket(packet: PaidV3AnswerPacketV1): string {
  return stableStringify(canonicalPacketBody(packet));
}
export function parsePaidV3AnswerPacket(value: unknown): PaidV3AnswerPacketV1 {
  const row = asObject(value, "PaidV3AnswerPacketV1");
  requireExactString(row.version, PAID_V3_ANSWER_PACKET_VERSION, "version");
  const questionId = boundedText(row.questionId, "questionId", PAID_V3_ANSWER_PACKET_BOUNDS.questionIdMax);
  const question = boundedText(row.question, "question", PAID_V3_ANSWER_PACKET_BOUNDS.questionMax);
  const answer = boundedText(row.answer, "answer", PAID_V3_ANSWER_PACKET_BOUNDS.answerMax);
  const claims = requireArray(row.claims, "claims", PAID_V3_ANSWER_PACKET_BOUNDS.claimsMax).map((claim, index) => {
    const claimRow = asObject(claim, `claims[${index}]`);
    return Object.freeze({ text: boundedText(claimRow.text, `claims[${index}].text`, PAID_V3_ANSWER_PACKET_BOUNDS.claimMax) });
  });
  const sourceIds = uniqueIds(
    requireArray(row.sourceIds, "sourceIds", PAID_V3_ANSWER_PACKET_BOUNDS.sourceIdsMax).map((id, index) =>
      boundedText(id, `sourceIds[${index}]`, PAID_V3_ANSWER_PACKET_BOUNDS.sourceIdMax)
    ),
    "sourceIds"
  );
  const shortEvidenceRefs = uniqueIds(
    requireArray(row.shortEvidenceRefs, "shortEvidenceRefs", PAID_V3_ANSWER_PACKET_BOUNDS.shortEvidenceRefsMax).map((id, index) =>
      boundedText(id, `shortEvidenceRefs[${index}]`, PAID_V3_ANSWER_PACKET_BOUNDS.shortEvidenceRefMax)
    ),
    "shortEvidenceRefs"
  );
  const diagnosis = row.diagnosis === null || row.diagnosis === undefined
    ? null
    : parseDiagnosis(row.diagnosis, sourceIds);
  const caveats = requireArray(row.caveats, "caveats", PAID_V3_ANSWER_PACKET_BOUNDS.caveatsMax).map((caveat, index) =>
    boundedText(caveat, `caveats[${index}]`, PAID_V3_ANSWER_PACKET_BOUNDS.caveatMax)
  );
  const inputHash = requireHash(row.inputHash, "inputHash");
  const status = requireStatus(row.status);
  const outputHash = status === "completed"
    ? requireHash(row.outputHash, "outputHash")
    : row.outputHash === "" || row.outputHash === null || row.outputHash === undefined
      ? ""
      : requireHash(row.outputHash, "outputHash");
  const authorityHash = requireHash(row.authorityHash, "authorityHash");
  const attemptCount = requireAttempt(row.attemptCount, "attemptCount");
  const providerAttempts = requireAttempt(row.providerAttempts ?? row.attemptCount, "providerAttempts");
  const startedAt = requireIso(row.startedAt, "startedAt");
  const completedAt = row.completedAt === null || row.completedAt === undefined
    ? null
    : requireIso(row.completedAt, "completedAt");
  if ((status === "completed" || status === "failed") && !completedAt) {
    throw new TypeError("PaidV3AnswerPacketV1 terminal status requires completedAt.");
  }
  if (status === "completed" && !outputHash) {
    throw new TypeError("PaidV3AnswerPacketV1 completed status requires outputHash.");
  }
  if (status === "pending" && completedAt !== null) {
    throw new TypeError("PaidV3AnswerPacketV1 pending status cannot set completedAt.");
  }
  const failureClassification = row.failureClassification == null || row.failureClassification === ""
    ? null
    : (String(row.failureClassification) as PaidV3PacketErrorClass);
  const failureRetryReason = row.failureRetryReason == null || row.failureRetryReason === ""
    ? null
    : boundedText(row.failureRetryReason, "failureRetryReason", 500);
  if (status === "failed" && !failureClassification) {
    throw new TypeError("PaidV3AnswerPacketV1 failed status requires failureClassification.");
  }
  if (status !== "failed" && (failureClassification || failureRetryReason)) {
    throw new TypeError("PaidV3AnswerPacketV1 failure fields are only allowed when status is failed.");
  }
  const packet: PaidV3AnswerPacketV1 = Object.freeze({
    version: PAID_V3_ANSWER_PACKET_VERSION,
    questionId,
    question,
    answer,
    claims: Object.freeze(claims),
    sourceIds: Object.freeze(sourceIds),
    shortEvidenceRefs: Object.freeze(shortEvidenceRefs),
    diagnosis: diagnosis ? Object.freeze(diagnosis) : null,
    caveats: Object.freeze(caveats),
    inputHash,
    outputHash,
    authorityHash,
    status,
    attemptCount,
    providerAttempts,
    startedAt,
    completedAt,
    failureClassification,
    failureRetryReason
  });
  return packet;
}
/** Deterministic packet input identity for merge fail-closed drift checks. */
export function computePaidV3PacketInputHash(input: {
  readonly questionId: string;
  readonly question: string;
  readonly sourceIds: readonly string[];
  readonly authorityHash: string;
}): string {
  return hashReportSemanticReviewValue({
    questionId: input.questionId,
    question: input.question,
    sourceIds: input.sourceIds,
    authorityHash: input.authorityHash
  });
}
export function mergePaidV3PacketsByQuestion(
  existing: PaidV3PacketsByQuestion | undefined,
  next: PaidV3AnswerPacketV1
): PaidV3PacketsByQuestion {
  const parsed = parsePaidV3AnswerPacket(next);
  const prior = existing?.[parsed.questionId];
  if (prior && prior.status === "completed" && parsed.status !== "completed") {
    // Never clobber a completed packet with a non-completed rewrite.
    return Object.freeze({ ...(existing ?? {}), [prior.questionId]: prior });
  }
  if (prior && prior.status === "completed" && parsed.status === "completed") {
    if (
      prior.outputHash !== parsed.outputHash
      || prior.authorityHash !== parsed.authorityHash
      || prior.inputHash !== parsed.inputHash
    ) {
      throw new TypeError(`Paid V3 packet identity drift for ${parsed.questionId}.`);
    }
    return Object.freeze({ ...(existing ?? {}), [prior.questionId]: prior });
  }
  return Object.freeze({ ...(existing ?? {}), [parsed.questionId]: parsed });
}
export function buildPaidV3AnswerPacketFromGenerativeCard(input: {
  readonly card: Extract<GenerativeSearchAnswerCardV3, { answerMode: "generative_search_v1" }>;
  readonly authorityHash: string;
  readonly status: PaidV3AnswerPacketStatus;
  readonly attemptCount: number;
  readonly providerAttempts?: number;
  readonly startedAt: string;
  readonly completedAt: string | null;
  readonly allowedSourceIds?: ReadonlySet<string>;
  readonly failure?: { classification: PaidV3PacketErrorClass; retryable: boolean; reason: string };
}): PaidV3AnswerPacketV1 {
  const sourceIds = input.card.sources.map((source) => source.sourceId);
  if (input.allowedSourceIds) {
    for (const sourceId of sourceIds) {
      if (!input.allowedSourceIds.has(sourceId)) {
        throw new TypeError(`Paid V3 packet sourceId ${sourceId} is foreign to the shared dictionary.`);
      }
    }
  }
  const diagnosis = input.card.diagnosis ? projectDiagnosis(input.card.diagnosis, sourceIds) : null;
  const claims = extractClaims(input.card.answerText ?? "");
  const shortEvidenceRefs = diagnosis?.detailedEvidenceRefs ?? sourceIds.slice(0, PAID_V3_ANSWER_PACKET_BOUNDS.shortEvidenceRefsMax);
  const attempts = Math.min(1, Math.max(0, input.providerAttempts ?? input.attemptCount));
  const inputHash = computePaidV3PacketInputHash({
    questionId: input.card.questionId,
    question: input.card.exactQuestion,
    sourceIds,
    authorityHash: input.authorityHash
  });
  const outputHash = input.status === "completed"
    ? hashReportSemanticReviewValue({
        answer: input.card.answerText ?? "",
        claims,
        diagnosis,
        shortEvidenceRefs
      })
    : "";
  return parsePaidV3AnswerPacket({
    version: PAID_V3_ANSWER_PACKET_VERSION,
    questionId: input.card.questionId,
    question: input.card.exactQuestion,
    answer: input.card.answerText ?? "",
    claims,
    sourceIds,
    shortEvidenceRefs,
    diagnosis,
    caveats: [],
    authorityHash: input.authorityHash,
    status: input.status,
    attemptCount: attempts,
    providerAttempts: attempts,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    failureClassification: input.status === "failed" ? (input.failure?.classification ?? "unknown_permanent") : null,
    failureRetryReason: input.status === "failed"
      ? (input.failure
        ? `${input.failure.retryable ? "retryable" : "no_retry"}:${input.failure.reason}`.slice(0, 500)
        : "no_retry:unknown")
      : null,
    inputHash,
    outputHash
  });
}
function projectDiagnosis(diagnosis: {
  selectionSummary: string;
  targetGap: string;
  observableFactors?: readonly { kind?: string; observation: string; evidenceRefs?: readonly string[] }[];
  recommendedActions?: readonly { priority?: number; action: string; evidenceRefs?: readonly string[] }[];
  detailedEvidenceRefs?: readonly string[];
}, _sourceIds: readonly string[]): PaidV3AnswerPacketDiagnosis {
  const mapRefs = (refs: readonly string[] | undefined, path: string) => Object.freeze(uniqueIds(
    (refs ?? []).map((ref, i) => boundedText(ref, `${path}[${i}]`, PAID_V3_ANSWER_PACKET_BOUNDS.shortEvidenceRefMax)),
    path
  ));
  return Object.freeze({
    selectionSummary: boundedText(diagnosis.selectionSummary, "selectionSummary", PAID_V3_ANSWER_PACKET_BOUNDS.diagnosisSummaryMax),
    targetGap: boundedText(diagnosis.targetGap, "targetGap", PAID_V3_ANSWER_PACKET_BOUNDS.diagnosisGapMax),
    observableFactors: Object.freeze((diagnosis.observableFactors ?? []).slice(0, 8).map((factor, index) => Object.freeze({
      kind: boundedText(factor.kind ?? "problem_match", `observableFactors[${index}].kind`, 64),
      observation: boundedText(factor.observation, `observableFactors[${index}].observation`, PAID_V3_ANSWER_PACKET_BOUNDS.diagnosisObservationMax),
      evidenceRefs: mapRefs(factor.evidenceRefs, `observableFactors[${index}].evidenceRefs`)
    }))),
    recommendedActions: Object.freeze((diagnosis.recommendedActions ?? []).slice(0, 8).map((action, index) => Object.freeze({
      priority: typeof action.priority === "number" ? action.priority : index + 1,
      action: boundedText(action.action, `recommendedActions[${index}].action`, PAID_V3_ANSWER_PACKET_BOUNDS.diagnosisActionMax),
      evidenceRefs: mapRefs(action.evidenceRefs, `recommendedActions[${index}].evidenceRefs`)
    }))),
    detailedEvidenceRefs: mapRefs(diagnosis.detailedEvidenceRefs, "detailedEvidenceRefs")
  });
}
function parseDiagnosis(value: unknown, sourceIds: readonly string[]): PaidV3AnswerPacketDiagnosis {
  const row = asObject(value, "diagnosis");
  return projectDiagnosis({
    selectionSummary: String(row.selectionSummary ?? ""),
    targetGap: String(row.targetGap ?? ""),
    observableFactors: Array.isArray(row.observableFactors) ? row.observableFactors as PaidV3AnswerPacketDiagnosis["observableFactors"] : [],
    recommendedActions: Array.isArray(row.recommendedActions) ? row.recommendedActions as PaidV3AnswerPacketDiagnosis["recommendedActions"] : [],
    detailedEvidenceRefs: Array.isArray(row.detailedEvidenceRefs) ? row.detailedEvidenceRefs as string[] : []
  }, sourceIds);
}
function extractClaims(answer: string): readonly PaidV3AnswerPacketClaim[] {
  const parts = answer
    .split(/(?<=[。.!?\n])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, PAID_V3_ANSWER_PACKET_BOUNDS.claimsMax);
  if (parts.length === 0 && answer.trim()) {
    return Object.freeze([{ text: answer.trim().slice(0, PAID_V3_ANSWER_PACKET_BOUNDS.claimMax) }]);
  }
  return Object.freeze(parts.map((text) => Object.freeze({ text: text.slice(0, PAID_V3_ANSWER_PACKET_BOUNDS.claimMax) })));
}
function canonicalPacketBody(packet: PaidV3AnswerPacketV1): unknown {
  return {
    version: packet.version,
    questionId: packet.questionId,
    question: packet.question,
    answer: packet.answer,
    claims: packet.claims.map((claim) => ({ text: claim.text })),
    sourceIds: [...packet.sourceIds],
    shortEvidenceRefs: [...packet.shortEvidenceRefs],
    diagnosis: packet.diagnosis
      ? {
          selectionSummary: packet.diagnosis.selectionSummary,
          targetGap: packet.diagnosis.targetGap,
          observableFactors: packet.diagnosis.observableFactors.map((factor) => ({
            kind: factor.kind,
            observation: factor.observation,
            evidenceRefs: [...factor.evidenceRefs]
          })),
          recommendedActions: packet.diagnosis.recommendedActions.map((action) => ({
            priority: action.priority,
            action: action.action,
            evidenceRefs: [...action.evidenceRefs]
          })),
          detailedEvidenceRefs: [...packet.diagnosis.detailedEvidenceRefs]
        }
      : null,
    caveats: [...packet.caveats],
    inputHash: packet.inputHash,
    outputHash: packet.outputHash,
    authorityHash: packet.authorityHash,
    status: packet.status,
    attemptCount: packet.attemptCount,
    providerAttempts: packet.providerAttempts,
    startedAt: packet.startedAt,
    completedAt: packet.completedAt,
    failureClassification: packet.failureClassification,
    failureRetryReason: packet.failureRetryReason
  };
}
function asObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}
function requireArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`);
  if (value.length > max) throw new TypeError(`${path} exceeds max length ${max}.`);
  return value;
}
function boundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be text.`);
  if (value.length > max) throw new TypeError(`${path} exceeds max length ${max}.`);
  return value;
}
function requireExactString(value: unknown, expected: string, path: string): string {
  if (value !== expected) throw new TypeError(`${path} must be ${expected}.`);
  return expected;
}
function requireHash(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError(`${path} must be a 64-char lowercase hex hash.`);
  }
  return value;
}
function requireStatus(value: unknown): PaidV3AnswerPacketStatus {
  if (value !== "pending" && value !== "completed" && value !== "failed") {
    throw new TypeError("status must be pending|completed|failed.");
  }
  return value;
}
function requireAttempt(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > PAID_V3_ANSWER_PACKET_BOUNDS.attemptCountMax) {
    throw new TypeError(`${path} must be an integer 0..${PAID_V3_ANSWER_PACKET_BOUNDS.attemptCountMax}.`);
  }
  return value;
}
function requireIso(value: unknown, path: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${path} must be an ISO timestamp.`);
  }
  return value;
}
function uniqueIds(values: readonly string[], path: string): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new TypeError(`${path} contains duplicate id ${value}.`);
    seen.add(value);
  }
  return [...values];
}
function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(row).sort()) sorted[key] = sortValue(row[key]);
  return sorted;
}
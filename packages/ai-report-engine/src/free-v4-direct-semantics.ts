import { createHash } from "node:crypto";
export const FREE_V4_DIRECT_SEMANTICS_VERSION = "free-v4-direct-semantics-v1" as const;
export interface FreeV4DirectAnalysis {
  readonly summary: string; readonly observations: readonly string[]; readonly recommendations: readonly string[];
  readonly evidenceHandles: readonly string[];
}
export type FreeV4DirectAnalysisStatus = "completed" | "incomplete";
export interface FreeV4DirectEvidenceBinding {
  readonly handle: string; readonly evidenceRef: string;
}
export interface FreeV4DirectCoreReceiptInput {
  readonly questionSetIdentity: string; readonly questions: readonly string[];
  readonly questionId: string; readonly questionText: string; readonly answer: unknown; readonly sources: unknown;
  readonly providerResponseId: string | null; readonly providerId: string; readonly model: string;
  readonly searchMode: string; readonly searchedAt: string; readonly completedAt: string; readonly nonProseProjection: unknown;
}
export interface FreeV4DirectCoreReceipt {
  readonly version: typeof FREE_V4_DIRECT_SEMANTICS_VERSION; readonly kind: "core";
  readonly questionSetIdentity: string; readonly questionsHash: string; readonly questionId: string;
  readonly questionTextHash: string; readonly answerHash: string; readonly sourcesHash: string;
  readonly providerMetadataHash: string; readonly nonProseProjectionHash: string; readonly receiptHash: string;
}
export interface FreeV4DirectAnalysisReceiptInput {
  readonly coreReceiptHash: string; readonly analysis: FreeV4DirectAnalysis;
  readonly handleBindings: readonly FreeV4DirectEvidenceBinding[]; readonly nonProseProjection: unknown;
}
export interface FreeV4DirectAnalysisReceipt {
  readonly version: typeof FREE_V4_DIRECT_SEMANTICS_VERSION; readonly kind: "analysis";
  readonly coreReceiptHash: string; readonly analysisHash: string; readonly handleBindingsHash: string;
  readonly nonProseProjectionHash: string; readonly receiptHash: string;
}
const CORE_RECEIPT_FIELDS = new Set(["version", "kind", "questionSetIdentity", "questionsHash", "questionId", "questionTextHash", "answerHash", "sourcesHash", "providerMetadataHash", "nonProseProjectionHash", "receiptHash"]);
const ANALYSIS_RECEIPT_FIELDS = new Set(["version", "kind", "coreReceiptHash", "analysisHash", "handleBindingsHash", "nonProseProjectionHash", "receiptHash"]);
export function parseFreeV4DirectAnalysis(value: unknown, options: { readonly allowedEvidenceHandles: readonly string[] }): FreeV4DirectAnalysis {
  const row = object(value, "$analysis");
  if (canonicalJson(value).length > 50_000) throw new TypeError("$analysis exceeds the retained size bound.");
  const allowed = new Set(options.allowedEvidenceHandles.map((handle, index) =>
    boundedText(handle, `$allowedEvidenceHandles[${index}]`, 32)));
  const evidenceHandles = uniqueTextArray(row.evidenceHandles, "$analysis.evidenceHandles", 80, 32);
  const unknownHandle = evidenceHandles.find((handle) => !allowed.has(handle));
  if (unknownHandle) throw new TypeError(`$analysis.evidenceHandles references unknown handle ${unknownHandle}.`);
  return Object.freeze({
    summary: boundedText(row.summary, "$analysis.summary", 12_000),
    observations: Object.freeze(textArray(row.observations, "$analysis.observations", 40, 4_000)),
    recommendations: Object.freeze(textArray(row.recommendations, "$analysis.recommendations", 40, 4_000)),
    evidenceHandles: Object.freeze(evidenceHandles)
  });
}
export const hashFreeV4DirectSemanticValue = (value: unknown): string => sha256(canonicalJson(value));
export function createFreeV4DirectCoreReceipt(input: FreeV4DirectCoreReceiptInput): FreeV4DirectCoreReceipt {
  const core = coreReceiptBody(input); return Object.freeze({ ...core, receiptHash: hashFreeV4DirectSemanticValue(core) });
}
export function verifyFreeV4DirectCoreReceipt(value: unknown, input: FreeV4DirectCoreReceiptInput): FreeV4DirectCoreReceipt {
  const row = strictReceiptObject(value, "$freeDirectCoreReceipt", CORE_RECEIPT_FIELDS);
  const expected = createFreeV4DirectCoreReceipt(input);
  for (const key of Object.keys(expected) as Array<keyof FreeV4DirectCoreReceipt>) {
    if (row[key] !== expected[key]) throw new TypeError(`$freeDirectCoreReceipt.${key} does not match the current Q1 core.`);
  }
  return expected;
}
export function createFreeV4DirectAnalysisReceipt(input: FreeV4DirectAnalysisReceiptInput): FreeV4DirectAnalysisReceipt {
  const core = analysisReceiptBody(input); return Object.freeze({ ...core, receiptHash: hashFreeV4DirectSemanticValue(core) });
}
export function verifyFreeV4DirectAnalysisReceipt(value: unknown, input: FreeV4DirectAnalysisReceiptInput): FreeV4DirectAnalysisReceipt {
  const row = strictReceiptObject(value, "$freeDirectAnalysisReceipt", ANALYSIS_RECEIPT_FIELDS);
  const expected = createFreeV4DirectAnalysisReceipt(input);
  for (const key of Object.keys(expected) as Array<keyof FreeV4DirectAnalysisReceipt>) {
    if (row[key] !== expected[key]) throw new TypeError(`$freeDirectAnalysisReceipt.${key} does not match the current analysis.`);
  }
  return expected;
}
function coreReceiptBody(input: FreeV4DirectCoreReceiptInput): Omit<FreeV4DirectCoreReceipt, "receiptHash"> {
  const questionSetIdentity = boundedText(input.questionSetIdentity, "$coreReceiptInput.questionSetIdentity", 500);
  if (!Array.isArray(input.questions) || input.questions.length !== 3) throw new TypeError("$coreReceiptInput.questions must contain the three confirmed questions.");
  const questions = input.questions.map((question, index) => boundedText(question, `$coreReceiptInput.questions[${index}]`, 1_000));
  const providerMetadata = {
    providerResponseId: input.providerResponseId === null ? null : boundedText(input.providerResponseId, "$coreReceiptInput.providerResponseId", 500),
    providerId: boundedText(input.providerId, "$coreReceiptInput.providerId", 200),
    model: boundedText(input.model, "$coreReceiptInput.model", 500),
    searchMode: boundedText(input.searchMode, "$coreReceiptInput.searchMode", 200),
    searchedAt: timestamp(input.searchedAt, "$coreReceiptInput.searchedAt"),
    completedAt: timestamp(input.completedAt, "$coreReceiptInput.completedAt")
  };
  if (Date.parse(providerMetadata.completedAt) < Date.parse(providerMetadata.searchedAt)) throw new TypeError("$coreReceiptInput.completedAt must not precede searchedAt.");
  return Object.freeze({
    version: FREE_V4_DIRECT_SEMANTICS_VERSION,
    kind: "core" as const,
    questionSetIdentity,
    questionsHash: hashFreeV4DirectSemanticValue(questions),
    questionId: boundedText(input.questionId, "$coreReceiptInput.questionId", 500),
    questionTextHash: hashFreeV4DirectSemanticValue(boundedText(input.questionText, "$coreReceiptInput.questionText", 1_000)),
    answerHash: hashFreeV4DirectSemanticValue(input.answer),
    sourcesHash: hashFreeV4DirectSemanticValue(input.sources),
    providerMetadataHash: hashFreeV4DirectSemanticValue(providerMetadata),
    nonProseProjectionHash: hashFreeV4DirectSemanticValue(input.nonProseProjection)
  });
}
function analysisReceiptBody(input: FreeV4DirectAnalysisReceiptInput): Omit<FreeV4DirectAnalysisReceipt, "receiptHash"> {
  const handleBindings = parseHandleBindings(input.handleBindings);
  const analysis = parseFreeV4DirectAnalysis(input.analysis, { allowedEvidenceHandles: handleBindings.map(({ handle }) => handle) });
  return Object.freeze({
    version: FREE_V4_DIRECT_SEMANTICS_VERSION,
    kind: "analysis" as const,
    coreReceiptHash: shaText(input.coreReceiptHash, "$analysisReceiptInput.coreReceiptHash"),
    analysisHash: hashFreeV4DirectSemanticValue(analysis),
    handleBindingsHash: hashFreeV4DirectSemanticValue(handleBindings),
    nonProseProjectionHash: hashFreeV4DirectSemanticValue(input.nonProseProjection)
  });
}
function parseHandleBindings(value: readonly FreeV4DirectEvidenceBinding[]): readonly FreeV4DirectEvidenceBinding[] {
  if (!Array.isArray(value) || value.length > 80) throw new TypeError("$analysisReceiptInput.handleBindings must contain at most 80 items.");
  const bindings = value.map((binding, index) => Object.freeze({
    handle: boundedText(binding?.handle, `$analysisReceiptInput.handleBindings[${index}].handle`, 32),
    evidenceRef: boundedText(binding?.evidenceRef, `$analysisReceiptInput.handleBindings[${index}].evidenceRef`, 2_000)
  }));
  if (new Set(bindings.map(({ handle }) => handle)).size !== bindings.length) throw new TypeError("$analysisReceiptInput.handleBindings contains duplicate handles.");
  return Object.freeze(bindings);
}
const canonicalJson = (value: unknown): string => JSON.stringify(canonicalValue(value, new Set<object>()));
function canonicalValue(value: unknown, ancestors: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new TypeError("Canonical Free semantic JSON rejects non-finite numbers."); return value; }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new TypeError("Canonical Free semantic JSON rejects cycles.");
    ancestors.add(value);
    const result = value.map((item) => canonicalValue(item, ancestors)); ancestors.delete(value); return result;
  }
  if (value && typeof value === "object") {
    if (ancestors.has(value)) throw new TypeError("Canonical Free semantic JSON rejects cycles.");
    ancestors.add(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new TypeError("Canonical Free semantic JSON rejects undefined values.");
      result[key] = canonicalValue(item, ancestors);
    }
    ancestors.delete(value); return result;
  }
  throw new TypeError(`Canonical Free semantic JSON rejects ${typeof value} values.`);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be a JSON object.`); return value as Record<string, unknown>;
}
function strictReceiptObject(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  const row = object(value, path);
  const unknown = Object.keys(row).find((key) => !allowed.has(key));
  if (unknown || Object.keys(row).length !== allowed.size) throw new TypeError(`${path} does not have the exact receipt fields.`);
  return row;
}
function boundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty text no longer than ${max} characters.`); return value.trim();
}
function timestamp(value: unknown, path: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(`${path} must be an ISO timestamp.`); return value;
}
function shaText(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${path} must be a SHA-256 hex digest.`); return value;
}
function textArray(value: unknown, path: string, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new TypeError(`${path} must be an array with at most ${maxItems} items.`); return value.map((item, index) => boundedText(item, `${path}[${index}]`, maxChars));
}
function uniqueTextArray(value: unknown, path: string, maxItems: number, maxChars: number): string[] {
  const rows = textArray(value, path, maxItems, maxChars); if (new Set(rows).size !== rows.length) throw new TypeError(`${path} must not contain duplicates.`); return rows;
}
const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

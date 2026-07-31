import {
  hashReportSemanticReviewValue,
  reportSemanticTextHash,
  type ReportSemanticReviewInput
} from "@open-geo-console/ai-report-engine";
import {
  parsePaidV3AnswerPacket,
  type PaidV3AnswerPacketV1,
  type PaidV3PacketsByQuestion
} from "./paid-v3-answer-packet";
export const PAID_V3_COMPACT_TRANSPORT_VERSION = "paid-v3-compact-transport-v1" as const;
/** Locked websiteSynthesis profile limits — do not raise. */
export const PAID_V3_WEBSITE_SYNTHESIS_MAX_INPUT_TOKENS = 131_072;
export const PAID_V3_WEBSITE_SYNTHESIS_MAX_OUTPUT_TOKENS = 16_384;
export const PAID_V3_WEBSITE_SYNTHESIS_CONTEXT_WINDOW_TOKENS = 262_144;
/** Matches PROVIDER_SAFETY_MARGIN_TOKENS in mimo-provider. */
export const PAID_V3_WEBSITE_SYNTHESIS_SAFETY_MARGIN_TOKENS = 4_096;
export const PAID_V3_COMPACT_BOUNDS = Object.freeze({
  titleMax: 500,
  urlMax: 2_000,
  boundedExcerptMax: 1_200,
  sourcesMax: 60,
  reservedOutputTokensDefault: PAID_V3_WEBSITE_SYNTHESIS_MAX_OUTPUT_TOKENS,
  safetyMarginTokensDefault: PAID_V3_WEBSITE_SYNTHESIS_SAFETY_MARGIN_TOKENS,
  contextWindowTokensDefault: PAID_V3_WEBSITE_SYNTHESIS_CONTEXT_WINDOW_TOKENS
});
export interface PaidV3SourceDictionaryEntry {
  readonly sourceId: string;
  readonly url: string;
  readonly title: string;
  readonly boundedExcerpt: string;
  readonly hashes: {
    readonly urlHash: string;
    readonly titleHash: string;
    readonly excerptHash: string;
    readonly bodyHash: string;
  };
}
export type PaidV3SourceDictionary = Readonly<Record<string, PaidV3SourceDictionaryEntry>>;
export interface PaidV3CompactTransportInput {
  readonly version: typeof PAID_V3_COMPACT_TRANSPORT_VERSION;
  readonly canonicalInputHash: string;
  readonly transportInputHash: string;
  readonly packets: readonly PaidV3AnswerPacketV1[];
  readonly sourceDictionary: PaidV3SourceDictionary;
  readonly fieldPaths: readonly string[];
  readonly sourceSelectionCatalogIds: readonly string[];
  readonly questions: readonly { readonly questionId: string; readonly originalTextHash: string }[];
  readonly authorityBindings: unknown;
}
export interface PaidV3TransportTokenBreakdown {
  readonly packetTokensByQuestion: Readonly<Record<string, number>>;
  readonly sourceDictionaryTokens: number;
  readonly proseTokens: number;
  readonly systemTokens: number;
  readonly reservedOutputTokens: number;
  readonly safetyMarginTokens: number;
  readonly totalEstimatedTokens: number;
  readonly transportInputHash: string;
  readonly canonicalInputHash: string;
  readonly compactInputTokens: number;
}
export class PaidV3CompactTokenBudgetError extends Error {
  readonly code = "model_token_budget_rejected" as const;
  readonly retryable = false as const;
  readonly breakdown: PaidV3TransportTokenBreakdown;
  readonly limitKind: "max_input" | "max_output" | "context_window";
  constructor(
    breakdown: PaidV3TransportTokenBreakdown,
    limitKind: "max_input" | "max_output" | "context_window",
    limitTokens: number
  ) {
    const estimated = limitKind === "max_input"
      ? breakdown.compactInputTokens
      : limitKind === "max_output"
        ? breakdown.reservedOutputTokens
        : breakdown.totalEstimatedTokens;
    super(
      limitKind === "max_input"
        ? `Model input estimate ${estimated} exceeds the operation limit ${limitTokens}.`
        : limitKind === "max_output"
          ? `Model output reservation ${estimated} exceeds the operation limit ${limitTokens}.`
          : `Model Token budget ${estimated} exceeds the context window ${limitTokens}.`
    );
    this.name = "PaidV3CompactTokenBudgetError";
    this.breakdown = breakdown;
    this.limitKind = limitKind;
  }
}
export function estimatePaidV3ConservativeTokens(text: string): number {
  let ascii = 0;
  let nonAscii = 0;
  for (const char of text) {
    if (char.codePointAt(0)! < 0x80) ascii += 1;
    else nonAscii += 1;
  }
  return Math.ceil(ascii / 4) + nonAscii;
}
export function buildPaidV3SourceDictionary(
  sources: readonly {
    readonly sourceId: string;
    readonly canonicalUrl: string;
    readonly title?: string | null;
    readonly citedText?: string | null;
    readonly auditExcerpt?: string | null;
    readonly originalText?: string | null;
  }[]
): PaidV3SourceDictionary {
  if (sources.length > PAID_V3_COMPACT_BOUNDS.sourcesMax) {
    throw new TypeError(`Paid V3 source dictionary exceeds max ${PAID_V3_COMPACT_BOUNDS.sourcesMax} sources.`);
  }
  const dictionary: Record<string, PaidV3SourceDictionaryEntry> = {};
  const bodyOwner = new Map<string, string>();
  for (const source of sources) {
    const sourceId = requireText(source.sourceId, "sourceId", 300);
    if (dictionary[sourceId]) {
      throw new TypeError(`Paid V3 source dictionary duplicate sourceId ${sourceId}.`);
    }
    const url = requireText(source.canonicalUrl, "canonicalUrl", PAID_V3_COMPACT_BOUNDS.urlMax);
    const title = requireText(source.title ?? "", "title", PAID_V3_COMPACT_BOUNDS.titleMax);
    const body = pickBoundedExcerpt(source);
    const bodyHash = body.length > 0 ? reportSemanticTextHash(body) : reportSemanticTextHash(`empty:${sourceId}`);
    if (body.length > 0) {
      const priorOwner = bodyOwner.get(bodyHash);
      if (priorOwner && priorOwner !== sourceId) {
        throw new TypeError(
          `Paid V3 source dictionary repeats the same excerpt body for ${priorOwner} and ${sourceId}.`
        );
      }
      bodyOwner.set(bodyHash, sourceId);
    }
    dictionary[sourceId] = Object.freeze({
      sourceId,
      url,
      title,
      boundedExcerpt: body,
      hashes: Object.freeze({
        urlHash: reportSemanticTextHash(url),
        titleHash: reportSemanticTextHash(title.length > 0 ? title : `title:${sourceId}`),
        excerptHash: bodyHash,
        bodyHash
      })
    });
  }
  return Object.freeze(dictionary);
}
export function assertPacketsResolveToDictionary(
  packets: PaidV3PacketsByQuestion | readonly PaidV3AnswerPacketV1[],
  dictionary: PaidV3SourceDictionary
): void {
  const list = Array.isArray(packets) ? packets : Object.values(packets);
  for (const raw of list) {
    const packet = parsePaidV3AnswerPacket(raw);
    for (const sourceId of packet.sourceIds) {
      if (!dictionary[sourceId]) {
        throw new TypeError(`Paid V3 packet ${packet.questionId} references missing sourceId ${sourceId}.`);
      }
    }
  }
}
/** websiteSynthesis transport only; canonicalReviewInput stays receipt/apply authority. */
export function buildPaidV3CompactTransportInput(input: {
  readonly canonicalReviewInput: ReportSemanticReviewInput;
  readonly packets: PaidV3PacketsByQuestion | readonly PaidV3AnswerPacketV1[];
  readonly sourceDictionary: PaidV3SourceDictionary;
}): PaidV3CompactTransportInput {
  const canonical = input.canonicalReviewInput;
  if (!canonical.inputHash || !/^[a-f0-9]{64}$/u.test(canonical.inputHash)) {
    throw new TypeError("canonicalReviewInput.inputHash is required.");
  }
  const packetList = (Array.isArray(input.packets) ? input.packets : Object.values(input.packets))
    .map((packet) => parsePaidV3AnswerPacket(packet))
    .sort((left, right) => left.questionId.localeCompare(right.questionId));
  assertPacketsResolveToDictionary(packetList, input.sourceDictionary);
  for (const source of canonical.sources) {
    if (!input.sourceDictionary[source.sourceId]) {
      throw new TypeError(`Canonical source ${source.sourceId} missing from compact dictionary.`);
    }
  }
  assertNoBodyDuplicationAcrossCatalogs(canonical);
  const fieldPaths = canonical.fields.map((field) => field.path);
  const sourceSelectionCatalogIds = (canonical.sourceSelectionCatalog ?? []).map((entry) => entry.annotationId);
  const questions = canonical.questions.map((question) => ({
    questionId: question.questionId,
    originalTextHash: question.originalTextHash
  }));
  const transportCore = {
    version: PAID_V3_COMPACT_TRANSPORT_VERSION,
    canonicalInputHash: canonical.inputHash,
    packets: packetList,
    sourceDictionary: input.sourceDictionary,
    fieldPaths,
    sourceSelectionCatalogIds,
    questions,
    authorityBindings: canonical.authorityBindings ?? null
  };
  const transportInputHash = hashReportSemanticReviewValue(transportCore);
  return Object.freeze({
    ...transportCore,
    transportInputHash
  });
}
export function buildPaidV3CompactReviewUserText(input: {
  readonly transport: PaidV3CompactTransportInput;
  readonly canonicalReviewInput: ReportSemanticReviewInput;
}): string {
  const proseFields = input.canonicalReviewInput.fields.map((field) => ({
    path: field.path,
    originalText: field.originalText,
    originalTextHash: field.originalTextHash,
    mutability: field.mutability,
    questionId: field.questionId
  }));
  const c = input.canonicalReviewInput;
  const payload = {
    input: {
      inputHash: c.inputHash,
      canonicalInputHash: input.transport.canonicalInputHash,
      transportInputHash: input.transport.transportInputHash,
      version: c.version,
      lifecycle: c.lifecycle,
      evidencePolicy: c.evidencePolicy,
      locale: c.locale,
      target: c.target,
      expectedModel: c.expectedModel,
      questions: c.questions,
      answerSubjects: c.answerSubjects,
      authorityBindings: c.authorityBindings,
      nonProseProjectionHash: c.nonProseProjectionHash,
      fields: proseFields,
      sources: c.sources.map((s) => ({
        sourceId: s.sourceId, questionId: s.questionId, canonicalUrl: s.canonicalUrl,
        originalTextHash: s.originalTextHash, eligible: s.eligible
      })),
      evidence: c.evidence.map((e) => ({
        evidenceId: e.evidenceId, questionId: e.questionId, sourceId: e.sourceId,
        originalTextHash: e.originalTextHash, eligible: e.eligible
      })),
      observationResults: c.observationResults.map((row) => ({
        observationId: row.observationId, resultId: row.resultId, questionId: row.questionId,
        originalTextHash: row.originalTextHash
      })),
      entities: (c.entities ?? []).map((row) => ({
        entityId: row.entityId, questionId: row.questionId, kind: row.kind,
        originalTextHash: row.originalTextHash
      })),
      sourceSelectionCatalog: (c.sourceSelectionCatalog ?? []).map((entry) => ({
        annotationId: entry.annotationId, itemId: entry.itemId, kind: entry.kind,
        questionId: entry.questionId, sourceId: entry.sourceId, profileId: entry.profileId,
        actionId: entry.actionId, allowedEvidenceIds: entry.allowedEvidenceIds
      })),
      sourceDictionary: input.transport.sourceDictionary,
      packets: input.transport.packets
    }
  };
  if (payload.input.canonicalInputHash !== payload.input.inputHash) {
    throw new TypeError("canonicalInputHash must equal canonical review inputHash.");
  }
  return JSON.stringify(payload);
}
export function evaluatePaidV3CompactTokenBudget(input: {
  readonly systemText: string; readonly userText: string; readonly packets: readonly PaidV3AnswerPacketV1[];
  readonly sourceDictionary: PaidV3SourceDictionary; readonly proseFieldsText: string;
  readonly canonicalInputHash: string; readonly transportInputHash: string;
  readonly reservedOutputTokens?: number; readonly safetyMarginTokens?: number;
  readonly maxInputTokens?: number; readonly maxOutputTokens?: number; readonly contextWindowTokens?: number;
}): PaidV3TransportTokenBreakdown {
  const reservedOutputTokens = input.reservedOutputTokens ?? PAID_V3_COMPACT_BOUNDS.reservedOutputTokensDefault;
  const safetyMarginTokens = input.safetyMarginTokens ?? PAID_V3_COMPACT_BOUNDS.safetyMarginTokensDefault;
  const maxInputTokens = input.maxInputTokens ?? PAID_V3_WEBSITE_SYNTHESIS_MAX_INPUT_TOKENS;
  const maxOutputTokens = input.maxOutputTokens ?? PAID_V3_WEBSITE_SYNTHESIS_MAX_OUTPUT_TOKENS;
  const contextWindowTokens = input.contextWindowTokens ?? PAID_V3_COMPACT_BOUNDS.contextWindowTokensDefault;
  const compactInputTokens = estimatePaidV3ConservativeTokens(input.userText);
  const systemTokens = estimatePaidV3ConservativeTokens(input.systemText);
  const packetTokensByQuestion: Record<string, number> = {};
  for (const packet of input.packets) packetTokensByQuestion[packet.questionId] = estimatePaidV3ConservativeTokens(JSON.stringify(packet));
  const totalEstimatedTokens = systemTokens + compactInputTokens + reservedOutputTokens + safetyMarginTokens;
  const breakdown: PaidV3TransportTokenBreakdown = Object.freeze({
    packetTokensByQuestion: Object.freeze(packetTokensByQuestion),
    sourceDictionaryTokens: estimatePaidV3ConservativeTokens(JSON.stringify(input.sourceDictionary)),
    proseTokens: estimatePaidV3ConservativeTokens(input.proseFieldsText),
    systemTokens, reservedOutputTokens, safetyMarginTokens, compactInputTokens, totalEstimatedTokens,
    transportInputHash: input.transportInputHash, canonicalInputHash: input.canonicalInputHash
  });
  if (compactInputTokens > maxInputTokens) throw new PaidV3CompactTokenBudgetError(breakdown, "max_input", maxInputTokens);
  if (reservedOutputTokens > maxOutputTokens) throw new PaidV3CompactTokenBudgetError(breakdown, "max_output", maxOutputTokens);
  if (totalEstimatedTokens > contextWindowTokens) throw new PaidV3CompactTokenBudgetError(breakdown, "context_window", contextWindowTokens);
  return breakdown;
}
function pickBoundedExcerpt(source: {
  readonly citedText?: string | null;
  readonly auditExcerpt?: string | null;
  readonly originalText?: string | null;
}): string {
  const candidates = [source.auditExcerpt, source.citedText, source.originalText];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().slice(0, PAID_V3_COMPACT_BOUNDS.boundedExcerptMax);
    }
  }
  return "";
}
/** Fail closed if the same body is re-copied across catalog arrays. */
export function assertNoBodyDuplicationAcrossCatalogs(canonical: ReportSemanticReviewInput): void {
  const bodies = new Map<string, string>();
  const note = (path: string, originalText: string) => {
    if (!originalText || originalText.length < 40) return;
    const hash = reportSemanticTextHash(originalText);
    const prior = bodies.get(hash);
    if (prior && prior !== path && /^(sources|evidence|observationResults|entities)\[/u.test(prior) && /^(sources|evidence|observationResults|entities)\[/u.test(path)) {
      throw new TypeError(`Canonical review input re-copies source body across ${prior} and ${path}.`);
    }
    bodies.set(hash, path);
  };
  canonical.sources.forEach((source, index) => note(`sources[${index}]`, source.originalText));
  canonical.evidence.forEach((evidence, index) => note(`evidence[${index}]`, evidence.originalText));
  canonical.observationResults.forEach((row, index) => note(`observationResults[${index}]`, row.originalText));
  (canonical.entities ?? []).forEach((row, index) => note(`entities[${index}]`, row.originalText));
}
function requireText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string") throw new TypeError(`${path} must be text.`);
  if (value.length > max) throw new TypeError(`${path} exceeds max length ${max}.`);
  return value;
}
export function slimOriginalTextPlaceholder(sourceId: string, originalTextHash: string): string {
  return JSON.stringify({ sourceId, originalTextHash, body: "dictionary" });
}
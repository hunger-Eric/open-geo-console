import {
  toCanonicalBuyerQuestionSet,
  type ConfirmedBusinessQuestionSet
} from "@open-geo-console/public-search-observer";
import type { JsonCompletionClient } from "./client";
import { sha256Hex } from "./evidence";
import {
  ReportLanguageValidationError,
  assertReportLanguage,
  reportLanguageCorrectionFeedback,
  reportLanguageInstruction
} from "./report-language";

export const OPEN_GEO_ANSWER_V3_VERSION = "open-geo-answer-v3" as const;
export const OPEN_GEO_ENGINE_ID = "open_geo_public_search_answer_v1" as const;

export type OpenGeoAnswerOwnershipCategoryV3 =
  | "target_owned"
  | "competitor_owned"
  | "third_party_editorial"
  | "directory"
  | "government"
  | "other";

export interface OpenGeoAnswerEvidenceV3 {
  evidenceId: string;
  questionId: string;
  subjectKey: string;
  canonicalUrl: string;
  title: string;
  registrableDomain: string;
  ownershipCategory: OpenGeoAnswerOwnershipCategoryV3;
  exactExcerpt: string;
  observedAt: string;
  eligible: boolean;
  direct: boolean;
}

export interface OpenGeoAnswerSentenceV3 {
  sentenceId: string;
  kind: "grounded_claim" | "scope_note";
  text: string;
  evidenceIds: string[];
  confidence?: "verified" | "limited";
}

export interface OpenGeoAnswerCardV3 {
  questionId: string;
  exactQuestion: string;
  status: "answered" | "limited" | "insufficient";
  sentences: OpenGeoAnswerSentenceV3[];
  sourceEvidence: OpenGeoAnswerEvidenceV3[];
  coverage: {
    plannedQueries: number;
    completedQueries: number;
    returnedResults: number;
    attemptedRetrievals: number;
    safelyRetrievedPages: number;
    eligibleDirectEvidence: number;
    reasons: string[];
  };
  geoDiagnosis: {
    targetMentioned: boolean;
    targetFirstSentence: number | null;
    targetRoles: string[];
    competitorEntityIds: string[];
    citedOwnership: Record<OpenGeoAnswerOwnershipCategoryV3, number>;
    missingEvidenceFamilies: string[];
    retestQuestion: string;
  };
}

export interface OpenGeoEngineProvenanceV3 {
  engineId: typeof OPEN_GEO_ENGINE_ID;
  searchSurface: string;
  queryPlanVersion: string;
  passageSelectorVersion: string;
  synthesisModel: string;
  synthesisPromptVersion: string;
  locale: string;
  region: string;
  searchedAt: string;
  evidenceCutoffAt: string;
  synthesizedAt: string;
  inputHash: string;
  evidenceHash: string;
  answerHash: string;
}

export interface OpenGeoAnswerCardsV3Context {
  questionSet: ConfirmedBusinessQuestionSet;
  locale: string;
  targetAliases?: readonly string[];
  competitors?: readonly { entityId: string; aliases: readonly string[] }[];
  missingEvidenceFamiliesByQuestion?: readonly [readonly string[], readonly string[], readonly string[]];
}

export interface OpenGeoAnswerSynthesisV3Input extends OpenGeoAnswerCardsV3Context {
  evidence: readonly OpenGeoAnswerEvidenceV3[];
  coverageByQuestion: readonly [OpenGeoAnswerCardV3["coverage"], OpenGeoAnswerCardV3["coverage"], OpenGeoAnswerCardV3["coverage"]];
  signal?: AbortSignal;
}

const OWNERSHIP_CATEGORIES: readonly OpenGeoAnswerOwnershipCategoryV3[] = [
  "target_owned", "competitor_owned", "third_party_editorial", "directory", "government", "other"
];

export function parseOpenGeoAnswerCardsV3(
  value: unknown,
  context: OpenGeoAnswerCardsV3Context
): [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3] {
  const rows = array(value, "$answerCards");
  if (rows.length !== 3) throw new TypeError("Open GEO V3 requires exactly three answer cards.");
  const canonical = canonicalQuestions(context.questionSet);
  const parsed = rows.map((value, cardIndex) => parseCard(value, cardIndex, canonical[cardIndex]!, context));
  if (new Set(parsed.map(({ questionId }) => questionId)).size !== 3) {
    throw new TypeError("Open GEO V3 answer-card question IDs must be unique.");
  }
  const generatedFields = parsed.flatMap((card, cardIndex) => [
    ...card.sentences.map((sentence, sentenceIndex) => ({ path: `answerCards[${cardIndex}].sentences[${sentenceIndex}].text`, text: sentence.text })),
    ...card.coverage.reasons.map((text, index) => ({ path: `answerCards[${cardIndex}].coverage.reasons[${index}]`, text })),
    ...card.geoDiagnosis.targetRoles.map((text, index) => ({ path: `answerCards[${cardIndex}].geoDiagnosis.targetRoles[${index}]`, text })),
    ...card.geoDiagnosis.missingEvidenceFamilies.map((text, index) => ({ path: `answerCards[${cardIndex}].geoDiagnosis.missingEvidenceFamilies[${index}]`, text }))
  ]);
  const allowedTerms = [
    ...(context.targetAliases ?? []),
    ...(context.competitors ?? []).flatMap(({ aliases }) => aliases)
  ];
  assertReportLanguage(generatedFields, context.locale, allowedTerms);
  return parsed as [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}

export function diagnoseOpenGeoAnswerCardV3(
  card: Pick<OpenGeoAnswerCardV3, "sentences" | "sourceEvidence">,
  input: {
    exactQuestion: string;
    targetAliases: readonly string[];
    competitors: readonly { entityId: string; aliases: readonly string[] }[];
    missingEvidenceFamilies: readonly string[];
  }
): OpenGeoAnswerCardV3["geoDiagnosis"] {
  const claims = card.sentences.filter(({ kind }) => kind === "grounded_claim");
  const targetFirstIndex = claims.findIndex(({ text }) => includesAlias(text, input.targetAliases));
  const competitorEntityIds = input.competitors
    .filter(({ aliases }) => claims.some(({ text }) => includesAlias(text, aliases)))
    .map(({ entityId }) => entityId);
  const citedIds = new Set(claims.flatMap(({ evidenceIds }) => evidenceIds));
  const citedOwnership = ownershipCounts();
  for (const evidence of card.sourceEvidence) {
    if (citedIds.has(evidence.evidenceId)) citedOwnership[evidence.ownershipCategory] += 1;
  }
  return {
    targetMentioned: targetFirstIndex >= 0,
    targetFirstSentence: targetFirstIndex >= 0 ? targetFirstIndex + 1 : null,
    targetRoles: targetFirstIndex >= 0 ? [localized(input.exactQuestion, "答案主体", "answer subject")] : [],
    competitorEntityIds: [...new Set(competitorEntityIds)],
    citedOwnership,
    missingEvidenceFamilies: [...new Set(input.missingEvidenceFamilies.map((item) => item.trim()).filter(Boolean))],
    retestQuestion: input.exactQuestion
  };
}

export async function synthesizeOpenGeoAnswerCardsV3(
  client: JsonCompletionClient,
  input: OpenGeoAnswerSynthesisV3Input
): Promise<[OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3]> {
  const canonical = canonicalQuestions(input.questionSet);
  const compact = canonical.map((question, index) => ({
    questionId: question.id,
    exactQuestion: question.exactQuestion,
    evidence: input.evidence
      .filter(({ questionId, eligible, direct }) => questionId === question.id && eligible && direct)
      .map(({ evidenceId, subjectKey, canonicalUrl, title, registrableDomain, ownershipCategory, exactExcerpt, observedAt }) => ({
        evidenceId, subjectKey, canonicalUrl, title, registrableDomain, ownershipCategory, exactExcerpt, observedAt
      }))
  }));
  let correction: string[] | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    input.signal?.throwIfAborted();
    try {
      const completion = await client.completeJson({
        signal: input.signal,
        temperature: 0.1,
        maxTokens: 3_500,
        messages: [
          {
            role: "system",
            content: [
              "Return JSON only. Write ordered factual sentences using only the supplied evidence for the same question and subject.",
              "Never use prior knowledge or search-result titles as facts. Every sentence must list the exact evidence IDs that support it.",
              "Do not write an answer when no direct evidence supports it.",
              reportLanguageInstruction(input.locale),
              ...(correction ?? [])
            ].join("\n")
          },
          {
            role: "user",
            content: JSON.stringify({
              version: OPEN_GEO_ANSWER_V3_VERSION,
              questions: compact,
              requiredShape: {
                answers: [{
                  questionId: "exact supplied id",
                  sentences: [{ sentenceId: "stable id", text: "one factual sentence", evidenceIds: ["exact supplied evidence id"], confidence: "verified|limited" }]
                }]
              }
            })
          }
        ]
      });
      const model = record(completion.value, "$model");
      const answers = array(model.answers, "$model.answers");
      if (answers.length !== 3) throw new TypeError("Model must return exactly three ordered answer entries.");
      const cards = answers.map((value, cardIndex) => {
        const answer = record(value, `$model.answers[${cardIndex}]`);
        const question = canonical[cardIndex]!;
        exact(answer.questionId, question.id, `$model.answers[${cardIndex}].questionId`);
        const permitted = new Map(input.evidence
          .filter(({ questionId, eligible, direct }) => questionId === question.id && eligible && direct)
          .map((evidence) => [evidence.evidenceId, evidence]));
        const claims = array(answer.sentences, `$model.answers[${cardIndex}].sentences`).map((value, sentenceIndex) => {
          const sentence = record(value, `$model.answers[${cardIndex}].sentences[${sentenceIndex}]`);
          const evidenceIds = stringArray(sentence.evidenceIds, `$model.answers[${cardIndex}].sentences[${sentenceIndex}].evidenceIds`);
          if (evidenceIds.some((id) => !permitted.has(id))) throw new TypeError("Model sentence cites unsupported evidence.");
          const citedEvidence = evidenceIds.map((id) => permitted.get(id)!);
          const requestedConfidence = oneOf(sentence.confidence, ["verified", "limited"] as const, "confidence");
          const subjectCount = new Set(citedEvidence.map(({ subjectKey }) => subjectKey)).size;
          const independentDomainCount = new Set(citedEvidence.map(({ registrableDomain }) => registrableDomain.toLocaleLowerCase())).size;
          return {
            sentenceId: text(sentence.sentenceId, "sentenceId"),
            kind: "grounded_claim" as const,
            text: text(sentence.text, "text"),
            evidenceIds,
            confidence: requestedConfidence === "verified" && subjectCount === 1 && independentDomainCount >= 2
              ? "verified" as const
              : "limited" as const
          };
        });
        const coverage = parseCoverage(input.coverageByQuestion[cardIndex], `coverageByQuestion[${cardIndex}]`);
        const hasShortfall = coverage.completedQueries < coverage.plannedQueries || coverage.reasons.length > 0;
        const status: OpenGeoAnswerCardV3["status"] = claims.length === 0
          ? "insufficient"
          : claims.some(({ confidence }) => confidence === "limited") || hasShortfall ? "limited" : "answered";
        const sourceEvidence = [...new Set(claims.flatMap(({ evidenceIds }) => evidenceIds))].map((id) => permitted.get(id)!);
        const sentences: OpenGeoAnswerSentenceV3[] = [...claims];
        if (status === "limited") sentences.push(deterministicLimitedNote(question.id, input.locale));
        const draft = { questionId: question.id, exactQuestion: question.exactQuestion, status, sentences, sourceEvidence, coverage };
        return {
          ...draft,
          geoDiagnosis: diagnoseOpenGeoAnswerCardV3(draft, {
            exactQuestion: question.exactQuestion,
            targetAliases: input.targetAliases ?? [],
            competitors: input.competitors ?? [],
            missingEvidenceFamilies: input.missingEvidenceFamiliesByQuestion?.[cardIndex] ?? []
          })
        };
      });
      return parseOpenGeoAnswerCardsV3(cards, input);
    } catch (error) {
      lastError = error;
      if (!(error instanceof TypeError) || attempt === 1) throw error;
      correction = error instanceof ReportLanguageValidationError
        ? reportLanguageCorrectionFeedback(error, input.locale)
        : [`The prior JSON failed contract validation: ${error.message}`];
    }
  }
  throw lastError;
}

export async function openGeoAnswerInputHashV3(input: OpenGeoAnswerSynthesisV3Input): Promise<string> {
  const canonical = canonicalQuestions(input.questionSet);
  return sha256Hex(JSON.stringify({
    version: OPEN_GEO_ANSWER_V3_VERSION,
    locale: input.locale,
    questions: canonical,
    evidenceHash: await openGeoAnswerEvidenceHashV3(input.evidence),
    coverage: input.coverageByQuestion
  }));
}

export async function openGeoAnswerEvidenceHashV3(evidence: readonly OpenGeoAnswerEvidenceV3[]): Promise<string> {
  return sha256Hex(JSON.stringify([...evidence].sort((left, right) => left.evidenceId.localeCompare(right.evidenceId))));
}

export async function openGeoAnswerHashV3(cards: readonly OpenGeoAnswerCardV3[]): Promise<string> {
  return sha256Hex(JSON.stringify(cards));
}

function parseCard(
  value: unknown,
  cardIndex: number,
  canonical: { id: string; exactQuestion: string },
  context: OpenGeoAnswerCardsV3Context
): OpenGeoAnswerCardV3 {
  const path = `$answerCards[${cardIndex}]`;
  const row = record(value, path);
  exact(row.questionId, canonical.id, `${path}.questionId`);
  exact(row.exactQuestion, canonical.exactQuestion, `${path}.exactQuestion`);
  const status = oneOf(row.status, ["answered", "limited", "insufficient"] as const, `${path}.status`);
  if (status === "insufficient" && array(row.sentences, `${path}.sentences`).length > 0) {
    throw new TypeError(`${path} insufficient evidence cannot contain model-authored answer prose.`);
  }
  const sourceEvidence = array(row.sourceEvidence, `${path}.sourceEvidence`).map((item, index) => parseEvidence(item, `${path}.sourceEvidence[${index}]`, canonical.id));
  if (new Set(sourceEvidence.map(({ evidenceId }) => evidenceId)).size !== sourceEvidence.length) throw new TypeError(`${path} evidence IDs must be unique.`);
  const evidenceMap = new Map(sourceEvidence.map((evidence) => [evidence.evidenceId, evidence]));
  const sentences = array(row.sentences, `${path}.sentences`).map((item, index) => parseSentence(item, `${path}.sentences[${index}]`, evidenceMap, context.locale));
  if (new Set(sentences.map(({ sentenceId }) => sentenceId)).size !== sentences.length) throw new TypeError(`${path} sentence IDs must be unique.`);
  const claims = sentences.filter(({ kind }) => kind === "grounded_claim");
  const coverage = parseCoverage(row.coverage, `${path}.coverage`, sourceEvidence.length);
  const materialShortfall = coverage.completedQueries < coverage.plannedQueries || coverage.reasons.length > 0;
  if (status === "answered" && (!claims.length || claims.some(({ confidence }) => confidence !== "verified") || materialShortfall)) {
    throw new TypeError(`${path} answered status requires grounded verified claims and complete coverage.`);
  }
  if (status === "limited") {
    if (!claims.length || (!materialShortfall && claims.every(({ confidence }) => confidence === "verified"))) throw new TypeError(`${path} limited status requires a grounded limitation.`);
    const expectedNote = deterministicLimitedNote(canonical.id, context.locale);
    if (!sentences.some((sentence) => sentence.kind === "scope_note" && sentence.text === expectedNote.text)) {
      throw new TypeError(`${path} limited status requires deterministic limitation copy.`);
    }
  }
  const expectedDiagnosis = diagnoseOpenGeoAnswerCardV3({ sentences, sourceEvidence }, {
    exactQuestion: canonical.exactQuestion,
    targetAliases: context.targetAliases ?? [],
    competitors: context.competitors ?? [],
    missingEvidenceFamilies: context.missingEvidenceFamiliesByQuestion?.[cardIndex] ?? []
  });
  parseDiagnosis(row.geoDiagnosis, `${path}.geoDiagnosis`);
  return { questionId: canonical.id, exactQuestion: canonical.exactQuestion, status, sentences, sourceEvidence, coverage, geoDiagnosis: expectedDiagnosis };
}

function parseEvidence(value: unknown, path: string, questionId: string): OpenGeoAnswerEvidenceV3 {
  const row = record(value, path);
  if (row.questionId !== questionId) throw new TypeError(`${path} must bind evidence to the same question.`);
  const canonicalUrl = httpUrl(row.canonicalUrl, `${path}.canonicalUrl`);
  const exactExcerpt = text(row.exactExcerpt, `${path}.exactExcerpt`);
  if (exactExcerpt.length > 1_200) throw new TypeError(`${path}.exactExcerpt exceeds the retained bound.`);
  return {
    evidenceId: text(row.evidenceId, `${path}.evidenceId`),
    questionId,
    subjectKey: text(row.subjectKey, `${path}.subjectKey`),
    canonicalUrl,
    title: text(row.title, `${path}.title`),
    registrableDomain: text(row.registrableDomain, `${path}.registrableDomain`).toLocaleLowerCase(),
    ownershipCategory: oneOf(row.ownershipCategory, OWNERSHIP_CATEGORIES, `${path}.ownershipCategory`),
    exactExcerpt,
    observedAt: timestamp(row.observedAt, `${path}.observedAt`),
    eligible: bool(row.eligible, `${path}.eligible`),
    direct: bool(row.direct, `${path}.direct`)
  };
}

function parseSentence(
  value: unknown,
  path: string,
  evidence: Map<string, OpenGeoAnswerEvidenceV3>,
  locale: string
): OpenGeoAnswerSentenceV3 {
  const row = record(value, path);
  const kind = oneOf(row.kind, ["grounded_claim", "scope_note"] as const, `${path}.kind`);
  const sentenceText = text(row.text, `${path}.text`).replace(/\s+/g, " ").trim();
  const evidenceIds = stringArray(row.evidenceIds, `${path}.evidenceIds`);
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new TypeError(`${path} evidence IDs must be unique.`);
  if (kind === "scope_note") {
    if (evidenceIds.length || row.confidence !== undefined) throw new TypeError(`${path} scope notes cannot cite evidence or claim confidence.`);
    return { sentenceId: text(row.sentenceId, `${path}.sentenceId`), kind, text: sentenceText, evidenceIds: [] };
  }
  if (!evidenceIds.length) throw new TypeError(`${path} grounded claims require evidence.`);
  const sources = evidenceIds.map((id) => evidence.get(id));
  if (sources.some((source) => !source || !source.eligible || !source.direct)) throw new TypeError(`${path} contains unsupported or indirect evidence.`);
  if (new Set(sources.map((source) => source!.questionId)).size !== 1) throw new TypeError(`${path} evidence must bind to the same question.`);
  if (new Set(sources.map((source) => source!.subjectKey)).size !== 1) throw new TypeError(`${path} evidence must bind to the same subject.`);
  const confidence = oneOf(row.confidence, ["verified", "limited"] as const, `${path}.confidence`);
  const domains = new Set(sources.map((source) => source!.registrableDomain.toLocaleLowerCase()));
  if (confidence === "verified" && domains.size < 2) throw new TypeError(`${path} verified confidence requires two independent registrable domains.`);
  if (sentenceText.length < (locale.toLowerCase().startsWith("zh") ? 6 : 12) || sentenceText.length > 600) throw new TypeError(`${path}.text must be one bounded factual sentence.`);
  return { sentenceId: text(row.sentenceId, `${path}.sentenceId`), kind, text: sentenceText, evidenceIds, confidence };
}

function parseCoverage(value: unknown, path: string, legacyEligibleEvidence = 0): OpenGeoAnswerCardV3["coverage"] {
  const row = record(value, path);
  const plannedQueries = nonnegative(row.plannedQueries, `${path}.plannedQueries`);
  const completedQueries = nonnegative(row.completedQueries, `${path}.completedQueries`);
  if (completedQueries > plannedQueries) throw new TypeError(`${path} completed queries cannot exceed planned queries.`);
  return {
    plannedQueries,
    completedQueries,
    returnedResults: nonnegative(row.returnedResults, `${path}.returnedResults`),
    attemptedRetrievals: row.attemptedRetrievals === undefined
      ? nonnegative(row.safelyRetrievedPages, `${path}.safelyRetrievedPages`)
      : nonnegative(row.attemptedRetrievals, `${path}.attemptedRetrievals`),
    safelyRetrievedPages: nonnegative(row.safelyRetrievedPages, `${path}.safelyRetrievedPages`),
    eligibleDirectEvidence: row.eligibleDirectEvidence === undefined
      ? legacyEligibleEvidence
      : nonnegative(row.eligibleDirectEvidence, `${path}.eligibleDirectEvidence`),
    reasons: array(row.reasons, `${path}.reasons`).map((item, index) => text(item, `${path}.reasons[${index}]`))
  };
}

function parseDiagnosis(value: unknown, path: string): void {
  const row = record(value, path);
  bool(row.targetMentioned, `${path}.targetMentioned`);
  if (row.targetFirstSentence !== null) nonnegative(row.targetFirstSentence, `${path}.targetFirstSentence`);
  stringArray(row.targetRoles, `${path}.targetRoles`);
  stringArray(row.competitorEntityIds, `${path}.competitorEntityIds`);
  const ownership = record(row.citedOwnership, `${path}.citedOwnership`);
  OWNERSHIP_CATEGORIES.forEach((category) => nonnegative(ownership[category], `${path}.citedOwnership.${category}`));
  stringArray(row.missingEvidenceFamilies, `${path}.missingEvidenceFamilies`);
  text(row.retestQuestion, `${path}.retestQuestion`);
}

function deterministicLimitedNote(questionId: string, locale: string): OpenGeoAnswerSentenceV3 {
  return {
    sentenceId: `scope-${questionId}`,
    kind: "scope_note",
    text: locale.toLowerCase().startsWith("zh")
      ? "当前结论仅有单一来源或检索覆盖不足，尚不能视为独立交叉验证。"
      : "This conclusion has only one source or incomplete retrieval coverage and is not independently verified.",
    evidenceIds: []
  };
}

function canonicalQuestions(questionSet: ConfirmedBusinessQuestionSet): readonly [
  { id: string; exactQuestion: string },
  { id: string; exactQuestion: string },
  { id: string; exactQuestion: string }
] {
  const publicQuestions = toCanonicalBuyerQuestionSet(questionSet).questions;
  return questionSet.questions.map((question, index) => ({ id: publicQuestions[index]!.id, exactQuestion: question.privateText })) as unknown as readonly [
    { id: string; exactQuestion: string }, { id: string; exactQuestion: string }, { id: string; exactQuestion: string }
  ];
}

function ownershipCounts(): Record<OpenGeoAnswerOwnershipCategoryV3, number> {
  return { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0 };
}
function includesAlias(textValue: string, aliases: readonly string[]): boolean { const normalized = normalize(textValue); return aliases.some((alias) => alias.trim() && normalized.includes(normalize(alias))); }
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function localized(seed: string, zh: string, en: string): string { return /[\u3400-\u9fff]/u.test(seed) ? zh : en; }
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value.trim(); }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T { if (!allowed.includes(value as T)) throw new TypeError(`${path} is unsupported.`); return value as T; }
function nonnegative(value: unknown, path: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`${path} must be a non-negative integer.`); return Number(value); }
function bool(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${path} must be boolean.`); return value; }
function stringArray(value: unknown, path: string): string[] { return array(value, path).map((item, index) => text(item, `${path}[${index}]`)); }
function timestamp(value: unknown, path: string): string { const result = text(value, path); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${path} must be an ISO timestamp.`); return result; }
function httpUrl(value: unknown, path: string): string { const result = text(value, path); const url = new URL(result); if (!/^https?:$/.test(url.protocol)) throw new TypeError(`${path} must be HTTP(S).`); return url.href; }

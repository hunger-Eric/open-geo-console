import {
  toCanonicalBuyerQuestionSet,
  type ConfirmedBusinessQuestionSet
} from "@open-geo-console/public-search-observer";
import { canonicalizePublicSourceUrl, getPublicSourceDomainIdentity } from "@open-geo-console/citation-intelligence";
import { isBlockedHostname, parseHttpUrl } from "@open-geo-console/site-crawler";
import type { JsonCompletionClient } from "./client";
import { sha256Hex } from "./evidence";
import type { GenerativeSearchRefusal, GenerativeSearchSource } from "./generative-search-answer";
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
  | "other" | "institution" | "community" | "social" | "unknown";

export interface OpenGeoAnswerDiagnosisV3 {
  targetMentioned: boolean; targetFirstSentence: number | null; targetRoles: string[];
  competitorEntityIds: string[]; citedOwnership: Record<OpenGeoAnswerOwnershipCategoryV3, number>;
  missingEvidenceFamilies: string[]; retestQuestion: string;
}

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
  kind: "grounded_claim" | "observed_claim" | "scope_note";
  text: string;
  evidenceIds: string[];
  confidence?: "verified" | "limited" | "observed";
}

export interface LegacyEvidenceBoundAnswerCardV3 {
  answerMode?: "legacy_evidence_bound_v1";
  questionId: string;
  exactQuestion: string;
  status: "answered" | "limited" | "observed" | "unresolved" | "insufficient";
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
  geoDiagnosis: OpenGeoAnswerDiagnosisV3;
}
export interface GenerativeSearchAnswerSourceV3 extends GenerativeSearchSource { retrievalStatus: "verified_body" | "search_source_only" | "inaccessible"; ownershipCategory: OpenGeoAnswerOwnershipCategoryV3; }
export interface GenerativeSearchAnswerProvenanceV3 { providerId:string; model:string; searchMode:string; promptVersion:"generative-search-answer-v1"; searchedAt:string; completedAt:string; answerHash:string; sourceHash:string; }
export interface GenerativeSearchAnswerCardV3 {
  answerMode:"generative_search_v1"; questionId:string; exactQuestion:string;
  status:"answered"|"source_limited"|"refused"; answerText:string; sources:GenerativeSearchAnswerSourceV3[];
  provenance:GenerativeSearchAnswerProvenanceV3; refusal:GenerativeSearchRefusal|null; geoDiagnosis:OpenGeoAnswerDiagnosisV3;
  audit:{verifiedBodyCount:number;searchSourceOnlyCount:number;inaccessibleCount:number};
}
export type OpenGeoAnswerCardV3 = LegacyEvidenceBoundAnswerCardV3 | GenerativeSearchAnswerCardV3;

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
  coverageByQuestion: readonly [LegacyEvidenceBoundAnswerCardV3["coverage"], LegacyEvidenceBoundAnswerCardV3["coverage"], LegacyEvidenceBoundAnswerCardV3["coverage"]];
  signal?: AbortSignal;
}

const OWNERSHIP_CATEGORIES: readonly OpenGeoAnswerOwnershipCategoryV3[] = [
  "target_owned", "competitor_owned", "third_party_editorial", "directory", "government", "other", "institution", "community", "social", "unknown"
];

export function parseOpenGeoAnswerCardsV3(
  value: unknown,
  context: OpenGeoAnswerCardsV3Context
): [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3] {
  const rows = array(value, "$answerCards");
  if (rows.length !== 3) throw new TypeError("Open GEO V3 requires exactly three answer cards.");
  const canonical = canonicalQuestions(context.questionSet);
  const parsed = rows.map((value, cardIndex) => record(value, `$answerCards[${cardIndex}]`).answerMode === "generative_search_v1"
    ? parseGenerativeCard(value, cardIndex, canonical[cardIndex]!, context)
    : parseCard(value, cardIndex, canonical[cardIndex]!, context));
  if (new Set(parsed.map(({ questionId }) => questionId)).size !== 3) {
    throw new TypeError("Open GEO V3 answer-card question IDs must be unique.");
  }
  const generatedFields = parsed.flatMap((card, cardIndex) => {
    if (card.answerMode === "generative_search_v1") { const generated = card as GenerativeSearchAnswerCardV3; return [{ path: `answerCards[${cardIndex}].answerText`, text: generated.answerText }, ...(generated.refusal ? [{path:`answerCards[${cardIndex}].refusal.reason`,text:generated.refusal.reason}] : []), ...generated.geoDiagnosis.targetRoles.map((text, index) => ({ path: `answerCards[${cardIndex}].geoDiagnosis.targetRoles[${index}]`, text })), ...generated.geoDiagnosis.missingEvidenceFamilies.map((text,index)=>({path:`answerCards[${cardIndex}].geoDiagnosis.missingEvidenceFamilies[${index}]`,text}))]; }
    const legacy = card as LegacyEvidenceBoundAnswerCardV3;
    return [
      ...legacy.sentences.map((sentence, sentenceIndex) => ({ path: `answerCards[${cardIndex}].sentences[${sentenceIndex}].text`, text: sentence.text })),
      ...legacy.coverage.reasons.map((text, index) => ({ path: `answerCards[${cardIndex}].coverage.reasons[${index}]`, text })),
      ...card.geoDiagnosis.targetRoles.map((text, index) => ({ path: `answerCards[${cardIndex}].geoDiagnosis.targetRoles[${index}]`, text })),
      ...card.geoDiagnosis.missingEvidenceFamilies.map((text, index) => ({ path: `answerCards[${cardIndex}].geoDiagnosis.missingEvidenceFamilies[${index}]`, text }))
    ];
  });
  const allowedTerms = [
    ...(context.targetAliases ?? []),
    ...(context.competitors ?? []).flatMap(({ aliases }) => aliases)
  ];
  assertReportLanguage(generatedFields, context.locale, allowedTerms);
  return parsed as [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}

export function diagnoseOpenGeoAnswerCardV3(
  card: Pick<LegacyEvidenceBoundAnswerCardV3, "sentences" | "sourceEvidence">,
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

export function diagnoseGenerativeSearchAnswerCardV3(card: Pick<GenerativeSearchAnswerCardV3, "answerText"|"sources">, input: { exactQuestion:string; locale?:string; targetAliases:readonly string[]; competitors:readonly {entityId:string;aliases:readonly string[]}[]; missingEvidenceFamilies:readonly string[] }): OpenGeoAnswerDiagnosisV3 {
  const sentences = card.answerText.split(/(?<=[.!?。！？])\s+/u).filter(Boolean);
  const targetFirstIndex = sentences.findIndex((s) => includesAlias(s, input.targetAliases));
  const competitorEntityIds = input.competitors.filter(({aliases}) => sentences.some((s) => includesAlias(s, aliases))).map(({entityId}) => entityId);
  const citedOwnership = ownershipCounts();
  for (const source of card.sources) citedOwnership[source.ownershipCategory] += 1;
  const targetRole = (input.locale ?? "").toLowerCase().startsWith("zh") ? "答案主体" : "answer subject";
  return { targetMentioned: targetFirstIndex >= 0, targetFirstSentence: targetFirstIndex >= 0 ? targetFirstIndex + 1 : null, targetRoles: targetFirstIndex >= 0 ? [targetRole] : [], competitorEntityIds: [...new Set(competitorEntityIds)], citedOwnership, missingEvidenceFamilies: [...new Set(input.missingEvidenceFamilies.map((x) => x.trim()).filter(Boolean))], retestQuestion: input.exactQuestion };
}

export function parseGenerativeSearchAnswerCardsV3(value: unknown, context: OpenGeoAnswerCardsV3Context): [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3] {
  const rows = array(value, "$answerCards"); if (rows.length !== 3) throw new TypeError("Open GEO V3 requires exactly three answer cards.");
  const canonical = canonicalQuestions(context.questionSet);
  return rows.map((item, index) => parseGenerativeCard(item, index, canonical[index]!, context)) as [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
}

function parseGenerativeCard(value: unknown, cardIndex:number, canonical:{id:string;exactQuestion:string}, context:OpenGeoAnswerCardsV3Context): GenerativeSearchAnswerCardV3 {
  const path = `$answerCards[${cardIndex}]`, row = record(value,path);
  exact(row.answerMode,"generative_search_v1",`${path}.answerMode`); exact(row.questionId,canonical.id,`${path}.questionId`); exact(row.exactQuestion,canonical.exactQuestion,`${path}.exactQuestion`);
  if ("sentences" in row) throw new TypeError(`${path} generative cards cannot contain legacy sentences.`);
  const status = oneOf(row.status,["answered","source_limited","refused"] as const,`${path}.status`); const answerText = optionalBoundedText(row.answerText,`${path}.answerText`,12_000);
  const rawSources = array(row.sources,`${path}.sources`); if (rawSources.length > 20) throw new TypeError(`${path}.sources must contain at most 20 items.`);
  const sources = rawSources.map((x,i)=>parseGenerativeSource(x,`${path}.sources[${i}]`)).sort((a,b)=>a.providerResultOrder-b.providerResultOrder||a.canonicalUrl.localeCompare(b.canonicalUrl));
  if (new Set(sources.map((s) => s.canonicalUrl)).size !== sources.length) throw new TypeError(`${path}.sources must not contain duplicate URLs.`);
  const refusal = row.refusal == null ? null : parseRefusal(row.refusal,`${path}.refusal`);
  if (status === "answered" && (!answerText || !sources.length || refusal)) throw new TypeError(`${path} answered requires answerText and a source.`);
  if (status === "source_limited" && (!answerText || sources.length || refusal)) throw new TypeError(`${path} source_limited requires answerText and zero sources.`);
  if (status === "refused" && (answerText || sources.length || !refusal)) throw new TypeError(`${path} refused requires typed refusal and no answer.`);
  const p = record(row.provenance,`${path}.provenance`);
  const provenance: GenerativeSearchAnswerProvenanceV3 = { providerId:text(p.providerId,`${path}.provenance.providerId`), model:text(p.model,`${path}.provenance.model`), searchMode:text(p.searchMode,`${path}.provenance.searchMode`), promptVersion:oneOf(p.promptVersion,["generative-search-answer-v1"] as const,`${path}.provenance.promptVersion`), searchedAt:timestamp(p.searchedAt,`${path}.provenance.searchedAt`), completedAt:timestamp(p.completedAt,`${path}.provenance.completedAt`), answerHash:hash(p.answerHash,`${path}.provenance.answerHash`), sourceHash:hash(p.sourceHash,`${path}.provenance.sourceHash`) };
  if (Date.parse(provenance.completedAt) < Date.parse(provenance.searchedAt)) throw new TypeError(`${path}.provenance.completedAt must follow searchedAt.`);
  const audit = record(row.audit,`${path}.audit`); const parsedAudit = {verifiedBodyCount:nonnegative(audit.verifiedBodyCount,`${path}.audit.verifiedBodyCount`),searchSourceOnlyCount:nonnegative(audit.searchSourceOnlyCount,`${path}.audit.searchSourceOnlyCount`),inaccessibleCount:nonnegative(audit.inaccessibleCount,`${path}.audit.inaccessibleCount`)};
  const geoDiagnosis = diagnoseGenerativeSearchAnswerCardV3({answerText,sources},{exactQuestion:canonical.exactQuestion,locale:context.locale,targetAliases:context.targetAliases??[],competitors:context.competitors??[],missingEvidenceFamilies:context.missingEvidenceFamiliesByQuestion?.[cardIndex]??[]});
  return {answerMode:"generative_search_v1",questionId:canonical.id,exactQuestion:canonical.exactQuestion,status,answerText,sources,provenance,refusal,geoDiagnosis,audit:parsedAudit};
}

function parseGenerativeSource(value:unknown,path:string):GenerativeSearchAnswerSourceV3 {
  const row=record(value,path); let canonicalUrl:string; let registrableDomain:string;
  try { const parsed=parseHttpUrl(boundedText(row.canonicalUrl,`${path}.canonicalUrl`,2_000)); if(isBlockedHostname(parsed.hostname)) throw new Error("private destination"); canonicalUrl=canonicalizePublicSourceUrl(parsed.href); registrableDomain=getPublicSourceDomainIdentity(canonicalUrl).registrableDomain; }
  catch { throw new TypeError(`${path}.canonicalUrl must be a public HTTP(S) URL.`); }
  return {sourceId:boundedText(row.sourceId,`${path}.sourceId`,500),title:boundedText(row.title,`${path}.title`,500),canonicalUrl,registrableDomain,citedText:row.citedText==null?null:boundedText(row.citedText,`${path}.citedText`,2_000),providerResultOrder:nonnegative(row.providerResultOrder,`${path}.providerResultOrder`),retrievalStatus:oneOf(row.retrievalStatus,["verified_body","search_source_only","inaccessible"] as const,`${path}.retrievalStatus`),ownershipCategory:oneOf(row.ownershipCategory,OWNERSHIP_CATEGORIES,`${path}.ownershipCategory`)};
}
function parseRefusal(value:unknown,path:string):GenerativeSearchRefusal { const row=record(value,path); const code=oneOf(row.code,["safety_refusal","policy_refusal","high_risk_refusal"] as const,`${path}.code`); return {code,reason:boundedText(row.reason,`${path}.reason`,500)}; }
function hash(value: unknown, path: string): string { const result = text(value, path); if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${path} must be a SHA-256 hash.`); return result; }

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
  for (let attempt = 0; attempt < 3; attempt += 1) {
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
          ? "unresolved"
          : claims.some(({ confidence }) => confidence === "limited") || hasShortfall ? "limited" : "answered";
        const sourceEvidence = [...new Set(claims.flatMap(({ evidenceIds }) => evidenceIds))].map((id) => permitted.get(id)!);
        const sentences: OpenGeoAnswerSentenceV3[] = [...claims];
        if (status === "limited") sentences.push(deterministicLimitedNote(question.id, input.locale));
        if (status === "unresolved") sentences.push(deterministicUnresolvedNote(question.id, input.locale, coverage));
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
      if (!(error instanceof TypeError) || attempt === 2) throw error;
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
  const status = oneOf(row.status, ["answered", "limited", "observed", "unresolved", "insufficient"] as const, `${path}.status`);
  if (status === "insufficient" && array(row.sentences, `${path}.sentences`).length > 0) {
    throw new TypeError(`${path} insufficient evidence cannot contain model-authored answer prose.`);
  }
  const sourceEvidence = array(row.sourceEvidence, `${path}.sourceEvidence`).map((item, index) => parseEvidence(item, `${path}.sourceEvidence[${index}]`, canonical.id));
  if (new Set(sourceEvidence.map(({ evidenceId }) => evidenceId)).size !== sourceEvidence.length) throw new TypeError(`${path} evidence IDs must be unique.`);
  const evidenceMap = new Map(sourceEvidence.map((evidence) => [evidence.evidenceId, evidence]));
  const sentences = array(row.sentences, `${path}.sentences`).map((item, index) => parseSentence(item, `${path}.sentences[${index}]`, evidenceMap, context.locale));
  if (new Set(sentences.map(({ sentenceId }) => sentenceId)).size !== sentences.length) throw new TypeError(`${path} sentence IDs must be unique.`);
  const claims = sentences.filter(({ kind }) => kind === "grounded_claim");
  const observedClaims = sentences.filter(({ kind }) => kind === "observed_claim");
  const coverage = parseCoverage(row.coverage, `${path}.coverage`, sourceEvidence.length);
  const materialShortfall = coverage.completedQueries < coverage.plannedQueries || coverage.reasons.length > 0;
  if (status === "answered" && (!claims.length || claims.some(({ confidence }) => confidence !== "verified") || materialShortfall)) {
    throw new TypeError(`${path} answered status requires grounded verified claims and complete coverage.`);
  }
  if ((status === "answered" || status === "limited") && observedClaims.length) throw new TypeError(`${path} direct answer status cannot contain observational claims.`);
  if (status === "limited") {
    if (!claims.length || (!materialShortfall && claims.every(({ confidence }) => confidence === "verified"))) throw new TypeError(`${path} limited status requires a grounded limitation.`);
    const expectedNote = deterministicLimitedNote(canonical.id, context.locale);
    if (!sentences.some((sentence) => sentence.kind === "scope_note" && sentence.text === expectedNote.text)) {
      throw new TypeError(`${path} limited status requires deterministic limitation copy.`);
    }
  }
  if (status === "unresolved") {
    if (claims.length || observedClaims.length || sourceEvidence.length) throw new TypeError(`${path} unresolved status cannot contain factual claims or page evidence.`);
    const expectedNote = deterministicUnresolvedNote(canonical.id, context.locale, coverage);
    if (sentences.length !== 1 || sentences[0]?.kind !== "scope_note" || sentences[0].text !== expectedNote.text) {
      throw new TypeError(`${path} unresolved status requires deterministic exhausted-coverage copy.`);
    }
  }
  if (status === "observed" && (claims.length || !observedClaims.length || sentences.some(({ kind }) => kind === "scope_note"))) {
    throw new TypeError(`${path} observed status requires only search-observation claims.`);
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
  const kind = oneOf(row.kind, ["grounded_claim", "observed_claim", "scope_note"] as const, `${path}.kind`);
  const sentenceText = text(row.text, `${path}.text`).replace(/\s+/g, " ").trim();
  const evidenceIds = stringArray(row.evidenceIds, `${path}.evidenceIds`);
  if (new Set(evidenceIds).size !== evidenceIds.length) throw new TypeError(`${path} evidence IDs must be unique.`);
  if (kind === "scope_note") {
    if (evidenceIds.length || row.confidence !== undefined) throw new TypeError(`${path} scope notes cannot cite evidence or claim confidence.`);
    return { sentenceId: text(row.sentenceId, `${path}.sentenceId`), kind, text: sentenceText, evidenceIds: [] };
  }
  if (!evidenceIds.length) throw new TypeError(`${path} claims require evidence.`);
  const sources = evidenceIds.map((id) => evidence.get(id));
  if (sources.some((source) => !source || !source.eligible || (kind === "grounded_claim" && !source.direct) || (kind === "observed_claim" && source.direct))) throw new TypeError(`${path} contains evidence outside its allowed grade.`);
  if (new Set(sources.map((source) => source!.questionId)).size !== 1) throw new TypeError(`${path} evidence must bind to the same question.`);
  if (new Set(sources.map((source) => source!.subjectKey)).size !== 1) throw new TypeError(`${path} evidence must bind to the same subject.`);
  const confidence = oneOf(row.confidence, ["verified", "limited", "observed"] as const, `${path}.confidence`);
  if ((kind === "observed_claim") !== (confidence === "observed")) throw new TypeError(`${path} observational confidence and sentence kind must agree.`);
  const domains = new Set(sources.map((source) => source!.registrableDomain.toLocaleLowerCase()));
  if (confidence === "verified" && domains.size < 2) throw new TypeError(`${path} verified confidence requires two independent registrable domains.`);
  if (sentenceText.length < (locale.toLowerCase().startsWith("zh") ? 6 : 12) || sentenceText.length > 600) throw new TypeError(`${path}.text must be one bounded factual sentence.`);
  return { sentenceId: text(row.sentenceId, `${path}.sentenceId`), kind, text: sentenceText, evidenceIds, confidence };
}

function parseCoverage(value: unknown, path: string, legacyEligibleEvidence = 0): LegacyEvidenceBoundAnswerCardV3["coverage"] {
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
  OWNERSHIP_CATEGORIES.forEach((category) => {
    if (ownership[category] === undefined && ["institution", "community", "social", "unknown"].includes(category)) return;
    nonnegative(ownership[category], `${path}.citedOwnership.${category}`);
  });
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

function deterministicUnresolvedNote(
  questionId: string,
  locale: string,
  coverage: LegacyEvidenceBoundAnswerCardV3["coverage"]
): OpenGeoAnswerSentenceV3 {
  return {
    sentenceId: `unresolved-${questionId}`,
    kind: "scope_note",
    text: locale.toLowerCase().startsWith("zh")
      ? `\u672c\u6b21\u516c\u5f00\u641c\u7d22\u8fd4\u56de ${coverage.returnedResults} \u6761\u7ed3\u679c\uff0c\u5e76\u5c1d\u8bd5\u6293\u53d6 ${coverage.attemptedRetrievals} \u4e2a\u9875\u9762\uff1b\u5f53\u524d\u53ef\u6838\u9a8c\u6b63\u6587\u4ecd\u4e0d\u8db3\uff0c\u56e0\u6b64\u65e0\u6cd5\u7ed9\u51fa\u53ef\u9760\u7684\u4e8b\u5b9e\u7ed3\u8bba\u3002`
      : `The public search returned ${coverage.returnedResults} results and attempted ${coverage.attemptedRetrievals} pages; there is still insufficient verifiable page text for a reliable factual conclusion.`,
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
  return { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 };
}
function includesAlias(textValue: string, aliases: readonly string[]): boolean { const normalized = normalize(textValue); return aliases.some((alias) => alias.trim() && normalized.includes(normalize(alias))); }
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function localized(seed: string, zh: string, en: string): string { return /[\u3400-\u9fff]/u.test(seed) ? zh : en; }
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value.trim(); }
function boundedText(value: unknown, path: string, maximum: number): string { const result=text(value,path); if(result.length>maximum)throw new TypeError(`${path} exceeds the retained bound.`); return result; }
function optionalBoundedText(value: unknown, path: string, maximum: number): string { if(typeof value!=="string")throw new TypeError(`${path} must be text.`); const result=value.trim(); if(result.length>maximum)throw new TypeError(`${path} exceeds the retained bound.`); return result; }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T { if (!allowed.includes(value as T)) throw new TypeError(`${path} is unsupported.`); return value as T; }
function nonnegative(value: unknown, path: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`${path} must be a non-negative integer.`); return Number(value); }
function bool(value: unknown, path: string): boolean { if (typeof value !== "boolean") throw new TypeError(`${path} must be boolean.`); return value; }
function stringArray(value: unknown, path: string): string[] { return array(value, path).map((item, index) => text(item, `${path}[${index}]`)); }
function timestamp(value: unknown, path: string): string { const result = text(value, path); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${path} must be an ISO timestamp.`); return result; }
function httpUrl(value: unknown, path: string): string { const result = text(value, path); const url = new URL(result); if (!/^https?:$/.test(url.protocol)) throw new TypeError(`${path} must be HTTP(S).`); return url.href; }

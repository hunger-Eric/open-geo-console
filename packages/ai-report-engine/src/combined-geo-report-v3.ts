import { toCanonicalBuyerQuestionSet } from "@open-geo-console/public-search-observer";
import {
  COMBINED_GEO_REPORT_V2_CONTRACT,
  COMBINED_GEO_REPORT_V2_VERSION,
  parseCombinedGeoReportV2,
  type CombinedGeoReportV2
} from "./combined-geo-report-v2";
import {
  OPEN_GEO_ENGINE_ID,
  parseOpenGeoAnswerCardsV3,
  type OpenGeoAnswerCardV3,
  type OpenGeoEngineProvenanceV3
} from "./open-geo-answer-v3";
import {
  parseSourceSelectionDiagnosisV1,
  type SourceSelectionDiagnosisV1,
  type SourceSelectionSourceInputV1
} from "./source-selection-diagnosis-v1";
import {
  hashReportSemanticReviewValue,
  parsePaidV3ReportSemanticReviewReceipt,
  type PaidV3ReportSemanticReviewReceipt
} from "./report-semantic-review";
import {
  FREE_V4_DIRECT_SEMANTICS_VERSION,
  hashFreeV4DirectSemanticValue,
  hashPaidV3DirectAnswerCard,
  parsePaidV3DirectSemantics,
  type PaidV3DirectSemantics
} from "./free-v4-direct-semantics";
import { parseGenerativeSearchAnswerResult, type GenerativeSearchAnswerResult } from "./generative-search-answer";

export const COMBINED_GEO_REPORT_V3_VERSION = 3 as const;
export const COMBINED_GEO_REPORT_V3_CONTRACT = "combined_geo_report_v3" as const;
export const GEO_ARTICLE_EXAMPLE_VERSION = "geo_article_example_v1" as const;
export const GEO_ARTICLE_DELIVERABLE_VERSION = "geo_article_deliverable_v2" as const;
export const GEO_ARTICLE_DELIVERABLE_V3_VERSION = "geo_article_deliverable_v3" as const;

export interface GeoArticleExampleV1 {
  readonly version: typeof GEO_ARTICLE_EXAMPLE_VERSION;
  readonly generationMode: "model" | "deterministic_fallback";
  readonly targetQuestionIds: readonly string[];
  readonly title: string;
  readonly introduction: string;
  readonly sections: readonly { readonly id: string; readonly heading: string; readonly paragraphs: readonly string[] }[];
  readonly faq: readonly { readonly question: string; readonly answer: string }[];
  readonly rationale: readonly { readonly sectionId: string; readonly reason: string; readonly evidenceRefs: readonly string[] }[];
}

export type GeoArticleFallbackReason = "provider_error" | "timeout" | "invalid_output" | "contract_rejected" | "quality_rejected";
export interface GeoArticleEvidenceTextV2 { readonly text: string; readonly evidenceRefs: readonly string[]; }
export interface GeoArticleExplanationV2 {
  readonly elementId: string;
  readonly heading: string;
  readonly reason: string;
  readonly geoFunction: string;
  readonly evidenceRefs: readonly string[];
}
export type GeoArticleDeliverableV2 =
  | {
      readonly version: typeof GEO_ARTICLE_DELIVERABLE_VERSION;
      readonly kind: "article";
      readonly primaryQuestionId: string;
      readonly article: {
        readonly title: string;
        readonly introduction: GeoArticleEvidenceTextV2;
        readonly sections: readonly { readonly id: string; readonly heading: string; readonly paragraphs: readonly GeoArticleEvidenceTextV2[] }[];
        readonly faq: readonly { readonly question: string; readonly answer: GeoArticleEvidenceTextV2 }[];
      };
      readonly explanation: readonly GeoArticleExplanationV2[];
    }
  | {
      readonly version: typeof GEO_ARTICLE_DELIVERABLE_VERSION;
      readonly kind: "outline";
      readonly primaryQuestionId: string;
      readonly outline: {
        readonly workingTitle: string;
        readonly readerQuestion: string;
        readonly directAnswer: string;
        readonly plannedSections: readonly { readonly id: string; readonly heading: string; readonly purpose: string; readonly evidenceRefs: readonly string[] }[];
        readonly evidenceToAdd: readonly string[];
        readonly faqAngles: readonly string[];
      };
      readonly explanation: readonly GeoArticleExplanationV2[];
      readonly fallbackReason: GeoArticleFallbackReason;
    };
export type GeoArticleResearchV3 =
  | {
      readonly outcome: "usable";
      readonly query: string;
      readonly providerId: string;
      readonly model: string;
      readonly searchMode: string;
      readonly result: GenerativeSearchAnswerResult;
    }
  | {
      readonly outcome: "unavailable";
      readonly queryId: string;
      readonly query: string;
      readonly providerId: string;
      readonly model: string;
      readonly searchMode: string;
      readonly attemptedAt: string;
      readonly completedAt: string;
    };
export interface GeoArticleDeliverableV3 {
  readonly version: typeof GEO_ARTICLE_DELIVERABLE_V3_VERSION;
  readonly kind: "article";
  readonly generationMode: "model_researched" | "model_existing_evidence" | "deterministic_evidence_fallback";
  readonly primaryQuestionId: string;
  readonly research: GeoArticleResearchV3;
  readonly article: {
    readonly title: string;
    readonly introduction: GeoArticleEvidenceTextV2;
    readonly sections: readonly { readonly id: string; readonly heading: string; readonly paragraphs: readonly GeoArticleEvidenceTextV2[] }[];
    readonly faq: readonly { readonly question: string; readonly answer: GeoArticleEvidenceTextV2 }[];
  };
  readonly explanation: readonly GeoArticleExplanationV2[];
}
export type GeoArticleDeliverable = GeoArticleExampleV1 | GeoArticleDeliverableV2 | GeoArticleDeliverableV3;

export interface CombinedGeoReportV3 extends Omit<CombinedGeoReportV2, "version" | "artifactContract" | "businessQuestionAnswers"> {
  version: typeof COMBINED_GEO_REPORT_V3_VERSION;
  artifactContract: typeof COMBINED_GEO_REPORT_V3_CONTRACT;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  sourceSelectionDiagnosis?: SourceSelectionDiagnosisV1;
  semanticReviewReceipt?: PaidV3ReportSemanticReviewReceipt;
  directSemantics?: PaidV3DirectSemantics;
  geoArticleExample?: GeoArticleDeliverable;
}

export function parseCombinedGeoReportV3(
  value: unknown,
  options: { semanticValidation?: "legacy" | "deferred" | "free_direct" } = {}
): CombinedGeoReportV3 {
  const root = object(value, "$combined");
  exact(root.artifactContract, COMBINED_GEO_REPORT_V3_CONTRACT, "$combined.artifactContract");
  exact(root.version, COMBINED_GEO_REPORT_V3_VERSION, "$combined.version");
  const semanticReviewReceipt = root.semanticReviewReceipt === undefined
    ? undefined
    : parsePaidV3ReportSemanticReviewReceipt(root.semanticReviewReceipt);
  const provenance = parseEngineProvenance(root.engineProvenance);
  const questionSet = object(root.businessQuestionSet, "$combined.businessQuestionSet") as unknown as CombinedGeoReportV2["businessQuestionSet"];
  const preliminaryCards = array(root.answerCards, "$combined.answerCards") as unknown as OpenGeoAnswerCardV3[];
  const groundedAnswerEvidence = preliminaryCards.flatMap((card) => ("sourceEvidence" in card ? card.sourceEvidence ?? [] : [])).map((evidence) => ({
    evidenceId: evidence.evidenceId,
    questionId: evidence.questionId,
    subjectKey: evidence.subjectKey,
    registrableDomain: evidence.registrableDomain,
    exactExcerpt: evidence.exactExcerpt,
    eligible: evidence.eligible,
    direct: evidence.direct
  }));
  const publicQuestionIds = toCanonicalBuyerQuestionSet(questionSet).questions.map(({ id }) => id);
  const directSemantics = root.directSemantics === undefined
    ? undefined
    : parsePaidV3DirectSemantics(root.directSemantics, publicQuestionIds as [string, string, string]);
  if (options.semanticValidation === "free_direct") {
    if (!directSemantics || semanticReviewReceipt) throw new TypeError("Direct Paid V3 requires Direct question semantics and forbids a legacy semantic-review receipt.");
    if (directSemantics.version !== FREE_V4_DIRECT_SEMANTICS_VERSION) throw new TypeError("Direct Paid V3 semantic version is invalid.");
  } else if (directSemantics) {
    throw new TypeError("Direct Paid V3 semantics require the Direct lineage parser.");
  }
  const projectedAnswers = preliminaryCards.slice(1).map((card, answerIndex) => ({
    questionId: publicQuestionIds[answerIndex + 1],
    purpose: answerIndex === 0 ? "customer_region_fit" : "purchase_delivery_risk",
    claims: ("sentences" in card ? (card.sentences ?? []).filter(({ kind }) => kind === "grounded_claim").map((sentence) => {
      const firstEvidence = (card.sourceEvidence ?? []).find(({ evidenceId }) => sentence.evidenceIds.includes(evidenceId));
      return {
        claimId: sentence.sentenceId,
        subjectKey: firstEvidence?.subjectKey ?? "missing-subject",
        text: sentence.text,
        evidenceIds: sentence.evidenceIds,
        confidence: sentence.confidence,
        ...(sentence.confidence === "limited" ? { limitation: limitedCopy(String(root.locale ?? "")) } : {})
      };
    }) : [])
  }));
  const base = parseCombinedGeoReportV2({
      ...root,
      version: COMBINED_GEO_REPORT_V2_VERSION,
      artifactContract: COMBINED_GEO_REPORT_V2_CONTRACT,
      groundedAnswerEvidence,
      businessQuestionAnswers: {
        version: "combined-business-question-answers-v2",
        synthesis: { mode: "claim_bound_model", modelId: provenance.synthesisModel, inputHash: provenance.inputHash },
        answers: projectedAnswers
      }
    },
    { semanticValidation: options.semanticValidation === "free_direct" ? "deferred" : options.semanticValidation }
  );
  const resolvedEntities = base.publicSourceForensics.sourceGraph.entities.filter(({ status }) => status === "resolved");
  const targetAliases = base.businessQuestionSet.identityExclusions;
  const targetNormalized = new Set(targetAliases.map(normalize));
  const competitors = resolvedEntities
    .filter(({ canonicalName }) => !targetNormalized.has(normalize(canonicalName)))
    .map(({ entityId, canonicalName }) => ({ entityId, aliases: [canonicalName] }));
  const answerCards = parseOpenGeoAnswerCardsV3(root.answerCards, {
    questionSet: base.businessQuestionSet,
    locale: base.locale,
    targetAliases,
    competitors,
    missingEvidenceFamiliesByQuestion: preliminaryCards.map((card) => card.geoDiagnosis?.missingEvidenceFamilies ?? []) as [string[], string[], string[]],
    semanticValidation: options.semanticValidation
  });
  const geoArticleExample = root.geoArticleExample === undefined
    ? undefined
    : parseGeoArticleDeliverable(root.geoArticleExample, {
        locale: base.locale,
        questionIds: publicQuestionIds,
        evidenceRefs: geoArticleEvidenceRefs(base, answerCards)
      });
  if (directSemantics) assertPaidV3DirectAnswerCardBindings({
    questionSetIdentity: base.businessQuestionSet.contentHash,
    answerCards,
    directSemantics
  });
  const sourceSelectionDiagnosis = root.sourceSelectionDiagnosis === undefined
    ? undefined
    : parseV3SourceSelectionDiagnosis(root.sourceSelectionDiagnosis, answerCards, base, provenance, options);
  const { businessQuestionAnswers: _businessQuestionAnswers, ...v3Base } = base;
  return {
    ...v3Base,
    version: COMBINED_GEO_REPORT_V3_VERSION,
    artifactContract: COMBINED_GEO_REPORT_V3_CONTRACT,
    engineProvenance: provenance,
    answerCards,
    ...(sourceSelectionDiagnosis ? { sourceSelectionDiagnosis } : {}),
    ...(semanticReviewReceipt ? { semanticReviewReceipt } : {}),
    ...(directSemantics ? { directSemantics } : {}),
    ...(geoArticleExample ? { geoArticleExample } : {})
  };
}

export function parseGeoArticleExampleV1(value: unknown, authority: {
  readonly locale: string;
  readonly questionIds: readonly string[];
  readonly evidenceRefs: readonly string[];
}): GeoArticleExampleV1 {
  if (JSON.stringify(value).length > 50_000) throw new TypeError("$geoArticleExample exceeds the retained size bound.");
  const row = object(value, "$geoArticleExample");
  exact(row.version, GEO_ARTICLE_EXAMPLE_VERSION, "$geoArticleExample.version");
  const generationMode = row.generationMode;
  if (generationMode !== "model" && generationMode !== "deterministic_fallback") throw new TypeError("$geoArticleExample.generationMode is invalid.");
  const knownQuestions = new Set(authority.questionIds);
  const targetQuestionIds = uniqueArticleTextArray(row.targetQuestionIds, "$geoArticleExample.targetQuestionIds", 3, 500);
  if (targetQuestionIds.length === 0 || targetQuestionIds.some((id) => !knownQuestions.has(id))) throw new TypeError("$geoArticleExample.targetQuestionIds must reference locked questions.");
  const sections = array(row.sections, "$geoArticleExample.sections");
  if (sections.length < 2 || sections.length > 8) throw new TypeError("$geoArticleExample.sections must contain 2-8 sections.");
  const parsedSections = sections.map((item, index) => {
    const section = object(item, `$geoArticleExample.sections[${index}]`);
    const paragraphs = array(section.paragraphs, `$geoArticleExample.sections[${index}].paragraphs`).map((paragraph, paragraphIndex) =>
      articleText(paragraph, `$geoArticleExample.sections[${index}].paragraphs[${paragraphIndex}]`, 4_000));
    if (paragraphs.length === 0 || paragraphs.length > 6) throw new TypeError(`$geoArticleExample.sections[${index}].paragraphs must contain 1-6 items.`);
    return {
      id: articleText(section.id, `$geoArticleExample.sections[${index}].id`, 80),
      heading: articleText(section.heading, `$geoArticleExample.sections[${index}].heading`, 300),
      paragraphs
    };
  });
  const sectionIds = new Set(parsedSections.map(({ id }) => id));
  if (sectionIds.size !== parsedSections.length) throw new TypeError("$geoArticleExample.sections contains duplicate IDs.");
  const faq = array(row.faq, "$geoArticleExample.faq").map((item, index) => {
    const entry = object(item, `$geoArticleExample.faq[${index}]`);
    return { question: articleText(entry.question, `$geoArticleExample.faq[${index}].question`, 500), answer: articleText(entry.answer, `$geoArticleExample.faq[${index}].answer`, 3_000) };
  });
  if (faq.length === 0 || faq.length > 6) throw new TypeError("$geoArticleExample.faq must contain 1-6 items.");
  const knownRefs = new Set(authority.evidenceRefs);
  const rationale = array(row.rationale, "$geoArticleExample.rationale").map((item, index) => {
    const entry = object(item, `$geoArticleExample.rationale[${index}]`);
    const sectionId = articleText(entry.sectionId, `$geoArticleExample.rationale[${index}].sectionId`, 80);
    const evidenceRefs = uniqueArticleTextArray(entry.evidenceRefs, `$geoArticleExample.rationale[${index}].evidenceRefs`, 8, 500);
    if (!sectionIds.has(sectionId) || evidenceRefs.length === 0 || evidenceRefs.some((ref) => !knownRefs.has(ref))) throw new TypeError("$geoArticleExample.rationale must bind known sections and evidence references.");
    return { sectionId, reason: articleText(entry.reason, `$geoArticleExample.rationale[${index}].reason`, 2_000), evidenceRefs };
  });
  if (rationale.length !== parsedSections.length || new Set(rationale.map(({ sectionId }) => sectionId)).size !== parsedSections.length) {
    throw new TypeError("$geoArticleExample.rationale must explain every article section exactly once.");
  }
  const result: GeoArticleExampleV1 = {
    version: GEO_ARTICLE_EXAMPLE_VERSION,
    generationMode,
    targetQuestionIds,
    title: articleText(row.title, "$geoArticleExample.title", 300),
    introduction: articleText(row.introduction, "$geoArticleExample.introduction", 3_000),
    sections: parsedSections,
    faq,
    rationale
  };
  assertArticleLanguage(result, authority.locale);
  return result;
}

export function parseGeoArticleDeliverable(value: unknown, authority: {
  readonly locale: string;
  readonly questionIds: readonly string[];
  readonly evidenceRefs: readonly string[];
}): GeoArticleDeliverable {
  const row = object(value, "$geoArticleExample");
  return row.version === GEO_ARTICLE_EXAMPLE_VERSION
    ? parseGeoArticleExampleV1(value, authority)
    : row.version === GEO_ARTICLE_DELIVERABLE_V3_VERSION
      ? parseGeoArticleDeliverableV3(value, authority)
      : parseGeoArticleDeliverableV2(value, authority);
}

function parseGeoArticleDeliverableV3(value: unknown, authority: {
  readonly locale: string;
  readonly questionIds: readonly string[];
  readonly evidenceRefs: readonly string[];
}): GeoArticleDeliverableV3 {
  if (JSON.stringify(value).length > 100_000) throw new TypeError("$geoArticleExample exceeds the retained size bound.");
  const row = object(value, "$geoArticleExample");
  exact(row.version, GEO_ARTICLE_DELIVERABLE_V3_VERSION, "$geoArticleExample.version");
  exact(row.kind, "article", "$geoArticleExample.kind");
  const generationMode = row.generationMode;
  if (!(generationMode === "model_researched" || generationMode === "model_existing_evidence" || generationMode === "deterministic_evidence_fallback")) {
    throw new TypeError("$geoArticleExample.generationMode is invalid.");
  }
  const researchRow = object(row.research, "$geoArticleExample.research");
  const outcome = researchRow.outcome;
  const query = v2Text(researchRow.query, "$geoArticleExample.research.query", 500);
  const providerId = articleText(researchRow.providerId, "$geoArticleExample.research.providerId", 200);
  const model = articleText(researchRow.model, "$geoArticleExample.research.model", 300);
  const searchMode = articleText(researchRow.searchMode, "$geoArticleExample.research.searchMode", 200);
  let research: GeoArticleResearchV3;
  const researchRefs: string[] = [];
  if (outcome === "usable") {
    const resultRow = object(researchRow.result, "$geoArticleExample.research.result");
    const expectedQuestionId = articleText(resultRow.questionId, "$geoArticleExample.research.result.questionId", 500);
    const result = parseGenerativeSearchAnswerResult(resultRow, { expectedQuestionId, locale: authority.locale });
    if (!result.answerText || result.refusal || !result.sources.some(({ citedText }) => Boolean(citedText?.trim()))) {
      throw new TypeError("$geoArticleExample.research usable outcome requires an answer and cited public sources.");
    }
    researchRefs.push(...result.sources.map(({ sourceId }) => `research:${sourceId}`));
    research = { outcome, query, providerId, model, searchMode, result };
  } else if (outcome === "unavailable") {
    if ("result" in researchRow) throw new TypeError("$geoArticleExample.research unavailable outcome must not retain a result.");
    research = {
      outcome,
      queryId: articleText(researchRow.queryId, "$geoArticleExample.research.queryId", 500),
      query,
      providerId,
      model,
      searchMode,
      attemptedAt: timestamp(researchRow.attemptedAt, "$geoArticleExample.research.attemptedAt"),
      completedAt: timestamp(researchRow.completedAt, "$geoArticleExample.research.completedAt")
    };
    if (Date.parse(research.completedAt) < Date.parse(research.attemptedAt)) throw new TypeError("$geoArticleExample.research completion precedes its attempt.");
  } else {
    throw new TypeError("$geoArticleExample.research.outcome is invalid.");
  }
  if ((generationMode === "model_researched" && research.outcome !== "usable") ||
      (generationMode === "model_existing_evidence" && research.outcome !== "unavailable")) {
    throw new TypeError("$geoArticleExample generation mode and research outcome do not agree.");
  }
  const parsedV2 = parseGeoArticleDeliverableV2({
    version: GEO_ARTICLE_DELIVERABLE_VERSION,
    kind: "article",
    primaryQuestionId: row.primaryQuestionId,
    article: row.article,
    explanation: row.explanation
  }, { ...authority, evidenceRefs: [...authority.evidenceRefs, ...researchRefs] });
  if (parsedV2.kind !== "article") throw new TypeError("$geoArticleExample V3 must contain an article.");
  return {
    version: GEO_ARTICLE_DELIVERABLE_V3_VERSION,
    kind: "article",
    generationMode,
    primaryQuestionId: parsedV2.primaryQuestionId,
    research,
    article: parsedV2.article,
    explanation: parsedV2.explanation
  };
}

function parseGeoArticleDeliverableV2(value: unknown, authority: {
  readonly locale: string;
  readonly questionIds: readonly string[];
  readonly evidenceRefs: readonly string[];
}): GeoArticleDeliverableV2 {
  if (JSON.stringify(value).length > 75_000) throw new TypeError("$geoArticleExample exceeds the retained size bound.");
  const row = object(value, "$geoArticleExample");
  exact(row.version, GEO_ARTICLE_DELIVERABLE_VERSION, "$geoArticleExample.version");
  const primaryQuestionId = v2Text(row.primaryQuestionId, "$geoArticleExample.primaryQuestionId", 500);
  if (!authority.questionIds.length || primaryQuestionId !== authority.questionIds[0]) {
    throw new TypeError("$geoArticleExample.primaryQuestionId must equal the primary buyer question.");
  }
  const knownRefs = new Set(authority.evidenceRefs);
  const kind = row.kind;
  if (kind === "article") {
    if ("outline" in row || "fallbackReason" in row) throw new TypeError("$geoArticleExample article must not contain outline fallback fields.");
    const articleRow = object(row.article, "$geoArticleExample.article");
    const title = v2Text(articleRow.title, "$geoArticleExample.article.title", 300);
    const introduction = parseEvidenceText(articleRow.introduction, "$geoArticleExample.article.introduction", knownRefs);
    const sections = array(articleRow.sections, "$geoArticleExample.article.sections");
    if (sections.length < 3 || sections.length > 5) throw new TypeError("$geoArticleExample.article.sections must contain 3-5 sections.");
    const parsedSections = sections.map((item, index) => {
      const section = object(item, `$geoArticleExample.article.sections[${index}]`);
      const paragraphs = array(section.paragraphs, `$geoArticleExample.article.sections[${index}].paragraphs`).map((paragraph, paragraphIndex) =>
        parseEvidenceText(paragraph, `$geoArticleExample.article.sections[${index}].paragraphs[${paragraphIndex}]`, knownRefs));
      if (paragraphs.length === 0 || paragraphs.length > 6) throw new TypeError(`$geoArticleExample.article.sections[${index}].paragraphs must contain 1-6 items.`);
      return {
        id: v2Text(section.id, `$geoArticleExample.article.sections[${index}].id`, 80),
        heading: v2Text(section.heading, `$geoArticleExample.article.sections[${index}].heading`, 300),
        paragraphs
      };
    });
    const sectionIds = new Set(parsedSections.map(({ id }) => id));
    if (sectionIds.size !== parsedSections.length) throw new TypeError("$geoArticleExample.article.sections contains duplicate IDs.");
    const faq = array(articleRow.faq, "$geoArticleExample.article.faq").map((item, index) => {
      const entry = object(item, `$geoArticleExample.article.faq[${index}]`);
      return {
        question: v2Text(entry.question, `$geoArticleExample.article.faq[${index}].question`, 500),
        answer: parseEvidenceText(entry.answer, `$geoArticleExample.article.faq[${index}].answer`, knownRefs)
      };
    });
    if (faq.length < 2 || faq.length > 3) throw new TypeError("$geoArticleExample.article.faq must contain 2-3 items.");
    assertUniqueCustomerProse([introduction.text, ...parsedSections.flatMap(({ paragraphs }) => paragraphs.map(({ text }) => text)), ...faq.map(({ answer }) => answer.text)]);
    const explanation = parseExplanation(row.explanation, ["title", "introduction", ...parsedSections.map(({ id }) => `section:${id}`), "faq"], knownRefs);
    const result: GeoArticleDeliverableV2 = {
      version: GEO_ARTICLE_DELIVERABLE_VERSION,
      kind: "article",
      primaryQuestionId,
      article: { title, introduction, sections: parsedSections, faq },
      explanation
    };
    assertV2Language(result, authority.locale);
    return result;
  }
  if (kind === "outline") {
    if ("article" in row) throw new TypeError("$geoArticleExample outline must not contain article fields.");
    const outlineRow = object(row.outline, "$geoArticleExample.outline");
    const plannedSections = array(outlineRow.plannedSections, "$geoArticleExample.outline.plannedSections").map((item, index) => {
      const section = object(item, `$geoArticleExample.outline.plannedSections[${index}]`);
      return {
        id: v2Text(section.id, `$geoArticleExample.outline.plannedSections[${index}].id`, 80),
        heading: v2Text(section.heading, `$geoArticleExample.outline.plannedSections[${index}].heading`, 300),
        purpose: v2Text(section.purpose, `$geoArticleExample.outline.plannedSections[${index}].purpose`, 2_000),
        evidenceRefs: parseEvidenceRefs(section.evidenceRefs, `$geoArticleExample.outline.plannedSections[${index}].evidenceRefs`, knownRefs)
      };
    });
    if (plannedSections.length < 3 || plannedSections.length > 5) throw new TypeError("$geoArticleExample.outline.plannedSections must contain 3-5 items.");
    if (new Set(plannedSections.map(({ id }) => id)).size !== plannedSections.length) throw new TypeError("$geoArticleExample.outline.plannedSections contains duplicate IDs.");
    const fallbackReason = row.fallbackReason;
    if (!(["provider_error", "timeout", "invalid_output", "contract_rejected", "quality_rejected"] as unknown[]).includes(fallbackReason)) {
      throw new TypeError("$geoArticleExample.fallbackReason is invalid.");
    }
    const outline = {
      workingTitle: v2Text(outlineRow.workingTitle, "$geoArticleExample.outline.workingTitle", 300),
      readerQuestion: v2Text(outlineRow.readerQuestion, "$geoArticleExample.outline.readerQuestion", 1_000),
      directAnswer: v2Text(outlineRow.directAnswer, "$geoArticleExample.outline.directAnswer", 3_000),
      plannedSections,
      evidenceToAdd: v2TextArray(outlineRow.evidenceToAdd, "$geoArticleExample.outline.evidenceToAdd", 8, 1_000, 1),
      faqAngles: v2TextArray(outlineRow.faqAngles, "$geoArticleExample.outline.faqAngles", 3, 1_000, 2)
    };
    const explanation = parseExplanation(row.explanation, ["title", "introduction", ...plannedSections.map(({ id }) => `section:${id}`), "faq"], knownRefs);
    const result: GeoArticleDeliverableV2 = {
      version: GEO_ARTICLE_DELIVERABLE_VERSION,
      kind: "outline",
      primaryQuestionId,
      outline,
      explanation,
      fallbackReason: fallbackReason as GeoArticleFallbackReason
    };
    assertV2Language(result, authority.locale);
    return result;
  }
  throw new TypeError("$geoArticleExample.kind must equal article or outline.");
}

export function assertPaidV3DirectAnswerCardBindings(input: {
  readonly questionSetIdentity: string;
  readonly answerCards: readonly [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
  readonly directSemantics: PaidV3DirectSemantics;
}): void {
  const exactQuestions = input.answerCards.map(({ exactQuestion }) => exactQuestion);
  input.directSemantics.questions.forEach((result, index) => {
    const card = input.answerCards[index]!;
    if (card.answerMode !== "generative_search_v1" ||
        result.coreReceipt.questionSetIdentity !== input.questionSetIdentity ||
        result.coreReceipt.questionsHash !== hashFreeV4DirectSemanticValue(exactQuestions) ||
        result.coreReceipt.questionTextHash !== hashFreeV4DirectSemanticValue(card.exactQuestion) ||
        result.answerCardHash !== hashPaidV3DirectAnswerCard(card)) {
      throw new TypeError(`$combined.directSemantics.questions[${index}] does not match its rendered answer card lineage.`);
    }
  });
}

export function hashCombinedGeoReportV3ReceiptExcludedProjection(value: unknown): string {
  const root = object(value, "$combined");
  const { semanticReviewReceipt: _semanticReviewReceipt, ...projection } = root;
  return hashReportSemanticReviewValue(projection);
}

function parseV3SourceSelectionDiagnosis(
  value: unknown,
  cards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3],
  base: CombinedGeoReportV2,
  provenance: OpenGeoEngineProvenanceV3,
  options: { semanticValidation?: "legacy" | "deferred" | "free_direct" }
): SourceSelectionDiagnosisV1 {
  if (cards.some((card) => card.answerMode !== "generative_search_v1")) throw new TypeError("Source selection diagnosis requires generative-search V3 cards.");
  const verifiedExcerptByUrl = new Map<string, string>();
  for (const evidence of base.publicSourceForensics.sourceGraph.evidence) {
    if (evidence.verifiedExcerpt) verifiedExcerptByUrl.set(comparableUrl(evidence.canonicalUrl), evidence.verifiedExcerpt);
  }
  const questions = cards.map((card) => {
    if (card.answerMode !== "generative_search_v1") throw new TypeError("Source selection diagnosis requires generative-search V3 cards.");
    return {
      questionId: card.questionId,
      answerText: card.answerText,
      sources: card.sources.map((source): SourceSelectionSourceInputV1 => ({
        questionId: card.questionId,
        sourceId: source.sourceId,
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        registrableDomain: source.registrableDomain,
        citedText: source.citedText,
        auditExcerpt: verifiedExcerptByUrl.get(comparableUrl(source.canonicalUrl)) ?? null,
        retrievalStatus: source.retrievalStatus,
        ownershipCategory: source.ownershipCategory,
        providerResultOrder: source.providerResultOrder
      }))
    };
  });
  const diagnosis = parseSourceSelectionDiagnosisV1(value, {
    questions,
    allowPersistedIndependentExcerpts: true,
    semanticValidation: options.semanticValidation === "free_direct" ? "deferred" : options.semanticValidation
  });
  if (diagnosis.inputIdentity.answerHash !== provenance.answerHash || diagnosis.inputIdentity.sourceHash !== provenance.evidenceHash) {
    throw new TypeError("Source selection diagnosis answer/source identity does not match V3 provenance.");
  }
  return diagnosis;
}

export function requireReadyCombinedGeoReportV3(
  value: unknown,
  options: { semanticValidation?: "legacy" | "deferred" | "free_direct" } = {}
): CombinedGeoReportV3 {
  const report = parseCombinedGeoReportV3(value, options);
  if (options.semanticValidation === "free_direct" &&
      (report.geoArticleExample?.version !== GEO_ARTICLE_DELIVERABLE_V3_VERSION || report.geoArticleExample.kind !== "article")) {
    throw new TypeError("Direct Paid V3 requires a complete geo_article_deliverable_v3 article.");
  }
  return report;
}

function parseEngineProvenance(value: unknown): OpenGeoEngineProvenanceV3 {
  const row = object(value, "$combined.engineProvenance");
  exact(row.engineId, OPEN_GEO_ENGINE_ID, "$combined.engineProvenance.engineId");
  return {
    engineId: OPEN_GEO_ENGINE_ID,
    searchSurface: text(row.searchSurface, "searchSurface"),
    queryPlanVersion: text(row.queryPlanVersion, "queryPlanVersion"),
    passageSelectorVersion: text(row.passageSelectorVersion, "passageSelectorVersion"),
    synthesisModel: text(row.synthesisModel, "synthesisModel"),
    synthesisPromptVersion: text(row.synthesisPromptVersion, "synthesisPromptVersion"),
    locale: text(row.locale, "locale"),
    region: text(row.region, "region"),
    searchedAt: timestamp(row.searchedAt, "searchedAt"),
    evidenceCutoffAt: timestamp(row.evidenceCutoffAt, "evidenceCutoffAt"),
    synthesizedAt: timestamp(row.synthesizedAt, "synthesizedAt"),
    inputHash: hash(row.inputHash, "inputHash"),
    evidenceHash: hash(row.evidenceHash, "evidenceHash"),
    answerHash: hash(row.answerHash, "answerHash")
  };
}

function limitedCopy(locale: string): string {
  return locale.toLowerCase().startsWith("zh") ? "当前结论尚缺少两个独立域名的交叉验证。" : "This claim lacks verification from two independent domains.";
}
function geoArticleEvidenceRefs(base: CombinedGeoReportV2, cards: readonly OpenGeoAnswerCardV3[]): string[] {
  const profile = base.technicalFoundation.aiReport.organizationProfile;
  return [...new Set([
    ...toCanonicalBuyerQuestionSet(base.businessQuestionSet).questions.map(({ id }) => `question:${id}`),
    ...base.technicalFoundation.technicalReport.findings.map(({ id }) => `technical:${id}`),
    ...base.technicalFoundation.aiReport.findings.map(({ id }) => `finding:${id}`),
    ...cards.flatMap((card) => card.answerMode === "generative_search_v1"
      ? card.sources.map(({ sourceId }) => `source:${sourceId}`)
      : card.sourceEvidence.map(({ evidenceId }) => `source:${evidenceId}`)),
    ...(profile.organizationName?.trim() ? ["website:organization"] : []),
    ...(profile.summary?.trim() ? ["website:summary"] : []),
    ...(profile.productsAndServices ?? []).map((_value, index) => `website:service:${index}`),
    ...(profile.targetAudiences ?? []).map((_value, index) => `website:audience:${index}`),
    ...(profile.marketsAndRegions ?? []).map((_value, index) => `website:region:${index}`)
  ])];
}
function articleText(value: unknown, path: string, maxLength: number): string {
  const result = text(value, path);
  if (result.length > maxLength) throw new TypeError(`${path} exceeds ${maxLength} characters.`);
  if (/<\/?[a-z][^>]*>/iu.test(result)) throw new TypeError(`${path} must not contain raw HTML.`);
  if (/^(?:#{1,6}\s|```)|\*\*|__|\[[^\]]+\]\([^\s)]+\)/mu.test(result)) throw new TypeError(`${path} must contain structured plain text, not Markdown.`);
  return result;
}
function v2Text(value: unknown, path: string, maxLength: number): string {
  const result = articleText(value, path, maxLength);
  if (/来源\s*\d+/iu.test(result)) throw new TypeError(`${path} must not contain provider source ordinals.`);
  if (/(?:source|question|finding|technical|research|website):[\p{L}\p{N}_:-]+/iu.test(result)) throw new TypeError(`${path} must not expose internal evidence handles.`);
  return result;
}
function v2TextArray(value: unknown, path: string, maxItems: number, maxLength: number, minItems = 0): string[] {
  const result = array(value, path).map((item, index) => v2Text(item, `${path}[${index}]`, maxLength));
  if (result.length < minItems || result.length > maxItems || new Set(result.map(normalize)).size !== result.length) {
    throw new TypeError(`${path} exceeds its item bound or contains duplicates.`);
  }
  return result;
}
function parseEvidenceRefs(value: unknown, path: string, knownRefs: ReadonlySet<string>): string[] {
  const result = uniqueArticleTextArray(value, path, 8, 500);
  if (result.length === 0 || result.some((ref) => !knownRefs.has(ref))) throw new TypeError(`${path} must bind known evidence.`);
  return result;
}
function parseEvidenceText(value: unknown, path: string, knownRefs: ReadonlySet<string>): GeoArticleEvidenceTextV2 {
  const row = object(value, path);
  return {
    text: v2Text(row.text, `${path}.text`, 4_000),
    evidenceRefs: parseEvidenceRefs(row.evidenceRefs, `${path}.evidenceRefs`, knownRefs)
  };
}
function parseExplanation(value: unknown, requiredElementIds: readonly string[], knownRefs: ReadonlySet<string>): GeoArticleExplanationV2[] {
  const result = array(value, "$geoArticleExample.explanation").map((item, index) => {
    const row = object(item, `$geoArticleExample.explanation[${index}]`);
    return {
      elementId: articleText(row.elementId, `$geoArticleExample.explanation[${index}].elementId`, 100),
      heading: v2Text(row.heading, `$geoArticleExample.explanation[${index}].heading`, 300),
      reason: v2Text(row.reason, `$geoArticleExample.explanation[${index}].reason`, 2_000),
      geoFunction: v2Text(row.geoFunction, `$geoArticleExample.explanation[${index}].geoFunction`, 2_000),
      evidenceRefs: parseEvidenceRefs(row.evidenceRefs, `$geoArticleExample.explanation[${index}].evidenceRefs`, knownRefs)
    };
  });
  const ids = result.map(({ elementId }) => elementId);
  if (ids.length !== requiredElementIds.length || new Set(ids).size !== ids.length || requiredElementIds.some((id) => !ids.includes(id))) {
    throw new TypeError("$geoArticleExample.explanation must explain every required element exactly once.");
  }
  return result;
}
function assertUniqueCustomerProse(values: readonly string[]): void {
  const normalized = values.map(normalize);
  if (new Set(normalized).size !== normalized.length) throw new TypeError("$geoArticleExample contains duplicate customer prose.");
}
function assertV2Language(deliverable: GeoArticleDeliverableV2, locale: string): void {
  if (!locale.toLowerCase().startsWith("zh")) return;
  const content = deliverable.kind === "article"
    ? [deliverable.article.title, deliverable.article.introduction.text,
        ...deliverable.article.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs.map(({ text }) => text)]),
        ...deliverable.article.faq.flatMap(({ question, answer }) => [question, answer.text])]
    : [deliverable.outline.workingTitle, deliverable.outline.readerQuestion, deliverable.outline.directAnswer,
        ...deliverable.outline.plannedSections.flatMap(({ heading, purpose }) => [heading, purpose]),
        ...deliverable.outline.evidenceToAdd, ...deliverable.outline.faqAngles];
  const prose = [...content, ...deliverable.explanation.flatMap(({ heading, reason, geoFunction }) => [heading, reason, geoFunction])].join("\n");
  if ((prose.match(/[\p{Script=Han}]/gu)?.length ?? 0) < 24) throw new TypeError("$geoArticleExample must contain substantive Simplified Chinese prose.");
}
function uniqueArticleTextArray(value: unknown, path: string, maxItems: number, maxLength: number): string[] {
  const result = array(value, path).map((item, index) => articleText(item, `${path}[${index}]`, maxLength));
  if (result.length > maxItems || new Set(result).size !== result.length) throw new TypeError(`${path} exceeds its item bound or contains duplicates.`);
  return result;
}
function assertArticleLanguage(article: GeoArticleExampleV1, locale: string): void {
  if (!locale.toLowerCase().startsWith("zh")) return;
  const prose = [article.title, article.introduction, ...article.sections.flatMap(({ heading, paragraphs }) => [heading, ...paragraphs]), ...article.faq.flatMap(({ question, answer }) => [question, answer]), ...article.rationale.map(({ reason }) => reason)].join("\n");
  const cjkCount = prose.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  if (cjkCount < 12) throw new TypeError("$geoArticleExample must contain substantive Simplified Chinese prose.");
}
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function comparableUrl(value: string): string { try { const url = new URL(value); url.hash = ""; return url.href; } catch { return value.trim(); } }
function object(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value.trim(); }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function timestamp(value: unknown, path: string): string { const result = text(value, path); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${path} must be an ISO timestamp.`); return result; }
function hash(value: unknown, path: string): string { const result = text(value, path); if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${path} must be a SHA-256 hash.`); return result; }

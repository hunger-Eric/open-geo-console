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

export const COMBINED_GEO_REPORT_V3_VERSION = 3 as const;
export const COMBINED_GEO_REPORT_V3_CONTRACT = "combined_geo_report_v3" as const;

export interface CombinedGeoReportV3 extends Omit<CombinedGeoReportV2, "version" | "artifactContract" | "businessQuestionAnswers"> {
  version: typeof COMBINED_GEO_REPORT_V3_VERSION;
  artifactContract: typeof COMBINED_GEO_REPORT_V3_CONTRACT;
  engineProvenance: OpenGeoEngineProvenanceV3;
  answerCards: [OpenGeoAnswerCardV3, OpenGeoAnswerCardV3, OpenGeoAnswerCardV3];
}

export function parseCombinedGeoReportV3(value: unknown): CombinedGeoReportV3 {
  const root = object(value, "$combined");
  exact(root.artifactContract, COMBINED_GEO_REPORT_V3_CONTRACT, "$combined.artifactContract");
  exact(root.version, COMBINED_GEO_REPORT_V3_VERSION, "$combined.version");
  const provenance = parseEngineProvenance(root.engineProvenance);
  const questionSet = object(root.businessQuestionSet, "$combined.businessQuestionSet") as unknown as CombinedGeoReportV2["businessQuestionSet"];
  const preliminaryCards = array(root.answerCards, "$combined.answerCards") as unknown as OpenGeoAnswerCardV3[];
  const groundedAnswerEvidence = preliminaryCards.flatMap((card) => card.sourceEvidence ?? []).map((evidence) => ({
    evidenceId: evidence.evidenceId,
    questionId: evidence.questionId,
    subjectKey: evidence.subjectKey,
    registrableDomain: evidence.registrableDomain,
    exactExcerpt: evidence.exactExcerpt,
    eligible: evidence.eligible,
    direct: evidence.direct
  }));
  const publicQuestionIds = toCanonicalBuyerQuestionSet(questionSet).questions.map(({ id }) => id);
  const projectedAnswers = preliminaryCards.slice(1).map((card, answerIndex) => ({
    questionId: publicQuestionIds[answerIndex + 1],
    purpose: answerIndex === 0 ? "customer_region_fit" : "purchase_delivery_risk",
    claims: (card.sentences ?? []).filter(({ kind }) => kind === "grounded_claim").map((sentence) => {
      const firstEvidence = (card.sourceEvidence ?? []).find(({ evidenceId }) => sentence.evidenceIds.includes(evidenceId));
      return {
        claimId: sentence.sentenceId,
        subjectKey: firstEvidence?.subjectKey ?? "missing-subject",
        text: sentence.text,
        evidenceIds: sentence.evidenceIds,
        confidence: sentence.confidence,
        ...(sentence.confidence === "limited" ? { limitation: limitedCopy(String(root.locale ?? "")) } : {})
      };
    })
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
  });
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
    missingEvidenceFamiliesByQuestion: preliminaryCards.map((card) => card.geoDiagnosis?.missingEvidenceFamilies ?? []) as [string[], string[], string[]]
  });
  const { businessQuestionAnswers: _businessQuestionAnswers, ...v3Base } = base;
  return {
    ...v3Base,
    version: COMBINED_GEO_REPORT_V3_VERSION,
    artifactContract: COMBINED_GEO_REPORT_V3_CONTRACT,
    engineProvenance: provenance,
    answerCards
  };
}

export function requireReadyCombinedGeoReportV3(value: unknown): CombinedGeoReportV3 {
  return parseCombinedGeoReportV3(value);
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
function normalize(value: string): string { return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); }
function object(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value.trim(); }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function timestamp(value: unknown, path: string): string { const result = text(value, path); if (!Number.isFinite(Date.parse(result))) throw new TypeError(`${path} must be an ISO timestamp.`); return result; }
function hash(value: unknown, path: string): string { const result = text(value, path); if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError(`${path} must be a SHA-256 hash.`); return result; }

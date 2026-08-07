import { deterministicId } from "./identity";
import type { BuyerQuestionKind, CanonicalBuyerQuestionSet } from "./types";
import { parseCanonicalBuyerQuestionSet } from "./validation";

export const BUSINESS_QUESTION_SET_VERSION = "business-questions-v1";
export const BUSINESS_QUESTION_NEUTRALIZATION_VERSION = "identity-neutral-v1";

export type BusinessQuestionPurpose =
  | "core_service_discovery"
  | "customer_region_fit"
  | "purchase_delivery_risk";

export interface BusinessProfileEvidence {
  url: string;
  quote: string;
}

export interface BusinessQuestionProfile {
  organizationName: string | null;
  brandNames: readonly string[];
  legalEntity: string | null;
  domain: string;
  businessModel: string | null;
  productsAndServices: readonly string[];
  capabilities: readonly string[];
  targetAudiences: readonly string[];
  marketsAndRegions: readonly string[];
  summary: string;
  confidence: "low" | "medium" | "high";
  evidence: readonly BusinessProfileEvidence[];
}

export interface BusinessQuestionCandidate {
  purpose: BusinessQuestionPurpose;
  generatedText: string;
  neutralPublicText: string;
  evidenceUrls: readonly string[];
}

export interface BusinessQuestionCandidateSet {
  id: string;
  revision: number;
  version: typeof BUSINESS_QUESTION_SET_VERSION;
  locale: string;
  region: string;
  confidence: "low" | "high";
  requiresAcknowledgement: boolean;
  profileEvidenceIdentity: string;
  identityExclusions: readonly string[];
  questions: readonly [BusinessQuestionCandidate, BusinessQuestionCandidate, BusinessQuestionCandidate];
}

export interface ConfirmedBusinessQuestion extends BusinessQuestionCandidate {
  privateText: string;
  edited: boolean;
  neutralizationVersion: typeof BUSINESS_QUESTION_NEUTRALIZATION_VERSION;
  neutralContentHash: string;
}

export interface ConfirmedBusinessQuestionSet extends Omit<BusinessQuestionCandidateSet, "questions"> {
  acknowledgedLowConfidence: boolean;
  confirmedAt: string;
  contentHash: string;
  questions: readonly [ConfirmedBusinessQuestion, ConfirmedBusinessQuestion, ConfirmedBusinessQuestion];
}

/**
 * Converts a Worker-owned model response into the persisted public-search
 * contract. It deliberately makes no business, industry, or question-content
 * decision: the model owns every question and its search lane.
 */
export function createModelBusinessQuestionCandidates(input: {
  locale: string;
  region: string;
  revision?: number;
  profile: BusinessQuestionProfile;
  modelOutput: unknown;
}): BusinessQuestionCandidateSet {
  const locale = bounded(input.locale, "locale", 35);
  const region = bounded(input.region, "region", 35);
  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError("revision must be a positive integer.");
  const modelQuestions = parseModelQuestions(input.modelOutput);
  const profileEvidenceIdentity = deterministicId("business-profile", [JSON.stringify({
    businessModel: input.profile.businessModel,
    productsAndServices: input.profile.productsAndServices,
    capabilities: input.profile.capabilities,
    targetAudiences: input.profile.targetAudiences,
    marketsAndRegions: input.profile.marketsAndRegions,
    summary: input.profile.summary,
    evidence: input.profile.evidence
  })]);
  const identityExclusions = exclusions(input.profile);
  const evidenceUrls = [...new Set(input.profile.evidence.map(({ url }) => bounded(url, "evidence.url", 2_000)))];
  const questions = modelQuestions.map(({ purpose, text }) => ({
    purpose,
    generatedText: text,
    neutralPublicText: neutralize(text, identityExclusions),
    evidenceUrls
  })) as unknown as BusinessQuestionCandidateSet["questions"];
  const confidence = input.profile.confidence === "high" ? "high" : "low";
  return {
    id: deterministicId("business-question-set", [
      BUSINESS_QUESTION_SET_VERSION,
      locale,
      region,
      String(revision),
      profileEvidenceIdentity,
      JSON.stringify(modelQuestions)
    ]),
    revision,
    version: BUSINESS_QUESTION_SET_VERSION,
    locale,
    region,
    confidence,
    requiresAcknowledgement: confidence === "low",
    profileEvidenceIdentity,
    identityExclusions,
    questions
  };
}

export function confirmBusinessQuestionSet(input: {
  candidates: BusinessQuestionCandidateSet;
  finalTexts: readonly string[];
  acknowledgedLowConfidence: boolean;
  confirmedAt: string;
}): ConfirmedBusinessQuestionSet {
  if (input.finalTexts.length !== 3) throw new TypeError("Exactly three business questions are required.");
  if (input.candidates.requiresAcknowledgement && !input.acknowledgedLowConfidence) {
    throw new TypeError("Low-confidence business questions require explicit acknowledgement.");
  }
  const confirmedAt = bounded(input.confirmedAt, "confirmedAt", 64);
  if (!Number.isFinite(Date.parse(confirmedAt))) throw new TypeError("confirmedAt must be an ISO timestamp.");
  const privateTexts = input.finalTexts.map((value, index) => validatePrivateQuestion(value, index));
  if (new Set(privateTexts.map(normalizeComparable)).size !== 3) {
    throw new TypeError("The three business questions must be distinct.");
  }
  const questions = input.candidates.questions.map((candidate, index) => {
    const privateText = privateTexts[index]!;
    const neutralPublicText = neutralize(privateText, input.candidates.identityExclusions);
    return {
      ...candidate,
      privateText,
      neutralPublicText,
      edited: normalizeComparable(privateText) !== normalizeComparable(candidate.generatedText),
      neutralizationVersion: BUSINESS_QUESTION_NEUTRALIZATION_VERSION,
      neutralContentHash: deterministicId("neutral-question", [input.candidates.locale, input.candidates.region, candidate.purpose, neutralPublicText])
    };
  }) as unknown as ConfirmedBusinessQuestionSet["questions"];
  const contentHash = deterministicId("confirmed-business-question-set", questions.flatMap(({ purpose, privateText, neutralPublicText }) => [purpose, privateText, neutralPublicText]));
  return {
    ...input.candidates,
    acknowledgedLowConfidence: input.acknowledgedLowConfidence,
    confirmedAt,
    contentHash,
    questions
  };
}

export function toCanonicalBuyerQuestionSet(set: ConfirmedBusinessQuestionSet): CanonicalBuyerQuestionSet {
  if (set.questions.length !== 3) throw new TypeError("Exactly three confirmed questions are required for public search.");
  const version = deterministicId("bqs", [set.version, set.id, String(set.revision)]);
  const kinds: Record<BusinessQuestionPurpose, BuyerQuestionKind> = {
    core_service_discovery: "supplier_discovery",
    customer_region_fit: "capability_fit",
    purchase_delivery_risk: "decision_risk"
  };
  return parseCanonicalBuyerQuestionSet({
    questionSetVersion: version,
    locale: set.locale,
    region: set.region,
    confidence: set.confidence,
    questions: set.questions.map((question) => ({
      id: deterministicId("question", [version, set.locale, set.region, question.purpose, question.neutralContentHash]),
      questionSetVersion: version,
      locale: set.locale,
      region: set.region,
      kind: kinds[question.purpose],
      exactText: question.neutralPublicText,
      normalizedText: question.neutralPublicText.normalize("NFKC").replace(/\s+/g, " ").trim(),
      derivation: {
        ruleId: `model-authored-${question.purpose}-v1`,
        evidenceSourceIds: [`profile-evidence:${set.profileEvidenceIdentity}`],
        subject: question.neutralPublicText,
        broadened: set.confidence === "low"
      }
    })),
    limitations: set.confidence === "low" ? ["The customer confirmed a low-confidence business profile before public search."] : []
  });
}

function parseModelQuestions(value: unknown): readonly [{ purpose: BusinessQuestionPurpose; text: string }, { purpose: BusinessQuestionPurpose; text: string }, { purpose: BusinessQuestionPurpose; text: string }] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Model buyer-question output must be an object.");
  const root = value as Record<string, unknown>;
  if (!Array.isArray(root.questions) || root.questions.length !== 3) {
    throw new TypeError("Model buyer-question output must contain exactly three questions.");
  }
  const questions = root.questions.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`questions[${index}] must be an object.`);
    const row = value as Record<string, unknown>;
    if (!("purpose" in row) || !("text" in row)) throw new TypeError(`questions[${index}] has an invalid shape.`);
    const purpose = row.purpose;
    if (purpose !== "core_service_discovery" && purpose !== "customer_region_fit" && purpose !== "purchase_delivery_risk") {
      throw new TypeError(`questions[${index}].purpose is unsupported.`);
    }
    return { purpose, text: validatePrivateQuestion(row.text, index) };
  });
  if (new Set(questions.map(({ purpose }) => purpose)).size !== 3 || new Set(questions.map(({ text }) => normalizeComparable(text))).size !== 3) {
    throw new TypeError("Model buyer questions must be distinct and cover the persisted search lanes.");
  }
  return questions as unknown as readonly [{ purpose: BusinessQuestionPurpose; text: string }, { purpose: BusinessQuestionPurpose; text: string }, { purpose: BusinessQuestionPurpose; text: string }];
}

function exclusions(profile: BusinessQuestionProfile): string[] {
  return [...new Set([
    profile.organizationName,
    ...profile.brandNames,
    profile.legalEntity,
    profile.domain
  ].filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function neutralize(value: string, identityExclusions: readonly string[]): string {
  let neutral = value.normalize("NFKC");
  for (const identity of [...identityExclusions].sort((a, b) => b.length - a.length)) {
    neutral = neutral.replace(new RegExp(escapeRegex(identity.normalize("NFKC")), "giu"), " ");
  }
  neutral = neutral.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, " ")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu, " ")
    .replace(/\b(?:order|report)[-_ ]?[a-z0-9-]{6,}\b/giu, " ")
    .replace(/\s+([,?.!])/g, "$1").replace(/\s+/g, " ").trim();
  if (neutral.length < 12 || identityExclusions.some((identity) => normalizeComparable(neutral).includes(normalizeComparable(identity)))) {
    throw new TypeError("The private question cannot be reliably neutralized.");
  }
  return neutral;
}

function validatePrivateQuestion(value: unknown, index: number): string {
  const text = bounded(value, `questions[${index}]`, 500);
  if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/u.test(text) || /(?:api[_ -]?key|bearer\s+|password|access[_ -]?token)/iu.test(text)) {
    throw new TypeError(`questions[${index}] contains contact details or secret material.`);
  }
  return text;
}

function bounded(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${label} must be a non-empty string of at most ${max} characters.`);
  return value.trim().normalize("NFC");
}

function normalizeComparable(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

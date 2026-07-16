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
  service: string;
  audience: string;
  marketRegion: string;
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

interface BusinessQuestionFocus {
  serviceCategory: string;
  serviceExamples: readonly string[];
  audience: string;
  marketRegion: string;
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

export function generateBusinessQuestionCandidates(input: {
  locale: string;
  region: string;
  revision?: number;
  profile: BusinessQuestionProfile;
}): BusinessQuestionCandidateSet {
  const locale = bounded(input.locale, "locale", 35);
  const region = bounded(input.region, "region", 35);
  const revision = input.revision ?? 1;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError("revision must be a positive integer.");
  const profile = input.profile;
  const focus = deriveBusinessQuestionFocus(profile, locale, region);
  const evidenceUrls = [...new Set(profile.evidence.map(({ url }) => bounded(url, "evidence.url", 2_000)))];
  const zh = locale.toLowerCase().startsWith("zh");
  const examples = focus.serviceExamples.length > 1
    ? zh
      ? `（如${focus.serviceExamples.join("、")}等）`
      : ` (such as ${focus.serviceExamples.join(", ")})`
    : "";
  const texts: [string, string, string] = zh ? [
    `哪些服务商公开提供${focus.serviceCategory}${examples}？`,
    `哪些${focus.serviceCategory}方案适合${focus.audience}进入${focus.marketRegion}市场，分别适用于什么货型、时效与交付条件？`,
    `采购${focus.serviceCategory}时，应核验哪些服务范围、交付条件、限制与风险？`
  ] : [
    `Which providers publicly offer ${focus.serviceCategory}${examples}?`,
    `Which ${focus.serviceCategory} options fit ${focus.audience} entering ${focus.marketRegion}, and for which cargo, timing, and delivery conditions?`,
    `When buying ${focus.serviceCategory}, which service scope, delivery conditions, limitations, and material risks should be verified?`
  ];
  const purposes: [BusinessQuestionPurpose, BusinessQuestionPurpose, BusinessQuestionPurpose] = [
    "core_service_discovery", "customer_region_fit", "purchase_delivery_risk"
  ];
  const identityExclusions = exclusions(profile);
  const questions = purposes.map((purpose, index) => ({
    purpose,
    generatedText: texts[index]!,
    neutralPublicText: neutralize(texts[index]!, identityExclusions),
    evidenceUrls,
    service: focus.serviceCategory,
    audience: focus.audience,
    marketRegion: focus.marketRegion
  })) as unknown as BusinessQuestionCandidateSet["questions"];
  const confidence = profile.confidence === "high" && profile.productsAndServices.length > 0
    && profile.targetAudiences.length > 0 && profile.marketsAndRegions.length > 0 ? "high" : "low";
  const profileEvidenceIdentity = deterministicId("business-profile", [JSON.stringify({
    businessModel: profile.businessModel,
    productsAndServices: profile.productsAndServices,
    capabilities: profile.capabilities,
    targetAudiences: profile.targetAudiences,
    marketsAndRegions: profile.marketsAndRegions,
    summary: profile.summary,
    evidence: profile.evidence
  })]);
  return {
    id: deterministicId("business-question-set", [BUSINESS_QUESTION_SET_VERSION, locale, region, String(revision), profileEvidenceIdentity]),
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
  const normalized = privateTexts.map(normalizeComparable);
  if (new Set(normalized).size !== 3) throw new TypeError("The three business questions must be semantically distinct.");
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
    revision: input.candidates.revision,
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
        ruleId: `confirmed-${question.purpose}-v1`,
        evidenceSourceIds: [`profile-evidence:${set.profileEvidenceIdentity}`],
        subject: publicSearchSubject(question.purpose, question.neutralPublicText, set.locale),
        supportingTerm: question.purpose === "customer_region_fit" ? question.neutralPublicText : undefined,
        broadened: set.confidence === "low"
      }
    })),
    limitations: set.confidence === "low" ? ["The customer confirmed a low-confidence business profile before public search."] : []
  });
}

function publicSearchSubject(purpose:BusinessQuestionPurpose,text:string,locale:string):string{
  if(purpose!=="purchase_delivery_risk")return text;
  if(locale.toLowerCase().startsWith("zh")){
    const service=/采购(.+?)时/.exec(text)?.[1]?.trim();
    const capability=/比较(.+?)[、，,]交付条件/.exec(text)?.[1]?.trim();
    if(service&&capability)return `${service} ${capability}`;
    if(capability)return capability;
  }else{
    const subject=/compare (.+?)(?:,| and )\s*delivery conditions/i.exec(text)?.[1]?.trim();
    if(subject)return subject;
  }
  return text;
}

function strongest(values: readonly string[], profile: BusinessQuestionProfile, fallback: string): string {
  const supported = values.map((raw, index) => {
    const value = bounded(raw, "profile signal", 500);
    const needle = normalizeComparable(value);
    const quoteMatches = profile.evidence.reduce((count, evidence) => count + occurrences(normalizeComparable(evidence.quote), needle), 0);
    const summaryMatches = occurrences(normalizeComparable(profile.summary), needle);
    return {
      value,
      index,
      score: (quoteMatches > 0 ? 100 : 0) + (summaryMatches > 0 ? 10 : 0)
        + (profile.confidence === "high" ? 3 : profile.confidence === "medium" ? 2 : 1)
    };
  });
  return supported.sort((left, right) => right.score - left.score || left.index - right.index)[0]?.value ?? fallback;
}

function deriveBusinessQuestionFocus(profile: BusinessQuestionProfile, locale: string, region: string): BusinessQuestionFocus {
  const rawService = strongest(
    profile.productsAndServices,
    profile,
    profile.businessModel || localized(locale, "business services", "企业服务")
  );
  const normalizedService = marketCategory(rawService, locale);
  const marketFallback = region === "global" ? localized(locale, "the target market", "目标市场") : region;
  const markets = profile.marketsAndRegions.slice(0, 3).map((value) => bounded(value, "profile signal", 500));
  return {
    serviceCategory: compactServiceCategory(profile, normalizedService, locale),
    serviceExamples: splitServiceExamples(normalizedService).slice(0, 3),
    audience: strongest(profile.targetAudiences, profile, localized(locale, "business buyers", "企业采购方")),
    marketRegion: markets.length > 0
      ? markets.join(locale.toLowerCase().startsWith("zh") ? "、" : ", ")
      : marketFallback
  };
}

function splitServiceExamples(value: string): string[] {
  return [...new Set(value.normalize("NFKC").split(/[、，,;/]/u).map((part) => part.trim()).filter(Boolean))];
}

function compactServiceCategory(profile: BusinessQuestionProfile, service: string, locale: string): string {
  const logistics = `${profile.businessModel ?? ""} ${profile.summary} ${service}`;
  if (/物流|货运|海运|空运|专线/u.test(logistics)) {
    return localized(locale, "cross-border logistics services", "跨境物流服务");
  }
  return marketCategory(service, locale);
}

function marketCategory(value: string, locale: string): string {
  const normalized = value.normalize("NFKC").trim();
  if (locale.toLowerCase().startsWith("zh")) {
    const withoutOwnership = normalized.replace(/(?:自营|直营|自有|自主运营|自建)/gu, "").trim();
    const parenthetical = /[（(]([^）)]+)[）)]/u.exec(withoutOwnership)?.[1]?.trim();
    const category = parenthetical && /[/、，,]/u.test(parenthetical) ? parenthetical : withoutOwnership;
    return category.replace(/[（(][^）)]*[）)]/gu, "").replace(/\s*[/，,]\s*/gu, "、").replace(/、+/gu, "、").trim();
  }
  return normalized
    .replace(/\b(?:self[- ]operated|direct[- ]operated|company[- ]owned|owned|in[- ]house)\b/giu, "")
    .replace(/\s+/gu, " ").replace(/^[-–—,:;\s]+|[-–—,:;\s]+$/gu, "").trim();
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

function validatePrivateQuestion(value: string, index: number): string {
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

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let position = 0;
  while ((position = haystack.indexOf(needle, position)) >= 0) { count += 1; position += needle.length; }
  return count;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function localized(locale: string, en: string, zh: string): string {
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

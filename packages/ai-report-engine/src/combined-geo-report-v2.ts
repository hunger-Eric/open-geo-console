import type { ProviderCandidate, QualifiedProvider } from "@open-geo-console/citation-intelligence";
import { COMBINED_GEO_REPORT_CONTRACT, parseCombinedGeoReportV1, type CombinedGeoReportV1 } from "./combined-geo-report";
import { parseGroundedBusinessAnswersV2, type GroundedAnswerEvidence, type GroundedBusinessQuestionAnswersV2 } from "./grounded-business-answers-v2";

export const COMBINED_GEO_REPORT_V2_VERSION = 2 as const;
export const COMBINED_GEO_REPORT_V2_CONTRACT = "combined_geo_report_v2" as const;
export const PROVIDER_DISCOVERY_VERSION = "provider-discovery-v1" as const;

export interface ProviderCapabilityEvidenceReference {
  evidenceId: string;
  sourceEvidenceId: string;
  registrableDomain: string;
  title: string;
  sourceAuthority: string;
  observedAt: string;
  exactExcerpt: string;
  capability: string;
}
export interface ProviderDiscoveryV1 {
  version: typeof PROVIDER_DISCOVERY_VERSION;
  policy: { policyId: string; policyVersion: string };
  identity: { candidateSetHash: string; queryPlanVersion: string; passageSelectorVersion: string; claimExtractionContract: string; claimExtractionModel: string; claimSetHash: string };
  execution: { plannedQueries: number; completedQueries: number; returnedObservations: number; safelyRetrievedPages: number; relevantPassages: number; discoveredProviders: number; strictProviders: number; candidateProviders: number; rejectedProviders: number; coverage: "complete" | "partial" | "insufficient" };
  strict: QualifiedProvider[];
  candidates: ProviderCandidate[];
  evidence: ProviderCapabilityEvidenceReference[];
  limitation: string;
}
export interface CombinedGeoReportV2 extends Omit<CombinedGeoReportV1, "version" | "artifactContract" | "businessQuestionAnswers"> {
  version: typeof COMBINED_GEO_REPORT_V2_VERSION;
  artifactContract: typeof COMBINED_GEO_REPORT_V2_CONTRACT;
  providerDiscovery: ProviderDiscoveryV1;
  groundedAnswerEvidence: GroundedAnswerEvidence[];
  businessQuestionAnswers: GroundedBusinessQuestionAnswersV2;
}

export function parseProviderDiscoveryV1(value: unknown): ProviderDiscoveryV1 {
  const root = object(value, "$providerDiscovery");
  exact(root.version, PROVIDER_DISCOVERY_VERSION, "$providerDiscovery.version");
  const policy = object(root.policy, "$providerDiscovery.policy");
  const identity = object(root.identity, "$providerDiscovery.identity");
  const execution = object(root.execution, "$providerDiscovery.execution");
  const strict = array(root.strict, "$providerDiscovery.strict") as unknown as QualifiedProvider[];
  const candidates = array(root.candidates, "$providerDiscovery.candidates") as unknown as ProviderCandidate[];
  const evidence = array(root.evidence, "$providerDiscovery.evidence").map(parseProviderEvidence);
  const evidenceIds = new Set(evidence.map(({ evidenceId }) => evidenceId));
  if (evidenceIds.size !== evidence.length) throw new TypeError("Provider discovery evidence IDs must be unique.");
  for (const [index, provider] of strict.entries()) {
    validateProviderIdentity(provider, `$providerDiscovery.strict[${index}]`);
    if (!provider.evidenceIds.length || provider.evidenceIds.some((id) => !evidenceIds.has(id))) throw new TypeError("Strict provider evidence must resolve to customer-visible evidence.");
    if (!provider.capabilities.length || provider.capabilities.some((capability) => capability.evidenceIds.some((id) => !evidenceIds.has(id)))) throw new TypeError("Provider capability evidence is incomplete.");
  }
  for (const [index, provider] of candidates.entries()) {
    validateProviderIdentity(provider, `$providerDiscovery.candidates[${index}]`);
    if (!provider.leadEvidenceIds.length || !provider.missingProof.length || provider.leadEvidenceIds.some((id) => !evidenceIds.has(id))) throw new TypeError("Provider candidates require evidence leads and missing-proof labels.");
  }
  const counts = {
    plannedQueries: nonnegative(execution.plannedQueries, "plannedQueries"), completedQueries: nonnegative(execution.completedQueries, "completedQueries"),
    returnedObservations: nonnegative(execution.returnedObservations, "returnedObservations"), safelyRetrievedPages: nonnegative(execution.safelyRetrievedPages, "safelyRetrievedPages"),
    relevantPassages: nonnegative(execution.relevantPassages, "relevantPassages"), discoveredProviders: nonnegative(execution.discoveredProviders, "discoveredProviders"),
    strictProviders: nonnegative(execution.strictProviders, "strictProviders"), candidateProviders: nonnegative(execution.candidateProviders, "candidateProviders"),
    rejectedProviders: nonnegative(execution.rejectedProviders, "rejectedProviders"), coverage: oneOf(execution.coverage, ["complete", "partial", "insufficient"] as const, "coverage")
  };
  if (counts.strictProviders !== strict.length || counts.candidateProviders !== candidates.length || counts.discoveredProviders !== counts.strictProviders + counts.candidateProviders + counts.rejectedProviders || counts.completedQueries > counts.plannedQueries) throw new TypeError("Provider discovery execution counts do not reconcile.");
  return {
    version: PROVIDER_DISCOVERY_VERSION,
    policy: { policyId: text(policy.policyId, "policyId"), policyVersion: text(policy.policyVersion, "policyVersion") },
    identity: { candidateSetHash: hash(identity.candidateSetHash, "candidateSetHash"), queryPlanVersion: text(identity.queryPlanVersion, "queryPlanVersion"), passageSelectorVersion: text(identity.passageSelectorVersion, "passageSelectorVersion"), claimExtractionContract: text(identity.claimExtractionContract, "claimExtractionContract"), claimExtractionModel: text(identity.claimExtractionModel, "claimExtractionModel"), claimSetHash: hash(identity.claimSetHash, "claimSetHash") },
    execution: counts, strict, candidates, evidence, limitation: text(root.limitation, "$providerDiscovery.limitation")
  };
}

export function parseCombinedGeoReportV2(value: unknown): CombinedGeoReportV2 {
  const root = object(value, "$combined");
  exact(root.artifactContract, COMBINED_GEO_REPORT_V2_CONTRACT, "$combined.artifactContract");
  exact(root.version, COMBINED_GEO_REPORT_V2_VERSION, "$combined.version");
  const providerDiscovery = parseProviderDiscoveryV1(root.providerDiscovery);
  const groundedAnswerEvidence = array(root.groundedAnswerEvidence, "$combined.groundedAnswerEvidence").map(parseGroundedEvidence);
  const businessQuestionAnswers = parseGroundedBusinessAnswersV2(root.businessQuestionAnswers, { evidence: groundedAnswerEvidence, locale: text(root.locale, "$combined.locale") });
  const base = parseCombinedGeoReportV1({ ...root, version: 1, artifactContract: COMBINED_GEO_REPORT_CONTRACT, businessQuestionAnswers: undefined });
  const expectedQuestionIds = base.publicSourceForensics.questions.questions.slice(1).map(({ id }) => id);
  if (businessQuestionAnswers.answers.some((answer, index) => answer.questionId !== expectedQuestionIds[index])) throw new TypeError("Grounded answers must bind exact public questions 2 and 3.");
  return { ...base, version: COMBINED_GEO_REPORT_V2_VERSION, artifactContract: COMBINED_GEO_REPORT_V2_CONTRACT, providerDiscovery, groundedAnswerEvidence, businessQuestionAnswers };
}

export function requireReadyCombinedGeoReportV2(value: unknown): CombinedGeoReportV2 { return parseCombinedGeoReportV2(value); }

function parseProviderEvidence(value: unknown): ProviderCapabilityEvidenceReference { const row = object(value, "providerEvidence"); const excerpt = text(row.exactExcerpt, "providerEvidence.exactExcerpt"); if (excerpt.length > 1_200) throw new TypeError("Provider evidence excerpt exceeds the retained bound."); return { evidenceId: text(row.evidenceId, "evidenceId"), sourceEvidenceId: text(row.sourceEvidenceId, "sourceEvidenceId"), registrableDomain: text(row.registrableDomain, "registrableDomain"), title: text(row.title, "title"), sourceAuthority: text(row.sourceAuthority, "sourceAuthority"), observedAt: timestamp(row.observedAt, "observedAt"), exactExcerpt: excerpt, capability: text(row.capability, "capability") }; }
function parseGroundedEvidence(value: unknown): GroundedAnswerEvidence { const row=object(value,"groundedAnswerEvidence"); return { evidenceId:text(row.evidenceId,"evidenceId"),questionId:text(row.questionId,"questionId"),subjectKey:text(row.subjectKey,"subjectKey"),registrableDomain:text(row.registrableDomain,"registrableDomain"),exactExcerpt:text(row.exactExcerpt,"exactExcerpt"),eligible:boolean(row.eligible,"eligible"),direct:boolean(row.direct,"direct") }; }
function validateProviderIdentity(value: { entityId?: unknown; canonicalName?: unknown }, path: string): void { text(value.entityId, `${path}.entityId`); text(value.canonicalName, `${path}.canonicalName`); }
function object(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value.trim(); }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function nonnegative(value: unknown, path: string): number { if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError(`${path} must be a non-negative integer.`); return Number(value); }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T { if (!allowed.includes(value as T)) throw new TypeError(`${path} is unsupported.`); return value as T; }
function hash(value: unknown, path: string): string { const result = text(value, path); if (!/^[a-f0-9]{64}$/.test(result)) throw new TypeError(`${path} must be a SHA-256 hash.`); return result; }
function timestamp(value: unknown, path: string): string { const result=text(value,path); if(!Number.isFinite(Date.parse(result))) throw new TypeError(`${path} must be a timestamp.`); return result; }
function boolean(value: unknown,path:string):boolean{ if(typeof value!=="boolean")throw new TypeError(`${path} must be boolean.`);return value; }

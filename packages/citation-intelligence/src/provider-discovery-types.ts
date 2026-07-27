export type ProviderRole = "service_provider" | "platform" | "software_vendor" | "directory_or_media" | "unknown";
export type ProviderEvidenceGradeV2 = "A" | "B" | "C" | "D";
export type ProviderQualificationTier = "verified_full_chain" | "verified_core_segments" | "candidate" | "rejected";
export type ProviderClaimDirectness = "direct" | "associated" | "lead_only";

export interface ProviderPolicySelectionInput {
  question: string;
  locale: string;
  websiteCategories: string[];
}

export interface QualificationQueryFacet {
  id: string;
  terms: Readonly<Record<"zh" | "en", readonly string[]>>;
}

export interface CapabilityDimensionDefinition {
  id: string;
  label: Readonly<Record<"zh" | "en", string>>;
  states: readonly string[];
  mandatoryForFullChain: boolean;
}

export interface ProviderClaim {
  claimId: string;
  subjectName: string;
  subjectEntityId: string;
  genericRole: ProviderRole;
  policyRole: string;
  capability: string;
  operatingMode: string;
  serviceScope: string[];
  routeScope: string[];
  exactExcerpt: string;
  passageId: string;
  sourceEvidenceId: string;
  sourceAuthority: string;
  directness: ProviderClaimDirectness;
  relevanceScore: number;
  grade: ProviderEvidenceGradeV2;
  sourceEligibility: { eligible: boolean };
  registrableDomain: string;
  contradictionGroupId?: string;
}

export interface CapabilityAssessment {
  dimensionId: string;
  state: string;
  evidenceIds: string[];
  domains: string[];
  contradictory: boolean;
}

export interface QualifiedProvider {
  entityId: string;
  canonicalName: string;
  genericRole: ProviderRole;
  policyRole: string;
  tier: Exclude<ProviderQualificationTier, "candidate" | "rejected">;
  serviceScope: string[];
  routeScope: string[];
  capabilities: CapabilityAssessment[];
  evidenceIds: string[];
  independentDomains: string[];
}

export interface ProviderCandidate {
  entityId: string;
  canonicalName: string;
  genericRole: ProviderRole;
  policyRole: string;
  leadEvidenceIds: string[];
  missingProof: string[];
}

export interface ProviderRejection {
  entityId: string;
  canonicalName: string;
  reason: "irrelevant" | "inaccessible" | "ambiguous_identity" | "software_only" | "directory_only" | "unsupported_claim" | "contradictory";
  evidenceIds: string[];
}

export interface ProviderQualificationInput {
  claims: readonly ProviderClaim[];
}

export interface ProviderQualificationResult {
  policyId: string;
  policyVersion: string;
  strict: QualifiedProvider[];
  candidates: ProviderCandidate[];
  rejected: ProviderRejection[];
}

export interface ProviderQualificationPolicy {
  policyId: string;
  version: string;
  matches(input: ProviderPolicySelectionInput): boolean;
  queryFacets: readonly QualificationQueryFacet[];
  capabilityDimensions: readonly CapabilityDimensionDefinition[];
  classifyEntityRole(claims: readonly ProviderClaim[]): string;
  qualify(input: ProviderQualificationInput): ProviderQualificationResult;
}

export function normalizeProviderPolicyText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

import type {
  CapabilityAssessment,
  ProviderCandidate,
  ProviderClaim,
  ProviderQualificationInput,
  ProviderQualificationPolicy,
  ProviderQualificationResult,
  ProviderRejection,
  QualifiedProvider
} from "./provider-discovery-types";
import { uniqueSorted } from "./provider-discovery-types";

const FULL_CHAIN_ACCEPTED: Readonly<Record<string, readonly string[]>> = {
  linehaul_fleet: ["self_operated", "dedicated_controlled"],
  origin_warehouse: ["self_operated"],
  customs_operation: ["in_house_licensed"],
  last_mile: ["self_operated"],
  fixed_route: ["verified"],
  outsourcing: ["no_outsourcing_verified"]
};

export function qualifyProviders(input: ProviderQualificationInput, policy: ProviderQualificationPolicy): ProviderQualificationResult {
  const groups = new Map<string, ProviderClaim[]>();
  for (const claim of input.claims) groups.set(claim.subjectEntityId, [...(groups.get(claim.subjectEntityId) ?? []), claim]);
  const strict: QualifiedProvider[] = [];
  const candidates: ProviderCandidate[] = [];
  const rejected: ProviderRejection[] = [];

  for (const claims of groups.values()) {
    const first = claims[0]!;
    const policyRole = policy.classifyEntityRole(claims);
    const evidenceIds = uniqueSorted(claims.map(({ sourceEvidenceId }) => sourceEvidenceId));
    if (first.genericRole === "software_vendor" || policyRole === "software_vendor") {
      rejected.push(rejection(first, "software_only", evidenceIds));
      continue;
    }
    if (first.genericRole === "directory_or_media" || policyRole === "directory_or_media") {
      rejected.push(rejection(first, "directory_only", evidenceIds));
      continue;
    }
    const eligible = claims.filter((claim) => claim.directness === "direct" && claim.relevanceScore >= 70 && claim.sourceEligibility.eligible && (claim.grade === "A" || claim.grade === "B"));
    const capabilities = assessCapabilities(policy, eligible);
    const domains = uniqueSorted(eligible.map(({ registrableDomain }) => registrableDomain));
    const fullChain = isFullChain(policy, capabilities) && eligible.some(({ grade }) => grade === "A") && domains.length >= 2;
    const coreSegments = !fullChain && isCoreSegments(capabilities) && hasCoreEvidenceStrength(eligible, domains);
    if (fullChain || coreSegments) {
      strict.push({
        entityId: first.subjectEntityId,
        canonicalName: first.subjectName,
        genericRole: first.genericRole,
        policyRole,
        tier: fullChain ? "verified_full_chain" : "verified_core_segments",
        serviceScope: uniqueSorted(eligible.flatMap(({ serviceScope }) => serviceScope)),
        routeScope: uniqueSorted(eligible.flatMap(({ routeScope }) => routeScope)),
        capabilities,
        evidenceIds: uniqueSorted(eligible.map(({ sourceEvidenceId }) => sourceEvidenceId)),
        independentDomains: domains
      });
      continue;
    }
    if (claims.length > 0) {
      candidates.push({
        entityId: first.subjectEntityId,
        canonicalName: first.subjectName,
        genericRole: first.genericRole,
        policyRole,
        leadEvidenceIds: evidenceIds,
        missingProof: missingProof(policy, capabilities)
      });
    }
  }

  strict.sort((left, right) => tierRank(left.tier) - tierRank(right.tier) || capabilityStrength(right) - capabilityStrength(left) || gradeStrength(input.claims, right.entityId) - gradeStrength(input.claims, left.entityId) || relevanceStrength(input.claims, right.entityId) - relevanceStrength(input.claims, left.entityId) || right.independentDomains.length - left.independentDomains.length || left.canonicalName.localeCompare(right.canonicalName) || left.entityId.localeCompare(right.entityId));
  candidates.sort((left, right) => left.canonicalName.localeCompare(right.canonicalName) || left.entityId.localeCompare(right.entityId));
  rejected.sort((left, right) => left.canonicalName.localeCompare(right.canonicalName) || left.entityId.localeCompare(right.entityId));
  return { policyId: policy.policyId, policyVersion: policy.version, strict, candidates, rejected };
}

function assessCapabilities(policy: ProviderQualificationPolicy, claims: readonly ProviderClaim[]): CapabilityAssessment[] {
  return policy.capabilityDimensions.map((dimension) => {
    const items = claims.filter(({ capability }) => capability === dimension.id);
    const states = uniqueSorted(items.map(({ operatingMode }) => operatingMode));
    return {
      dimensionId: dimension.id,
      state: states.length === 1 ? states[0]! : states.length > 1 ? "mixed" : dimension.states.includes("unknown") ? "unknown" : "unverified",
      evidenceIds: uniqueSorted(items.map(({ sourceEvidenceId }) => sourceEvidenceId)),
      domains: uniqueSorted(items.map(({ registrableDomain }) => registrableDomain)),
      contradictory: states.length > 1 || items.some(({ contradictionGroupId }) => Boolean(contradictionGroupId))
    };
  });
}

function isFullChain(policy: ProviderQualificationPolicy, capabilities: readonly CapabilityAssessment[]): boolean {
  return policy.capabilityDimensions.filter(({ mandatoryForFullChain }) => mandatoryForFullChain).every(({ id }) => {
    const assessment = capabilities.find(({ dimensionId }) => dimensionId === id);
    return Boolean(assessment && !assessment.contradictory && FULL_CHAIN_ACCEPTED[id]?.includes(assessment.state));
  });
}

function isCoreSegments(capabilities: readonly CapabilityAssessment[]): boolean {
  const state = (id: string) => capabilities.find(({ dimensionId }) => dimensionId === id)?.state;
  const transport = ["self_operated", "dedicated_controlled"].includes(state("linehaul_fleet") ?? "") || ["owned", "dedicated_charter"].includes(state("air_capacity") ?? "");
  const operation = state("origin_warehouse") === "self_operated" || state("overseas_warehouse") === "self_operated" || state("customs_operation") === "in_house_licensed" || state("last_mile") === "self_operated";
  return state("fixed_route") === "verified" && transport && operation;
}

function hasCoreEvidenceStrength(claims: readonly ProviderClaim[], domains: readonly string[]): boolean {
  return domains.length >= 2 || (claims.some(({ grade }) => grade === "A") && new Set(claims.map(({ capability }) => capability)).size >= 2);
}

function missingProof(policy: ProviderQualificationPolicy, capabilities: readonly CapabilityAssessment[]): string[] {
  const values = policy.capabilityDimensions.filter(({ mandatoryForFullChain }) => mandatoryForFullChain).flatMap((dimension) => {
    const assessment = capabilities.find(({ dimensionId }) => dimensionId === dimension.id);
    return assessment && FULL_CHAIN_ACCEPTED[dimension.id]?.includes(assessment.state) && !assessment.contradictory ? [] : [dimension.label.zh];
  });
  return values.length ? values : ["独立来源交叉验证"];
}

function rejection(claim: ProviderClaim, reason: ProviderRejection["reason"], evidenceIds: string[]): ProviderRejection {
  return { entityId: claim.subjectEntityId, canonicalName: claim.subjectName, reason, evidenceIds };
}

function tierRank(value: QualifiedProvider["tier"]): number { return value === "verified_full_chain" ? 0 : 1; }
function capabilityStrength(value: QualifiedProvider): number { return value.capabilities.filter(({ evidenceIds }) => evidenceIds.length > 0).length; }
function gradeStrength(claims: readonly ProviderClaim[], entityId: string): number { return claims.filter((claim) => claim.subjectEntityId === entityId && claim.grade === "A").length; }
function relevanceStrength(claims: readonly ProviderClaim[], entityId: string): number { return Math.max(0, ...claims.filter((claim) => claim.subjectEntityId === entityId).map(({ relevanceScore }) => relevanceScore)); }

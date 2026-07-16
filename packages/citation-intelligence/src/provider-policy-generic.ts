import type { ProviderClaim, ProviderPolicySelectionInput, ProviderQualificationInput, ProviderQualificationPolicy, ProviderQualificationResult } from "./provider-discovery-types";
import { uniqueSorted } from "./provider-discovery-types";

export const GENERIC_PROVIDER_POLICY: ProviderQualificationPolicy = Object.freeze({
  policyId: "generic_provider_discovery_v1",
  version: "1",
  matches: (_input: ProviderPolicySelectionInput) => true,
  queryFacets: [
    { id: "canonical", terms: { zh: ["供应商", "服务商"], en: ["providers", "suppliers"] } },
    { id: "capability", terms: { zh: ["服务能力"], en: ["service capabilities"] } },
    { id: "region-fit", terms: { zh: ["服务地区"], en: ["service regions"] } },
    { id: "use-case", terms: { zh: ["客户案例"], en: ["customer cases"] } },
    { id: "qualification", terms: { zh: ["资质"], en: ["qualifications"] } },
    { id: "risk", terms: { zh: ["交付风险"], en: ["delivery risks"] } }
  ],
  capabilityDimensions: [
    { id: "service_capability", label: { zh: "服务能力", en: "Service capability" }, states: ["verified", "unverified"], mandatoryForFullChain: false },
    { id: "region_fit", label: { zh: "区域匹配", en: "Region fit" }, states: ["verified", "unverified"], mandatoryForFullChain: false },
    { id: "use_case_fit", label: { zh: "场景匹配", en: "Use-case fit" }, states: ["verified", "unverified"], mandatoryForFullChain: false },
    { id: "qualification", label: { zh: "资质", en: "Qualification" }, states: ["verified", "unverified"], mandatoryForFullChain: false }
  ],
  classifyEntityRole: (claims: readonly ProviderClaim[]) => claims.find(({ policyRole }) => policyRole.trim())?.policyRole ?? "unknown",
  qualify: (input: ProviderQualificationInput) => candidateProjection("generic_provider_discovery_v1", "1", input.claims)
});

function candidateProjection(policyId: string, policyVersion: string, claims: readonly ProviderClaim[]): ProviderQualificationResult {
  const groups = new Map<string, ProviderClaim[]>();
  for (const claim of claims) groups.set(claim.subjectEntityId, [...(groups.get(claim.subjectEntityId) ?? []), claim]);
  return {
    policyId,
    policyVersion,
    strict: [],
    candidates: [...groups.values()].map((items) => ({
      entityId: items[0]!.subjectEntityId,
      canonicalName: items[0]!.subjectName,
      genericRole: items[0]!.genericRole,
      policyRole: items[0]!.policyRole,
      leadEvidenceIds: uniqueSorted(items.map(({ sourceEvidenceId }) => sourceEvidenceId)),
      missingProof: ["Independent direct capability verification is required."]
    })).sort((left, right) => left.canonicalName.localeCompare(right.canonicalName)),
    rejected: []
  };
}

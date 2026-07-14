import type { ProviderPolicySelectionInput, ProviderQualificationPolicy } from "./provider-discovery-types";
import { GENERIC_PROVIDER_POLICY } from "./provider-policy-generic";
import { LOGISTICS_SELF_OPERATED_POLICY } from "./provider-policy-logistics";

const POLICIES = [LOGISTICS_SELF_OPERATED_POLICY, GENERIC_PROVIDER_POLICY] as const;

export function selectProviderQualificationPolicy(input: ProviderPolicySelectionInput): ProviderQualificationPolicy {
  return POLICIES.find((policy) => policy.matches(input)) ?? GENERIC_PROVIDER_POLICY;
}

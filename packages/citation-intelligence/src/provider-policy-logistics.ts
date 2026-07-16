import type { ProviderClaim, ProviderPolicySelectionInput, ProviderQualificationInput, ProviderQualificationPolicy } from "./provider-discovery-types";
import { normalizeProviderPolicyText } from "./provider-discovery-types";
import { qualifyProviders } from "./provider-qualification";

const LOGISTICS_TERMS = ["物流", "专线", "运输", "货运", "logistics", "freight", "transport", "delivery"];
const CONTROL_TERMS = ["自营", "自有", "直营", "包机", "固定线路", "self-operated", "owned", "dedicated", "direct-operated"];

export const LOGISTICS_SELF_OPERATED_POLICY: ProviderQualificationPolicy = Object.freeze({
  policyId: "logistics_self_operated_v1",
  version: "1",
  matches: (input: ProviderPolicySelectionInput) => {
    const value = normalizeProviderPolicyText([input.question, ...input.websiteCategories].join(" "));
    return LOGISTICS_TERMS.some((term) => value.includes(term)) && CONTROL_TERMS.some((term) => value.includes(term));
  },
  queryFacets: [
    { id: "canonical", terms: { zh: ["自营专线物流"], en: ["self-operated dedicated logistics"] } },
    { id: "providers", terms: { zh: ["物流公司", "供应商"], en: ["logistics providers", "suppliers"] } },
    { id: "transport-control", terms: { zh: ["自有车队", "包机", "固定运力"], en: ["owned fleet", "charter", "dedicated capacity"] } },
    { id: "warehouses", terms: { zh: ["自营集货仓", "自营海外仓"], en: ["operated consolidation warehouse", "operated overseas warehouse"] } },
    { id: "customs-last-mile", terms: { zh: ["自有清关", "自营末端"], en: ["in-house customs", "operated last mile"] } },
    { id: "cases-qualifications", terms: { zh: ["固定线路", "客户案例", "资质"], en: ["fixed routes", "customer cases", "qualifications"] } }
  ],
  capabilityDimensions: [
    { id: "linehaul_fleet", label: { zh: "干线车队", en: "Line-haul fleet" }, states: ["self_operated", "dedicated_controlled", "partner", "mixed", "unknown"], mandatoryForFullChain: true },
    { id: "air_capacity", label: { zh: "航空运力", en: "Air capacity" }, states: ["owned", "dedicated_charter", "purchased_capacity", "partner", "unknown"], mandatoryForFullChain: false },
    { id: "origin_warehouse", label: { zh: "起运集货仓", en: "Origin consolidation warehouse" }, states: ["self_operated", "partner", "unknown"], mandatoryForFullChain: true },
    { id: "overseas_warehouse", label: { zh: "海外仓", en: "Overseas warehouse" }, states: ["self_operated", "partner", "unknown"], mandatoryForFullChain: false },
    { id: "customs_operation", label: { zh: "清关主体", en: "Customs operation" }, states: ["in_house_licensed", "managed_partner", "partner", "unknown"], mandatoryForFullChain: true },
    { id: "last_mile", label: { zh: "末端派送", en: "Last mile" }, states: ["self_operated", "partner", "mixed", "unknown"], mandatoryForFullChain: true },
    { id: "fixed_route", label: { zh: "固定专线", en: "Fixed dedicated route" }, states: ["verified", "unverified"], mandatoryForFullChain: true },
    { id: "outsourcing", label: { zh: "外包与拼货", en: "Outsourcing and cargo mixing" }, states: ["no_outsourcing_verified", "outsourcing_present", "mixed", "unknown"], mandatoryForFullChain: true }
  ],
  classifyEntityRole: classifyLogisticsRole,
  qualify: (input: ProviderQualificationInput) => qualifyProviders(input, LOGISTICS_SELF_OPERATED_POLICY)
});

function classifyLogisticsRole(claims: readonly ProviderClaim[]): string {
  const roles = claims.map(({ policyRole }) => policyRole);
  if (roles.includes("software_vendor")) return "software_vendor";
  if (roles.includes("integrated_logistics")) return "integrated_logistics";
  if (roles.includes("carrier")) return "carrier";
  if (roles.includes("freight_forwarder")) return "freight_forwarder";
  if (roles.includes("warehouse_operator")) return "warehouse_operator";
  return roles.find(Boolean) ?? "unknown";
}

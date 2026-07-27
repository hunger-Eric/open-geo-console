import { describe, expect, it } from "vitest";
import type { ProviderClaim } from "./provider-discovery-types";
import { LOGISTICS_SELF_OPERATED_POLICY } from "./provider-policy-logistics";
import { qualifyProviders } from "./provider-qualification";

describe("provider qualification", () => {
  it("does not transfer a customer capability to its TMS vendor", () => {
    const result = qualifyProviders({ claims: [
      claim({ subjectEntityId: "eccang", subjectName: "易仓科技", genericRole: "software_vendor", policyRole: "software_vendor", capability: "fixed_route", operatingMode: "verified" }),
      claim({ subjectEntityId: "deppon", subjectName: "德邦", capability: "linehaul_fleet", operatingMode: "self_operated" })
    ] }, LOGISTICS_SELF_OPERATED_POLICY);
    expect(result.strict.map(({ canonicalName }) => canonicalName)).not.toContain("易仓科技");
    expect(result.rejected).toContainEqual(expect.objectContaining({ canonicalName: "易仓科技", reason: "software_only" }));
  });

  it("qualifies complete direct evidence and orders by strength instead of domain spelling", () => {
    const result = qualifyProviders({ claims: [
      ...fullChain("zulu", "Zulu Logistics", "zulu.example", "A", 98),
      ...fullChain("alpha", "Alpha Logistics", "alpha.example", "A", 75)
    ] }, LOGISTICS_SELF_OPERATED_POLICY);
    expect(result.strict.map(({ canonicalName }) => canonicalName)).toEqual(["Zulu Logistics", "Alpha Logistics"]);
    expect(result.strict.every(({ tier }) => tier === "verified_full_chain")).toBe(true);
  });

  it("keeps incomplete providers as candidates with explicit missing proof", () => {
    const result = qualifyProviders({ claims: [
      claim({ subjectEntityId: "partial", subjectName: "部分物流", capability: "fixed_route", operatingMode: "verified" })
    ] }, LOGISTICS_SELF_OPERATED_POLICY);
    expect(result.strict).toEqual([]);
    expect(result.candidates[0]?.missingProof).toContain("干线车队");
  });
});

function fullChain(entityId: string, subjectName: string, domain: string, grade: "A" | "B", relevanceScore: number): ProviderClaim[] {
  return [
    ["linehaul_fleet", "self_operated"], ["origin_warehouse", "self_operated"], ["customs_operation", "in_house_licensed"],
    ["last_mile", "self_operated"], ["fixed_route", "verified"], ["outsourcing", "no_outsourcing_verified"]
  ].flatMap(([capability, operatingMode], index) => [
    claim({ subjectEntityId: entityId, subjectName, capability, operatingMode, registrableDomain: index % 2 ? `${entityId}-independent.example` : domain, grade, relevanceScore })
  ]);
}

function claim(overrides: Partial<ProviderClaim>): ProviderClaim {
  return {
    claimId: `claim-${overrides.subjectEntityId ?? "provider"}-${overrides.capability ?? "service"}`,
    subjectName: "Example Logistics",
    subjectEntityId: "provider",
    genericRole: "service_provider",
    policyRole: "integrated_logistics",
    capability: "fixed_route",
    operatingMode: "verified",
    serviceScope: ["dedicated logistics"],
    routeScope: [],
    exactExcerpt: "Direct provider evidence.",
    passageId: "passage",
    sourceEvidenceId: `source-${overrides.capability ?? "service"}`,
    sourceAuthority: "company_owned",
    directness: "direct",
    relevanceScore: 90,
    grade: "A",
    sourceEligibility: { eligible: true },
    registrableDomain: "provider.example",
    ...overrides
  };
}

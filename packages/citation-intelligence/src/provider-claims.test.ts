import { describe, expect, it } from "vitest";
import { LOGISTICS_SELF_OPERATED_POLICY } from "./provider-policy-logistics";
import { validateProviderClaimCandidate } from "./provider-claims";
import type { ProviderEvidencePassage } from "./provider-passages";

const passage: ProviderEvidencePassage = {
  passageId: "passage-1",
  sourceEvidenceId: "source-1",
  passageOrder: 0,
  exactExcerpt: "美新物流运营自有海外仓和卡车车队，提供固定专线物流服务。",
  excerptHash: "hash",
  relevanceScore: 100,
  matchedEntityTerms: ["美新物流"],
  matchedServiceTerms: ["物流", "专线"],
  matchedControlTerms: ["运营", "自有"],
  matchedCapabilityTerms: ["海外仓", "卡车车队"],
  selectorVersion: "provider-passage-selector-v1"
};

describe("provider claim validation", () => {
  it("accepts an exact direct first-party capability claim as Grade A", () => {
    const result = validateProviderClaimCandidate({
      subjectName: "美新物流",
      genericRole: "service_provider",
      policyRole: "integrated_logistics",
      capability: "overseas_warehouse",
      operatingMode: "self_operated",
      serviceScope: ["dedicated logistics"],
      routeScope: ["US"],
      exactExcerpt: passage.exactExcerpt
    }, {
      passage,
      policy: LOGISTICS_SELF_OPERATED_POLICY,
      subjectEntityId: "provider-anl",
      canonicalSubjectName: "美新物流",
      registrableDomain: "anl-cn.com",
      sourceAuthority: "company_owned",
      sourceEligibility: true
    });
    expect(result.status).toBe("accepted");
    if (result.status === "accepted") expect(result.accepted.grade).toBe("A");
  });

  it("rejects invented excerpts and invalid capability states", () => {
    expect(validateProviderClaimCandidate({
      subjectName: "美新物流", genericRole: "service_provider", policyRole: "integrated_logistics",
      capability: "air_capacity", operatingMode: "owned", serviceScope: [], routeScope: [], exactExcerpt: "拥有自有飞机"
    }, {
      passage, policy: LOGISTICS_SELF_OPERATED_POLICY, subjectEntityId: "provider-anl", canonicalSubjectName: "美新物流",
      registrableDomain: "anl-cn.com", sourceAuthority: "company_owned", sourceEligibility: true
    })).toMatchObject({ status: "rejected", rejected: { reason: "excerpt_not_bound" } });
  });
});

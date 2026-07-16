import { describe, expect, it } from "vitest";
import { createProviderDiscoveryQueryPlan, createProviderVerificationQueryPlan } from "./provider-query-plan";
import type { CanonicalBuyerQuestion, CustomerIdentityExclusion, PublicSearchSurface } from "./types";

describe("provider query plans", () => {
  it("creates six discovery queries and at most twelve verification queries", () => {
    const discovery = createProviderDiscoveryQueryPlan(input());
    expect(discovery.kind).toBe("provider_discovery");
    expect(discovery.queries).toHaveLength(6);
    expect(discovery.queries.every(({ resultDepth }) => resultDepth === 5)).toBe(true);
    expect(discovery.budget.maxResults).toBe(5);

    const verification = createProviderVerificationQueryPlan({
      ...input(),
      parentPlanId: discovery.id,
      candidates: Array.from({ length: 20 }, (_, index) => ({ entityId: `entity-${index}`, canonicalName: `Provider ${index}`, rank: index }))
    });
    expect(verification.kind).toBe("candidate_verification");
    expect(verification.queries).toHaveLength(12);
    expect(verification.parentPlanId).toBe(discovery.id);
    expect(verification.candidateSetHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic and changes identity with the candidate set", () => {
    const discovery = createProviderDiscoveryQueryPlan(input());
    expect(createProviderDiscoveryQueryPlan(input())).toEqual(discovery);
    const left = createProviderVerificationQueryPlan({ ...input(), parentPlanId: discovery.id, candidates: [{ entityId: "a", canonicalName: "Alpha", rank: 0 }] });
    const right = createProviderVerificationQueryPlan({ ...input(), parentPlanId: discovery.id, candidates: [{ entityId: "b", canonicalName: "Beta", rank: 0 }] });
    expect(left.id).not.toBe(right.id);
  });

  it("keeps an evidence-coverage snapshot valid when discovery finds no candidates", () => {
    const discovery = createProviderDiscoveryQueryPlan(input());
    const verification = createProviderVerificationQueryPlan({ ...input(), parentPlanId: discovery.id, candidates: [] });
    expect(verification.candidates).toEqual([]);
    expect(verification.queries).toHaveLength(1);
    expect(verification.queries[0]?.derivationRuleId).toBe("candidate-verification-empty-set-v1");
  });

  it("rejects customer identity in either stage", () => {
    const excludedIdentities: CustomerIdentityExclusion[] = [{ kind: "customer_brand", value: "Private Brand" }];
    expect(() => createProviderDiscoveryQueryPlan({
      ...input(),
      question: { ...question(), normalizedText: "Private Brand 自营专线物流供应商" },
      excludedIdentities
    })).toThrow(/customer identity/i);
    const discovery = createProviderDiscoveryQueryPlan(input());
    expect(() => createProviderVerificationQueryPlan({
      ...input(), parentPlanId: discovery.id,
      candidates: [{ entityId: "private", canonicalName: "Private Brand", rank: 0 }], excludedIdentities
    })).toThrow(/customer identity/i);
  });
});

function input() {
  return {
    question: question(),
    surface: surface(),
    policy: {
      policyId: "logistics_self_operated_v1",
      policyVersion: "1",
      queryFacets: [
        { id: "canonical", terms: { zh: ["自营专线物流"], en: ["self-operated logistics"] } },
        { id: "providers", terms: { zh: ["物流公司", "供应商"], en: ["logistics providers"] } },
        { id: "transport", terms: { zh: ["自有车队", "包机"], en: ["owned fleet", "charter"] } },
        { id: "warehouse", terms: { zh: ["自营仓"], en: ["operated warehouse"] } },
        { id: "delivery", terms: { zh: ["清关", "末端"], en: ["customs", "last mile"] } },
        { id: "qualification", terms: { zh: ["固定线路", "资质"], en: ["fixed route", "qualification"] } }
      ]
    },
    excludedIdentities: [] as CustomerIdentityExclusion[]
  };
}

function question(): CanonicalBuyerQuestion {
  return {
    id: "question-1", questionSetVersion: "questions-v1", locale: "zh-CN", region: "CN", kind: "supplier_discovery",
    exactText: "哪些供应商能够提供自营专线物流？", normalizedText: "哪些供应商能够提供自营专线物流?",
    derivation: { ruleId: "locked-question-v1", evidenceSourceIds: [], subject: "自营专线物流", broadened: false }
  };
}

function surface(): PublicSearchSurface {
  return {
    surfaceId: "test-search", providerId: "test", productId: "search", surfaceKind: "documented_api",
    contractVersion: "v1", surfaceVersion: "v1", adapterVersion: "v1", locale: "zh-CN", region: "CN"
  };
}

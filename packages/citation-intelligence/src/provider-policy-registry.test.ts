import { describe, expect, it } from "vitest";
import {
  GENERIC_PROVIDER_POLICY,
  LOGISTICS_SELF_OPERATED_POLICY,
  selectProviderQualificationPolicy
} from "./index";

describe("provider qualification policy registry", () => {
  it("selects the reviewed logistics policy deterministically", () => {
    expect(selectProviderQualificationPolicy({
      question: "哪些供应商能够提供自营专线物流？",
      locale: "zh-CN",
      websiteCategories: ["跨境物流"]
    }).policyId).toBe("logistics_self_operated_v1");

    expect(selectProviderQualificationPolicy({
      question: "Which providers operate dedicated logistics lines?",
      locale: "en",
      websiteCategories: ["cross-border logistics"]
    }).policyId).toBe("logistics_self_operated_v1");
  });

  it("falls back to generic provider discovery", () => {
    expect(selectProviderQualificationPolicy({
      question: "哪些软件供应商支持多语言知识库？",
      locale: "zh-CN",
      websiteCategories: ["enterprise software"]
    })).toBe(GENERIC_PROVIDER_POLICY);
  });

  it("does not equate a dedicated charter with an owned aircraft", () => {
    const air = LOGISTICS_SELF_OPERATED_POLICY.capabilityDimensions.find(({ id }) => id === "air_capacity");
    expect(air?.states).toContain("dedicated_charter");
    expect(air?.states).toContain("owned");
    expect(air?.states.indexOf("owned")).not.toBe(air?.states.indexOf("dedicated_charter"));
  });

  it("exposes all reviewed logistics capability dimensions", () => {
    expect(LOGISTICS_SELF_OPERATED_POLICY.capabilityDimensions.map(({ id }) => id)).toEqual([
      "linehaul_fleet",
      "air_capacity",
      "origin_warehouse",
      "overseas_warehouse",
      "customs_operation",
      "last_mile",
      "fixed_route",
      "outsourcing"
    ]);
  });
});

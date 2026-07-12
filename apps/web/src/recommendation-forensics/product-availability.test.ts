import { describe, expect, it } from "vitest";
import type { AnswerEngineAdapter, CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import { AnswerEngineRegistry } from "@open-geo-console/answer-engine-observer";
import { evaluateRecommendationProductAvailability } from "./product-availability";

const certifiedAt = "2030-01-01T00:00:00.000Z";

describe("recommendation-forensics product availability", () => {
  it("fails closed without an explicit lane flag, persisted authority, adapters, and builder", () => {
    expect(evaluateRecommendationProductAvailability({ environment: {}, registry: new AnswerEngineRegistry(), authority: null, authorityPersisted: false, builderAvailable: false })).toMatchObject({ ready: false });
  });

  it("allows protected staging operator execution only when the installed runtime is complete", () => {
    const { registry, authority } = completeRuntime();
    expect(evaluateRecommendationProductAvailability({
      environment: { OGC_DEPLOYMENT_PROFILE: "staging", OGC_RECOMMENDATION_OPERATOR_ENABLED: "true" },
      registry, authority, authorityPersisted: true, builderAvailable: true
    })).toEqual({ ready: true, lane: "operator", code: "ready" });
  });

  it("requires live commerce and an explicit public flag in production", () => {
    const { registry, authority } = completeRuntime();
    const base = { OGC_DEPLOYMENT_PROFILE: "production", OGC_RECOMMENDATION_PUBLIC_ENABLED: "true" };
    expect(evaluateRecommendationProductAvailability({ environment: base, registry, authority, authorityPersisted: true, builderAvailable: true }).ready).toBe(false);
    expect(evaluateRecommendationProductAvailability({ environment: { ...base, COMMERCE_MODE: "live" }, registry, authority, authorityPersisted: true, builderAvailable: true })).toEqual({ ready: true, lane: "public", code: "ready" });
  });

  it("rejects authority drift and requires two distinct provider ids", () => {
    const { registry, authority } = completeRuntime();
    const env = { OGC_DEPLOYMENT_PROFILE: "production", OGC_RECOMMENDATION_PUBLIC_ENABLED: "true", COMMERCE_MODE: "live" };
    expect(evaluateRecommendationProductAvailability({ environment: env, registry, authority: { ...authority, certifications: authority.certifications.slice(0, 1) }, authorityPersisted: true, builderAvailable: true })).toMatchObject({ ready: false, code: "authority_mismatch" });
    const evidenceDrift = structuredClone(authority);
    evidenceDrift.certifications[0]!.evidence.evidenceReference = "different/evidence";
    expect(evaluateRecommendationProductAvailability({ environment: env, registry, authority: evidenceDrift, authorityPersisted: true, builderAvailable: true })).toMatchObject({ ready: false, code: "authority_mismatch" });
  });
});

function completeRuntime(): { registry: AnswerEngineRegistry; authority: CertificationAuthoritySnapshot } {
  const registry = new AnswerEngineRegistry();
  for (const providerId of ["provider-a", "provider-b"]) {
    const adapter = { surface: { providerId, productId: "web", modelId: "model", collectionSurface: "developer_api", locale: "en", region: "global", certificationState: "certified" }, observe: async () => { throw new Error("unused"); } } satisfies AnswerEngineAdapter;
    registry.register(adapter, { certifiedAt, environment: "protected_staging", evidenceReference: `evidence/${providerId}` });
  }
  return { registry, authority: registry.createCertificationAuthoritySnapshot({ authorityVersion: "authority-v1", capturedAt: certifiedAt }) };
}

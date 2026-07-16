import { describe, expect, it } from "vitest";
import type { CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import {
  createProductionAnswerEngineRegistry,
  productionRecommendationReportBuilderAvailable,
  ProductionRecommendationReportBuilder
} from "./production-runtime";

describe("production recommendation runtime certification boundary", () => {
  it("keeps the registry empty without the explicit runtime flag or authority", () => {
    expect(productionRecommendationReportBuilderAvailable).toBe(true);
    expect(new ProductionRecommendationReportBuilder()).toBeInstanceOf(ProductionRecommendationReportBuilder);
    expect(createProductionAnswerEngineRegistry({}, authority()).list()).toEqual([]);
    expect(createProductionAnswerEngineRegistry(fullEnvironment()).list()).toEqual([]);
  });

  it("registers zero, one, or two adapters only from exact credentials and surface config", () => {
    const configured = authority();
    const complete = fullEnvironment();
    expect(createProductionAnswerEngineRegistry(complete, configured).listCertified()).toHaveLength(2);
    expect(createProductionAnswerEngineRegistry({ ...complete, OGC_ANSWER_OPENAI_API_KEY: "" }, configured).listCertified()).toHaveLength(1);
    expect(createProductionAnswerEngineRegistry({
      ...complete, OGC_ANSWER_OPENAI_API_KEY: "", OGC_ANSWER_PERPLEXITY_API_KEY: ""
    }, configured).listCertified()).toHaveLength(0);
  });

  it("rejects model, locale, and region drift instead of registering against stale evidence", () => {
    const configured = authority();
    const environment = fullEnvironment();
    for (const drift of [
      { OGC_ANSWER_OPENAI_MODEL: "gpt-floating" },
      { OGC_ANSWER_OPENAI_LOCALE: "zh" },
      { OGC_ANSWER_OPENAI_REGION: "CN" }
    ]) {
      expect(createProductionAnswerEngineRegistry({ ...environment, ...drift }, configured).listCertified()).toHaveLength(1);
    }
  });
});

function fullEnvironment(): NodeJS.ProcessEnv {
  return {
    OGC_RECOMMENDATION_RUNTIME_ENABLED: "true",
    OGC_ANSWER_OPENAI_API_KEY: "openai-test-secret",
    OGC_ANSWER_OPENAI_MODEL: "gpt-5.4-2026-03-05",
    OGC_ANSWER_OPENAI_LOCALE: "en",
    OGC_ANSWER_OPENAI_REGION: "global",
    OGC_ANSWER_PERPLEXITY_API_KEY: "perplexity-test-secret",
    OGC_ANSWER_PERPLEXITY_MODEL: "sonar-pro",
    OGC_ANSWER_PERPLEXITY_LOCALE: "en",
    OGC_ANSWER_PERPLEXITY_REGION: "global"
  };
}

function authority(): CertificationAuthoritySnapshot {
  const capturedAt = "2030-01-02T00:00:00.000Z";
  return {
    authorityVersion: "authority-v1", capturedAt,
    certifications: [
      certification("openai", "responses-web-search", "gpt-5.4-2026-03-05", capturedAt),
      certification("perplexity", "sonar-api", "sonar-pro", capturedAt)
    ]
  };
}

function certification(providerId: string, productId: string, modelId: string, certifiedAt: string) {
  return {
    surface: { providerId, productId, modelId, collectionSurface: "developer_api" as const, locale: "en", region: "global", certificationState: "certified" as const },
    evidence: { certifiedAt, environment: "protected_staging" as const, evidenceReference: `certification/${providerId}.json` }
  };
}

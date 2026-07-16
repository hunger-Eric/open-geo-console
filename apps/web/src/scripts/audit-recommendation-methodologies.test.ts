import { describe, expect, it } from "vitest";
import { summarizeRecommendationMethodologyAudit } from "./audit-recommendation-methodologies";

describe("recommendation methodology audit", () => {
  it("lists non-terminal V1 work without customer identity and passes consistent pairs", () => {
    const result = summarizeRecommendationMethodologyAudit([{ kind: "order", id: "order-1", state: "processing", methodology: "answer_engine_recommendation_forensics_v1", reportVersion: 1, pairedMethodology: "answer_engine_recommendation_forensics_v1", pairedReportVersion: 1 }]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("order=order-1");
    expect(result.output).toContain("retained OpenAI/Perplexity adapters and credentials");
    expect(result.output).toContain("drain_decision=continue_with_retained_v1_credentials");
  });

  it("fails on missing or disagreeing methodology", () => {
    expect(summarizeRecommendationMethodologyAudit([{ kind: "job", id: "job-1", state: "queued", methodology: null, reportVersion: null }]).exitCode).toBe(1);
    expect(summarizeRecommendationMethodologyAudit([{ kind: "order", id: "order-1", state: "queued", methodology: "answer_engine_recommendation_forensics_v1", reportVersion: 1, pairedMethodology: "public_search_source_forensics_v1", pairedReportVersion: 2 }]).exitCode).toBe(1);
  });
});

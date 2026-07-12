import { describe, expect, it } from "vitest";
import { calculateRecommendationForensicCost } from "./recommendation-forensic-cost";
import { verifyRecommendationForensicV2Claims } from "./recommendation-forensic-v2-claims";
import { parseRecommendationForensicReport } from "./recommendation-forensic-dispatch";

describe("recommendation forensic V2 boundaries", () => {
  it("reconciles incremental cost, refund, shared allocation, and contribution margin", () => {
    expect(calculateRecommendationForensicCost({
      searchCostMicros: 10, retrievalCostMicros: 20, synthesisCostMicros: 30,
      artifactCostMicros: 40, deliveryCostMicros: 50, allocatedSharedCostMicros: 25,
      avoidedCostMicros: 75, priceMicros: 1_000, refundMicros: 200
    })).toMatchObject({ actualIncrementalCostMicros: 150, netRevenueMicros: 800, contributionMarginMicros: 625 });
  });

  it("requires known structured evidence and rejects model-attribution claims", () => {
    expect(() => verifyRecommendationForensicV2Claims([
      { text: "公开来源显示该企业具备海运能力。", evidenceIds: ["evidence-1"], websiteFindingIds: [] }
    ], new Set(["evidence-1"]), new Set())).not.toThrow();
    expect(() => verifyRecommendationForensicV2Claims([
      { text: "ChatGPT recommended this company.", evidenceIds: ["evidence-1"], websiteFindingIds: [] }
    ], new Set(["evidence-1"]), new Set())).toThrow(/Prohibited public-search attribution claim/);
    expect(() => verifyRecommendationForensicV2Claims([
      { text: "Observed public evidence.", evidenceIds: ["missing"], websiteFindingIds: [] }
    ], new Set(["evidence-1"]), new Set())).toThrow(/unknown evidence/);
  });

  it("rejects cross-labeled and unknown report contracts before parsing payload details", () => {
    expect(() => parseRecommendationForensicReport({ version: 2, methodology: "answer_engine_observation_v1" })).toThrow(/Unknown or inconsistent/);
    expect(() => parseRecommendationForensicReport({ version: 3, methodology: "public_search_source_forensics_v1" })).toThrow(/Unknown or inconsistent/);
    expect(() => parseRecommendationForensicReport({ version: 1, methodology: "public_search_source_forensics_v1" })).toThrow(/inconsistent/);
  });
});

import { describe, expect, it } from "vitest";
import {
  createProductionAnswerEngineRegistry,
  createProductionRecommendationDependencies,
  productionRecommendationReportBuilderAvailable,
  ProductionRecommendationReportBuilder
} from "./production-runtime";

describe("production recommendation runtime phase-4 boundary", () => {
  it("installs the production builder without installing adapters or opening execution", () => {
    expect(productionRecommendationReportBuilderAvailable).toBe(true);
    expect(new ProductionRecommendationReportBuilder()).toBeInstanceOf(ProductionRecommendationReportBuilder);
    expect(createProductionAnswerEngineRegistry().list()).toEqual([]);
    expect(createProductionRecommendationDependencies()).toBeNull();
  });
});

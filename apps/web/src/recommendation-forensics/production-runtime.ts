import { AnswerEngineRegistry } from "@open-geo-console/answer-engine-observer";
import type { RecommendationForensicsDependencies } from "@/worker/recommendation-forensics";
export { ProductionRecommendationReportBuilder } from "./production-report-builder";

// Live adapters and the customer artifact builder are installed only by later,
// separately certified rollout phases. Keeping both absent makes every new
// public checkout and operator execution fail closed today.
export function createProductionAnswerEngineRegistry(): AnswerEngineRegistry {
  return new AnswerEngineRegistry();
}

export const productionRecommendationReportBuilderAvailable = true;

export function createProductionRecommendationDependencies(): RecommendationForensicsDependencies | null {
  return null;
}

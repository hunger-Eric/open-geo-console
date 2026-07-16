import { parseRecommendationForensicReportV1, type RecommendationForensicReportParseOptions, type RecommendationForensicReportV1 } from "./recommendation-forensic";
import { parseRecommendationForensicReportV2, PUBLIC_SEARCH_SOURCE_FORENSICS_METHODOLOGY, type RecommendationForensicReportV2 } from "./recommendation-forensic-v2";

export type RecommendationForensicReport = RecommendationForensicReportV1 | RecommendationForensicReportV2;

export function parseRecommendationForensicReport(value: unknown, options?: RecommendationForensicReportParseOptions): RecommendationForensicReport {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Recommendation report must be an object.");
  const report = value as Record<string, unknown>;
  if (report.version === 1) {
    if ("methodology" in report && report.methodology !== "answer_engine_observation_v1") throw new TypeError("V1 report methodology is inconsistent.");
    if (!options) throw new TypeError("V1 report parsing requires certification authorities.");
    return parseRecommendationForensicReportV1(value, options);
  }
  if (report.version === 2 && report.methodology === PUBLIC_SEARCH_SOURCE_FORENSICS_METHODOLOGY) return parseRecommendationForensicReportV2(value);
  throw new TypeError("Unknown or inconsistent recommendation report version/methodology.");
}

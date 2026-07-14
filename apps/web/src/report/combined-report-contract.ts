export type CombinedReportContract = "combined_geo_report_v1" | "combined_geo_report_v2";

export function resolveCombinedReportContract(environment?: { OGC_COMBINED_REPORT_CONTRACT?: string }): CombinedReportContract {
  const value = (environment?.OGC_COMBINED_REPORT_CONTRACT ?? process.env["OGC_COMBINED_REPORT_CONTRACT"])?.trim() || "combined_geo_report_v1";
  if (value !== "combined_geo_report_v1" && value !== "combined_geo_report_v2") throw new Error("OGC_COMBINED_REPORT_CONTRACT must select a reviewed combined report contract.");
  return value;
}

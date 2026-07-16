import {
  parseReportV4CustomerProseProfile,
  type ReportV4CustomerProseProfile
} from "@open-geo-console/ai-report-engine";
import englishProfilePayload from "../../../../config/report-profiles/business-operator-en.json";
import chineseProfilePayload from "../../../../config/report-profiles/business-operator-zh.json";

export type ReportV4PaidLocale = "en" | "zh";

export interface ReportV4ReportRuntimeConfig {
  readonly paidLocale: ReportV4PaidLocale;
  readonly reportProfile: ReportV4CustomerProseProfile;
}

const APPROVED_REPORT_RUNTIMES: Readonly<Record<ReportV4PaidLocale, ReportV4ReportRuntimeConfig>> =
  Object.freeze({
    en: Object.freeze({
      paidLocale: "en",
      reportProfile: parseReportV4CustomerProseProfile(englishProfilePayload)
    }),
    zh: Object.freeze({
      paidLocale: "zh",
      reportProfile: parseReportV4CustomerProseProfile(chineseProfilePayload)
    })
  });

export function loadReportV4ReportRuntimeConfig(paidLocale: unknown): ReportV4ReportRuntimeConfig {
  if (paidLocale !== "en" && paidLocale !== "zh") {
    throw new Error(`Unsupported Report V4 paid locale ${JSON.stringify(paidLocale)}; expected exact en or zh with no fallback.`);
  }
  return APPROVED_REPORT_RUNTIMES[paidLocale];
}

import type { ReportLocale } from "@/db/schema";

export function parseReportLocale(value: unknown): ReportLocale | null {
  return value === "en" || value === "zh" ? value : null;
}

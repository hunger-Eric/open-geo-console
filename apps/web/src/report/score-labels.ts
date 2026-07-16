import type { Dictionary } from "@/i18n";
import { interpolate } from "@/i18n";

export function technicalScoreLabel(
  dictionary: Dictionary,
  tier: "free" | "deep",
  validPages: number
): string {
  return tier === "free"
    ? dictionary.aiReport.homepageScore
    : interpolate(dictionary.aiReport.siteTechnicalScore, { count: validPages });
}

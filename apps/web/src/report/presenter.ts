import type { FindingSeverity, GeoAuditReport, GeoFinding } from "@open-geo-console/geo-auditor";
import type { Dictionary, Locale } from "@/i18n";
import { formatNumber, interpolate } from "@/i18n";
import { composeReportModel } from "./report-registry";

export interface LocalizedFinding extends GeoFinding {
  localizedTitle: string;
  localizedDescription: string;
  localizedRecommendation: string;
  copySource: "messageKey" | "legacy";
}

export interface ReportPresentation {
  scoreMeaning: string;
  criticalCount: number;
  warningCount: number;
  availableAssets: number;
  localizedFindings: LocalizedFinding[];
  findingsBySeverity: Record<FindingSeverity, LocalizedFinding[]>;
  priorityFindings: LocalizedFinding[];
}

export function buildReportPresentation(
  report: GeoAuditReport,
  dictionary: Dictionary,
  locale: Locale
): ReportPresentation {
  void locale;
  const composed = composeReportModel(report);
  const localizedFindings = report.findings.map((finding) => localizeFinding(finding, dictionary));
  const findingsBySeverity = {
    critical: localizedFindings.filter((finding) => finding.severity === "critical"),
    warning: localizedFindings.filter((finding) => finding.severity === "warning"),
    info: localizedFindings.filter((finding) => finding.severity === "info")
  };

  return {
    scoreMeaning: getScoreMeaning(report.score, dictionary),
    criticalCount: composed.severityCounts.critical,
    warningCount: composed.severityCounts.warning,
    availableAssets: Object.values(report.machineReadableAssets).filter((asset) => asset.present).length,
    localizedFindings,
    findingsBySeverity,
    priorityFindings: [...findingsBySeverity.critical, ...findingsBySeverity.warning].slice(0, 5)
  };
}

export function localizeFinding(finding: GeoFinding, dictionary: Dictionary): LocalizedFinding {
  if (finding.messageKey && dictionary.findings[finding.messageKey]) {
    const message = dictionary.findings[finding.messageKey];
    return {
      ...finding,
      localizedTitle: interpolate(message.title, finding.params),
      localizedDescription: interpolate(message.description, finding.params),
      localizedRecommendation: interpolate(message.recommendation, finding.params),
      copySource: "messageKey"
    };
  }

  return {
    ...finding,
    localizedTitle: finding.title,
    localizedDescription: finding.description,
    localizedRecommendation: finding.recommendation,
    copySource: "legacy"
  };
}

export function localizedAssetSummary(
  assetKey: keyof GeoAuditReport["machineReadableAssets"],
  present: boolean,
  dictionary: Dictionary
): string {
  const asset = dictionary.report.assetLabels[assetKey];
  return interpolate(present ? dictionary.report.assetPresent : dictionary.report.assetMissing, {
    asset
  });
}

export function formatReportNumber(locale: Locale, value: number): string {
  return formatNumber(locale, value);
}

function getScoreMeaning(score: number, dictionary: Dictionary): string {
  if (score >= 80) {
    return dictionary.report.scoreGood;
  }
  if (score >= 55) {
    return dictionary.report.scoreWatch;
  }
  return dictionary.report.scoreRisk;
}

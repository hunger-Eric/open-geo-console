import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { getDictionary, type Locale } from "@/i18n";
import { localizeFinding, localizedAssetSummary } from "./presenter";

export function localizeTechnicalReportForArtifact(
  report: GeoAuditReport,
  locale: string
): GeoAuditReport {
  const normalizedLocale: Locale = locale.toLowerCase().startsWith("zh") ? "zh" : "en";
  const dictionary = getDictionary(normalizedLocale);
  const findings = report.findings.map((finding) => {
    const localized = localizeFinding(finding, dictionary);
    return {
      ...finding,
      title: localized.localizedTitle,
      description: localized.localizedDescription,
      recommendation: localized.localizedRecommendation
    };
  });
  const localizeAsset = (key: keyof GeoAuditReport["machineReadableAssets"]) => {
    const asset = report.machineReadableAssets[key];
    return {
      ...asset,
      summary: localizedAssetSummary(key, asset.present, dictionary)
    };
  };
  const machineReadableAssets: GeoAuditReport["machineReadableAssets"] = {
    robotsTxt: localizeAsset("robotsTxt"),
    sitemapXml: localizeAsset("sitemapXml"),
    llmsTxt: localizeAsset("llmsTxt")
  };

  return {
    ...report,
    findings,
    recommendations: [...new Set(findings.map(({ recommendation }) => recommendation))],
    machineReadableAssets
  };
}

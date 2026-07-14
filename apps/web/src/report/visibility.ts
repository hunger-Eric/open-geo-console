import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import { projectHomepageReport, type GeoAuditReport } from "@open-geo-console/geo-auditor";

export interface VisibleReportBundle {
  tier: "free" | "deep";
  canAccessHtmlArtifact: boolean;
  technicalReport: GeoAuditReport;
  aiReport: AiWebsiteReportV1 | null;
}

export function buildVisibleReportBundle({
  publicTechnicalReport,
  freeAiReport,
  deepAiReport,
  deepTechnicalReport,
  hasDeepAccess
}: {
  publicTechnicalReport: GeoAuditReport;
  freeAiReport: AiWebsiteReportV1 | null;
  deepAiReport: AiWebsiteReportV1 | null;
  deepTechnicalReport: GeoAuditReport | null;
  hasDeepAccess: boolean;
}): VisibleReportBundle {
  if (hasDeepAccess && deepAiReport) {
    return {
      tier: "deep",
      canAccessHtmlArtifact: true,
      technicalReport: deepTechnicalReport ?? publicTechnicalReport,
      aiReport: deepAiReport
    };
  }

  return {
    tier: "free",
    canAccessHtmlArtifact: false,
    technicalReport: projectHomepageReport(publicTechnicalReport),
    aiReport: freeAiReport ? projectFreeAiReport(freeAiReport) : null
  };
}

export function projectFreeAiReport(report: AiWebsiteReportV1): AiWebsiteReportV1 {
  const homepageUrl = normalizeUrl(report.targetUrl);
  const homepageFindings = report.findings
    .map((finding) => ({
      ...finding,
      evidence: finding.evidence.filter((citation) => normalizeUrl(citation.url) === homepageUrl)
    }))
    .filter((finding) => finding.evidence.length > 0)
    .slice(0, 1);

  return {
    ...report,
    tier: "free",
    organizationProfile: {
      ...report.organizationProfile,
      evidence: report.organizationProfile.evidence.filter(
        (citation) => normalizeUrl(citation.url) === homepageUrl
      )
    },
    executiveSummary: {
      overview: report.executiveSummary.overview,
      strengths: [],
      keyRisks: [],
      topPriorities: []
    },
    dimensionScores: [],
    pageTypeAnalyses: [],
    findings: homepageFindings,
    roadmap: { immediate: [], nextPhase: [], ongoing: [] },
    coverage: {
      ...report.coverage,
      plannedPages: Math.min(1, report.coverage.plannedPages),
      analyzedPages: Math.min(1, report.coverage.analyzedPages),
      pageTypesCovered: report.coverage.analyzedPages > 0 ? ["home"] : [],
      samplingMethod: "Homepage-only preview. Detected URLs were not fetched or analyzed."
    }
  };
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

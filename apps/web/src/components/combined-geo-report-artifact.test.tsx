import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CombinedPrivateReportArtifactModel } from "@/report/artifact-model";
import { CombinedGeoReportArtifact } from "./combined-geo-report-artifact";

describe("CombinedGeoReportArtifact", () => {
  it("renders in the Worker Node runtime without relying on a global React", () => {
    const model = {
      productContract: "combined_geo_report_v1",
      reportId: "report",
      locale: "en",
      artifactRevisionId: "artifact",
      evidenceAssets: [],
      combinedReport: {
        artifactContract: "combined_geo_report_v1",
        artifactRevision: 1,
        targetUrl: "https://example.com/",
        evidenceCutoffAt: "2026-07-14T00:00:00.000Z",
        technicalFoundation: {
          technicalReport: { score: 80, findings: [], pages: [], machineReadableAssets: {} },
          aiReport: {
            organizationProfile: { organizationName: "Example" },
            executiveSummary: { overview: "Overview" },
            dimensionScores: [],
            findings: [],
            pageTypeAnalyses: [],
            coverage: { limitations: [] },
            roadmap: { immediate: [], nextPhase: [], ongoing: [] },
          },
        },
        businessQuestionSet: { questions: [] },
        publicSourceForensics: {
          questions: { questions: [] },
          fanouts: [],
          sourceGraph: { evidence: [] },
          snapshotRefs: [],
          coverage: { status: "complete", completedQueryCount: 0, expectedQueryCount: 0 },
          limitations: [],
        },
        vendorTaskPackage: { tasks: [] },
        methodology: {
          technicalCoverage: "full",
          publicSearchSurface: "test",
          evidenceFreshness: "fresh",
          limitations: [],
        },
      },
    } as unknown as CombinedPrivateReportArtifactModel;

    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));
    expect(html).toContain("data-artifact-revision=\"artifact\"");
    expect(html).toContain("combined-geo-artifact");
  });
});

import { describe, expect, it } from "vitest";
import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { buildVisibleReportBundle } from "./visibility";

describe("report visibility projection", () => {
  it("projects public legacy data to the homepage and one AI finding", () => {
    const bundle = buildVisibleReportBundle({
      publicTechnicalReport: technicalReport(),
      freeAiReport: aiReport("free", 3),
      deepAiReport: null,
      deepTechnicalReport: null,
      hasDeepAccess: false
    });

    expect(bundle.tier).toBe("free");
    expect(bundle.canPrint).toBe(false);
    expect(bundle.technicalReport.pages.map(({ url }) => url)).toEqual(["https://example.com/"]);
    expect(bundle.aiReport?.findings).toHaveLength(1);
    expect(bundle.aiReport?.dimensionScores).toEqual([]);
    expect(bundle.aiReport?.pageTypeAnalyses).toEqual([]);
  });

  it("uses the private deep technical and AI payload only with access", () => {
    const deepTechnical = { ...technicalReport(), score: 91 };
    const bundle = buildVisibleReportBundle({
      publicTechnicalReport: technicalReport(),
      freeAiReport: aiReport("free", 1),
      deepAiReport: aiReport("deep", 3),
      deepTechnicalReport: deepTechnical,
      hasDeepAccess: true
    });

    expect(bundle.tier).toBe("deep");
    expect(bundle.canPrint).toBe(true);
    expect(bundle.technicalReport).toBe(deepTechnical);
    expect(bundle.aiReport?.findings).toHaveLength(3);
  });
});

function technicalReport(): GeoAuditReport {
  const page = (url: string) => ({
    url,
    status: 200,
    title: "Example page title",
    metaDescription: "Description",
    h1: ["Example"],
    h2: [],
    canonical: url,
    hasOpenGraph: true,
    hasJsonLd: true,
    readableTextLength: 1000,
    internalLinks: 2
  });
  return {
    url: "https://example.com/",
    scannedAt: "2026-07-10T00:00:00.000Z",
    score: 70,
    findings: [],
    recommendations: [],
    pages: [page("https://example.com/"), page("https://example.com/about")],
    machineReadableAssets: {
      robotsTxt: { url: "https://example.com/robots.txt", present: true, status: 200, summary: "Available" },
      sitemapXml: { url: "https://example.com/sitemap.xml", present: true, status: 200, summary: "Available" },
      llmsTxt: { url: "https://example.com/llms.txt", present: true, status: 200, summary: "Available" }
    }
  };
}

function aiReport(tier: "free" | "deep", findingCount: number): AiWebsiteReportV1 {
  const evidence = [{ url: "https://example.com/", quote: "Example homepage evidence" }];
  return {
    version: 1,
    tier,
    targetUrl: "https://example.com/",
    organizationProfile: {
      organizationName: "Example",
      brandNames: ["Example"],
      summary: "Example homepage evidence",
      businessModel: null,
      productsAndServices: [],
      targetAudiences: [],
      marketsAndRegions: [],
      legalEntity: null,
      identityConsistency: "Consistent",
      ownershipVerification: "not-performed",
      confidence: "high",
      evidence
    },
    executiveSummary: { overview: "Overview", strengths: ["One"], keyRisks: ["Two"], topPriorities: ["Three"] },
    dimensionScores: [{ dimension: "organizationClarity", score: 70, explanation: "Explanation", confidence: "high", evidence }],
    pageTypeAnalyses: [{ pageType: "home", sampledUrls: ["https://example.com/"], strengths: [], commonIssues: [], recommendations: [], evidence }],
    findings: Array.from({ length: findingCount }, (_, index) => ({
      id: `finding-${index}`,
      title: `Finding ${index}`,
      severity: "warning" as const,
      impact: "Impact",
      evidence,
      recommendation: "Recommendation",
      confidence: "high" as const
    })),
    roadmap: { immediate: [], nextPhase: [], ongoing: [] },
    coverage: { discoveredPages: 2, plannedPages: tier === "free" ? 1 : 2, analyzedPages: tier === "free" ? 1 : 2, failedPages: 0, samplingMethod: "Method", pageTypesCovered: ["home"], limitations: [] },
    provenance: { reportVersion: 1, modelId: "mock", promptVersion: "test", locale: "en", generatedAt: "2026-07-10T00:00:00.000Z", contentHash: "hash" }
  };
}

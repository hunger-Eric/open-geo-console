import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PrivateReportArtifactModel } from "@/report/artifact-model";
import { ReportArtifact } from "./report-artifact";

const model = {
  reportId: "report-1",
  locale: "en",
  technicalReport: {
    url: "https://example.com/",
    score: 72,
    pages: [{ url: "https://example.com/", status: 200, h1: ["Example"], hasJsonLd: true }]
  },
  aiReport: {
    organizationProfile: { organizationName: "Example Co", summary: "A clear organization summary." },
    executiveSummary: { overview: "Executive overview", strengths: ["Clear"], keyRisks: ["Risk"], topPriorities: ["Priority"] },
    dimensionScores: [{ dimension: "organizationClarity", score: 80, explanation: "Clear identity" }],
    findings: [{
      id: "finding-1",
      title: "Clarify the primary offer",
      severity: "critical",
      impact: "AI systems cannot resolve the offer.",
      recommendation: "Add a concise definition.",
      evidence: [{ url: "https://example.com/", quote: "Verified quote", pageElement: "main" }]
    }],
    roadmap: {
      immediate: [{ title: "Fix", rationale: "Now", actions: ["Edit copy"] }],
      nextPhase: [],
      ongoing: []
    },
    coverage: { analyzedPages: 1, plannedPages: 1, samplingMethod: "Homepage", limitations: [] },
    provenance: { generatedAt: "2026-07-11T00:00:00.000Z" }
  },
  evidenceAssets: [{
    id: "asset-1",
    findingId: "finding-1",
    citationIndex: 0,
    kind: "issue_crop",
    status: "ready",
    capturedAt: new Date("2026-07-11T00:00:00.000Z")
  }]
} as unknown as PrivateReportArtifactModel;

describe("canonical report artifact", () => {
  it("renders material report content and protected visual evidence", () => {
    const html = renderToStaticMarkup(<ReportArtifact model={model} />);

    expect(html).toContain("Executive overview");
    expect(html).toContain("Clarify the primary offer");
    expect(html).toContain("Verified quote");
    expect(html).toContain("Add a concise definition");
    expect(html).toContain("/api/reports/report-1/evidence/asset-1");
    expect(html).toContain("/reports/report-1/report.html");
    expect(html).toContain("/api/reports/report-1/artifacts/report.pdf");
  });

  it("keeps verified evidence visible when screenshots are unavailable", () => {
    const unavailable = {
      ...model,
      evidenceAssets: [{ ...model.evidenceAssets[0], status: "unavailable", kind: "viewport" }]
    } as unknown as PrivateReportArtifactModel;
    const html = renderToStaticMarkup(<ReportArtifact model={unavailable} />);

    expect(html).toContain("Screenshot unavailable");
    expect(html).toContain("Verified quote");
    expect(html).toContain("https://example.com/");
  });
});

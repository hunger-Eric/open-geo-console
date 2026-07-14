import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CombinedPrivateReportArtifactModel } from "@/report/artifact-model";
import { CombinedGeoReportArtifact } from "./combined-geo-report-artifact";

describe("CombinedGeoReportArtifact", () => {
  it("renders three concise grounded answers and their question-scoped source links", () => {
    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model: combinedArtifactFixture() }));
    const publicSection = html.slice(html.indexOf("data-business-question-section"), html.indexOf("</section>", html.indexOf("data-business-question-section")));

    expect(html.match(/class="business-question-answer"/g)).toHaveLength(3);
    for (let index = 1; index <= 3; index += 1) {
      expect(publicSection).toContain(`Direct grounded answer ${index}`);
      expect(publicSection).toContain(`href="https://source-${index}-a.example/fact"`);
      expect(publicSection).toContain(`href="https://source-${index}-b.example/fact"`);
    }
    expect(publicSection).not.toMatch(/SENTINEL_EXCERPT|Neutral public query|query-|snapshot-|evidence-|verifiedExcerpt|Grade [A-D]/i);
  });

  it("preserves website citations and screenshot evidence while using the Worker Node runtime", () => {
    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model: combinedArtifactFixture() }));
    expect(html).toContain("data-artifact-revision=\"artifact\"");
    expect(html).toContain("https://example.com/technical-proof");
    expect(html).toContain("Technical proof quote");
    expect(html).toContain("/api/reports/report/evidence/asset-1");
    expect(html).toContain("/reports/report/report.html");
    expect(html).not.toMatch(/\.pdf\b|>PDF</i);
  });

  it("localizes application-owned values and labels source-original evidence", () => {
    const model = combinedArtifactFixture();
    model.locale = "zh";
    const report = model.combinedReport;
    report.technicalFoundation.aiReport.dimensionScores = [{ dimension: "organizationClarity", score: 80, explanation: "组织说明清晰" }] as never;
    report.technicalFoundation.aiReport.pageTypeAnalyses = [{ pageType: "home", sampledUrls: [], strengths: [], commonIssues: [], recommendations: [], evidence: [] }] as never;
    report.technicalFoundation.aiReport.findings[0]!.severity = "critical" as never;
    report.vendorTaskPackage.tasks = [{ id: "task", vendor: "website", title: "更新内容", text: "改进页面", actions: ["编辑内容"], acceptanceCriteria: ["内容清晰"] }] as never;
    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));
    const visibleText = html.replace(/<[^>]+>/g, " ");
    expect(visibleText).toContain("组织清晰度");
    expect(visibleText).toContain("首页");
    expect(visibleText).toContain("严重");
    expect(visibleText).toContain("网站");
    expect(visibleText).toContain("来源原文");
    expect(visibleText).toContain("Technical proof quote");
    expect(visibleText).not.toMatch(/organizationClarity|core_service_discovery|>critical<|>website<|>home</);
    expect(visibleText).not.toMatch(/COMBINED GEO REPORT V1|\bRevision\b|\bTitle\b|\bCanonical\b|\bText\b|\bArtifact\b|\brevision\b|\btest\b/);
  });

  it("turns internal enum values into human-readable English labels", () => {
    const model = combinedArtifactFixture();
    const report = model.combinedReport;
    report.technicalFoundation.aiReport.dimensionScores = [{ dimension: "organizationClarity", score: 80, explanation: "Clear organization." }] as never;
    report.technicalFoundation.aiReport.pageTypeAnalyses = [{ pageType: "home", sampledUrls: [], strengths: [], commonIssues: [], recommendations: [], evidence: [] }] as never;
    report.vendorTaskPackage.tasks = [{ id: "task", vendor: "cross-functional", title: "Update", text: "Improve", actions: [], acceptanceCriteria: [] }] as never;
    const visibleText = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model })).replace(/<[^>]+>/g, " ");
    expect(visibleText).toContain("Organization clarity");
    expect(visibleText).toContain("Core service discovery");
    expect(visibleText).toContain("Cross-functional");
    expect(visibleText).not.toMatch(/organizationClarity|core_service_discovery|cross-functional/);
  });

  it("localizes the actual info severity and insufficient coverage values", () => {
    const model = combinedArtifactFixture();
    model.locale = "zh";
    model.combinedReport.technicalFoundation.aiReport.findings[0]!.severity = "info" as never;
    model.combinedReport.publicSourceForensics.coverage.status = "insufficient" as never;
    const visibleText = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model })).replace(/<[^>]+>/g, " ");
    expect(visibleText).toContain("提示");
    expect(visibleText).toContain("证据不足");
    expect(visibleText).not.toMatch(/>info<|>insufficient</);
  });

  it("renders localized deterministic findings and labels source-original page values", () => {
    const model = combinedArtifactFixture();
    model.locale = "zh";
    model.combinedReport.technicalFoundation.technicalReport.findings = [{
      id: "page.h1Structure",
      severity: "warning",
      title: "H1 结构需要调整",
      description: "预期只有一个 H1，实际发现 0 个。",
      recommendation: "每个页面使用一个描述清晰的 H1，并将 H2 用于章节结构。"
    }];
    model.combinedReport.technicalFoundation.technicalReport.pages = [{
      url: "https://example.com/",
      status: 200,
      title: "Original English Page Title",
      metaDescription: "Original source description",
      h1: ["Original English H1"],
      h2: [],
      canonical: "https://example.com/",
      hasOpenGraph: true,
      hasJsonLd: true,
      readableTextLength: 1000,
      internalLinks: 3
    }];

    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));

    expect(html).toContain("H1 结构需要调整");
    expect(html).toContain("预期只有一个 H1，实际发现 0 个。");
    expect(html).toContain("页面标题、H1 和 URL 为来源原文");
    expect(html).toContain("Original English Page Title");
    expect(html).toContain("Original English H1");
    expect(html).not.toContain("H1 structure needs attention");
  });
});

export function combinedArtifactFixture(): CombinedPrivateReportArtifactModel {
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  const publicQuestions = purposes.map((purpose, index) => ({ id: `public-question-${index + 1}`, purpose, normalizedText: `Neutral public query ${index + 1}` }));
  const evidence = publicQuestions.flatMap((question, index) => ["a", "b"].map((suffix) => ({
    evidenceId: `evidence-${index + 1}-${suffix}`,
    canonicalUrl: `https://source-${index + 1}-${suffix}.example/fact`,
    registrableDomain: `source-${index + 1}-${suffix}.example`,
    grade: "B",
    verifiedExcerpt: `SENTINEL_EXCERPT_${index + 1}_${suffix}`,
    queryVariantIds: [`query-${index + 1}-${suffix}`]
  })));
  return {
    productContract: "combined_geo_report_v1",
    reportId: "report",
    locale: "en",
    artifactRevisionId: "artifact",
    pdfStorageKey: "reports/report.pdf",
    evidenceAssets: [{ id: "asset-1", findingId: "technical-finding", citationIndex: 0, status: "ready" }],
    technicalReport: { score: 80, findings: [], pages: [], machineReadableAssets: {} },
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
          findings: [{ id: "technical-finding", title: "Technical finding", severity: "high", impact: "Impact", recommendation: "Fix it", evidence: [{ quote: "Technical proof quote", url: "https://example.com/technical-proof" }] }],
          pageTypeAnalyses: [],
          coverage: { limitations: [] },
          roadmap: { immediate: [], nextPhase: [], ongoing: [] }
        }
      },
      businessQuestionSet: { questions: purposes.map((purpose, index) => ({ purpose, privateText: `Business question ${index + 1}` })) },
      businessQuestionAnswers: {
        version: "combined-business-question-answers-v1",
        synthesis: { mode: "evidence_constrained_model", modelId: "fixture", inputHash: "hash" },
        answers: publicQuestions.map((question, index) => ({ questionId: question.id, purpose: question.purpose, answer: `Direct grounded answer ${index + 1}.`, sourceEvidenceIds: [`evidence-${index + 1}-a`, `evidence-${index + 1}-b`] }))
      },
      publicSourceForensics: {
        questions: { questions: publicQuestions },
        fanouts: publicQuestions.map((question, index) => ({ questionId: question.id, queries: [{ id: `query-${index + 1}-a` }, { id: `query-${index + 1}-b` }] })),
        sourceGraph: { evidence },
        snapshotRefs: publicQuestions.map((question, index) => ({ questionId: question.id, snapshotId: `snapshot-${index + 1}`, freshness: "fresh", observedAt: "2026-07-14T00:00:00.000Z" })),
        coverage: { status: "complete", completedQueryCount: 6, expectedQueryCount: 6 },
        limitations: []
      },
      vendorTaskPackage: { tasks: [] },
      methodology: { technicalCoverage: "full", publicSearchSurface: "test", evidenceFreshness: "fresh", limitations: [] }
    }
  } as unknown as CombinedPrivateReportArtifactModel;
}

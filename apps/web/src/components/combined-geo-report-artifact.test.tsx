import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombinedGeoReportArtifact } from "./combined-geo-report-artifact";
import { combinedArtifactFixture } from "./combined-artifact-fixtures";

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

  it("shows GEO for the stable seo vendor identifier only on geo_v1 artifacts", () => {
    const current = combinedArtifactFixture();
    current.combinedReport.presentationTerminologyPolicy = "geo_v1";
    current.combinedReport.vendorTaskPackage.tasks = [{
      id: "task",
      vendor: "seo",
      title: "Improve evidence",
      text: "Improve public evidence.",
      actions: ["Edit the page."],
      acceptanceCriteria: ["Evidence is clear."]
    }] as never;

    const currentText = renderToStaticMarkup(
      createElement(CombinedGeoReportArtifact, { model: current })
    ).replace(/<[^>]+>/g, " ");
    expect(currentText).toContain("GEO");
    expect(currentText).not.toMatch(/\bSEO\b/);

    const historical = combinedArtifactFixture();
    historical.combinedReport.vendorTaskPackage.tasks = current.combinedReport.vendorTaskPackage.tasks;
    const historicalText = renderToStaticMarkup(
      createElement(CombinedGeoReportArtifact, { model: historical })
    ).replace(/<[^>]+>/g, " ");
    expect(historicalText).toContain("SEO");
  });

  it("compacts persisted dominant-title evidence while preserving the full source title", () => {
    const model = combinedArtifactFixture();
    model.locale = "zh";
    model.combinedReport.presentationTerminologyPolicy = "geo_v1";
    const shared = "凌顺国际物流-16年老牌货代，专业提供跨境运输与物流实时追踪";
    const serviceTitle = `国际转运流程-${shared}`;
    model.combinedReport.technicalFoundation.technicalReport.findings = [{
      id: "page.dominantTitleTemplate",
      messageKey: "page.dominantTitleTemplate",
      severity: "warning",
      title: "页面标题被共享模板主导",
      description: "5 个页面共享长标题片段。",
      recommendation: "突出页面独有用途。"
    }];
    model.combinedReport.technicalFoundation.technicalReport.pages = titlePatternPages(shared);

    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));

    expect(html).toContain("国际转运流程");
    expect(html).toContain("共享模板后缀");
    expect(html).toContain("<details");
    expect(html).toContain(serviceTitle);
    expect(html).toContain("查看来源原文");
  });

  it("keeps historical full-title cells even when source pages share a title template", () => {
    const model = combinedArtifactFixture();
    const shared = "Ling Shun International Logistics provides reliable worldwide freight services";
    const serviceTitle = `Service-${shared}`;
    model.combinedReport.technicalFoundation.technicalReport.pages = titlePatternPages(shared, [
      "Home", "Service", "About", "News", "Shipping"
    ]);

    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));

    expect(html).toContain(serviceTitle);
    expect(html).not.toContain("Shared template suffix");
    expect(html).not.toContain("<details");
  });

  it("uses the analyzer's page-unique segment for a dominant title prefix", () => {
    const model = combinedArtifactFixture();
    model.combinedReport.presentationTerminologyPolicy = "geo_v1";
    const shared = "Ling Shun International Logistics worldwide freight and delivery services";
    const unique = ["Air Freight", "Sea Freight", "Warehousing"];
    model.combinedReport.technicalFoundation.technicalReport.findings = [{
      id: "page.dominantTitleTemplate",
      messageKey: "page.dominantTitleTemplate",
      severity: "warning",
      title: "Page titles are dominated by a shared template",
      description: "Three pages share a long title segment.",
      recommendation: "Lead with each page's distinct purpose."
    }];
    model.combinedReport.technicalFoundation.technicalReport.pages = unique.map((segment, index) => ({
      url: `https://example.com/${index}`,
      status: 200,
      title: `${shared} - ${segment}`,
      metaDescription: "Source description",
      h1: [],
      h2: [],
      hasOpenGraph: true,
      hasJsonLd: true,
      readableTextLength: 1000,
      internalLinks: 3
    }));

    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));

    expect(html).toContain("Sea Freight");
    expect(html).toContain("Shared template prefix");
    expect(html).toContain(`${shared} - Sea Freight`);
  });

  it("shows exact duplicate titles as having no page-unique text", () => {
    const model = combinedArtifactFixture();
    model.locale = "zh";
    model.combinedReport.presentationTerminologyPolicy = "geo_v1";
    const duplicate = "完全相同的页面标题用于多个不同页面";
    model.combinedReport.technicalFoundation.technicalReport.findings = [{
      id: "page.duplicateTitles",
      messageKey: "page.duplicateTitles",
      severity: "warning",
      title: "多个页面重复使用同一标题",
      description: "2 个页面使用相同标题。",
      recommendation: "使用独立标题。"
    }];
    model.combinedReport.technicalFoundation.technicalReport.pages = titlePatternPages(
      duplicate,
      ["", ""],
      2
    );

    const html = renderToStaticMarkup(createElement(CombinedGeoReportArtifact, { model }));

    expect(html).toContain("无独有标题文本");
    expect(html).toContain("共享模板标题");
    expect(html).toContain(duplicate);
  });
});

function titlePatternPages(
  shared: string,
  unique = ["", "国际转运流程", "集团简介", "新闻动态", "国际集运"],
  count = unique.length
) {
  return unique.slice(0, count).map((pageTitle, index) => ({
    url: `https://example.com/${index || ""}`,
    status: 200,
    title: pageTitle ? `${pageTitle}-${shared}` : shared,
    metaDescription: "Source description",
    h1: [],
    h2: [],
    hasOpenGraph: true,
    hasJsonLd: true,
    readableTextLength: 1000,
    internalLinks: 3
  }));
}

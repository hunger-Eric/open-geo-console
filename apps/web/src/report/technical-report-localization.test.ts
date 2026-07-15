import { createFinding, type GeoAuditReport } from "@open-geo-console/geo-auditor";
import { describe, expect, it } from "vitest";
import { localizeTechnicalReportForArtifact } from "./technical-report-localization";

describe("localizeTechnicalReportForArtifact", () => {
  it("projects deterministic finding prose and asset summaries into Chinese", () => {
    const source = fixture();
    const localized = localizeTechnicalReportForArtifact(source, "zh-CN");

    expect(localized.findings[0]).toMatchObject({
      title: "H1 结构需要调整",
      description: "预期只有一个 H1，实际发现 0 个。",
      recommendation: "每个页面使用一个描述清晰的 H1，并将 H2 用于章节结构。"
    });
    expect(localized.machineReadableAssets.robotsTxt.summary).toBe("robots.txt 可访问。");
    expect(localized.machineReadableAssets.sitemapXml.summary).toBe("sitemap.xml 未找到，或返回内容为空。");
    expect(localized.recommendations).toEqual(["每个页面使用一个描述清晰的 H1，并将 H2 用于章节结构。"]);
    expect(source.findings[0]!.title).toBe("H1 structure needs attention");
    expect(source.machineReadableAssets.robotsTxt.summary).toBe("Available");
  });

  it("keeps the English projection in English", () => {
    const localized = localizeTechnicalReportForArtifact(fixture(), "en");

    expect(localized.findings[0]).toMatchObject({
      title: "H1 structure needs attention",
      description: "Expected one H1, found 0.",
      recommendation: "Use one descriptive H1 per page and reserve H2 for section structure."
    });
    expect(localized.machineReadableAssets.robotsTxt.summary).toBe("robots.txt is available.");
  });

  it("localizes dominant title-template findings without mutating fallback prose", () => {
    const source = fixture();
    source.findings = [createFinding({
      id: "dominant-title-template",
      messageKey: "page.dominantTitleTemplate",
      params: { patternPosition: "suffix", sharedLength: 42, affectedCount: 5 },
      url: "https://example.com/"
    })];

    const localized = localizeTechnicalReportForArtifact(source, "zh-CN");

    expect(localized.findings[0]).toMatchObject({
      title: "页面标题被共享模板主导",
      description: "5 个页面共享长度为 42 个字符的标题片段，页面独有语义占比过低。",
      recommendation: expect.stringContaining("生成式引擎")
    });
    expect(source.findings[0]!.title).toBe("Page titles are dominated by a shared template");
  });

  it("uses Chinese field names in the OpenGraph recommendation", () => {
    const source = fixture();
    source.findings = [createFinding({
      id: "homepage.missingOpenGraph",
      messageKey: "homepage.missingOpenGraph",
      params: {},
      url: "https://example.com/"
    })];

    const localized = localizeTechnicalReportForArtifact(source, "zh-CN");

    expect(localized.findings[0]?.recommendation).toBe(
      "为首页添加 OpenGraph 标题、描述、URL 和图片元数据。"
    );
  });
});

function fixture(): GeoAuditReport {
  return {
    url: "https://example.com/",
    scannedAt: "2030-01-01T00:00:00.000Z",
    score: 80,
    pages: [],
    findings: [createFinding({
      id: "page.h1Structure",
      messageKey: "page.h1Structure",
      params: { h1Count: 0 },
      url: "https://example.com/"
    })],
    recommendations: [],
    machineReadableAssets: {
      robotsTxt: { url: "https://example.com/robots.txt", present: true, summary: "Available" },
      sitemapXml: { url: "https://example.com/sitemap.xml", present: false, summary: "Missing" },
      llmsTxt: { url: "https://example.com/llms.txt", present: false, summary: "Missing" }
    }
  };
}

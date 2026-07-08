import type { GeoAuditReport, GeoFinding } from "@open-geo-console/geo-auditor";
import { describe, expect, it } from "vitest";
import {
  REPORT_COMPOSITION_BOUNDARIES,
  REPORT_SECTION_REGISTRY,
  composeReportModel,
  resolveFindingCopy
} from "./report-registry";

describe("report registry", () => {
  it("resolves keyed finding copy from messageKey and params", () => {
    const finding: GeoFinding = {
      id: "bad-status-test",
      severity: "critical",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/missing",
        status: 404
      },
      title: "legacy title should not be primary",
      description: "legacy description should not be primary",
      recommendation: "legacy recommendation should not be primary",
      url: "https://example.com/missing"
    };

    expect(resolveFindingCopy(finding)).toEqual({
      title: "Page returned an error status",
      description: "https://example.com/missing returned HTTP 404.",
      recommendation: "Fix broken canonical pages or remove them from the sitemap.",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/missing",
        status: 404
      },
      source: "messageKey"
    });
  });

  it("falls back to legacy persisted finding copy when messageKey is absent", () => {
    const finding: GeoFinding = {
      id: "legacy-finding",
      severity: "warning",
      title: "Legacy title",
      description: "Legacy description",
      recommendation: "Legacy recommendation",
      url: "https://example.com/"
    };

    expect(resolveFindingCopy(finding)).toEqual({
      title: "Legacy title",
      description: "Legacy description",
      recommendation: "Legacy recommendation",
      params: {},
      source: "legacy"
    });
  });

  it("exposes deterministic report sections and agent composition boundaries", () => {
    const model = composeReportModel(makeReport());

    expect(model.sections).toBe(REPORT_SECTION_REGISTRY);
    expect(model.compositionBoundaries).toBe(REPORT_COMPOSITION_BOUNDARIES);
    expect(model.sections.map((section) => section.id)).toEqual([
      "executiveSummary",
      "findings",
      "machineReadableAssets",
      "auditedPages",
      "crawlerAccessNextStep",
      "technicalAppendix"
    ]);
    expect(model.compositionBoundaries.filter((boundary) => boundary.llmReplaceable)).toEqual([
      expect.objectContaining({ id: "composeNarrative" })
    ]);
    expect(model.severityCounts).toEqual({
      critical: 1,
      warning: 1,
      info: 0
    });
  });
});

function makeReport(): GeoAuditReport {
  return {
    url: "https://example.com/",
    scannedAt: "2026-07-08T00:00:00.000Z",
    score: 72,
    findings: [
      {
        id: "missing-sitemap",
        severity: "critical",
        messageKey: "asset.missingSitemapXml",
        params: { assetPath: "/sitemap.xml" },
        title: "Missing sitemap.xml",
        description: "The audit could not discover a sitemap for representative page selection.",
        recommendation: "Publish /sitemap.xml and reference it from robots.txt.",
        url: "https://example.com/sitemap.xml"
      },
      {
        id: "legacy-finding",
        severity: "warning",
        title: "Legacy title",
        description: "Legacy description",
        recommendation: "Legacy recommendation"
      }
    ],
    recommendations: ["Publish /sitemap.xml and reference it from robots.txt."],
    pages: [
      {
        url: "https://example.com/",
        status: 200,
        title: "Example",
        h1: ["Example"],
        h2: [],
        hasOpenGraph: false,
        hasJsonLd: false,
        readableTextLength: 100,
        internalLinks: 1
      }
    ],
    machineReadableAssets: {
      robotsTxt: {
        url: "https://example.com/robots.txt",
        present: true,
        status: 200,
        summary: "robots.txt is available."
      },
      sitemapXml: {
        url: "https://example.com/sitemap.xml",
        present: false,
        status: 404,
        summary: "sitemap.xml was not found or returned an empty response."
      },
      llmsTxt: {
        url: "https://example.com/llms.txt",
        present: false,
        status: 404,
        summary: "llms.txt was not found or returned an empty response."
      }
    }
  };
}

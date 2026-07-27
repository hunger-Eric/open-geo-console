import { describe, expect, it } from "vitest";
import type { GeoFinding } from "@open-geo-console/geo-auditor";
import { getDictionary } from "@/i18n";
import { localizeFinding, rollUpPriorityFindings } from "./presenter";

describe("report presenter", () => {
  it("localizes keyed findings with params", () => {
    const finding: GeoFinding = {
      id: "status",
      severity: "critical",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/broken",
        status: 500
      },
      title: "Page returned an error status",
      description: "https://example.com/broken returned HTTP 500.",
      recommendation: "Fix broken canonical pages or remove them from the sitemap.",
      url: "https://example.com/broken",
      aggregation: {
        affectedCount: 4,
        representativeUrls: [
          "https://example.com/broken",
          "https://example.com/broken-2",
          "https://example.com/broken-3"
        ],
        pageType: "service",
        templateKey: "/services/:id"
      }
    };

    const localized = localizeFinding(finding, getDictionary("zh"), "zh");

    expect(localized.localizedTitle).toBe("页面返回错误状态码");
    expect(localized.localizedDescription).toContain("500");
    expect(localized.aggregation).toEqual(finding.aggregation);
  });

  it("falls back to old persisted literal finding text", () => {
    const finding: GeoFinding = {
      id: "legacy",
      severity: "warning",
      title: "Legacy title",
      description: "Legacy description",
      recommendation: "Legacy recommendation"
    };

    const localized = localizeFinding(finding, getDictionary("zh"), "zh");

    expect(localized.localizedTitle).toBe("Legacy title");
    expect(localized.localizedDescription).toBe("Legacy description");
    expect(localized.localizedRecommendation).toBe("Legacy recommendation");
  });

  it("rolls template groups into one priority rule summary", () => {
    const first = localizeFinding({
      id: "status-a",
      severity: "critical",
      messageKey: "page.badStatus",
      params: { url: "https://example.com/a/1", status: 404 },
      title: "Page returned an error status",
      description: "A returned 404.",
      recommendation: "Fix it.",
      url: "https://example.com/a/1",
      aggregation: {
        affectedCount: 3,
        representativeUrls: ["https://example.com/a/1", "https://example.com/a/2"],
        pageType: "service",
        templateKey: "/a/:id"
      }
    }, getDictionary("en"), "en");
    const second = localizeFinding({
      ...first,
      id: "status-b",
      params: { url: "https://example.com/b/1", status: 404 },
      url: "https://example.com/b/1",
      aggregation: {
        affectedCount: 7,
        representativeUrls: ["https://example.com/b/1", "https://example.com/b/2"],
        pageType: "other",
        templateKey: "/b/:id"
      }
    }, getDictionary("en"), "en");

    const result = rollUpPriorityFindings([first, second]);

    expect(result).toHaveLength(1);
    expect(result[0]?.aggregation).toEqual({
      affectedCount: 10,
      representativeUrls: [
        "https://example.com/a/1",
        "https://example.com/a/2",
        "https://example.com/b/1"
      ]
    });
  });
});

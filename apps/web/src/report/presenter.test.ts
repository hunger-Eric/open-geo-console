import { describe, expect, it } from "vitest";
import type { GeoFinding } from "@open-geo-console/geo-auditor";
import { getDictionary } from "@/i18n";
import { localizeFinding } from "./presenter";

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
      url: "https://example.com/broken"
    };

    const localized = localizeFinding(finding, getDictionary("zh"), "zh");

    expect(localized.localizedTitle).toBe("页面返回错误状态码");
    expect(localized.localizedDescription).toContain("500");
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
});

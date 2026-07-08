import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { getGeoReport, saveGeoReport } from "./reports";

describe("report persistence", () => {
  it("saves and reads a GEO report by id", async () => {
    process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-")), "test.sqlite");
    const report: GeoAuditReport = {
      url: "https://example.com/",
      scannedAt: "2026-07-08T00:00:00.000Z",
      score: 82,
      findings: [],
      recommendations: [],
      pages: [],
      machineReadableAssets: {
        robotsTxt: {
          url: "https://example.com/robots.txt",
          present: true,
          status: 200,
          summary: "robots.txt is available."
        },
        sitemapXml: {
          url: "https://example.com/sitemap.xml",
          present: true,
          status: 200,
          summary: "sitemap.xml is available."
        },
        llmsTxt: {
          url: "https://example.com/llms.txt",
          present: false,
          status: 404,
          summary: "llms.txt was not found."
        }
      }
    };

    const saved = await saveGeoReport(report.url, report);
    const loaded = await getGeoReport(saved.id);

    expect(loaded?.id).toBe(saved.id);
    expect(loaded?.payload.score).toBe(82);
    expect(loaded?.payload.url).toBe("https://example.com/");
  });
});

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import {
  completeGeoReportTechnical,
  createGeoReportShell,
  failGeoReportTechnical,
  getGeoReport,
  markGeoReportTechnicalProcessing,
  persistLegacyReportLocale,
  saveGeoReport
} from "./reports";

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
    expect(loaded?.technicalStatus).toBe("completed");
    expect(loaded?.payload?.score).toBe(82);
    expect(loaded?.payload?.url).toBe("https://example.com/");
  });

  it("creates a durable pending shell and completes its technical report later", async () => {
    process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-shell-")), "test.sqlite");
    const shell = await createGeoReportShell({
      url: "https://example.com/",
      siteKey: "example.com",
      reportLocale: "en",
      admissionIdempotencyHmac: "admission-hmac"
    });

    expect(shell.technicalStatus).toBe("pending");
    expect(shell.payload).toBeNull();
    expect(shell.score).toBeNull();
    expect(shell.admissionIdempotencyHmac).toBe("admission-hmac");

    expect((await markGeoReportTechnicalProcessing(shell.id))?.technicalStatus).toBe("processing");

    const report: GeoAuditReport = {
      url: "https://www.example.com/",
      scannedAt: "2026-07-11T00:00:00.000Z",
      score: 73,
      findings: [],
      recommendations: [],
      pages: [],
      machineReadableAssets: {
        robotsTxt: { url: "https://www.example.com/robots.txt", present: true, status: 200, summary: "ok" },
        sitemapXml: { url: "https://www.example.com/sitemap.xml", present: true, status: 200, summary: "ok" },
        llmsTxt: { url: "https://www.example.com/llms.txt", present: false, status: 404, summary: "missing" }
      }
    };
    const completed = await completeGeoReportTechnical(shell.id, {
      url: report.url,
      siteKey: "example.com",
      report
    });

    expect(completed?.technicalStatus).toBe("completed");
    expect(completed?.score).toBe(73);
    expect(completed?.payload?.url).toBe("https://www.example.com/");
    expect(completed?.technicalErrorCode).toBeNull();
    expect(completed?.technicalPublicError).toBeNull();
  });

  it("persists a safe terminal technical failure on the report shell", async () => {
    process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-shell-failure-")), "test.sqlite");
    const shell = await createGeoReportShell({
      url: "https://unreachable.example/",
      siteKey: "unreachable.example",
      reportLocale: "zh"
    });

    const failed = await failGeoReportTechnical(shell.id, {
      code: "dns",
      publicMessage: "The website could not be reached safely."
    });

    expect(failed?.technicalStatus).toBe("failed");
    expect(failed?.payload).toBeNull();
    expect(failed?.technicalErrorCode).toBe("dns");
    expect(failed?.technicalPublicError).toBe("The website could not be reached safely.");
  });

  it("persists a new report locale and binds a legacy locale only once", async () => {
    process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-locale-")), "test.sqlite");
    const report: GeoAuditReport = {
      url: "https://example.com/",
      scannedAt: "2026-07-10T00:00:00.000Z",
      score: 82,
      findings: [],
      recommendations: [],
      pages: [],
      machineReadableAssets: {
        robotsTxt: { url: "https://example.com/robots.txt", present: true, status: 200, summary: "ok" },
        sitemapXml: { url: "https://example.com/sitemap.xml", present: true, status: 200, summary: "ok" },
        llmsTxt: { url: "https://example.com/llms.txt", present: true, status: 200, summary: "ok" }
      }
    };

    const localized = await saveGeoReport(report.url, report, undefined, undefined, "zh");
    expect((await getGeoReport(localized.id))?.reportLocale).toBe("zh");

    const legacy = await saveGeoReport(report.url, report);
    expect(await persistLegacyReportLocale(legacy.id, "en")).toBe("en");
    expect(await persistLegacyReportLocale(legacy.id, "zh")).toBe("en");
    expect((await getGeoReport(legacy.id))?.reportLocale).toBe("en");
  });
});

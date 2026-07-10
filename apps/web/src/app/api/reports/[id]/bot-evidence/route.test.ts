import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { beforeAll, describe, expect, it } from "vitest";
import { getBotEvidence } from "@/db/bot-evidence";
import { saveGeoReport } from "@/db/reports";
import { DELETE, MAX_LOG_BYTES, PUT } from "./route";

let reportId: string;

beforeAll(async () => {
  process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-api-")), "test.sqlite");
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
  reportId = (await saveGeoReport(report.url, report)).id;
});

function context(id = reportId) {
  return { params: Promise.resolve({ id }) };
}

describe("report bot evidence API", () => {
  it("persists a sanitized summary while returning the current analysis", async () => {
    const logs = '203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /private HTTP/1.1" 200 12 "-" "GPTBot/1.0"';
    const response = await PUT(
      new Request("http://localhost/api/report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logs })
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect((await response.json()).analysis.aiCrawlerHits).toBe(1);
    const stored = await getBotEvidence(reportId);
    expect(stored?.summary.detectedBotCount).toBe(1);
    expect(JSON.stringify(stored?.summary)).not.toContain("/private");
    expect(JSON.stringify(stored?.summary)).not.toContain("203.0.113.1");
  });

  it("treats missing User-Agent as a successful warning result", async () => {
    const response = await PUT(
      new Request("http://localhost/api/report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          logs: JSON.stringify({ ClientRequestPath: "/", EdgeResponseStatus: 200 })
        })
      }),
      context()
    );
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.summary.missingUserAgent).toBe(true);
  });

  it("rejects unknown reports, empty logs, and oversized payloads", async () => {
    const unknown = await PUT(
      new Request("http://localhost/api/report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logs: "a" })
      }),
      context("missing")
    );
    expect(unknown.status).toBe(404);

    const empty = await PUT(
      new Request("http://localhost/api/report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logs: " " })
      }),
      context()
    );
    expect(empty.status).toBe(400);

    const oversized = await PUT(
      new Request("http://localhost/api/report", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logs: "x".repeat(MAX_LOG_BYTES + 1) })
      }),
      context()
    );
    expect(oversized.status).toBe(413);
  });

  it("clears saved evidence", async () => {
    const response = await DELETE(new Request("http://localhost/api/report", { method: "DELETE" }), context());
    expect(response.status).toBe(204);
    expect(await getBotEvidence(reportId)).toBeNull();
  });
});

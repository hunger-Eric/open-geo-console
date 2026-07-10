import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { beforeAll, describe, expect, it } from "vitest";
import { saveGeoReport } from "@/db/reports";
import { POST } from "./route";

let reportId: string;

beforeAll(async () => {
  process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-upgrade-")), "test.sqlite");
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
  reportId = (await saveGeoReport(report.url, report, undefined, undefined, "en")).id;
});
function request(body: unknown) {
  return new Request("http://localhost/api/report/upgrade", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "test-upgrade" },
    body: JSON.stringify(body)
  });
}

function context() {
  return { params: Promise.resolve({ id: reportId }) };
}

describe("report upgrade locale contract", () => {
  it("requires a supported explicit locale", async () => {
    const response = await POST(request({ accessKey: "ogc_live_test", locale: "zh-CN" }), context());
    expect(response.status).toBe(400);
  });

  it("rejects a route locale that differs from the persisted report locale", async () => {
    const response = await POST(request({ accessKey: "ogc_live_test", locale: "zh" }), context());
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("persisted language");
  });
});

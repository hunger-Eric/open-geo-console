import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GeoAuditReport } from "@open-geo-console/geo-auditor";
import { analyzeLogs, buildBotEvidenceSummary } from "@open-geo-console/log-parser";
import { beforeAll, describe, expect, it } from "vitest";
import { deleteBotEvidence, getBotEvidence, saveBotEvidence } from "./bot-evidence";
import { saveGeoReport } from "./reports";

let reportId: string;

beforeAll(async () => {
  process.env.OPEN_GEO_DB_PATH = join(mkdtempSync(join(tmpdir(), "open-geo-evidence-")), "test.sqlite");
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

describe("bot evidence persistence", () => {
  it("saves, replaces, and removes one sanitized summary per report", async () => {
    const first = buildBotEvidenceSummary(
      analyzeLogs('203.0.113.1 - - [08/Jul/2026:09:10:11 +0800] "GET /private HTTP/1.1" 200 12 "-" "GPTBot/1.0"'),
      "2026-07-10T00:00:00.000Z"
    );
    await saveBotEvidence(reportId, first);

    const saved = await getBotEvidence(reportId);
    expect(saved?.summary.detectedBotCount).toBe(1);
    expect(JSON.stringify(saved?.summary)).not.toContain("/private");
    expect(JSON.stringify(saved?.summary)).not.toContain("203.0.113.1");

    const replacement = buildBotEvidenceSummary(analyzeLogs("bad line"), "2026-07-11T00:00:00.000Z");
    await saveBotEvidence(reportId, replacement);
    expect((await getBotEvidence(reportId))?.summary.detectedBotCount).toBe(0);

    expect(await deleteBotEvidence(reportId)).toBe(true);
    expect(await getBotEvidence(reportId)).toBeNull();
  });
});

import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";
import {
  beginReportV4PreAdmissionSnapshot,
  finalizeReportV4PreAdmissionSnapshot,
  loadReportV4PreAdmissionSnapshot,
  resolvePaidReportV4SiteSnapshot
} from "./report-v4-site-snapshots";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v4_snapshot_text_${randomUUID().replaceAll("-", "")}`;
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  memoryPath: process.env.OPEN_GEO_DB_PATH
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-TOKEN-02
describeDisposablePostgres("V4 retained site snapshot PostgreSQL repository", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    delete process.env.OPEN_GEO_DB_PATH;
    await initializeDatabaseEnvironment("staging");
    await getSqlClient()`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
      VALUES('report-retained','https://retained.example/','retained.example','en','completed')`;
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    restore("DATABASE_URL", originalEnvironment.databaseUrl);
    restore("OGC_DEPLOYMENT_PROFILE", originalEnvironment.deploymentProfile);
    restore("OPEN_GEO_DB_PATH", originalEnvironment.memoryPath);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("persists and reloads exact text and rejects repository-level content-hash drift", async () => {
    const identity = {
      id: "snapshot-retained",
      reportId: "report-retained",
      siteKey: "retained.example",
      collectorConfigIdentityHash: sha("collector-retained-v2"),
      capturedAt: new Date("2030-01-01T00:00:00.000Z")
    };
    await beginReportV4PreAdmissionSnapshot(identity);
    const text = "Exact cleaned PostgreSQL evidence.";
    const terminal = await finalizeReportV4PreAdmissionSnapshot({
      ...identity,
      status: "completed",
      completedAt: new Date("2030-01-01T00:05:00.000Z"),
      contentIdentityHash: sha("snapshot-retained-content"),
      candidateUrlCount: 1,
      pages: [{
        id: "page-retained",
        ordinal: 1,
        normalizedUrl: "https://retained.example/",
        analyzable: true,
        readMode: "direct_readable",
        summary: "Exact safe preview.",
        retainedText: text,
        contentHash: sha(text),
        exclusionReason: null
      }]
    });
    expect(terminal.pages[0]!.retainedText).toBe(text);
    expect((await loadReportV4PreAdmissionSnapshot(identity))!.pages[0]!.retainedText).toBe(text);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const paid = await resolvePaidReportV4SiteSnapshot({
        ...identity,
        contentIdentityHash: sha("snapshot-retained-content")
      });
      expect(paid.pages[0]!.retainedText).toBe(text);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }

    await expect(finalizeReportV4PreAdmissionSnapshot({
      ...identity,
      status: "completed",
      completedAt: new Date("2030-01-01T00:05:00.000Z"),
      contentIdentityHash: sha("snapshot-retained-content"),
      candidateUrlCount: 1,
      pages: [{ ...terminal.pages[0]!, retainedText: "drift", contentHash: sha(text) }]
    })).rejects.toThrow(/retained.*hash|hash.*retained/i);
    await expect(getSqlClient()`UPDATE report_v4_site_snapshot_pages
      SET retained_cleaned_text='terminal drift' WHERE id='page-retained'`).rejects.toThrow(/immutable/i);
  }, 120_000);
});

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function restore(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import {
  DATABASE_MIGRATIONS,
  V31_DATABASE_MIGRATIONS,
  V32_DATABASE_MIGRATIONS,
  V33_DATABASE_MIGRATIONS,
  V34_DATABASE_MIGRATIONS,
  V35_DATABASE_MIGRATIONS,
  V36_DATABASE_MIGRATIONS,
  V37_DATABASE_MIGRATIONS,
  V38_DATABASE_MIGRATIONS,
  databaseMigrationsAfter
} from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-TOKEN-02
describe("schema v31 retained V4 snapshot text", () => {
  it("registers an additive bounded private retained-text column", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(38);
    expect(databaseMigrationsAfter(30)).toEqual(expect.arrayContaining([...V31_DATABASE_MIGRATIONS]));
    const sql = V31_DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("retained_cleaned_text text");
    expect(sql).toContain("retained_cleaned_text IS NOT NULL");
    expect(sql).toContain("char_length(retained_cleaned_text) <= 100000");
    expect(sql).toContain("analyzable=true");
    expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V31_DATABASE_MIGRATIONS]));
  });
});

describeDisposablePostgres("schema v31 retained V4 snapshot text PostgreSQL constraints", () => {
  const databaseName = `ogc_v31_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    const v30 = DATABASE_MIGRATIONS.slice(
      0,
      DATABASE_MIGRATIONS.length
        - V31_DATABASE_MIGRATIONS.length
        - V32_DATABASE_MIGRATIONS.length
        - V33_DATABASE_MIGRATIONS.length
        - V34_DATABASE_MIGRATIONS.length
        - V35_DATABASE_MIGRATIONS.length
        - V36_DATABASE_MIGRATIONS.length
        - V37_DATABASE_MIGRATIONS.length
        - V38_DATABASE_MIGRATIONS.length
    );
    await sql.begin(async (tx) => {
      for (const statement of v30) await tx.unsafe(statement);
    });
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
      VALUES('legacy-report','https://legacy.example/','legacy.example','en','completed')`;
    await sql`INSERT INTO report_v4_site_snapshots
      (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
      VALUES('legacy-snapshot','legacy-report','legacy.example','collecting',now(),${hash("legacy-config")})`;
    await sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash)
      VALUES('legacy-page','legacy-snapshot',1,'https://legacy.example/','true','direct_readable','Legacy safe preview',${hash("unrecoverable-full-text")})`;
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),
      content_identity_hash=${hash("legacy-snapshot")},candidate_url_count=1,analyzable_page_count=1
      WHERE id='legacy-snapshot'`;
    await sql.begin(async (tx) => {
      for (const statement of V31_DATABASE_MIGRATIONS) await tx.unsafe(statement);
    });
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("keeps legacy terminal previews compatible without fabricating unavailable full text", async () => {
    const [legacy] = await sql<Array<{ summary: string; retained_cleaned_text: string | null; content_hash: string }>>`
      SELECT summary,retained_cleaned_text,content_hash FROM report_v4_site_snapshot_pages WHERE id='legacy-page'`;
    expect(legacy).toEqual({
      summary: "Legacy safe preview",
      retained_cleaned_text: null,
      content_hash: hash("unrecoverable-full-text")
    });
    await expect(sql`UPDATE report_v4_site_snapshot_pages SET retained_cleaned_text='fabricated' WHERE id='legacy-page'`)
      .rejects.toThrow(/immutable/i);
  });

  it("bounds new analyzable retained text, forbids it on excluded rows, and freezes it at terminal", async () => {
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
      VALUES('exact-report','https://exact.example/','exact.example','en','completed')`;
    await sql`INSERT INTO report_v4_site_snapshots
      (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
      VALUES('exact-snapshot','exact-report','exact.example','collecting',now(),${hash("exact-config")})`;
    await sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash)
      VALUES('exact-page','exact-snapshot',1,'https://exact.example/','true','direct_readable','Exact preview','Exact retained text',${hash("Exact retained text")})`;
    await expect(sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash)
      VALUES('missing-page','exact-snapshot',2,'https://exact.example/missing','true','direct_readable','Missing retained text',${hash("missing")})`)
      .rejects.toMatchObject({ constraint_name: "report_v4_site_snapshot_pages_retained_text_check" });
    await expect(sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash)
      VALUES('blank-page','exact-snapshot',3,'https://exact.example/blank','true','direct_readable','Blank','   ',${hash("   ")})`)
      .rejects.toMatchObject({ constraint_name: "report_v4_site_snapshot_pages_retained_text_check" });
    await expect(sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash)
      VALUES('long-page','exact-snapshot',4,'https://exact.example/long','true','direct_readable','Long',${"x".repeat(100_001)},${hash("x".repeat(100_001))})`)
      .rejects.toMatchObject({ constraint_name: "report_v4_site_snapshot_pages_retained_text_check" });
    await expect(sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,exclusion_reason,retained_cleaned_text)
      VALUES('excluded-page','exact-snapshot',5,'https://exact.example/excluded','false','robots_denied','forbidden')`)
      .rejects.toMatchObject({ constraint_name: "report_v4_site_snapshot_pages_retained_text_check" });
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),
      content_identity_hash=${hash("exact-snapshot")},candidate_url_count=1,analyzable_page_count=1
      WHERE id='exact-snapshot'`;
    await expect(sql`UPDATE report_v4_site_snapshot_pages SET retained_cleaned_text='drift' WHERE id='exact-page'`)
      .rejects.toThrow(/immutable/i);
  });
});

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

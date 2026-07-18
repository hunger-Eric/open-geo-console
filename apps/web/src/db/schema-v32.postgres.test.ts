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
  V39_DATABASE_MIGRATIONS,
  databaseMigrationsAfter
} from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const chunks = [{
  order: 1,
  summary: "Bounded exact retained-text summary.",
  sourceLocations: [{ locationId: "location:0-4", startOffset: 0, endOffset: 4 }]
}];

// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-TOKEN-02
describe("schema v32 terminal V4 page-summary binding", () => {
  it("registers V32 trigger hardening in the forward steps after V31", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(40);
    expect(databaseMigrationsAfter(31)).toEqual([
      ...V32_DATABASE_MIGRATIONS,
      ...V33_DATABASE_MIGRATIONS,
      ...V34_DATABASE_MIGRATIONS,
      ...V35_DATABASE_MIGRATIONS,
      ...V36_DATABASE_MIGRATIONS,
      ...V37_DATABASE_MIGRATIONS,
      ...V38_DATABASE_MIGRATIONS,
      ...V39_DATABASE_MIGRATIONS
    ]);
    const sql = V32_DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("ogc_js_source_location_length");
    expect(sql).toContain("completed','completed_limited");
    expect(sql).toContain("retained_cleaned_text");
    expect(sql).toContain("sha256(convert_to(retained_text,'UTF8'))");
    expect(sql).not.toMatch(/UPDATE\s+report_v4_(?:site_snapshot_pages|page_summaries)|DELETE\s+FROM\s+report_v4_/iu);
  });
});

describeDisposablePostgres("schema V31 to V32 page-summary migration", () => {
  const databaseName = `ogc_v32_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    const throughV30 = DATABASE_MIGRATIONS.slice(
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
        - V39_DATABASE_MIGRATIONS.length
    );
    await sql.begin(async (tx) => { for (const statement of throughV30) await tx.unsafe(statement); });
    await seedLegacyV30(sql);
    await sql.begin(async (tx) => { for (const statement of V31_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql.begin(async (tx) => { for (const statement of V32_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("keeps existing V30 rows unchanged and rejects future legacy-null inserts", async () => {
    const [legacy] = await sql<Array<{ retained_cleaned_text: string | null; summary_count: number }>>`
      SELECT page.retained_cleaned_text,count(summary.page_id)::integer AS summary_count
      FROM report_v4_site_snapshot_pages page
      LEFT JOIN report_v4_page_summaries summary ON summary.page_id=page.id
      WHERE page.id='legacy-existing-page'
      GROUP BY page.retained_cleaned_text`;
    expect(legacy).toEqual({ retained_cleaned_text: null, summary_count: 1 });
    await expect(sql`UPDATE report_v4_page_summaries SET source_length=5 WHERE page_id='legacy-existing-page'`)
      .rejects.toThrow(/immutable/i);
    await expect(sql`DELETE FROM report_v4_page_summaries WHERE page_id='legacy-existing-page'`)
      .rejects.toThrow(/immutable/i);
    await expect(sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("legacy-null-summary")},'legacy-report','legacy-null-snapshot','legacy-null-page',
       ${hash("unrecoverable-null-text")},4,${sql.json(chunks)})`)
      .rejects.toThrow(/retained snapshot page/i);
  });

  it("allows only terminal exact retained rows and uses JavaScript UTF-16 source length", async () => {
    const retainedText = "A\ud83d\ude00B";
    await seedExactCollecting(sql, "exact", retainedText);
    await expect(insertSummary(sql, "exact", retainedText, retainedText.length)).rejects.toThrow(/completed/i);
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),
      content_identity_hash=${hash("exact-snapshot")},candidate_url_count=1,analyzable_page_count=1,excluded_page_count=0
      WHERE id='exact-snapshot'`;
    await expect(insertSummary(sql, "exact", retainedText, retainedText.length + 1)).rejects.toThrow(/source length/i);
    await expect(sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("exact-wrong-hash")},'exact-report','exact-snapshot','exact-page',${hash("wrong")},
       ${retainedText.length},${sql.json(chunks)})`).rejects.toThrow(/content hash/i);
    await expect(insertSummary(sql, "exact", retainedText, retainedText.length)).resolves.toBeDefined();
    expect(retainedText.length).toBe(4);
  });
});

async function seedLegacyV30(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES('legacy-report','https://legacy.example/','legacy.example','en','completed')`;
  for (const name of ["existing", "null"] as const) {
    await sql`INSERT INTO report_v4_site_snapshots
      (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
      VALUES(${`legacy-${name}-snapshot`},'legacy-report','legacy.example','collecting',now(),${hash(`legacy-${name}-config`)})`;
    await sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash)
      VALUES(${`legacy-${name}-page`},${`legacy-${name}-snapshot`},1,${`https://legacy.example/${name}`},true,
       'direct_readable','Legacy preview only',${hash(`unrecoverable-${name}-text`)})`;
  }
  await sql`INSERT INTO report_v4_page_summaries
    (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
    VALUES(${hash("legacy-existing-summary")},'legacy-report','legacy-existing-snapshot','legacy-existing-page',
     ${hash("unrecoverable-existing-text")},4,${sql.json(chunks)})`;
  for (const name of ["existing", "null"] as const) {
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),
      content_identity_hash=${hash(`legacy-${name}-snapshot`)},candidate_url_count=1,analyzable_page_count=1
      WHERE id=${`legacy-${name}-snapshot`}`;
  }
}

async function seedExactCollecting(
  sql: ReturnType<typeof postgres>,
  name: string,
  retainedText: string
): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${`${name}-report`},${`https://${name}.example/`},${`${name}.example`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
    VALUES(${`${name}-snapshot`},${`${name}-report`},${`${name}.example`},'collecting',now(),${hash(`${name}-config`)})`;
  await sql`INSERT INTO report_v4_site_snapshot_pages
    (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash)
    VALUES(${`${name}-page`},${`${name}-snapshot`},1,${`https://${name}.example/`},true,'direct_readable',
     'Exact preview',${retainedText},${hash(retainedText)})`;
}

function insertSummary(
  sql: ReturnType<typeof postgres>,
  name: string,
  retainedText: string,
  sourceLength: number
) {
  return sql`INSERT INTO report_v4_page_summaries
    (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
    VALUES(${hash(`${name}-summary-${sourceLength}`)},${`${name}-report`},${`${name}-snapshot`},${`${name}-page`},
     ${hash(retainedText)},${sourceLength},${sql.json(chunks)})`;
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V21_DATABASE_MIGRATIONS, V22_DATABASE_MIGRATIONS, V23_DATABASE_MIGRATIONS, V24_DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

describeDisposablePostgres("schema v21 prospective V3 artifact scope", () => {
  const databaseName = `ogc_v21_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("preserves V1/V2 rows and admits only the reviewed V3 scope", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      const v20 = DATABASE_MIGRATIONS.slice(0, -(V21_DATABASE_MIGRATIONS.length + V22_DATABASE_MIGRATIONS.length + V23_DATABASE_MIGRATIONS.length + V24_DATABASE_MIGRATIONS.length));
      await sql.begin(async (tx) => { for (const statement of v20) await tx.unsafe(statement); });
      await sql`INSERT INTO scan_reports(id,url,payload,report_locale) VALUES('report-v21','https://example.com','{}','zh')`;
      await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,expires_at,artifact_scope) VALUES
        ('token-v1','report-v21','v1','hash-v1',now()+interval '1 day','combined_geo_report_v1'),
        ('token-v2','report-v21','v2','hash-v2',now()+interval '1 day','combined_geo_report_v2')`;

      await sql.begin(async (tx) => { for (const statement of V21_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await sql.begin(async (tx) => { for (const statement of V22_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      expect(DATABASE_SCHEMA_VERSION).toBe(31);
      expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V21_DATABASE_MIGRATIONS, ...V22_DATABASE_MIGRATIONS]));
      expect(await sql<{ artifact_scope: string }[]>`SELECT artifact_scope FROM report_access_tokens ORDER BY artifact_scope`)
        .toEqual([{ artifact_scope: "combined_geo_report_v1" }, { artifact_scope: "combined_geo_report_v2" }]);
      await expect(sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,expires_at,artifact_scope) VALUES('token-v3','report-v21','v3','hash-v3',now()+interval '1 day','combined_geo_report_v3')`).resolves.toBeDefined();
      await expect(sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,expires_at,artifact_scope) VALUES('token-bad','report-v21','bad','hash-bad',now()+interval '1 day','combined_geo_report_v4')`).rejects.toThrow();
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

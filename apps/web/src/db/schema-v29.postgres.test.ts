import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V29_DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

// @requirement GEO-V4-CRAWL-04
describe("schema v29 V4 pre-admission jobs", () => {
  it("registers the exact job identity and one-per-report boundary additively", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(40);
    const sql = V29_DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("v4_pre_admission");
    expect(sql).toContain("tier='deep'");
    expect(sql).toContain("product_contract='recommendation_forensics_v1'");
    expect(sql).toContain("fulfillment_methodology='two_stage_geo_report_v4'");
    expect(sql).toContain("recommendation_report_version=4");
    expect(sql).toContain("artifact_contract='combined_geo_report_v4'");
    expect(sql).toContain("site_snapshot_id IS NULL");
    expect(sql).toContain("business_question_set_id IS NULL");
    expect(sql).toContain("credit_reservation_id IS NULL");
    expect(sql).toContain("scan_jobs_v4_pre_admission_report_uidx");
  });
});

describeDisposablePostgres("schema v29 V4 pre-admission PostgreSQL constraints", () => {
  const databaseName = `ogc_v29_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("admits only one exact non-commercial V4 pre-admission job per report", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => {
        for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement);
      });
      for (const id of ["report-valid", "report-free", "report-legacy", "report-credit", "report-core"]) {
        await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
          VALUES(${id},${`https://${id}.example/`},${`${id}.example`},'en','completed')`;
      }

      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('admission-valid','report-valid','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`;
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('admission-duplicate','report-valid','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`).rejects.toMatchObject({ constraint_name: "scan_jobs_v4_pre_admission_report_uidx" });
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('admission-free','report-free','free','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`).rejects.toMatchObject({ constraint_name: "scan_jobs_v4_pre_admission_check" });
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,locale,reason)
        VALUES('admission-legacy','report-legacy','deep','legacy_website_audit_v1','en','v4_pre_admission')`).rejects.toMatchObject({ constraint_name: "scan_jobs_v4_pre_admission_check" });
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason,credit_reservation_id)
        VALUES('admission-credit','report-credit','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission','forbidden-credit')`).rejects.toThrow();

      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('paid-core','report-core','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','standard')`).resolves.toBeDefined();

      const [row] = await sql<Array<Record<string, unknown>>>`
        SELECT tier,product_contract,fulfillment_methodology,recommendation_report_version,
          artifact_contract,reason,site_snapshot_id,business_question_set_id,credit_reservation_id
        FROM scan_jobs WHERE id='admission-valid'
      `;
      expect(row).toMatchObject({
        tier: "deep",
        product_contract: "recommendation_forensics_v1",
        fulfillment_methodology: "two_stage_geo_report_v4",
        recommendation_report_version: 4,
        artifact_contract: "combined_geo_report_v4",
        reason: "v4_pre_admission",
        site_snapshot_id: null,
        business_question_set_id: null,
        credit_reservation_id: null
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 60_000);
});

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

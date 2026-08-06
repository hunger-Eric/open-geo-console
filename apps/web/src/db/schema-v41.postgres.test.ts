import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V41_DATABASE_MIGRATIONS, V42_DATABASE_MIGRATIONS, V43_DATABASE_MIGRATIONS, V44_DATABASE_MIGRATIONS, V45_DATABASE_MIGRATIONS, V46_DATABASE_MIGRATIONS as V46_BASE_DATABASE_MIGRATIONS, V47_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";
const V46_DATABASE_MIGRATIONS = [...V46_BASE_DATABASE_MIGRATIONS, ...V47_DATABASE_MIGRATIONS];

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v41_paid_v3_${randomUUID().replaceAll("-", "")}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const withDb = (url: string, database: string) => url.replace(/\/[^/]+$/, `/${database}`);

suite("schema V41 Paid V3 methodology admission", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDb(adminUrl!, databaseName), { max: 1, prepare: false });
    const throughV40 = DATABASE_MIGRATIONS.slice(0, -databaseMigrationsAfter(40).length);
    await sql.begin(async (tx) => { for (const statement of throughV40) await tx.unsafe(statement); });
    await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status) VALUES
      ('report-v2','https://v2.example/','v2.example','{}','en','completed'),
      ('report-v3','https://v3.example/','v3.example','{}','en','completed'),
      ('report-v4','https://v4.example/','v4.example','{}','en','completed')`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
      VALUES('job-v2','report-v2','deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3','en','standard')`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
      VALUES('job-v4','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`;
    await sql`INSERT INTO payment_orders(
      id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
      product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
      report_locale,currency,amount_minor,payment_status
    ) VALUES('order-v2','checkout-v2','airwallex','report-v2','v2.example','cipher','email-v2','v1',
      'recommendation_forensics_v1','public_search_source_forensics_v1',2,'v1','v1','v1','en','USD',100,'cancelled')`;
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("registers one replay-safe V41 forward constraint migration", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(47);
    expect(databaseMigrationsAfter(40)).toEqual([...V41_DATABASE_MIGRATIONS, ...V42_DATABASE_MIGRATIONS, ...V43_DATABASE_MIGRATIONS, ...V44_DATABASE_MIGRATIONS, ...V45_DATABASE_MIGRATIONS, ...V46_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(41)).toEqual([...V42_DATABASE_MIGRATIONS, ...V43_DATABASE_MIGRATIONS, ...V44_DATABASE_MIGRATIONS, ...V45_DATABASE_MIGRATIONS, ...V46_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(42)).toEqual([...V43_DATABASE_MIGRATIONS, ...V44_DATABASE_MIGRATIONS, ...V45_DATABASE_MIGRATIONS, ...V46_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(43)).toEqual([...V44_DATABASE_MIGRATIONS, ...V45_DATABASE_MIGRATIONS, ...V46_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(44)).toEqual([...V45_DATABASE_MIGRATIONS, ...V46_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(45)).toEqual([...V46_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(46)).toEqual([...V47_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(47)).toEqual([]);
    const source = V41_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("recommendation_report_version IN (2,3)");
    expect(source).toContain("two_stage_geo_report_v4");
  });

  it("preserves historical V2/V4 rows and admits only the valid V3 methodology identity", async () => {
    const before = await sql<Array<{ id: string; version: number }>>`
      SELECT id,recommendation_report_version::integer AS version FROM scan_jobs ORDER BY id`;
    await sql.begin(async (tx) => { for (const statement of V41_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql.begin(async (tx) => { for (const statement of V41_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    const after = await sql<Array<{ id: string; version: number }>>`
      SELECT id,recommendation_report_version::integer AS version FROM scan_jobs WHERE id IN ('job-v2','job-v4') ORDER BY id`;
    expect(after).toEqual(before);

    await expect(sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
      VALUES('job-v3','report-v3','deep','recommendation_forensics_v1','public_search_source_forensics_v1',3,'combined_geo_report_v3','en','standard')`).resolves.toBeDefined();
    await expect(sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
      VALUES('job-invalid','report-v3','deep','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',3,'combined_geo_report_v3','en','standard')`)
      .rejects.toMatchObject({ constraint_name: "scan_jobs_methodology_contract_check" });

    await expect(sql`INSERT INTO payment_orders(
      id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
      product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
      report_locale,currency,amount_minor,payment_status
    ) VALUES('order-v3','checkout-v3','airwallex','report-v3','v3.example','cipher','email-v3','v1',
      'recommendation_forensics_v1','public_search_source_forensics_v1',3,'v1','v1','v1','en','USD',100,'cancelled')`).resolves.toBeDefined();
    await expect(sql`INSERT INTO payment_orders(
      id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
      product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
      report_locale,currency,amount_minor,payment_status
    ) VALUES('order-invalid','checkout-invalid','airwallex','report-v3','v3.example','cipher','email-invalid','v1',
      'recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',3,'v1','v1','v1','en','USD',100,'cancelled')`)
      .rejects.toMatchObject({ constraint_name: "payment_orders_methodology_product_check" });
  }, 120_000);
});

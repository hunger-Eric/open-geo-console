import { createHash, randomUUID } from "node:crypto";
import { getTableConfig } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V28_DATABASE_MIGRATIONS } from "./migrations";
import { paymentOrders, scanJobs } from "./schema";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-LEGACY-01
describe("schema v28 V4 pre-admission site snapshot binding", () => {
  it("adds nullable report-bound terminal snapshot references to orders and jobs", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(39);
    const sql = V28_DATABASE_MIGRATIONS.join("\n");
    expect(sql).toContain("ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS site_snapshot_id text");
    expect(sql).toContain("ALTER TABLE scan_jobs ADD COLUMN IF NOT EXISTS site_snapshot_id text");
    expect(sql).toContain("payment_orders_site_snapshot_fkey");
    expect(sql).toContain("scan_jobs_site_snapshot_fkey");
    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS scan_jobs_site_snapshot_binding_uidx ON scan_jobs(id,report_id,site_snapshot_id)");
    expect(sql).toContain("FOREIGN KEY(fulfillment_job_id,report_id,site_snapshot_id) REFERENCES scan_jobs(id,report_id,site_snapshot_id) MATCH SIMPLE");
    expect(sql).toContain("OLD.site_snapshot_id IS NOT NULL");
    expect(sql).toContain("NEW.site_snapshot_id IS DISTINCT FROM OLD.site_snapshot_id");
    expect(sql).toContain("snapshot_report_id IS DISTINCT FROM NEW.report_id");
    expect(sql).toContain("snapshot_status NOT IN ('completed','completed_limited')");
    expect(sql).toContain("snapshot_content_identity_hash IS NULL");
    expect(sql).toContain("NEW.fulfillment_methodology IS DISTINCT FROM 'two_stage_geo_report_v4'");
    expect(sql).toContain("NEW.recommendation_report_version IS DISTINCT FROM 4");
    expect(sql).toContain("NEW.artifact_contract IS DISTINCT FROM 'combined_geo_report_v4'");
    expect(sql).not.toContain("FOR UPDATE");
    expect(sql).not.toMatch(/site_snapshot_id text NOT NULL/u);
    expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V28_DATABASE_MIGRATIONS]));

    const scanJobConfig = getTableConfig(scanJobs);
    expect(scanJobConfig.indexes.find(({ config }) => config.name === "scan_jobs_site_snapshot_binding_uidx"))
      .toMatchObject({ config: { unique: true } });
    const orderBinding = getTableConfig(paymentOrders).foreignKeys
      .find((foreignKey) => foreignKey.getName() === "payment_orders_fulfillment_snapshot_fkey");
    expect(orderBinding?.reference().columns.map(({ name }) => name))
      .toEqual(["fulfillment_job_id", "report_id", "site_snapshot_id"]);
    expect(orderBinding?.reference().foreignColumns.map(({ name }) => name))
      .toEqual(["id", "report_id", "site_snapshot_id"]);
  });
});

describeDisposablePostgres("schema v28 V4 site snapshot PostgreSQL constraints", () => {
  const databaseName = `ogc_v28_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("accepts only same-report terminal snapshots and keeps linked V4 order/job bindings exact", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status) VALUES
        ('report-a','https://a.example','a.example','{}','zh','completed'),
        ('report-b','https://b.example','b.example','{}','zh','completed'),
        ('report-c','https://c.example','c.example','{}','zh','completed')`;
      await sql`INSERT INTO report_v4_site_snapshots
        (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
        VALUES
        ('snapshot-a','report-a','a.example','completed',now(),now(),${hash("config-a")},${hash("content-a")},1,1,0),
        ('snapshot-a-limited','report-a','a.example','completed_limited',now(),now(),${hash("config-a-limited")},${hash("content-a-limited")},2,1,1),
        ('snapshot-a-unavailable','report-a','a.example','unavailable',now(),now(),${hash("config-a-unavailable")},${hash("content-a-unavailable")},0,0,0),
        ('snapshot-b','report-b','b.example','completed',now(),now(),${hash("config-b")},${hash("content-b")},1,1,0),
        ('snapshot-b-other','report-b','b.example','completed',now(),now(),${hash("config-b-other")},${hash("content-b-other")},1,1,0)`;

      await sql`INSERT INTO scan_jobs
        (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-a','report-a','snapshot-a','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','zh','standard')`;
      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
        VALUES('order-a','checkout-a','airwallex','report-a','snapshot-a','a.example','cipher','email-a','v1',
         'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100)`;
      await sql`UPDATE payment_orders SET fulfillment_job_id='job-a' WHERE id='order-a'`;

      await sql`INSERT INTO scan_jobs
        (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-limited','report-a','snapshot-a-limited','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','zh','standard')`;
      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
        VALUES('order-limited','checkout-limited','airwallex','report-a','snapshot-a-limited','a.example','cipher','email-limited','v1',
         'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100,'cancelled')`;
      await expect(sql`UPDATE payment_orders SET site_snapshot_id='snapshot-a' WHERE id='order-limited'`)
        .rejects.toThrow(/immutable/i);
      await expect(sql`UPDATE payment_orders SET site_snapshot_id=NULL WHERE id='order-limited'`)
        .rejects.toThrow(/immutable/i);
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-cross-report','report-a','snapshot-b','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','zh','standard')`)
        .rejects.toThrow(/same report/i);
      await expect(sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
        VALUES('order-unavailable','checkout-unavailable','airwallex','report-a','snapshot-a-unavailable','a.example','cipher','email-unavailable','v1',
         'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100,'cancelled')`)
        .rejects.toThrow(/terminal completed/i);
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-non-v4','report-a','snapshot-a','deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3','zh','standard')`)
        .rejects.toThrow(/exact V4/i);
      await expect(sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
        VALUES('order-non-v4','checkout-non-v4','airwallex','report-a','snapshot-a','a.example','cipher','email-non-v4','v1',
         'legacy_website_audit_v1','v1','v1','v1','zh','USD',100,'cancelled')`)
        .rejects.toThrow(/exact V4/i);

      await sql`INSERT INTO scan_jobs
        (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-b','report-b','snapshot-b','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','zh','standard')`;
      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
        VALUES('order-b','checkout-b','airwallex','report-b','snapshot-b-other','b.example','cipher','email-b','v1',
         'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100)`;
      await expect(sql`UPDATE payment_orders SET fulfillment_job_id='job-b' WHERE id='order-b'`)
        .rejects.toMatchObject({ constraint_name: "payment_orders_fulfillment_snapshot_fkey" });

      await expect(sql`UPDATE scan_jobs SET site_snapshot_id='snapshot-a' WHERE id='job-limited'`)
        .rejects.toThrow(/immutable/i);
      await expect(sql`UPDATE scan_jobs SET site_snapshot_id=NULL WHERE id='job-limited'`)
        .rejects.toThrow(/immutable/i);
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-null-then-bound','report-a','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','zh','standard')`;
      await sql`UPDATE scan_jobs SET site_snapshot_id='snapshot-a' WHERE id='job-null-then-bound'`;
      await expect(sql`UPDATE scan_jobs SET site_snapshot_id='snapshot-a-limited' WHERE id='job-null-then-bound'`)
        .rejects.toThrow(/immutable/i);

      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
        VALUES('job-c-v4-null','report-c','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','zh','standard'),
              ('job-c-v3-null','report-c','deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3','zh','standard')`;
      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
        VALUES('order-c-v4-null','checkout-c-v4-null','airwallex','report-c','job-c-v4-null','c.example','cipher','email-c-v4','v1',
         'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100,'cancelled'),
              ('order-c-v3-null','checkout-c-v3-null','airwallex','report-c','job-c-v3-null','c.example','cipher','email-c-v3','v1',
         'recommendation_forensics_v1','public_search_source_forensics_v1',2,'v1','v1','v1','zh','USD',100,'cancelled')`;
      const compatible = await sql<Array<{ id: string; site_snapshot_id: string | null }>>`
        SELECT id,site_snapshot_id FROM payment_orders WHERE id LIKE 'order-c-%' ORDER BY id`;
      expect(compatible).toEqual([
        { id: "order-c-v3-null", site_snapshot_id: null },
        { id: "order-c-v4-null", site_snapshot_id: null }
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

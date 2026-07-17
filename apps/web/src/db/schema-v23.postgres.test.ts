import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V23_DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

describeDisposablePostgres("schema v23 replacement fulfillment lineage", () => {
  const databaseName = `ogc_v23_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("admits one credit-free V3 replacement while preserving original failed lineage", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      expect(DATABASE_SCHEMA_VERSION).toBe(39);
      expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V23_DATABASE_MIGRATIONS]));

      await sql`INSERT INTO scan_reports(id,url,payload,report_locale,technical_status) VALUES('report-1','https://example.com','{}','zh','completed')`;
      await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,fulfillment_methodology,recommendation_report_version,artifact_contract,stage)
        VALUES('failed-job','report-1','deep','recommendation_forensics_v1','zh','public_search_source_forensics_v1',2,'combined_geo_report_v3','failed')`;
      await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,
        customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status,refund_status,fulfillment_methodology,recommendation_report_version)
        VALUES('order-1','checkout-1','airwallex','report-1','failed-job','example.com','cipher','email','v1','recommendation_forensics_v1','v1','v1','v1','zh','USD',100,'paid','failed','failed','public_search_source_forensics_v1',2)`;
      await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
        VALUES('questions-1','report-1','order-1',1,'zh','CN','candidate','high','v1','v1','profile')`;
      await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash)
        VALUES('failed-artifact','report-1','order-1','failed-job',1,'combined_geo_report_v3','failed','failed-payload')`;
      await sql`INSERT INTO report_replacement_fulfillments
        (id,order_id,report_id,original_failed_job_id,failed_artifact_revision_id,question_set_id,reason_code,state,operator_authorization_ref)
        VALUES('replacement-1','order-1','report-1','failed-job','failed-artifact','questions-1','paid_report_not_delivered','prepared','approval-2026-07-15')`;

      await expect(sql`INSERT INTO report_replacement_fulfillments
        (id,order_id,report_id,original_failed_job_id,failed_artifact_revision_id,question_set_id,reason_code,state,operator_authorization_ref)
        VALUES('replacement-2','order-1','report-1','failed-job','failed-artifact','questions-1','paid_report_not_delivered','prepared','approval-duplicate')`).rejects.toThrow();
      await expect(sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,fulfillment_methodology,recommendation_report_version,artifact_contract,reason,replacement_fulfillment_id,business_question_set_id,credit_reservation_id)
        VALUES('bad-credit-job','report-1','deep','recommendation_forensics_v1','zh','public_search_source_forensics_v1',2,'combined_geo_report_v3','replacement_fulfillment','replacement-1','questions-1','credit-1')`).rejects.toThrow();
      await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,fulfillment_methodology,recommendation_report_version,artifact_contract,reason,replacement_fulfillment_id,business_question_set_id)
        VALUES('replacement-job','report-1','deep','recommendation_forensics_v1','zh','public_search_source_forensics_v1',2,'combined_geo_report_v3','replacement_fulfillment','replacement-1','questions-1')`;
      await sql`UPDATE report_replacement_fulfillments SET replacement_job_id='replacement-job',state='queued' WHERE id='replacement-1'`;
      await expect(sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,replacement_fulfillment_id,revision,revision_kind,artifact_contract,status,payload_identity_hash,source_artifact_revision_id)
        VALUES('bad-replacement-artifact','report-1','order-1','replacement-job','replacement-1',2,'replacement','combined_geo_report_v3','pending','bad','failed-artifact')`).rejects.toThrow();
      await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,replacement_fulfillment_id,revision,revision_kind,artifact_contract,status,payload_identity_hash)
        VALUES('replacement-artifact','report-1','order-1','replacement-job','replacement-1',2,'replacement','combined_geo_report_v3','pending','replacement-payload')`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

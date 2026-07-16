import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V18_DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;

describeDisposablePostgres("schema v18 combined report correction persistence", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseName = `ogc_v18_${suffix}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("bootstraps exact-three questions, one correction, one active artifact, and no correction credit", async () => {
    await admin.unsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await executeStatements(sql, DATABASE_MIGRATIONS);
      expect(DATABASE_SCHEMA_VERSION).toBe(25);
      expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V18_DATABASE_MIGRATIONS]));

      await sql`INSERT INTO scan_reports(id,url,payload,report_locale) VALUES ('report','https://example.com','{}','en')`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,locale,reason,fulfillment_methodology,recommendation_report_version)
        VALUES ('original','report','deep','recommendation_forensics_v1','en','standard',
          'public_search_source_forensics_v1',2)`;
      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,
         customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,
         report_locale,currency,amount_minor,payment_status,fulfillment_status,refund_status,
         fulfillment_methodology,recommendation_report_version)
        VALUES ('order','checkout','stripe','report','original','example.com','cipher','email-hmac','v1',
          'recommendation_forensics_v1','v1','v1','v1','en','USD',100,'paid','completed','not_required',
          'public_search_source_forensics_v1',2)`;
      await sql`INSERT INTO report_business_question_sets
        (id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,
         neutralization_version,profile_evidence_identity)
        VALUES ('questions','report','order',1,'en','US','candidate','high','v1','v1','profile')`;
      for (const [ordinal, purpose] of [
        [1, "core_service_discovery"],
        [2, "customer_region_fit"],
        [3, "purchase_delivery_risk"]
      ] as const) {
        await sql`INSERT INTO report_business_questions
          (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
          VALUES (${`q${ordinal}`},'questions',${ordinal},${purpose},${`private ${ordinal}`},${`private ${ordinal}`},${`public ${ordinal}`},${`hash ${ordinal}`})`;
      }
      await sql`UPDATE report_business_question_sets SET status='locked',confirmed_at=now(),locked_at=now(),
        content_hash='private-hash',neutral_content_hash='public-hash',payload='{}' WHERE id='questions'`;
      await expect(sql`INSERT INTO market_snapshot_questions
        (id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
         surface_id,surface_version,fanout_version,completion_version)
        VALUES ('polluted','cache','private 1','hash','en','US','authority','surface','v1','fanout',1)`)
        .rejects.toThrow(/private customer identity/i);
      await expect(sql`UPDATE report_business_questions SET private_text='changed' WHERE id='q1'`)
        .rejects.toThrow(/immutable/i);
      await sql`INSERT INTO report_corrections(id,order_id,report_id,original_paid_job_id,question_set_id)
        VALUES ('correction','order','report','original','questions')`;

      await expect(sql`INSERT INTO report_corrections(id,order_id,report_id,original_paid_job_id,question_set_id)
        VALUES ('duplicate','order','report','original','questions')`).rejects.toThrow();
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,locale,reason,artifact_contract,correction_id,business_question_set_id,
         credit_reservation_id,fulfillment_methodology,recommendation_report_version)
        VALUES ('bad-correction','report','deep','recommendation_forensics_v1','en','paid_report_correction',
          'combined_geo_report_v1','correction','questions','reserved-credit','public_search_source_forensics_v1',2)`).rejects.toThrow();

      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,locale,reason,artifact_contract,correction_id,business_question_set_id,
         fulfillment_methodology,recommendation_report_version)
        VALUES ('correction-job','report','deep','recommendation_forensics_v1','en','paid_report_correction',
          'combined_geo_report_v1','correction','questions','public_search_source_forensics_v1',2)`;
      await sql`UPDATE report_corrections SET correction_job_id='correction-job' WHERE id='correction'`;
      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,correction_id,revision,artifact_contract,status,payload_identity_hash,
         html_sha256,pdf_sha256,pdf_storage_key,ready_at)
        VALUES ('artifact-1','report','order','correction-job','correction',1,'combined_geo_report_v1','active',
          'identity-1','html-1','pdf-1','private/report.pdf',now())`;
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,correction_id,revision,artifact_contract,status,payload_identity_hash,
         html_sha256,pdf_sha256,pdf_storage_key,ready_at)
        VALUES ('artifact-2','report','order','correction-job','correction',2,'combined_geo_report_v1','active',
          'identity-2','html-2','pdf-2','private/report-2.pdf',now())`).rejects.toThrow();
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

async function executeStatements(sql: postgres.Sql, statements: readonly string[]): Promise<void> {
  await sql.begin(async (tx) => { for (const statement of statements) await tx.unsafe(statement); });
}
function quoteIdentifier(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

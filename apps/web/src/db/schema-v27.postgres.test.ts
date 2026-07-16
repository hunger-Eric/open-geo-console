import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-DELIVERY-01
describe("schema v27 V4 immutable runtime configuration substrate", () => {
  it("adds isolated immutable snapshots and nullable historical-compatible artifact binding", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(27);
    const sql = databaseMigrationsAfter(26).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS report_v4_config_snapshots");
    expect(sql).toContain("model_profile_payload jsonb NOT NULL");
    expect(sql).toContain("id = 'v4-config-' || identity_hash");
    expect(sql).toContain("report_profile_payload jsonb NOT NULL");
    expect(sql).toContain("report_v4_config_snapshots_immutability_trigger");
    expect(sql).toContain("report_v4_config_snapshots_binding_trigger");
    expect(sql).toContain("order_fulfillment_job_id IS DISTINCT FROM NEW.core_job_id");
    expect(sql).toContain("order_payment_status IS DISTINCT FROM 'paid'");
    expect(sql).toContain("order_question_set_id IS DISTINCT FROM job_question_set_id");
    expect(sql).toContain("job_reason IS DISTINCT FROM 'standard'");
    expect(sql).toContain("enhancement_job_reason IS DISTINCT FROM 'v4_diagnosis_enhancement'");
    expect(sql).toContain("enhancement_job_question_set_id IS DISTINCT FROM core_job_question_set_id");
    expect(sql).toContain("source_status IS DISTINCT FROM 'active'");
    expect(sql).toContain("OLD.status='ready' AND NEW.status='active'");
    expect(sql).toContain("report_active_revision_id IS NOT DISTINCT FROM NEW.source_artifact_revision_id");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS config_snapshot_id text");
    expect(sql).toContain("report_artifact_revisions_config_snapshot_fkey");
    expect(sql).toContain("same configuration snapshot");
    expect(sql).not.toMatch(/config_snapshot_id text NOT NULL/u);
    expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining(databaseMigrationsAfter(26)));
  });
});

describeDisposablePostgres("schema v27 V4 configuration PostgreSQL constraints", () => {
  const databaseName = `ogc_v27_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("keeps snapshots immutable and validates every non-null artifact binding", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
        VALUES('report-v4','https://example.com','example.com','{}','zh','completed')`;
      await sql`INSERT INTO report_business_question_sets
        (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
        VALUES('questions-v4','report-v4',1,'zh','CN','candidate','high','v4','v4','profile-v4')`;
      await sql`INSERT INTO report_business_question_sets
        (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
        VALUES('questions-wrong','report-v4',2,'zh','CN','candidate','high','v4','v4','profile-wrong')`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('core-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','standard')`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('other-core-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','standard')`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('enhancement-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','v4_diagnosis_enhancement')`;
      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,business_question_set_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
        VALUES('order-v4','checkout-v4','airwallex','report-v4','core-job','questions-wrong','example.com','cipher','email','v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100,'paid')`;
      await expect(sql`INSERT INTO report_v4_config_snapshots
        (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
        VALUES(${`v4-config-${hash("wrong-identity")}`} ,'report-v4','order-v4','other-core-job',${hash("wrong-identity")},'model-v4',${hash("wrong-model")},'{}'::jsonb,'report-v4',${hash("wrong-report")},'{}'::jsonb)`)
        .rejects.toThrow(/exact paid order.*standard core V4 job/i);
      await expect(sql`INSERT INTO report_v4_config_snapshots
        (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
        VALUES(${`v4-config-${hash("wrong-questions")}`} ,'report-v4','order-v4','core-job',${hash("wrong-questions")},'model-v4',${hash("model")},'{}'::jsonb,'report-v4',${hash("report")},'{}'::jsonb)`)
        .rejects.toThrow(/exact paid order.*standard core V4 job/i);
      await sql`UPDATE payment_orders SET business_question_set_id='questions-v4' WHERE id='order-v4'`;
      await expect(sql`INSERT INTO report_v4_config_snapshots
        (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
        VALUES('arbitrary-id','report-v4','order-v4','core-job',${hash("identity")},'model-v4',${hash("model")},'{}'::jsonb,'report-v4',${hash("report")},'{}'::jsonb)`)
        .rejects.toMatchObject({ constraint_name: "report_v4_config_snapshots_identity_id_check" });
      await sql`INSERT INTO report_v4_config_snapshots
        (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
        VALUES(${`v4-config-${hash("identity")}`} ,'report-v4','order-v4','core-job',${hash("identity")},'model-v4',${hash("model")},'{"profileId":"model-v4"}'::jsonb,'report-v4',${hash("report")},'{"profileId":"report-v4"}'::jsonb)`;

      await expect(sql`UPDATE report_v4_config_snapshots SET model_profile_id='changed' WHERE id=${`v4-config-${hash("identity")}`}`).rejects.toThrow(/immutable/i);
      await expect(sql`DELETE FROM report_v4_config_snapshots WHERE id=${`v4-config-${hash("identity")}`}`).rejects.toThrow(/immutable/i);
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,config_snapshot_id,revision,artifact_contract,status,payload_identity_hash)
        VALUES('wrong-core','report-v4','order-v4','other-core-job',${`v4-config-${hash("identity")}`},1,'combined_geo_report_v4','pending','pending')`).rejects.toThrow(/core job/i);

      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,config_snapshot_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,ready_at,activated_at)
        VALUES('core-revision','report-v4','order-v4','core-job',${`v4-config-${hash("identity")}`},1,'combined_geo_report_v4','active','pending',${hash("core-html")},now(),now())`;
      await expect(sql`UPDATE report_artifact_revisions SET config_snapshot_id=NULL WHERE id='core-revision'`).rejects.toThrow(/immutable/i);
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash)
        VALUES('bad-enhancement','report-v4','order-v4','other-core-job',${`v4-config-${hash("identity")}`},2,'diagnosis_enhancement','core-revision','combined_geo_report_v4','pending','pending')`)
        .rejects.toThrow(/same-report V4 enhancement job|exact.*enhancement job/i);
      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash)
        VALUES('enhancement-revision','report-v4','order-v4','enhancement-job',${`v4-config-${hash("identity")}`},2,'diagnosis_enhancement','core-revision','combined_geo_report_v4','pending','pending')`;

      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash)
        VALUES('pre-v27-compatible','report-v4','order-v4','other-core-job',3,'combined_geo_report_v4','pending','historical')`;
      const compatible = await sql<Array<{ config_snapshot_id: string | null }>>`
        SELECT config_snapshot_id FROM report_artifact_revisions WHERE id='pre-v27-compatible'`;
      expect(compatible).toEqual([{ config_snapshot_id: null }]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

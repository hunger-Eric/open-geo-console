import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-CONTRACT-01
// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-ANSWER-01
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
describe("schema v26 V4 additive substrate", () => {
  it("registers only additive V4 tables and conditional HTML-only readiness", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(30);
    const sql = databaseMigrationsAfter(25).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS report_v4_site_snapshots");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS report_v4_site_snapshot_pages");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS report_v4_question_checkpoints");
    expect(sql).toContain("combined_geo_report_v4");
    expect(sql).toContain("two_stage_geo_report_v4");
    expect(sql).toContain("v4_diagnosis_enhancement");
    expect(sql).toContain("diagnosis_enhancement");
    expect(sql).toContain("completed_limited");
    expect(sql).toContain("credit_reservation_id IS NULL");
    expect(sql).toContain("report_artifact_revisions_ready_check");
    expect(sql).toContain("pdf_sha256 IS NULL AND pdf_storage_key IS NULL");
    expect(sql).toContain("pdf_sha256 IS NOT NULL AND pdf_storage_key IS NOT NULL");
    expect(sql).toContain("report_v4_site_snapshots_immutability_trigger");
    expect(sql).toContain("report_v4_site_snapshot_pages_immutability_trigger");
    expect(sql).toContain("report_v4_question_checkpoints_terminal_immutability_trigger");
    expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining(databaseMigrationsAfter(25)));
  });
});

describeDisposablePostgres("schema v26 V4 PostgreSQL constraints", () => {
  const databaseName = `ogc_v26_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  afterAll(async () => {
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("keeps snapshots and successful answers immutable and isolates core from enhancement", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
        VALUES('report-v4','https://example.com','example.com','{}','zh','completed')`;
      await sql`INSERT INTO report_v4_site_snapshots
        (id,report_id,site_key,status,captured_at,collector_config_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
        VALUES('snapshot-v4','report-v4','example.com','collecting',now(),${hash("a")},3,0,0)`;
      await sql`INSERT INTO report_v4_site_snapshot_pages
        (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash)
        VALUES('page-v4','snapshot-v4',1,'https://example.com/about',true,'direct_readable','About the company',${hash("b")})`;
      await expect(sql`INSERT INTO report_v4_site_snapshot_pages
        (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,content_hash)
        VALUES('invalid-analyzable-page','snapshot-v4',2,'https://example.com/missing-summary',true,'direct_readable',${hash("b2")})`).rejects.toMatchObject({ constraint_name: "report_v4_site_snapshot_pages_shape_check" });
      await expect(sql`INSERT INTO report_v4_site_snapshot_pages
        (id,snapshot_id,ordinal,normalized_url,analyzable)
        VALUES('invalid-excluded-page','snapshot-v4',2,'https://example.com/missing-reason',false)`).rejects.toMatchObject({ constraint_name: "report_v4_site_snapshot_pages_shape_check" });
      await sql`UPDATE report_v4_site_snapshots SET status='completed',analyzable_page_count=1,
        content_identity_hash=${hash("c")},completed_at=now() WHERE id='snapshot-v4'`;
      await expect(sql`UPDATE report_v4_site_snapshots SET site_key='changed.example' WHERE id='snapshot-v4'`).rejects.toThrow();
      await expect(sql`UPDATE report_v4_site_snapshot_pages SET summary='changed' WHERE id='page-v4'`).rejects.toThrow();
      await expect(sql`INSERT INTO report_v4_site_snapshot_pages
        (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash)
        VALUES('late-page','snapshot-v4',2,'https://example.com/late',true,'direct_readable','Late',${hash("d")})`).rejects.toThrow();
      await sql`INSERT INTO report_v4_site_snapshots
        (id,report_id,site_key,status,captured_at,collector_config_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
        VALUES('snapshot-limited','report-v4','example.com','collecting',now(),${hash("limited-config")},2,0,0)`;
      await sql`INSERT INTO report_v4_site_snapshot_pages
        (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash)
        VALUES('limited-page','snapshot-limited',1,'https://example.com/limited',true,'js_dependent','Limited coverage',${hash("limited-page")})`;
      await sql`UPDATE report_v4_site_snapshots SET status='completed_limited',analyzable_page_count=1,excluded_page_count=1,
        content_identity_hash=${hash("limited-content")},completed_at=now() WHERE id='snapshot-limited'`;
      await expect(sql`UPDATE report_v4_site_snapshots SET site_key='changed-limited.example' WHERE id='snapshot-limited'`).rejects.toThrow();
      await sql`INSERT INTO report_v4_site_snapshots
        (id,report_id,site_key,status,captured_at,collector_config_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
        VALUES('snapshot-51','report-v4','example.com','collecting',now(),${hash("config-51")},51,0,0)`;
      await expect(sql`UPDATE report_v4_site_snapshots SET status='completed_limited',analyzable_page_count=51,
        content_identity_hash=${hash("content-51")},completed_at=now() WHERE id='snapshot-51'`).rejects.toMatchObject({ constraint_name: "report_v4_site_snapshots_terminal_shape_check" });

      await sql`INSERT INTO report_business_question_sets
        (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
        VALUES('questions-v4','report-v4',1,'zh','CN','candidate','high','v4','v4','profile-v4')`;
      for (const ordinal of [1, 2, 3]) {
        await sql`INSERT INTO report_business_questions
          (id,question_set_id,ordinal,purpose,generated_text,neutral_public_text,neutral_content_hash)
          VALUES(${`question-${ordinal}`},'questions-v4',${ordinal},${["core_service_discovery","customer_region_fit","purchase_delivery_risk"][ordinal - 1]!},${`Question ${ordinal}`},${`Question ${ordinal}`},${hash(String(ordinal))})`;
      }
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('core-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','standard')`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('enhancement-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','v4_diagnosis_enhancement')`;
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('v4-old-methodology','report-v4','deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v4','questions-v4','zh','standard')`).rejects.toMatchObject({ constraint_name: "scan_jobs_v4_methodology_check" });
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('v3-v4-methodology','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v3','questions-v4','zh','standard')`).rejects.toMatchObject({ constraint_name: "scan_jobs_v4_methodology_check" });
      await expect(sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,credit_reservation_id)
        VALUES('bad-enhancement','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','v4_diagnosis_enhancement','credit-forbidden')`).rejects.toMatchObject({ constraint_name: "scan_jobs_v4_enhancement_check" });

      for (const ordinal of [1, 2, 3]) {
        await sql`INSERT INTO report_v4_question_checkpoints
          (identity_hash,report_id,job_id,question_set_id,question_id,snapshot_id,ordinal,state,
           question_identity_hash,model_config_identity_hash,input_identity_hash,provider_call_count,
           answer_payload,source_payload,answer_content_hash)
          VALUES(${hash(`i${ordinal}`)},'report-v4','core-job','questions-v4',${`question-${ordinal}`},'snapshot-v4',${ordinal},'answered',
           ${hash(`q${ordinal}`)},${hash(`m${ordinal}`)},${hash(`n${ordinal}`)},1,'{"text":"answer"}'::jsonb,'[]'::jsonb,${hash(`r${ordinal}`)})`;
      }
      await expect(sql`INSERT INTO report_v4_question_checkpoints
        (identity_hash,report_id,job_id,question_set_id,question_id,snapshot_id,ordinal,state,
         question_identity_hash,model_config_identity_hash,input_identity_hash,provider_call_count)
        VALUES(${hash("z")},'report-v4','core-job','questions-v4','question-1','snapshot-v4',1,'queued',${hash("x")},${hash("y")},${hash("w")},0)`).rejects.toThrow();
      await expect(sql`UPDATE report_v4_question_checkpoints SET answer_payload='{"text":"changed"}'::jsonb
        WHERE job_id='core-job' AND ordinal=1`).rejects.toThrow();
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('retry-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','standard')`;
      await sql`INSERT INTO report_v4_question_checkpoints
        (identity_hash,report_id,job_id,question_set_id,question_id,snapshot_id,ordinal,state,
         question_identity_hash,model_config_identity_hash,input_identity_hash,provider_call_count)
        VALUES(${hash("retry")},'report-v4','retry-job','questions-v4','question-1','snapshot-v4',1,'retrying',
         ${hash("retry-question")},${hash("retry-model")},${hash("retry-input")},2)`;
      await expect(sql`UPDATE report_v4_question_checkpoints SET provider_call_count=3
        WHERE job_id='retry-job' AND ordinal=1`).rejects.toMatchObject({ constraint_name: "report_v4_question_checkpoints_call_count_check" });
      await sql`UPDATE report_v4_question_checkpoints SET state='unavailable' WHERE job_id='retry-job' AND ordinal=1`;
      await expect(sql`UPDATE report_v4_question_checkpoints SET state='queued' WHERE job_id='retry-job' AND ordinal=1`).rejects.toThrow();
      await expect(sql`DELETE FROM report_v4_question_checkpoints WHERE job_id='retry-job' AND ordinal=1`).rejects.toThrow();

      await sql`INSERT INTO payment_orders
        (id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
         product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
        VALUES('order-v4','checkout-v4','airwallex','report-v4','example.com','cipher','email','v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100)`;
      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,ready_at,activated_at)
        VALUES('core-revision','report-v4','order-v4','core-job',1,'combined_geo_report_v4','active','core-payload',${hash("h")},now(),now())`;
      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash,html_sha256,ready_at)
        VALUES('enhancement-revision','report-v4','order-v4','enhancement-job',2,'diagnosis_enhancement','core-revision','combined_geo_report_v4','ready','enhancement-payload',${hash("e")},now())`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('nested-enhancement-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','v4_diagnosis_enhancement')`;
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash,html_sha256,ready_at)
        VALUES('nested-enhancement','report-v4','order-v4','nested-enhancement-job',3,'diagnosis_enhancement','enhancement-revision','combined_geo_report_v4','ready','nested',${hash("nested")},now())`).rejects.toThrow(/must preserve its ready core lineage|must extend a ready core V4 revision/i);
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash,html_sha256,ready_at)
        VALUES('v4-evidence-refresh','report-v4','order-v4','retry-job',3,'evidence_refresh','core-revision','combined_geo_report_v4','ready','old-kind',${hash("old-kind")},now())`).rejects.toMatchObject({ constraint_name: "report_artifact_revisions_v4_kind_check" });
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,ready_at)
        VALUES('duplicate-core-revision','report-v4','order-v4','core-job',3,'combined_geo_report_v4','ready','duplicate',${hash("f")},now())`).rejects.toThrow();
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('pdf-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','standard')`;
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key,ready_at)
        VALUES('v4-with-pdf','report-v4','order-v4','pdf-job',4,'combined_geo_report_v4','ready','bad-pdf',${hash("g")},${hash("p")},'pdf/key',now())`).rejects.toMatchObject({ constraint_name: "report_artifact_revisions_ready_check" });

      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('legacy-job','report-v4','deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3','questions-v4','zh','standard')`;
      await expect(sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,ready_at)
        VALUES('legacy-no-pdf','report-v4','order-v4','legacy-job',5,'combined_geo_report_v3','ready','legacy',${hash("l")},now())`).rejects.toMatchObject({ constraint_name: "report_artifact_revisions_ready_check" });
      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key,ready_at)
        VALUES('legacy-with-pdf','report-v4','order-v4','legacy-job',5,'combined_geo_report_v3','ready','legacy',${hash("l")},${hash("p")},'pdf/legacy',now())`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
        VALUES('legacy-refresh-job','report-v4','deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3','questions-v4','zh','standard')`;
      await sql`INSERT INTO report_artifact_revisions
        (id,report_id,order_id,job_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key,ready_at)
        VALUES('legacy-evidence-refresh','report-v4','order-v4','legacy-refresh-job',6,'evidence_refresh','legacy-with-pdf','combined_geo_report_v3','ready','legacy-refresh',${hash("lrh")},${hash("lrp")},'pdf/legacy-refresh',now())`;
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

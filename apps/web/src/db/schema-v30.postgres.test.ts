import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-CRAWL-04
describe("schema v30 V4 runtime persistence substrate", () => {
  it("adds only hierarchical summaries, diagnosis checkpoints and one enhancement per core", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(35);
    const sql = databaseMigrationsAfter(29).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS report_v4_page_summaries");
    expect(sql).toContain("source_length integer NOT NULL");
    expect(sql).toContain("chunks jsonb NOT NULL");
    expect(sql).toContain("report_v4_page_summaries_page_content_fkey");
    expect(sql).toContain("report_v4_page_summaries_immutability_trigger");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS report_v4_diagnosis_checkpoints");
    expect(sql).toContain("enhancement_job_id text NOT NULL");
    expect(sql).toContain("core_artifact_revision_id text NOT NULL");
    expect(sql).toMatch(/config_snapshot_id text[^\n]*NOT NULL/u);
    expect(sql).toContain("provider_call_count integer NOT NULL DEFAULT 0");
    expect(sql).toContain("source_audit_payload jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(sql).toContain("diagnosis_payload jsonb");
    expect(sql).toContain("report_v4_diagnosis_checkpoints_terminal_immutability_trigger");
    expect(sql).toContain("report_artifact_revisions_v4_diagnosis_source_uidx");
    expect(sql).not.toMatch(/prompt|provider_response|raw_response|pdf_/iu);
    expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining(databaseMigrationsAfter(29)));
  });
});

describeDisposablePostgres("schema v30 V4 runtime persistence PostgreSQL constraints", () => {
  const databaseName = `ogc_v30_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    await sql.begin(async (tx) => {
      for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement);
    });
  }, 60_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("preserves the existing V28 prepayment snapshot pin before a fulfillment job exists", async () => {
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
      VALUES('pin-report','https://pin.example/','pin.example','en','completed')`;
    await sql`INSERT INTO report_v4_site_snapshots
      (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
       candidate_url_count,analyzable_page_count,excluded_page_count)
      VALUES('pin-snapshot','pin-report','pin.example','completed',now(),now(),${hash("pin-config")},${hash("pin-content")},1,1,0)`;
    await sql`INSERT INTO payment_orders
      (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,
       customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,
       catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
      VALUES('pin-order','pin-checkout','airwallex','pin-report','pin-snapshot','pin.example','cipher','pin-email','v1',
       'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','en','USD',100)`;

    const [order] = await sql<Array<{ payment_status: string; fulfillment_job_id: string | null; site_snapshot_id: string }>>`
      SELECT payment_status,fulfillment_job_id,site_snapshot_id FROM payment_orders WHERE id='pin-order'`;
    expect(order).toEqual({ payment_status: "created", fulfillment_job_id: null, site_snapshot_id: "pin-snapshot" });
    await expect(sql`UPDATE payment_orders SET site_snapshot_id=NULL WHERE id='pin-order'`)
      .rejects.toThrow(/immutable/i);
  });

  it("persists immutable bounded page summaries and exact resumable diagnosis checkpoints", async () => {
    const pageText = "p".repeat(120);
    const wrongPageText = "w".repeat(120);
    const invalidPageText = "i".repeat(20);
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
      VALUES('report-v30','https://v30.example/','v30.example','en','completed')`;
    await sql`INSERT INTO report_v4_site_snapshots
      (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
      VALUES('snapshot-v30','report-v30','v30.example','collecting',now(),${hash("collector-v30")})`;
    await sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash)
      VALUES
       ('page-v30','snapshot-v30',1,'https://v30.example/','true','direct_readable','Homepage summary',${pageText},${hash(pageText)}),
       ('page-v30-wrong','snapshot-v30',2,'https://v30.example/wrong','true','direct_readable','Wrong-content fixture',${wrongPageText},${hash(wrongPageText)}),
       ('page-v30-invalid','snapshot-v30',3,'https://v30.example/invalid','true','direct_readable','Invalid-location fixture',${invalidPageText},${hash(invalidPageText)})`;

    const chunks = [{
      order: 1,
      summary: "The homepage clearly describes the service and delivery region.",
      sourceLocations: [{ locationId: "page-v30:0-48", startOffset: 0, endOffset: 48 }]
    }];
    await expect(sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("summary-before-terminal")},'report-v30','snapshot-v30','page-v30',${hash(pageText)},120,${sql.json(chunks)})`)
      .rejects.toThrow(/completed/i);
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),content_identity_hash=${hash("snapshot-v30")},
      candidate_url_count=3,analyzable_page_count=3,excluded_page_count=0 WHERE id='snapshot-v30'`;
    await sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("summary-v30")},'report-v30','snapshot-v30','page-v30',${hash(pageText)},120,${sql.json(chunks)})`;
    await expect(sql`UPDATE report_v4_page_summaries SET source_length=121 WHERE page_id='page-v30'`)
      .rejects.toThrow(/immutable/i);
    await expect(sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("summary-wrong-content")},'report-v30','snapshot-v30','page-v30-wrong',${hash("wrong-page")},120,${sql.json(chunks)})`)
      .rejects.toThrow(/content hash/i);
    await expect(sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("summary-invalid-location")},'report-v30','snapshot-v30','page-v30-invalid',${hash(invalidPageText)},20,
       ${sql.json([{ order: 1, summary: "Invalid", sourceLocations: [{ locationId: "bad", startOffset: 0, endOffset: 21 }] }])})`)
      .rejects.toMatchObject({ constraint_name: "report_v4_page_summaries_chunks_check" });

    await sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${hash("summary-after-terminal")},'report-v30','snapshot-v30','page-v30-wrong',${hash(wrongPageText)},120,
       ${sql.json(chunks)})`;
    await sql`INSERT INTO report_v4_site_snapshots
      (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
       candidate_url_count,analyzable_page_count,excluded_page_count)
      VALUES('snapshot-v30-other','report-v30','v30.example','completed',now(),now(),${hash("collector-v30-other")},
       ${hash("snapshot-v30-other")},1,1,0)`;
    await sql`INSERT INTO report_business_question_sets
      (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,
       neutralization_version,profile_evidence_identity)
      VALUES('questions-v30','report-v30',1,'en','US','candidate','high',false,'v1','v1','profile-v30')`;
    for (const ordinal of [1, 2, 3]) {
      await sql`INSERT INTO report_business_questions
        (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
        VALUES(${`question-v30-${ordinal}`},'questions-v30',${ordinal},
         ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
         ${`Question ${ordinal}`},${`Question ${ordinal}`},${`Question ${ordinal}`},${hash(`question-${ordinal}`)})`;
    }
    await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${hash("questions-private")},
      neutral_content_hash=${hash("questions-neutral")},payload='{}'::jsonb,confirmed_at=now(),locked_at=now()
      WHERE id='questions-v30'`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
       artifact_contract,business_question_set_id,locale,reason)
      VALUES('core-job-v30','report-v30','snapshot-v30','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
       'combined_geo_report_v4','questions-v30','en','standard')`;
    await sql`INSERT INTO payment_orders
      (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,
       customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,
       fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
       report_locale,currency,amount_minor,payment_status)
      VALUES('order-v30','checkout-v30','airwallex','report-v30','snapshot-v30','core-job-v30','v30.example',
       'cipher','email-v30','v1','recommendation_forensics_v1','questions-v30','two_stage_geo_report_v4',4,
       'v1','v1','v1','en','USD',100,'paid')`;
    await sql`UPDATE report_business_question_sets SET order_id='order-v30' WHERE id='questions-v30'`;
    const configHash = hash("config-v30");
    const configId = `v4-config-${configHash}`;
    await sql`INSERT INTO report_v4_config_snapshots
      (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
       report_profile_id,report_profile_hash,report_profile_payload)
      VALUES(${configId},'report-v30','order-v30','core-job-v30',${configHash},'model-v30',${hash("model-v30")},
       '{"provider":"mimo","model":"test","capabilities":{"structuredOutput":true,"publicSearch":true}}'::jsonb,
       'report-profile-v30',${hash("report-profile-v30")},
       '{"id":"report-profile-v30","locale":"en","audience":"business","terminology":"geo","forbiddenTerms":["SEO"]}'::jsonb)`;
    await sql`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,artifact_contract,status,
       payload_identity_hash,html_sha256,ready_at,activated_at)
      VALUES('core-revision-v30','report-v30','order-v30','core-job-v30',${configId},1,'generation',
       'combined_geo_report_v4','active',${hash("core-payload")},${hash("core-html")},now(),now())`;
    await sql`UPDATE scan_reports SET active_artifact_revision_id='core-revision-v30' WHERE id='report-v30'`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,
       business_question_set_id,locale,reason)
      VALUES('enhancement-job-v30','report-v30','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
       'combined_geo_report_v4','questions-v30','en','v4_diagnosis_enhancement')`;

    await sql`INSERT INTO report_v4_diagnosis_checkpoints
      (identity_hash,report_id,enhancement_job_id,core_artifact_revision_id,config_snapshot_id,question_set_id,
       question_id,snapshot_id,ordinal,state,input_identity_hash)
      VALUES(${hash("diagnosis-v30")},'report-v30','enhancement-job-v30','core-revision-v30',${configId},
       'questions-v30','question-v30-1','snapshot-v30',1,'queued',${hash("diagnosis-input-v30")})`;
    await expect(sql`INSERT INTO report_v4_diagnosis_checkpoints
      (identity_hash,report_id,enhancement_job_id,core_artifact_revision_id,config_snapshot_id,question_set_id,
       question_id,snapshot_id,ordinal,state,input_identity_hash)
      VALUES(${hash("diagnosis-wrong-snapshot")},'report-v30','enhancement-job-v30','core-revision-v30',${configId},
       'questions-v30','question-v30-2','snapshot-v30-other',2,'queued',${hash("diagnosis-input-wrong-snapshot")})`)
      .rejects.toThrow(/exact active core, configuration, snapshot, questions and enhancement job/i);
    const sourceAudit = [{
      questionId: "question-v30-1",
      sourceId: "source-1",
      canonicalUrl: "https://source.example/evidence",
      status: "available",
      summary: "Audited public source evidence."
    }];
    await sql`UPDATE report_v4_diagnosis_checkpoints SET state='running',provider_call_count=1,
      source_audit_payload=${sql.json(sourceAudit)}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`;
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints
      SET source_audit_payload=${sql.json([{ ...sourceAudit[0], rawProviderResponse: "must not persist" }])}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_source_audit_check" });
    const diagnosis = {
      selectionSummary: "Observable source strengths.",
      observableFactors: ["problem_match", "factual_specificity", "target_clarity"].map((kind, index) => ({
        kind,
        observation: `Observable factor ${index}.`,
        evidenceRefs: ["source-1"]
      })),
      targetGap: "The target lacks equivalent evidence.",
      recommendedActions: [1, 2, 3].map((priority) => ({
        priority,
        action: `Publish verifiable evidence action ${priority}.`,
        evidenceRefs: ["source-1"]
      })),
      detailedEvidenceRefs: ["source-1"]
    };
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints SET state='completed',
      diagnosis_payload=${sql.json({
        ...diagnosis,
        observableFactors: diagnosis.observableFactors.map((factor, index) => index === 0
          ? { ...factor, kind: "unknown_factor" }
          : factor)
      })},diagnosis_content_hash=${hash("unknown-kind")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_payload_check" });
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints SET state='completed',
      diagnosis_payload=${sql.json({
        ...diagnosis,
        detailedEvidenceRefs: [],
        observableFactors: diagnosis.observableFactors.map((factor) => ({ ...factor, evidenceRefs: [] })),
        recommendedActions: diagnosis.recommendedActions.map((action) => ({ ...action, evidenceRefs: [] }))
      })},diagnosis_content_hash=${hash("empty-detailed-refs")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_payload_check" });
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints SET state='completed',
      diagnosis_payload=${sql.json({
        ...diagnosis,
        observableFactors: diagnosis.observableFactors.map((factor, index) => index === 0
          ? { ...factor, evidenceRefs: [] }
          : factor)
      })},diagnosis_content_hash=${hash("empty-factor-refs")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_payload_check" });
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints SET state='completed',
      diagnosis_payload=${sql.json({
        ...diagnosis,
        recommendedActions: diagnosis.recommendedActions.map((action, index) => index === 0
          ? { ...action, evidenceRefs: [] }
          : action)
      })},diagnosis_content_hash=${hash("empty-action-refs")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_payload_check" });
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints SET state='completed',
      diagnosis_payload=${sql.json({ ...diagnosis, rawPrompt: "must not persist" })},
      diagnosis_content_hash=${hash("invalid-diagnosis-output-v30")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_payload_check" });
    await sql`UPDATE report_v4_diagnosis_checkpoints SET state='completed',
      diagnosis_payload=${sql.json(diagnosis)},
      diagnosis_content_hash=${hash("diagnosis-output-v30")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`;
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints SET diagnosis_content_hash=${hash("drift")}
      WHERE enhancement_job_id='enhancement-job-v30' AND ordinal=1`).rejects.toThrow(/immutable/i);
    await expect(sql`INSERT INTO report_v4_diagnosis_checkpoints
      (identity_hash,report_id,enhancement_job_id,core_artifact_revision_id,config_snapshot_id,question_set_id,
       question_id,snapshot_id,ordinal,state,input_identity_hash,provider_call_count)
      VALUES(${hash("diagnosis-too-many-calls")},'report-v30','enhancement-job-v30','core-revision-v30',${configId},
       'questions-v30','question-v30-2','snapshot-v30',2,'failed',${hash("diagnosis-input-2")},3)`)
      .rejects.toMatchObject({ constraint_name: "report_v4_diagnosis_checkpoints_call_count_check" });

    await sql`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,revision,revision_kind,
       artifact_contract,status,payload_identity_hash)
      VALUES('enhancement-revision-v30','report-v30','order-v30','enhancement-job-v30',${configId},
       'core-revision-v30',2,'diagnosis_enhancement','combined_geo_report_v4','pending',${hash("enhancement-pending")})`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,
       business_question_set_id,locale,reason)
      VALUES('enhancement-job-v30-duplicate','report-v30','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
       'combined_geo_report_v4','questions-v30','en','v4_diagnosis_enhancement')`;
    await expect(sql`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,revision,revision_kind,
       artifact_contract,status,payload_identity_hash)
      VALUES('enhancement-revision-v30-duplicate','report-v30','order-v30','enhancement-job-v30-duplicate',${configId},
       'core-revision-v30',3,'diagnosis_enhancement','combined_geo_report_v4','pending',${hash("enhancement-duplicate")})`)
      .rejects.toMatchObject({ constraint_name: "report_artifact_revisions_v4_diagnosis_source_uidx" });
  }, 120_000);
});

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";
import { buildReportV4DiagnosisEnhancementJob, createReportV4ProductionJobRepository } from "./report-v4-production-jobs";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "");
const databaseName = `ogc_v4_production_jobs_${suffix}`;
const ids = {
  report: `report-${suffix}`, coreJob: `core-${suffix}`, order: `order-${suffix}`,
  snapshot: `snapshot-${suffix}`, questions: `questions-${suffix}`,
  configHash: sha(`config-${suffix}`), artifact: `artifact-${suffix}`,
  accessKey: `access-key-${suffix}`, credit: `credit-${suffix}`
};
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  memoryPath: process.env.OPEN_GEO_DB_PATH
};
let enhancementJobId = "";

// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-01
describeDisposablePostgres("V4 production job lineage PostgreSQL repository", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    delete process.env.OPEN_GEO_DB_PATH;
    await initializeDatabaseEnvironment("staging");
    await seedSettledCore();
  }, 180_000);

  afterAll(async () => {
    await closeDatabase();
    restore("DATABASE_URL", originalEnvironment.databaseUrl);
    restore("OGC_DEPLOYMENT_PROFILE", originalEnvironment.deploymentProfile);
    restore("OPEN_GEO_DB_PATH", originalEnvironment.memoryPath);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("serializes concurrent enqueue to one no-credit job without commercial side effects", async () => {
    const repo = createReportV4ProductionJobRepository();
    const before = await sideEffectCounts();
    const lineage = exactLineage();
    const results = await Promise.all(Array.from({ length: 16 }, () => repo.enqueueDiagnosisEnhancement(lineage)));
    enhancementJobId = results[0]!.id;

    expect(new Set(results.map((job) => job.id))).toHaveLength(1);
    expect(results[0]).toEqual(buildReportV4DiagnosisEnhancementJob(lineage));
    const jobs = await getSqlClient()<Array<{ id:string;credit_reservation_id:string|null;reason:string }>>`
      SELECT id,credit_reservation_id,reason FROM scan_jobs
      WHERE report_id=${ids.report} AND reason='v4_diagnosis_enhancement'`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ credit_reservation_id: null, reason: "v4_diagnosis_enhancement" });
    expect(await sideEffectCounts()).toEqual(before);

    await expect(repo.loadDiagnosisEnhancementContext({ ...lineage, enhancementJobId: jobs[0]!.id }))
      .resolves.toMatchObject({
        enhancementJob: { id: jobs[0]!.id, creditReservationId: null },
        core: { commercePhase: "settled", targetUrl: "https://example.com/", activeCoreArtifact: { id: ids.artifact } }
      });
    await expect(repo.loadDiagnosisEnhancementContext({
      ...lineage, enhancementJobId: jobs[0]!.id, configSnapshotId: `v4-config-${sha("wrong")}`
    })).rejects.toThrow(/config|lineage|exact/i);
  }, 180_000);

  it("fails closed when out-of-band SQL creates duplicate enhancement lineage", async () => {
    const sql = getSqlClient();
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,
      recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase)
      VALUES(${`out-of-band-${suffix}`},${ids.report},'deep','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questions},'en','v4_diagnosis_enhancement',
      'queued','queued','source_retrieval')`;
    await expect(createReportV4ProductionJobRepository().enqueueDiagnosisEnhancement(exactLineage()))
      .rejects.toThrow(/duplicate|exact lineage/i);
    await expect(createReportV4ProductionJobRepository().loadDiagnosisEnhancementContext({
      ...exactLineage(), enhancementJobId
    })).rejects.toThrow(/duplicate|exactly one|lineage/i);
    await sql`DELETE FROM scan_jobs WHERE id=${`out-of-band-${suffix}`}`;
  });

  it("fails closed when the authoritative paid report URL is missing or non-HTTP", async () => {
    const sql = getSqlClient();
    await sql`UPDATE scan_reports SET url=${"file:///not-a-paid-target"} WHERE id=${ids.report}`;
    await expect(createReportV4ProductionJobRepository().loadPaidCoreContext({ coreJobId: ids.coreJob }))
      .rejects.toThrow(/target URL|HTTP/i);
    await sql`UPDATE scan_reports SET url=${""} WHERE id=${ids.report}`;
    await expect(createReportV4ProductionJobRepository().loadPaidCoreContext({ coreJobId: ids.coreJob }))
      .rejects.toThrow(/target URL/i);
    await sql`UPDATE scan_reports SET url=${"https://example.com/"} WHERE id=${ids.report}`;
  });

  it("recovers from a crash after the exact enhancement supersedes its source core", async () => {
    const sql = getSqlClient();
    const enhancementArtifact = `enhancement-artifact-${suffix}`;
    await sql`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,revision_kind,revision,
       artifact_contract,status,payload_identity_hash)
      VALUES(${enhancementArtifact},${ids.report},${ids.order},${enhancementJobId},${`v4-config-${ids.configHash}`},
      ${ids.artifact},'diagnosis_enhancement',2,'combined_geo_report_v4','pending',${sha("enhancement-payload")})`;
    await sql`UPDATE report_artifact_revisions SET status='ready',html_sha256=${sha("enhancement-html")},
      readiness='{"htmlCanonical":true}'::jsonb,ready_at=now() WHERE id=${enhancementArtifact}`;
    await sql`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL WHERE id=${ids.artifact}`;
    await sql`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id=${enhancementArtifact}`;
    await sql`UPDATE scan_reports SET active_artifact_revision_id=${enhancementArtifact} WHERE id=${ids.report}`;

    const repo = createReportV4ProductionJobRepository();
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId }))
      .resolves.toMatchObject({
        enhancementJob: { id: enhancementJobId },
        core: { activeCoreArtifact: { id: ids.artifact, status: "ready" }, commercePhase: "settled" }
      });

    await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.artifact} WHERE id=${ids.report}`;
    await expect(repo.loadDiagnosisEnhancementContext({ ...exactLineage(), enhancementJobId }))
      .rejects.toThrow(/active|supersed|lineage/i);
    await sql`UPDATE scan_reports SET active_artifact_revision_id=${enhancementArtifact} WHERE id=${ids.report}`;
  });
});

function exactLineage() {
  return {
    reportId: ids.report, orderId: ids.order, coreJobId: ids.coreJob,
    coreArtifactRevisionId: ids.artifact, configSnapshotId: `v4-config-${ids.configHash}`,
    siteSnapshotId: ids.snapshot, questionSetId: ids.questions, locale: "en" as const
  };
}

async function seedSettledCore(): Promise<void> {
  const sql = getSqlClient();
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES(${ids.report},'https://example.com/','example.com','{}','en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.snapshot},${ids.report},'example.com','completed',now()-interval '1 minute',now(),${sha("collector")},${sha("content")},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questions},${ids.report},1,'en','US','candidate','high','v4','v4',${sha("profile")})`;
  for (const [index, purpose] of ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"].entries()) {
    const ordinal = index + 1;
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`${ids.questions}-q${ordinal}`},${ids.questions},${ordinal},${purpose},${`Question ${ordinal}`},
      ${`Private question ${ordinal}`},${`Neutral question ${ordinal}`},${sha(`question-${ordinal}`)})`;
  }
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,progress)
    VALUES(${ids.coreJob},${ids.report},${ids.snapshot},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
    'combined_geo_report_v4',${ids.questions},'en','standard','completed','completed','terminalization',100)`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_snapshot_id,business_question_set_id,site_key,
     customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,
     recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,
     payment_status,fulfillment_status,refund_status)
    VALUES(${ids.order},${sha(`checkout-${suffix}`)},'airwallex',${ids.report},${ids.coreJob},${ids.snapshot},${ids.questions},
    'example.com','encrypted',${sha(`email-${suffix}`)},'v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,
    'v4','terms-v1','refund-v1','en','USD',2900,'paid','completed','not_required')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.order},status='locked',content_hash=${sha("questions")},
    neutral_content_hash=${sha("neutral")},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id=${ids.questions}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining)
    VALUES(${ids.accessKey},${`key-${suffix}`},${sha(`key-${suffix}`)},${ids.order},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status,settled_at)
    VALUES(${ids.credit},${ids.accessKey},${ids.report},${ids.coreJob},${`credit-${suffix}`},${ids.order},1,'settled',now())`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${ids.credit} WHERE id=${ids.coreJob}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${`v4-config-${ids.configHash}`},${ids.report},${ids.order},${ids.coreJob},${ids.configHash},'model-v4',
    ${sha("model")},'{}'::jsonb,'report-v4',${sha("report-profile")},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,
     html_sha256,readiness,ready_at,activated_at)
    VALUES(${ids.artifact},${ids.report},${ids.order},${ids.coreJob},${`v4-config-${ids.configHash}`},'generation',1,
    'combined_geo_report_v4','active',${sha("payload")},${sha("html")},'{"htmlCanonical":true}'::jsonb,now(),now())`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.artifact} WHERE id=${ids.report}`;
  await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
    VALUES(${`token-${suffix}`},${ids.report},'ogc_report_fixture',${sha(`token-${suffix}`)},'combined_geo_report_v4',now()+interval '30 days')`;
}

async function sideEffectCounts() {
  return (await getSqlClient()<Array<{orders:number;credits:number;access:number;refunds:number;emails:number}>>`
    SELECT (SELECT count(*)::int FROM payment_orders WHERE report_id=${ids.report}) orders,
      (SELECT count(*)::int FROM credit_ledger WHERE report_id=${ids.report}) credits,
      (SELECT count(*)::int FROM report_access_tokens WHERE report_id=${ids.report}) access,
      (SELECT count(*)::int FROM payment_refunds WHERE order_id=${ids.order}) refunds,
      (SELECT count(*)::int FROM email_deliveries WHERE report_id=${ids.report}) emails`)[0]!;
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function restore(key: string, value: string | undefined): void { if (value === undefined) delete process.env[key]; else process.env[key] = value; }

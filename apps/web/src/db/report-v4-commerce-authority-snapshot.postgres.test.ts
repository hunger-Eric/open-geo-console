import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loadReportV4CommerceAuthoritySnapshot,
  loadReportV4CommerceAuthoritySnapshotInTransaction
} from "./report-v4-commerce-authority-snapshot";
import { DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;

suite("Report V4 commerce authority snapshot PostgreSQL transaction", () => {
  const databaseName = `ogc_v4_authority_${randomUUID().replaceAll("-", "")}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, prepare: false });
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 1 });
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
      await admin.end({ timeout: 1 });
    }
  }, 60_000);

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-ACCEPT-01
  // @requirement GEO-V4-PDF-01
  // @requirement GEO-V4-LEGACY-01
  it("reads a real complete lineage under repeatable read and read only", async () => {
    const ids = await seedHappyPath(sql);
    const result = await loadReportV4CommerceAuthoritySnapshot(sql, {
      sessionId: ids.sessionId, scenarioId: ids.scenarioId, phase: "baseline",
    });
    expect(result.transactionProfile).toEqual({ isolation: "repeatable read", readOnly: true });
    expect(result.scope.activeArtifactRevisionIdHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.jobs).toHaveLength(2);
    expect(result.dispatches).toHaveLength(2);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({ pdfSha256: null, pdfStorageKeyPresent: false });
    expect(result.emailAuthority.events).toEqual([expect.objectContaining({ deliveryIdHash: null, provider: "resend" })]);
    expect(JSON.stringify(result)).not.toMatch(/SECRET_EMAIL|SECRET_TOKEN|SECRET_KEY|SECRET_URL|SECRET_STORAGE/iu);
  });

  it("reuses one caller-owned repeatable-read snapshot without a nested transaction or drift", async () => {
    const ids = await seedHappyPath(sql);
    const writer = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin("isolation level repeatable read read only", async (tx) => {
        const first = await loadReportV4CommerceAuthoritySnapshotInTransaction(tx, {
          sessionId: ids.sessionId,
          scenarioId: ids.scenarioId,
          phase: "baseline"
        });
        await writer`UPDATE payment_orders SET amount_minor=amount_minor+1 WHERE id=${ids.order}`;
        const second = await loadReportV4CommerceAuthoritySnapshotInTransaction(tx, {
          sessionId: ids.sessionId,
          scenarioId: ids.scenarioId,
          phase: "baseline"
        });
        expect(second.fingerprint).toBe(first.fingerprint);
        expect(second.orders[0]?.amountMinor).toBe(first.orders[0]?.amountMinor);
      });
    } finally {
      await writer.end({ timeout: 1 });
    }
  });
});

async function seedHappyPath(sql: postgres.Sql) {
  const suffix = randomUUID().replaceAll("-", "");
  const ids = { sessionId: randomUUID(), scenarioId: randomUUID(),
    report: `report-${suffix}`, snapshot: `snapshot-${suffix}`, order: `order-${suffix}`, pre: `pre-${suffix}`,
    core: `core-${suffix}`, questions: `questions-${suffix}`, access: `access-${suffix}`, credit: `credit-${suffix}`,
    artifact: `artifact-${suffix}` };
  const configHash = suffix.repeat(2), config = `v4-config-${configHash}`;
  const artifactHash = "b".repeat(64);
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${ids.report},'https://SECRET_URL.test','SECRET_URL','en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.snapshot},${ids.report},'SECRET_URL','completed',now(),now(),${"c".repeat(64)},${"d".repeat(64)},1,1,0)`;
  await insertJob(sql, ids.pre, ids.report, null, null, "v4_pre_admission", null);
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,provider_checkout_id,provider_payment_id,report_id,site_snapshot_id,site_key,
    customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,
    terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status,refund_status,delivery_status,paid_at,delivery_deadline_at,fulfilled_at)
    VALUES(${ids.order},${`SECRET_KEY-checkout-${suffix}`},'airwallex',${`checkout-provider-${suffix}`},${`payment-provider-${suffix}`},${ids.report},${ids.snapshot},'SECRET_URL','SECRET_EMAIL',${`SECRET_EMAIL-${suffix}`},'v1',
    'recommendation_forensics_v1','two_stage_geo_report_v4',4,'catalog-v4','terms-v4','refund-v4','en','USD',100,'paid','completed','not_required','delivered',now(),now(),now())`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining,expires_at) VALUES(${ids.access},${`SECRET_KEY-prefix-${suffix}`},${`SECRET_KEY-access-${suffix}`},${ids.order},'exhausted',0,now()+interval '1 day')`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,idempotency_key,payment_order_id,credits,status,reserved_at,settled_at) VALUES(${ids.credit},${ids.access},${ids.report},${`SECRET_KEY-credit-${suffix}`},${ids.order},1,'settled',now(),now())`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questions},${ids.report},${ids.order},1,'en','US','candidate','high','v1','v1','profile')`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`${ids.questions}-q${ordinal}`},${ids.questions},${ordinal},${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
        ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${String(ordinal).repeat(64)})`;
  }
  await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${"e".repeat(64)},neutral_content_hash=${"f".repeat(64)},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id=${ids.questions}`;
  await insertJob(sql, ids.core, ids.report, ids.snapshot, ids.questions, "standard", ids.credit);
  await sql`UPDATE credit_ledger SET job_id=${ids.core} WHERE id=${ids.credit}`;
  await sql`UPDATE payment_orders SET fulfillment_job_id=${ids.core},business_question_set_id=${ids.questions} WHERE id=${ids.order}`;
  await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${config},${ids.report},${ids.order},${ids.core},${configHash},'model-v4',${"1".repeat(64)},'{}'::jsonb,'report-v4',${"2".repeat(64)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,html_sha256,ready_at,activated_at)
    VALUES(${ids.artifact},${ids.report},${ids.order},${ids.core},${config},'generation',1,'combined_geo_report_v4','active',${artifactHash},${"3".repeat(64)},now(),now())`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.artifact} WHERE id=${ids.report}`;
  await sql`INSERT INTO job_dispatch_outbox(id,job_id,tier,schema_version,state,attempts,published_at) VALUES
    (${`dispatch-${ids.pre}`},${ids.pre},'deep',1,'published',1,now()),(${`dispatch-${ids.core}`},${ids.core},'deep',1,'published',1,now())`;
  await sql`INSERT INTO report_v4_acceptance_sessions(id,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha) VALUES
    (${ids.sessionId},'preview-v4','https://preview.test',${"4".repeat(40)},${"4".repeat(40)})`;
  await sql`INSERT INTO report_v4_acceptance_scenarios(id,session_id,kind,fault_kind,fault_question_id,expected_fault_occurrences,report_id,order_id,
    pre_admission_job_id,core_job_id,site_snapshot_id,config_snapshot_id,question_set_id,core_artifact_revision_id)
    VALUES(${ids.scenarioId},${ids.sessionId},'question_failure','question_failure','question-1',2,${ids.report},${ids.order},${ids.pre},${ids.core},${ids.snapshot},${config},${ids.questions},${ids.artifact})`;
  await sql`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,provider_email_id,business_idempotency_key,state,attempts,sent_at,delivered_at)
    VALUES(${`email-${suffix}`},${ids.order},${ids.report},'report_ready','v4','en','SECRET_EMAIL','resend',${`provider-email-${suffix}`},${`email-idem-${suffix}`},'delivered',1,now(),now())`;
  await sql`INSERT INTO email_delivery_events(id,provider,provider_event_id,provider_email_id,delivery_id,event_type,processing_status,payload_hash,provider_created_at)
    VALUES(${`email-event-${suffix}`},'resend',${`provider-event-${suffix}`},${`provider-email-${suffix}`},NULL,'email.delivered','processed',${"5".repeat(64)},now())`;
  return ids;
}

async function insertJob(sql: postgres.Sql, id:string, report:string, snapshot:string|null, questions:string|null, reason:string, credit:string|null) {
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,
    business_question_set_id,locale,reason,stage,execution_state,current_phase,checkpoint_revision,phase_attempt,resume_generation,progress,planned_pages,
    successful_pages,failed_pages,attempts,max_attempts,credit_reservation_id)
    VALUES(${id},${report},${snapshot},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${questions},'en',${reason},
    'completed','completed','terminalization',1,0,0,100,1,1,0,1,3,${credit})`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

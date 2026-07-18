import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  loadReportV4ZeroDatabaseEffectsAuthority,
  loadReportV4ZeroDatabaseEffectsAuthorityInTransaction,
  type LoadReportV4ZeroDatabaseEffectsAuthorityInput
} from "./report-v4-zero-database-effects-authority";
import { loadReportV4CommerceAuthoritySnapshotInTransaction } from "./report-v4-commerce-authority-snapshot";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;

// @requirement GEO-V4-ACCEPT-01
// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
suite("Report V4 zero database effects authority PostgreSQL 17", () => {
  const databaseName = `ogc_v4_zero_effects_${randomUUID().replaceAll("-", "")}`;
  let admin: ReturnType<typeof postgres>;
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, prepare: false });
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 8, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    expect((await sql<{ version: string }[]>`SELECT current_setting('server_version') version`)[0]?.version).toMatch(/^17\./u);
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    }
  }, 120_000);

  it("accepts a legal baseline and fails closed on correction/replacement and extra commerce rows", async () => {
    const clean = await seedBaseline(sql, "clean");
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, clean.input)).resolves.toMatchObject({
      phase: "baseline", scenarioKind: "question_failure",
      transactionProfile: { isolation: "repeatable read", readOnly: true }
    });

    const recovery = await seedBaseline(sql, "recovery");
    await sql`INSERT INTO report_corrections(id,order_id,report_id,original_paid_job_id,question_set_id,state)
      VALUES(${`correction-${recovery.suffix}`},${recovery.order},${recovery.report},${recovery.core},${recovery.questions},'review_required')`;
    await sql`INSERT INTO report_replacement_fulfillments(id,order_id,report_id,original_failed_job_id,failed_artifact_revision_id,
      question_set_id,reason_code,state,operator_authorization_ref)
      VALUES(${`replacement-${recovery.suffix}`},${recovery.order},${recovery.report},${recovery.core},${recovery.artifact},
        ${recovery.questions},'paid_report_not_delivered','prepared','operator-test')`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, recovery.input)).rejects.toThrow(/correction_fulfillment_records/u);

    const commerce = await seedBaseline(sql, "commerce");
    await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
      VALUES(${`extra-token-${commerce.suffix}`},${commerce.report},'extra',${`extra-hmac-${commerce.suffix}`},'combined_geo_report_v4',now()+interval '1 day')`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, commerce.input)).rejects.toThrow(/accessTokenIds|extra_access_token_rows/u);
  }, 120_000);

  it("accepts null-delivery and dual-bound email events exactly once and rejects an extra null-delivery event", async () => {
    const nullable = await seedBaseline(sql, "email-null");
    const nullableEvent = `event-${nullable.suffix}`;
    await insertEmailEvent(sql, nullable, nullableEvent, null);
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, nullable.input)).resolves.toMatchObject({
      allowedCommerceTopology: { emailDeliveryIds: { count: 2 }, emailEventIds: { count: 1 } }
    });
    await sql`INSERT INTO email_delivery_events(id,provider,provider_event_id,provider_email_id,delivery_id,event_type,
      processing_status,payload_hash,provider_created_at)
      VALUES(${`extra-event-${nullable.suffix}`},'resend',${`extra-provider-event-${nullable.suffix}`},
        ${`provider-report-email-${nullable.suffix}`},NULL,'email.delivered','processed',${"8".repeat(64)},now())`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, nullable.input)).rejects.toThrow(/emailEventIds|at-most-once/u);

    const dual = await seedBaseline(sql, "email-dual");
    const dualDelivery = dual.reportDelivery, dualEvent = `event-${dual.suffix}`;
    await insertEmailEvent(sql, dual, dualEvent, dualDelivery);
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, dual.input))
      .resolves.toMatchObject({ allowedCommerceTopology: { emailEventIds: { count: 1 } } });
  }, 120_000);

  it("rejects real legacy/PDF, provider/qualification/four-snapshot, and post-payment snapshot persistence", async () => {
    const legacy = await seedBaseline(sql, "legacy");
    const legacyJob = `legacy-job-${legacy.suffix}`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason)
      VALUES(${legacyJob},${legacy.report},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,
        'combined_geo_report_v3',${legacy.questions},'en','standard')`;
    await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision_kind,revision,artifact_contract,status,
      payload_identity_hash,pdf_sha256,pdf_storage_key)
      VALUES(${`legacy-artifact-${legacy.suffix}`},${legacy.report},${legacy.order},${legacyJob},'generation',2,'combined_geo_report_v3',
        'pending','legacy',${"9".repeat(64)},${`private/${legacy.suffix}.pdf`})`;
    await sql`INSERT INTO report_source_forensics(id,report_id,job_id,report_version,fulfillment_methodology,product_contract,payload,
      authority_hash,provenance_hash,content_hash,is_private)
      VALUES(${`forensics-${legacy.suffix}`},${legacy.report},${legacyJob},2,'public_search_source_forensics_v1','recommendation_forensics_v1',
        '{}'::jsonb,${"a".repeat(64)},${"b".repeat(64)},${"c".repeat(64)},true)`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, legacy.input)).rejects.toThrow(/full_report_rerun_jobs|extra_job_rows|job scope/u);

    const historical = await seedBaseline(sql, "historical");
    await sql`INSERT INTO answer_snapshot_runs(id,report_id,job_id,locale,region,question_set_version,started_at)
      VALUES(${`run-${historical.suffix}`},${historical.report},${historical.core},'en','US','legacy-four-snapshot',now())`;
    const authorityId = `authority-${historical.suffix}`;
    const marketSnapshot = `market-${historical.suffix}`;
    const providerJob = `provider-job-${historical.suffix}`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason)
      VALUES(${providerJob},${historical.report},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,
        'combined_geo_report_v2',${historical.questions},'en','standard')`;
    await sql`INSERT INTO public_search_surface_authorities(authority_version,adapter_id,provider_id,product_id,model_id,adapter_version,
      surface_id,surface_version,environment,locale_capabilities,region_capabilities,terms_reviewed_at,evidence_references,captured_at,active)
      VALUES(${authorityId},'adapter','provider','product','model','v1','surface','v1','staging','["en"]'::jsonb,'["US"]'::jsonb,
        now(),'[]'::jsonb,now(),false)`;
    await sql`INSERT INTO market_snapshot_questions(id,cache_identity,normalized_question,question_hash,locale,region,surface_authority_version,
      surface_id,surface_version,fanout_version,snapshot_kind,query_plan_version,status,completion_version)
      VALUES(${marketSnapshot},${`cache-${historical.suffix}`},'provider question',${`hash-${historical.suffix}`},'en','US',${authorityId},
        'surface','v1','fanout-v1','provider_discovery','provider-v1','refreshing',1)`;
    const marketQuery = `query-${historical.suffix}`;
    await sql`INSERT INTO market_snapshot_queries(id,snapshot_id,query_order,query_text,query_hash,derivation_rule)
      VALUES(${marketQuery},${marketSnapshot},0,'provider query',${`query-hash-${historical.suffix}`},'test')`;
    await sql`INSERT INTO market_search_attempts(id,snapshot_id,query_id,authority_version,attempt_number,request_status,
      idempotency_reference,started_at,completed_at)
      VALUES(${`attempt-${historical.suffix}`},${marketSnapshot},${marketQuery},${authorityId},1,'succeeded',${`idem-${historical.suffix}`},now(),now())`;
    await sql`UPDATE market_snapshot_questions SET status='completed',query_fanout_hash=${"d".repeat(64)},completed_at=now()
      WHERE id=${marketSnapshot}`;
    await sql`INSERT INTO report_market_snapshot_refs(id,report_id,job_id,snapshot_id,cache_identity,evidence_cutoff,freshness_state,
      actual_cost_micros,allocated_cost_micros,avoided_cost_micros,binding_hash)
      VALUES(${`ref-${historical.suffix}`},${historical.report},${providerJob},${marketSnapshot},${`cache-${historical.suffix}`},now(),
        'fresh',0,0,0,${"e".repeat(64)})`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, historical.input)).rejects.toThrow(/full_report_rerun_jobs|provider_claim_snapshot_refs|job scope/u);

    const snapshot = await seedBaseline(sql, "postpay");
    const lateSnapshot = `late-snapshot-${snapshot.suffix}`;
    const exactPaidAt = snapshot.paidAt;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, snapshot.input)).resolves.toMatchObject({
      paidAt: snapshot.paidAt.toISOString()
    });
    await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,collector_config_identity_hash,created_at)
      VALUES(${lateSnapshot},${snapshot.report},${`late-${snapshot.suffix}.test`},'collecting',${exactPaidAt},${"f".repeat(64)},${exactPaidAt})`;
    await sql`INSERT INTO report_v4_site_snapshot_pages(id,snapshot_id,ordinal,normalized_url,analyzable,exclusion_reason,created_at)
      VALUES(${`late-page-${snapshot.suffix}`},${lateSnapshot},1,${`https://late-${snapshot.suffix}.test/`},false,'late',${exactPaidAt})`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, snapshot.input)).rejects.toThrow(/extra_site_snapshots_after_payment/u);
  }, 120_000);

  it("rejects scenario anchors that cross real job or artifact lineage", async () => {
    const foreignJob = await seedBaseline(sql, "cross-job", { scenarioCoreJob: "foreign" });
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, foreignJob.input)).rejects.toThrow(/order core job|core job report|config core-job lineage/u);

    const foreignArtifact = await seedBaseline(sql, "cross-artifact", { scenarioArtifact: "pre-job" });
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, foreignArtifact.input)).rejects.toThrow(/core artifact job|artifact scope/u);
  }, 120_000);

  it("rejects extra paid events and foreign-job credits even though the commerce snapshot contains them", async () => {
    const payment = await seedBaseline(sql, "extra-payment");
    await sql`INSERT INTO payment_events(id,provider,provider_event_id,event_type,order_id,provider_created_at,processed_at,
      processing_status,payload_hash,selected_fields)
      VALUES(${`extra-payment-${payment.suffix}`},'airwallex',${`extra-provider-${payment.suffix}`},'payment_intent.succeeded',
        ${payment.order},${payment.paidAt},now(),'processed',${"e".repeat(64)},'{}'::jsonb)`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, payment.input)).rejects.toThrow(/unique processed paid-order event/u);

    const credit = await seedBaseline(sql, "foreign-credit");
    const foreignJob = `foreign-credit-job-${credit.suffix}`;
    const foreignReport = `foreign-credit-report-${credit.suffix}`;
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
      VALUES(${foreignReport},${`https://foreign-credit-${credit.suffix}.test/`},${`foreign-credit-${credit.suffix}.test`},'en','completed')`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,reason)
      VALUES(${foreignJob},${foreignReport},'free','legacy_website_audit_v1','en','standard')`;
    await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status,settled_at)
      VALUES(${`foreign-credit-${credit.suffix}`},${credit.access},${credit.report},${foreignJob},${`foreign-idem-${credit.suffix}`},
        NULL,1,'settled',now())`;
    await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, credit.input)).rejects.toThrow(/unique settled core-job reservation|credit order lineage/u);
  }, 120_000);

  it("keeps one RR view stable while a concurrent forbidden row commits", async () => {
    const ids = await seedBaseline(sql, "rr");
    const writer = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin("isolation level repeatable read read only", async (tx) => {
        const firstCommerce = await loadReportV4CommerceAuthoritySnapshotInTransaction(tx, ids.input);
        const first = await loadReportV4ZeroDatabaseEffectsAuthorityInTransaction(tx, ids.input, firstCommerce);
        await writer`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
          VALUES(${`rr-token-${ids.suffix}`},${ids.report},'rr',${`rr-hmac-${ids.suffix}`},'combined_geo_report_v4',now()+interval '1 day')`;
        const second = await loadReportV4ZeroDatabaseEffectsAuthorityInTransaction(tx, ids.input, firstCommerce);
        expect(second.canonicalHash).toBe(first.canonicalHash);
      });
      await expect(loadReportV4ZeroDatabaseEffectsAuthority(sql, ids.input)).rejects.toThrow(/accessTokenIds|extra_access_token_rows/u);
    } finally { await writer.end({ timeout: 5 }); }
  }, 120_000);
});

async function seedBaseline(sql: ReturnType<typeof postgres>, label: string, options: {
  scenarioCoreJob?: "own" | "foreign";
  scenarioArtifact?: "own" | "pre-job";
} = {}) {
  const suffix = `${label}-${randomUUID().replaceAll("-", "")}`;
  const report = `report-${suffix}`, order = `order-${suffix}`, snapshot = `snapshot-${suffix}`;
  const pre = `pre-${suffix}`, core = `core-${suffix}`, questions = `questions-${suffix}`, artifact = `artifact-${suffix}`;
  const configHash = createHash("sha256").update(suffix).digest("hex"), config = `v4-config-${configHash}`;
  const access = `access-${suffix}`, credit = `credit-${suffix}`, session = randomUUID(), scenario = randomUUID();
  const paymentEvent = `payment-event-${suffix}`, paymentDelivery = `payment-email-${suffix}`;
  const reportDelivery = `report-email-${suffix}`, token = `token-${suffix}`;
  const paidAt = new Date(Date.now() - 3_600_000);
  const capturedAt = new Date(paidAt.getTime() - 3_600_000);
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${report},${`https://${suffix}.test/`},${`${suffix}.test`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,collector_config_identity_hash,created_at)
    VALUES(${snapshot},${report},${`${suffix}.test`},'collecting',${capturedAt},${"1".repeat(64)},${paidAt})`;
  await sql`INSERT INTO report_v4_site_snapshot_pages(id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,
    retained_cleaned_text,content_hash,created_at)
    VALUES(${`page-${suffix}`},${snapshot},1,${`https://${suffix}.test/`},true,'direct_readable','summary','retained text',
      ${"6".repeat(64)},${paidAt})`;
  await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=${capturedAt},content_identity_hash=${"2".repeat(64)},
    candidate_url_count=1,analyzable_page_count=1,excluded_page_count=0 WHERE id=${snapshot}`;
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,
    customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,
    refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status,refund_status,delivery_status,paid_at,delivery_deadline_at)
    VALUES(${order},${`checkout-${suffix}`},'airwallex',${report},${snapshot},${`${suffix}.test`},'encrypted',${`email-${suffix}`},'v1',
      'recommendation_forensics_v1','two_stage_geo_report_v4',4,'catalog','terms','refund','en','USD',100,'paid','completed','not_required',
      'not_queued',${paidAt},${new Date(paidAt.getTime() + 23 * 3_600_000)})`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining)
    VALUES(${access},'prefix',${`access-hmac-${suffix}`},${order},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,idempotency_key,payment_order_id,credits,status,reserved_at,settled_at)
    VALUES(${credit},${access},${report},${`credit-idem-${suffix}`},${order},1,'settled',now()-interval '1 hour',now()-interval '50 minutes')`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,
    neutralization_version,profile_evidence_identity)
    VALUES(${questions},${report},${order},1,'en','US','candidate','high','v1','v1','profile')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
    VALUES(${pre},${report},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`;
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
    artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,credit_reservation_id)
    VALUES(${core},${report},${snapshot},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${questions},
      'en','standard','completed','completed','terminalization',${credit})`;
  await sql`INSERT INTO job_dispatch_outbox(id,job_id,tier,state,attempts,published_at)
    VALUES(${`dispatch-${pre}`},${pre},'deep','published',1,now()),(${`dispatch-${core}`},${core},'deep','published',1,now())`;
  await sql`UPDATE credit_ledger SET job_id=${core} WHERE id=${credit}`;
  await sql`UPDATE payment_orders SET fulfillment_job_id=${core},business_question_set_id=${questions} WHERE id=${order}`;
  await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,
    model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${config},${report},${order},${core},${configHash},'model-test',${"a".repeat(64)},'{}'::jsonb,
      'report-test',${"b".repeat(64)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,
    config_snapshot_id,html_sha256,readiness,ready_at,activated_at)
    VALUES(${artifact},${report},${order},${core},'generation',1,'combined_geo_report_v4','active',${"3".repeat(64)},${config},${"4".repeat(64)},
      '{"htmlCanonical":true}'::jsonb,now()-interval '40 minutes',now()-interval '40 minutes')`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
    VALUES(${artifact},${report},${order},${core},${questions},'{}'::jsonb)`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${artifact} WHERE id=${report}`;
  await sql`INSERT INTO payment_events(id,provider,provider_event_id,event_type,order_id,provider_created_at,processed_at,
    processing_status,payload_hash,selected_fields)
    VALUES(${paymentEvent},'airwallex',${`provider-payment-${suffix}`},'payment_intent.succeeded',${order},${paidAt},now(),
      'processed',${"7".repeat(64)},'{}'::jsonb)`;
  await sql`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,
    provider_email_id,business_idempotency_key,state,attempts,sent_at,delivered_at)
    VALUES(${paymentDelivery},${order},${report},'payment_confirmed','v4','en','recipient','resend',
      ${`provider-payment-email-${suffix}`},${`payment-email-idem-${suffix}`},'delivered',1,now(),now()),
      (${reportDelivery},${order},${report},'report_ready','v4','en','recipient','resend',
      ${`provider-report-email-${suffix}`},${`report-email-idem-${suffix}`},'delivered',1,now(),now())`;
  await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
    VALUES(${token},${report},'v4',${`token-hmac-${suffix}`},'combined_geo_report_v4',now()+interval '1 day')`;
  await sql`INSERT INTO report_v4_acceptance_sessions(id,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
    VALUES(${session},${`preview-${suffix}`},${`https://${suffix}.preview.test`},${"5".repeat(40)},${"5".repeat(40)})`;
  let scenarioCore = core;
  if (options.scenarioCoreJob === "foreign") {
    scenarioCore = `foreign-core-${suffix}`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase)
      VALUES(${scenarioCore},${report},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
        'combined_geo_report_v4',${questions},'en','standard','completed','completed','terminalization')`;
  }
  let scenarioArtifact = artifact;
  if (options.scenarioArtifact === "pre-job") {
    scenarioArtifact = `cross-artifact-${suffix}`;
    await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision_kind,revision,artifact_contract,status,
      payload_identity_hash,html_sha256,readiness,ready_at)
      VALUES(${scenarioArtifact},${report},${order},${pre},'generation',2,'combined_geo_report_v4','ready',${"c".repeat(64)},
        ${"d".repeat(64)},'{"htmlCanonical":true}'::jsonb,now())`;
    await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
      VALUES(${scenarioArtifact},${report},${order},${pre},${questions},'{}'::jsonb)`;
  }
  await sql`INSERT INTO report_v4_acceptance_scenarios(id,session_id,kind,fault_kind,fault_question_id,expected_fault_occurrences,
    report_id,order_id,pre_admission_job_id,core_job_id,site_snapshot_id,config_snapshot_id,question_set_id,core_artifact_revision_id)
    VALUES(${scenario},${session},'question_failure','question_failure','q-1',2,${report},${order},${pre},${scenarioCore},
      ${snapshot},${config},${questions},${scenarioArtifact})`;
  const storedPaidAt = (await sql<{ paid_at: Date }[]>`SELECT paid_at FROM payment_orders WHERE id=${order}`)[0]!.paid_at;
  const input: LoadReportV4ZeroDatabaseEffectsAuthorityInput = {
    sessionId: session, scenarioId: scenario, phase: "baseline"
  };
  return { suffix, report, order, snapshot, pre, core, questions, artifact, access, credit, session, scenario, input,
    paidAt: storedPaidAt, paymentEvent, paymentDelivery, reportDelivery, token };
}

async function insertEmailEvent(sql: ReturnType<typeof postgres>, ids: Awaited<ReturnType<typeof seedBaseline>>,
  eventId: string, eventDeliveryId: string | null): Promise<void> {
  await sql`INSERT INTO email_delivery_events(id,provider,provider_event_id,provider_email_id,delivery_id,event_type,
    processing_status,payload_hash,provider_created_at)
    VALUES(${eventId},'resend',${`provider-event-${ids.suffix}`},${`provider-report-email-${ids.suffix}`},${eventDeliveryId},
      'email.delivered','processed',${"7".repeat(64)},now())`;
}

function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }

import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyReportV4PaidPaymentEvent,
  CommercialOrderConflictError,
  createReportV4PaymentOrder,
  getActiveReportV4PaymentOrderForReport
} from "./commercial-orders";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v4_commerce_${randomUUID().replaceAll("-", "")}`;
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  tokenHashSecret: process.env.OGC_TOKEN_HASH_SECRET
};

// @requirement GEO-V4-CRAWL-04
// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-LEGACY-01
// @requirement GEO-V4-PDF-01
describeDisposablePostgres("V4 checkout and verified paid-event PostgreSQL boundary", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.OGC_TOKEN_HASH_SECRET = "v4-commerce-test-token-hash-secret-at-least-32-chars";
    await initializeDatabaseEnvironment("staging");
    await seedCheckoutFixture("main", "completed");
    await seedCheckoutFixture("legacy", "completed_limited");
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    restoreEnvironment("DATABASE_URL", originalEnvironment.databaseUrl);
    restoreEnvironment("OGC_DEPLOYMENT_PROFILE", originalEnvironment.deploymentProfile);
    restoreEnvironment("OGC_TOKEN_HASH_SECRET", originalEnvironment.tokenHashSecret);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("binds checkout to the unique eligible snapshot and creates one exact V4 core job from a verified event", async () => {
    const input = orderInput("main");
    const firstOrder = await createReportV4PaymentOrder(input);
    const repeatedOrder = await createReportV4PaymentOrder(input);

    expect(repeatedOrder.id).toBe(firstOrder.id);
    expect(firstOrder).toMatchObject({
      reportId: "report-main",
      siteSnapshotId: "snapshot-main",
      productCode: "recommendation_forensics_v1",
      fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4,
      paymentStatus: "created",
      fulfillmentJobId: null
    });
    await expect(getActiveReportV4PaymentOrderForReport("report-main")).resolves.toMatchObject({ id: firstOrder.id });

    const eventInput = {
      provider: "airwallex" as const,
      providerEventId: "event-v4-main",
      eventType: "payment_intent.succeeded",
      orderId: firstOrder.id,
      providerPaymentId: "int-v4-main",
      providerCreatedAt: new Date("2026-07-17T00:00:00.000Z"),
      payloadHash: hash("event-v4-main"),
      selectedFields: { providerStatus: "SUCCEEDED" }
    };
    const paid = await applyReportV4PaidPaymentEvent(eventInput);
    const duplicate = await applyReportV4PaidPaymentEvent(eventInput);

    expect(duplicate).toMatchObject({ duplicate: true, jobId: paid.jobId, dispatchId: paid.dispatchId, emailDeliveryId: paid.emailDeliveryId });
    const [state] = await getSqlClient()<Array<{
      payment_status: string; fulfillment_status: string; fulfillment_job_id: string;
      site_snapshot_id: string; tier: string; product_contract: string; fulfillment_methodology: string;
      recommendation_report_version: number; artifact_contract: string; business_question_set_id: string;
      reason: string; correction_id: string | null; replacement_fulfillment_id: string | null;
      event_count: number; job_count: number; credit_count: number; access_count: number;
      dispatch_count: number; email_count: number; artifact_count: number;
    }>>`
      SELECT orders.payment_status,orders.fulfillment_status,orders.fulfillment_job_id,
        jobs.site_snapshot_id,jobs.tier,jobs.product_contract,jobs.fulfillment_methodology,
        jobs.recommendation_report_version,jobs.artifact_contract,jobs.business_question_set_id,
        jobs.reason,jobs.correction_id,jobs.replacement_fulfillment_id,
        (SELECT count(*)::int FROM payment_events WHERE order_id=orders.id) event_count,
        (SELECT count(*)::int FROM scan_jobs WHERE id=orders.fulfillment_job_id) job_count,
        (SELECT count(*)::int FROM credit_ledger WHERE payment_order_id=orders.id) credit_count,
        (SELECT count(*)::int FROM access_keys WHERE payment_order_id=orders.id) access_count,
        (SELECT count(*)::int FROM job_dispatch_outbox WHERE job_id=orders.fulfillment_job_id) dispatch_count,
        (SELECT count(*)::int FROM email_deliveries WHERE order_id=orders.id) email_count,
        (SELECT count(*)::int FROM report_artifact_revisions WHERE job_id=orders.fulfillment_job_id) artifact_count
      FROM payment_orders orders JOIN scan_jobs jobs ON jobs.id=orders.fulfillment_job_id
      WHERE orders.id=${firstOrder.id}
    `;
    expect(state).toEqual({
      payment_status: "paid",
      fulfillment_status: "queued",
      fulfillment_job_id: paid.jobId,
      site_snapshot_id: "snapshot-main",
      tier: "deep",
      product_contract: "recommendation_forensics_v1",
      fulfillment_methodology: "two_stage_geo_report_v4",
      recommendation_report_version: 4,
      artifact_contract: "combined_geo_report_v4",
      business_question_set_id: "questions-main",
      reason: "standard",
      correction_id: null,
      replacement_fulfillment_id: null,
      event_count: 1,
      job_count: 1,
      credit_count: 1,
      access_count: 1,
      dispatch_count: 1,
      email_count: 1,
      artifact_count: 0
    });
  }, 120_000);

  it("does not reuse a V2 order with the same checkout idempotency identity as a V4 order", async () => {
    await getSqlClient()`INSERT INTO payment_orders
      (id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,
       email_key_version,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,
       catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
      VALUES('legacy-v2-order','checkout-legacy','airwallex','report-legacy','legacy.example','cipher','email-legacy',
       'v1','recommendation_forensics_v1',NULL,'public_search_source_forensics_v1',2,'v4','v4','v4','en','USD',2900)`;

    await expect(createReportV4PaymentOrder(orderInput("legacy"))).rejects.toBeInstanceOf(CommercialOrderConflictError);
    await expect(getActiveReportV4PaymentOrderForReport("report-legacy")).resolves.toBeNull();
    const [order] = await getSqlClient()<Array<{ fulfillment_methodology: string; recommendation_report_version: number; site_snapshot_id: string | null }>>`
      SELECT fulfillment_methodology,recommendation_report_version,site_snapshot_id
      FROM payment_orders WHERE id='legacy-v2-order'`;
    expect(order).toEqual({
      fulfillment_methodology: "public_search_source_forensics_v1",
      recommendation_report_version: 2,
      site_snapshot_id: null
    });
  });
});

async function seedCheckoutFixture(suffix: string, status: "completed" | "completed_limited"): Promise<void> {
  const sql = getSqlClient();
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${`report-${suffix}`},${`https://${suffix}.example/`},${`${suffix}.example`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
     candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${`snapshot-${suffix}`},${`report-${suffix}`},${`${suffix}.example`},${status},now(),now(),
     ${hash(`collector-${suffix}`)},${hash(`content-${suffix}`)},${status === "completed" ? 1 : 2},1,${status === "completed" ? 0 : 1})`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,
     neutralization_version,profile_evidence_identity)
    VALUES(${`questions-${suffix}`},${`report-${suffix}`},1,'en','US','candidate','high',false,'v4','v4',${`profile-${suffix}`})`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`question-${suffix}-${ordinal}`},${`questions-${suffix}`},${ordinal},
       ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
       ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Neutral ${ordinal}?`},${hash(`question-${suffix}-${ordinal}`)})`;
  }
  await sql`UPDATE report_business_question_sets SET status='confirmed',confirmed_at=now(),
    content_hash=${hash(`private-${suffix}`)},neutral_content_hash=${hash(`neutral-${suffix}`)},payload='{}'::jsonb
    WHERE id=${`questions-${suffix}`}`;
}

function orderInput(suffix: string) {
  return {
    checkoutIdempotencyHmac: `checkout-${suffix}`,
    provider: "airwallex" as const,
    reportId: `report-${suffix}`,
    siteKey: `${suffix}.example`,
    customerEmailEncrypted: "cipher",
    customerEmailHmac: `email-${suffix}`,
    emailKeyVersion: "v1",
    businessQuestionSetId: `questions-${suffix}`,
    catalogVersion: "v4",
    termsVersion: "v4",
    refundPolicyVersion: "v4",
    reportLocale: "en" as const,
    currency: "USD" as const,
    amountMinor: 2900
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

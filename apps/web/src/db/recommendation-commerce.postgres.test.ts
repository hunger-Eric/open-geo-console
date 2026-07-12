import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { terminalizeScanJob } from "./jobs";
import { recordPaidJobOutcome } from "./commercial-refunds";
import { applyPaidPaymentEvent, finalizeLegacyUnpaidOrderRetirement } from "./commercial-orders";

const enabled = Boolean(process.env.DATABASE_URL && process.env.OGC_DEPLOYMENT_PROFILE === "staging");
const describePostgres = enabled ? describe : describe.skip;

describePostgres("recommendation commercial terminal matrix", () => {
  const suffix = randomUUID();
  const records = ["completed", "completed_limited", "failed"].map((stage) => ({
    stage: stage as "completed" | "completed_limited" | "failed",
    reportId: `commerce-report-${stage}-${suffix}`,
    jobId: `commerce-job-${stage}-${suffix}`,
    orderId: `commerce-order-${stage}-${suffix}`,
    accessId: `commerce-access-${stage}-${suffix}`,
    creditId: `commerce-credit-${stage}-${suffix}`
  }));

  beforeAll(async () => {
    await ensureDatabase();
    const sql = getSqlClient();
    for (const row of records) {
      await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${row.reportId},'https://example.com','example.com','en','completed')`;
      await sql`INSERT INTO access_keys (id,key_prefix,key_hmac,status,credits_remaining) VALUES (${row.accessId},'matrix',${`hmac-${row.accessId}`},'exhausted',0)`;
      await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage,lease_owner,lease_expires_at,credit_reservation_id) VALUES (${row.jobId},${row.reportId},'deep','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',1,'en','synthesizing',${`worker-${row.stage}`},now()+interval '10 minutes',${row.creditId})`;
      await sql`INSERT INTO payment_orders (id,checkout_idempotency_hmac,provider,provider_payment_id,report_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status,paid_at) VALUES (${row.orderId},${`checkout-${row.orderId}`},'airwallex',${`int-${row.orderId}`},${row.reportId},${row.jobId},'example.com','encrypted','email-hmac','v1','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',1,'v1','v1','v1','en','USD',2900,'paid','processing',now())`;
      await sql`INSERT INTO credit_ledger (id,access_key_id,report_id,idempotency_key,payment_order_id,job_id,credits,status) VALUES (${row.creditId},${row.accessId},${row.reportId},${`credit-${row.orderId}`},${row.orderId},${row.jobId},1,'reserved')`;
    }
  }, 120_000);

  afterAll(async () => {
    const sql = getSqlClient();
    for (const row of records) {
      await sql`DELETE FROM email_deliveries WHERE order_id=${row.orderId}`;
      await sql`DELETE FROM payment_refunds WHERE order_id=${row.orderId}`;
      await sql`DELETE FROM credit_ledger WHERE id=${row.creditId}`;
      await sql`DELETE FROM payment_orders WHERE id=${row.orderId}`;
      await sql`DELETE FROM access_keys WHERE id=${row.accessId}`;
      await sql`DELETE FROM scan_reports WHERE id=${row.reportId}`;
    }
    await closeDatabase();
  }, 120_000);

  it.each(records)("atomically terminalizes and reconciles $stage", async (row) => {
    const workerId = `worker-${row.stage}`;
    await terminalizeScanJob(row.jobId, workerId, { stage: row.stage, coverage: { plannedPages: 4, successfulPages: row.stage === "failed" ? 0 : 4, failedPages: 0 }, ...(row.stage === "failed" ? { error: { code: "forensics_failed", publicMessage: "Unavailable." } } : {}) });
    const [first, second] = await Promise.all([
      recordPaidJobOutcome({ jobId: row.jobId, outcome: row.stage }),
      recordPaidJobOutcome({ jobId: row.jobId, outcome: row.stage })
    ]);
    expect(second).toEqual(first);
    const state = (await getSqlClient()<Array<{ credit_status: string; fulfillment_status: string; refund_count: number }>>`
      SELECT ledger.status credit_status, orders.fulfillment_status,
        (SELECT count(*)::integer FROM payment_refunds refunds WHERE refunds.order_id=orders.id) refund_count
      FROM credit_ledger ledger JOIN payment_orders orders ON orders.id=ledger.payment_order_id
      WHERE ledger.id=${row.creditId}
    `)[0]!;
    expect(state.credit_status).toBe(row.stage === "completed" ? "settled" : "refunded");
    expect(state.fulfillment_status).toBe(row.stage);
    expect(state.refund_count).toBe(row.stage === "completed" ? 0 : 1);
  }, 120_000);
});

describePostgres("retired legacy paid event", () => {
  const suffix = randomUUID();
  const reportId = `retired-report-${suffix}`;
  const preReportId = `precutoff-report-${suffix}`;
  const orderId = `retired-order-${suffix}`;
  const preCutoffOrderId = `precutoff-order-${suffix}`;
  const raceReportId = `race-report-${suffix}`;
  const raceOrderId = `race-order-${suffix}`;

  beforeAll(async () => {
    await ensureDatabase();
    await getSqlClient()`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${reportId},'https://example.com','example.com','en','completed')`;
    await getSqlClient()`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${preReportId},'https://example.org','example.org','en','completed')`;
    await getSqlClient()`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${raceReportId},'https://race.example','race.example','en','completed')`;
    await getSqlClient()`INSERT INTO payment_orders (id,checkout_idempotency_hmac,provider,provider_checkout_id,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,legacy_retirement_cutoff_at,legacy_retired_at) VALUES (${orderId},${`checkout-${orderId}`},'airwallex',${`legacy-link-${suffix}`},${reportId},'example.com','encrypted','email-hmac','v1','deep_report_v1','v1','v1','v1','en','USD',2900,'cancelled','2030-01-01T00:00:00Z','2030-01-01T00:01:00Z')`;
    await getSqlClient()`INSERT INTO payment_orders (id,checkout_idempotency_hmac,provider,provider_checkout_id,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,legacy_retirement_cutoff_at) VALUES (${preCutoffOrderId},${`checkout-${preCutoffOrderId}`},'airwallex',${`legacy-link-pre-${suffix}`},${preReportId},'example.org','encrypted','email-hmac-2','v1','deep_report_v1','v1','v1','v1','en','USD',2900,'pending','2030-01-01T00:00:00Z')`;
    await getSqlClient()`INSERT INTO payment_orders (id,checkout_idempotency_hmac,provider,provider_checkout_id,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,legacy_retirement_cutoff_at) VALUES (${raceOrderId},${`checkout-${raceOrderId}`},'airwallex',${`legacy-link-race-${suffix}`},${raceReportId},'race.example','encrypted','email-hmac-3','v1','deep_report_v1','v1','v1','v1','en','USD',2900,'pending','2030-01-01T00:00:00Z')`;
  }, 120_000);

  afterAll(async () => {
    const sql=getSqlClient();
    const preJob = (await sql<{ fulfillment_job_id: string | null }[]>`SELECT fulfillment_job_id FROM payment_orders WHERE id=${preCutoffOrderId}`)[0]?.fulfillment_job_id;
    await sql`DELETE FROM email_deliveries WHERE order_id IN (${orderId},${preCutoffOrderId},${raceOrderId})`;
    await sql`DELETE FROM credit_ledger WHERE payment_order_id IN (${orderId},${preCutoffOrderId},${raceOrderId})`;
    await sql`DELETE FROM access_keys WHERE payment_order_id IN (${orderId},${preCutoffOrderId},${raceOrderId})`;
    await sql`DELETE FROM payment_events WHERE order_id=${orderId}`;
    await sql`DELETE FROM payment_events WHERE order_id=${preCutoffOrderId}`;
    await sql`DELETE FROM payment_events WHERE order_id=${raceOrderId}`;
    await sql`DELETE FROM payment_refunds WHERE order_id IN (${orderId},${preCutoffOrderId},${raceOrderId})`;
    await sql`DELETE FROM payment_orders WHERE id IN (${orderId},${preCutoffOrderId},${raceOrderId})`;
    if (preJob) await sql`DELETE FROM scan_jobs WHERE id=${preJob}`;
    await sql`DELETE FROM scan_reports WHERE id=${reportId}`;
    await sql`DELETE FROM scan_reports WHERE id=${preReportId}`;
    await sql`DELETE FROM scan_reports WHERE id=${raceReportId}`;
    await closeDatabase();
  }, 120_000);

  it("persists late payment and refund without creating entitlement or job", async () => {
    const result = await applyPaidPaymentEvent({ provider: "airwallex", providerEventId: `evt-${suffix}`, eventType: "payment.succeeded", orderId, providerPaymentId: `int-${suffix}`, providerCreatedAt: new Date("2030-01-01T00:02:00Z"), payloadHash: `hash-${suffix}` });
    expect(result).toMatchObject({ retiredRefund: true });
    const duplicate = await applyPaidPaymentEvent({ provider: "airwallex", providerEventId: `evt-${suffix}`, eventType: "payment.succeeded", orderId, providerPaymentId: `int-${suffix}`, providerCreatedAt: new Date("2030-01-01T00:02:00Z"), payloadHash: `hash-${suffix}` });
    expect(duplicate).toMatchObject({ retiredRefund: true, duplicate: true, refundId: (result as { refundId: string }).refundId });
    const counts = (await getSqlClient()<Array<{ access_count: number; job_count: number; refund_count: number }>>`
      SELECT (SELECT count(*)::integer FROM access_keys WHERE payment_order_id=${orderId}) access_count,
             (SELECT count(*)::integer FROM scan_jobs WHERE id=(SELECT fulfillment_job_id FROM payment_orders WHERE id=${orderId})) job_count,
             (SELECT count(*)::integer FROM payment_refunds WHERE order_id=${orderId}) refund_count
    `)[0]!;
    expect(counts).toEqual({ access_count: 0, job_count: 0, refund_count: 1 });
  }, 120_000);

  it("continues exactly-once legacy fulfillment for a signed payment created before cutoff", async () => {
    const original = process.env.OGC_TOKEN_HASH_SECRET;
    process.env.OGC_TOKEN_HASH_SECRET = "test-token-hash-secret-with-at-least-32-characters";
    try {
      const result = await applyPaidPaymentEvent({ provider: "airwallex", providerEventId: `evt-pre-${suffix}`, eventType: "payment.succeeded", orderId: preCutoffOrderId, providerPaymentId: `int-pre-${suffix}`, providerCreatedAt: new Date("2029-12-31T23:59:00Z"), payloadHash: `hash-pre-${suffix}` });
      expect(result).not.toHaveProperty("retiredRefund");
      expect((result as { jobId: string }).jobId).toBeTruthy();
      const job = (await getSqlClient()<Array<{ product_contract: string }>>`SELECT product_contract FROM scan_jobs WHERE id=${(result as { jobId: string }).jobId}`)[0];
      expect(job?.product_contract).toBe("legacy_website_audit_v1");
    } finally {
      if (original === undefined) delete process.env.OGC_TOKEN_HASH_SECRET; else process.env.OGC_TOKEN_HASH_SECRET = original;
    }
  }, 120_000);

  it("copies the order methodology exactly into the Webhook-created job", async () => {
    const methodReportId = `report-method-${suffix}`;
    const methodOrderId = `order-method-${suffix}`;
    const original = process.env.OGC_TOKEN_HASH_SECRET;
    process.env.OGC_TOKEN_HASH_SECRET = "test-token-hash-secret-with-at-least-32-characters";
    try {
      await getSqlClient()`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${methodReportId},'https://method.example','method.example','en','completed')`;
      await getSqlClient()`INSERT INTO payment_orders (id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status) VALUES (${methodOrderId},${`checkout-${methodOrderId}`},'airwallex',${methodReportId},'method.example','encrypted','method-email-hmac','v1','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',1,'v1','v1','v1','en','USD',2900,'pending')`;
      const result = await applyPaidPaymentEvent({ provider: "airwallex", providerEventId: `evt-method-${suffix}`, eventType: "payment.succeeded", orderId: methodOrderId, providerPaymentId: `int-method-${suffix}`, providerCreatedAt: new Date("2030-01-01T00:02:00Z"), payloadHash: `hash-method-${suffix}` });
      const job = (await getSqlClient()<Array<{ fulfillment_methodology: string | null; recommendation_report_version: number | null }>>`SELECT fulfillment_methodology,recommendation_report_version FROM scan_jobs WHERE id=${(result as { jobId: string }).jobId}`)[0];
      expect(job).toMatchObject({ fulfillment_methodology: "answer_engine_recommendation_forensics_v1", recommendation_report_version: 1 });
    } finally {
      const job = (await getSqlClient()<Array<{ fulfillment_job_id: string | null }>>`SELECT fulfillment_job_id FROM payment_orders WHERE id=${methodOrderId}`)[0]?.fulfillment_job_id;
      await getSqlClient()`DELETE FROM email_deliveries WHERE order_id=${methodOrderId}`;
      await getSqlClient()`DELETE FROM job_dispatch_outbox WHERE job_id=${job ?? ""}`;
      await getSqlClient()`DELETE FROM credit_ledger WHERE payment_order_id=${methodOrderId}`;
      await getSqlClient()`DELETE FROM access_keys WHERE payment_order_id=${methodOrderId}`;
      await getSqlClient()`DELETE FROM payment_events WHERE order_id=${methodOrderId}`;
      await getSqlClient()`DELETE FROM payment_orders WHERE id=${methodOrderId}`;
      if (job) await getSqlClient()`DELETE FROM scan_jobs WHERE id=${job}`;
      await getSqlClient()`DELETE FROM scan_reports WHERE id=${methodReportId}`;
      if (original === undefined) delete process.env.OGC_TOKEN_HASH_SECRET; else process.env.OGC_TOKEN_HASH_SECRET = original;
    }
  }, 120_000);

  it("resolves retirement versus late-payment competition to one refund and no job", async () => {
    const paid = applyPaidPaymentEvent({ provider: "airwallex", providerEventId: `evt-race-${suffix}`, eventType: "payment.succeeded", orderId: raceOrderId, providerPaymentId: `int-race-${suffix}`, providerCreatedAt: new Date("2030-01-01T00:02:00Z"), payloadHash: `hash-race-${suffix}` });
    const retired = finalizeLegacyUnpaidOrderRetirement(raceOrderId, new Date("2030-01-01T00:00:00Z"));
    const [result] = await Promise.all([paid, retired]);
    expect(result).toMatchObject({ retiredRefund: true });
    const state = (await getSqlClient()<Array<{ refund_count: number; fulfillment_job_id: string | null }>>`
      SELECT (SELECT count(*)::integer FROM payment_refunds WHERE order_id=orders.id) refund_count, fulfillment_job_id
      FROM payment_orders orders WHERE id=${raceOrderId}
    `)[0]!;
    expect(state).toEqual({ refund_count: 1, fulfillment_job_id: null });
  }, 120_000);
});

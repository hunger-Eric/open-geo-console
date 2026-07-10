import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import {
  paymentRefunds,
  type PaymentOrderRow,
  type PaymentRefundReason,
  type PaymentRefundRow
} from "./schema";
import { getPaymentOrder } from "./commercial-orders";

const TERMINAL_EMAIL_TEMPLATE_VERSION = "v1";

export async function getPaymentRefund(id: string): Promise<PaymentRefundRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(paymentRefunds).where(eq(paymentRefunds.id, id)).limit(1);
  return row ?? null;
}

export async function getPaymentRefundByOrderId(orderId: string): Promise<PaymentRefundRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.orderId, orderId))
    .limit(1);
  return row ?? null;
}

export async function getPaymentRefundByProviderRefundId(providerRefundId: string): Promise<PaymentRefundRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.providerRefundId, providerRefundId))
    .limit(1);
  return row ?? null;
}

export async function createRefundIntentForOrder(input: {
  orderId: string;
  reason: PaymentRefundReason;
  courtesyNonBillable?: boolean;
}): Promise<PaymentRefundRow> {
  if (!input.orderId) throw new Error("The payment order ID is required.");
  await ensureDatabase();
  const refundId = randomUUID();
  await getSqlClient().begin(async (tx) => {
    const orders = await tx<Array<{
      id: string;
      provider: PaymentRefundRow["provider"];
      payment_status: string;
      refund_status: string;
      amount_minor: number;
      currency: PaymentRefundRow["currency"];
    }>>`
      SELECT id, provider, payment_status, refund_status, amount_minor, currency
      FROM payment_orders WHERE id = ${input.orderId} FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("The payment order does not exist.");
    if (order.payment_status !== "paid") throw new Error("Only a paid order can be refunded.");
    if (order.refund_status === "refunded") return;
    await tx`
      INSERT INTO payment_refunds
        (id, order_id, provider, reason, amount_minor, currency, state, idempotency_key)
      VALUES
        (${refundId}, ${order.id}, ${order.provider}, ${input.reason}, ${order.amount_minor},
         ${order.currency}, 'pending', ${`full_refund/${order.id}`})
      ON CONFLICT (order_id) DO NOTHING
    `;
    await tx`
      UPDATE payment_orders
      SET refund_status = CASE WHEN refund_status = 'not_required' THEN 'pending' ELSE refund_status END,
          courtesy_non_billable = courtesy_non_billable OR ${input.courtesyNonBillable ?? false},
          updated_at = now()
      WHERE id = ${order.id}
    `;
  });
  const rows = await getSqlClient()<{ id: string }[]>`
    SELECT id FROM payment_refunds WHERE order_id = ${input.orderId} LIMIT 1
  `;
  return (await getPaymentRefund(rows[0]!.id))!;
}

export async function find20hWarningOrders(now = new Date()): Promise<PaymentOrderRow[]> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    SELECT id FROM payment_orders
    WHERE payment_status = 'paid'
      AND fulfillment_status NOT IN ('completed','completed_limited','failed')
      AND courtesy_non_billable = false
      AND delivery_deadline_at > ${now.toISOString()}
      AND delivery_deadline_at <= ${new Date(now.getTime() + 4 * 60 * 60 * 1000).toISOString()}
    ORDER BY delivery_deadline_at, id
  `;
  const orders: PaymentOrderRow[] = [];
  for (const row of rows) {
    const order = await getPaymentOrder(row.id);
    if (order) orders.push(order);
  }
  return orders;
}

export async function findOverduePaidOrders(now = new Date()): Promise<PaymentOrderRow[]> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    SELECT id FROM payment_orders
    WHERE payment_status = 'paid'
      AND fulfillment_status NOT IN ('completed','completed_limited','failed')
      AND courtesy_non_billable = false
      AND delivery_deadline_at <= ${now.toISOString()}
    ORDER BY delivery_deadline_at, id
  `;
  const orders: PaymentOrderRow[] = [];
  for (const row of rows) {
    const order = await getPaymentOrder(row.id);
    if (order) orders.push(order);
  }
  return orders;
}

export async function expirePaidOrderSla(orderId: string, now = new Date()): Promise<{
  expired: boolean;
  orderId: string;
  refundId: string | null;
  internalCreditRefunded: boolean;
}> {
  if (!orderId) throw new Error("The payment order ID is required.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const orders = await tx<Array<{
      id: string;
      provider: PaymentRefundRow["provider"];
      amount_minor: number;
      currency: PaymentRefundRow["currency"];
      payment_status: string;
      fulfillment_status: string;
      refund_status: string;
      courtesy_non_billable: boolean;
      delivery_deadline_at: string | Date | null;
      fulfillment_job_id: string | null;
    }>>`
      SELECT id, provider, amount_minor, currency, payment_status, fulfillment_status,
             refund_status, courtesy_non_billable, delivery_deadline_at, fulfillment_job_id
      FROM payment_orders WHERE id = ${orderId} FOR UPDATE
    `;
    const order = orders[0];
    if (!order) throw new Error("The payment order does not exist.");
    if (order.courtesy_non_billable) {
      const existing = await tx<{ id: string }[]>`SELECT id FROM payment_refunds WHERE order_id = ${order.id}`;
      return { expired: true, orderId: order.id, refundId: existing[0]?.id ?? null, internalCreditRefunded: false };
    }
    const deadline = order.delivery_deadline_at ? new Date(order.delivery_deadline_at) : null;
    if (order.payment_status !== "paid"
      || !deadline
      || deadline > now
      || ["completed", "completed_limited", "failed"].includes(order.fulfillment_status)) {
      return { expired: false, orderId: order.id, refundId: null, internalCreditRefunded: false };
    }

    if (order.fulfillment_job_id) {
      const jobs = await tx<{ stage: string; credit_reservation_id: string | null }[]>`
        SELECT stage, credit_reservation_id FROM scan_jobs
        WHERE id = ${order.fulfillment_job_id} FOR UPDATE
      `;
      const job = jobs[0];
      if (!job || ["completed", "completed_limited", "failed"].includes(job.stage)) {
        return { expired: false, orderId: order.id, refundId: null, internalCreditRefunded: false };
      }
    }

    const insertedRefundId = randomUUID();
    await tx`
      INSERT INTO payment_refunds
        (id, order_id, provider, reason, amount_minor, currency, state, idempotency_key)
      VALUES
        (${insertedRefundId}, ${order.id}, ${order.provider}, 'sla_missed', ${order.amount_minor},
         ${order.currency}, 'pending', ${`full_refund/${order.id}`})
      ON CONFLICT (order_id) DO NOTHING
    `;
    const refunds = await tx<{ id: string }[]>`
      SELECT id FROM payment_refunds WHERE order_id = ${order.id}
    `;
    const creditRows = await tx<{ id: string }[]>`
      UPDATE credit_ledger
      SET status = 'refunded', refunded_at = COALESCE(refunded_at, now()), settled_at = NULL
      WHERE payment_order_id = ${order.id} AND status = 'reserved'
      RETURNING id
    `;
    if (order.fulfillment_job_id) {
      await tx`
        UPDATE scan_jobs SET credit_reservation_id = NULL, updated_at = now()
        WHERE id = ${order.fulfillment_job_id}
          AND credit_reservation_id IN (
            SELECT id FROM credit_ledger WHERE payment_order_id = ${order.id}
          )
      `;
    }
    await tx`
      UPDATE payment_orders
      SET refund_status = CASE WHEN refund_status = 'not_required' THEN 'pending' ELSE refund_status END,
          courtesy_non_billable = true, updated_at = now()
      WHERE id = ${order.id}
    `;
    return {
      expired: true,
      orderId: order.id,
      refundId: refunds[0]!.id,
      internalCreditRefunded: creditRows.length === 1
    };
  });
}

export async function recordPaidJobOutcome(input: {
  jobId: string;
  outcome: "completed" | "completed_limited" | "failed";
  reason?: PaymentRefundReason;
}): Promise<{ orderId: string; refundId: string | null; emailDeliveryId: string } | null> {
  if (!input.jobId) throw new Error("The paid job ID is required.");
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const orders = await tx<Array<{
      id: string;
      report_id: string;
      report_locale: "en" | "zh";
      provider: PaymentRefundRow["provider"];
      amount_minor: number;
      currency: PaymentRefundRow["currency"];
      fulfillment_status: string;
      refund_status: string;
      job_stage: string;
    }>>`
      SELECT orders.id, orders.report_id, orders.report_locale, orders.provider,
             orders.amount_minor, orders.currency, orders.fulfillment_status,
             orders.refund_status, jobs.stage AS job_stage
      FROM payment_orders orders
      JOIN scan_jobs jobs ON jobs.id = orders.fulfillment_job_id
      WHERE orders.fulfillment_job_id = ${input.jobId} AND orders.payment_status = 'paid'
      FOR UPDATE
    `;
    const order = orders[0];
    if (!order) return null;
    if (order.job_stage !== input.outcome) {
      throw new Error("The persisted scan job does not match the requested commercial outcome.");
    }
    if (["completed", "completed_limited", "failed"].includes(order.fulfillment_status)
      && order.fulfillment_status !== input.outcome) {
      throw new Error("The paid order already has another terminal fulfillment outcome.");
    }

    const templateType = input.outcome === "completed"
      ? "report_ready"
      : input.outcome === "completed_limited"
        ? "limited_report_refund"
        : "report_failed_refund";
    const emailBusinessKey = `${templateType}/${order.id}/${TERMINAL_EMAIL_TEMPLATE_VERSION}`;
    const emailId = randomUUID();
    let refundId: string | null = null;
    if (input.outcome !== "completed") {
      const reason = input.reason ?? (input.outcome === "completed_limited" ? "completed_limited" : "report_failed");
      await tx`
        INSERT INTO payment_refunds
          (id, order_id, provider, reason, amount_minor, currency, state, idempotency_key)
        VALUES
          (${randomUUID()}, ${order.id}, ${order.provider}, ${reason}, ${order.amount_minor},
           ${order.currency}, 'pending', ${`full_refund/${order.id}`})
        ON CONFLICT (order_id) DO NOTHING
      `;
      const refunds = await tx<{ id: string }[]>`
        SELECT id FROM payment_refunds WHERE order_id = ${order.id}
      `;
      refundId = refunds[0]!.id;
    }

    await tx`
      INSERT INTO email_deliveries
        (id, order_id, report_id, template_type, template_version, locale,
         recipient_ref, provider, business_idempotency_key, state)
      VALUES
        (${emailId}, ${order.id}, ${order.report_id}, ${templateType}, ${TERMINAL_EMAIL_TEMPLATE_VERSION},
         ${order.report_locale}, ${order.id}, 'resend', ${emailBusinessKey}, 'queued')
      ON CONFLICT (business_idempotency_key) DO NOTHING
    `;
    const emails = await tx<{ id: string }[]>`
      SELECT id FROM email_deliveries WHERE business_idempotency_key = ${emailBusinessKey}
    `;
    await tx`
      UPDATE payment_orders
      SET fulfillment_status = ${input.outcome}, fulfilled_at = COALESCE(fulfilled_at, now()),
          refund_status = CASE
            WHEN ${input.outcome} = 'completed' THEN refund_status
            WHEN refund_status = 'not_required' THEN 'pending'
            ELSE refund_status
          END,
          delivery_status = CASE WHEN delivery_status = 'not_queued' THEN 'queued' ELSE delivery_status END,
          updated_at = now()
      WHERE id = ${order.id}
    `;
    return { orderId: order.id, refundId, emailDeliveryId: emails[0]!.id };
  });
}

export async function reconcilePaidJobOutcomes(limit = 100): Promise<{
  inspected: number;
  reconciled: number;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Commercial outcome reconciliation limit must be between 1 and 1000.");
  }
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{
    job_id: string;
    stage: "completed" | "completed_limited" | "failed";
  }>>`
    SELECT jobs.id AS job_id, jobs.stage
    FROM payment_orders orders
    JOIN scan_jobs jobs ON jobs.id = orders.fulfillment_job_id
    WHERE orders.payment_status = 'paid'
      AND jobs.stage IN ('completed','completed_limited','failed')
      AND orders.fulfillment_status NOT IN ('completed','completed_limited','failed')
    ORDER BY jobs.updated_at, jobs.id
    LIMIT ${limit}
  `;
  let reconciled = 0;
  for (const row of rows) {
    if (await recordPaidJobOutcome({ jobId: row.job_id, outcome: row.stage })) reconciled += 1;
  }
  return { inspected: rows.length, reconciled };
}

export async function claimPendingRefunds(input: {
  owner: string;
  limit?: number;
  leaseSeconds?: number;
}): Promise<PaymentRefundRow[]> {
  const limit = input.limit ?? 10;
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (!input.owner || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("A refund lease owner and a limit between 1 and 100 are required.");
  }
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10) {
    throw new Error("Refund lease seconds must be an integer of at least 10.");
  }
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE payment_refunds
    SET lease_owner = ${input.owner},
        lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
        attempts = attempts + 1,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM payment_refunds
      WHERE state = 'pending'
        AND (next_retry_at IS NULL OR next_retry_at <= now())
        AND (lease_expires_at IS NULL OR lease_expires_at <= now())
      ORDER BY COALESCE(next_retry_at, created_at), id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id
  `;
  const claimed: PaymentRefundRow[] = [];
  for (const row of rows) {
    const refund = await getPaymentRefund(row.id);
    if (refund) claimed.push(refund);
  }
  return claimed;
}

export async function markRefundSubmitted(input: {
  id: string;
  owner: string;
  providerRefundId: string;
}): Promise<boolean> {
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<{ id: string; order_id: string }[]>`
      UPDATE payment_refunds
      SET state = 'submitted', provider_refund_id = COALESCE(provider_refund_id, ${input.providerRefundId}),
          submitted_at = COALESCE(submitted_at, now()), lease_owner = NULL, lease_expires_at = NULL,
          failure_code = NULL, updated_at = now()
      WHERE id = ${input.id}
        AND lease_owner = ${input.owner}
        AND lease_expires_at > now()
        AND state IN ('pending','submitted')
        AND (provider_refund_id IS NULL OR provider_refund_id = ${input.providerRefundId})
      RETURNING id, order_id
    `;
    if (!rows[0]) return false;
    await tx`
      UPDATE payment_orders SET refund_status = 'submitted', updated_at = now()
      WHERE id = ${rows[0].order_id} AND refund_status IN ('pending','submitted')
    `;
    return true;
  });
}

export async function scheduleRefundRetry(input: {
  id: string;
  owner: string;
  errorCode: string;
  nextRetryAt: Date;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE payment_refunds
    SET next_retry_at = ${input.nextRetryAt.toISOString()}, failure_code = ${input.errorCode},
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state = 'pending'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function markRefundFailed(input: {
  id: string;
  owner: string;
  errorCode: string;
}): Promise<boolean> {
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<Array<{
      id: string;
      order_id: string;
      report_id: string;
      report_locale: "en" | "zh";
    }>>`
      UPDATE payment_refunds refunds
      SET state = 'failed', failure_code = ${input.errorCode},
          lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
      FROM payment_orders orders
      WHERE refunds.id = ${input.id}
        AND refunds.order_id = orders.id
        AND refunds.lease_owner = ${input.owner}
        AND refunds.lease_expires_at > now()
        AND refunds.state IN ('pending','submitted')
      RETURNING refunds.id, refunds.order_id, orders.report_id, orders.report_locale
    `;
    const row = rows[0];
    if (!row) return false;
    await tx`
      UPDATE payment_orders SET refund_status = 'failed', updated_at = now()
      WHERE id = ${row.order_id} AND refund_status IN ('pending','submitted')
    `;
    const businessKey = `refund_assistance/${row.order_id}/${TERMINAL_EMAIL_TEMPLATE_VERSION}`;
    await tx`
      INSERT INTO email_deliveries
        (id, order_id, report_id, template_type, template_version, locale,
         recipient_ref, provider, business_idempotency_key, state)
      VALUES
        (${randomUUID()}, ${row.order_id}, ${row.report_id}, 'refund_assistance',
         ${TERMINAL_EMAIL_TEMPLATE_VERSION}, ${row.report_locale}, ${row.order_id}, 'resend', ${businessKey}, 'queued')
      ON CONFLICT (business_idempotency_key) DO NOTHING
    `;
    return true;
  });
}

export async function markRefundSucceeded(input: {
  id: string;
  providerRefundId?: string;
}): Promise<boolean> {
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<Array<{
      id: string;
      order_id: string;
      report_id: string;
      report_locale: "en" | "zh";
    }>>`
      UPDATE payment_refunds refunds
      SET state = 'succeeded', provider_refund_id = COALESCE(provider_refund_id, ${input.providerRefundId ?? null}),
          succeeded_at = COALESCE(succeeded_at, now()), lease_owner = NULL, lease_expires_at = NULL,
          failure_code = NULL, updated_at = now()
      FROM payment_orders orders
      WHERE refunds.id = ${input.id}
        AND refunds.order_id = orders.id
        AND refunds.state IN ('pending','submitted','succeeded')
        AND (${input.providerRefundId ?? null}::text IS NULL OR refunds.provider_refund_id IS NULL OR refunds.provider_refund_id = ${input.providerRefundId ?? null})
      RETURNING refunds.id, refunds.order_id, orders.report_id, orders.report_locale
    `;
    const row = rows[0];
    if (!row) return false;
    await tx`
      UPDATE payment_orders
      SET refund_status = 'refunded', refunded_at = COALESCE(refunded_at, now()), updated_at = now()
      WHERE id = ${row.order_id} AND refund_status IN ('pending','submitted','refunded')
    `;
    const businessKey = `refund_succeeded/${row.order_id}/${TERMINAL_EMAIL_TEMPLATE_VERSION}`;
    await tx`
      INSERT INTO email_deliveries
        (id, order_id, report_id, template_type, template_version, locale,
         recipient_ref, provider, business_idempotency_key, state)
      VALUES
        (${randomUUID()}, ${row.order_id}, ${row.report_id}, 'refund_succeeded',
         ${TERMINAL_EMAIL_TEMPLATE_VERSION}, ${row.report_locale}, ${row.order_id}, 'resend', ${businessKey}, 'queued')
      ON CONFLICT (business_idempotency_key) DO NOTHING
    `;
    return true;
  });
}

export async function markRefundSucceededByProviderRefundId(input: {
  providerRefundId: string;
}): Promise<boolean> {
  if (!input.providerRefundId) throw new Error("The provider refund ID is required.");
  const refund = await getPaymentRefundByProviderRefundId(input.providerRefundId);
  if (!refund) return false;
  return markRefundSucceeded({ id: refund.id, providerRefundId: input.providerRefundId });
}

export async function markRefundSucceededFromProvider(input: {
  providerRefundId: string;
  orderId?: string | null;
}): Promise<boolean> {
  if (!input.providerRefundId) throw new Error("The provider refund ID is required.");
  const byProvider = await getPaymentRefundByProviderRefundId(input.providerRefundId);
  if (byProvider) {
    if (input.orderId && byProvider.orderId !== input.orderId) return false;
    return markRefundSucceeded({ id: byProvider.id, providerRefundId: input.providerRefundId });
  }
  if (!input.orderId) return false;
  const byOrder = await getPaymentRefundByOrderId(input.orderId);
  if (!byOrder || byOrder.providerRefundId && byOrder.providerRefundId !== input.providerRefundId) return false;
  return markRefundSucceeded({ id: byOrder.id, providerRefundId: input.providerRefundId });
}

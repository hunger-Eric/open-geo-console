import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import { hmacSecret, requireSecret } from "./secrets";
import {
  paymentEvents,
  paymentOrders,
  type CommerceCurrency,
  type PaymentEventRow,
  type PaymentOrderRow,
  type PaymentProvider,
  type RecommendationFulfillmentMethodology,
  type RecommendationReportVersion,
  type ReportLocale
} from "./schema";

const PAYMENT_CONFIRMATION_TEMPLATE_VERSION = "v1";

export interface CreatePaymentOrderInput {
  /** Methodology is intentionally absent: createPaymentOrder selects it from productCode on the server. */
  checkoutIdempotencyHmac: string;
  provider: PaymentProvider;
  reportId: string;
  siteKey: string;
  customerEmailEncrypted: string;
  customerEmailHmac: string;
  emailKeyVersion: string;
  productCode: string;
  catalogVersion: string;
  termsVersion: string;
  refundPolicyVersion: string;
  reportLocale: ReportLocale;
  currency: CommerceCurrency;
  amountMinor: number;
  taxAmountMinor?: number | null;
}

export class CommercialOrderConflictError extends Error {}

export async function createPaymentOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderRow> {
  assertOrderInput(input);
  await ensureDatabase();
  const id = randomUUID();
  const inserted = await getDb()
    .insert(paymentOrders)
    .values({
      id,
      checkoutIdempotencyHmac: input.checkoutIdempotencyHmac,
      provider: input.provider,
      reportId: input.reportId,
      siteKey: input.siteKey,
      customerEmailEncrypted: input.customerEmailEncrypted,
      customerEmailHmac: input.customerEmailHmac,
      emailKeyVersion: input.emailKeyVersion,
      productCode: input.productCode,
      fulfillmentMethodology: fulfillmentMethodologyForProductAdmission(input.productCode),
      recommendationReportVersion: recommendationReportVersionForProductAdmission(input.productCode),
      catalogVersion: input.catalogVersion,
      termsVersion: input.termsVersion,
      refundPolicyVersion: input.refundPolicyVersion,
      reportLocale: input.reportLocale,
      currency: input.currency,
      amountMinor: input.amountMinor,
      taxAmountMinor: input.taxAmountMinor ?? null
    })
    .onConflictDoNothing({ target: paymentOrders.checkoutIdempotencyHmac })
    .returning();
  if (inserted[0]) return inserted[0];

  const existing = await getPaymentOrderByCheckoutHmac(input.checkoutIdempotencyHmac);
  if (!existing || !matchesImmutableOrder(existing, input)) {
    throw new CommercialOrderConflictError("The checkout idempotency key conflicts with another order.");
  }
  return existing;
}

export async function getPaymentOrder(id: string): Promise<PaymentOrderRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(paymentOrders).where(eq(paymentOrders.id, id)).limit(1);
  return row ?? null;
}

export async function getPaymentOrderForReport(id: string, reportId: string): Promise<PaymentOrderRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.id, id), eq(paymentOrders.reportId, reportId)))
    .limit(1);
  return row ?? null;
}

export async function getPaymentOrderByCheckoutHmac(hmac: string): Promise<PaymentOrderRow | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.checkoutIdempotencyHmac, hmac))
    .limit(1);
  return row ?? null;
}

export async function getPaymentOrderByProviderCheckout(
  provider: PaymentProvider,
  providerCheckoutId: string
): Promise<PaymentOrderRow | null> {
  if (!providerCheckoutId.trim()) return null;
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(paymentOrders)
    .where(and(eq(paymentOrders.provider, provider), eq(paymentOrders.providerCheckoutId, providerCheckoutId)))
    .limit(1);
  return row ?? null;
}

export async function getActivePaymentOrderForReport(
  reportId: string,
  productCode: string
): Promise<PaymentOrderRow | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    SELECT id FROM payment_orders
    WHERE report_id = ${reportId}
      AND product_code = ${productCode}
      AND payment_status IN ('created','pending','paid')
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows[0] ? getPaymentOrder(rows[0].id) : null;
}

export interface LegacyRetirementCandidate {
  id: string;
  providerCheckoutId: string | null;
  cutoffAt: Date;
}

export async function prepareLegacyUnpaidOrderRetirement(cutoffAt: Date): Promise<LegacyRetirementCandidate[]> {
  if (!Number.isFinite(cutoffAt.getTime())) throw new Error("A valid legacy retirement cutoff is required.");
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{ id: string; provider_checkout_id: string | null; legacy_retirement_cutoff_at: Date }>>`
    UPDATE payment_orders
    SET legacy_retirement_cutoff_at = COALESCE(legacy_retirement_cutoff_at, ${cutoffAt.toISOString()}), updated_at = now()
    WHERE product_code = 'deep_report_v1'
      AND payment_status IN ('created','pending')
      AND created_at <= ${cutoffAt.toISOString()}
    RETURNING id, provider_checkout_id, legacy_retirement_cutoff_at
  `;
  return rows.map((row) => ({ id: row.id, providerCheckoutId: row.provider_checkout_id, cutoffAt: new Date(row.legacy_retirement_cutoff_at) }));
}

export async function finalizeLegacyUnpaidOrderRetirement(orderId: string, cutoffAt: Date): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE payment_orders
    SET payment_status = 'cancelled', legacy_retired_at = COALESCE(legacy_retired_at, now()), updated_at = now()
    WHERE id = ${orderId}
      AND product_code = 'deep_report_v1'
      AND payment_status IN ('created','pending')
      AND legacy_retirement_cutoff_at = ${cutoffAt.toISOString()}
    RETURNING id
  `;
  return rows.length === 1;
}

export async function attachHostedCheckout(input: {
  orderId: string;
  providerCheckoutId: string;
}): Promise<PaymentOrderRow> {
  if (!input.orderId || !input.providerCheckoutId) throw new Error("Order and provider checkout IDs are required.");
  await ensureDatabase();
  await getSqlClient().begin(async (tx) => {
    const rows = await tx<Array<{
      provider_checkout_id: string | null;
      payment_status: PaymentOrderRow["paymentStatus"];
    }>>`
      SELECT provider_checkout_id, payment_status
      FROM payment_orders WHERE id = ${input.orderId} FOR UPDATE
    `;
    const order = rows[0];
    if (!order) throw new Error("The payment order does not exist.");
    if (order.provider_checkout_id && order.provider_checkout_id !== input.providerCheckoutId) {
      throw new CommercialOrderConflictError("The order is already bound to another hosted checkout.");
    }
    if (!["created", "pending"].includes(order.payment_status) && !order.provider_checkout_id) {
      throw new CommercialOrderConflictError("A terminal payment order cannot be attached to a new checkout.");
    }
    await tx`
      UPDATE payment_orders
      SET provider_checkout_id = COALESCE(provider_checkout_id, ${input.providerCheckoutId}),
          payment_status = CASE WHEN payment_status = 'created' THEN 'pending' ELSE payment_status END,
          updated_at = now()
      WHERE id = ${input.orderId}
    `;
  });
  return (await getPaymentOrder(input.orderId))!;
}

export async function replaceLegacyHostedCheckout(input: {
  orderId: string;
  expectedProviderCheckoutId: string;
  providerCheckoutId: string;
}): Promise<PaymentOrderRow> {
  if (!input.orderId || !input.expectedProviderCheckoutId || !input.providerCheckoutId) {
    throw new Error("Order and hosted checkout IDs are required.");
  }
  if (input.expectedProviderCheckoutId.startsWith("int_") || !input.providerCheckoutId.startsWith("int_")) {
    throw new CommercialOrderConflictError("Only a legacy checkout may be replaced by a PaymentIntent.");
  }
  await ensureDatabase();
  await getSqlClient().begin(async (tx) => {
    const rows = await tx<Array<{
      provider_checkout_id: string | null;
      payment_status: PaymentOrderRow["paymentStatus"];
    }>>`
      SELECT provider_checkout_id, payment_status
      FROM payment_orders WHERE id = ${input.orderId} FOR UPDATE
    `;
    const order = rows[0];
    if (!order || order.provider_checkout_id !== input.expectedProviderCheckoutId) {
      throw new CommercialOrderConflictError("The legacy checkout binding changed before replacement.");
    }
    if (!['created', 'pending'].includes(order.payment_status)) {
      throw new CommercialOrderConflictError("Only an unpaid active order may replace a legacy checkout.");
    }
    await tx`
      UPDATE payment_orders
      SET provider_checkout_id = ${input.providerCheckoutId}, payment_status = 'pending', updated_at = now()
      WHERE id = ${input.orderId}
    `;
  });
  return (await getPaymentOrder(input.orderId))!;
}

export interface RecordPaymentEventInput {
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  orderId?: string | null;
  providerCreatedAt?: Date | null;
  payloadHash: string;
  selectedFields?: Record<string, string | number | boolean | null>;
}

export async function recordPaymentEvent(input: RecordPaymentEventInput): Promise<{
  event: PaymentEventRow;
  duplicate: boolean;
}> {
  assertPaymentEventInput(input);
  await ensureDatabase();
  const inserted = await getDb()
    .insert(paymentEvents)
    .values({
      id: randomUUID(),
      provider: input.provider,
      providerEventId: input.providerEventId,
      eventType: input.eventType,
      orderId: input.orderId ?? null,
      providerCreatedAt: input.providerCreatedAt ?? null,
      payloadHash: input.payloadHash,
      selectedFields: input.selectedFields ?? {}
    })
    .onConflictDoNothing({
      target: [paymentEvents.provider, paymentEvents.providerEventId]
    })
    .returning();
  if (inserted[0]) return { event: inserted[0], duplicate: false };
  const [existing] = await getDb()
    .select()
    .from(paymentEvents)
    .where(and(eq(paymentEvents.provider, input.provider), eq(paymentEvents.providerEventId, input.providerEventId)))
    .limit(1);
  if (!existing || existing.payloadHash !== input.payloadHash) {
    throw new CommercialOrderConflictError("The provider event ID conflicts with another payload.");
  }
  return { event: existing, duplicate: true };
}

export async function markPaymentEventProcessing(input: {
  provider: PaymentProvider;
  providerEventId: string;
  status: Exclude<PaymentEventRow["processingStatus"], "received">;
  orderId?: string | null;
  errorCode?: string | null;
}): Promise<PaymentEventRow> {
  await ensureDatabase();
  await getSqlClient().begin(async (tx) => {
    const events = await tx<Array<{
      id: string;
      processing_status: PaymentEventRow["processingStatus"];
      order_id: string | null;
    }>>`
      SELECT id, processing_status, order_id FROM payment_events
      WHERE provider = ${input.provider} AND provider_event_id = ${input.providerEventId}
      FOR UPDATE
    `;
    const event = events[0];
    if (!event) throw new Error("The payment event does not exist.");
    if (event.processing_status !== "received" && event.processing_status !== input.status) {
      throw new CommercialOrderConflictError("The payment event already has another terminal processing result.");
    }
    if (event.order_id && input.orderId && event.order_id !== input.orderId) {
      throw new CommercialOrderConflictError("The payment event is already bound to another order.");
    }
    await tx`
      UPDATE payment_events
      SET processing_status = ${input.status}, order_id = COALESCE(order_id, ${input.orderId ?? null}),
          processed_at = COALESCE(processed_at, now()), error_code = ${input.errorCode ?? null}
      WHERE id = ${event.id}
    `;
  });
  const [event] = await getDb()
    .select()
    .from(paymentEvents)
    .where(and(eq(paymentEvents.provider, input.provider), eq(paymentEvents.providerEventId, input.providerEventId)))
    .limit(1);
  return event!;
}

export interface ApplyPaidPaymentEventInput extends RecordPaymentEventInput {
  orderId: string;
  providerPaymentId: string;
}

export interface ApplyUnsuccessfulPaymentEventInput extends RecordPaymentEventInput {
  orderId: string;
  status: "failed" | "cancelled";
}

export async function applyUnsuccessfulPaymentEvent(
  input: ApplyUnsuccessfulPaymentEventInput
): Promise<{ order: PaymentOrderRow; eventId: string; duplicate: boolean; applied: boolean }> {
  assertPaymentEventInput(input);
  if (!input.orderId) throw new Error("An unsuccessful payment event requires its order ID.");
  await ensureDatabase();
  const selectedFields = JSON.stringify(input.selectedFields ?? {});
  const result = await getSqlClient().begin(async (tx) => {
    const newEventId = randomUUID();
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO payment_events
        (id, provider, provider_event_id, event_type, order_id, provider_created_at,
         payload_hash, selected_fields, processing_status)
      VALUES
        (${newEventId}, ${input.provider}, ${input.providerEventId}, ${input.eventType}, ${input.orderId},
         ${input.providerCreatedAt?.toISOString() ?? null}, ${input.payloadHash}, ${selectedFields}::jsonb, 'received')
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `;
    const duplicate = inserted.length === 0;
    const events = await tx<{ id: string; payload_hash: string }[]>`
      SELECT id, payload_hash FROM payment_events
      WHERE provider = ${input.provider} AND provider_event_id = ${input.providerEventId}
      FOR UPDATE
    `;
    const event = events[0];
    if (!event || event.payload_hash !== input.payloadHash) {
      throw new CommercialOrderConflictError("The provider event ID conflicts with another payload.");
    }
    const orders = await tx<Array<{
      id: string;
      provider: PaymentProvider;
      payment_status: PaymentOrderRow["paymentStatus"];
    }>>`
      SELECT id, provider, payment_status FROM payment_orders
      WHERE id = ${input.orderId} FOR UPDATE
    `;
    const order = orders[0];
    if (!order || order.provider !== input.provider) {
      throw new CommercialOrderConflictError("The provider event does not match its payment order.");
    }
    const applied = order.payment_status === input.status
      || order.payment_status === "created"
      || order.payment_status === "pending";
    if (applied) {
      await tx`
        UPDATE payment_orders SET payment_status = ${input.status}, updated_at = now()
        WHERE id = ${order.id} AND payment_status IN ('created','pending',${input.status})
      `;
    }
    await tx`
      UPDATE payment_events
      SET processing_status = ${applied ? "processed" : "ignored"},
          processed_at = COALESCE(processed_at, now()),
          error_code = ${applied ? null : "terminal_payment_state"}
      WHERE id = ${event.id}
    `;
    return { eventId: event.id, duplicate, applied };
  });
  return { order: (await getPaymentOrder(input.orderId))!, ...result };
}

export interface PaidFulfillmentResult {
  order: PaymentOrderRow;
  eventId: string;
  duplicate: boolean;
  jobId: string;
  dispatchId: string;
  emailDeliveryId: string;
}

export interface RetiredLegacyPaidRefundResult {
  order: PaymentOrderRow;
  eventId: string;
  duplicate: boolean;
  retiredRefund: true;
  refundId: string;
}

/**
 * Converts a verified paid event into exactly one entitlement, reservation,
 * deep job, dispatch hint and confirmation email. Provider calls happen before
 * or after this short transaction, never while its locks are held.
 */
export async function applyPaidPaymentEvent(input: ApplyPaidPaymentEventInput): Promise<PaidFulfillmentResult | RetiredLegacyPaidRefundResult> {
  assertPaymentEventInput(input);
  if (!input.orderId || !input.providerPaymentId) {
    throw new Error("A paid event requires order and provider payment IDs.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const ids = {
    eventId: randomUUID(),
    accessKeyId: randomUUID(),
    reservationId: randomUUID(),
    jobId: randomUUID(),
    dispatchId: randomUUID(),
    emailDeliveryId: randomUUID()
  };
  const selectedFields = JSON.stringify(input.selectedFields ?? {});

  const result = await sql.begin(async (tx) => {
    const insertedEvents = await tx<{ id: string }[]>`
      INSERT INTO payment_events
        (id, provider, provider_event_id, event_type, order_id, provider_created_at,
         payload_hash, selected_fields, processing_status)
      VALUES
        (${ids.eventId}, ${input.provider}, ${input.providerEventId}, ${input.eventType}, ${input.orderId},
         ${input.providerCreatedAt?.toISOString() ?? null}, ${input.payloadHash}, ${selectedFields}::jsonb, 'received')
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `;
    const duplicate = insertedEvents.length === 0;
    const eventRows = await tx<{ id: string; payload_hash: string }[]>`
      SELECT id, payload_hash FROM payment_events
      WHERE provider = ${input.provider} AND provider_event_id = ${input.providerEventId}
      FOR UPDATE
    `;
    const event = eventRows[0];
    if (!event || event.payload_hash !== input.payloadHash) {
      throw new CommercialOrderConflictError("The provider event ID conflicts with another payload.");
    }

    const orderRows = await tx<Array<{
      id: string;
      provider: PaymentProvider;
      provider_payment_id: string | null;
      payment_status: PaymentOrderRow["paymentStatus"];
      report_id: string;
      report_locale: ReportLocale;
      fulfillment_job_id: string | null;
      product_code: string;
      fulfillment_methodology: RecommendationFulfillmentMethodology | null;
      recommendation_report_version: RecommendationReportVersion | null;
      legacy_retirement_cutoff_at: Date | null;
      legacy_retired_at: Date | null;
    }>>`
      SELECT id, provider, provider_payment_id, payment_status, report_id, report_locale, fulfillment_job_id, product_code,
             fulfillment_methodology,
             recommendation_report_version,
             legacy_retirement_cutoff_at, legacy_retired_at
      FROM payment_orders WHERE id = ${input.orderId} FOR UPDATE
    `;
    const order = orderRows[0];
    if (!order || order.provider !== input.provider) {
      throw new CommercialOrderConflictError("The provider event does not match its payment order.");
    }
    if (order.provider_payment_id && order.provider_payment_id !== input.providerPaymentId) {
      throw new CommercialOrderConflictError("The payment order is already bound to another provider payment.");
    }
    const cutoff = order.legacy_retirement_cutoff_at ? new Date(order.legacy_retirement_cutoff_at) : null;
    const lateRetiredLegacyPayment = order.product_code === "deep_report_v1" && cutoff &&
      (Boolean(order.legacy_retired_at) || !input.providerCreatedAt || input.providerCreatedAt > cutoff);
    if (lateRetiredLegacyPayment) {
      await tx`
        UPDATE payment_orders
        SET provider_payment_id = COALESCE(provider_payment_id, ${input.providerPaymentId}),
            payment_status = 'paid', paid_at = COALESCE(paid_at, ${input.providerCreatedAt?.toISOString() ?? new Date().toISOString()}),
            fulfillment_status = 'failed', refund_status = CASE WHEN refund_status = 'not_required' THEN 'pending' ELSE refund_status END,
            courtesy_non_billable = true, updated_at = now()
        WHERE id = ${order.id}
      `;
      await tx`
        INSERT INTO payment_refunds (id, order_id, provider, reason, amount_minor, currency, state, idempotency_key)
        SELECT ${randomUUID()}, id, provider, 'operator_approved', amount_minor, currency, 'pending', ${`legacy_retired_full_refund/${order.id}`}
        FROM payment_orders WHERE id = ${order.id}
        ON CONFLICT (order_id) DO NOTHING
      `;
      const refund = (await tx<{ id: string }[]>`SELECT id FROM payment_refunds WHERE order_id = ${order.id}`)[0];
      await tx`UPDATE payment_events SET processing_status = 'processed', processed_at = COALESCE(processed_at, now()) WHERE id = ${event.id}`;
      return { retiredRefund: true as const, eventId: event.id, duplicate, refundId: refund!.id };
    }
    const paidBeforeCutoff = order.product_code === "deep_report_v1" && cutoff && input.providerCreatedAt && input.providerCreatedAt <= cutoff;
    if (order.payment_status === "failed" || (order.payment_status === "cancelled" && !paidBeforeCutoff)) {
      throw new CommercialOrderConflictError("A terminal unsuccessful payment order cannot become paid.");
    }
    const internalKeyHmac = hmacSecret(randomUUID(), requireSecret("OGC_TOKEN_HASH_SECRET"));

    await tx`
      UPDATE payment_orders
      SET provider_payment_id = COALESCE(provider_payment_id, ${input.providerPaymentId}),
          payment_status = 'paid',
          fulfillment_status = CASE WHEN fulfillment_status = 'not_started' THEN 'queued' ELSE fulfillment_status END,
          paid_at = COALESCE(paid_at, now()),
          delivery_deadline_at = COALESCE(delivery_deadline_at, now() + interval '24 hours'),
          updated_at = now()
      WHERE id = ${order.id}
    `;

    await tx`
      INSERT INTO access_keys
        (id, key_prefix, key_hmac, payment_order_id, status, credits_remaining)
      VALUES
        (${ids.accessKeyId}, 'internal_order', ${internalKeyHmac}, ${order.id}, 'exhausted', 0)
      ON CONFLICT (payment_order_id) WHERE payment_order_id IS NOT NULL DO NOTHING
    `;
    const accessKeys = await tx<{ id: string }[]>`
      SELECT id FROM access_keys WHERE payment_order_id = ${order.id} FOR UPDATE
    `;
    const accessKey = accessKeys[0];
    if (!accessKey) throw new Error("The paid order entitlement could not be created.");

    await tx`
      INSERT INTO credit_ledger
        (id, access_key_id, report_id, idempotency_key, payment_order_id, credits, status)
      VALUES
        (${ids.reservationId}, ${accessKey.id}, ${order.report_id}, ${`paid_order/${order.id}`}, ${order.id}, 1, 'reserved')
      ON CONFLICT (payment_order_id) WHERE payment_order_id IS NOT NULL DO NOTHING
    `;
    const reservations = await tx<{ id: string; job_id: string | null }[]>`
      SELECT id, job_id FROM credit_ledger WHERE payment_order_id = ${order.id} FOR UPDATE
    `;
    const reservation = reservations[0];
    if (!reservation) throw new Error("The paid order credit reservation could not be created.");

    let jobId = order.fulfillment_job_id ?? reservation.job_id;
    if (!jobId) {
      jobId = ids.jobId;
      await tx`
        INSERT INTO scan_jobs
          (id, report_id, tier, product_contract, fulfillment_methodology, recommendation_report_version, locale, reason, stage, credit_reservation_id)
        VALUES
          (${jobId}, ${order.report_id}, 'deep', ${productContractForCode(order.product_code)}, ${order.fulfillment_methodology}, ${order.recommendation_report_version}, ${order.report_locale}, 'standard', 'queued', ${reservation.id})
      `;
    }
    await tx`
      UPDATE credit_ledger SET job_id = COALESCE(job_id, ${jobId})
      WHERE id = ${reservation.id}
    `;
    await tx`
      UPDATE payment_orders SET fulfillment_job_id = COALESCE(fulfillment_job_id, ${jobId}), updated_at = now()
      WHERE id = ${order.id}
    `;

    await tx`
      INSERT INTO job_dispatch_outbox (id, job_id, tier, schema_version, state)
      VALUES (${ids.dispatchId}, ${jobId}, 'deep', 1, 'pending')
      ON CONFLICT (job_id) DO NOTHING
    `;
    const dispatches = await tx<{ id: string }[]>`
      SELECT id FROM job_dispatch_outbox WHERE job_id = ${jobId}
    `;

    const emailBusinessKey = `payment_confirmed/${order.id}/${PAYMENT_CONFIRMATION_TEMPLATE_VERSION}`;
    await tx`
      INSERT INTO email_deliveries
        (id, order_id, report_id, template_type, template_version, locale,
         recipient_ref, provider, business_idempotency_key, state)
      VALUES
        (${ids.emailDeliveryId}, ${order.id}, ${order.report_id}, 'payment_confirmed',
         ${PAYMENT_CONFIRMATION_TEMPLATE_VERSION}, ${order.report_locale}, ${order.id}, 'resend',
         ${emailBusinessKey}, 'queued')
      ON CONFLICT (business_idempotency_key) DO NOTHING
    `;
    const deliveries = await tx<{ id: string }[]>`
      SELECT id FROM email_deliveries WHERE business_idempotency_key = ${emailBusinessKey}
    `;

    await tx`
      UPDATE payment_events
      SET processing_status = 'processed', order_id = ${order.id}, processed_at = COALESCE(processed_at, now()), error_code = NULL
      WHERE id = ${event.id}
    `;

    return {
      eventId: event.id,
      duplicate,
      jobId,
      dispatchId: dispatches[0]!.id,
      emailDeliveryId: deliveries[0]!.id
    };
  });

  return {
    order: (await getPaymentOrder(input.orderId))!,
    ...result
  };
}

export function productContractForCode(productCode: string): "legacy_website_audit_v1" | "recommendation_forensics_v1" {
  if (productCode === "recommendation_forensics_v1") return "recommendation_forensics_v1";
  if (productCode === "deep_report_v1") return "legacy_website_audit_v1";
  throw new CommercialOrderConflictError("The paid order uses an unsupported product contract.");
}

export function fulfillmentMethodologyForProductAdmission(
  productCode: string
): RecommendationFulfillmentMethodology | null {
  if (productCode === "recommendation_forensics_v1") return "public_search_source_forensics_v1";
  if (productCode === "deep_report_v1") return null;
  throw new CommercialOrderConflictError("The paid order uses an unsupported fulfillment methodology.");
}

export function recommendationReportVersionForProductAdmission(productCode: string): RecommendationReportVersion | null {
  if (productCode === "recommendation_forensics_v1") return 2;
  if (productCode === "deep_report_v1") return null;
  throw new CommercialOrderConflictError("The paid order uses an unsupported recommendation report version.");
}

function assertOrderInput(input: CreatePaymentOrderInput): void {
  const required = [
    input.checkoutIdempotencyHmac,
    input.reportId,
    input.siteKey,
    input.customerEmailEncrypted,
    input.customerEmailHmac,
    input.emailKeyVersion,
    input.productCode,
    input.catalogVersion,
    input.termsVersion,
    input.refundPolicyVersion
  ];
  if (required.some((value) => !value.trim())) throw new Error("Commercial order fields cannot be empty.");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error("Commercial order amount must be a positive integer in minor units.");
  }
  if (input.taxAmountMinor != null && (!Number.isSafeInteger(input.taxAmountMinor) || input.taxAmountMinor < 0)) {
    throw new Error("Commercial order tax must be a non-negative integer in minor units.");
  }
}

function assertPaymentEventInput(input: RecordPaymentEventInput): void {
  if (!input.providerEventId.trim() || !input.eventType.trim() || !input.payloadHash.trim()) {
    throw new Error("Provider event ID, type, and payload hash are required.");
  }
}

export function matchesImmutableOrder(row: PaymentOrderRow, input: CreatePaymentOrderInput): boolean {
  return row.provider === input.provider
    && row.reportId === input.reportId
    && row.siteKey === input.siteKey
    && row.customerEmailHmac === input.customerEmailHmac
    && row.productCode === input.productCode
    && row.fulfillmentMethodology === fulfillmentMethodologyForProductAdmission(input.productCode)
    && row.recommendationReportVersion === recommendationReportVersionForProductAdmission(input.productCode)
    && row.catalogVersion === input.catalogVersion
    && row.termsVersion === input.termsVersion
    && row.refundPolicyVersion === input.refundPolicyVersion
    && row.reportLocale === input.reportLocale
    && row.currency === input.currency
    && row.amountMinor === input.amountMinor
    && row.taxAmountMinor === (input.taxAmountMinor ?? null);
}

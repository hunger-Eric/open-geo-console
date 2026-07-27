import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import { shouldApplyEmailProviderEvent } from "./commercial-state";
import {
  emailDeliveries,
  type EmailDeliveryRow,
  type EmailDeliveryState,
  type EmailTemplateType,
  type ReportLocale
} from "./schema";

export interface QueueCommercialEmailInput {
  orderId?: string | null;
  reportId: string;
  templateType: EmailTemplateType;
  templateVersion: string;
  locale: ReportLocale;
  recipientRef: string;
  businessIdempotencyKey: string;
}

export async function queueCommercialEmail(input: QueueCommercialEmailInput): Promise<EmailDeliveryRow> {
  if (
    !input.reportId
    || !input.templateVersion
    || !input.recipientRef
    || !input.businessIdempotencyKey
  ) {
    throw new Error("A report, template version, recipient reference, and business idempotency key are required.");
  }
  await ensureDatabase();
  const inserted = await getDb()
    .insert(emailDeliveries)
    .values({
      id: randomUUID(),
      orderId: input.orderId ?? null,
      reportId: input.reportId,
      templateType: input.templateType,
      templateVersion: input.templateVersion,
      locale: input.locale,
      recipientRef: input.recipientRef,
      provider: "resend",
      businessIdempotencyKey: input.businessIdempotencyKey
    })
    .onConflictDoNothing({ target: emailDeliveries.businessIdempotencyKey })
    .returning();
  if (inserted[0]) return inserted[0];
  const [existing] = await getDb()
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.businessIdempotencyKey, input.businessIdempotencyKey))
    .limit(1);
  if (!existing || !sameEmailIntent(existing, input)) {
    throw new Error("The email idempotency key conflicts with another delivery.");
  }
  return existing;
}

export async function getEmailDelivery(id: string): Promise<EmailDeliveryRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(emailDeliveries).where(eq(emailDeliveries.id, id)).limit(1);
  return row ?? null;
}

export interface EncryptedEmailRecipient {
  deliveryId: string;
  customerEmailEncrypted: string;
  emailKeyVersion: string;
}

/** Deliberately narrow read used only by the email sender. */
export async function getEncryptedEmailRecipient(deliveryId: string): Promise<EncryptedEmailRecipient | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<Array<{
    delivery_id: string;
    customer_email_encrypted: string;
    email_key_version: string;
  }>>`
    SELECT delivery.id AS delivery_id, orders.customer_email_encrypted, orders.email_key_version
    FROM email_deliveries delivery
    JOIN payment_orders orders ON orders.id = delivery.order_id
    WHERE delivery.id = ${deliveryId}
    LIMIT 1
  `;
  const row = rows[0];
  return row
    ? {
        deliveryId: row.delivery_id,
        customerEmailEncrypted: row.customer_email_encrypted,
        emailKeyVersion: row.email_key_version
      }
    : null;
}

export async function requestReportLinkReissue(input: {
  orderId: string;
  customerEmailHmac: string;
  now?: Date;
}): Promise<{ accepted: boolean }> {
  if (!input.orderId || !input.customerEmailHmac) {
    throw new Error("Order reference and customer email HMAC are required.");
  }
  await ensureDatabase();
  const now = input.now ?? new Date();
  return getSqlClient().begin(async (tx) => {
    const orders = await tx<Array<{
      id: string;
      report_id: string;
      report_locale: ReportLocale;
      email_matches: boolean;
      payment_status: string;
      fulfillment_status: string;
    }>>`
      SELECT id, report_id, report_locale,
             customer_email_hmac = ${input.customerEmailHmac} AS email_matches,
             payment_status, fulfillment_status
      FROM payment_orders WHERE id = ${input.orderId} FOR UPDATE
    `;
    const order = orders[0];
    if (!order
      || !order.email_matches
      || order.payment_status !== "paid"
      || !["completed", "completed_limited"].includes(order.fulfillment_status)) {
      return { accepted: false };
    }
    const recent = await tx<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM email_deliveries
        WHERE order_id = ${order.id}
          AND template_type = 'link_reissue'
          AND created_at > ${new Date(now.getTime() - 60 * 60 * 1000).toISOString()}
      ) AS exists
    `;
    if (recent[0]?.exists) return { accepted: false };

    const hourBucket = now.toISOString().slice(0, 13);
    const businessKey = `link_reissue/${order.id}/${hourBucket}/${randomUUID()}`;
    const rows = await tx<{ id: string }[]>`
      INSERT INTO email_deliveries
        (id, order_id, report_id, template_type, template_version, locale,
         recipient_ref, provider, business_idempotency_key, state, created_at, updated_at)
      VALUES
        (${randomUUID()}, ${order.id}, ${order.report_id}, 'link_reissue', 'v1', ${order.report_locale},
         ${order.id}, 'resend', ${businessKey}, 'queued', ${now.toISOString()}, ${now.toISOString()})
      RETURNING id
    `;
    return { accepted: rows.length === 1 };
  });
}

export async function claimEmailDeliveries(input: {
  owner: string;
  limit?: number;
  leaseSeconds?: number;
}): Promise<EmailDeliveryRow[]> {
  const limit = input.limit ?? 10;
  const leaseSeconds = input.leaseSeconds ?? 60;
  assertLeaseInput(input.owner, limit, leaseSeconds);
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE email_deliveries
    SET lease_owner = ${input.owner},
        lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
        attempts = attempts + 1,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM email_deliveries
      WHERE state = 'queued'
        AND next_retry_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at <= now())
      ORDER BY next_retry_at, created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id
  `;
  const claimed: EmailDeliveryRow[] = [];
  for (const row of rows) {
    const delivery = await getEmailDelivery(row.id);
    if (delivery) claimed.push(delivery);
  }
  return claimed;
}

export async function markEmailSent(input: {
  id: string;
  owner: string;
  providerEmailId: string;
}): Promise<boolean> {
  if (!input.providerEmailId) throw new Error("The provider email ID is required.");
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string; order_id: string | null; template_type: EmailTemplateType }[]>`
    UPDATE email_deliveries
    SET state = 'sent', provider_email_id = COALESCE(provider_email_id, ${input.providerEmailId}),
        sent_at = COALESCE(sent_at, now()), lease_owner = NULL, lease_expires_at = NULL,
        failure_code = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state IN ('queued','sent')
      AND (provider_email_id IS NULL OR provider_email_id = ${input.providerEmailId})
    RETURNING id, order_id, template_type
  `;
  const row = rows[0];
  if (row?.order_id && isFinalDeliveryTemplate(row.template_type)) {
    await getSqlClient()`
      UPDATE payment_orders SET delivery_status = 'sent', updated_at = now()
      WHERE id = ${row.order_id} AND delivery_status IN ('not_queued','queued','sent')
    `;
  }
  if (row) {
    try {
      await replayIgnoredEmailEvents(input.providerEmailId);
    } catch {
      console.error("Email event reconciliation required after provider acceptance.");
    }
  }
  return Boolean(row);
}

export async function scheduleEmailRetry(input: {
  id: string;
  owner: string;
  errorCode: string;
  nextRetryAt: Date;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE email_deliveries
    SET next_retry_at = ${input.nextRetryAt.toISOString()}, failure_code = ${input.errorCode},
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state = 'queued'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function markEmailFailed(input: {
  id: string;
  owner: string;
  errorCode: string;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string; order_id: string | null; template_type: EmailTemplateType }[]>`
    UPDATE email_deliveries
    SET state = 'failed', failure_code = ${input.errorCode},
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state IN ('queued','sent')
    RETURNING id, order_id, template_type
  `;
  const row = rows[0];
  if (row?.order_id && isFinalDeliveryTemplate(row.template_type)) {
    await getSqlClient()`
      UPDATE payment_orders SET delivery_status = 'failed', updated_at = now()
      WHERE id = ${row.order_id} AND delivery_status IN ('not_queued','queued','sent')
    `;
  }
  return Boolean(row);
}

export async function recordEmailProviderEvent(input: {
  providerEventId: string;
  providerEmailId: string;
  eventType: string;
  targetState: Exclude<EmailDeliveryState, "queued" | "sent">;
  payloadHash: string;
  providerCreatedAt?: Date | null;
}): Promise<{ duplicate: boolean; applied: boolean; deliveryId: string | null }> {
  if (!input.providerEventId || !input.providerEmailId || !input.eventType || !input.payloadHash) {
    throw new Error("The provider event, email, type, and payload hash are required.");
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const newEventId = randomUUID();
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO email_delivery_events
        (id, provider, provider_event_id, provider_email_id, event_type, provider_created_at, payload_hash)
      VALUES
        (${newEventId}, 'resend', ${input.providerEventId}, ${input.providerEmailId}, ${input.eventType},
         ${input.providerCreatedAt?.toISOString() ?? null}, ${input.payloadHash})
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
    `;
    const duplicate = inserted.length === 0;
    const events = await tx<{
      id: string;
      payload_hash: string;
      processing_status: string;
      error_code: string | null;
      delivery_id: string | null;
    }[]>`
      SELECT id, payload_hash, processing_status, error_code, delivery_id FROM email_delivery_events
      WHERE provider = 'resend' AND provider_event_id = ${input.providerEventId}
      FOR UPDATE
    `;
    const event = events[0];
    if (!event || event.payload_hash !== input.payloadHash) {
      throw new Error("The email provider event ID conflicts with another payload.");
    }
    if (duplicate
      && event.processing_status !== "received"
      && !(event.processing_status === "ignored" && event.error_code === "delivery_not_found")) {
      return { duplicate: true, applied: event.processing_status === "processed", deliveryId: event.delivery_id };
    }

    const deliveries = await tx<Array<{
      id: string;
      order_id: string | null;
      template_type: EmailTemplateType;
      state: EmailDeliveryState;
      last_provider_event_at: string | Date | null;
    }>>`
      SELECT id, order_id, template_type, state, last_provider_event_at
      FROM email_deliveries
      WHERE provider = 'resend' AND provider_email_id = ${input.providerEmailId}
      FOR UPDATE
    `;
    const delivery = deliveries[0];
    if (!delivery) {
      await tx`
        UPDATE email_delivery_events SET processing_status = 'ignored', error_code = 'delivery_not_found'
        WHERE id = ${event.id}
      `;
      return { duplicate, applied: false, deliveryId: null };
    }
    const eventAt = input.providerCreatedAt ?? new Date();
    const applied = shouldApplyEmailProviderEvent({
      current: delivery.state,
      target: input.targetState,
      lastProviderEventAt: delivery.last_provider_event_at ? new Date(delivery.last_provider_event_at) : null,
      providerCreatedAt: eventAt
    });
    if (applied) {
      await tx`
        UPDATE email_deliveries
        SET state = ${input.targetState}, last_provider_event_at = ${eventAt.toISOString()},
            delivered_at = CASE WHEN ${input.targetState} = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
            failure_code = CASE WHEN ${input.targetState} IN ('bounced','failed') THEN ${input.eventType} ELSE NULL END,
            lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
        WHERE id = ${delivery.id}
      `;
      if (delivery.order_id && isFinalDeliveryTemplate(delivery.template_type)) {
        await tx`
          UPDATE payment_orders SET delivery_status = ${input.targetState}, updated_at = now()
          WHERE id = ${delivery.order_id} AND delivery_status IN ('not_queued','queued','sent')
        `;
      }
    }
    await tx`
      UPDATE email_delivery_events
      SET delivery_id = ${delivery.id}, processing_status = ${applied ? "processed" : "ignored"},
          error_code = ${applied ? null : "stale_or_terminal"}
      WHERE id = ${event.id}
    `;
    return { duplicate, applied, deliveryId: delivery.id };
  });
}

function assertLeaseInput(owner: string, limit: number, leaseSeconds: number): void {
  if (!owner || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("A lease owner and a limit between 1 and 100 are required.");
  }
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10) {
    throw new Error("Email lease seconds must be an integer of at least 10.");
  }
}

function sameEmailIntent(row: EmailDeliveryRow, input: QueueCommercialEmailInput): boolean {
  return row.orderId === (input.orderId ?? null)
    && row.reportId === input.reportId
    && row.templateType === input.templateType
    && row.templateVersion === input.templateVersion
    && row.locale === input.locale
    && row.recipientRef === input.recipientRef;
}

function isFinalDeliveryTemplate(templateType: EmailTemplateType): boolean {
  return templateType === "report_ready"
    || templateType === "corrected_report_ready"
    || templateType === "replacement_report_ready"
    || templateType === "limited_report_refund"
    || templateType === "report_failed_refund";
}

async function replayIgnoredEmailEvents(providerEmailId: string): Promise<void> {
  const rows = await getSqlClient()<Array<{
    provider_event_id: string;
    event_type: string;
    payload_hash: string;
    provider_created_at: string | Date | null;
  }>>`
    SELECT provider_event_id, event_type, payload_hash, provider_created_at
    FROM email_delivery_events
    WHERE provider = 'resend'
      AND provider_email_id = ${providerEmailId}
      AND processing_status = 'ignored'
      AND error_code = 'delivery_not_found'
    ORDER BY provider_created_at NULLS LAST, received_at, id
  `;
  for (const row of rows) {
    const targetState = emailTargetState(row.event_type);
    if (!targetState) continue;
    await recordEmailProviderEvent({
      providerEventId: row.provider_event_id,
      providerEmailId,
      eventType: row.event_type,
      targetState,
      payloadHash: row.payload_hash,
      providerCreatedAt: row.provider_created_at ? new Date(row.provider_created_at) : null
    });
  }
}

function emailTargetState(eventType: string): Exclude<EmailDeliveryState, "queued" | "sent"> | null {
  if (eventType === "email.delivered") return "delivered";
  if (eventType === "email.bounced") return "bounced";
  if (["email.complained", "email.suppressed", "email.failed"].includes(eventType)) return "failed";
  return null;
}

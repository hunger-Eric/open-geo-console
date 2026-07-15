import { randomUUID } from "node:crypto";
import {
  claimEmailDeliveries,
  getEncryptedEmailRecipient,
  markEmailFailed,
  markEmailSent,
  queueCommercialEmail,
  scheduleEmailRetry
} from "@/db/commercial-delivery";
import { getPaymentOrder, productContractForCode } from "@/db/commercial-orders";
import {
  claimPendingRefunds,
  expirePaidOrderSla,
  find20hWarningOrders,
  findOverduePaidOrders,
  markRefundFailed,
  markRefundSubmitted,
  markRefundSucceeded,
  reconcilePaidJobOutcomes,
  scheduleRefundRetry
} from "@/db/commercial-refunds";
import { issueReportAccessToken, revokeReportAccessTokens } from "@/db/report-tokens";
import type { EmailDeliveryRow, PaymentRefundRow } from "@/db/schema";
import { revealCustomerEmail } from "./customer-email";
import { ResendEmailGateway } from "@/email/resend";
import type { EmailTemplate } from "@/email/gateway";
import { AirwallexGateway } from "@/payments/airwallex";
import { getActiveCombinedGeoReport } from "@/db/combined-reports";
import { isPermanentCommerceProviderError, safeCommerceFailureCode } from "./provider-error";

export interface CommercialOperationResult {
  claimed: number;
  succeeded: number;
  retried: number;
  failed: number;
}

export async function processQueuedCommercialEmails(limit = 25): Promise<CommercialOperationResult> {
  const owner = `email-${randomUUID()}`;
  const deliveries = await claimEmailDeliveries({ owner, limit, leaseSeconds: 120 });
  const result = emptyResult(deliveries.length);
  const gateway = new ResendEmailGateway();
  for (const delivery of deliveries) {
    try {
      await sendDelivery(delivery, owner, gateway);
      result.succeeded += 1;
    } catch (error) {
      const permanent = isPermanentCommerceProviderError(error);
      if (permanent || delivery.attempts >= 5) {
        await markEmailFailed({ id: delivery.id, owner, errorCode: safeCommerceFailureCode(error) });
        result.failed += 1;
      } else {
        await scheduleEmailRetry({ id: delivery.id, owner, errorCode: safeCommerceFailureCode(error), nextRetryAt: retryAt(delivery.attempts) });
        result.retried += 1;
      }
    }
  }
  return result;
}

async function sendDelivery(delivery: EmailDeliveryRow, owner: string, gateway: ResendEmailGateway): Promise<void> {
  if (!delivery.orderId) throw new Error("commercial_email_order_missing");
  const [recipient, order] = await Promise.all([
    getEncryptedEmailRecipient(delivery.id),
    getPaymentOrder(delivery.orderId)
  ]);
  if (!recipient || !order || recipient.emailKeyVersion !== "v1") throw new Error("commercial_email_recipient_unavailable");
  let reportUrl: string | undefined;
  if (delivery.templateType === "report_ready" || delivery.templateType === "limited_report_refund" || delivery.templateType === "link_reissue" || delivery.templateType === "corrected_report_ready" || delivery.templateType === "replacement_report_ready") {
    const activeCombined = await getActiveCombinedGeoReport(delivery.reportId);
    const artifactScope = activeCombined?.report.artifactContract ?? productContractForCode(order.productCode);
    if (delivery.templateType === "link_reissue" && delivery.attempts === 1) {
      await revokeReportAccessTokens(delivery.reportId, artifactScope);
    }
    const access = await issueReportAccessToken({
      reportId: delivery.reportId,
      ttlDays: 30,
      idempotencyKey: `${delivery.businessIdempotencyKey}/${artifactScope}`,
      artifactScope
    });
    reportUrl = new URL(
      `/api/reports/${encodeURIComponent(delivery.reportId)}/access?token=${encodeURIComponent(access.rawToken)}`,
      requiredBaseUrl()
    ).href;
  }
  const sent = await gateway.send({
    to: revealCustomerEmail(recipient.customerEmailEncrypted),
    template: delivery.templateType as EmailTemplate,
    locale: delivery.locale,
    orderReference: order.id,
    siteLabel: order.siteKey,
    idempotencyKey: delivery.businessIdempotencyKey,
    reportUrl
  });
  const marked = await markEmailSent({ id: delivery.id, owner, providerEmailId: sent.providerEmailId });
  if (!marked) throw new Error("commercial_email_lease_lost");
}

export async function processPendingCommercialRefunds(limit = 25): Promise<CommercialOperationResult> {
  const owner = `refund-${randomUUID()}`;
  const refunds = await claimPendingRefunds({ owner, limit, leaseSeconds: 120 });
  const result = emptyResult(refunds.length);
  const gateway = new AirwallexGateway();
  for (const refund of refunds) {
    try {
      await submitRefund(refund, owner, gateway);
      result.succeeded += 1;
    } catch (error) {
      if (isPermanentCommerceProviderError(error) || refund.attempts >= 5) {
        await markRefundFailed({ id: refund.id, owner, errorCode: safeCommerceFailureCode(error) });
        await queueRefundAssistance(refund);
        result.failed += 1;
      } else {
        await scheduleRefundRetry({ id: refund.id, owner, errorCode: safeCommerceFailureCode(error), nextRetryAt: retryAt(refund.attempts) });
        result.retried += 1;
      }
    }
  }
  return result;
}

async function submitRefund(refund: PaymentRefundRow, owner: string, gateway: AirwallexGateway): Promise<void> {
  const order = await getPaymentOrder(refund.orderId);
  if (!order?.providerPaymentId || order.provider !== "airwallex") throw new Error("commercial_refund_payment_unavailable");
  const submitted = await gateway.requestRefund({
    orderId: order.id,
    paymentIntentId: order.providerPaymentId,
    amountMinor: refund.amountMinor,
    currency: refund.currency,
    reason: refund.reason,
    idempotencyKey: refund.idempotencyKey
  });
  if (submitted.status === "failed") throw new Error("commercial_refund_provider_failed");
  if (!await markRefundSubmitted({ id: refund.id, owner, providerRefundId: submitted.providerRefundId })) {
    throw new Error("commercial_refund_lease_lost");
  }
  if (submitted.status === "succeeded") await markRefundSucceeded({ id: refund.id, providerRefundId: submitted.providerRefundId });
}

async function queueRefundAssistance(refund: PaymentRefundRow): Promise<void> {
  const order = await getPaymentOrder(refund.orderId);
  if (!order) return;
  await queueCommercialEmail({
    orderId: order.id,
    reportId: order.reportId,
    templateType: "refund_assistance",
    templateVersion: "v1",
    locale: order.reportLocale,
    recipientRef: order.id,
    businessIdempotencyKey: `refund_assistance/${order.id}/v1`
  });
}

export async function enforceCommercialSla(now = new Date()): Promise<{ warnings: number; expired: number }> {
  const [warnings, overdue] = await Promise.all([find20hWarningOrders(now), findOverduePaidOrders(now)]);
  let expired = 0;
  for (const order of overdue) {
    if ((await expirePaidOrderSla(order.id, now)).expired) expired += 1;
  }
  return { warnings: warnings.length, expired };
}

export async function reconcileTerminalPaidJobs(): Promise<number> {
  return (await reconcilePaidJobOutcomes(100)).reconciled;
}

function emptyResult(claimed: number): CommercialOperationResult {
  return { claimed, succeeded: 0, retried: 0, failed: 0 };
}

function retryAt(attempts: number): Date {
  const seconds = Math.min(3_600, 15 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1_000);
}

function requiredBaseUrl(): string {
  const value = process.env.OGC_REPORT_BASE_URL?.trim();
  if (!value) throw new Error("OGC_REPORT_BASE_URL is required for report email delivery.");
  return value;
}

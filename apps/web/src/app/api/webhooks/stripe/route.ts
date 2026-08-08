import { NextResponse } from "next/server";
import {
  applyPaidPaymentEvent,
  applyReportV4PaidPaymentEvent,
  applyUnsuccessfulPaymentEvent,
  getPaymentOrder,
  isReportV4PaymentOrder,
  markPaymentEventProcessing,
  recordPaymentEvent
} from "@/db/commercial-orders";
import { StripeGateway } from "@/payments/stripe";
import type { VerifiedPaymentEvent } from "@/payments/gateway";

export const runtime = "nodejs";

type WebhookFailureStage =
  | "stripe_webhook_read"
  | "stripe_webhook_verify"
  | "stripe_webhook_bind"
  | "stripe_webhook_apply_paid"
  | "stripe_webhook_apply_unsuccessful"
  | "stripe_webhook_record_ignored";

export async function POST(request: Request) {
  let failureStage: WebhookFailureStage = "stripe_webhook_read";
  try {
    const rawBody = await request.text();
    failureStage = "stripe_webhook_verify";
    const event = new StripeGateway().verifyAndParseWebhook(rawBody, request.headers);
    if (event.outcome === "payment_paid") {
      failureStage = "stripe_webhook_bind";
      const order = await matchingStripeOrder(event);
      if (!event.paymentIntentId) throw new Error("A paid Stripe event is missing its PaymentIntent.");
      const input = {
        provider: "stripe",
        providerEventId: event.eventId,
        eventType: event.eventType,
        orderId: order.id,
        providerPaymentId: event.paymentIntentId,
        providerCreatedAt: event.createdAt,
        payloadHash: event.payloadHash,
        selectedFields: { providerStatus: event.providerStatus }
      } as const;
      failureStage = "stripe_webhook_apply_paid";
      if (isReportV4PaymentOrder(order)) await applyReportV4PaidPaymentEvent(input);
      else await applyPaidPaymentEvent(input);
    } else if (event.outcome === "payment_failed") {
      failureStage = "stripe_webhook_bind";
      const order = await matchingStripeOrder(event);
      failureStage = "stripe_webhook_apply_unsuccessful";
      await applyUnsuccessfulPaymentEvent({
        provider: "stripe",
        providerEventId: event.eventId,
        eventType: event.eventType,
        orderId: order.id,
        status: event.eventType === "checkout.session.expired" ? "cancelled" : "failed",
        providerCreatedAt: event.createdAt,
        payloadHash: event.payloadHash,
        selectedFields: { providerStatus: event.providerStatus }
      });
    } else {
      if (event.providerCheckoutId) failureStage = "stripe_webhook_bind";
      const matchedOrder = event.providerCheckoutId ? await matchingStripeOrder(event) : null;
      const orderId = matchedOrder?.id ?? event.orderId;
      failureStage = "stripe_webhook_record_ignored";
      await recordPaymentEvent({
        provider: "stripe",
        providerEventId: event.eventId,
        eventType: event.eventType,
        orderId,
        providerCreatedAt: event.createdAt,
        payloadHash: event.payloadHash,
        selectedFields: { providerStatus: event.providerStatus }
      });
      await markPaymentEventProcessing({
        provider: "stripe",
        providerEventId: event.eventId,
        status: "ignored",
        orderId
      });
    }
    return NextResponse.json({ received: true });
  } catch {
    console.error("Stripe webhook rejected.", failureStage);
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }
}

async function matchingStripeOrder(event: VerifiedPaymentEvent) {
  if (!event.orderId || !event.providerCheckoutId || event.amountMinor === null || !event.currency) {
    throw new Error("Stripe event is missing its checkout, order, amount, or currency binding.");
  }
  const order = await getPaymentOrder(event.orderId);
  if (
    !order
    || order.provider !== "stripe"
    || order.providerCheckoutId !== event.providerCheckoutId
    || order.amountMinor !== event.amountMinor
    || order.currency !== event.currency
  ) {
    throw new Error("Stripe event does not match its payment order.");
  }
  return order;
}

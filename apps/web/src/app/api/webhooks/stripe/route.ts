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

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const event = new StripeGateway().verifyAndParseWebhook(rawBody, request.headers);
    if (event.outcome === "payment_paid") {
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
      if (isReportV4PaymentOrder(order)) await applyReportV4PaidPaymentEvent(input);
      else await applyPaidPaymentEvent(input);
    } else if (event.outcome === "payment_failed") {
      const order = await matchingStripeOrder(event);
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
      const matchedOrder = event.providerCheckoutId ? await matchingStripeOrder(event) : null;
      const orderId = matchedOrder?.id ?? event.orderId;
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

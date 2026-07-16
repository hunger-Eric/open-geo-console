import { NextResponse } from "next/server";
import {
  applyPaidPaymentEvent,
  applyReportV4PaidPaymentEvent,
  applyUnsuccessfulPaymentEvent,
  getPaymentOrder,
  getPaymentOrderByProviderCheckout,
  isReportV4PaymentOrder,
  markPaymentEventProcessing,
  recordPaymentEvent
} from "@/db/commercial-orders";
import { markRefundSucceededFromProvider } from "@/db/commercial-refunds";
import { AirwallexGateway } from "@/payments/airwallex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let rawBody = "";
  try {
    rawBody = await request.text();
    const event = new AirwallexGateway().verifyAndParseWebhook(rawBody, request.headers);
    if (event.outcome === "payment_paid") {
      const orderId = event.orderId ?? await resolveLegacyPaymentOrder(event);
      if (!orderId || !event.paymentIntentId) throw new Error("A paid event is missing its order or payment identity.");
      const input = {
        provider: "airwallex",
        providerEventId: event.eventId,
        eventType: event.eventType,
        orderId,
        providerPaymentId: event.paymentIntentId,
        providerCreatedAt: event.createdAt,
        payloadHash: event.payloadHash,
        selectedFields: { providerStatus: event.providerStatus }
      } as const;
      const order = await getPaymentOrder(orderId);
      if (isReportV4PaymentOrder(order)) await applyReportV4PaidPaymentEvent(input);
      else await applyPaidPaymentEvent(input);
    } else if (event.outcome === "payment_failed" && event.orderId) {
      await applyUnsuccessfulPaymentEvent({
        provider: "airwallex",
        providerEventId: event.eventId,
        eventType: event.eventType,
        orderId: event.orderId,
        status: event.eventType.toLowerCase().includes("cancel") ? "cancelled" : "failed",
        providerCreatedAt: event.createdAt,
        payloadHash: event.payloadHash,
        selectedFields: { providerStatus: event.providerStatus }
      });
    } else {
      await recordPaymentEvent({
        provider: "airwallex",
        providerEventId: event.eventId,
        eventType: event.eventType,
        orderId: event.orderId,
        providerCreatedAt: event.createdAt,
        payloadHash: event.payloadHash,
        selectedFields: { providerStatus: event.providerStatus }
      });
      if (
        event.outcome === "refund_updated"
        && event.providerRefundId
        && event.providerStatus
        && ["ACCEPTED", "SETTLED"].includes(event.providerStatus.toUpperCase())
      ) {
        await markRefundSucceededFromProvider({ providerRefundId: event.providerRefundId, orderId: event.orderId ?? undefined });
      }
      await markPaymentEventProcessing({
        provider: "airwallex",
        providerEventId: event.eventId,
        status: event.outcome === "ignored" ? "ignored" : "processed",
        orderId: event.orderId
      });
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }
}

async function resolveLegacyPaymentOrder(event: ReturnType<AirwallexGateway["verifyAndParseWebhook"]>): Promise<string | null> {
  if (!event.paymentLinkId) return null;
  const order = await getPaymentOrderByProviderCheckout("airwallex", event.paymentLinkId);
  if (!order || event.currency !== order.currency || event.amountMinor !== order.amountMinor) {
    throw new Error("A legacy paid event does not match its payment order.");
  }
  return order.id;
}

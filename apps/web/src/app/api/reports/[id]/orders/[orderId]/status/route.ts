import { NextResponse } from "next/server";
import { getFulfillmentMode } from "@/commerce/config";
import { getPaymentOrderForReport } from "@/db/commercial-orders";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string; orderId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id, orderId } = await context.params;
  if (!isOpaqueId(id) || !isOpaqueId(orderId)) return notFound();
  const order = await getPaymentOrderForReport(orderId, id);
  if (!order) return notFound();
  return NextResponse.json({
    orderId: order.id,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    refundStatus: order.refundStatus,
    deliveryStatus: order.deliveryStatus,
    deliveryDeadlineAt: order.deliveryDeadlineAt?.toISOString() ?? null,
    fulfillmentMode: getFulfillmentMode()
  }, { headers: { "cache-control": "no-store" } });
}

function isOpaqueId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function notFound() {
  return NextResponse.json({ error: "Order not found." }, { status: 404 });
}

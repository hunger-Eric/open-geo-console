import { NextResponse } from "next/server";
import { getFulfillmentMode } from "@/commerce/config";
import { getPaymentOrder } from "@/db/commercial-orders";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const order = await getPaymentOrder(id);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
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

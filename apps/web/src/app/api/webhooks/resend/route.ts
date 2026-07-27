import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { recordEmailProviderEvent } from "@/db/commercial-delivery";
import { verifyAndParseResendWebhook } from "@/email/resend-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const event = verifyAndParseResendWebhook({ rawBody, headers: request.headers });
    const targetState = event.eventType === "email.delivered"
      ? "delivered"
      : event.eventType === "email.bounced"
        ? "bounced"
        : event.eventType === "email.complained" || event.eventType === "email.suppressed" || event.eventType === "email.failed"
          ? "failed"
          : null;
    if (targetState) {
      await recordEmailProviderEvent({
        providerEventId: event.eventId,
        providerEmailId: event.providerEmailId,
        eventType: event.eventType,
        targetState,
        payloadHash: createHash("sha256").update(rawBody).digest("hex"),
        providerCreatedAt: event.createdAt
      });
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook." }, { status: 400 });
  }
}

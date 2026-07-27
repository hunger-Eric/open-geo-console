import { NextResponse } from "next/server";
import { customerEmailLookupHmac, normalizeCustomerEmail } from "@/commerce/customer-email";
import { requestReportLinkReissue } from "@/db/commercial-delivery";
import { getTrustedClientIp } from "@/security/client-ip";
import { verifyTurnstile } from "@/security/turnstile";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const generic = NextResponse.json({ accepted: true }, { status: 202, headers: { "cache-control": "no-store" } });
  try {
    const body = await request.json() as { orderReference?: unknown; email?: unknown; turnstileToken?: unknown };
    const challenge = await verifyTurnstile({
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : "",
      remoteIp: getTrustedClientIp(request)
    });
    if (!challenge.success) return NextResponse.json({ error: "Human verification is required." }, { status: 403 });
    const orderId = typeof body.orderReference === "string" ? body.orderReference.trim() : "";
    const email = normalizeCustomerEmail(body.email);
    if (orderId && orderId.length <= 128) {
      await requestReportLinkReissue({ orderId, customerEmailHmac: customerEmailLookupHmac(email) });
    }
  } catch {
    // Deliberately return the same response for unknown order/email pairs.
  }
  return generic;
}

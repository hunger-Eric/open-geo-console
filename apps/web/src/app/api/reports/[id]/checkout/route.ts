import { createSiteKey } from "@open-geo-console/site-crawler";
import { NextResponse } from "next/server";
import { assertCommerceEnabled, getPriceSnapshot, parseSupportedCurrency } from "@/commerce/config";
import { normalizeCustomerEmail, protectCustomerEmail } from "@/commerce/customer-email";
import { checkoutIdempotencyHmac } from "@/commerce/idempotency";
import { assertCommerceReady } from "@/commerce/readiness";
import { attachHostedCheckout, createPaymentOrder, getActivePaymentOrderForReport } from "@/db/commercial-orders";
import { getGeoReport } from "@/db/reports";
import { AirwallexGateway } from "@/payments/airwallex";
import { getTrustedClientIp } from "@/security/client-ip";
import { verifyTurnstile } from "@/security/turnstile";
import { parseReportLocale } from "@/server/report-locale";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSmallRequest(request);
    assertCommerceEnabled();
    await assertCommerceReady();
    const { id } = await context.params;
    const body = await request.json() as { email?: unknown; currency?: unknown; locale?: unknown; turnstileToken?: unknown };
    const currency = parseSupportedCurrency(body.currency);
    const locale = parseReportLocale(body.locale);
    if (!currency || !locale) return NextResponse.json({ error: "A supported currency and report locale are required." }, { status: 400 });
    const report = await getGeoReport(id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (!report.reportLocale || report.reportLocale !== locale) {
      return NextResponse.json({ error: "The checkout locale must match the persisted report language." }, { status: 409 });
    }
    const ipAddress = getTrustedClientIp(request);
    const challenge = await verifyTurnstile({
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : "",
      remoteIp: ipAddress
    });
    if (!challenge.success) return NextResponse.json({ error: "Human verification is required." }, { status: 403 });

    const normalizedEmail = normalizeCustomerEmail(body.email);
    const protectedEmail = protectCustomerEmail(normalizedEmail);
    const price = getPriceSnapshot(currency);
    const rawIdempotencyKey = request.headers.get("idempotency-key") ?? "";
    const checkoutHmac = checkoutIdempotencyHmac({ rawKey: rawIdempotencyKey, reportId: id });
    const siteKey = report.siteKey ?? createSiteKey(report.url);

    const active = await getActivePaymentOrderForReport(id, price.productCode);
    if (active && active.checkoutIdempotencyHmac !== checkoutHmac) {
      if (active.customerEmailHmac !== protectedEmail.lookupHmac) {
        return NextResponse.json({ error: "This report already has an active checkout." }, { status: 409 });
      }
      return checkoutResponse(request, active.id, active.providerCheckoutId);
    }

    const order = await createPaymentOrder({
      checkoutIdempotencyHmac: checkoutHmac,
      provider: "airwallex",
      reportId: id,
      siteKey,
      customerEmailEncrypted: protectedEmail.encrypted,
      customerEmailHmac: protectedEmail.lookupHmac,
      emailKeyVersion: "v1",
      productCode: price.productCode,
      catalogVersion: price.catalogVersion,
      termsVersion: price.purchaseTermsVersion,
      refundPolicyVersion: price.refundPolicyVersion,
      reportLocale: locale,
      currency: price.currency,
      amountMinor: price.amountMinor
    });
    return checkoutResponse(request, order.id, order.providerCheckoutId, {
      reportId: id,
      siteKey,
      locale,
      currency: price.currency,
      amountMinor: price.amountMinor
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
    return NextResponse.json({ error: publicError(error) }, { status: 400 });
  }
}

async function checkoutResponse(
  request: Request,
  orderId: string,
  providerCheckoutId: string | null,
  createInput?: { reportId: string; siteKey: string; locale: "en" | "zh"; currency: "CNY" | "USD" | "HKD"; amountMinor: number }
) {
  const gateway = new AirwallexGateway();
  const recovered = providerCheckoutId ? null : await gateway.findHostedCheckoutByReference(orderId);
  const checkout = providerCheckoutId
    ? await gateway.getHostedCheckout(providerCheckoutId, orderId)
    : recovered ?? await gateway.createHostedCheckout({
        orderId,
        reportId: createInput!.reportId,
        siteKey: createInput!.siteKey,
        locale: createInput!.locale,
        currency: createInput!.currency,
        amountMinor: createInput!.amountMinor,
        returnUrl: new URL(`/${createInput!.locale}/reports/${encodeURIComponent(createInput!.reportId)}`, request.url).href
      });
  if (!providerCheckoutId) await attachHostedCheckout({ orderId, providerCheckoutId: checkout.providerCheckoutId });
  return NextResponse.json({
    orderId,
    hpp: {
      intentId: checkout.providerCheckoutId,
      clientSecret: checkout.clientSecret,
      currency: checkout.currency,
      environment: checkout.environment
    }
  }, { status: providerCheckoutId ? 200 : 201 });
}

function assertSmallRequest(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 16_384) throw new Error("Checkout request is too large.");
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unable to create checkout.";
  if (/required|valid|supported|locale|configured|accepting|active checkout/i.test(message)) return message;
  return "Unable to create secure checkout. Please try again later.";
}

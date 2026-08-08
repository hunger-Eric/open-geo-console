import { createSiteKey } from "@open-geo-console/site-crawler";
import { NextResponse } from "next/server";
import { assertCommerceEnabled, getOfferedCurrency, getPriceSnapshot } from "@/commerce/config";
import { normalizeCustomerEmail, protectCustomerEmail } from "@/commerce/customer-email";
import { checkoutIdempotencyHmac } from "@/commerce/idempotency";
import { assertCommerceReady } from "@/commerce/readiness";
import {
  attachHostedCheckout,
  createReportV4PaymentOrder,
  getActivePaymentOrderForReport
} from "@/db/commercial-orders";
import { getGeoReport } from "@/db/reports";
import { StripeGateway } from "@/payments/stripe";
import { getTrustedClientCountry, getTrustedClientIp } from "@/security/client-ip";
import { verifyTurnstile } from "@/security/turnstile";
import { parseReportLocale } from "@/server/report-locale";
import { assertRecommendationProductAvailable } from "@/recommendation-forensics/product-availability";
import {
  issuePaymentReturnAccessCapability,
  paymentReturnAccessCookieName,
  paymentReturnAccessCookieOptions
} from "@/server/payment-return-access";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSmallRequest(request);
    if (assertCommerceEnabled() !== "test") {
      throw new Error("Stripe Checkout is available only in Sandbox commerce.");
    }
    const reportOrigin = requiredReportOrigin();
    await assertCommerceReady();
    await assertRecommendationProductAvailable();
    const { id } = await context.params;
    const body = await request.json() as { email?: unknown; locale?: unknown; turnstileToken?: unknown; questionSetId?: unknown };
    const locale = parseReportLocale(body.locale);
    if (!locale) return NextResponse.json({ error: "A supported report locale is required." }, { status: 400 });
    const report = await getGeoReport(id);
    if (!report) return NextResponse.json({ error: "Report not found." }, { status: 404 });
    if (!report.reportLocale || report.reportLocale !== locale) {
      return NextResponse.json({ error: "The checkout locale must match the persisted report language." }, { status: 409 });
    }
    const ipAddress = getTrustedClientIp(request);
    const countryCode = getTrustedClientCountry(request);
    const challenge = await verifyTurnstile({
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : "",
      remoteIp: ipAddress
    });
    if (!challenge.success) return NextResponse.json({ error: "Human verification is required." }, { status: 403 });

    const normalizedEmail = normalizeCustomerEmail(body.email);
    const protectedEmail = protectCustomerEmail(normalizedEmail);
    const price = getPriceSnapshot(getOfferedCurrency(countryCode));
    const rawIdempotencyKey = request.headers.get("idempotency-key") ?? "";
    const checkoutHmac = checkoutIdempotencyHmac({ rawKey: rawIdempotencyKey, reportId: id });
    const siteKey = report.siteKey ?? createSiteKey(report.url);
    const businessQuestionSetId = typeof body.questionSetId === "string" ? body.questionSetId.trim() : "";
    if (!businessQuestionSetId) {
      return NextResponse.json({ error: "A confirmed paid-report question set is required." }, { status: 409 });
    }
    const checkoutInput = {
      reportId: id,
      siteKey,
      locale,
      currency: price.currency,
      amountMinor: price.amountMinor
    };

    const active = await getActivePaymentOrderForReport(id, "recommendation_forensics_v1");
    if (active && active.checkoutIdempotencyHmac !== checkoutHmac) {
      if (active.businessQuestionSetId !== businessQuestionSetId) {
        return NextResponse.json({ error: "This report already has an active checkout bound to another question set." }, { status: 409 });
      }
      if (active.customerEmailHmac !== protectedEmail.lookupHmac) {
        return NextResponse.json({ error: "This report already has an active checkout." }, { status: 409 });
      }
      return checkoutResponse(request, reportOrigin, active.id, active.provider, active.providerCheckoutId, {
        ...checkoutInput,
        currency: active.currency,
        amountMinor: active.amountMinor
      }, !active.providerCheckoutId);
    }

    const order = await createReportV4PaymentOrder({
      checkoutIdempotencyHmac: checkoutHmac,
      provider: "stripe",
      reportId: id,
      siteKey,
      customerEmailEncrypted: protectedEmail.encrypted,
      customerEmailHmac: protectedEmail.lookupHmac,
      emailKeyVersion: "v1",
      businessQuestionSetId,
      catalogVersion: price.catalogVersion,
      termsVersion: price.purchaseTermsVersion,
      refundPolicyVersion: price.refundPolicyVersion,
      reportLocale: locale,
      currency: price.currency,
      amountMinor: price.amountMinor
    });
    return checkoutResponse(request, reportOrigin, order.id, order.provider, order.providerCheckoutId, {
      ...checkoutInput,
      currency: order.currency,
      amountMinor: order.amountMinor
    }, true);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error(error);
    return NextResponse.json({ error: publicError(error) }, { status: 400 });
  }
}

async function checkoutResponse(
  request: Request,
  reportOrigin: URL,
  orderId: string,
  provider: "airwallex" | "stripe",
  providerCheckoutId: string | null,
  createInput: { reportId: string; siteKey: string; locale: "en" | "zh"; currency: "CNY" | "USD" | "HKD"; amountMinor: number },
  issueReturnCapability: boolean
) {
  if (provider !== "stripe") {
    return NextResponse.json({ error: "This report already has an active checkout from another payment provider." }, { status: 409 });
  }
  const gateway = new StripeGateway();
  const checkout = providerCheckoutId
    ? await gateway.getHostedCheckout(providerCheckoutId, orderId, {
        currency: createInput.currency,
        amountMinor: createInput.amountMinor
      })
    : await gateway.createHostedCheckout({
        orderId,
        reportId: createInput.reportId,
        siteKey: createInput.siteKey,
        locale: createInput.locale,
        currency: createInput.currency,
        amountMinor: createInput.amountMinor,
        returnUrl: resolveReportReturnUrl(request, reportOrigin, createInput.reportId, createInput.locale)
      });
  if (checkout.provider !== "stripe") throw new Error("Stripe checkout returned another provider identity.");
  if (!providerCheckoutId) await attachHostedCheckout({ orderId, providerCheckoutId: checkout.providerCheckoutId });
  const response = NextResponse.json({
    orderId,
    checkoutUrl: checkout.checkoutUrl
  }, { status: providerCheckoutId ? 200 : 201 });
  if (issueReturnCapability) {
    const capability = issuePaymentReturnAccessCapability({ reportId: createInput.reportId, orderId });
    response.cookies.set(
      paymentReturnAccessCookieName(createInput.reportId),
      capability.raw,
      paymentReturnAccessCookieOptions(capability.expiresAt)
    );
  }
  return response;
}

function resolveReportReturnUrl(
  request: Request,
  reportOrigin: URL,
  reportId: string,
  locale: "en" | "zh"
): string {
  const expected = new URL(`/${locale}/reports/${encodeURIComponent(reportId)}`, reportOrigin);
  const referer = request.headers.get("referer");
  if (!referer) return expected.href;
  try {
    const candidate = new URL(referer);
    return candidate.origin === expected.origin && candidate.pathname === expected.pathname
      ? candidate.href
      : expected.href;
  } catch {
    return expected.href;
  }
}

function requiredReportOrigin(environment: NodeJS.ProcessEnv = process.env): URL {
  const raw = environment.OGC_REPORT_BASE_URL?.trim();
  if (!raw) throw new Error("A canonical report origin is required for Stripe Checkout.");
  const url = new URL(raw);
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localHttp) || url.username || url.password) {
    throw new Error("The canonical report origin is invalid for Stripe Checkout.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function assertSmallRequest(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 16_384) throw new Error("Checkout request is too large.");
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unable to create checkout.";
  if (message === "The recommendation-forensics product is not available.") return message;
  return "Unable to create secure checkout. Please try again later.";
}

import { createHash } from "node:crypto";
import Stripe from "stripe";
import { getCommerceMode, parseSupportedCurrency } from "@/commerce/config";
import { CommerceProviderError, type CommerceProviderOperation } from "@/commerce/provider-error";
import type {
  HostedCheckoutInput,
  HostedCheckoutExpectation,
  HostedCheckoutResult,
  PaymentGateway,
  RefundInput,
  RefundResult,
  VerifiedPaymentEvent
} from "./gateway";

interface StripeGatewayOptions {
  environment?: NodeJS.ProcessEnv;
  client?: StripeClient;
}

interface StripeClient {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options: Stripe.RequestOptions
      ): Promise<Stripe.Checkout.Session>;
      retrieve(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
  refunds: {
    create(
      params: Stripe.RefundCreateParams,
      options: Stripe.RequestOptions
    ): Promise<Stripe.Refund>;
  };
  webhooks: {
    constructEvent(payload: string | Buffer, signature: string, secret: string): Stripe.Event;
  };
}

export class StripeGateway implements PaymentGateway {
  private readonly environment: NodeJS.ProcessEnv;
  private readonly providedClient?: StripeClient;
  private clientInstance?: StripeClient;

  constructor(options: StripeGatewayOptions = {}) {
    this.environment = options.environment ?? process.env;
    this.providedClient = options.client;
  }

  async createHostedCheckout(input: HostedCheckoutInput): Promise<HostedCheckoutResult> {
    const urls = buildStripeReturnUrls(input.returnUrl, input.orderId);
    try {
      const session = await this.client().checkout.sessions.create({
        mode: "payment",
        ui_mode: "hosted_page",
        client_reference_id: input.orderId,
        success_url: urls.successUrl,
        cancel_url: urls.cancelUrl,
        locale: input.locale,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: input.amountMinor,
            product_data: {
              name: input.locale === "zh" ? "Open GEO Console 付费报告" : "Open GEO Console paid report"
            }
          }
        }],
        metadata: stripeMetadata(input),
        payment_intent_data: { metadata: stripeMetadata(input) }
      }, { idempotencyKey: `ogc/stripe/checkout/hosted-page-v1/${input.orderId}` });
      return parseCheckoutSession(session, input.orderId, {
        amountMinor: input.amountMinor,
        currency: input.currency
      }, "checkout");
    } catch (error) {
      throw normalizeStripeError(error, "checkout");
    }
  }

  async getHostedCheckout(
    providerCheckoutId: string,
    orderId: string,
    expected?: HostedCheckoutExpectation
  ): Promise<HostedCheckoutResult> {
    assertStripeCheckoutSessionId(providerCheckoutId);
    try {
      const session = await this.client().checkout.sessions.retrieve(providerCheckoutId);
      return parseCheckoutSession(session, orderId, expected ?? null, "retrieve");
    } catch (error) {
      throw normalizeStripeError(error, "retrieve");
    }
  }

  async findHostedCheckoutByReference(): Promise<HostedCheckoutResult | null> {
    return null;
  }

  verifyAndParseWebhook(rawBody: string, headers: Headers): VerifiedPaymentEvent {
    if (Buffer.byteLength(rawBody, "utf8") > 256_000) throw new Error("Stripe webhook body is too large.");
    const signature = headers.get("stripe-signature")?.trim();
    if (!signature) throw new Error("Stripe webhook signature is required.");
    const secret = requiredWebhookSecret(this.environment);
    const event = this.client().webhooks.constructEvent(rawBody, signature, secret);
    if (event.livemode !== false) throw new Error("Live Stripe events are not accepted in Sandbox commerce.");
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const session = isCheckoutSessionEvent(event.type)
      ? event.data.object as Stripe.Checkout.Session
      : null;
    const orderId = session ? checkoutOrderId(session) : null;
    const paymentIntentId = session ? expandableId(session.payment_intent) : null;
    const currency = session?.currency
      ? parseSupportedCurrency(session.currency.toUpperCase())
      : null;
    const amountMinor = Number.isSafeInteger(session?.amount_total) ? session!.amount_total : null;
    const providerStatus = session ? `${session.status ?? "unknown"}/${session.payment_status}` : null;

    return {
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      createdAt: new Date(event.created * 1_000),
      orderId,
      providerCheckoutId: session?.id ?? null,
      paymentLinkId: null,
      paymentIntentId,
      providerRefundId: null,
      amountMinor,
      currency,
      payloadHash,
      outcome: stripeOutcome(event.type, session),
      providerStatus
    };
  }

  async requestRefund(input: RefundInput): Promise<RefundResult> {
    try {
      const refund = await this.client().refunds.create({
        payment_intent: input.paymentIntentId,
        amount: input.amountMinor,
        reason: "requested_by_customer",
        metadata: { ogc_order_id: input.orderId }
      }, { idempotencyKey: input.idempotencyKey });
      if (typeof refund.id !== "string" || !refund.id) {
        throw new CommerceProviderError("stripe", "refund", "invalid_response");
      }
      return { providerRefundId: refund.id, status: stripeRefundStatus(refund.status) };
    } catch (error) {
      throw normalizeStripeError(error, "refund");
    }
  }

  private client(): StripeClient {
    if (this.providedClient) return this.providedClient;
    this.clientInstance ??= new Stripe(requiredStripeTestKey(this.environment));
    return this.clientInstance;
  }
}

function stripeMetadata(input: HostedCheckoutInput): Record<string, string> {
  return {
    ogc_order_id: input.orderId,
    ogc_report_id: input.reportId,
    ogc_site_key: input.siteKey
  };
}

function parseCheckoutSession(
  session: Stripe.Checkout.Session,
  orderId: string,
  expected: HostedCheckoutExpectation | null,
  operation: Extract<CommerceProviderOperation, "checkout" | "retrieve">
): HostedCheckoutResult {
  assertStripeCheckoutSessionId(session.id);
  if (session.livemode !== false) throw new CommerceProviderError("stripe", operation, "invalid_response");
  let sessionOrderId: string | null;
  try {
    sessionOrderId = checkoutOrderId(session);
  } catch {
    throw new CommerceProviderError("stripe", operation, "invalid_response");
  }
  if (sessionOrderId !== orderId) throw new CommerceProviderError("stripe", operation, "invalid_response");
  const currency = session.currency ? parseSupportedCurrency(session.currency.toUpperCase()) : null;
  if (
    !currency
    || !Number.isSafeInteger(session.amount_total)
    || session.amount_total! <= 0
    || (expected && (currency !== expected.currency || session.amount_total !== expected.amountMinor))
  ) {
    throw new CommerceProviderError("stripe", operation, "invalid_response");
  }
  if (!session.url || !isStripeCheckoutUrl(session.url)) {
    throw new CommerceProviderError("stripe", operation, "invalid_response");
  }
  return {
    provider: "stripe",
    providerCheckoutId: session.id,
    checkoutUrl: session.url,
    currency,
    environment: "test"
  };
}

function checkoutOrderId(session: Stripe.Checkout.Session): string | null {
  const reference = session.client_reference_id?.trim() || null;
  const metadataOrderId = session.metadata?.ogc_order_id?.trim() || null;
  if (reference && metadataOrderId && reference !== metadataOrderId) {
    throw new Error("Stripe Checkout Session order identities do not match.");
  }
  const orderId = reference ?? metadataOrderId;
  return orderId && /^[a-zA-Z0-9_-]{1,128}$/.test(orderId) ? orderId : null;
}

function expandableId(value: string | { id: string } | null): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

function stripeOutcome(
  eventType: string,
  session: Stripe.Checkout.Session | null
): VerifiedPaymentEvent["outcome"] {
  if (!session) return "ignored";
  if (eventType === "checkout.session.async_payment_failed" || eventType === "checkout.session.expired") {
    return "payment_failed";
  }
  if (eventType === "checkout.session.async_payment_succeeded" && session.payment_status === "paid") {
    return "payment_paid";
  }
  if (eventType === "checkout.session.completed" && session.payment_status === "paid") return "payment_paid";
  return "ignored";
}

function isCheckoutSessionEvent(eventType: string): boolean {
  return [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "checkout.session.expired"
  ].includes(eventType);
}

function buildStripeReturnUrls(returnUrl: string, orderId: string): { successUrl: string; cancelUrl: string } {
  const base = new URL(returnUrl);
  if (
    (base.protocol !== "https:"
      && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)))
    || base.username
    || base.password
  ) {
    throw new Error("Stripe checkout return URL is invalid.");
  }
  base.hash = "";
  base.searchParams.delete("order");
  base.searchParams.delete("payment_return");
  const success = new URL(base);
  success.searchParams.set("order", orderId);
  success.searchParams.set("payment_return", "success");
  const cancel = new URL(base);
  cancel.searchParams.set("order", orderId);
  cancel.searchParams.set("payment_return", "cancel");
  return { successUrl: success.href, cancelUrl: cancel.href };
}

function requiredStripeTestKey(environment: NodeJS.ProcessEnv): string {
  if (getCommerceMode(environment) !== "test") {
    throw new CommerceProviderError("stripe", "configuration", "invalid_configuration");
  }
  const key = environment.STRIPE_SECRET_KEY?.trim();
  if (!key?.startsWith("sk_test_")) {
    throw new CommerceProviderError("stripe", "configuration", "invalid_configuration");
  }
  return key;
}

function requiredWebhookSecret(environment: NodeJS.ProcessEnv): string {
  const secret = environment.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret?.startsWith("whsec_")) {
    throw new CommerceProviderError("stripe", "configuration", "invalid_configuration");
  }
  return secret;
}

function assertStripeCheckoutSessionId(value: string): void {
  if (!/^cs_test_[a-zA-Z0-9_]{8,}$/.test(value)) {
    throw new Error("Stripe Sandbox Checkout Session ID is invalid.");
  }
}

function isStripeCheckoutUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com";
  } catch {
    return false;
  }
}

function normalizeStripeError(error: unknown, operation: CommerceProviderOperation): CommerceProviderError {
  if (error instanceof CommerceProviderError) return error;
  const status = stripeStatusCode(error);
  return new CommerceProviderError(
    "stripe",
    operation,
    status ? "http" : "network",
    status,
    { cause: error }
  );
}

function stripeRefundStatus(status: Stripe.Refund["status"]): RefundResult["status"] {
  switch (status) {
    case "succeeded": return "succeeded";
    case "pending": return "submitted";
    case "failed":
    case "canceled": return "failed";
    default: return "pending";
  }
}

function stripeStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return undefined;
  const status = (error as { statusCode?: unknown }).statusCode;
  return Number.isInteger(status) ? status as number : undefined;
}

import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceProviderError } from "@/commerce/provider-error";
import { StripeGateway } from "./stripe";

const environment = {
  COMMERCE_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_example",
  STRIPE_WEBHOOK_SECRET: "whsec_test_secret"
};

const checkoutInput = {
  orderId: "order-1",
  reportId: "report-1",
  siteKey: "example.com",
  locale: "en" as const,
  amountMinor: 9_900,
  currency: "USD" as const,
  returnUrl: "https://example.test/en/reports/report-1?tab=overview#checkout"
};

describe("StripeGateway", () => {
  const create = vi.fn();
  const retrieve = vi.fn();
  const constructEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue(checkoutSession());
    retrieve.mockResolvedValue(checkoutSession());
  });

  it("creates one hosted payment Session with stable idempotency and exact return URLs", async () => {
    const gateway = gatewayWithClient();
    await expect(gateway.createHostedCheckout(checkoutInput)).resolves.toEqual({
      provider: "stripe",
      providerCheckoutId: "cs_test_checkout1234",
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_checkout1234",
      currency: "USD",
      environment: "test"
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment",
      ui_mode: "hosted_page",
      client_reference_id: "order-1",
      success_url: "https://example.test/en/reports/report-1?tab=overview&order=order-1&payment_return=success",
      cancel_url: "https://example.test/en/reports/report-1?tab=overview&order=order-1&payment_return=cancel",
      metadata: {
        ogc_order_id: "order-1",
        ogc_report_id: "report-1",
        ogc_site_key: "example.com"
      },
      line_items: [{
        quantity: 1,
        price_data: expect.objectContaining({ currency: "usd", unit_amount: 9_900 })
      }]
    }), { idempotencyKey: "ogc/stripe/checkout/hosted-page-v1/order-1" });
  });

  it("retrieves only a test Session bound to the same local order", async () => {
    const gateway = gatewayWithClient();
    await expect(gateway.getHostedCheckout("cs_test_checkout1234", "order-1", {
      amountMinor: 9_900,
      currency: "USD"
    }))
      .resolves.toMatchObject({ providerCheckoutId: "cs_test_checkout1234" });
    retrieve.mockResolvedValue(checkoutSession({ client_reference_id: "another-order" }));
    await expect(gateway.getHostedCheckout("cs_test_checkout1234", "order-1", {
      amountMinor: 9_900,
      currency: "USD"
    }))
      .rejects.toMatchObject({ provider: "stripe", operation: "retrieve", category: "invalid_response" });
  });

  it("rejects a Session whose amount, currency, or livemode does not match the local order", async () => {
    create.mockResolvedValueOnce(checkoutSession({ amount_total: 1 }));
    await expect(gatewayWithClient().createHostedCheckout(checkoutInput)).rejects.toMatchObject({
      provider: "stripe", operation: "checkout", category: "invalid_response"
    });

    retrieve.mockResolvedValueOnce(checkoutSession({ currency: "cny" }));
    await expect(gatewayWithClient().getHostedCheckout("cs_test_checkout1234", "order-1", {
      amountMinor: 9_900,
      currency: "USD"
    })).rejects.toMatchObject({ provider: "stripe", operation: "retrieve", category: "invalid_response" });

    retrieve.mockResolvedValueOnce(checkoutSession({ livemode: true }));
    await expect(gatewayWithClient().getHostedCheckout("cs_test_checkout1234", "order-1", {
      amountMinor: 9_900,
      currency: "USD"
    })).rejects.toMatchObject({ provider: "stripe", operation: "retrieve", category: "invalid_response" });
  });

  it("rejects missing or live keys in test commerce before calling Stripe", async () => {
    const missing = new StripeGateway({ environment: { COMMERCE_MODE: "test" } });
    await expect(missing.createHostedCheckout(checkoutInput)).rejects.toMatchObject({
      provider: "stripe", operation: "configuration", category: "invalid_configuration"
    });
    const live = new StripeGateway({ environment: { COMMERCE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_forbidden" } });
    await expect(live.createHostedCheckout(checkoutInput)).rejects.toBeInstanceOf(CommerceProviderError);
  });

  it("rejects an untrusted hosted URL returned by the provider", async () => {
    create.mockResolvedValue(checkoutSession({ url: "https://attacker.example/checkout" }));
    await expect(gatewayWithClient().createHostedCheckout(checkoutInput)).rejects.toMatchObject({
      provider: "stripe", operation: "checkout", category: "invalid_response"
    });
  });

  it("rejects unsafe return URL origins before calling Stripe", async () => {
    const gateway = gatewayWithClient();
    await expect(gateway.createHostedCheckout({
      ...checkoutInput,
      returnUrl: "http://attacker.example/en/reports/report-1"
    })).rejects.toThrow("return URL is invalid");
    await expect(gateway.createHostedCheckout({
      ...checkoutInput,
      returnUrl: "https://user:password@example.test/en/reports/report-1"
    })).rejects.toThrow("return URL is invalid");
    expect(create).not.toHaveBeenCalled();
  });

  it("verifies the raw Stripe signature and extracts the bound payment event", () => {
    const payload = signedCheckoutEventPayload();
    const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: environment.STRIPE_WEBHOOK_SECRET
    });
    const event = new StripeGateway({ environment }).verifyAndParseWebhook(
      payload,
      new Headers({ "stripe-signature": signature })
    );

    expect(event).toMatchObject({
      provider: "stripe",
      eventId: "evt_checkout_1",
      eventType: "checkout.session.completed",
      orderId: "order-1",
      providerCheckoutId: "cs_test_checkout1234",
      paymentIntentId: "pi_1",
      amountMinor: 9_900,
      currency: "USD",
      outcome: "payment_paid",
      providerStatus: "complete/paid"
    });
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a signature when the raw body changes", () => {
    const payload = signedCheckoutEventPayload();
    const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: environment.STRIPE_WEBHOOK_SECRET
    });
    expect(() => new StripeGateway({ environment }).verifyAndParseWebhook(
      `${payload} `,
      new Headers({ "stripe-signature": signature })
    )).toThrow();
  });

  it("rejects a correctly signed live event in Sandbox commerce", () => {
    const payload = signedCheckoutEventPayload({ livemode: true });
    const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: environment.STRIPE_WEBHOOK_SECRET
    });
    expect(() => new StripeGateway({ environment }).verifyAndParseWebhook(
      payload,
      new Headers({ "stripe-signature": signature })
    )).toThrow("Live Stripe events are not accepted");
  });

  it("does not treat an async success event as paid without paid Session status", () => {
    const payload = signedCheckoutEventPayload({
      eventType: "checkout.session.async_payment_succeeded",
      paymentStatus: "unpaid"
    });
    const stripe = new Stripe(environment.STRIPE_SECRET_KEY);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: environment.STRIPE_WEBHOOK_SECRET
    });
    const event = new StripeGateway({ environment }).verifyAndParseWebhook(
      payload,
      new Headers({ "stripe-signature": signature })
    );
    expect(event.outcome).toBe("ignored");
  });

  it("fails closed for Stripe refunds in this sandbox-only scope", async () => {
    await expect(gatewayWithClient().requestRefund({
      orderId: "order-1",
      paymentIntentId: "pi_1",
      amountMinor: 9_900,
      currency: "USD",
      reason: "operator_approved",
      idempotencyKey: "refund/order-1"
    })).rejects.toMatchObject({
      provider: "stripe", operation: "refund", category: "invalid_configuration"
    });
  });

  function gatewayWithClient() {
    return new StripeGateway({
      environment,
      client: {
        checkout: { sessions: { create, retrieve } },
        webhooks: { constructEvent }
      }
    });
  }
});

function checkoutSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_checkout1234",
    object: "checkout.session",
    livemode: false,
    client_reference_id: "order-1",
    metadata: { ogc_order_id: "order-1", ogc_report_id: "report-1", ogc_site_key: "example.com" },
    currency: "usd",
    amount_total: 9_900,
    payment_intent: "pi_1",
    payment_status: "unpaid",
    status: "open",
    url: "https://checkout.stripe.com/c/pay/cs_test_checkout1234",
    ...overrides
  } as Stripe.Checkout.Session;
}

function signedCheckoutEventPayload(overrides: {
  eventType?: string;
  livemode?: boolean;
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus;
} = {}): string {
  return JSON.stringify({
    id: "evt_checkout_1",
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: 1_775_520_000,
    data: {
      object: checkoutSession({
        payment_status: overrides.paymentStatus ?? "paid",
        status: "complete"
      })
    },
    livemode: overrides.livemode ?? false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: overrides.eventType ?? "checkout.session.completed"
  });
}

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeoReport: vi.fn(),
  getActivePaymentOrderForReport: vi.fn(),
  createPaymentOrder: vi.fn(),
  attachHostedCheckout: vi.fn(),
  verifyTurnstile: vi.fn(),
  createHostedCheckout: vi.fn(),
  getHostedCheckout: vi.fn(),
  assertRecommendationProductAvailable: vi.fn()
}));

vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/commercial-orders", () => ({
  getActivePaymentOrderForReport: mocks.getActivePaymentOrderForReport,
  createPaymentOrder: mocks.createPaymentOrder,
  attachHostedCheckout: mocks.attachHostedCheckout
}));
vi.mock("@/security/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/recommendation-forensics/product-availability", () => ({
  assertRecommendationProductAvailable: mocks.assertRecommendationProductAvailable
}));
vi.mock("@/payments/stripe", () => ({
  StripeGateway: class {
    createHostedCheckout = mocks.createHostedCheckout;
    getHostedCheckout = mocks.getHostedCheckout;
  }
}));

import { POST } from "./route";
import { protectCustomerEmail } from "@/commerce/customer-email";

const stripeCheckout = {
  provider: "stripe",
  providerCheckoutId: "cs_test_checkout1234",
  checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_checkout1234",
  currency: "USD",
  environment: "test"
} as const;

describe("commercial checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMMERCE_MODE = "test";
    process.env.STRIPE_SECRET_KEY = "sk_test_example";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_example";
    process.env.OGC_REPLY_TO_EMAIL = "support@example.test";
    process.env.OGC_EMAIL_ENCRYPTION_SECRET = "encryption-secret-with-at-least-32-characters";
    process.env.OGC_EMAIL_LOOKUP_SECRET = "lookup-secret-with-at-least-32-characters";
    process.env.OGC_PAYMENT_IDEMPOTENCY_SECRET = "payment-idempotency-secret-at-least-32-chars";
    process.env.OGC_TOKEN_HASH_SECRET = "return-capability-secret-at-least-32-characters";
    process.env.OGC_REPORT_BASE_URL = "https://example.test";
    delete process.env.OGC_TRUST_VERCEL_HEADERS;
    mocks.getGeoReport.mockResolvedValue({
      id: "report-1",
      url: "https://example.com",
      siteKey: "example.com",
      reportLocale: "en"
    });
    mocks.getActivePaymentOrderForReport.mockResolvedValue(null);
    mocks.verifyTurnstile.mockResolvedValue({ success: true, errorCodes: [] });
    mocks.createPaymentOrder.mockImplementation(async (input: { provider: string; currency: string; amountMinor: number }) => ({
      id: "order-1",
      provider: input.provider,
      providerCheckoutId: null,
      currency: input.currency,
      amountMinor: input.amountMinor
    }));
    mocks.assertRecommendationProductAvailable.mockResolvedValue(undefined);
    mocks.createHostedCheckout.mockResolvedValue(stripeCheckout);
    mocks.getHostedCheckout.mockResolvedValue(stripeCheckout);
  });

  it("creates only a server-selected Stripe test order and returns a hosted Checkout URL", async () => {
    process.env.OGC_TRUST_VERCEL_HEADERS = "true";
    mocks.createHostedCheckout.mockResolvedValue({ ...stripeCheckout, currency: "CNY" });
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "request-123",
        "x-vercel-ip-country": "CN",
        referer: "https://example.test/en/reports/report-1?tab=overview#checkout"
      },
      body: JSON.stringify({
        email: "buyer@example.com",
        currency: "USD",
        locale: "en",
        turnstileToken: "human",
        amountMinor: 1,
        siteSnapshotId: "attacker-snapshot",
        questionSetId: "teaser-questions-1"
      })
    }), { params: Promise.resolve({ id: "report-1" }) });

    expect(response.status).toBe(201);
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({
      provider: "stripe",
      currency: "CNY",
      amountMinor: 29_900,
      productCode: "recommendation_forensics_v1",
      businessQuestionSetId: "teaser-questions-1"
    }));
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.not.objectContaining({
      siteSnapshotId: expect.anything()
    }));
    expect(mocks.createHostedCheckout).toHaveBeenCalledOnce();
    expect(mocks.createHostedCheckout).toHaveBeenCalledWith(expect.objectContaining({
      currency: "CNY",
      amountMinor: 29_900,
      returnUrl: "https://example.test/en/reports/report-1?tab=overview#checkout"
    }));
    await expect(response.clone().json()).resolves.toEqual({
      orderId: "order-1",
      checkoutUrl: stripeCheckout.checkoutUrl
    });
    const returnCookie = response.headers.get("set-cookie") ?? "";
    expect(returnCookie).toMatch(/^ogc_payment_return_report-1=/i);
    expect(returnCookie).toMatch(/; Secure/i);
    expect(returnCookie).toMatch(/; HttpOnly/i);
    expect(returnCookie).toMatch(/; SameSite=Lax/i);
  });

  it("defaults invalid trusted country information to the USD offer", async () => {
    process.env.OGC_TRUST_VERCEL_HEADERS = "true";
    const response = await checkoutRequest({
      headers: { "x-vercel-ip-country": "ZZ" },
      body: { questionSetId: "teaser-questions-1" }
    });

    expect(response.status).toBe(201);
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ currency: "USD", amountMinor: 9_900 }));
    await expect(response.json()).resolves.toMatchObject({ checkoutUrl: stripeCheckout.checkoutUrl });
  });

  it("ignores an off-origin return referer", async () => {
    const response = await checkoutRequest({
      headers: { referer: "https://attacker.example/en/reports/report-1?order=stolen" },
      body: { questionSetId: "teaser-questions-1" }
    });

    expect(response.status).toBe(201);
    expect(mocks.createHostedCheckout).toHaveBeenCalledWith(expect.objectContaining({
      returnUrl: "https://example.test/en/reports/report-1"
    }));
  });

  it("anchors return URLs to the configured report origin instead of the request Host", async () => {
    const response = await checkoutRequest({
      requestUrl: "https://attacker.example/api/reports/report-1/checkout",
      headers: { referer: "https://attacker.example/en/reports/report-1?order=stolen" },
      body: { questionSetId: "teaser-questions-1" }
    });

    expect(response.status).toBe(201);
    expect(mocks.createHostedCheckout).toHaveBeenCalledWith(expect.objectContaining({
      returnUrl: "https://example.test/en/reports/report-1"
    }));
  });

  it("rejects live commerce before creating a local order", async () => {
    process.env.COMMERCE_MODE = "live";
    const response = await checkoutRequest({ body: { questionSetId: "teaser-questions-1" } });

    expect(response.status).toBe(400);
    expect(mocks.getGeoReport).not.toHaveBeenCalled();
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
  });

  it("stops before creating a Stripe Session while the product is unavailable", async () => {
    mocks.assertRecommendationProductAvailable.mockRejectedValue(new Error("The recommendation-forensics product is not available."));
    const response = await checkoutRequest({ body: { questionSetId: "teaser-questions-1" } });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The recommendation-forensics product is not available." });
    expect(mocks.getActivePaymentOrderForReport).not.toHaveBeenCalled();
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
  });

  it("requires the persisted teaser question-set identity", async () => {
    const response = await checkoutRequest();
    expect(response.status).toBe(409);
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
  });

  it("requires the immutable report locale", async () => {
    const response = await checkoutRequest({ body: { locale: "zh", questionSetId: "teaser-questions-1" } });
    expect(response.status).toBe(409);
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("retrieves an existing Stripe Session without minting another return capability", async () => {
    mocks.getActivePaymentOrderForReport.mockResolvedValue({
      id: "order-1",
      provider: "stripe",
      providerCheckoutId: "cs_test_checkout1234",
      checkoutIdempotencyHmac: "another-checkout",
      businessQuestionSetId: "teaser-questions-1",
      customerEmailHmac: protectCustomerEmail("buyer@example.com").lookupHmac,
      currency: "USD",
      amountMinor: 9_900
    });
    const response = await checkoutRequest({ body: { questionSetId: "teaser-questions-1" } });

    expect(response.status).toBe(200);
    expect(mocks.getHostedCheckout).toHaveBeenCalledWith("cs_test_checkout1234", "order-1", {
      amountMinor: 9_900,
      currency: "USD"
    });
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("resumes an order that has no Stripe Session and mints its first return capability", async () => {
    mocks.getActivePaymentOrderForReport.mockResolvedValue({
      id: "order-1",
      provider: "stripe",
      providerCheckoutId: null,
      checkoutIdempotencyHmac: "another-checkout",
      businessQuestionSetId: "teaser-questions-1",
      customerEmailHmac: protectCustomerEmail("buyer@example.com").lookupHmac,
      currency: "USD",
      amountMinor: 9_900
    });
    const response = await checkoutRequest({ body: { questionSetId: "teaser-questions-1" } });

    expect(response.status).toBe(201);
    expect(mocks.createHostedCheckout).toHaveBeenCalledOnce();
    expect(mocks.getHostedCheckout).not.toHaveBeenCalled();
    expect(mocks.attachHostedCheckout).toHaveBeenCalledWith({
      orderId: "order-1",
      providerCheckoutId: "cs_test_checkout1234"
    });
    expect(response.headers.get("set-cookie")).toMatch(/^ogc_payment_return_report-1=/i);
  });

  it("fails closed instead of migrating an existing Airwallex order", async () => {
    mocks.getActivePaymentOrderForReport.mockResolvedValue({
      id: "order-1",
      provider: "airwallex",
      providerCheckoutId: "int_existing",
      checkoutIdempotencyHmac: "another-checkout",
      businessQuestionSetId: "teaser-questions-1",
      customerEmailHmac: protectCustomerEmail("buyer@example.com").lookupHmac,
      currency: "USD",
      amountMinor: 9_900
    });
    const response = await checkoutRequest({ body: { questionSetId: "teaser-questions-1" } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "This report already has an active checkout from another payment provider." });
    expect(mocks.getHostedCheckout).not.toHaveBeenCalled();
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
  });

  it("never returns an internal database query when checkout creation fails", async () => {
    mocks.createPaymentOrder.mockRejectedValue(new Error("Failed query: insert into payment_orders"));
    const response = await checkoutRequest({ body: { questionSetId: "teaser-questions-1" } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unable to create secure checkout. Please try again later." });
  });
});

async function checkoutRequest(input: {
  requestUrl?: string;
  headers?: Record<string, string>;
  body?: { locale?: "en" | "zh"; questionSetId?: string };
} = {}) {
  return POST(new Request(input.requestUrl ?? "https://example.test/api/reports/report-1/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "request-123",
      ...input.headers
    },
    body: JSON.stringify({
      email: "buyer@example.com",
      locale: input.body?.locale ?? "en",
      turnstileToken: "human",
      questionSetId: input.body?.questionSetId
    })
  }), { params: Promise.resolve({ id: "report-1" }) });
}

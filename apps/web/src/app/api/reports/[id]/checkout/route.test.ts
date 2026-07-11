import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeoReport: vi.fn(), getActivePaymentOrderForReport: vi.fn(), createPaymentOrder: vi.fn(), attachHostedCheckout: vi.fn(),
  replaceLegacyHostedCheckout: vi.fn(), verifyTurnstile: vi.fn(), createHostedCheckout: vi.fn(),
  getHostedCheckout: vi.fn(), findHostedCheckoutByReference: vi.fn(), deactivateLegacyHostedCheckout: vi.fn()
}));

vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/commercial-orders", () => ({
  getActivePaymentOrderForReport: mocks.getActivePaymentOrderForReport,
  createPaymentOrder: mocks.createPaymentOrder,
  attachHostedCheckout: mocks.attachHostedCheckout,
  replaceLegacyHostedCheckout: mocks.replaceLegacyHostedCheckout
}));
vi.mock("@/security/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/payments/airwallex", () => ({
  isAirwallexPaymentIntentId: (value: string) => value.startsWith("int_"),
  AirwallexGateway: class {
    createHostedCheckout = mocks.createHostedCheckout;
    getHostedCheckout = mocks.getHostedCheckout;
    findHostedCheckoutByReference = mocks.findHostedCheckoutByReference;
    deactivateLegacyHostedCheckout = mocks.deactivateLegacyHostedCheckout;
  }
}));

import { POST } from "./route";
import { protectCustomerEmail } from "@/commerce/customer-email";

describe("commercial checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_EMAIL_ENCRYPTION_SECRET = "encryption-secret-with-at-least-32-characters";
    process.env.OGC_EMAIL_LOOKUP_SECRET = "lookup-secret-with-at-least-32-characters";
    process.env.OGC_PAYMENT_IDEMPOTENCY_SECRET = "payment-idempotency-secret-at-least-32-chars";
    mocks.getGeoReport.mockResolvedValue({ id: "report-1", url: "https://example.com", siteKey: "example.com", reportLocale: "en" });
    mocks.getActivePaymentOrderForReport.mockResolvedValue(null);
    mocks.verifyTurnstile.mockResolvedValue({ success: true, errorCodes: [] });
    mocks.createPaymentOrder.mockResolvedValue({ id: "order-1", providerCheckoutId: null });
    mocks.findHostedCheckoutByReference.mockResolvedValue(null);
    mocks.deactivateLegacyHostedCheckout.mockResolvedValue("deactivated");
    mocks.createHostedCheckout.mockResolvedValue({
      providerCheckoutId: "int_1", clientSecret: "secret_1", currency: "USD", environment: "demo"
    });
  });

  it("ignores browser amount tampering and snapshots the server catalog price", async () => {
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human", amountMinor: 1 })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      orderId: "order-1",
      hpp: { intentId: "int_1", clientSecret: "secret_1", currency: "USD", environment: "demo" }
    });
    expect(mocks.createPaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2_900, currency: "USD" }));
    expect(mocks.createHostedCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amountMinor: 2_900, currency: "USD", returnUrl: "https://example.test/en/reports/report-1"
    }));
    expect(mocks.attachHostedCheckout).toHaveBeenCalledWith({ orderId: "order-1", providerCheckoutId: "int_1" });
  });

  it("requires the immutable report locale", async () => {
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "CNY", locale: "zh" })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(409);
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("deactivates and replaces an unpaid legacy Payment Link before returning HPP", async () => {
    mocks.getActivePaymentOrderForReport.mockResolvedValue({
      id: "order-1",
      providerCheckoutId: "6fc2d9c0-2580-4ad3-a33d-72500ec93bda",
      checkoutIdempotencyHmac: "another-checkout",
      customerEmailHmac: protectCustomerEmail("buyer@example.com").lookupHmac
    });
    mocks.createHostedCheckout.mockResolvedValue({
      providerCheckoutId: "int_migrated", clientSecret: "secret_migrated", currency: "USD", environment: "demo"
    });
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human" })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.deactivateLegacyHostedCheckout).toHaveBeenCalledWith(
      "6fc2d9c0-2580-4ad3-a33d-72500ec93bda", "order-1"
    );
    expect(mocks.replaceLegacyHostedCheckout).toHaveBeenCalledWith({
      orderId: "order-1",
      expectedProviderCheckoutId: "6fc2d9c0-2580-4ad3-a33d-72500ec93bda",
      providerCheckoutId: "int_migrated"
    });
    expect(await response.json()).toMatchObject({ hpp: { intentId: "int_migrated" } });
  });

  it("waits for the signed Webhook instead of replacing a paid legacy Payment Link", async () => {
    mocks.getActivePaymentOrderForReport.mockResolvedValue({
      id: "order-1",
      providerCheckoutId: "6fc2d9c0-2580-4ad3-a33d-72500ec93bda",
      checkoutIdempotencyHmac: "another-checkout",
      customerEmailHmac: protectCustomerEmail("buyer@example.com").lookupHmac
    });
    mocks.deactivateLegacyHostedCheckout.mockResolvedValue("paid");
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human" })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "payment_confirmation_pending" });
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
    expect(mocks.replaceLegacyHostedCheckout).not.toHaveBeenCalled();
  });
});

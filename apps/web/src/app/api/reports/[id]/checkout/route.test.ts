import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeoReport: vi.fn(), getActivePaymentOrderForReport: vi.fn(), createPaymentOrder: vi.fn(), attachHostedCheckout: vi.fn(),
  getActiveReportV4PaymentOrderForReport: vi.fn(), createReportV4PaymentOrder: vi.fn(),
  replaceLegacyHostedCheckout: vi.fn(), verifyTurnstile: vi.fn(), createHostedCheckout: vi.fn(),
  getHostedCheckout: vi.fn(), findHostedCheckoutByReference: vi.fn(), deactivateLegacyHostedCheckout: vi.fn(),
  assertRecommendationProductAvailable: vi.fn()
}));

vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/commercial-orders", () => ({
  getActivePaymentOrderForReport: mocks.getActivePaymentOrderForReport,
  createPaymentOrder: mocks.createPaymentOrder,
  getActiveReportV4PaymentOrderForReport: mocks.getActiveReportV4PaymentOrderForReport,
  createReportV4PaymentOrder: mocks.createReportV4PaymentOrder,
  attachHostedCheckout: mocks.attachHostedCheckout,
  replaceLegacyHostedCheckout: mocks.replaceLegacyHostedCheckout
}));
vi.mock("@/security/turnstile", () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock("@/recommendation-forensics/product-availability", () => ({
  assertRecommendationProductAvailable: mocks.assertRecommendationProductAvailable
}));
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
    process.env.OGC_REPLY_TO_EMAIL = "support@example.test";
    process.env.OGC_EMAIL_ENCRYPTION_SECRET = "encryption-secret-with-at-least-32-characters";
    process.env.OGC_EMAIL_LOOKUP_SECRET = "lookup-secret-with-at-least-32-characters";
    process.env.OGC_PAYMENT_IDEMPOTENCY_SECRET = "payment-idempotency-secret-at-least-32-chars";
    mocks.getGeoReport.mockResolvedValue({ id: "report-1", url: "https://example.com", siteKey: "example.com", reportLocale: "en" });
    mocks.getActivePaymentOrderForReport.mockResolvedValue(null);
    mocks.getActiveReportV4PaymentOrderForReport.mockResolvedValue(null);
    mocks.verifyTurnstile.mockResolvedValue({ success: true, errorCodes: [] });
    mocks.createPaymentOrder.mockResolvedValue({ id: "order-1", providerCheckoutId: null });
    mocks.createReportV4PaymentOrder.mockResolvedValue({ id: "order-1", providerCheckoutId: null, siteSnapshotId: "snapshot-v4" });
    mocks.findHostedCheckoutByReference.mockResolvedValue(null);
    mocks.deactivateLegacyHostedCheckout.mockResolvedValue("deactivated");
    mocks.assertRecommendationProductAvailable.mockResolvedValue(undefined);
    mocks.createHostedCheckout.mockResolvedValue({
      providerCheckoutId: "int_1", clientSecret: "secret_1", currency: "USD", environment: "demo"
    });
  });

  it("creates only a server-selected V4 order and ignores browser contract and price overrides", async () => {
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({
        email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human", amountMinor: 1,
        siteSnapshotId: "attacker-snapshot", fulfillmentMethodology: "public_search_source_forensics_v1", recommendationReportVersion: 2
      })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(201);
    expect(mocks.createReportV4PaymentOrder).toHaveBeenCalledWith(expect.objectContaining({ amountMinor: 2900 }));
    expect(mocks.createReportV4PaymentOrder).toHaveBeenCalledWith(expect.not.objectContaining({
      siteSnapshotId: expect.anything(), fulfillmentMethodology: expect.anything(), recommendationReportVersion: expect.anything()
    }));
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
    expect(mocks.createHostedCheckout).toHaveBeenCalledOnce();
  });

  it.each(["missing", "collecting", "unavailable", "custom_service", "multiple", "site mismatch"])(
    "rejects a %s pre-admission snapshot before any Airwallex call",
    async (reason) => {
      mocks.createReportV4PaymentOrder.mockRejectedValue(new Error(`V4 site snapshot ${reason}.`));
      const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": `request-${reason}` },
        body: JSON.stringify({ email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human", questionSetId: "questions-v4" })
      }), { params: Promise.resolve({ id: "report-1" }) });
      expect(response.status).toBe(400);
      expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
      expect(mocks.findHostedCheckoutByReference).not.toHaveBeenCalled();
      expect(mocks.getHostedCheckout).not.toHaveBeenCalled();
    }
  );

  it("stops before looking up or recovering any legacy checkout while the new product is unavailable", async () => {
    mocks.assertRecommendationProductAvailable.mockRejectedValue(new Error("The recommendation-forensics product is not available."));
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human" })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The recommendation-forensics product is not available." });
    expect(mocks.getActiveReportV4PaymentOrderForReport).not.toHaveBeenCalled();
    expect(mocks.deactivateLegacyHostedCheckout).not.toHaveBeenCalled();
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
  });

  it("requires the immutable report locale", async () => {
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "CNY", locale: "zh" })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(409);
    expect(mocks.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("recovers an unpaid legacy Payment Link only after V2 availability succeeds", async () => {
    mocks.getActiveReportV4PaymentOrderForReport.mockResolvedValue({
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
    expect(mocks.deactivateLegacyHostedCheckout).toHaveBeenCalledOnce();
    expect(mocks.replaceLegacyHostedCheckout).toHaveBeenCalledOnce();
  });

  it("does not replace an already-paid legacy Payment Link", async () => {
    mocks.getActiveReportV4PaymentOrderForReport.mockResolvedValue({
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
    expect(mocks.deactivateLegacyHostedCheckout).toHaveBeenCalledOnce();
    expect(mocks.createHostedCheckout).not.toHaveBeenCalled();
    expect(mocks.replaceLegacyHostedCheckout).not.toHaveBeenCalled();
  });

  it("never returns an internal database query when checkout creation fails", async () => {
    mocks.createReportV4PaymentOrder.mockRejectedValue(new Error('Failed query: insert into payment_orders ("report_locale")'));
    const response = await POST(new Request("https://example.test/api/reports/report-1/checkout", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "request-123" },
      body: JSON.stringify({ email: "buyer@example.com", currency: "USD", locale: "en", turnstileToken: "human" })
    }), { params: Promise.resolve({ id: "report-1" }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unable to create secure checkout. Please try again later." });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAndParseWebhook: vi.fn(), applyPaidPaymentEvent: vi.fn(), applyUnsuccessfulPaymentEvent: vi.fn(),
  recordPaymentEvent: vi.fn(), markPaymentEventProcessing: vi.fn(), getPaymentOrderByProviderCheckout: vi.fn()
}));
vi.mock("@/payments/airwallex", () => ({ AirwallexGateway: class { verifyAndParseWebhook = mocks.verifyAndParseWebhook; } }));
vi.mock("@/db/commercial-orders", () => ({
  applyPaidPaymentEvent: mocks.applyPaidPaymentEvent,
  applyUnsuccessfulPaymentEvent: mocks.applyUnsuccessfulPaymentEvent,
  recordPaymentEvent: mocks.recordPaymentEvent,
  markPaymentEventProcessing: mocks.markPaymentEventProcessing,
  getPaymentOrderByProviderCheckout: mocks.getPaymentOrderByProviderCheckout
}));
vi.mock("@/db/commercial-refunds", () => ({ markRefundSucceededFromProvider: vi.fn() }));
import { POST } from "./route";

describe("Airwallex webhook route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses only a verified paid event to create fulfillment", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({
      provider: "airwallex", eventId: "evt-1", eventType: "payment_intent.succeeded", createdAt: new Date("2026-07-10T00:00:00Z"),
      orderId: "order-1", paymentLinkId: null, paymentIntentId: "int-1", providerRefundId: null,
      amountMinor: 2_900, currency: "USD", payloadHash: "hash", outcome: "payment_paid", providerStatus: "SUCCEEDED"
    });
    const response = await POST(new Request("https://example.test/api/webhooks/airwallex", { method: "POST", body: "raw" }));
    expect(response.status).toBe(200);
    expect(mocks.applyPaidPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", providerPaymentId: "int-1" }));
  });

  it("resolves a signed legacy paid event by Payment Link ID and validates the price", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({
      provider: "airwallex", eventId: "evt-legacy", eventType: "payment_intent.succeeded",
      createdAt: new Date("2026-07-11T07:07:07Z"), orderId: null, paymentLinkId: "legacy-link-1",
      paymentIntentId: "int-legacy", providerRefundId: null, amountMinor: 19_900, currency: "CNY",
      payloadHash: "legacy-hash", outcome: "payment_paid", providerStatus: "SUCCEEDED"
    });
    mocks.getPaymentOrderByProviderCheckout.mockResolvedValue({
      id: "order-legacy", provider: "airwallex", providerCheckoutId: "legacy-link-1",
      paymentStatus: "pending", amountMinor: 19_900, currency: "CNY"
    });
    const response = await POST(new Request("https://example.test/api/webhooks/airwallex", { method: "POST", body: "raw" }));
    expect(response.status).toBe(200);
    expect(mocks.applyPaidPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "order-legacy", providerPaymentId: "int-legacy"
    }));
  });

  it("rejects a legacy paid event when its signed amount does not match the order", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({
      provider: "airwallex", eventId: "evt-legacy", eventType: "payment_intent.succeeded",
      createdAt: new Date("2026-07-11T07:07:07Z"), orderId: null, paymentLinkId: "legacy-link-1",
      paymentIntentId: "int-legacy", providerRefundId: null, amountMinor: 1, currency: "CNY",
      payloadHash: "legacy-hash", outcome: "payment_paid", providerStatus: "SUCCEEDED"
    });
    mocks.getPaymentOrderByProviderCheckout.mockResolvedValue({
      id: "order-legacy", provider: "airwallex", providerCheckoutId: "legacy-link-1",
      paymentStatus: "pending", amountMinor: 19_900, currency: "CNY"
    });
    const response = await POST(new Request("https://example.test/api/webhooks/airwallex", { method: "POST", body: "raw" }));
    expect(response.status).toBe(400);
    expect(mocks.applyPaidPaymentEvent).not.toHaveBeenCalled();
  });
});

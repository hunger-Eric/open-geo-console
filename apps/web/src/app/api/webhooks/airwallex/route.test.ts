import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAndParseWebhook: vi.fn(), applyPaidPaymentEvent: vi.fn(), applyUnsuccessfulPaymentEvent: vi.fn(),
  recordPaymentEvent: vi.fn(), markPaymentEventProcessing: vi.fn()
}));
vi.mock("@/payments/airwallex", () => ({ AirwallexGateway: class { verifyAndParseWebhook = mocks.verifyAndParseWebhook; } }));
vi.mock("@/db/commercial-orders", () => ({
  applyPaidPaymentEvent: mocks.applyPaidPaymentEvent,
  applyUnsuccessfulPaymentEvent: mocks.applyUnsuccessfulPaymentEvent,
  recordPaymentEvent: mocks.recordPaymentEvent,
  markPaymentEventProcessing: mocks.markPaymentEventProcessing
}));
vi.mock("@/db/commercial-refunds", () => ({ markRefundSucceededFromProvider: vi.fn() }));
import { POST } from "./route";

describe("Airwallex webhook route", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses only a verified paid event to create fulfillment", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({
      provider: "airwallex", eventId: "evt-1", eventType: "payment_intent.succeeded", createdAt: new Date("2026-07-10T00:00:00Z"),
      orderId: "order-1", paymentIntentId: "int-1", providerRefundId: null, payloadHash: "hash", outcome: "payment_paid", providerStatus: "SUCCEEDED"
    });
    const response = await POST(new Request("https://example.test/api/webhooks/airwallex", { method: "POST", body: "raw" }));
    expect(response.status).toBe(200);
    expect(mocks.applyPaidPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", providerPaymentId: "int-1" }));
  });
});

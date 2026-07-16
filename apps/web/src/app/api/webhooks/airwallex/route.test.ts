import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAndParseWebhook: vi.fn(), applyPaidPaymentEvent: vi.fn(), applyUnsuccessfulPaymentEvent: vi.fn(),
  applyReportV4PaidPaymentEvent: vi.fn(), getPaymentOrder: vi.fn(),
  recordPaymentEvent: vi.fn(), markPaymentEventProcessing: vi.fn(), getPaymentOrderByProviderCheckout: vi.fn()
}));
vi.mock("@/payments/airwallex", () => ({ AirwallexGateway: class { verifyAndParseWebhook = mocks.verifyAndParseWebhook; } }));
vi.mock("@/db/commercial-orders", () => ({
  applyPaidPaymentEvent: mocks.applyPaidPaymentEvent,
  applyReportV4PaidPaymentEvent: mocks.applyReportV4PaidPaymentEvent,
  getPaymentOrder: mocks.getPaymentOrder,
  isReportV4PaymentOrder: (order: { fulfillmentMethodology?: string; recommendationReportVersion?: number; siteSnapshotId?: string | null; businessQuestionSetId?: string | null } | null) =>
    Boolean(order?.fulfillmentMethodology === "two_stage_geo_report_v4" && order.recommendationReportVersion === 4
      && order.siteSnapshotId && order.businessQuestionSetId),
  applyUnsuccessfulPaymentEvent: mocks.applyUnsuccessfulPaymentEvent,
  recordPaymentEvent: mocks.recordPaymentEvent,
  markPaymentEventProcessing: mocks.markPaymentEventProcessing,
  getPaymentOrderByProviderCheckout: mocks.getPaymentOrderByProviderCheckout
}));
vi.mock("@/db/commercial-refunds", () => ({ markRefundSucceededFromProvider: vi.fn() }));
import { POST } from "./route";

describe("Airwallex webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPaymentOrder.mockResolvedValue({
      id: "order-1", productCode: "recommendation_forensics_v1",
      fulfillmentMethodology: "public_search_source_forensics_v1", recommendationReportVersion: 2,
      siteSnapshotId: null
    });
  });
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

  it("routes a verified V4 paid event only through the exact V4 fulfillment boundary", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({
      provider: "airwallex", eventId: "evt-v4", eventType: "payment_intent.succeeded", createdAt: new Date("2026-07-17T00:00:00Z"),
      orderId: "order-v4", paymentLinkId: null, paymentIntentId: "int-v4", providerRefundId: null,
      amountMinor: 2_900, currency: "USD", payloadHash: "hash-v4", outcome: "payment_paid", providerStatus: "SUCCEEDED"
    });
    mocks.getPaymentOrder.mockResolvedValue({
      id: "order-v4", productCode: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4, siteSnapshotId: "snapshot-v4", businessQuestionSetId: "questions-v4"
    });

    const response = await POST(new Request("https://example.test/api/webhooks/airwallex", { method: "POST", body: "raw" }));

    expect(response.status).toBe(200);
    expect(mocks.applyReportV4PaidPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "order-v4", providerPaymentId: "int-v4"
    }));
    expect(mocks.applyPaidPaymentEvent).not.toHaveBeenCalled();
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

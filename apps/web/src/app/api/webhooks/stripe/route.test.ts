import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAndParseWebhook: vi.fn(),
  getPaymentOrder: vi.fn(),
  isReportV4PaymentOrder: vi.fn(),
  applyPaidPaymentEvent: vi.fn(),
  applyReportV4PaidPaymentEvent: vi.fn(),
  applyUnsuccessfulPaymentEvent: vi.fn(),
  recordPaymentEvent: vi.fn(),
  markPaymentEventProcessing: vi.fn()
}));

vi.mock("@/payments/stripe", () => ({
  StripeGateway: class {
    verifyAndParseWebhook = mocks.verifyAndParseWebhook;
  }
}));
vi.mock("@/db/commercial-orders", () => ({
  getPaymentOrder: mocks.getPaymentOrder,
  isReportV4PaymentOrder: mocks.isReportV4PaymentOrder,
  applyPaidPaymentEvent: mocks.applyPaidPaymentEvent,
  applyReportV4PaidPaymentEvent: mocks.applyReportV4PaidPaymentEvent,
  applyUnsuccessfulPaymentEvent: mocks.applyUnsuccessfulPaymentEvent,
  recordPaymentEvent: mocks.recordPaymentEvent,
  markPaymentEventProcessing: mocks.markPaymentEventProcessing
}));

import { POST } from "./route";

const paidEvent = {
  provider: "stripe",
  eventId: "evt_1",
  eventType: "checkout.session.completed",
  createdAt: new Date("2026-08-05T00:00:00Z"),
  orderId: "order-1",
  providerCheckoutId: "cs_test_checkout1234",
  paymentLinkId: null,
  paymentIntentId: "pi_1",
  providerRefundId: null,
  amountMinor: 9_900,
  currency: "USD",
  payloadHash: "payload-hash",
  outcome: "payment_paid",
  providerStatus: "complete/paid"
} as const;

const order = {
  id: "order-1",
  provider: "stripe",
  providerCheckoutId: "cs_test_checkout1234",
  amountMinor: 9_900,
  currency: "USD",
  productCode: "recommendation_forensics_v1",
  fulfillmentMethodology: "public_search_source_forensics_v1",
  recommendationReportVersion: 2,
  siteSnapshotId: null
};

describe("Stripe webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAndParseWebhook.mockReturnValue(paidEvent);
    mocks.getPaymentOrder.mockResolvedValue(order);
    mocks.isReportV4PaymentOrder.mockReturnValue(false);
  });

  it("uses the verified event identity at the existing paid fulfillment boundary", async () => {
    const response = await webhookRequest();
    expect(response.status).toBe(200);
    expect(mocks.applyPaidPaymentEvent).toHaveBeenCalledWith({
      provider: "stripe",
      providerEventId: "evt_1",
      eventType: "checkout.session.completed",
      orderId: "order-1",
      providerPaymentId: "pi_1",
      providerCreatedAt: new Date("2026-08-05T00:00:00Z"),
      payloadHash: "payload-hash",
      selectedFields: { providerStatus: "complete/paid" }
    });
  });

  it("passes duplicate Stripe deliveries through the same provider event identity for database deduplication", async () => {
    const first = await webhookRequest();
    const duplicate = await webhookRequest();
    expect(first.status).toBe(200);
    expect(duplicate.status).toBe(200);
    expect(mocks.applyPaidPaymentEvent).toHaveBeenCalledTimes(2);
    expect(mocks.applyPaidPaymentEvent.mock.calls[0]?.[0]).toEqual(mocks.applyPaidPaymentEvent.mock.calls[1]?.[0]);
    expect(mocks.applyPaidPaymentEvent).toHaveBeenLastCalledWith(expect.objectContaining({
      provider: "stripe",
      providerEventId: "evt_1",
      payloadHash: "payload-hash"
    }));
  });

  it("routes an exact V4 order only through the V4 paid boundary", async () => {
    mocks.isReportV4PaymentOrder.mockReturnValue(true);
    const response = await webhookRequest();
    expect(response.status).toBe(200);
    expect(mocks.applyReportV4PaidPaymentEvent).toHaveBeenCalledOnce();
    expect(mocks.applyPaidPaymentEvent).not.toHaveBeenCalled();
  });

  it("rejects a signed event whose amount or currency does not match the order", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({ ...paidEvent, amountMinor: 1 });
    const response = await webhookRequest();
    expect(response.status).toBe(400);
    expect(mocks.applyPaidPaymentEvent).not.toHaveBeenCalled();
  });

  it("rejects a signed event from another Checkout Session", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({ ...paidEvent, providerCheckoutId: "cs_test_another1234" });
    const response = await webhookRequest();
    expect(response.status).toBe(400);
    expect(mocks.applyPaidPaymentEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid Stripe signature before reading an order", async () => {
    mocks.verifyAndParseWebhook.mockImplementation(() => { throw new Error("invalid signature"); });
    const response = await webhookRequest();
    expect(response.status).toBe(400);
    expect(mocks.getPaymentOrder).not.toHaveBeenCalled();
  });

  it("records non-paying Checkout events without entering fulfillment", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({ ...paidEvent, outcome: "ignored", paymentIntentId: null });
    const response = await webhookRequest();
    expect(response.status).toBe(200);
    expect(mocks.recordPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: "stripe",
      providerEventId: "evt_1",
      orderId: "order-1"
    }));
    expect(mocks.markPaymentEventProcessing).toHaveBeenCalledWith(expect.objectContaining({ status: "ignored" }));
    expect(mocks.getPaymentOrder).toHaveBeenCalledWith("order-1");
    expect(mocks.applyPaidPaymentEvent).not.toHaveBeenCalled();
  });

  it("binds a non-paying Checkout event before recording it", async () => {
    mocks.verifyAndParseWebhook.mockReturnValue({
      ...paidEvent,
      outcome: "ignored",
      paymentIntentId: null,
      providerCheckoutId: "cs_test_another1234"
    });
    const response = await webhookRequest();
    expect(response.status).toBe(400);
    expect(mocks.recordPaymentEvent).not.toHaveBeenCalled();
    expect(mocks.markPaymentEventProcessing).not.toHaveBeenCalled();
  });
});

function webhookRequest() {
  return POST(new Request("https://example.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=test" },
    body: "raw"
  }));
}

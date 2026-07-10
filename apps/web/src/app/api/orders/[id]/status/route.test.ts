import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getOrder: vi.fn() }));
vi.mock("@/db/commercial-orders", () => ({ getPaymentOrder: mocks.getOrder }));
import { GET } from "./route";

describe("commercial order status", () => {
  it("returns only customer-safe lifecycle fields", async () => {
    mocks.getOrder.mockResolvedValue({
      id: "order-1", paymentStatus: "paid", fulfillmentStatus: "queued", refundStatus: "not_required",
      deliveryStatus: "queued", deliveryDeadlineAt: new Date("2026-07-11T00:00:00Z"),
      customerEmailEncrypted: "ciphertext", providerPaymentId: "int-secret", siteKey: "example.com"
    });
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ id: "order-1" }) });
    const payload = await response.json();
    expect(payload).toMatchObject({ orderId: "order-1", paymentStatus: "paid", fulfillmentStatus: "queued" });
    expect(JSON.stringify(payload)).not.toContain("ciphertext");
    expect(JSON.stringify(payload)).not.toContain("int-secret");
    expect(JSON.stringify(payload)).not.toContain("example.com");
  });
});

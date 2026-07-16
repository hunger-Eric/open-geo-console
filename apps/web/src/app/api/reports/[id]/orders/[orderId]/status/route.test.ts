import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getOrderForReport: vi.fn(), getScanJob: vi.fn() }));
vi.mock("@/db/commercial-orders", () => ({ getPaymentOrderForReport: mocks.getOrderForReport }));
vi.mock("@/db/jobs", () => ({ getScanJob: mocks.getScanJob }));
import { GET } from "./route";

describe("report-bound commercial order status", () => {
  it("returns only customer-safe lifecycle fields for the matching report", async () => {
    mocks.getOrderForReport.mockResolvedValue({
      id: "order-1", reportId: "report-1", paymentStatus: "paid", fulfillmentStatus: "queued",
      refundStatus: "not_required", deliveryStatus: "queued", deliveryDeadlineAt: new Date("2026-07-11T00:00:00Z"),
      customerEmailEncrypted: "ciphertext", providerPaymentId: "int-secret", siteKey: "example.com", fulfillmentJobId: "job-1"
    });
    mocks.getScanJob.mockResolvedValue({ id: "job-1", reportId: "report-1", tier: "deep", stage: "analyzing", progress: 65 });
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ id: "report-1", orderId: "order-1" })
    });
    const payload = await response.json();
    expect(mocks.getOrderForReport).toHaveBeenCalledWith("order-1", "report-1");
    expect(payload).toMatchObject({
      orderId: "order-1", paymentStatus: "paid", fulfillmentStatus: "queued", progress: { stage: "analyzing", progress: 65 }
    });
    expect(JSON.stringify(payload)).not.toContain("ciphertext");
    expect(JSON.stringify(payload)).not.toContain("int-secret");
    expect(JSON.stringify(payload)).not.toContain("example.com");
  });

  it("returns the same generic 404 for cross-report and missing orders", async () => {
    mocks.getOrderForReport.mockResolvedValue(null);
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ id: "report-other", orderId: "order-1" })
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Order not found." });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPaymentOrder, issueReportAccessToken, getGeoReport } = vi.hoisted(() => ({
  getPaymentOrder: vi.fn(),
  issueReportAccessToken: vi.fn(),
  getGeoReport: vi.fn()
}));

vi.mock("@/db/commercial-orders", () => ({ getPaymentOrder }));
vi.mock("@/db/report-tokens", () => ({ issueReportAccessToken }));
vi.mock("@/db/reports", () => ({ getGeoReport }));

import { GET } from "./route";

const context = { params: Promise.resolve({ locale: "zh", id: "report-1" }) };

describe("staging report operator access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    getPaymentOrder.mockResolvedValue({
      id: "order-1",
      reportId: "report-1",
      paymentStatus: "paid",
      fulfillmentStatus: "completed"
    });
    getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    issueReportAccessToken.mockResolvedValue({ rawToken: "secret", expiresAt: new Date("2026-07-12T00:00:00Z") });
  });

  it("sets a short-lived report cookie for a completed paid staging order", async () => {
    const response = await GET(new Request("https://staging.example/zh/reports/report-1/staging-access?order=order-1"), context);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://staging.example/zh/reports/report-1/analysis");
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1=secret");
    expect(issueReportAccessToken).toHaveBeenCalledWith(expect.objectContaining({ reportId: "report-1", ttlDays: 1 }));
  });

  it("returns 404 outside protected staging test mode", async () => {
    process.env.OGC_DEPLOYMENT_PROFILE = "production";

    const response = await GET(new Request("https://example.com/zh/reports/report-1/staging-access?order=order-1"), context);

    expect(response.status).toBe(404);
    expect(getPaymentOrder).not.toHaveBeenCalled();
  });

  it("returns 404 when the order is not paid and completed for this report", async () => {
    getPaymentOrder.mockResolvedValue({
      id: "order-1",
      reportId: "report-1",
      paymentStatus: "paid",
      fulfillmentStatus: "queued"
    });

    const response = await GET(new Request("https://staging.example/zh/reports/report-1/staging-access?order=order-1"), context);

    expect(response.status).toBe(404);
    expect(issueReportAccessToken).not.toHaveBeenCalled();
  });
});

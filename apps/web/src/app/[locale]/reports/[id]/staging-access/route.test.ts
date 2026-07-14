import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPaymentOrder, issueReportAccessToken, getGeoReport, getActiveCombinedGeoReport, productContractForCode } = vi.hoisted(() => ({
  getPaymentOrder: vi.fn(),
  issueReportAccessToken: vi.fn(),
  getGeoReport: vi.fn(),
  getActiveCombinedGeoReport: vi.fn(),
  productContractForCode: vi.fn((code: string) => code === "recommendation_forensics_v1" ? "recommendation_forensics_v1" : "legacy_website_audit_v1")
}));

vi.mock("@/db/commercial-orders", () => ({ getPaymentOrder, productContractForCode }));
vi.mock("@/db/report-tokens", () => ({ issueReportAccessToken }));
vi.mock("@/db/reports", () => ({ getGeoReport }));
vi.mock("@/db/combined-reports", () => ({ getActiveCombinedGeoReport }));

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
      fulfillmentStatus: "completed",
      productCode: "deep_report_v1"
    });
    getGeoReport.mockResolvedValue({ reportLocale: "zh" });
    getActiveCombinedGeoReport.mockResolvedValue(null);
    issueReportAccessToken.mockResolvedValue({ rawToken: "secret", expiresAt: new Date("2026-07-12T00:00:00Z") });
  });

  it("derives recommendation scope only from the persisted order product", async () => {
    getPaymentOrder.mockResolvedValue({
      id: "order-2", reportId: "report-1", paymentStatus: "paid", fulfillmentStatus: "completed",
      productCode: "recommendation_forensics_v1"
    });
    const response = await GET(new Request("https://staging.example/zh/reports/report-1/staging-access?order=order-2&scope=legacy_website_audit_v1"), context);
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1_recommendation=secret");
    expect(response.headers.get("location")).toBe("https://staging.example/reports/report-1/report.html");
    expect(issueReportAccessToken).toHaveBeenCalledWith(expect.objectContaining({ artifactScope: "recommendation_forensics_v1" }));
  });

  it("sets a short-lived report cookie for a completed paid staging order", async () => {
    const response = await GET(new Request("https://staging.example/zh/reports/report-1/staging-access?order=order-1"), context);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://staging.example/zh/reports/report-1/analysis");
    expect(response.headers.get("set-cookie")).toContain("ogc_report_report-1=secret");
    expect(issueReportAccessToken).toHaveBeenCalledWith(expect.objectContaining({ reportId: "report-1", ttlDays: 1 }));
  });

  it("allows a completed limited report to be opened as a complimentary staging delivery", async () => {
    getPaymentOrder.mockResolvedValue({
      id: "order-limited",
      reportId: "report-1",
      paymentStatus: "paid",
      fulfillmentStatus: "completed_limited",
      productCode: "recommendation_forensics_v1"
    });

    const response = await GET(new Request("https://staging.example/zh/reports/report-1/staging-access?order=order-limited"), context);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://staging.example/reports/report-1/report.html");
    expect(issueReportAccessToken).toHaveBeenCalledWith(expect.objectContaining({ artifactScope: "recommendation_forensics_v1" }));
  });

  it("issues the exact active V2 artifact scope", async () => {
    getGeoReport.mockResolvedValue({ reportLocale: "zh", activeArtifactRevisionId: "revision-v2" });
    getActiveCombinedGeoReport.mockResolvedValue({ report: { artifactContract: "combined_geo_report_v2" } });
    const response = await GET(new Request("https://staging.example/zh/reports/report-1/staging-access?order=order-1"), context);
    expect(response.headers.get("location")).toBe("https://staging.example/reports/report-1/report.html");
    expect(issueReportAccessToken).toHaveBeenCalledWith(expect.objectContaining({ artifactScope: "combined_geo_report_v2" }));
  });

  it("returns 404 outside protected staging test mode", async () => {
    process.env.OGC_DEPLOYMENT_PROFILE = "production";

    const response = await GET(new Request("https://example.com/zh/reports/report-1/staging-access?order=order-1"), context);

    expect(response.status).toBe(404);
    expect(getPaymentOrder).not.toHaveBeenCalled();
  });

  it("returns 404 when the order is not paid and deliverable for this report", async () => {
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getPaymentOrderForReport: vi.fn(),
  getGeoReport: vi.fn(),
  getAnyActiveCombinedGeoReport: vi.fn(),
  issueReportAccessToken: vi.fn()
}));

vi.mock("@/db", () => ({ ensureDatabase: vi.fn(), getSqlClient: () => mocks.query }));
vi.mock("@/db/commercial-orders", () => ({ getPaymentOrderForReport: mocks.getPaymentOrderForReport }));
vi.mock("@/db/reports", () => ({ getGeoReport: mocks.getGeoReport }));
vi.mock("@/db/combined-reports", () => ({ getAnyActiveCombinedGeoReport: mocks.getAnyActiveCombinedGeoReport }));
vi.mock("@/db/report-tokens", () => ({ issueReportAccessToken: mocks.issueReportAccessToken }));

import { issuePaymentReturnAccessCapability, paymentReturnAccessCookieName } from "@/server/payment-return-access";
import { POST } from "./route";

describe("payment completion access route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OGC_TOKEN_HASH_SECRET = "completion-access-test-secret-at-least-32-characters";
    mocks.getPaymentOrderForReport.mockResolvedValue({
      id: "order-1", reportId: "report-1", paymentStatus: "paid", fulfillmentStatus: "completed", refundStatus: "not_required"
    });
    mocks.getGeoReport.mockResolvedValue({ id: "report-1", activeArtifactRevisionId: "artifact-1" });
    mocks.getAnyActiveCombinedGeoReport.mockResolvedValue({
      artifactRevisionId: "artifact-1", report: { artifactContract: "combined_geo_report_v3" }
    });
    mocks.issueReportAccessToken.mockResolvedValue({
      rawToken: "report-access-token", expiresAt: new Date("2026-09-03T00:00:00.000Z")
    });
    mocks.query.mockResolvedValue([{ belongs: true }]);
  });

  it("exchanges an exact browser capability for the active artifact scope", async () => {
    const response = await callRoute("report-1", "order-1", capabilityCookie("report-1", "order-1"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ destination: "/reports/report-1/report.html" });
    expect(mocks.issueReportAccessToken).toHaveBeenCalledWith({
      reportId: "report-1",
      orderId: "order-1",
      ttlDays: 30,
      idempotencyKey: "payment-return/order-1/combined_geo_report_v3",
      artifactScope: "combined_geo_report_v3"
    });
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toMatch(/ogc_report_report-1_combined_v3=report-access-token/i);
    expect(cookies).toMatch(/Secure/i);
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
    expect(cookies).toContain(`${paymentReturnAccessCookieName("report-1")}=`);
    expect(cookies).toMatch(/Max-Age=0/i);
  });

  it.each([
    ["missing capability", null],
    ["cross-order capability", "cross-order"]
  ])("denies %s without issuing report access", async (_name, cookieKind) => {
    const cookie = cookieKind === "cross-order" ? capabilityCookie("report-1", "order-2") : undefined;
    const response = await callRoute("report-1", "order-1", cookie);
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Completion access unavailable." });
    expect(mocks.issueReportAccessToken).not.toHaveBeenCalled();
  });

  it.each([
    ["unpaid", { paymentStatus: "pending", fulfillmentStatus: "completed" }, { activeArtifactRevisionId: "artifact-1" }, { artifactRevisionId: "artifact-1", report: { artifactContract: "combined_geo_report_v3" } }],
    ["unfinished", { paymentStatus: "paid", fulfillmentStatus: "processing" }, { activeArtifactRevisionId: "artifact-1" }, { artifactRevisionId: "artifact-1", report: { artifactContract: "combined_geo_report_v3" } }],
    ["completed limited", { paymentStatus: "paid", fulfillmentStatus: "completed_limited", refundStatus: "pending" }, { activeArtifactRevisionId: "artifact-1" }, { artifactRevisionId: "artifact-1", report: { artifactContract: "combined_geo_report_v3" } }],
    ["refunded", { paymentStatus: "paid", fulfillmentStatus: "completed", refundStatus: "refunded" }, { activeArtifactRevisionId: "artifact-1" }, { artifactRevisionId: "artifact-1", report: { artifactContract: "combined_geo_report_v3" } }],
    ["missing artifact", { paymentStatus: "paid", fulfillmentStatus: "completed" }, { activeArtifactRevisionId: null }, null],
    ["mismatched artifact", { paymentStatus: "paid", fulfillmentStatus: "completed" }, { activeArtifactRevisionId: "artifact-2" }, { artifactRevisionId: "artifact-1", report: { artifactContract: "combined_geo_report_v3" } }]
  ])("denies %s state with the same safe response", async (_name, orderState, reportState, activeState) => {
    mocks.getPaymentOrderForReport.mockResolvedValue({ id: "order-1", reportId: "report-1", ...orderState });
    mocks.getGeoReport.mockResolvedValue({ id: "report-1", ...reportState });
    mocks.getAnyActiveCombinedGeoReport.mockResolvedValue(activeState);
    const response = await callRoute("report-1", "order-1", capabilityCookie("report-1", "order-1"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Completion access unavailable." });
    expect(mocks.issueReportAccessToken).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("denies an active artifact owned by another order", async () => {
    mocks.query.mockResolvedValue([{ belongs: false }]);
    const response = await callRoute("report-1", "order-1", capabilityCookie("report-1", "order-1"));
    expect(response.status).toBe(404);
    expect(mocks.issueReportAccessToken).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

function capabilityCookie(reportId: string, orderId: string): string {
  const capability = issuePaymentReturnAccessCapability({ reportId, orderId });
  return `${paymentReturnAccessCookieName(reportId)}=${encodeURIComponent(capability.raw)}`;
}

async function callRoute(reportId: string, orderId: string, cookie?: string): Promise<Response> {
  return POST(new Request(`https://example.test/api/reports/${reportId}/orders/${orderId}/completion-access`, {
    method: "POST",
    headers: cookie ? { cookie } : undefined
  }), { params: Promise.resolve({ id: reportId, orderId }) });
}

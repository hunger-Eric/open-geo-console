import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceProviderError } from "./provider-error";

const mocks = vi.hoisted(() => ({
  claimEmailDeliveries: vi.fn(),
  getEncryptedEmailRecipient: vi.fn(),
  markEmailFailed: vi.fn(),
  markEmailSent: vi.fn(),
  queueCommercialEmail: vi.fn(),
  scheduleEmailRetry: vi.fn(),
  getPaymentOrder: vi.fn(),
  productContractForCode: vi.fn(() => "combined_geo_report_v3"),
  claimPendingRefunds: vi.fn(),
  expirePaidOrderSla: vi.fn(),
  find20hWarningOrders: vi.fn(),
  findOverduePaidOrders: vi.fn(),
  markRefundFailed: vi.fn(),
  markRefundSubmitted: vi.fn(),
  markRefundSucceeded: vi.fn(),
  reconcilePaidJobOutcomes: vi.fn(),
  scheduleRefundRetry: vi.fn(),
  issueReportAccessToken: vi.fn(),
  revokeReportAccessTokens: vi.fn(),
  revealCustomerEmail: vi.fn(() => "buyer@example.com"),
  sendEmail: vi.fn(),
  requestRefund: vi.fn(),
  getActiveCombinedGeoReport: vi.fn()
}));

vi.mock("@/db/commercial-delivery", () => ({
  claimEmailDeliveries: mocks.claimEmailDeliveries,
  getEncryptedEmailRecipient: mocks.getEncryptedEmailRecipient,
  markEmailFailed: mocks.markEmailFailed,
  markEmailSent: mocks.markEmailSent,
  queueCommercialEmail: mocks.queueCommercialEmail,
  scheduleEmailRetry: mocks.scheduleEmailRetry
}));
vi.mock("@/db/commercial-orders", () => ({ getPaymentOrder: mocks.getPaymentOrder, productContractForCode: mocks.productContractForCode }));
vi.mock("@/db/commercial-refunds", () => ({
  claimPendingRefunds: mocks.claimPendingRefunds,
  expirePaidOrderSla: mocks.expirePaidOrderSla,
  find20hWarningOrders: mocks.find20hWarningOrders,
  findOverduePaidOrders: mocks.findOverduePaidOrders,
  markRefundFailed: mocks.markRefundFailed,
  markRefundSubmitted: mocks.markRefundSubmitted,
  markRefundSucceeded: mocks.markRefundSucceeded,
  reconcilePaidJobOutcomes: mocks.reconcilePaidJobOutcomes,
  scheduleRefundRetry: mocks.scheduleRefundRetry
}));
vi.mock("@/db/report-tokens", () => ({ issueReportAccessToken: mocks.issueReportAccessToken, revokeReportAccessTokens: mocks.revokeReportAccessTokens }));
vi.mock("./customer-email", () => ({ revealCustomerEmail: mocks.revealCustomerEmail }));
vi.mock("@/email/resend", () => ({
  ResendEmailGateway: vi.fn(function ResendEmailGateway() { return { send: mocks.sendEmail }; }),
  ResendRequestError: class ResendRequestError extends Error {}
}));
vi.mock("@/payments/airwallex", () => ({
  AirwallexGateway: vi.fn(function AirwallexGateway() { return { requestRefund: mocks.requestRefund }; })
}));
vi.mock("@/db/combined-reports", () => ({ getActiveCombinedGeoReport: mocks.getActiveCombinedGeoReport }));

import { processPendingCommercialRefunds, processQueuedCommercialEmails } from "./operations";

const originalReportBaseUrl = process.env.OGC_REPORT_BASE_URL;

describe("commercial provider failure persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OGC_REPORT_BASE_URL = "https://example.test";
    mocks.getEncryptedEmailRecipient.mockResolvedValue({ emailKeyVersion: "v1", customerEmailEncrypted: "encrypted" });
    mocks.getPaymentOrder.mockResolvedValue({ id: "order-1", reportId: "report-1", siteKey: "example.com", reportLocale: "en", productCode: "recommendation_forensics_v1", provider: "airwallex", providerPaymentId: "int_1" });
    mocks.markEmailSent.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalReportBaseUrl === undefined) delete process.env.OGC_REPORT_BASE_URL;
    else process.env.OGC_REPORT_BASE_URL = originalReportBaseUrl;
  });

  it("persists a typed transient email code while retaining the retry policy", async () => {
    mocks.claimEmailDeliveries.mockResolvedValue([{ id: "email-1", orderId: "order-1", reportId: "report-1", templateType: "payment_confirmed", locale: "en", businessIdempotencyKey: "payment/order-1/v1", attempts: 1 }]);
    mocks.sendEmail.mockRejectedValue(new CommerceProviderError("resend", "send", "http", 429));

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });
    expect(mocks.scheduleEmailRetry).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "resend_send_http_429" }));
    expect(mocks.markEmailFailed).not.toHaveBeenCalled();
  });

  it("stops a permanent email failure with its safe typed code", async () => {
    mocks.claimEmailDeliveries.mockResolvedValue([{ id: "email-1", orderId: "order-1", reportId: "report-1", templateType: "payment_confirmed", locale: "en", businessIdempotencyKey: "payment/order-1/v1", attempts: 1 }]);
    mocks.sendEmail.mockRejectedValue(new CommerceProviderError("resend", "configuration", "invalid_configuration"));

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(mocks.markEmailFailed).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "resend_configuration_invalid_configuration" }));
  });

  it("stops a permanent refund failure, persists its code, and queues assistance", async () => {
    mocks.claimPendingRefunds.mockResolvedValue([{ id: "refund-1", orderId: "order-1", attempts: 1, amountMinor: 19_900, currency: "CNY", reason: "failed", idempotencyKey: "refund/order-1/v1" }]);
    mocks.requestRefund.mockRejectedValue(new CommerceProviderError("airwallex", "refund", "http", 401));

    await expect(processPendingCommercialRefunds()).resolves.toEqual({ claimed: 1, succeeded: 0, retried: 0, failed: 1 });
    expect(mocks.markRefundFailed).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "airwallex_refund_http_401" }));
    expect(mocks.queueCommercialEmail).toHaveBeenCalledWith(expect.objectContaining({ templateType: "refund_assistance" }));
  });

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-PDF-01
  it("sends a V4 HTML access link from the exact active scope using the terminalizer idempotency identity", async () => {
    const businessIdempotencyKey = "report_ready/core-artifact-v4/v1";
    mocks.claimEmailDeliveries.mockResolvedValue([{
      id: "email-v4", orderId: "order-1", reportId: "report-1", templateType: "report_ready",
      locale: "en", businessIdempotencyKey, attempts: 1
    }]);
    mocks.getActiveCombinedGeoReport.mockResolvedValueOnce({
      artifactContract: "combined_geo_report_v4",
      report: { artifactContract: "combined_geo_report_v4" }
    });
    mocks.issueReportAccessToken.mockResolvedValue({ rawToken: "v4-secret", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.sendEmail.mockResolvedValue({ providerEmailId: "resend-v4" });

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
    expect(mocks.getActiveCombinedGeoReport).toHaveBeenCalledTimes(1);
    expect(mocks.getActiveCombinedGeoReport).toHaveBeenCalledWith("report-1", "combined_geo_report_v4");
    expect(mocks.issueReportAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.issueReportAccessToken).toHaveBeenCalledWith({
      reportId: "report-1",
      ttlDays: 30,
      idempotencyKey: `${businessIdempotencyKey}/combined_geo_report_v4`,
      artifactScope: "combined_geo_report_v4"
    });
    const email = mocks.sendEmail.mock.calls[0]![0];
    expect(email.reportUrl).toContain("/api/reports/report-1/access?token=v4-secret");
    expect(email.reportUrl).not.toMatch(/pdf/i);
  });

  // @requirement GEO-V4-LEGACY-01
  it("falls back to the historical active-artifact overload when no V4 artifact is active", async () => {
    const businessIdempotencyKey = "report_ready/legacy-artifact/v1";
    mocks.claimEmailDeliveries.mockResolvedValue([{
      id: "email-v3", orderId: "order-1", reportId: "report-1", templateType: "report_ready",
      locale: "en", businessIdempotencyKey, attempts: 1
    }]);
    mocks.getActiveCombinedGeoReport
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ artifactContract: "combined_geo_report_v3", report: { artifactContract: "combined_geo_report_v3" } });
    mocks.issueReportAccessToken.mockResolvedValue({ rawToken: "v3-secret", expiresAt: new Date("2026-08-01T00:00:00Z") });
    mocks.sendEmail.mockResolvedValue({ providerEmailId: "resend-v3" });

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
    expect(mocks.getActiveCombinedGeoReport.mock.calls).toEqual([
      ["report-1", "combined_geo_report_v4"],
      ["report-1"]
    ]);
    expect(mocks.issueReportAccessToken).toHaveBeenCalledWith(expect.objectContaining({
      artifactScope: "combined_geo_report_v3",
      idempotencyKey: `${businessIdempotencyKey}/combined_geo_report_v3`
    }));
  });
});

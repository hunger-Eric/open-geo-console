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
  stripeRequestRefund: vi.fn(),
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
vi.mock("@/email/resend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/email/resend")>();
  return {
    ...actual,
    ResendEmailGateway: vi.fn(function ResendEmailGateway() { return { send: mocks.sendEmail }; })
  };
});
vi.mock("@/payments/airwallex", () => ({
  AirwallexGateway: vi.fn(function AirwallexGateway() { return { requestRefund: mocks.requestRefund }; })
}));
vi.mock("@/payments/stripe", () => ({
  StripeGateway: vi.fn(function StripeGateway() { return { requestRefund: mocks.stripeRequestRefund }; })
}));
vi.mock("@/db/combined-reports", () => ({ getActiveCombinedGeoReport: mocks.getActiveCombinedGeoReport }));

import { processPendingCommercialRefunds, processQueuedCommercialEmails } from "./operations";

const originalReportBaseUrl = process.env.OGC_REPORT_BASE_URL;
const originalDeliveryEnvironment = {
  OGC_DEPLOYMENT_PROFILE: process.env.OGC_DEPLOYMENT_PROFILE,
  COMMERCE_MODE: process.env.COMMERCE_MODE,
  OGC_TEST_EMAIL_RECIPIENT: process.env.OGC_TEST_EMAIL_RECIPIENT
};

describe("commercial provider failure persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OGC_REPORT_BASE_URL = "https://example.test";
    process.env.OGC_DEPLOYMENT_PROFILE = "production";
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_TEST_EMAIL_RECIPIENT = "operator@example.test";
    mocks.revealCustomerEmail.mockImplementation(() => "buyer@example.com");
    mocks.getEncryptedEmailRecipient.mockResolvedValue({ emailKeyVersion: "v1", customerEmailEncrypted: "encrypted" });
    mocks.getPaymentOrder.mockResolvedValue({
      id: "order-1", reportId: "report-1", siteKey: "example.com", reportLocale: "en",
      productCode: "recommendation_forensics_v1", provider: "airwallex", providerPaymentId: "int_1",
      paymentStatus: "paid", fulfillmentStatus: "completed", refundStatus: "not_required"
    });
    mocks.markEmailSent.mockResolvedValue(true);
  });

  afterEach(() => {
    if (originalReportBaseUrl === undefined) delete process.env.OGC_REPORT_BASE_URL;
    else process.env.OGC_REPORT_BASE_URL = originalReportBaseUrl;
    for (const [name, value] of Object.entries(originalDeliveryEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("uses the protected-test envelope recipient without decrypting customer ciphertext", async () => {
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    mocks.revealCustomerEmail.mockImplementation(() => { throw new Error("ciphertext mismatch"); });
    mocks.claimEmailDeliveries.mockResolvedValue([{ id: "email-1", orderId: "order-1", reportId: "report-1", templateType: "payment_confirmed", locale: "en", businessIdempotencyKey: "payment/order-1/v1", attempts: 2 }]);
    mocks.sendEmail.mockResolvedValue({ providerEmailId: "resend-test" });

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });

    expect(mocks.revealCustomerEmail).not.toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "operator@example.test" }));
    expect(mocks.markEmailSent).toHaveBeenCalledWith(expect.objectContaining({ id: "email-1", providerEmailId: "resend-test" }));
  });

  it.each([
    ["production", "test"],
    ["staging", "live"]
  ])("still requires customer decryption for %s profile in %s commerce mode", async (profile, mode) => {
    process.env.OGC_DEPLOYMENT_PROFILE = profile;
    process.env.COMMERCE_MODE = mode;
    mocks.revealCustomerEmail.mockImplementation(() => { throw new Error("ciphertext mismatch"); });
    mocks.claimEmailDeliveries.mockResolvedValue([{ id: "email-1", orderId: "order-1", reportId: "report-1", templateType: "payment_confirmed", locale: "en", businessIdempotencyKey: "payment/order-1/v1", attempts: 2 }]);

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });

    expect(mocks.revealCustomerEmail).toHaveBeenCalledWith("encrypted");
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.scheduleEmailRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "email-1", errorCode: "unknown_error" }));
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

  it("submits a stripe-provider refund through the Stripe gateway", async () => {
    mocks.getPaymentOrder.mockResolvedValue({
      id: "order-1", reportId: "report-1", siteKey: "example.com", reportLocale: "en",
      productCode: "recommendation_forensics_v1", provider: "stripe", providerPaymentId: "pi_1",
      paymentStatus: "paid", fulfillmentStatus: "failed", refundStatus: "pending"
    });
    mocks.claimPendingRefunds.mockResolvedValue([{ id: "refund-1", orderId: "order-1", attempts: 1, amountMinor: 9_900, currency: "USD", reason: "report_failed", idempotencyKey: "full_refund/order-1" }]);
    mocks.markRefundSubmitted.mockResolvedValue(true);
    mocks.stripeRequestRefund.mockResolvedValue({ providerRefundId: "re_1", status: "succeeded" });

    await expect(processPendingCommercialRefunds()).resolves.toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });

    expect(mocks.stripeRequestRefund).toHaveBeenCalledWith({
      orderId: "order-1",
      paymentIntentId: "pi_1",
      amountMinor: 9_900,
      currency: "USD",
      reason: "report_failed",
      idempotencyKey: "full_refund/order-1"
    });
    expect(mocks.requestRefund).not.toHaveBeenCalled();
    expect(mocks.markRefundSubmitted).toHaveBeenCalledWith(expect.objectContaining({ id: "refund-1", providerRefundId: "re_1" }));
    expect(mocks.markRefundSucceeded).toHaveBeenCalledWith({ id: "refund-1", providerRefundId: "re_1" });
  });

  it("still rejects a refund whose order provider has no gateway", async () => {
    mocks.getPaymentOrder.mockResolvedValue({
      id: "order-1", reportId: "report-1", siteKey: "example.com", reportLocale: "en",
      productCode: "recommendation_forensics_v1", provider: "paypal", providerPaymentId: "pay_1",
      paymentStatus: "paid", fulfillmentStatus: "failed", refundStatus: "pending"
    });
    mocks.claimPendingRefunds.mockResolvedValue([{ id: "refund-1", orderId: "order-1", attempts: 1, amountMinor: 9_900, currency: "USD", reason: "report_failed", idempotencyKey: "full_refund/order-1" }]);

    await expect(processPendingCommercialRefunds()).resolves.toEqual({ claimed: 1, succeeded: 0, retried: 1, failed: 0 });

    expect(mocks.requestRefund).not.toHaveBeenCalled();
    expect(mocks.stripeRequestRefund).not.toHaveBeenCalled();
    expect(mocks.scheduleRefundRetry).toHaveBeenCalledWith(expect.objectContaining({ id: "refund-1", errorCode: "unknown_error" }));
  });

  it("passes an exact order filter only to the lease boundaries", async () => {
    const orderId = "4286cb73-6349-467a-8aaf-9b196624da92";
    const createdAtOrAfter = new Date("2026-08-03T00:00:00.000Z");
    mocks.claimEmailDeliveries.mockResolvedValue([]);
    mocks.claimPendingRefunds.mockResolvedValue([]);

    await expect(processQueuedCommercialEmails(2, { orderId, createdAtOrAfter })).resolves.toEqual({ claimed: 0, succeeded: 0, retried: 0, failed: 0 });
    await expect(processPendingCommercialRefunds(1, { orderId })).resolves.toEqual({ claimed: 0, succeeded: 0, retried: 0, failed: 0 });

    expect(mocks.claimEmailDeliveries).toHaveBeenCalledWith(expect.objectContaining({ orderId, createdAtOrAfter, limit: 2, leaseSeconds: 120 }));
    expect(mocks.claimPendingRefunds).toHaveBeenCalledWith(expect.objectContaining({ orderId, limit: 1, leaseSeconds: 120 }));
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
      orderId: "order-1",
      ttlDays: 30,
      idempotencyKey: `${businessIdempotencyKey}/combined_geo_report_v4`,
      artifactScope: "combined_geo_report_v4"
    });
    const email = mocks.sendEmail.mock.calls[0]![0];
    expect(email.reportUrl).toContain("/api/reports/report-1/access?token=v4-secret");
    expect(email.reportUrl).not.toMatch(/pdf/i);
  });

  it("sends a limited refund notice with access to the persisted report", async () => {
    mocks.claimEmailDeliveries.mockResolvedValue([{
      id: "email-limited", orderId: "order-1", reportId: "report-1", templateType: "limited_report_refund",
      locale: "en", businessIdempotencyKey: "limited_report_refund/core-artifact-v4/v1", attempts: 1
    }]);
    mocks.sendEmail.mockResolvedValue({ providerEmailId: "resend-limited" });

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
    expect(mocks.getActiveCombinedGeoReport).toHaveBeenCalled();
    expect(mocks.issueReportAccessToken).toHaveBeenCalled();
    expect(mocks.sendEmail.mock.calls[0]![0]).toMatchObject({ template: "limited_report_refund" });
    expect(mocks.sendEmail.mock.calls[0]![0].reportUrl).toContain("/api/reports/report-1/access");
  });

  it("keeps an artifact-bearing limited order accessible while its refund is pending", async () => {
    mocks.claimEmailDeliveries.mockResolvedValue([{
      id: "email-stale", orderId: "order-1", reportId: "report-1", templateType: "report_ready",
      locale: "en", businessIdempotencyKey: "report_ready/core-artifact-v4/v1", attempts: 1
    }]);
    mocks.getPaymentOrder.mockResolvedValue({
      id: "order-1", reportId: "report-1", siteKey: "example.com", productCode: "recommendation_forensics_v1",
      paymentStatus: "paid", fulfillmentStatus: "completed_limited", refundStatus: "pending"
    });

    await expect(processQueuedCommercialEmails()).resolves.toEqual({ claimed: 1, succeeded: 1, retried: 0, failed: 0 });
    expect(mocks.getActiveCombinedGeoReport).toHaveBeenCalled();
    expect(mocks.issueReportAccessToken).toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalled();
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

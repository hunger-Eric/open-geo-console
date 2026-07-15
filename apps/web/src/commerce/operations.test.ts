import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("commercial provider failure persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEncryptedEmailRecipient.mockResolvedValue({ emailKeyVersion: "v1", customerEmailEncrypted: "encrypted" });
    mocks.getPaymentOrder.mockResolvedValue({ id: "order-1", reportId: "report-1", siteKey: "example.com", reportLocale: "en", productCode: "recommendation_forensics_v1", provider: "airwallex", providerPaymentId: "int_1" });
    mocks.markEmailSent.mockResolvedValue(true);
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
});

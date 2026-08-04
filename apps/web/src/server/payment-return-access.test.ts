import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  issuePaymentReturnAccessCapability,
  paymentReturnAccessCookieName,
  requestHasPaymentReturnAccess,
  verifyPaymentReturnAccessCapability
} from "./payment-return-access";

describe("payment return access capability", () => {
  const now = new Date("2026-08-03T00:00:00.000Z");
  const originalSecret = process.env.OGC_TOKEN_HASH_SECRET;

  beforeEach(() => {
    process.env.OGC_TOKEN_HASH_SECRET = "return-capability-test-secret-at-least-32-characters";
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.OGC_TOKEN_HASH_SECRET;
    else process.env.OGC_TOKEN_HASH_SECRET = originalSecret;
  });

  it("binds the signed capability to the exact report and order", () => {
    const capability = issuePaymentReturnAccessCapability({ reportId: "report-1", orderId: "order-1", now });
    expect(verifyPaymentReturnAccessCapability(capability.raw, { reportId: "report-1", orderId: "order-1", now })).toBe(true);
    expect(verifyPaymentReturnAccessCapability(capability.raw, { reportId: "report-2", orderId: "order-1", now })).toBe(false);
    expect(verifyPaymentReturnAccessCapability(capability.raw, { reportId: "report-1", orderId: "order-2", now })).toBe(false);
  });

  it("rejects tampering and expiry", () => {
    const capability = issuePaymentReturnAccessCapability({ reportId: "report-1", orderId: "order-1", now });
    expect(verifyPaymentReturnAccessCapability(`${capability.raw}x`, { reportId: "report-1", orderId: "order-1", now })).toBe(false);
    expect(verifyPaymentReturnAccessCapability(capability.raw, {
      reportId: "report-1", orderId: "order-1", now: new Date(capability.expiresAt.getTime() + 1_000)
    })).toBe(false);
  });

  it("reads only the report-scoped HttpOnly cookie name", () => {
    const capability = issuePaymentReturnAccessCapability({ reportId: "report-1", orderId: "order-1", now });
    const request = new Request("https://example.test", {
      headers: { cookie: `${paymentReturnAccessCookieName("report-1")}=${encodeURIComponent(capability.raw)}` }
    });
    expect(requestHasPaymentReturnAccess(request, { reportId: "report-1", orderId: "order-1", now })).toBe(true);
    expect(requestHasPaymentReturnAccess(request, { reportId: "report-2", orderId: "order-1", now })).toBe(false);
  });
});

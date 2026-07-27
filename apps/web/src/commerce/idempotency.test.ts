import { describe, expect, it } from "vitest";
import { checkoutIdempotencyHmac } from "./idempotency";

describe("checkout idempotency", () => {
  const environment = { OGC_PAYMENT_IDEMPOTENCY_SECRET: "payment-idempotency-secret-at-least-32-chars" };
  it("binds an opaque browser key to a report without storing the raw key", () => {
    const first = checkoutIdempotencyHmac({ rawKey: "request-123", reportId: "report-1", environment });
    expect(first).toHaveLength(64);
    expect(first).toBe(checkoutIdempotencyHmac({ rawKey: "request-123", reportId: "report-1", environment }));
    expect(first).not.toBe(checkoutIdempotencyHmac({ rawKey: "request-123", reportId: "report-2", environment }));
  });
});

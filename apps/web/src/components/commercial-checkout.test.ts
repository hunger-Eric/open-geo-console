import { describe, expect, it } from "vitest";
import { buildHppReturnUrls } from "./payment-return";

describe("HPP return URLs", () => {
  it("returns success and cancel to the exact originating report without trusting stale query state", () => {
    const urls = buildHppReturnUrls(
      "https://example.test/zh/reports/report-1/analysis?page=2&order=old&payment_return=success#fragment",
      "order-1"
    );
    expect(urls.successUrl).toBe("https://example.test/zh/reports/report-1/analysis?page=2&order=order-1&payment_return=success");
    expect(urls.cancelUrl).toBe("https://example.test/zh/reports/report-1/analysis?page=2&order=order-1&payment_return=cancel");
  });
});

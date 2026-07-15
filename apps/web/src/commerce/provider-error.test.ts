import { describe, expect, it } from "vitest";
import {
  CommerceProviderError,
  isPermanentCommerceProviderError,
  safeCommerceFailureCode
} from "./provider-error";

describe("commerce provider errors", () => {
  it("produces bounded provider-facing codes without raw error content", () => {
    expect(safeCommerceFailureCode(new CommerceProviderError("airwallex", "refund", "http", 401)))
      .toBe("airwallex_refund_http_401");
    expect(safeCommerceFailureCode(new CommerceProviderError("resend", "send", "timeout")))
      .toBe("resend_send_timeout");
    expect(safeCommerceFailureCode(new Error("raw provider body must not persist")))
      .toBe("unknown_error");
  });

  it("distinguishes permanent provider failures from bounded transient retries", () => {
    expect(isPermanentCommerceProviderError(new CommerceProviderError("airwallex", "refund", "http", 401))).toBe(true);
    expect(isPermanentCommerceProviderError(new CommerceProviderError("resend", "send", "http", 429))).toBe(false);
    expect(isPermanentCommerceProviderError(new CommerceProviderError("resend", "configuration", "invalid_configuration"))).toBe(true);
  });
});

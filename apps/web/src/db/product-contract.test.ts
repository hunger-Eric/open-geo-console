import { describe, expect, it } from "vitest";
import { fulfillmentMethodologyForProductAdmission, matchesImmutableOrder, productContractForCode, recommendationReportVersionForProductAdmission, type CreatePaymentOrderInput } from "./commercial-orders";
import type { PaymentOrderRow } from "./schema";

describe("persisted payment product to Worker contract", () => {
  it("keeps already-paid legacy orders on their readable legacy job contract", () => {
    expect(productContractForCode("deep_report_v1")).toBe("legacy_website_audit_v1");
  });

  it("selects the recommendation methodology on the server", () => {
    expect(fulfillmentMethodologyForProductAdmission("recommendation_forensics_v1"))
      .toBe("public_search_source_forensics_v1");
    expect(fulfillmentMethodologyForProductAdmission("deep_report_v1")).toBeNull();
    expect(recommendationReportVersionForProductAdmission("recommendation_forensics_v1")).toBe(2);
    expect(recommendationReportVersionForProductAdmission("deep_report_v1")).toBeNull();
  });

  it("treats persisted methodology as immutable during idempotent order reuse", () => {
    const input = {
      checkoutIdempotencyHmac: "checkout", provider: "airwallex", reportId: "report", siteKey: "example.com",
      customerEmailEncrypted: "encrypted", customerEmailHmac: "email-hmac", emailKeyVersion: "v1",
      productCode: "recommendation_forensics_v1", catalogVersion: "v1", termsVersion: "v1",
      refundPolicyVersion: "v1", reportLocale: "en", currency: "USD", amountMinor: 2900
    } satisfies CreatePaymentOrderInput;
    const matching = {
      ...input, id: "order", fulfillmentMethodology: "public_search_source_forensics_v1", recommendationReportVersion: 2, taxAmountMinor: null
    } as unknown as PaymentOrderRow;
    expect(matchesImmutableOrder(matching, input)).toBe(true);
    expect(matchesImmutableOrder({ ...matching, fulfillmentMethodology: "answer_engine_recommendation_forensics_v1" }, input)).toBe(false);
    expect(matchesImmutableOrder({ ...matching, recommendationReportVersion: 1 }, input)).toBe(false);
  });

  it("creates only the replacement contract for the new persisted product code", () => {
    expect(productContractForCode("recommendation_forensics_v1")).toBe("recommendation_forensics_v1");
    expect(() => productContractForCode("browser_supplied_product")).toThrow(/unsupported product/i);
  });
});

import { describe, expect, it } from "vitest";
import { productContractForCode } from "./commercial-orders";

describe("persisted payment product to Worker contract", () => {
  it("keeps already-paid legacy orders on their readable legacy job contract", () => {
    expect(productContractForCode("deep_report_v1")).toBe("legacy_website_audit_v1");
  });

  it("creates only the replacement contract for the new persisted product code", () => {
    expect(productContractForCode("recommendation_forensics_v1")).toBe("recommendation_forensics_v1");
    expect(() => productContractForCode("browser_supplied_product")).toThrow(/unsupported product/i);
  });
});

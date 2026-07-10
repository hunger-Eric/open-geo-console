import { describe, expect, it } from "vitest";
import { amountMinorToMajor, getCommerceMode, getFulfillmentMode, getPriceSnapshot, parseSupportedCurrency } from "./config";

describe("commerce configuration", () => {
  it("fails closed by default and uses batch fulfillment", () => {
    expect(getCommerceMode({})).toBe("disabled");
    expect(getFulfillmentMode({})).toBe("batch_24h");
  });

  it("uses test-only defaults without accepting a browser amount", () => {
    expect(getPriceSnapshot("USD", { COMMERCE_MODE: "test" }).amountMinor).toBe(2_900);
    expect(amountMinorToMajor(2_900)).toBe(29);
  });

  it("requires every live price to be explicitly configured server-side", () => {
    expect(() => getPriceSnapshot("HKD", { COMMERCE_MODE: "live" })).toThrow("OGC_PRICE_HKD_MINOR");
    expect(getPriceSnapshot("HKD", { COMMERCE_MODE: "live", OGC_PRICE_HKD_MINOR: "24900" }).amountMinor).toBe(24_900);
  });

  it("accepts only catalog currencies", () => {
    expect(parseSupportedCurrency("CNY")).toBe("CNY");
    expect(parseSupportedCurrency("EUR")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { amountMinorToMajor, getCommerceMode, getFulfillmentMode, getOfferedCurrency, getPriceSnapshot, parseSupportedCurrency } from "./config";

describe("commerce configuration", () => {
  it("fails closed by default and uses batch fulfillment", () => {
    expect(getCommerceMode({})).toBe("disabled");
    expect(getFulfillmentMode({})).toBe("batch_24h");
  });

  it("uses test-only defaults without accepting a browser amount", () => {
    expect(getPriceSnapshot("USD", { COMMERCE_MODE: "test" })).toMatchObject({
      productCode: "recommendation_forensics_v1", catalogVersion: "2026-08-04.v2", amountMinor: 9_900
    });
    expect(getPriceSnapshot("CNY", { COMMERCE_MODE: "test" }).amountMinor).toBe(29_900);
    expect(amountMinorToMajor(9_900)).toBe(99);
  });

  it("requires every live price to be explicitly configured server-side", () => {
    expect(() => getPriceSnapshot("HKD", { COMMERCE_MODE: "live" })).toThrow("OGC_PRICE_HKD_MINOR");
    expect(getPriceSnapshot("HKD", { COMMERCE_MODE: "live", OGC_PRICE_HKD_MINOR: "24900" }).amountMinor).toBe(24_900);
  });

  it("accepts only catalog currencies", () => {
    expect(parseSupportedCurrency("CNY")).toBe("CNY");
    expect(parseSupportedCurrency("EUR")).toBeNull();
  });

  it.each([
    ["CN", "CNY", 29_900],
    ["HK", "USD", 9_900],
    ["MO", "USD", 9_900],
    ["TW", "USD", 9_900],
    ["US", "USD", 9_900],
    ["JP", "USD", 9_900],
    ["DE", "USD", 9_900],
    [null, "USD", 9_900]
  ] as const)("maps country %s to the single offered price", (countryCode, currency, amountMinor) => {
    const offeredCurrency = getOfferedCurrency(countryCode);
    expect(offeredCurrency).toBe(currency);
    expect(getPriceSnapshot(offeredCurrency, { COMMERCE_MODE: "test" }).amountMinor).toBe(amountMinor);
  });
});

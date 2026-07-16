export type CommerceMode = "disabled" | "test" | "live";
export type FulfillmentMode = "batch_24h" | "realtime";
export type SupportedCurrency = "CNY" | "USD" | "HKD";

export interface PriceSnapshot {
  productCode: "recommendation_forensics_v1";
  catalogVersion: string;
  currency: SupportedCurrency;
  amountMinor: number;
  reportTier: "deep";
  quantity: 1;
  refundPolicyVersion: string;
  purchaseTermsVersion: string;
}

const TEST_PRICES: Record<SupportedCurrency, number> = {
  CNY: 19_900,
  USD: 2_900,
  HKD: 22_900
};

const PRICE_ENV: Record<SupportedCurrency, keyof NodeJS.ProcessEnv> = {
  CNY: "OGC_PRICE_CNY_MINOR",
  USD: "OGC_PRICE_USD_MINOR",
  HKD: "OGC_PRICE_HKD_MINOR"
};

export function getCommerceMode(environment: NodeJS.ProcessEnv = process.env): CommerceMode {
  const value = environment.COMMERCE_MODE?.trim();
  if (!value) return "disabled";
  if (value === "disabled" || value === "test" || value === "live") return value;
  throw new Error("COMMERCE_MODE must be disabled, test, or live.");
}

export function getFulfillmentMode(environment: NodeJS.ProcessEnv = process.env): FulfillmentMode {
  const value = environment.FULFILLMENT_MODE?.trim() || "batch_24h";
  if (value === "batch_24h" || value === "realtime") return value;
  throw new Error("FULFILLMENT_MODE must be batch_24h or realtime.");
}

export function parseSupportedCurrency(value: unknown): SupportedCurrency | null {
  return value === "CNY" || value === "USD" || value === "HKD" ? value : null;
}

export function getPriceSnapshot(
  currency: SupportedCurrency,
  environment: NodeJS.ProcessEnv = process.env
): PriceSnapshot {
  const mode = getCommerceMode(environment);
  const configured = Number(environment[PRICE_ENV[currency]]);
  const hasConfiguredPrice = Number.isSafeInteger(configured) && configured > 0;
  if (mode === "live" && !hasConfiguredPrice) {
    throw new Error(`A positive server-side ${PRICE_ENV[currency]} is required in live commerce mode.`);
  }
  const amountMinor = hasConfiguredPrice ? configured : TEST_PRICES[currency];
  return {
    productCode: "recommendation_forensics_v1",
    catalogVersion: environment.OGC_PRICE_CATALOG_VERSION?.trim() || "2026-07-10.v1",
    currency,
    amountMinor,
    reportTier: "deep",
    quantity: 1,
    refundPolicyVersion: "full_refund_24h_v1",
    purchaseTermsVersion: "one_time_report_v1"
  };
}

export function assertCommerceEnabled(environment: NodeJS.ProcessEnv = process.env): Exclude<CommerceMode, "disabled"> {
  const mode = getCommerceMode(environment);
  if (mode === "disabled") throw new Error("Commerce is not currently accepting orders.");
  return mode;
}

export function amountMinorToMajor(amountMinor: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("A positive integer minor-unit amount is required.");
  return amountMinor / 100;
}

import { NextResponse } from "next/server";
import { getCommerceMode, getOfferedCurrency, getPriceSnapshot } from "@/commerce/config";
import { getCommerceReadiness } from "@/commerce/readiness";
import { getRecommendationProductAvailability } from "@/recommendation-forensics/product-availability";
import { getTrustedClientCountry } from "@/security/client-ip";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const mode = getCommerceMode();
    const readiness = await getCommerceReadiness();
    if (!readiness.ready) {
      return unavailable(mode, safeCommerceReason(readiness.code));
    }
    const product = await getRecommendationProductAvailability();
    if (!product.ready) {
      return unavailable(mode, safeProductReason(product.code));
    }
    const price = getPriceSnapshot(getOfferedCurrency(getTrustedClientCountry(request)));
    return NextResponse.json({
      enabled: true,
      mode,
      reasonCode: null,
      prices: [{ currency: price.currency, amountMinor: price.amountMinor }],
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY?.trim() || null
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return unavailable("disabled", "internal_error");
  }
}

function unavailable(mode: "disabled" | "test" | "live", reasonCode: string) {
  return NextResponse.json({ enabled: false, mode, reasonCode, prices: [], turnstileSiteKey: null }, {
    headers: { "cache-control": "no-store" }
  });
}

function safeCommerceReason(code: string): string {
  if (code === "disabled" || code === "configuration" || code === "capacity" || code === "incident") {
    return `commerce_${code}`;
  }
  return "internal_error";
}

function safeProductReason(code: string): string {
  if (["disabled", "environment", "runtime_incomplete", "authority_unavailable", "authority_mismatch"].includes(code)) {
    return `product_${code}`;
  }
  return "internal_error";
}

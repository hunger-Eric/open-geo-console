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
    const product = await getRecommendationProductAvailability();
    const price = getPriceSnapshot(getOfferedCurrency(getTrustedClientCountry(request)));
    return NextResponse.json({
      enabled: readiness.ready && product.ready,
      mode,
      prices: readiness.ready && product.ready
        ? [{ currency: price.currency, amountMinor: price.amountMinor }]
        : [],
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY?.trim() || null
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ enabled: false, mode: "disabled", prices: [], turnstileSiteKey: null }, { headers: { "cache-control": "no-store" } });
  }
}

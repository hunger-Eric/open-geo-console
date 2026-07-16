import { NextResponse } from "next/server";
import { getCommerceMode, getPriceSnapshot, type SupportedCurrency } from "@/commerce/config";
import { getCommerceReadiness } from "@/commerce/readiness";
import { getRecommendationProductAvailability } from "@/recommendation-forensics/product-availability";

export const runtime = "nodejs";

export async function GET() {
  try {
    const mode = getCommerceMode();
    const readiness = await getCommerceReadiness();
    const product = await getRecommendationProductAvailability();
    const currencies: SupportedCurrency[] = ["CNY", "USD", "HKD"];
    return NextResponse.json({
      enabled: readiness.ready && product.ready,
      mode,
      prices: readiness.ready && product.ready ? currencies.map((currency) => {
        const price = getPriceSnapshot(currency);
        return { currency, amountMinor: price.amountMinor };
      }) : [],
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY?.trim() || null
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ enabled: false, mode: "disabled", prices: [], turnstileSiteKey: null }, { headers: { "cache-control": "no-store" } });
  }
}

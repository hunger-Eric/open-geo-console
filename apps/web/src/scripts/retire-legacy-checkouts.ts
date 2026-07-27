import { retireLegacyUnpaidOrders } from "@/commerce/legacy-retirement";

const rawCutoff = process.env.OGC_LEGACY_RETIREMENT_CUTOFF_AT?.trim();
const cutoffAt = rawCutoff ? new Date(rawCutoff) : new Date(Number.NaN);
if (!Number.isFinite(cutoffAt.getTime())) {
  throw new Error("OGC_LEGACY_RETIREMENT_CUTOFF_AT must be an explicit ISO timestamp.");
}

const result = await retireLegacyUnpaidOrders({ cutoffAt });
console.log(`Legacy checkout retirement complete: inspected=${result.inspected} retired=${result.retired} paid=${result.paid}`);

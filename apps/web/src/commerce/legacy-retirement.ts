import { AirwallexGateway } from "@/payments/airwallex";
import {
  finalizeLegacyUnpaidOrderRetirement,
  prepareLegacyUnpaidOrderRetirement,
  type LegacyRetirementCandidate
} from "@/db/commercial-orders";

export interface LegacyCheckoutRetirementGateway {
  retireHostedCheckout(providerCheckoutId: string, orderId: string): Promise<"deactivated" | "cancelled" | "paid">;
}

export async function retireLegacyUnpaidOrders(input: {
  cutoffAt: Date;
  environment?: NodeJS.ProcessEnv;
  gateway?: LegacyCheckoutRetirementGateway;
  prepare?: (cutoffAt: Date) => Promise<LegacyRetirementCandidate[]>;
  finalize?: (orderId: string, cutoffAt: Date) => Promise<boolean>;
}): Promise<{ inspected: number; retired: number; paid: number }> {
  assertProtectedRetirement(input.environment ?? process.env);
  const prepare = input.prepare ?? prepareLegacyUnpaidOrderRetirement;
  const finalize = input.finalize ?? finalizeLegacyUnpaidOrderRetirement;
  const gateway = input.gateway ?? new AirwallexGateway({ environment: input.environment });
  const candidates = await prepare(input.cutoffAt);
  let retired = 0;
  let paid = 0;
  for (const candidate of candidates) {
    if (candidate.providerCheckoutId) {
      const outcome = await gateway.retireHostedCheckout(candidate.providerCheckoutId, candidate.id);
      if (outcome === "paid") { paid += 1; continue; }
    }
    if (await finalize(candidate.id, candidate.cutoffAt)) retired += 1;
  }
  return { inspected: candidates.length, retired, paid };
}

function assertProtectedRetirement(environment: NodeJS.ProcessEnv): void {
  if (!new Set(["staging", "production"]).has(environment.OGC_DEPLOYMENT_PROFILE ?? "") ||
      environment.OGC_LEGACY_RETIREMENT_ENABLED !== "true" ||
      !new Set(["test", "live"]).has(environment.COMMERCE_MODE ?? "")) {
    throw new Error("Legacy checkout retirement requires an explicitly enabled protected commerce environment.");
  }
}

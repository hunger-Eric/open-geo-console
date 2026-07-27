import {closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus} from "@/db";
import {required} from "@/email/config";
import {ResendEmailGateway} from "@/email/resend";
import {AirwallexGateway} from "@/payments/airwallex";
import {prepareStagingCommand, type StagingStartupSummary} from "@/scripts/staging-guard";

interface ProviderProbeDependencies {
  prepare: () => Promise<StagingStartupSummary>;
  airwallex: Pick<AirwallexGateway, "getHostedCheckout">;
  resend: Pick<ResendEmailGateway, "send">;
  environment: NodeJS.ProcessEnv;
  close: () => Promise<void>;
}

export interface StagingProviderProbeInput {
  paymentIntentId: string;
  orderId: string;
}

export async function runStagingProviderProbe(
  input: StagingProviderProbeInput,
  dependencies: Partial<ProviderProbeDependencies> = {}
) {
  const resolved: ProviderProbeDependencies = {
    prepare: () => prepareStagingCommand({ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus}),
    airwallex: new AirwallexGateway(),
    resend: new ResendEmailGateway(),
    environment: process.env,
    close: closeDatabase,
    ...dependencies
  };
  try {
    const guard = await resolved.prepare();
    const checkout = await resolved.airwallex.getHostedCheckout(input.paymentIntentId, input.orderId);
    if (checkout.providerCheckoutId !== input.paymentIntentId) throw new Error("staging_probe_intent_mismatch");
    const sent = await resolved.resend.send({
      to: required(resolved.environment, "OGC_TEST_EMAIL_RECIPIENT"),
      template: "payment_confirmed",
      locale: "en",
      orderReference: input.orderId,
      siteLabel: "protected-staging-provider-probe",
      idempotencyKey: `staging-provider-probe/${input.orderId}/v1`
    });
    return {
      profile: guard.profile,
      airwallex: {retrieved: true as const, paymentIntentId: input.paymentIntentId},
      resend: {sent: true as const, providerEmailId: sent.providerEmailId}
    };
  } finally {
    await resolved.close();
  }
}

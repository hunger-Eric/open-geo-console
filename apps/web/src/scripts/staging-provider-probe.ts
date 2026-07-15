import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { required } from "@/email/config";
import { ResendEmailGateway } from "@/email/resend";
import { AirwallexGateway } from "@/payments/airwallex";
import { safeCommerceFailureCode } from "@/commerce/provider-error";
import { prepareStagingCommand, type StagingStartupSummary } from "./staging-guard";

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
    prepare: () => prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus }),
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
      airwallex: { retrieved: true as const, paymentIntentId: input.paymentIntentId },
      resend: { sent: true as const, providerEmailId: sent.providerEmailId }
    };
  } finally {
    await resolved.close();
  }
}

export function parseStagingProviderProbeArgs(args: string[]): StagingProviderProbeInput {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) throw new Error("Provider probe arguments must be --name value pairs.");
    if (values.has(flag.slice(2))) throw new Error(`Duplicate provider probe argument: ${flag}`);
    values.set(flag.slice(2), value);
  }
  if (values.size !== 2 || [...values.keys()].some((key) => key !== "payment-intent-id" && key !== "order-id")) {
    throw new Error("Only --payment-intent-id and --order-id are accepted.");
  }
  const paymentIntentId = values.get("payment-intent-id")?.trim();
  const orderId = values.get("order-id")?.trim();
  if (!paymentIntentId || !orderId) throw new Error("--payment-intent-id and --order-id are required.");
  return { paymentIntentId, orderId };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runStagingProviderProbe(parseStagingProviderProbeArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch((error) => {
      process.stderr.write(`${safeCommerceFailureCode(error)}\n`);
      process.exitCode = 1;
    });
}

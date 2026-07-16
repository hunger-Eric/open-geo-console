import { fileURLToPath } from "node:url";
import path from "node:path";
import { safeCommerceFailureCode } from "@/commerce/provider-error";
import {runStagingProviderProbe, type StagingProviderProbeInput} from "@/commerce/staging-provider-probe";

export {runStagingProviderProbe} from "@/commerce/staging-provider-probe";

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

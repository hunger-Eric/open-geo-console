import { pathToFileURL } from "node:url";
import { commercialOperationNames, runCommercialOperations } from "@/commerce/run-operations";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { prepareStagingCommand } from "./staging-guard";

export interface StagingCommercialOperationCommand {
  operation: typeof commercialOperationNames[number];
  orderId?: string;
}

export function parseStagingCommercialOperationCommand(args: string[]): StagingCommercialOperationCommand {
  const operation = args[0] ?? "all";
  if (!commercialOperationNames.includes(operation as StagingCommercialOperationCommand["operation"])) throw new Error("Unknown commercial operation.");
  const orderFlag = args.indexOf("--order-id");
  if (orderFlag < 0) {
    if (args.length > 1) throw new Error("Unknown staging commerce argument.");
    return { operation: operation as StagingCommercialOperationCommand["operation"] };
  }
  if (args.length !== 3 || orderFlag !== 1) throw new Error("Use --order-id with one exact UUID.");
  const orderId = args[orderFlag + 1]!;
  if (!isUuid(orderId)) throw new Error("A valid staging commerce order ID is required.");
  if (operation !== "refunds" && operation !== "email") throw new Error("Exact-order Staging commerce supports only refunds or email.");
  return { operation, orderId };
}

async function main(): Promise<void> {
  const command = parseStagingCommercialOperationCommand(process.argv.slice(2));
  try {
    const summary = await prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
    process.stdout.write(`Staging commerce guard ${JSON.stringify(summary)}\n`);
    const output = await runCommercialOperations(command.operation, { ...(command.orderId ? { orderId: command.orderId } : {}) });
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } finally {
    await closeDatabase();
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.name : "unknown_error" })}\n`);
  process.exitCode = 1;
});

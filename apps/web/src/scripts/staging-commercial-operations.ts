import { commercialOperationNames, runCommercialOperations } from "@/commerce/run-operations";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { prepareStagingCommand } from "./staging-guard";

const operation = process.argv[2] ?? "all";

try {
  const summary = await prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  process.stdout.write(`Staging commerce guard ${JSON.stringify(summary)}\n`);
  if (!commercialOperationNames.includes(operation as typeof commercialOperationNames[number])) throw new Error("Unknown commercial operation.");
  const output = await runCommercialOperations(operation as typeof commercialOperationNames[number]);
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.name : "unknown_error" })}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

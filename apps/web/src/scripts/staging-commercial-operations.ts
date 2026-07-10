import {
  enforceCommercialSla,
  processPendingCommercialRefunds,
  processQueuedCommercialEmails,
  reconcileTerminalPaidJobs
} from "@/commerce/operations";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { prepareStagingCommand } from "./staging-guard";

const operation = process.argv[2] ?? "all";

try {
  const summary = await prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  process.stdout.write(`Staging commerce guard ${JSON.stringify(summary)}\n`);
  const output: Record<string, unknown> = {};
  if (operation === "reconcile" || operation === "all") output.reconciledJobs = await reconcileTerminalPaidJobs();
  if (operation === "sla" || operation === "all") output.sla = await enforceCommercialSla();
  if (operation === "refunds" || operation === "all") output.refunds = await processPendingCommercialRefunds();
  if (operation === "email" || operation === "all") output.email = await processQueuedCommercialEmails();
  if (!["reconcile", "sla", "refunds", "email", "all"].includes(operation)) throw new Error("Unknown commercial operation.");
  process.stdout.write(`${JSON.stringify(output)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.name : "unknown_error" })}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

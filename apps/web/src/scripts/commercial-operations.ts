import {
  enforceCommercialSla,
  processPendingCommercialRefunds,
  processQueuedCommercialEmails,
  reconcileTerminalPaidJobs
} from "@/commerce/operations";
import { closeDatabase } from "@/db";

const operation = process.argv[2] ?? "all";

try {
  const output: Record<string, unknown> = {};
  if (operation === "reconcile" || operation === "all") output.reconciledJobs = await reconcileTerminalPaidJobs();
  if (operation === "sla" || operation === "all") output.sla = await enforceCommercialSla();
  if (operation === "refunds" || operation === "all") output.refunds = await processPendingCommercialRefunds();
  if (operation === "email" || operation === "all") output.email = await processQueuedCommercialEmails();
  if (!["reconcile", "sla", "refunds", "email", "all"].includes(operation)) throw new Error("Unknown commercial operation.");
  console.log(JSON.stringify(output));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.name : "unknown_error" }));
  process.exitCode = 1;
} finally {
  await closeDatabase();
}

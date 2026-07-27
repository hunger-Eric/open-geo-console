import {
  enforceCommercialSla,
  processPendingCommercialRefunds,
  processQueuedCommercialEmails,
  reconcileTerminalPaidJobs
} from "./operations";
import type { CommercialOperationResult } from "./operations";

export const commercialOperationNames = ["reconcile", "sla", "refunds", "email", "all"] as const;
export type CommercialOperationName = typeof commercialOperationNames[number];

export interface CommercialOperationsOutput {
  reconciledJobs?: number;
  sla?: { warnings: number; expired: number };
  refunds?: CommercialOperationResult;
  email?: CommercialOperationResult;
}

export async function runCommercialOperations(
  operation: CommercialOperationName,
  options: { orderId?: string } = {}
): Promise<CommercialOperationsOutput> {
  if (!commercialOperationNames.includes(operation)) throw new Error("Unknown commercial operation.");
  if (options.orderId && operation !== "refunds" && operation !== "email") {
    throw new Error("Exact-order commercial operations support only refunds or email.");
  }
  const output: CommercialOperationsOutput = {};
  if (operation === "reconcile" || operation === "all") output.reconciledJobs = await reconcileTerminalPaidJobs();
  if (operation === "sla" || operation === "all") output.sla = await enforceCommercialSla();
  if (operation === "refunds" || operation === "all") output.refunds = await processPendingCommercialRefunds(25, options);
  if (operation === "email" || operation === "all") output.email = await processQueuedCommercialEmails(25, options);
  return output;
}

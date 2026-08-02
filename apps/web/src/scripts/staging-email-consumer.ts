import { pathToFileURL } from "node:url";
import { processQueuedCommercialEmails, type CommercialOperationResult } from "@/commerce/operations";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { readResendConfiguration } from "@/email/config";
import { resolveEnvelopeRecipient } from "@/email/resend";
import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import { prepareStagingCommand } from "./staging-guard";

export interface StagingEmailConsumerConfig {
  activationAt: Date;
  intervalMs: number;
}

export function parseStagingEmailConsumerConfig(environment: NodeJS.ProcessEnv): StagingEmailConsumerConfig {
  assertProtectedStagingCommercePreview(environment);
  if (!environment.DATABASE_URL?.trim()) throw new Error("DATABASE_URL is required.");
  if ((environment.OGC_TOKEN_HASH_SECRET?.trim().length ?? 0) < 32) {
    throw new Error("OGC_TOKEN_HASH_SECRET must be configured with at least 32 characters.");
  }
  readResendConfiguration(environment);
  resolveEnvelopeRecipient("", environment);
  const reportBaseUrl = new URL(environment.OGC_REPORT_BASE_URL?.trim() ?? "invalid:");
  if (reportBaseUrl.protocol !== "https:"
    || reportBaseUrl.host !== "open-geo-console-staging-itheheda.vercel.app"
    || reportBaseUrl.pathname !== "/" || reportBaseUrl.search || reportBaseUrl.hash) {
    throw new Error("OGC_REPORT_BASE_URL must be the fixed Protected Staging HTTPS origin.");
  }
  const rawActivation = environment.OGC_STAGING_EMAIL_ACTIVATION_AT?.trim() ?? "";
  const activationAt = new Date(rawActivation);
  if (!rawActivation || !Number.isFinite(activationAt.getTime()) || activationAt.toISOString() !== rawActivation) {
    throw new Error("OGC_STAGING_EMAIL_ACTIVATION_AT must be an exact UTC ISO timestamp.");
  }
  const intervalMs = Number(environment.OGC_STAGING_EMAIL_INTERVAL_MS ?? "5000");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 300_000) {
    throw new Error("OGC_STAGING_EMAIL_INTERVAL_MS must be between 1000 and 300000.");
  }
  return { activationAt, intervalMs };
}

export async function runStagingEmailConsumerCycle(
  config: StagingEmailConsumerConfig,
  processEmails: typeof processQueuedCommercialEmails = processQueuedCommercialEmails
): Promise<CommercialOperationResult> {
  return processEmails(25, { createdAtOrAfter: config.activationAt });
}

async function main(): Promise<void> {
  let stopping = false;
  process.once("SIGINT", () => { stopping = true; });
  process.once("SIGTERM", () => { stopping = true; });
  try {
    const config = parseStagingEmailConsumerConfig(process.env);
    const summary = await prepareStagingCommand({ ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
    process.stdout.write(`${JSON.stringify({
      event: "staging_email_consumer_ready",
      profile: summary.profile,
      activationAt: config.activationAt.toISOString()
    })}\n`);
    while (!stopping) {
      const result = await runStagingEmailConsumerCycle(config);
      if (result.claimed > 0) {
        process.stdout.write(`${JSON.stringify({ event: "staging_email_consumer_cycle", ...result })}\n`);
      }
      if (!stopping) await wait(config.intervalMs);
    }
  } finally {
    await closeDatabase();
  }
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.name : "unknown_error" })}\n`);
    process.exitCode = 1;
  });
}

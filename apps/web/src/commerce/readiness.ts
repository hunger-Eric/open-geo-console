import { getFulfillmentMode, getCommerceMode } from "./config";
import { getLastSuccessfulBatchRun, hasHealthyWorkerPresence } from "@/db/commercial-operations";
import { findOverduePaidOrders } from "@/db/commercial-refunds";
import { ensureDatabase, getSqlClient } from "@/db/index";
import { isMailbox } from "@/email/config";

export interface CommerceReadiness {
  ready: boolean;
  code: "ready" | "disabled" | "configuration" | "capacity" | "incident";
}

export async function getCommerceReadiness(environment: NodeJS.ProcessEnv = process.env): Promise<CommerceReadiness> {
  const mode = getCommerceMode(environment);
  if (mode === "disabled") return { ready: false, code: "disabled" };
  if (mode === "test") {
    return isMailbox(environment.OGC_REPLY_TO_EMAIL)
      ? { ready: true, code: "ready" }
      : { ready: false, code: "configuration" };
  }
  if (!hasLiveConfiguration(environment)) return { ready: false, code: "configuration" };
  try {
    await ensureDatabase();
    if ((await findOverduePaidOrders()).length > 0) return { ready: false, code: "incident" };
    const incidents = await getSqlClient()<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM payment_refunds WHERE state = 'failed'
        UNION ALL
        SELECT 1 FROM email_deliveries
        WHERE state IN ('bounced','failed') AND order_id IS NOT NULL
          AND updated_at > now() - interval '1 hour'
      ) AS exists
    `;
    if (incidents[0]?.exists) return { ready: false, code: "incident" };
    if (getFulfillmentMode(environment) === "realtime") {
      return await hasHealthyWorkerPresence("deep", 600)
        ? { ready: true, code: "ready" }
        : { ready: false, code: "capacity" };
    }
    const lastBatch = await getLastSuccessfulBatchRun("deep");
    const finishedAt = lastBatch?.finishedAt?.getTime() ?? 0;
    return finishedAt >= Date.now() - 24 * 60 * 60 * 1_000
      ? { ready: true, code: "ready" }
      : { ready: false, code: "capacity" };
  } catch {
    return { ready: false, code: "incident" };
  }
}

export async function assertCommerceReady(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const readiness = await getCommerceReadiness(environment);
  if (!readiness.ready) throw new Error("Commerce is temporarily unavailable.");
}

function hasLiveConfiguration(environment: NodeJS.ProcessEnv): boolean {
  return [
    "OGC_PRICE_CNY_MINOR", "OGC_PRICE_USD_MINOR", "OGC_PRICE_HKD_MINOR",
    "OGC_PAYMENT_IDEMPOTENCY_SECRET", "OGC_EMAIL_ENCRYPTION_SECRET", "OGC_EMAIL_LOOKUP_SECRET",
    "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "TURNSTILE_EXPECTED_HOSTNAME",
    "AIRWALLEX_CLIENT_ID", "AIRWALLEX_API_KEY", "AIRWALLEX_WEBHOOK_SECRET",
    "RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_WEBHOOK_SECRET", "OGC_REPLY_TO_EMAIL"
  ].every((name) => Boolean(environment[name]?.trim())) && isMailbox(environment.OGC_REPLY_TO_EMAIL);
}

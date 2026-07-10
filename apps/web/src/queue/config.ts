import { positiveInteger } from "@/worker/config";
import { getFulfillmentMode, type FulfillmentMode } from "@/commerce/config";

export type JobQueueProvider = "cloudflare" | "local" | "noop";
export type { FulfillmentMode } from "@/commerce/config";

export interface CloudflareQueueConfig {
  accountId: string;
  apiToken: string;
  freeQueueId: string;
  deepQueueId: string;
  apiBaseUrl: string;
  requestTimeoutMs: number;
}

export interface JobQueueRuntimeConfig {
  provider: JobQueueProvider;
  fulfillmentMode: FulfillmentMode;
  cloudflare?: CloudflareQueueConfig;
}

export function readJobQueueConfig(environment: NodeJS.ProcessEnv = process.env): JobQueueRuntimeConfig {
  const provider = parseJobQueueProvider(environment.OGC_JOB_QUEUE_PROVIDER);
  const fulfillmentMode = getFulfillmentMode(environment);
  if (provider !== "cloudflare") return { provider, fulfillmentMode };

  return {
    provider,
    fulfillmentMode,
    cloudflare: {
      accountId: required(environment.CLOUDFLARE_ACCOUNT_ID, "CLOUDFLARE_ACCOUNT_ID"),
      apiToken: required(environment.CLOUDFLARE_QUEUES_API_TOKEN, "CLOUDFLARE_QUEUES_API_TOKEN"),
      freeQueueId: required(environment.CLOUDFLARE_FREE_QUEUE_ID, "CLOUDFLARE_FREE_QUEUE_ID"),
      deepQueueId: required(environment.CLOUDFLARE_DEEP_QUEUE_ID, "CLOUDFLARE_DEEP_QUEUE_ID"),
      apiBaseUrl: environment.CLOUDFLARE_API_BASE_URL?.trim() || "https://api.cloudflare.com/client/v4",
      requestTimeoutMs: positiveInteger(environment.OGC_QUEUE_REQUEST_TIMEOUT_MS, 10_000)
    }
  };
}

export function parseJobQueueProvider(raw: string | undefined): JobQueueProvider {
  const provider = raw?.trim().toLowerCase() || "noop";
  if (provider === "cloudflare" || provider === "local" || provider === "noop") return provider;
  throw new Error("OGC_JOB_QUEUE_PROVIDER must be 'cloudflare', 'local', or 'noop'.");
}

export function parseFulfillmentMode(raw: string | undefined): FulfillmentMode {
  return getFulfillmentMode({ ...process.env, FULFILLMENT_MODE: raw });
}

function required(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required when Cloudflare Queue is enabled.`);
  return normalized;
}

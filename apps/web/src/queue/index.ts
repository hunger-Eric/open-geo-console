import { CloudflareJobNotificationQueue } from "./cloudflare";
import { readJobQueueConfig, type JobQueueRuntimeConfig } from "./config";
import { LocalJobNotificationQueue } from "./local";
import { NoopJobNotificationQueue } from "./noop";
import type { JobNotificationQueue } from "./job-notification";

export * from "./config";
export * from "./job-notification";

export function createJobNotificationQueue(
  config: JobQueueRuntimeConfig = readJobQueueConfig(),
  fetchImpl: typeof fetch = fetch
): JobNotificationQueue {
  if (config.provider === "cloudflare") {
    if (!config.cloudflare) throw new Error("Cloudflare Queue configuration is missing.");
    return new CloudflareJobNotificationQueue(config.cloudflare, fetchImpl);
  }
  if (config.provider === "local") return new LocalJobNotificationQueue();
  return new NoopJobNotificationQueue();
}

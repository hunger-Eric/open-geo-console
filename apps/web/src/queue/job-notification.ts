import type { ReportTier } from "@/db/schema";

export interface JobNotificationV1 {
  version: 1;
  dispatchId: string;
  tier: ReportTier;
}

export interface PulledJobNotification {
  messageId: string;
  leaseId: string;
  attempts: number;
  timestampMs: number;
  notification: JobNotificationV1 | null;
}

export interface QueuePullOptions {
  batchSize?: number;
  visibilityTimeoutMs?: number;
}

export interface QueueRetry {
  leaseId: string;
  delaySeconds?: number;
}

/**
 * A notification queue only wakes a worker lane. PostgreSQL remains the job
 * authority, so a notification deliberately contains no report or customer
 * data and can be duplicated or lost without changing fulfillment state.
 */
export interface JobNotificationQueue {
  publish(notification: JobNotificationV1): Promise<void>;
  pull(tier: ReportTier, options?: QueuePullOptions): Promise<readonly PulledJobNotification[]>;
  acknowledge(tier: ReportTier, leaseIds: readonly string[]): Promise<void>;
  retry(tier: ReportTier, retries: readonly QueueRetry[]): Promise<void>;
}

export function parseJobNotification(value: unknown): JobNotificationV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).sort();
  if (keys.length !== 3 || keys[0] !== "dispatchId" || keys[1] !== "tier" || keys[2] !== "version") {
    return null;
  }
  if (input.version !== 1 || (input.tier !== "free" && input.tier !== "deep")) return null;
  if (typeof input.dispatchId !== "string" || !isOpaqueIdentifier(input.dispatchId)) return null;
  return { version: 1, dispatchId: input.dispatchId, tier: input.tier };
}

export function assertJobNotification(notification: JobNotificationV1): void {
  if (!parseJobNotification(notification)) {
    throw new Error("The job notification is invalid.");
  }
}

function isOpaqueIdentifier(value: string): boolean {
  return value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

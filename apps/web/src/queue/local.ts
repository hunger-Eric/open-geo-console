import { randomUUID } from "node:crypto";
import type { ReportTier } from "@/db/schema";
import {
  assertJobNotification,
  type JobNotificationQueue,
  type JobNotificationV1,
  type PulledJobNotification,
  type QueuePullOptions,
  type QueueRetry
} from "./job-notification";

interface LocalMessage {
  id: string;
  notification: JobNotificationV1;
  timestampMs: number;
  attempts: number;
  availableAtMs: number;
  leaseId?: string;
}

/** In-process adapter for deterministic tests and a single-process demo only. */
export class LocalJobNotificationQueue implements JobNotificationQueue {
  private readonly lanes: Record<ReportTier, LocalMessage[]> = { free: [], deep: [] };

  constructor(private readonly now: () => number = Date.now) {}

  async publish(notification: JobNotificationV1): Promise<void> {
    assertJobNotification(notification);
    const timestampMs = this.now();
    this.lanes[notification.tier].push({
      id: randomUUID(),
      notification: structuredClone(notification),
      timestampMs,
      attempts: 0,
      availableAtMs: timestampMs
    });
  }

  async pull(tier: ReportTier, options: QueuePullOptions = {}): Promise<readonly PulledJobNotification[]> {
    const now = this.now();
    const batchSize = Number.isSafeInteger(options.batchSize) && options.batchSize! > 0
      ? Math.min(100, options.batchSize!)
      : 1;
    const visibilityTimeoutMs = Number.isSafeInteger(options.visibilityTimeoutMs) && options.visibilityTimeoutMs! > 0
      ? options.visibilityTimeoutMs!
      : 30_000;
    return this.lanes[tier]
      .filter((message) => message.availableAtMs <= now)
      .slice(0, batchSize)
      .map((message) => {
        message.attempts += 1;
        message.leaseId = randomUUID();
        message.availableAtMs = now + visibilityTimeoutMs;
        return {
          messageId: message.id,
          leaseId: message.leaseId,
          attempts: message.attempts,
          timestampMs: message.timestampMs,
          notification: structuredClone(message.notification)
        };
      });
  }

  async acknowledge(tier: ReportTier, leaseIds: readonly string[]): Promise<void> {
    const leases = new Set(leaseIds);
    this.lanes[tier] = this.lanes[tier].filter((message) => !message.leaseId || !leases.has(message.leaseId));
  }

  async retry(tier: ReportTier, retries: readonly QueueRetry[]): Promise<void> {
    const byLease = new Map(retries.map((retry) => [retry.leaseId, retry]));
    for (const message of this.lanes[tier]) {
      if (!message.leaseId) continue;
      const retry = byLease.get(message.leaseId);
      if (!retry) continue;
      message.leaseId = undefined;
      message.availableAtMs = this.now() + Math.max(0, retry.delaySeconds ?? 0) * 1_000;
    }
  }
}

import type { ReportTier } from "@/db/schema";
import type {
  JobNotificationQueue,
  JobNotificationV1,
  PulledJobNotification,
  QueuePullOptions,
  QueueRetry
} from "./job-notification";

/** Used by batch-only deployments that rely on scheduled PostgreSQL drains. */
export class NoopJobNotificationQueue implements JobNotificationQueue {
  async publish(notification: JobNotificationV1): Promise<void> { void notification; }
  async pull(tier: ReportTier, options?: QueuePullOptions): Promise<readonly PulledJobNotification[]> {
    void tier;
    void options;
    return [];
  }
  async acknowledge(tier: ReportTier, leaseIds: readonly string[]): Promise<void> {
    void tier;
    void leaseIds;
  }
  async retry(tier: ReportTier, retries: readonly QueueRetry[]): Promise<void> {
    void tier;
    void retries;
  }
}

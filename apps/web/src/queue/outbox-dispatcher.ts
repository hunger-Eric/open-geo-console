import { randomUUID } from "node:crypto";
import type { ReportTier } from "@/db/schema";
import type { JobNotificationQueue } from "./job-notification";

export interface JobDispatchRecord {
  id: string;
  tier: ReportTier;
  attempts: number;
}

export interface JobDispatchOutboxRepository {
  leaseJobDispatches(input: {
    owner: string;
    limit?: number;
    leaseSeconds?: number;
    includePublishedBefore?: Date;
  }): Promise<readonly JobDispatchRecord[]>;
  markJobDispatchPublished(input: { id: string; owner: string; publishedAt?: Date }): Promise<boolean>;
  markJobDispatchRetry(input: {
    id: string;
    owner: string;
    errorCode: string;
    nextAttemptAt: Date;
  }): Promise<boolean>;
  ensureQueuedJobsHaveDispatches(tier?: ReportTier): Promise<number>;
}

export interface DispatchResult {
  leased: number;
  published: number;
  deferred: number;
  lostLease: number;
  repaired: number;
}

export interface DispatchOptions {
  owner?: string;
  limit?: number;
  leaseSeconds?: number;
  includePublishedBefore?: Date;
  repairMissing?: boolean;
  tier?: ReportTier;
  now?: () => Date;
}

export async function dispatchJobNotifications(
  repository: JobDispatchOutboxRepository,
  queue: JobNotificationQueue,
  options: DispatchOptions = {}
): Promise<DispatchResult> {
  const now = options.now ?? (() => new Date());
  const owner = options.owner ?? `dispatch-${randomUUID()}`;
  const repaired = options.repairMissing
    ? await repository.ensureQueuedJobsHaveDispatches(options.tier)
    : 0;
  const records = await repository.leaseJobDispatches({
    owner,
    limit: boundedLimit(options.limit),
    leaseSeconds: boundedLeaseSeconds(options.leaseSeconds),
    includePublishedBefore: options.includePublishedBefore
  });
  const result: DispatchResult = { leased: records.length, published: 0, deferred: 0, lostLease: 0, repaired };

  for (const record of records) {
    try {
      await queue.publish({ version: 1, dispatchId: record.id, tier: record.tier });
      const marked = await repository.markJobDispatchPublished({ id: record.id, owner, publishedAt: now() });
      if (marked) result.published += 1;
      else result.lostLease += 1;
    } catch (error) {
      const marked = await repository.markJobDispatchRetry({
        id: record.id,
        owner,
        errorCode: dispatchErrorCode(error),
        nextAttemptAt: new Date(now().getTime() + retryDelayMs(record.attempts))
      }).catch(() => false);
      if (marked) result.deferred += 1;
      else result.lostLease += 1;
    }
  }
  return result;
}

export async function reconcileJobNotifications(
  repository: JobDispatchOutboxRepository,
  queue: JobNotificationQueue,
  options: Omit<DispatchOptions, "repairMissing" | "includePublishedBefore"> & {
    stalePublishedBefore?: Date;
  } = {}
): Promise<DispatchResult> {
  const now = options.now ?? (() => new Date());
  return dispatchJobNotifications(repository, queue, {
    ...options,
    now,
    repairMissing: true,
    includePublishedBefore: options.stalePublishedBefore ?? new Date(now().getTime() - 30 * 60_000)
  });
}

export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(6, Number.isSafeInteger(attempts) ? attempts : 0));
  return Math.min(30 * 60_000, 30_000 * 2 ** exponent);
}

function dispatchErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "queue_timeout";
  if (error instanceof Error && error.name === "AbortError") return "queue_timeout";
  return "queue_publish_failed";
}

function boundedLimit(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0 ? Math.min(100, value!) : 25;
}

function boundedLeaseSeconds(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! >= 10 ? Math.min(600, value!) : 60;
}

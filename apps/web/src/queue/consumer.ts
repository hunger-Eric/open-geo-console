import type { ReportTier } from "@/db/schema";
import type { JobNotificationQueue } from "./job-notification";

export interface AuthoritativeJobRunner<Job> {
  claim(workerId: string, tier: ReportTier): Promise<Job | null>;
  process(job: Job, workerId: string): Promise<void>;
}

export interface HintCycleResult {
  pulled: number;
  claimed: number;
  processed: number;
  stale: number;
  invalid: number;
  retried: number;
  processingFailures: number;
}

export interface HintCycleOptions {
  batchSize?: number;
  visibilityTimeoutMs?: number;
  retryDelaySeconds?: number;
  onProcessingError?: (error: unknown) => void;
}

/**
 * Consumes queue hints, then claims the real FIFO work from PostgreSQL. The
 * hint is acknowledged after a successful authoritative claim and before the
 * long report run; a crash remains recoverable through the database lease.
 */
export async function runQueueHintCycle<Job>(
  queue: JobNotificationQueue,
  runner: AuthoritativeJobRunner<Job>,
  workerId: string,
  tier: ReportTier,
  options: HintCycleOptions = {}
): Promise<HintCycleResult> {
  const messages = await queue.pull(tier, {
    batchSize: boundedBatchSize(options.batchSize),
    visibilityTimeoutMs: options.visibilityTimeoutMs ?? 30_000
  });
  const result: HintCycleResult = {
    pulled: messages.length,
    claimed: 0,
    processed: 0,
    stale: 0,
    invalid: 0,
    retried: 0,
    processingFailures: 0
  };

  for (const message of messages) {
    if (!message.notification || message.notification.tier !== tier) {
      result.invalid += 1;
      await bestEffortAcknowledge(queue, tier, message.leaseId);
      continue;
    }

    let job: Job | null;
    try {
      job = await runner.claim(workerId, tier);
    } catch {
      result.retried += 1;
      await bestEffortRetry(queue, tier, message.leaseId, options.retryDelaySeconds ?? 30);
      continue;
    }

    if (!job) {
      result.stale += 1;
      await bestEffortAcknowledge(queue, tier, message.leaseId);
      continue;
    }

    result.claimed += 1;
    await bestEffortAcknowledge(queue, tier, message.leaseId);
    try {
      await runner.process(job, workerId);
      result.processed += 1;
    } catch (error) {
      result.processingFailures += 1;
      options.onProcessingError?.(error);
    }
  }
  return result;
}

async function bestEffortAcknowledge(queue: JobNotificationQueue, tier: ReportTier, leaseId: string): Promise<void> {
  await queue.acknowledge(tier, [leaseId]).catch(() => undefined);
}

async function bestEffortRetry(
  queue: JobNotificationQueue,
  tier: ReportTier,
  leaseId: string,
  delaySeconds: number
): Promise<void> {
  await queue.retry(tier, [{ leaseId, delaySeconds }]).catch(() => undefined);
}

function boundedBatchSize(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0 ? Math.min(100, value!) : 1;
}

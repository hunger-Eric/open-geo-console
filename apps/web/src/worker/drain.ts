import { randomUUID } from "node:crypto";
import type { ReportTier } from "@/db/schema";
import type { JobNotificationQueue } from "@/queue/job-notification";
import { runQueueHintCycle, type AuthoritativeJobRunner } from "@/queue/consumer";

export interface DrainResult {
  tier: ReportTier;
  replicas: number;
  claimedJobs: number;
  completedJobs: number;
  failedJobs: number;
}

export class DrainClaimError extends Error {
  constructor(public readonly result: DrainResult, cause: unknown) {
    super("The batch drain could not claim authoritative work.", { cause });
    this.name = "DrainClaimError";
  }
}

export interface DrainOptions<Job> {
  tier: ReportTier;
  replicas?: number;
  workerIdPrefix?: string;
  runner: AuthoritativeJobRunner<Job>;
  shouldStop?: () => boolean;
  onClaim?: (job: Job, workerId: string) => void;
  onProcessingError?: (error: unknown, workerId: string) => void;
}

/** Claims until PostgreSQL has no eligible job. Parallel loops are safe because claimScanJob uses SKIP LOCKED. */
export async function drainTierUntilEmpty<Job>(options: DrainOptions<Job>): Promise<DrainResult> {
  const replicas = boundedReplicas(options.replicas);
  const result: DrainResult = {
    tier: options.tier,
    replicas,
    claimedJobs: 0,
    completedJobs: 0,
    failedJobs: 0
  };
  const prefix = options.workerIdPrefix ?? `ogc-batch-${options.tier}-${randomUUID()}`;
  const claimErrors: unknown[] = [];

  await Promise.all(Array.from({ length: replicas }, async (_, index) => {
    const workerId = `${prefix}-${index + 1}`;
    while (!options.shouldStop?.()) {
      let job: Job | null;
      try {
        job = await options.runner.claim(workerId, options.tier);
      } catch (error) {
        claimErrors.push(error);
        return;
      }
      if (!job) return;
      result.claimedJobs += 1;
      options.onClaim?.(job, workerId);
      try {
        await options.runner.process(job, workerId);
        result.completedJobs += 1;
      } catch (error) {
        result.failedJobs += 1;
        options.onProcessingError?.(error, workerId);
      }
    }
  }));
  if (claimErrors.length > 0) throw new DrainClaimError(result, claimErrors[0]);
  return result;
}

export interface RealtimeLaneOptions<Job> extends Omit<DrainOptions<Job>, "replicas"> {
  queue: JobNotificationQueue;
  queuePollMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  onCycleError?: (error: unknown) => void;
}

export interface PostgresPollingLaneOptions<Job> extends Omit<DrainOptions<Job>, "replicas"> {
  pollMs?: number;
  delay?: (milliseconds: number) => Promise<void>;
  onCycleError?: (error: unknown) => void;
}

/** Keeps a self-hosted Worker alive while PostgreSQL remains the only job authority. */
export async function runPostgresPollingLane<Job>(options: PostgresPollingLaneOptions<Job>): Promise<DrainResult> {
  const result: DrainResult = {
    tier: options.tier,
    replicas: 1,
    claimedJobs: 0,
    completedJobs: 0,
    failedJobs: 0
  };
  const workerId = options.workerIdPrefix ?? `ogc-postgres-${options.tier}-${randomUUID()}`;
  const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pollMs = boundedPollMs(options.pollMs);

  while (!options.shouldStop?.()) {
    let job: Job | null = null;
    try {
      job = await options.runner.claim(workerId, options.tier);
    } catch (error) {
      options.onCycleError?.(error);
    }
    if (!job) {
      if (!options.shouldStop?.()) await delay(pollMs);
      continue;
    }
    result.claimedJobs += 1;
    options.onClaim?.(job, workerId);
    try {
      await options.runner.process(job, workerId);
      result.completedJobs += 1;
    } catch (error) {
      result.failedJobs += 1;
      options.onProcessingError?.(error, workerId);
    }
  }
  return result;
}

/**
 * Runs startup recovery from PostgreSQL, then waits for Queue hints. Queue is
 * intentionally never asked which job to run.
 */
export async function runRealtimeLane<Job>(options: RealtimeLaneOptions<Job>): Promise<DrainResult> {
  const startup = await drainTierUntilEmpty({ ...options, replicas: 1 });
  const result = { ...startup };
  const workerId = options.workerIdPrefix ?? `ogc-realtime-${options.tier}-${randomUUID()}`;
  const delay = options.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pollMs = boundedPollMs(options.queuePollMs);

  while (!options.shouldStop?.()) {
    let idle = true;
    try {
      const cycle = await runQueueHintCycle(options.queue, options.runner, workerId, options.tier, {
        batchSize: 1,
        onProcessingError: (error) => options.onProcessingError?.(error, workerId)
      });
      result.claimedJobs += cycle.claimed;
      result.completedJobs += cycle.processed;
      result.failedJobs += cycle.processingFailures;
      idle = cycle.pulled === 0;
    } catch (error) {
      options.onCycleError?.(error);
    }
    if (!options.shouldStop?.() && idle) await delay(pollMs);
  }
  return result;
}

export function boundedReplicas(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! > 0 ? Math.min(16, value!) : 1;
}

function boundedPollMs(value: number | undefined): number {
  return Number.isSafeInteger(value) && value! >= 1_000 ? Math.min(5 * 60_000, value!) : 30_000;
}

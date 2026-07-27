import { randomUUID } from "node:crypto";
import type { ReportTier } from "@/db/schema";
import { DrainClaimError, drainTierUntilEmpty, type DrainOptions, type DrainResult } from "./drain";

export type BatchRunStatus = "succeeded" | "partial" | "failed";

export interface BatchRunRepository {
  startBatchRun(input: { id?: string; tier: ReportTier; replicaCount: number }): Promise<{ id: string }>;
  finishBatchRun(input: {
    id: string;
    status: BatchRunStatus;
    claimedJobs: number;
    completedJobs: number;
    failedJobs: number;
    errorCode?: string;
  }): Promise<unknown>;
}

export interface RecordedDrainOptions<Job> extends DrainOptions<Job> {
  batchRuns: BatchRunRepository;
}

export async function runRecordedBatchDrain<Job>(options: RecordedDrainOptions<Job>): Promise<DrainResult> {
  const replicaCount = Math.max(1, Math.min(16, options.replicas ?? 1));
  const requestedId = `batch-${options.tier}-${randomUUID()}`;
  const run = await options.batchRuns.startBatchRun({ id: requestedId, tier: options.tier, replicaCount });
  let result: DrainResult | undefined;
  try {
    result = await drainTierUntilEmpty({ ...options, replicas: replicaCount });
    await options.batchRuns.finishBatchRun({
      id: run.id,
      status: result.failedJobs > 0 ? "partial" : "succeeded",
      ...metrics(result)
    });
    return result;
  } catch (error) {
    const failedResult = error instanceof DrainClaimError ? error.result : result;
    await options.batchRuns.finishBatchRun({
      id: run.id,
      status: "failed",
      ...(failedResult ? metrics(failedResult) : { claimedJobs: 0, completedJobs: 0, failedJobs: 0 }),
      errorCode: "batch_drain_failed"
    }).catch(() => undefined);
    throw error;
  }
}

function metrics(result: DrainResult) {
  return {
    claimedJobs: result.claimedJobs,
    completedJobs: result.completedJobs,
    failedJobs: result.failedJobs
  };
}

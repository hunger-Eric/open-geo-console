import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import {
  batchRuns,
  type BatchRunRow,
  type BatchRunStatus,
  type ReportTier,
  type WorkerPresenceRow,
  workerPresence
} from "./schema";

export async function heartbeatWorkerPresence(input: {
  instanceId: string;
  tier: ReportTier;
  deploymentVersion: string;
}): Promise<WorkerPresenceRow> {
  if (!input.instanceId || !input.deploymentVersion) {
    throw new Error("Worker instance ID and deployment version are required.");
  }
  await ensureDatabase();
  const [row] = await getDb()
    .insert(workerPresence)
    .values({
      instanceId: input.instanceId,
      tier: input.tier,
      deploymentVersion: input.deploymentVersion
    })
    .onConflictDoUpdate({
      target: workerPresence.instanceId,
      set: {
        tier: input.tier,
        deploymentVersion: input.deploymentVersion,
        lastHeartbeatAt: new Date()
      }
    })
    .returning();
  return row;
}

export async function removeWorkerPresence(instanceId: string): Promise<boolean> {
  await ensureDatabase();
  const rows = await getDb()
    .delete(workerPresence)
    .where(eq(workerPresence.instanceId, instanceId))
    .returning({ instanceId: workerPresence.instanceId });
  return rows.length === 1;
}

export async function hasHealthyWorkerPresence(tier: ReportTier, maxAgeSeconds = 600): Promise<boolean> {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 10) {
    throw new Error("Worker presence age must be an integer of at least 10 seconds.");
  }
  await ensureDatabase();
  const rows = await getSqlClient()<{ healthy: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM worker_presence
      WHERE tier = ${tier}
        AND last_heartbeat_at > now() - (${maxAgeSeconds} * interval '1 second')
    ) AS healthy
  `;
  return rows[0]?.healthy ?? false;
}

export async function startBatchRun(input: {
  id?: string;
  tier: ReportTier;
  replicaCount: number;
}): Promise<BatchRunRow> {
  if (!Number.isSafeInteger(input.replicaCount) || input.replicaCount < 1) {
    throw new Error("Batch replica count must be a positive integer.");
  }
  await ensureDatabase();
  const id = input.id ?? randomUUID();
  const [row] = await getDb()
    .insert(batchRuns)
    .values({
      id,
      tier: input.tier,
      replicaCount: input.replicaCount,
      status: "running"
    })
    .onConflictDoNothing({ target: batchRuns.id })
    .returning();
  if (row) return row;
  const [existing] = await getDb().select().from(batchRuns).where(eq(batchRuns.id, id)).limit(1);
  if (!existing || existing.tier !== input.tier || existing.replicaCount !== input.replicaCount) {
    throw new Error("The batch run ID conflicts with another run.");
  }
  return existing;
}

export async function finishBatchRun(input: {
  id: string;
  status: Exclude<BatchRunStatus, "running">;
  claimedJobs: number;
  completedJobs: number;
  failedJobs: number;
  errorCode?: string | null;
}): Promise<BatchRunRow> {
  assertBatchCounts(input);
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE batch_runs
    SET status = ${input.status}, claimed_jobs = ${input.claimedJobs},
        completed_jobs = ${input.completedJobs}, failed_jobs = ${input.failedJobs},
        error_code = ${input.errorCode ?? null}, finished_at = COALESCE(finished_at, now())
    WHERE id = ${input.id} AND status = 'running'
    RETURNING id
  `;
  if (!rows[0]) {
    const existing = await getBatchRun(input.id);
    if (!existing
      || existing.status !== input.status
      || existing.claimedJobs !== input.claimedJobs
      || existing.completedJobs !== input.completedJobs
      || existing.failedJobs !== input.failedJobs) {
      throw new Error("The batch run is missing or already has another terminal result.");
    }
    return existing;
  }
  return (await getBatchRun(input.id))!;
}

export async function getBatchRun(id: string): Promise<BatchRunRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(batchRuns).where(eq(batchRuns.id, id)).limit(1);
  return row ?? null;
}

export async function getLastSuccessfulBatchRun(tier: ReportTier): Promise<BatchRunRow | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    SELECT id FROM batch_runs
    WHERE tier = ${tier} AND status = 'succeeded'
    ORDER BY finished_at DESC NULLS LAST, started_at DESC
    LIMIT 1
  `;
  return rows[0] ? getBatchRun(rows[0].id) : null;
}

function assertBatchCounts(input: {
  claimedJobs: number;
  completedJobs: number;
  failedJobs: number;
}): void {
  for (const value of [input.claimedJobs, input.completedJobs, input.failedJobs]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Batch job counts must be non-negative integers.");
    }
  }
  if (input.completedJobs + input.failedJobs > input.claimedJobs) {
    throw new Error("Completed and failed batch jobs cannot exceed claimed jobs.");
  }
}

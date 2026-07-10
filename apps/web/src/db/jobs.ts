import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import { scanJobs, type JobCheckpoint, type ReportTier, type ScanJobRow, type ScanJobStage } from "./schema";

const TERMINAL_STAGES: ScanJobStage[] = ["completed", "partial", "failed"];

export type ScanJobWaitReason = "jobs_ahead" | "active_jobs_in_pool" | "awaiting_claim";
export type ActiveWorkerTier = "preview" | "deep" | "mixed";

export interface ScanJobQueueStatus {
  queuePosition: number | null;
  waitReason: ScanJobWaitReason | null;
  activeTier: ActiveWorkerTier | null;
}

export interface EnqueueScanJobInput {
  reportId: string;
  tier: ReportTier;
  locale: string;
  creditReservationId?: string;
  maxAttempts?: number;
}

export async function enqueueScanJob(input: EnqueueScanJobInput): Promise<ScanJobRow> {
  await ensureDatabase();
  const [row] = await getDb()
    .insert(scanJobs)
    .values({
      id: randomUUID(),
      reportId: input.reportId,
      tier: input.tier,
      locale: input.locale,
      creditReservationId: input.creditReservationId ?? null,
      maxAttempts: input.maxAttempts ?? 3
    })
    .returning();
  return row;
}

export async function getScanJob(id: string): Promise<ScanJobRow | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(scanJobs).where(eq(scanJobs.id, id)).limit(1);
  return row ?? null;
}

export async function getLatestScanJob(reportId: string, tier?: ReportTier): Promise<ScanJobRow | null> {
  await ensureDatabase();
  const where = tier ? and(eq(scanJobs.reportId, reportId), eq(scanJobs.tier, tier)) : eq(scanJobs.reportId, reportId);
  const [row] = await getDb().select().from(scanJobs).where(where).orderBy(desc(scanJobs.createdAt)).limit(1);
  return row ?? null;
}

export async function getScanJobQueueStatus(id: string): Promise<ScanJobQueueStatus | null> {
  await ensureDatabase();
  const rows = await getSqlClient()<{
    stage: ScanJobStage;
    queue_position: number | null;
    same_tier_active: boolean;
    free_active: boolean;
    deep_active: boolean;
  }[]>`
    WITH target AS (
      SELECT id, tier, stage
      FROM scan_jobs
      WHERE id = ${id}
    ), eligible AS (
      SELECT job.id, job.created_at
      FROM scan_jobs job
      CROSS JOIN target
      WHERE job.tier = target.tier
        AND job.attempts < job.max_attempts
        AND (
          (job.stage = 'queued' AND (job.lease_expires_at IS NULL OR job.lease_expires_at <= now()))
          OR (
            job.stage NOT IN ('queued', 'completed', 'partial', 'failed')
            AND job.lease_expires_at <= now()
          )
        )
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY created_at, id)::integer AS queue_position
      FROM eligible
    ), active_leases AS (
      SELECT
        COALESCE(bool_or(job.tier = 'free'), false) AS free_active,
        COALESCE(bool_or(job.tier = 'deep'), false) AS deep_active
      FROM scan_jobs job
      WHERE job.stage NOT IN ('completed', 'partial', 'failed')
        AND job.lease_expires_at > now()
    )
    SELECT
      target.stage,
      ranked.queue_position,
      EXISTS (
        SELECT 1
        FROM scan_jobs active_job
        WHERE active_job.tier = target.tier
          AND active_job.stage NOT IN ('completed', 'partial', 'failed')
          AND active_job.lease_expires_at > now()
      ) AS same_tier_active,
      active_leases.free_active,
      active_leases.deep_active
    FROM target
    LEFT JOIN ranked ON ranked.id = target.id
    CROSS JOIN active_leases
  `;
  const row = rows[0];
  return row ? deriveScanJobQueueStatus(row) : null;
}

export function deriveScanJobQueueStatus(input: {
  stage: ScanJobStage;
  queue_position: number | null;
  same_tier_active: boolean;
  free_active: boolean;
  deep_active: boolean;
}): ScanJobQueueStatus {
  const activeTier = input.free_active && input.deep_active
    ? "mixed"
    : input.free_active
      ? "preview"
      : input.deep_active
        ? "deep"
        : null;
  if (input.stage !== "queued") {
    return { queuePosition: null, waitReason: null, activeTier };
  }
  const queuePosition = input.queue_position;
  const waitReason = queuePosition !== null && queuePosition > 1
    ? "jobs_ahead"
    : input.same_tier_active
      ? "active_jobs_in_pool"
      : queuePosition === 1
        ? "awaiting_claim"
        : null;
  return { queuePosition, waitReason, activeTier };
}

export async function claimScanJob(
  workerId: string,
  tier: ReportTier,
  leaseSeconds = 90
): Promise<ScanJobRow | null> {
  if (!workerId || leaseSeconds < 10) {
    throw new Error("A worker id and a lease of at least 10 seconds are required.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const claimed = await sql.begin(async (tx) => {
    // Permanently fail abandoned jobs that already consumed their last attempt,
    // then atomically return any still-reserved commercial credit.
    await tx`
      WITH failed_jobs AS (
        UPDATE scan_jobs
        SET stage = 'failed', lease_owner = NULL, lease_expires_at = NULL,
            error_code = 'lease_exhausted',
            public_error = 'The analysis could not be completed after multiple attempts.',
            updated_at = now()
        WHERE stage NOT IN ('completed', 'partial', 'failed')
          AND lease_expires_at <= now()
          AND attempts >= max_attempts
        RETURNING credit_reservation_id
      ), refunded AS (
        UPDATE credit_ledger ledger
        SET status = 'refunded', refunded_at = now()
        FROM failed_jobs
        WHERE ledger.id = failed_jobs.credit_reservation_id AND ledger.status = 'reserved'
        RETURNING ledger.access_key_id, ledger.credits
      )
      UPDATE access_keys access
      SET credits_remaining = access.credits_remaining + refunded.credits,
          status = CASE WHEN access.status = 'exhausted' THEN 'active' ELSE access.status END
      FROM refunded WHERE access.id = refunded.access_key_id
    `;
    return tx<{ id: string }[]>`
      UPDATE scan_jobs
      SET lease_owner = ${workerId},
          lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
          attempts = attempts + 1,
          updated_at = now()
      WHERE id = (
        SELECT id
        FROM scan_jobs
        WHERE attempts < max_attempts
          AND tier = ${tier}
          AND (
            (stage = 'queued' AND (lease_expires_at IS NULL OR lease_expires_at <= now()))
            OR (stage NOT IN ('queued', 'completed', 'partial', 'failed') AND lease_expires_at <= now())
          )
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id
    `;
  });
  return claimed[0] ? getScanJob(claimed[0].id) : null;
}

export async function heartbeatScanJob(id: string, workerId: string, leaseSeconds = 90): Promise<boolean> {
  await ensureDatabase();
  const sql = getSqlClient();
  const rows = await sql<{ id: string }[]>`
    UPDATE scan_jobs
    SET lease_expires_at = now() + (${leaseSeconds} * interval '1 second'), updated_at = now()
    WHERE id = ${id}
      AND lease_owner = ${workerId}
      AND stage NOT IN ('completed', 'partial', 'failed')
    RETURNING id
  `;
  return rows.length === 1;
}

export interface CheckpointScanJobInput {
  stage: Exclude<ScanJobStage, "completed" | "partial" | "failed">;
  progress: number;
  checkpoint?: JobCheckpoint;
  plannedPages?: number;
  successfulPages?: number;
  failedPages?: number;
}

export async function checkpointScanJob(
  id: string,
  workerId: string,
  input: CheckpointScanJobInput
): Promise<ScanJobRow> {
  if (input.progress < 0 || input.progress > 99) {
    throw new Error("In-progress job progress must be between 0 and 99.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const checkpoint = JSON.stringify(input.checkpoint ?? {});
  const rows = await sql<{ id: string }[]>`
    UPDATE scan_jobs
    SET stage = ${input.stage},
        progress = ${input.progress},
        checkpoint = checkpoint || ${checkpoint}::jsonb,
        planned_pages = COALESCE(${input.plannedPages ?? null}, planned_pages),
        successful_pages = COALESCE(${input.successfulPages ?? null}, successful_pages),
        failed_pages = COALESCE(${input.failedPages ?? null}, failed_pages),
        updated_at = now()
    WHERE id = ${id}
      AND lease_owner = ${workerId}
      AND lease_expires_at > now()
      AND stage NOT IN ('completed', 'partial', 'failed')
    RETURNING id
  `;
  if (!rows[0]) {
    throw new Error("The scan job lease is missing or expired.");
  }
  return (await getScanJob(id))!;
}

export async function finishScanJob(
  id: string,
  workerId: string,
  stage: "completed" | "partial",
  coverage: { plannedPages: number; successfulPages: number; failedPages: number }
): Promise<ScanJobRow> {
  await ensureDatabase();
  const sql = getSqlClient();
  const rows = await sql<{ id: string }[]>`
    UPDATE scan_jobs
    SET stage = ${stage}, progress = 100,
        planned_pages = ${coverage.plannedPages},
        successful_pages = ${coverage.successfulPages},
        failed_pages = ${coverage.failedPages},
        lease_owner = NULL, lease_expires_at = NULL,
        error_code = NULL, public_error = NULL, updated_at = now()
    WHERE id = ${id} AND lease_owner = ${workerId}
      AND stage NOT IN ('completed', 'partial', 'failed')
    RETURNING id
  `;
  if (!rows[0]) {
    throw new Error("The scan job cannot be completed without its active lease.");
  }
  return (await getScanJob(id))!;
}

export async function failScanJob(
  id: string,
  workerId: string,
  error: { code: string; publicMessage: string; retryable: boolean }
): Promise<ScanJobRow> {
  await ensureDatabase();
  const sql = getSqlClient();
  const rows = await sql.begin(async (tx) => {
    const failed = await tx<{ id: string; stage: ScanJobStage; credit_reservation_id: string | null }[]>`
      UPDATE scan_jobs
      SET stage = CASE WHEN ${error.retryable} AND attempts < max_attempts THEN 'queued' ELSE 'failed' END,
          lease_owner = NULL, lease_expires_at = NULL,
          error_code = ${error.code}, public_error = ${error.publicMessage}, updated_at = now()
      WHERE id = ${id} AND lease_owner = ${workerId}
        AND stage NOT IN ('completed', 'partial', 'failed')
      RETURNING id, stage, credit_reservation_id
    `;
    const row = failed[0];
    if (row?.stage === "failed" && row.credit_reservation_id) {
      await tx`
        WITH refunded AS (
          UPDATE credit_ledger
          SET status = 'refunded', refunded_at = now()
          WHERE id = ${row.credit_reservation_id} AND status = 'reserved'
          RETURNING access_key_id, credits
        )
        UPDATE access_keys access
        SET credits_remaining = access.credits_remaining + refunded.credits,
            status = CASE WHEN access.status = 'exhausted' THEN 'active' ELSE access.status END
        FROM refunded WHERE access.id = refunded.access_key_id
      `;
    }
    return failed;
  });
  if (!rows[0]) {
    throw new Error("The scan job cannot be failed without its active lease.");
  }
  return (await getScanJob(id))!;
}

export async function retryScanJob(id: string): Promise<ScanJobRow> {
  await ensureDatabase();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    const jobs = await tx<{ id: string; stage: ScanJobStage; credit_reservation_id: string | null }[]>`
      SELECT id, stage, credit_reservation_id FROM scan_jobs WHERE id = ${id} FOR UPDATE
    `;
    const job = jobs[0];
    if (!job) throw new Error("The scan job does not exist.");
    if (job.stage !== "failed" && job.stage !== "partial") {
      throw new Error("Only a failed or partial scan job can be retried.");
    }

    if (job.credit_reservation_id) {
      const reservations = await tx<{
        id: string;
        access_key_id: string;
        credits: number;
        status: "reserved" | "settled" | "refunded";
      }[]>`
        SELECT id, access_key_id, credits, status
        FROM credit_ledger WHERE id = ${job.credit_reservation_id} FOR UPDATE
      `;
      const reservation = reservations[0];
      if (!reservation) throw new Error("The job's credit reservation no longer exists.");
      if (reservation.status === "settled") throw new Error("A settled commercial job cannot be retried.");
      if (reservation.status === "refunded") {
        const charged = await tx<{ id: string }[]>`
          UPDATE access_keys
          SET credits_remaining = credits_remaining - ${reservation.credits},
              status = CASE WHEN credits_remaining - ${reservation.credits} = 0 THEN 'exhausted' ELSE status END
          WHERE id = ${reservation.access_key_id}
            AND status IN ('active', 'exhausted')
            AND credits_remaining >= ${reservation.credits}
            AND (expires_at IS NULL OR expires_at > now())
          RETURNING id
        `;
        if (!charged[0]) throw new Error("The access key no longer has credit available for this retry.");
        await tx`
          UPDATE credit_ledger SET status = 'reserved', refunded_at = NULL
          WHERE id = ${reservation.id}
        `;
      }
    }

    await tx`
      UPDATE scan_jobs
      SET stage = 'queued', progress = 0, attempts = 0,
          lease_owner = NULL, lease_expires_at = NULL,
          error_code = NULL, public_error = NULL, updated_at = now()
      WHERE id = ${id}
    `;
  });
  return (await getScanJob(id))!;
}

export function isBillableCoverage(input: {
  plannedPages: number;
  successfulPages: number;
  homepageSucceeded: boolean;
  evidenceValidated: boolean;
}): boolean {
  if (!input.homepageSucceeded || !input.evidenceValidated || input.plannedPages <= 0) {
    return false;
  }
  return input.successfulPages / input.plannedPages >= 0.7;
}

export function isTerminalStage(stage: ScanJobStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

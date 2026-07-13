import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import {
  scanJobs,
  type CreditStatus,
  type JobCheckpoint,
  type ReportLocale,
  type RecommendationFulfillmentMethodology,
  type RecommendationReportVersion,
  type ReportProductContract,
  type ReportTier,
  type ScanJobReason,
  type ScanJobRow,
  type ScanJobStage
} from "./schema";
import { JobTransitionService } from "@/worker/job-transition-service";
import { phaseForStage, stageForPhase, type ScanJobPhase } from "@/worker/job-state";
import type { NormalizedJobError } from "@/worker/job-errors";
import { validateRecoveryCheckpoint } from "@/worker/job-recovery";

export { getJobCreditStatus } from "./credits";

const TERMINAL_STAGES: ScanJobStage[] = ["completed", "completed_limited", "failed"];
export type TerminalScanJobStage = Extract<ScanJobStage, "completed" | "completed_limited" | "failed">;

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
  productContract?: ReportProductContract;
  fulfillmentMethodology?: RecommendationFulfillmentMethodology | null;
  recommendationReportVersion?: RecommendationReportVersion | null;
  locale: ReportLocale;
  reason?: ScanJobReason;
  creditReservationId?: string;
  maxAttempts?: number;
  maxActiveTierJobs?: number;
}

export class ScanJobCapacityError extends Error {
  constructor() {
    super("The staging report concurrency limit has been reached.");
    this.name = "ScanJobCapacityError";
  }
}

export async function enqueueScanJob(input: EnqueueScanJobInput): Promise<ScanJobRow> {
  assertFulfillmentPair(input.productContract ?? "legacy_website_audit_v1", input.fulfillmentMethodology ?? null, input.recommendationReportVersion ?? null);
  if (input.productContract === "recommendation_forensics_v1" && input.tier !== "deep") {
    throw new Error("Recommendation-forensics jobs require the deep Worker lane.");
  }
  await ensureDatabase();
  if (input.maxActiveTierJobs !== undefined) {
    if (!Number.isSafeInteger(input.maxActiveTierJobs) || input.maxActiveTierJobs < 1 || input.maxActiveTierJobs > 2) {
      throw new Error("The staging active-job limit must be an integer from 1 through 2.");
    }
    const id = randomUUID();
    await getSqlClient().begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`enqueue-tier:${input.tier}`}, 0))`;
      const counts = await tx<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM scan_jobs
        WHERE tier = ${input.tier}
          AND stage NOT IN ('completed', 'completed_limited', 'failed')
      `;
      if ((counts[0]?.count ?? 0) >= input.maxActiveTierJobs!) throw new ScanJobCapacityError();
      await tx`
        INSERT INTO scan_jobs (id, report_id, tier, product_contract, fulfillment_methodology, recommendation_report_version, locale, reason, credit_reservation_id, max_attempts)
        VALUES (
          ${id}, ${input.reportId}, ${input.tier}, ${input.productContract ?? "legacy_website_audit_v1"}, ${input.fulfillmentMethodology ?? null}, ${input.recommendationReportVersion ?? null}, ${input.locale}, ${input.reason ?? "standard"},
          ${input.creditReservationId ?? null}, ${input.maxAttempts ?? 3}
        )
      `;
    });
    return (await getScanJob(id))!;
  }
  const [row] = await getDb()
    .insert(scanJobs)
    .values({
      id: randomUUID(),
      reportId: input.reportId,
      tier: input.tier,
      productContract: input.productContract ?? "legacy_website_audit_v1",
      fulfillmentMethodology: input.fulfillmentMethodology ?? null,
      recommendationReportVersion: input.recommendationReportVersion ?? null,
      locale: input.locale,
      reason: input.reason ?? "standard",
      creditReservationId: input.creditReservationId ?? null,
      maxAttempts: input.maxAttempts ?? 3
    })
    .returning();
  return row;
}

function assertFulfillmentPair(
  productContract: ReportProductContract,
  methodology: RecommendationFulfillmentMethodology | null,
  reportVersion: RecommendationReportVersion | null
): void {
  if (productContract === "recommendation_forensics_v1" &&
      !((methodology === "answer_engine_recommendation_forensics_v1" && reportVersion === 1) ||
        (methodology === "public_search_source_forensics_v1" && reportVersion === 2))) {
    throw new Error("Recommendation-forensics jobs require a matching explicit methodology and report version.");
  }
  if (productContract === "legacy_website_audit_v1" && (methodology !== null || reportVersion !== null)) {
    throw new Error("Legacy website-audit jobs cannot use a recommendation fulfillment methodology or report version.");
  }
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
      SELECT id, tier, stage, execution_state
      FROM scan_jobs
      WHERE id = ${id}
    ), eligible AS (
      SELECT job.id, job.created_at
      FROM scan_jobs job
      CROSS JOIN target
      WHERE job.tier = target.tier
        AND job.phase_attempt < job.max_attempts
        AND (
          job.execution_state IN ('queued', 'retry_wait')
          AND (job.retry_not_before IS NULL OR job.retry_not_before <= now())
          AND (job.lease_expires_at IS NULL OR job.lease_expires_at <= now())
        )
    ), ranked AS (
      SELECT id, row_number() OVER (ORDER BY created_at, id)::integer AS queue_position
      FROM eligible
    ), active_leases AS (
      SELECT
        COALESCE(bool_or(job.tier = 'free'), false) AS free_active,
        COALESCE(bool_or(job.tier = 'deep'), false) AS deep_active
      FROM scan_jobs job
      WHERE job.execution_state = 'running'
        AND job.lease_expires_at > now()
    )
    SELECT
      target.stage,
      ranked.queue_position,
      EXISTS (
        SELECT 1
        FROM scan_jobs active_job
        WHERE active_job.tier = target.tier
          AND active_job.execution_state = 'running'
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
  await sql.begin(async (tx) => {
    const recoverableExpired = await tx<Array<{
      id: string;
      current_phase: ScanJobPhase;
      checkpoint_revision: number;
    }>>`
      UPDATE scan_jobs
      SET execution_state = 'retry_wait', lease_owner = NULL, lease_expires_at = NULL,
          retry_not_before = NULL, error_code = 'lease_expired',
          public_error = 'The analysis is being recovered after a Worker interruption.',
          updated_at = now()
      WHERE execution_state = 'running'
        AND lease_expires_at <= now()
        AND phase_attempt < max_attempts
      RETURNING id, current_phase, checkpoint_revision
    `;
    for (const job of recoverableExpired) {
      await JobTransitionService.appendTransition(tx, {
        jobId: job.id,
        fromState: "running",
        toState: "retry_wait",
        phase: job.current_phase,
        checkpointRevision: job.checkpoint_revision,
        reasonCode: "lease_expired"
      });
    }

    // Permanently fail only the phase that exhausted its local transient budget,
    // then atomically return any still-reserved commercial credit.
    await tx`
      WITH failed_jobs AS (
        UPDATE scan_jobs
        SET stage = 'failed', execution_state = 'failed', current_phase = 'terminalization',
            lease_owner = NULL, lease_expires_at = NULL, retry_not_before = NULL,
            error_code = 'lease_exhausted',
            public_error = 'The analysis could not be completed after multiple attempts.',
            updated_at = now()
        WHERE execution_state IN ('running', 'retry_wait')
          AND (lease_expires_at IS NULL OR lease_expires_at <= now())
          AND phase_attempt >= max_attempts
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
    await tx`
      DELETE FROM staging_free_regenerations regeneration
      USING scan_jobs job
      WHERE regeneration.job_id = job.id AND job.stage = 'failed'
    `;
  });
  const claimedId = await JobTransitionService.claim(workerId, tier, leaseSeconds);
  return claimedId ? getScanJob(claimedId) : null;
}

export async function heartbeatScanJob(id: string, workerId: string, leaseSeconds = 90): Promise<boolean> {
  await ensureDatabase();
  const sql = getSqlClient();
  const rows = await sql<{ id: string }[]>`
    UPDATE scan_jobs
    SET lease_expires_at = now() + (${leaseSeconds} * interval '1 second'), updated_at = now()
    WHERE id = ${id}
      AND lease_owner = ${workerId}
      AND execution_state = 'running'
    RETURNING id
  `;
  return rows.length === 1;
}

export interface CheckpointScanJobInput {
  stage: Exclude<ScanJobStage, TerminalScanJobStage>;
  progress: number;
  checkpoint?: JobCheckpoint;
  plannedPages?: number;
  successfulPages?: number;
  failedPages?: number;
  phase?: ScanJobPhase;
  recovery?: JobCheckpoint["recovery"];
  /**
   * Worker recovery writers supply the revision they observed when the lease
   * was claimed. This prevents a stale execution from overwriting a newer
   * checkpoint while still allowing legacy database maintenance callers to
   * omit the guard.
   */
  expectedCheckpointRevision?: number;
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
  await sql.begin(async (tx) => {
    const rows = await tx<{ id: string; execution_state: string; checkpoint_revision: number; current_phase: ScanJobPhase }[]>`
      UPDATE scan_jobs
      SET stage = ${input.stage}, execution_state = 'running', current_phase = ${input.phase ?? phaseForStage(input.stage)},
          progress = ${input.progress}, checkpoint = checkpoint || ${checkpoint}::jsonb,
          checkpoint_revision = checkpoint_revision + 1, phase_attempt = 0, retry_not_before = NULL,
          planned_pages = COALESCE(${input.plannedPages ?? null}, planned_pages),
          successful_pages = COALESCE(${input.successfulPages ?? null}, successful_pages),
          failed_pages = COALESCE(${input.failedPages ?? null}, failed_pages), updated_at = now()
      WHERE id = ${id} AND lease_owner = ${workerId} AND lease_expires_at > now()
        AND execution_state = 'running'
        AND (${input.expectedCheckpointRevision ?? null}::integer IS NULL OR checkpoint_revision = ${input.expectedCheckpointRevision ?? null})
      RETURNING id, execution_state, checkpoint_revision, current_phase
    `;
    const row = rows[0];
    if (!row) throw new Error("The scan job lease is missing or expired.");
    await JobTransitionService.appendTransition(tx, { jobId: id, fromState: row.execution_state, toState: "running",
      phase: row.current_phase, checkpointRevision: row.checkpoint_revision, reasonCode: "checkpoint_advanced" });
  });
  return (await getScanJob(id))!;
}

export interface ScanJobCoverage {
  plannedPages: number;
  successfulPages: number;
  failedPages: number;
}

export interface TerminalizeScanJobInput {
  stage: TerminalScanJobStage;
  coverage: ScanJobCoverage;
  error?: { code: string; publicMessage: string };
  internalError?: NormalizedJobError;
  phase?: ScanJobPhase;
}

export function terminalCreditStatus(stage: TerminalScanJobStage): Exclude<CreditStatus, "reserved"> {
  return stage === "completed" ? "settled" : "refunded";
}

/**
 * Commits the product outcome and commercial outcome together. If any credit
 * transition is invalid, the job update is rolled back as part of the same
 * PostgreSQL transaction, so a normal terminal path cannot leave a reservation
 * pending.
 */
export async function terminalizeScanJob(
  id: string,
  workerId: string,
  input: TerminalizeScanJobInput
): Promise<ScanJobRow> {
  assertCoverage(input.coverage);
  await ensureDatabase();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    const jobs = await tx<{ id: string; report_id: string; tier: ReportTier; credit_reservation_id: string | null; execution_state: string; checkpoint_revision: number }[]>`
      UPDATE scan_jobs
      SET stage = ${input.stage},
          execution_state = ${input.stage === "failed" ? "failed" : "completed"},
          current_phase = 'terminalization', retry_not_before = NULL, repair_reason_code = NULL, repair_deadline_at = NULL,
          progress = CASE WHEN ${input.stage} = 'failed' THEN progress ELSE 100 END,
          planned_pages = ${input.coverage.plannedPages},
          successful_pages = ${input.coverage.successfulPages},
          failed_pages = ${input.coverage.failedPages},
          lease_owner = NULL,
          lease_expires_at = NULL,
          error_code = CASE WHEN ${input.stage} = 'failed' THEN ${input.error?.code ?? "analysis_failed"} ELSE NULL END,
          public_error = CASE WHEN ${input.stage} = 'failed'
            THEN ${input.error?.publicMessage ?? "The analysis could not be completed."}
            ELSE NULL
          END,
          updated_at = now()
      WHERE id = ${id}
        AND lease_owner = ${workerId}
        AND lease_expires_at > now()
        AND stage NOT IN ('completed', 'completed_limited', 'failed')
      RETURNING id, report_id, tier, credit_reservation_id, execution_state, checkpoint_revision
    `;
    const job = jobs[0];
    if (!job) {
      throw new Error("The scan job cannot be terminalized without its active lease.");
    }
    const errorEventId = input.internalError ? await JobTransitionService.appendError(tx, {
      jobId: id, phase: input.phase ?? "terminalization", checkpointRevision: job.checkpoint_revision,
      jobAttempt: 0, phaseAttempt: 0, resumeGeneration: 0, error: input.internalError
    }) : null;
    await JobTransitionService.appendTransition(tx, { jobId: id, fromState: job.execution_state,
      toState: input.stage === "failed" ? "failed" : "completed", phase: "terminalization",
      checkpointRevision: job.checkpoint_revision, reasonCode: input.error?.code ?? "terminalized", errorEventId });
    if (job.tier === "free") {
      const regenerations = await tx<{ site_key: string; report_id: string }[]>`
        SELECT site_key, report_id
        FROM staging_free_regenerations
        WHERE job_id = ${id} AND report_id = ${job.report_id}
        FOR UPDATE
      `;
      const regeneration = regenerations[0];
      if (regeneration && input.stage !== "failed") {
        await tx`
          INSERT INTO free_site_trials (site_key, report_id, job_id, claimed_at, expires_at)
          VALUES (${regeneration.site_key}, ${regeneration.report_id}, ${id}, now(), now() + interval '30 days')
          ON CONFLICT (site_key) DO UPDATE SET
            report_id = EXCLUDED.report_id,
            job_id = EXCLUDED.job_id,
            claimed_at = EXCLUDED.claimed_at,
            expires_at = EXCLUDED.expires_at
        `;
      }
      if (regeneration) {
        await tx`DELETE FROM staging_free_regenerations WHERE site_key = ${regeneration.site_key} AND job_id = ${id}`;
      }
    }
    if (!job.credit_reservation_id) return;

    const reservations = await tx<{
      id: string;
      access_key_id: string;
      job_id: string | null;
      credits: number;
      status: CreditStatus;
    }[]>`
      SELECT id, access_key_id, job_id, credits, status
      FROM credit_ledger
      WHERE id = ${job.credit_reservation_id}
      FOR UPDATE
    `;
    const reservation = reservations[0];
    if (!reservation) {
      throw new Error("The scan job's credit reservation does not exist.");
    }
    if (reservation.job_id !== null && reservation.job_id !== id) {
      throw new Error("The credit reservation belongs to another scan job.");
    }

    const targetStatus = terminalCreditStatus(input.stage);
    if (reservation.status === targetStatus) return;
    if (reservation.status !== "reserved") {
      throw new Error(`A ${reservation.status} credit reservation cannot become ${targetStatus}.`);
    }

    if (targetStatus === "settled") {
      await tx`
        UPDATE credit_ledger
        SET status = 'settled', settled_at = now(), refunded_at = NULL
        WHERE id = ${reservation.id} AND status = 'reserved'
      `;
      return;
    }

    await tx`
      UPDATE access_keys
      SET credits_remaining = credits_remaining + ${reservation.credits},
          status = CASE WHEN status = 'exhausted' THEN 'active' ELSE status END
      WHERE id = ${reservation.access_key_id}
    `;
    await tx`
      UPDATE credit_ledger
      SET status = 'refunded', refunded_at = now(), settled_at = NULL
      WHERE id = ${reservation.id} AND status = 'reserved'
    `;
  });
  return (await getScanJob(id))!;
}

export async function finishScanJob(
  id: string,
  workerId: string,
  stage: "completed" | "completed_limited",
  coverage: ScanJobCoverage
): Promise<ScanJobRow> {
  return terminalizeScanJob(id, workerId, { stage, coverage });
}

export async function failScanJob(
  id: string,
  workerId: string,
  error: { code: string; publicMessage: string; retryable: boolean; classification?: "operator_repairable" | "target_limitation"; internalError?: NormalizedJobError; phase?: ScanJobPhase }
): Promise<ScanJobRow> {
  if (error.classification === "operator_repairable") {
    await ensureDatabase();
    const sql = getSqlClient();
    await sql.begin(async (tx) => {
      const rows = await tx<{ id: string; execution_state: string; checkpoint_revision: number; attempts: number; phase_attempt: number; resume_generation: number; current_phase: ScanJobPhase }[]>`
        SELECT id, execution_state, checkpoint_revision, attempts, phase_attempt, resume_generation, current_phase
        FROM scan_jobs WHERE id = ${id} AND lease_owner = ${workerId} AND lease_expires_at > now() FOR UPDATE
      `;
      const job = rows[0];
      if (!job) throw new Error("The scan job lease is missing or expired.");
      const errorEventId = error.internalError ? await JobTransitionService.appendError(tx, { jobId: id,
        phase: error.phase ?? job.current_phase, checkpointRevision: job.checkpoint_revision, jobAttempt: job.attempts,
        phaseAttempt: job.phase_attempt, resumeGeneration: job.resume_generation, error: error.internalError }) : null;
      await tx`
        UPDATE scan_jobs SET execution_state='repair_wait', lease_owner=NULL, lease_expires_at=NULL,
          retry_not_before=NULL, repair_reason_code=${error.code}, repair_deadline_at=NULL,
          error_code=${error.code}, public_error=${error.publicMessage}, updated_at=now() WHERE id=${id}
      `;
      await JobTransitionService.appendTransition(tx, { jobId: id, fromState: job.execution_state, toState: "repair_wait",
        phase: error.phase ?? job.current_phase, checkpointRevision: job.checkpoint_revision, reasonCode: error.code, errorEventId });
    });
    return (await getScanJob(id))!;
  }
  if (!error.retryable) {
    const job = await getScanJob(id);
    return terminalizeScanJob(id, workerId, {
      stage: "failed",
      coverage: coverageFromJob(job),
      error: { code: error.code, publicMessage: error.publicMessage }, internalError: error.internalError, phase: error.phase
    });
  }

  await ensureDatabase();
  const rows = await getSqlClient().begin(async (tx) => {
    const candidates = await tx<{ id: string; execution_state: string; current_phase: ScanJobPhase; checkpoint_revision: number; attempts: number; phase_attempt: number; resume_generation: number; max_attempts: number }[]>`
      SELECT id, execution_state, current_phase, checkpoint_revision, attempts, phase_attempt, resume_generation, max_attempts
      FROM scan_jobs WHERE id=${id} AND lease_owner=${workerId} AND lease_expires_at > now() FOR UPDATE
    `;
    const job = candidates[0];
    if (!job || job.phase_attempt >= job.max_attempts) return false;
    const errorEventId = error.internalError ? await JobTransitionService.appendError(tx, { jobId: id,
      phase: error.phase ?? job.current_phase, checkpointRevision: job.checkpoint_revision, jobAttempt: job.attempts,
      phaseAttempt: job.phase_attempt, resumeGeneration: job.resume_generation, error: error.internalError }) : null;
    const retryAt = error.internalError?.retryableAt?.toISOString() ?? new Date(Date.now() + 15_000).toISOString();
    await tx`
      UPDATE scan_jobs SET execution_state='retry_wait', lease_owner=NULL, lease_expires_at=NULL,
        retry_not_before=${retryAt}, error_code=${error.code}, public_error=${error.publicMessage}, updated_at=now() WHERE id=${id}
    `;
    await JobTransitionService.appendTransition(tx, { jobId: id, fromState: job.execution_state, toState: "retry_wait",
      phase: error.phase ?? job.current_phase, checkpointRevision: job.checkpoint_revision, reasonCode: error.code, errorEventId });
    return true;
  });
  if (rows) return (await getScanJob(id))!;

  const job = await getScanJob(id);
  return terminalizeScanJob(id, workerId, {
    stage: "failed",
    coverage: coverageFromJob(job),
    error: { code: error.code, publicMessage: error.publicMessage }, internalError: error.internalError, phase: error.phase
  });
}

export async function retryScanJob(id: string): Promise<ScanJobRow> {
  void id;
  throw new Error("Terminal jobs cannot be retried directly. Use the restricted historical recovery transaction after refund, delivery, checkpoint, and readiness validation.");
}

/**
 * Operator-only recovery boundary. It is deliberately not exposed by a
 * customer route: the caller must supply a non-mutating readiness probe and
 * the exact input identity expected by the preserved checkpoint.
 */
export async function resumeScanJobAfterRepair(input: {
  id: string;
  inputHash: string;
  readiness: () => Promise<void>;
}): Promise<ScanJobRow> {
  await ensureDatabase();
  await input.readiness();
  const sql = getSqlClient();
  await sql.begin(async (tx) => {
    const rows = await tx<{
      id: string; report_id: string; product_contract: ScanJobRow["productContract"]; fulfillment_methodology: ScanJobRow["fulfillmentMethodology"];
      locale: ScanJobRow["locale"]; checkpoint: JobCheckpoint; checkpoint_revision: number; current_phase: ScanJobPhase;
      execution_state: string; resume_generation: number;
    }[]>`
      SELECT id, report_id, product_contract, fulfillment_methodology, locale, checkpoint, checkpoint_revision,
             current_phase, execution_state, resume_generation
      FROM scan_jobs WHERE id=${input.id} FOR UPDATE
    `;
    const job = rows[0];
    if (!job || job.execution_state !== "repair_wait") throw new Error("Only a repair-waiting job can be resumed.");
    validateRecoveryCheckpoint({
      job: { id: job.id, reportId: job.report_id, productContract: job.product_contract,
        fulfillmentMethodology: job.fulfillment_methodology, locale: job.locale,
        checkpointRevision: job.checkpoint_revision, currentPhase: job.current_phase },
      checkpoint: job.checkpoint, phase: job.current_phase, inputHash: input.inputHash
    });
    await tx`
      UPDATE scan_jobs
      SET execution_state='queued', stage=${stageForPhase(job.current_phase)}, retry_not_before=NULL,
          repair_reason_code=NULL, repair_deadline_at=NULL, resume_generation=resume_generation+1,
          error_code=NULL, public_error=NULL, updated_at=now()
      WHERE id=${job.id} AND execution_state='repair_wait'
    `;
    await JobTransitionService.appendTransition(tx, { jobId: job.id, fromState: "repair_wait", toState: "queued",
      phase: job.current_phase, checkpointRevision: job.checkpoint_revision, reasonCode: "repair_readiness_passed" });
  });
  return (await getScanJob(input.id))!;
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

function assertCoverage(coverage: ScanJobCoverage): void {
  for (const [name, value] of Object.entries(coverage)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${name} must be a non-negative integer.`);
    }
  }
  if (coverage.successfulPages > coverage.plannedPages) {
    throw new Error("successfulPages cannot exceed plannedPages.");
  }
}

function coverageFromJob(job: ScanJobRow | null): ScanJobCoverage {
  return {
    plannedPages: job?.plannedPages ?? 0,
    successfulPages: job?.successfulPages ?? 0,
    failedPages: job?.failedPages ?? 0
  };
}

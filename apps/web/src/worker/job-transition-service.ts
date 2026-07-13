import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { getSqlClient } from "@/db";
import type { ReportTier, ScanJobPhase } from "@/db/schema";
import type { NormalizedJobError } from "./job-errors";

type Transaction = postgres.TransactionSql;

export interface TransitionInput {
  jobId: string;
  fromState: string | null;
  toState: "queued" | "running" | "retry_wait" | "repair_wait" | "completed" | "failed";
  phase: ScanJobPhase;
  checkpointRevision: number;
  reasonCode?: string | null;
  errorEventId?: string | null;
}

/**
 * The sole writer for execution-ledger transitions and private error events.
 * Callers own product-specific side effects, but must invoke these helpers in
 * the same PostgreSQL transaction as the `scan_jobs` update.
 */
export class JobTransitionService {
  static async claim(workerId: string, tier: ReportTier, leaseSeconds: number): Promise<string | null> {
    const sql = getSqlClient();
    return sql.begin(async (tx) => {
      const claimed = await tx<{ id: string; checkpoint_revision: number; current_phase: ScanJobPhase }[]>`
        UPDATE scan_jobs
        SET execution_state = 'running', lease_owner = ${workerId},
            lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
            attempts = attempts + 1, phase_attempt = phase_attempt + 1, updated_at = now()
        WHERE id = (
          SELECT id FROM scan_jobs
          WHERE tier = ${tier} AND execution_state IN ('queued','retry_wait')
            AND phase_attempt < max_attempts
            AND (retry_not_before IS NULL OR retry_not_before <= now())
            AND (lease_expires_at IS NULL OR lease_expires_at <= now())
          ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        RETURNING id, checkpoint_revision, current_phase
      `;
      const job = claimed[0];
      if (!job) return null;
      await this.appendTransition(tx, { jobId: job.id, fromState: "queued", toState: "running", phase: job.current_phase,
        checkpointRevision: job.checkpoint_revision, reasonCode: "lease_claimed" });
      return job.id;
    });
  }

  static async appendTransition(tx: Transaction, input: TransitionInput): Promise<string> {
    const id = randomUUID();
    await tx`
      INSERT INTO scan_job_transition_events
        (id, job_id, from_execution_state, to_execution_state, phase, checkpoint_revision, reason_code, error_event_id)
      VALUES (${id}, ${input.jobId}, ${input.fromState}, ${input.toState}, ${input.phase},
        ${input.checkpointRevision}, ${input.reasonCode ?? null}, ${input.errorEventId ?? null})
    `;
    return id;
  }

  static async appendError(tx: Transaction, input: {
    jobId: string; phase: ScanJobPhase; checkpointRevision: number; jobAttempt: number; phaseAttempt: number;
    resumeGeneration: number; error: NormalizedJobError;
  }): Promise<string> {
    const id = randomUUID();
    await tx`
      INSERT INTO scan_job_error_events
        (id, job_id, phase, checkpoint_revision, job_attempt, phase_attempt, resume_generation,
         classification, code, error_type, message, stack, causes, fingerprint, retryable_at)
      VALUES (${id}, ${input.jobId}, ${input.phase}, ${input.checkpointRevision}, ${input.jobAttempt},
        ${input.phaseAttempt}, ${input.resumeGeneration}, ${input.error.classification}, ${input.error.code},
        ${input.error.type}, ${input.error.message}, ${input.error.stack}, ${JSON.stringify(input.error.causes)}::jsonb,
        ${input.error.fingerprint}, ${input.error.retryableAt?.toISOString() ?? null})
    `;
    return id;
  }
}

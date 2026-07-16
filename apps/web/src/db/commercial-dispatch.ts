import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { ensureDatabase, getDb, getSqlClient } from "./index";
import { jobDispatchOutbox, type JobDispatchOutboxRow, type ReportTier } from "./schema";

export type JobDispatchRecord = JobDispatchOutboxRow;

export async function createJobDispatch(input: {
  jobId: string;
  tier: ReportTier;
  schemaVersion?: number;
}): Promise<JobDispatchRecord> {
  const schemaVersion = input.schemaVersion ?? 1;
  if (!input.jobId || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error("A job ID and positive dispatch schema version are required.");
  }
  await ensureDatabase();
  const inserted = await getDb()
    .insert(jobDispatchOutbox)
    .values({ id: randomUUID(), jobId: input.jobId, tier: input.tier, schemaVersion })
    .onConflictDoNothing({ target: jobDispatchOutbox.jobId })
    .returning();
  const row = inserted[0] ?? await getJobDispatchByJobId(input.jobId);
  if (!row || row.tier !== input.tier || row.schemaVersion !== schemaVersion) {
    throw new Error("The job already has an incompatible dispatch record.");
  }
  return row;
}

export async function getJobDispatch(id: string): Promise<JobDispatchRecord | null> {
  await ensureDatabase();
  const [row] = await getDb().select().from(jobDispatchOutbox).where(eq(jobDispatchOutbox.id, id)).limit(1);
  return row ?? null;
}

export async function getJobDispatchByJobId(jobId: string): Promise<JobDispatchRecord | null> {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(jobDispatchOutbox)
    .where(eq(jobDispatchOutbox.jobId, jobId))
    .limit(1);
  return row ?? null;
}

export async function leaseJobDispatches(input: {
  owner: string;
  limit?: number;
  leaseSeconds?: number;
  includePublishedBefore?: Date;
}): Promise<JobDispatchRecord[]> {
  const limit = input.limit ?? 25;
  const leaseSeconds = input.leaseSeconds ?? 60;
  if (!input.owner || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("A dispatch owner and a limit between 1 and 100 are required.");
  }
  if (!Number.isSafeInteger(leaseSeconds) || leaseSeconds < 10) {
    throw new Error("Dispatch lease seconds must be an integer of at least 10.");
  }
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE job_dispatch_outbox
    SET lease_owner = ${input.owner},
        lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
        attempts = attempts + 1,
        updated_at = now()
    WHERE id IN (
      SELECT id FROM job_dispatch_outbox
      WHERE next_attempt_at <= now()
        AND (lease_expires_at IS NULL OR lease_expires_at <= now())
        AND (
          state = 'pending'
          OR (
            state = 'published'
            AND ${input.includePublishedBefore?.toISOString() ?? null}::timestamptz IS NOT NULL
            AND published_at <= ${input.includePublishedBefore?.toISOString() ?? null}
          )
        )
      ORDER BY next_attempt_at, created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id
  `;
  const claimed: JobDispatchRecord[] = [];
  for (const row of rows) {
    const dispatch = await getJobDispatch(row.id);
    if (dispatch) claimed.push(dispatch);
  }
  return claimed;
}

export async function markJobDispatchPublished(input: {
  id: string;
  owner: string;
  publishedAt?: Date;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE job_dispatch_outbox
    SET state = 'published', published_at = ${input.publishedAt?.toISOString() ?? new Date().toISOString()},
        lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state IN ('pending','published')
    RETURNING id
  `;
  return rows.length === 1;
}

export async function markJobDispatchRetry(input: {
  id: string;
  owner: string;
  errorCode: string;
  nextAttemptAt: Date;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE job_dispatch_outbox
    SET next_attempt_at = ${input.nextAttemptAt.toISOString()}, last_error_code = ${input.errorCode},
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state IN ('pending','published')
    RETURNING id
  `;
  return rows.length === 1;
}

export async function abandonJobDispatch(input: {
  id: string;
  owner: string;
  errorCode: string;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ id: string }[]>`
    UPDATE job_dispatch_outbox
    SET state = 'abandoned', last_error_code = ${input.errorCode},
        lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
    WHERE id = ${input.id}
      AND lease_owner = ${input.owner}
      AND lease_expires_at > now()
      AND state = 'pending'
    RETURNING id
  `;
  return rows.length === 1;
}

export async function ensureQueuedJobsHaveDispatches(tier?: ReportTier): Promise<number> {
  await ensureDatabase();
  if (tier) {
    const result = await reconcileQueuedJobDispatches(tier);
    return result.created;
  }
  const free = await reconcileQueuedJobDispatches("free");
  const deep = await reconcileQueuedJobDispatches("deep");
  return free.created + deep.created;
}

export async function reconcileQueuedJobDispatches(tier: ReportTier): Promise<{
  acquired: boolean;
  created: number;
}> {
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const locks = await tx<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext(${'open-geo-console:dispatch-reconcile:' + tier})) AS acquired
    `;
    if (!locks[0]?.acquired) return { acquired: false, created: 0 };
    const missing = await tx<Array<{ id: string; tier: ReportTier }>>`
      SELECT jobs.id, jobs.tier
      FROM scan_jobs jobs
      LEFT JOIN job_dispatch_outbox dispatch ON dispatch.job_id = jobs.id
      WHERE jobs.stage = 'queued'
        AND jobs.tier = ${tier}
        AND dispatch.id IS NULL
      ORDER BY jobs.created_at, jobs.id
      FOR UPDATE OF jobs SKIP LOCKED
    `;
    let created = 0;
    for (const job of missing) {
      const rows = await tx<{ id: string }[]>`
        INSERT INTO job_dispatch_outbox (id, job_id, tier, schema_version, state)
        VALUES (${randomUUID()}, ${job.id}, ${job.tier}, 1, 'pending')
        ON CONFLICT (job_id) DO NOTHING
        RETURNING id
      `;
      created += rows.length;
    }
    return { acquired: true, created };
  });
}

export async function findQueuedJobsMissingDispatch(tier?: ReportTier): Promise<Array<{
  jobId: string;
  tier: ReportTier;
}>> {
  await ensureDatabase();
  const missing = await getSqlClient()<Array<{ id: string; tier: ReportTier }>>`
    SELECT jobs.id, jobs.tier
    FROM scan_jobs jobs
    LEFT JOIN job_dispatch_outbox dispatch ON dispatch.job_id = jobs.id
    WHERE jobs.stage = 'queued'
      AND dispatch.id IS NULL
      AND (${tier ?? null}::text IS NULL OR jobs.tier = ${tier ?? null})
    ORDER BY jobs.created_at, jobs.id
  `;
  return missing.map((job) => ({ jobId: job.id, tier: job.tier }));
}

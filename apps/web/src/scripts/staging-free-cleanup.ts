import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus, getSqlClient } from "@/db";
import { assertStagingCommandEnvironment } from "@/security/deployment-policy";
import { pathToFileURL } from "node:url";

export interface StagingFreeCleanupResult {
  freeSiteTrials: number;
  anonymousRateBuckets: number;
  regenerationReservations: number;
}

export async function terminalizeStagingActiveFreeJobs(): Promise<number> {
  assertStagingCommandEnvironment();
  await ensureDatabase();
  const status = await getDatabaseEnvironmentStatus();
  if (status.profile !== "staging") {
    throw new Error("Staging job cleanup refuses a non-staging database.");
  }
  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('ogc:staging-free-cleanup', 0))`;
    const rows = await tx<{ id: string }[]>`
      UPDATE scan_jobs
      SET stage = 'failed',
          error_code = 'STAGING_EXTERNAL_CONFIG_MISSING',
          public_error = 'Staging worker credentials are not configured.',
          lease_owner = NULL,
          lease_expires_at = NULL,
          updated_at = now()
      WHERE tier = 'free'
        AND stage NOT IN ('completed', 'completed_limited', 'failed')
      RETURNING id
    `;
    await tx`
      DELETE FROM staging_free_regenerations regeneration
      USING scan_jobs job
      WHERE regeneration.job_id = job.id AND job.stage = 'failed'
    `;
    return rows.length;
  });
}

export async function clearStagingFreeState(): Promise<StagingFreeCleanupResult> {
  assertStagingCommandEnvironment();
  await ensureDatabase();
  const status = await getDatabaseEnvironmentStatus();
  if (status.profile !== "staging") {
    throw new Error("Staging free-state cleanup refuses a non-staging database.");
  }

  const sql = getSqlClient();
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('ogc:staging-free-cleanup', 0))`;
    const regenerations = await tx<{ count: number }[]>`
      WITH removed AS (DELETE FROM staging_free_regenerations RETURNING 1)
      SELECT count(*)::integer AS count FROM removed
    `;
    const trials = await tx<{ count: number }[]>`
      WITH removed AS (DELETE FROM free_site_trials RETURNING 1)
      SELECT count(*)::integer AS count FROM removed
    `;
    const buckets = await tx<{ count: number }[]>`
      WITH removed AS (DELETE FROM anonymous_rate_buckets RETURNING 1)
      SELECT count(*)::integer AS count FROM removed
    `;
    return {
      freeSiteTrials: trials[0]?.count ?? 0,
      anonymousRateBuckets: buckets[0]?.count ?? 0,
      regenerationReservations: regenerations[0]?.count ?? 0
    };
  });
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm")) {
    throw new Error("Pass --confirm to clear staging free-site reuse and rate-limit state.");
  }
  try {
    if (process.argv.includes("--active-jobs-only")) {
      const terminalizedFreeJobs = await terminalizeStagingActiveFreeJobs();
      console.log(JSON.stringify({ ok: true, terminalizedFreeJobs }));
      return;
    }
    const result = await clearStagingFreeState();
    console.log(JSON.stringify({ ok: true, ...result }));
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging cleanup failed.");
    process.exitCode = 1;
  });
}

import { randomUUID } from "node:crypto";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import { hmacSecret, requireSecret } from "./secrets";

export type FreeTrialClaimResult =
  | { outcome: "created"; reportId: string; jobId: string | null; expiresAt: Date }
  | { outcome: "reused"; reportId: string; jobId: string | null; expiresAt: Date }
  | { outcome: "rate_limited"; retryAfter: Date };

interface TrialRow {
  report_id: string;
  job_id: string | null;
  expires_at: string | Date;
}

interface RegenerationRow {
  reservation_id: string;
  report_id: string | null;
  job_id: string | null;
  updated_at: string | Date;
}

export function hashAnonymousIp(ip: string, secret = requireSecret("OGC_IP_HASH_SECRET")): string {
  return hmacSecret(ip.trim(), secret);
}

export async function getActiveFreeSiteTrial(siteKey: string, now = new Date()): Promise<{
  reportId: string;
  jobId: string | null;
  expiresAt: Date;
} | null> {
  if (isMemoryPersistence()) return null;
  await ensureDatabase();
  const rows = await getSqlClient()<TrialRow[]>`
    SELECT report_id, job_id, expires_at
    FROM free_site_trials
    WHERE site_key = ${siteKey} AND expires_at > ${now.toISOString()}
    LIMIT 1
  `;
  return rows[0] ? {
    reportId: rows[0].report_id,
    jobId: rows[0].job_id,
    expiresAt: new Date(rows[0].expires_at)
  } : null;
}

export async function claimFreeSiteTrial(input: {
  siteKey: string;
  reportId: string;
  jobId?: string;
  ipAddress: string;
  now?: Date;
  ttlDays?: number;
  dailyDistinctSiteLimit?: number;
  rollingWindowHours?: number;
}): Promise<FreeTrialClaimResult> {
  const now = input.now ?? new Date();
  const ttlDays = input.ttlDays ?? 30;
  const limit = input.dailyDistinctSiteLimit ?? 2;
  const rollingWindowHours = input.rollingWindowHours ?? 24;
  if (!input.siteKey || ttlDays < 1 || limit < 1 || rollingWindowHours < 1) {
    throw new Error("A site key, positive trial TTL, and positive daily limit are required.");
  }
  await ensureDatabase();
  const sql = getSqlClient();
  const ipHash = hashAnonymousIp(input.ipAddress);
  const bucketDate = now.toISOString().slice(0, 10);
  const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
  const nowIso = now.toISOString();
  const expiresAtIso = expiresAt.toISOString();

  return sql.begin(async (tx) => {
    // Transaction-scoped locks make the count-and-insert decisions atomic even
    // when the same site/IP arrives through multiple web instances.
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`trial:${input.siteKey}`}, 0))`;
    const existing = await tx<TrialRow[]>`
      SELECT report_id, job_id, expires_at
      FROM free_site_trials
      WHERE site_key = ${input.siteKey} AND expires_at > ${nowIso}
      LIMIT 1
    `;
    if (existing[0]) {
      return {
        outcome: "reused" as const,
        reportId: existing[0].report_id,
        jobId: existing[0].job_id,
        expiresAt: new Date(existing[0].expires_at)
      };
    }

    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`rate:${ipHash}`}, 0))`;
    const sameSite = await tx<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM anonymous_rate_buckets
        WHERE ip_hash = ${ipHash}
          AND created_at >= ${nowIso}::timestamptz - (${rollingWindowHours} * interval '1 hour')
          AND site_key = ${input.siteKey}
      ) AS exists
    `;
    if (!sameSite[0]?.exists) {
      const countRows = await tx<{ count: number }[]>`
        SELECT count(*)::integer AS count
        FROM (
          SELECT DISTINCT site_key
          FROM anonymous_rate_buckets
          WHERE ip_hash = ${ipHash}
            AND created_at >= ${nowIso}::timestamptz - (${rollingWindowHours} * interval '1 hour')
        ) recent_sites
      `;
      if ((countRows[0]?.count ?? 0) >= limit) {
        const oldestRows = await tx<{ created_at: string | Date }[]>`
          SELECT created_at
          FROM anonymous_rate_buckets
          WHERE ip_hash = ${ipHash}
            AND created_at >= ${nowIso}::timestamptz - (${rollingWindowHours} * interval '1 hour')
          ORDER BY created_at ASC
          LIMIT 1
        `;
        const oldest = oldestRows[0] ? new Date(oldestRows[0].created_at) : now;
        return { outcome: "rate_limited" as const, retryAfter: new Date(oldest.getTime() + rollingWindowHours * 3_600_000) };
      }
      await tx`
        INSERT INTO anonymous_rate_buckets (ip_hash, bucket_date, site_key, created_at)
        VALUES (${ipHash}, ${bucketDate}, ${input.siteKey}, ${nowIso})
        ON CONFLICT (ip_hash, bucket_date, site_key) DO NOTHING
      `;
    }

    await tx`
      INSERT INTO free_site_trials (site_key, report_id, job_id, claimed_at, expires_at)
      VALUES (${input.siteKey}, ${input.reportId}, ${input.jobId ?? null}, ${nowIso}, ${expiresAtIso})
      ON CONFLICT (site_key) DO UPDATE SET
        report_id = EXCLUDED.report_id,
        job_id = EXCLUDED.job_id,
        claimed_at = EXCLUDED.claimed_at,
        expires_at = EXCLUDED.expires_at
      WHERE free_site_trials.expires_at <= ${nowIso}
    `;
    return { outcome: "created" as const, reportId: input.reportId, jobId: input.jobId ?? null, expiresAt };
  });
}

export async function releaseFreeSiteTrial(siteKey: string, reportId: string): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ site_key: string }[]>`
    DELETE FROM free_site_trials WHERE site_key = ${siteKey} AND report_id = ${reportId} RETURNING site_key
  `;
  return rows.length === 1;
}

export async function attachFreeTrialJob(siteKey: string, reportId: string, jobId: string): Promise<boolean> {
  if (!siteKey || !reportId || !jobId) throw new Error("A site, report, and job are required.");
  await ensureDatabase();
  const rows = await getSqlClient()<{ site_key: string }[]>`
    UPDATE free_site_trials
    SET job_id = COALESCE(job_id, ${jobId})
    WHERE site_key = ${siteKey} AND report_id = ${reportId}
      AND (job_id IS NULL OR job_id = ${jobId})
    RETURNING site_key
  `;
  return rows.length === 1;
}

export type StagingRegenerationReservation =
  | { outcome: "created"; reservationId: string; reportId: null; jobId: null }
  | { outcome: "active"; reservationId: string; reportId: string | null; jobId: string | null };

export async function beginStagingFreeRegeneration(input: {
  siteKey: string;
  now?: Date;
  preparingTimeoutMinutes?: number;
}): Promise<StagingRegenerationReservation> {
  if (!input.siteKey) throw new Error("A site key is required for staging regeneration.");
  const now = input.now ?? new Date();
  const timeoutMinutes = input.preparingTimeoutMinutes ?? 15;
  if (!Number.isSafeInteger(timeoutMinutes) || timeoutMinutes < 1) {
    throw new Error("The staging regeneration preparation timeout must be a positive integer.");
  }
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`staging-regeneration:${input.siteKey}`}, 0))`;
    await tx`
      DELETE FROM staging_free_regenerations
      WHERE site_key = ${input.siteKey}
        AND job_id IS NULL
        AND updated_at <= ${new Date(now.getTime() - timeoutMinutes * 60_000).toISOString()}
    `;
    const existing = await tx<RegenerationRow[]>`
      SELECT reservation_id, report_id, job_id, updated_at
      FROM staging_free_regenerations
      WHERE site_key = ${input.siteKey}
      LIMIT 1
    `;
    if (existing[0]) {
      return {
        outcome: "active" as const,
        reservationId: existing[0].reservation_id,
        reportId: existing[0].report_id,
        jobId: existing[0].job_id
      };
    }
    const reservationId = randomUUID();
    await tx`
      INSERT INTO staging_free_regenerations (site_key, reservation_id, created_at, updated_at)
      VALUES (${input.siteKey}, ${reservationId}, ${now.toISOString()}, ${now.toISOString()})
    `;
    return { outcome: "created" as const, reservationId, reportId: null, jobId: null };
  });
}

export async function attachStagingFreeRegeneration(input: {
  siteKey: string;
  reservationId: string;
  reportId: string;
  jobId: string;
}): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ site_key: string }[]>`
    UPDATE staging_free_regenerations
    SET report_id = ${input.reportId}, job_id = ${input.jobId}, updated_at = now()
    WHERE site_key = ${input.siteKey}
      AND reservation_id = ${input.reservationId}
      AND report_id IS NULL
      AND job_id IS NULL
    RETURNING site_key
  `;
  return rows.length === 1;
}

export async function completeStagingFreeRegenerationWithoutJob(input: {
  siteKey: string;
  reservationId: string;
  reportId: string;
  now?: Date;
  ttlDays?: number;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const ttlDays = input.ttlDays ?? 30;
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    const rows = await tx<{ site_key: string }[]>`
      SELECT site_key FROM staging_free_regenerations
      WHERE site_key = ${input.siteKey}
        AND reservation_id = ${input.reservationId}
        AND job_id IS NULL
      FOR UPDATE
    `;
    if (!rows[0]) return false;
    await tx`
      INSERT INTO free_site_trials (site_key, report_id, job_id, claimed_at, expires_at)
      VALUES (${input.siteKey}, ${input.reportId}, NULL, ${now.toISOString()}, ${new Date(now.getTime() + ttlDays * 86_400_000).toISOString()})
      ON CONFLICT (site_key) DO UPDATE SET
        report_id = EXCLUDED.report_id,
        job_id = NULL,
        claimed_at = EXCLUDED.claimed_at,
        expires_at = EXCLUDED.expires_at
    `;
    await tx`
      DELETE FROM staging_free_regenerations
      WHERE site_key = ${input.siteKey} AND reservation_id = ${input.reservationId}
    `;
    return true;
  });
}

export async function cancelStagingFreeRegeneration(siteKey: string, reservationId: string): Promise<boolean> {
  await ensureDatabase();
  const rows = await getSqlClient()<{ site_key: string }[]>`
    DELETE FROM staging_free_regenerations
    WHERE site_key = ${siteKey} AND reservation_id = ${reservationId}
    RETURNING site_key
  `;
  return rows.length === 1;
}

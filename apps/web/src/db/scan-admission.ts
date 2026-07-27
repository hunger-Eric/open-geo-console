import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { ScanJobCapacityError } from "./jobs";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import { hmacSecret, requireSecret } from "./secrets";
import { hashAnonymousIp } from "./trials";
import type { ReportLocale } from "./schema";

export type ScanAdmissionResult =
  | { outcome: "created"; reportId: string; jobId: string; aiEnabled: boolean }
  | { outcome: "reused"; reportId: string; jobId: string | null }
  | { outcome: "active_regeneration"; reportId: string; activeReportId: string; jobId: string | null }
  | { outcome: "rate_limited"; retryAfter: Date };

export interface AdmitFreeScanInput {
  url: string;
  siteKey: string;
  locale: ReportLocale;
  idempotencyKey: string;
  ipAddress: string;
  forceFresh: boolean;
  stagingPreview: boolean;
  dailyDistinctSiteLimit: number;
  aiDailyLimit: number;
  now?: Date;
  rollingWindowHours?: number;
  trialTtlDays?: number;
  maxActiveStagingJobs?: number;
}

interface ExistingAdmissionRow {
  report_id: string;
  job_id: string | null;
  checkpoint: Record<string, unknown> | null;
}

interface TrialRow {
  report_id: string;
  job_id: string | null;
  expires_at: string | Date;
}

export async function admitFreeScan(input: AdmitFreeScanInput): Promise<ScanAdmissionResult> {
  validateAdmissionInput(input);
  if (isMemoryPersistence()) throw new Error("Durable scan admission requires PostgreSQL persistence.");
  await ensureDatabase();

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const rollingWindowHours = input.rollingWindowHours ?? 24;
  const trialTtlDays = input.trialTtlDays ?? 30;
  const maxActiveStagingJobs = input.maxActiveStagingJobs ?? 2;
  const secret = requireSecret("OGC_IP_HASH_SECRET");
  const admissionHmac = hmacSecret(`scan-admission:${input.idempotencyKey.trim()}`, secret);
  const ipHash = hashAnonymousIp(input.ipAddress, secret);

  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`scan-admission:${admissionHmac}`}, 0))`;
    const recovered = await tx<ExistingAdmissionRow[]>`
      SELECT report.id AS report_id, job.id AS job_id, job.checkpoint
      FROM scan_reports report
      LEFT JOIN LATERAL (
        SELECT id, checkpoint FROM scan_jobs
        WHERE report_id = report.id AND tier = 'free'
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) job ON true
      WHERE report.admission_idempotency_hmac = ${admissionHmac}
      LIMIT 1
    `;
    if (recovered[0]) {
      return {
        outcome: "created" as const,
        reportId: recovered[0].report_id,
        jobId: recovered[0].job_id!,
        aiEnabled: recovered[0].checkpoint?.aiEnabled === true
      };
    }

    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`trial:${input.siteKey}`}, 0))`;
    const activeTrials = await tx<TrialRow[]>`
      SELECT report_id, job_id, expires_at
      FROM free_site_trials
      WHERE site_key = ${input.siteKey} AND expires_at > ${nowIso}
      LIMIT 1
    `;
    const activeTrial = activeTrials[0];
    if (activeTrial && !input.forceFresh) {
      return {
        outcome: "reused" as const,
        reportId: activeTrial.report_id,
        jobId: activeTrial.job_id
      };
    }

    const stagingRegeneration = Boolean(activeTrial && input.forceFresh && input.stagingPreview);
    if (stagingRegeneration) {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`staging-regeneration:${input.siteKey}`}, 0))`;
      await tx`
        DELETE FROM staging_free_regenerations
        WHERE site_key = ${input.siteKey}
          AND job_id IS NULL
          AND updated_at <= ${new Date(now.getTime() - 15 * 60_000).toISOString()}
      `;
      const activeRegenerations = await tx<Array<{ report_id: string | null; job_id: string | null }>>`
        SELECT report_id, job_id FROM staging_free_regenerations
        WHERE site_key = ${input.siteKey}
        LIMIT 1
      `;
      if (activeRegenerations[0]) {
        return {
          outcome: "active_regeneration" as const,
          reportId: activeRegenerations[0].report_id ?? activeTrial!.report_id,
          activeReportId: activeTrial!.report_id,
          jobId: activeRegenerations[0].job_id
        };
      }
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('enqueue-tier:free', 0))`;
      const activeCounts = await tx<{ count: number }[]>`
        SELECT count(*)::integer AS count FROM scan_jobs
        WHERE tier = 'free' AND stage NOT IN ('completed', 'completed_limited', 'failed')
      `;
      if ((activeCounts[0]?.count ?? 0) >= maxActiveStagingJobs) throw new ScanJobCapacityError();
    } else {
      const rateLimited = await enforceRateLimit(tx, {
        ipHash,
        siteKey: input.siteKey,
        now,
        nowIso,
        rollingWindowHours,
        limit: input.dailyDistinctSiteLimit
      });
      if (rateLimited) return rateLimited;
    }

    const reportId = randomUUID();
    const jobId = randomUUID();
    const budgetHmac = hmacSecret(`free-ai:${reportId}`, secret);
    const budget = await reserveFreeAiBudget(tx, budgetHmac, input.aiDailyLimit, nowIso.slice(0, 10));
    const checkpoint = {
      aiEnabled: budget.granted,
      ...(budget.granted ? {} : { aiSkipReason: "daily_budget_exhausted" })
    };

    await tx`
      INSERT INTO scan_reports (
        id, url, site_key, kind, score, payload, technical_status,
        admission_idempotency_hmac, report_locale, created_at
      ) VALUES (
        ${reportId}, ${input.url}, ${input.siteKey}, 'geo', NULL, NULL, 'pending',
        ${admissionHmac}, ${input.locale}, ${nowIso}
      )
    `;
    await tx`
      INSERT INTO scan_jobs (id, report_id, tier, locale, reason, checkpoint)
      VALUES (
        ${jobId}, ${reportId}, 'free', ${input.locale},
        ${stagingRegeneration ? "staging_regeneration" : "standard"},
        ${JSON.stringify(checkpoint)}::jsonb
      )
    `;
    await tx`
      INSERT INTO job_dispatch_outbox (id, job_id, tier, schema_version, state)
      VALUES (${randomUUID()}, ${jobId}, 'free', 1, 'pending')
    `;

    if (stagingRegeneration) {
      await tx`
        INSERT INTO staging_free_regenerations (
          site_key, reservation_id, report_id, job_id, created_at, updated_at
        ) VALUES (
          ${input.siteKey}, ${randomUUID()}, ${reportId}, ${jobId}, ${nowIso}, ${nowIso}
        )
      `;
    } else {
      await tx`
        INSERT INTO free_site_trials (site_key, report_id, job_id, claimed_at, expires_at)
        VALUES (
          ${input.siteKey}, ${reportId}, ${jobId}, ${nowIso},
          ${new Date(now.getTime() + trialTtlDays * 86_400_000).toISOString()}
        )
        ON CONFLICT (site_key) DO UPDATE SET
          report_id = EXCLUDED.report_id,
          job_id = EXCLUDED.job_id,
          claimed_at = EXCLUDED.claimed_at,
          expires_at = EXCLUDED.expires_at
        WHERE free_site_trials.expires_at <= ${nowIso}
      `;
    }

    return { outcome: "created" as const, reportId, jobId, aiEnabled: budget.granted };
  });
}

function validateAdmissionInput(input: AdmitFreeScanInput): void {
  if (!input.url || !input.siteKey || !input.ipAddress || !/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey.trim())) {
    throw new Error("A URL, site identity, client identity, and valid idempotency key are required.");
  }
  if (input.forceFresh && !input.stagingPreview) {
    throw new Error("Forced regeneration is available only on protected staging.");
  }
  if (!Number.isSafeInteger(input.dailyDistinctSiteLimit) || input.dailyDistinctSiteLimit < 1) {
    throw new Error("The distinct-site limit must be a positive integer.");
  }
  if (!Number.isSafeInteger(input.aiDailyLimit) || input.aiDailyLimit < 0) {
    throw new Error("The free AI daily limit must be a non-negative integer.");
  }
}

async function enforceRateLimit(
  tx: postgres.TransactionSql,
  input: {
    ipHash: string;
    siteKey: string;
    now: Date;
    nowIso: string;
    rollingWindowHours: number;
    limit: number;
  }
): Promise<Extract<ScanAdmissionResult, { outcome: "rate_limited" }> | null> {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`rate:${input.ipHash}`}, 0))`;
  const sameSite = await tx<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM anonymous_rate_buckets
      WHERE ip_hash = ${input.ipHash}
        AND created_at >= ${input.nowIso}::timestamptz - (${input.rollingWindowHours} * interval '1 hour')
        AND site_key = ${input.siteKey}
    ) AS exists
  `;
  if (sameSite[0]?.exists) return null;
  const counts = await tx<{ count: number }[]>`
    SELECT count(*)::integer AS count FROM (
      SELECT DISTINCT site_key FROM anonymous_rate_buckets
      WHERE ip_hash = ${input.ipHash}
        AND created_at >= ${input.nowIso}::timestamptz - (${input.rollingWindowHours} * interval '1 hour')
    ) recent_sites
  `;
  if ((counts[0]?.count ?? 0) >= input.limit) {
    const oldest = await tx<{ created_at: string | Date }[]>`
      SELECT created_at FROM anonymous_rate_buckets
      WHERE ip_hash = ${input.ipHash}
        AND created_at >= ${input.nowIso}::timestamptz - (${input.rollingWindowHours} * interval '1 hour')
      ORDER BY created_at ASC LIMIT 1
    `;
    const oldestAt = oldest[0] ? new Date(oldest[0].created_at) : input.now;
    return { outcome: "rate_limited", retryAfter: new Date(oldestAt.getTime() + input.rollingWindowHours * 3_600_000) };
  }
  await tx`
    INSERT INTO anonymous_rate_buckets (ip_hash, bucket_date, site_key, created_at)
    VALUES (${input.ipHash}, ${input.nowIso.slice(0, 10)}, ${input.siteKey}, ${input.nowIso})
    ON CONFLICT (ip_hash, bucket_date, site_key) DO NOTHING
  `;
  return null;
}

async function reserveFreeAiBudget(
  tx: postgres.TransactionSql,
  idempotencyHmac: string,
  limit: number,
  bucketDate: string
): Promise<{ granted: boolean }> {
  await tx`
    INSERT INTO free_ai_daily_budgets (bucket_date, used_count, limit_snapshot)
    VALUES (${bucketDate}, 0, ${limit})
    ON CONFLICT (bucket_date) DO UPDATE
    SET limit_snapshot = EXCLUDED.limit_snapshot, updated_at = now()
  `;
  const budgets = await tx<{ used_count: number; limit_snapshot: number }[]>`
    SELECT used_count, limit_snapshot FROM free_ai_daily_budgets
    WHERE bucket_date = ${bucketDate} FOR UPDATE
  `;
  const existing = await tx<{ granted: boolean }[]>`
    SELECT granted FROM free_ai_budget_reservations
    WHERE idempotency_hmac = ${idempotencyHmac}
  `;
  if (existing[0]) return { granted: existing[0].granted };
  const granted = (budgets[0]?.used_count ?? 0) < (budgets[0]?.limit_snapshot ?? limit);
  if (granted) {
    await tx`
      UPDATE free_ai_daily_budgets SET used_count = used_count + 1, updated_at = now()
      WHERE bucket_date = ${bucketDate} AND used_count < limit_snapshot
    `;
  }
  await tx`
    INSERT INTO free_ai_budget_reservations (idempotency_hmac, bucket_date, granted)
    VALUES (${idempotencyHmac}, ${bucketDate}, ${granted})
  `;
  return { granted };
}

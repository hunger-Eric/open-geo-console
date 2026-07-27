import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertDatabaseProfileMatches,
  closeDatabase,
  DATABASE_SCHEMA_VERSION,
  ensureDatabase,
  getDatabaseEnvironmentStatus,
  getSqlClient
} from "./index";
import { terminalizeScanJob } from "./jobs";
import { getReportV4PreAdmissionJob } from "./report-v4-admission-jobs";
import { admitFreeScan } from "./scan-admission";
import {
  attachStagingFreeRegeneration,
  beginStagingFreeRegeneration,
  claimFreeSiteTrial,
  getActiveFreeSiteTrial
} from "./trials";

const enabled = Boolean(process.env.DATABASE_URL && process.env.OGC_DEPLOYMENT_PROFILE === "staging");
const describePostgres = enabled ? describe : describe.skip;

describePostgres("protected staging PostgreSQL integration", () => {
  const runId = randomUUID().replaceAll("-", "");
  const sitePrefix = `staging-it-${runId}`;
  const ipPrefix = `2001:db8:${runId.slice(0, 4)}:${runId.slice(4, 8)}`;
  const original = {
    profile: process.env.OGC_DEPLOYMENT_PROFILE,
    vercelEnvironment: process.env.VERCEL_ENV,
    commerceMode: process.env.COMMERCE_MODE,
    ipSecret: process.env.OGC_IP_HASH_SECRET
  };

  beforeAll(async () => {
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.VERCEL_ENV = "preview";
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_IP_HASH_SECRET = "postgres-integration-ip-secret-at-least-32-chars";
    await ensureDatabase();
    expect((await getDatabaseEnvironmentStatus()).profile).toBe("staging");
  }, 60_000);

  afterAll(async () => {
    const sql = getSqlClient();
    await sql`DELETE FROM staging_free_regenerations WHERE site_key LIKE 'staging-it-%'`;
    await sql`DELETE FROM anonymous_rate_buckets WHERE site_key LIKE 'staging-it-%'`;
    await sql`DELETE FROM scan_reports WHERE site_key LIKE 'staging-it-%'`;
    await sql`DELETE FROM free_ai_budget_reservations WHERE bucket_date = '2031-01-01'`;
    await sql`DELETE FROM free_ai_daily_budgets WHERE bucket_date = '2031-01-01'`;
    await closeDatabase();
    restore("OGC_DEPLOYMENT_PROFILE", original.profile);
    restore("VERCEL_ENV", original.vercelEnvironment);
    restore("COMMERCE_MODE", original.commerceMode);
    restore("OGC_IP_HASH_SECRET", original.ipSecret);
  }, 60_000);

  it("keeps the old reuse mapping until success and preserves it on failure", async () => {
    const sql = getSqlClient();
    const successSite = `${sitePrefix}-success.test`;
    const failureSite = `${sitePrefix}-failure.test`;
    const oldSuccess = await insertReport(successSite, "old-success");
    const newSuccess = await insertReport(successSite, "new-success");
    const oldFailure = await insertReport(failureSite, "old-failure");
    const newFailure = await insertReport(failureSite, "new-failure");
    await sql`
      INSERT INTO free_site_trials (site_key, report_id, claimed_at, expires_at)
      VALUES
        (${successSite}, ${oldSuccess}, now(), now() + interval '30 days'),
        (${failureSite}, ${oldFailure}, now(), now() + interval '30 days')
    `;

    const successReservation = await beginStagingFreeRegeneration({ siteKey: successSite });
    const failureReservation = await beginStagingFreeRegeneration({ siteKey: failureSite });
    expect(successReservation.outcome).toBe("created");
    expect(failureReservation.outcome).toBe("created");
    const successJob = await insertLeasedJob(newSuccess, "worker-success");
    const failureJob = await insertLeasedJob(newFailure, "worker-failure");
    expect(await attachStagingFreeRegeneration({
      siteKey: successSite,
      reservationId: successReservation.reservationId,
      reportId: newSuccess,
      jobId: successJob
    })).toBe(true);
    expect(await attachStagingFreeRegeneration({
      siteKey: failureSite,
      reservationId: failureReservation.reservationId,
      reportId: newFailure,
      jobId: failureJob
    })).toBe(true);
    expect((await getActiveFreeSiteTrial(successSite))?.reportId).toBe(oldSuccess);
    expect((await getActiveFreeSiteTrial(failureSite))?.reportId).toBe(oldFailure);

    await terminalizeScanJob(successJob, "worker-success", {
      stage: "completed",
      coverage: { plannedPages: 1, successfulPages: 1, failedPages: 0 }
    });
    await terminalizeScanJob(failureJob, "worker-failure", {
      stage: "failed",
      coverage: { plannedPages: 1, successfulPages: 0, failedPages: 1 },
      error: { code: "integration_failure", publicMessage: "Integration failure." }
    });
    expect((await getActiveFreeSiteTrial(successSite))?.reportId).toBe(newSuccess);
    expect((await getActiveFreeSiteTrial(failureSite))?.reportId).toBe(oldFailure);
  }, 60_000);

  it("serializes duplicate regeneration and rolling quota decisions", async () => {
    const duplicateSite = `${sitePrefix}-duplicate.test`;
    const [first, second] = await Promise.all([
      beginStagingFreeRegeneration({ siteKey: duplicateSite }),
      beginStagingFreeRegeneration({ siteKey: duplicateSite })
    ]);
    expect([first.outcome, second.outcome].sort()).toEqual(["active", "created"]);

    const now = new Date("2030-01-01T12:00:00.000Z");
    const reportA = await insertReport(`${sitePrefix}-quota-a.test`, "quota-a");
    const reportB = await insertReport(`${sitePrefix}-quota-b.test`, "quota-b");
    const reportC = await insertReport(`${sitePrefix}-quota-c.test`, "quota-c");
    const [claimA, claimB] = await Promise.all([
      claimFreeSiteTrial({ siteKey: `${sitePrefix}-quota-a.test`, reportId: reportA, ipAddress: `${ipPrefix}::10`, now, dailyDistinctSiteLimit: 1 }),
      claimFreeSiteTrial({ siteKey: `${sitePrefix}-quota-b.test`, reportId: reportB, ipAddress: `${ipPrefix}::10`, now, dailyDistinctSiteLimit: 1 })
    ]);
    expect([claimA.outcome, claimB.outcome].sort()).toEqual(["created", "rate_limited"]);
    const otherIp = await claimFreeSiteTrial({
      siteKey: `${sitePrefix}-quota-c.test`, reportId: reportC, ipAddress: `${ipPrefix}::11`, now, dailyDistinctSiteLimit: 1
    });
    expect(otherIp.outcome).toBe("created");
  }, 60_000);

  it("atomically creates exactly one dispatched V4 pre-admission job only after standard preview success", async () => {
    const successReport = await insertReport(`${sitePrefix}-admission-success.test`, "admission-success");
    const failedReport = await insertReport(`${sitePrefix}-admission-failed.test`, "admission-failed");
    const successJob = await insertLeasedJob(successReport, "worker-admission-success", "standard");
    const failedJob = await insertLeasedJob(failedReport, "worker-admission-failed", "standard");

    await terminalizeScanJob(successJob, "worker-admission-success", {
      stage: "completed",
      coverage: { plannedPages: 1, successfulPages: 1, failedPages: 0 }
    });
    await terminalizeScanJob(failedJob, "worker-admission-failed", {
      stage: "failed",
      coverage: { plannedPages: 1, successfulPages: 0, failedPages: 1 },
      error: { code: "preview_failed", publicMessage: "Preview failed." }
    });

    const admission = await getReportV4PreAdmissionJob(successReport);
    expect(admission).toMatchObject({
      reportId: successReport,
      tier: "deep",
      productContract: "recommendation_forensics_v1",
      fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4,
      artifactContract: "combined_geo_report_v4",
      reason: "v4_pre_admission",
      siteSnapshotId: null,
      businessQuestionSetId: null,
      creditReservationId: null
    });
    expect(await getReportV4PreAdmissionJob(failedReport)).toBeNull();

    const [counts] = await getSqlClient()<Array<Record<string, number>>>`
      SELECT
        count(DISTINCT dispatch.id)::integer AS dispatches,
        count(DISTINCT artifact.id)::integer AS artifacts,
        count(DISTINCT credit.id)::integer AS credits,
        count(DISTINCT payment.id)::integer AS payments
      FROM scan_jobs admission
      LEFT JOIN job_dispatch_outbox dispatch ON dispatch.job_id=admission.id
      LEFT JOIN report_artifact_revisions artifact ON artifact.job_id=admission.id
      LEFT JOIN credit_ledger credit ON credit.job_id=admission.id
      LEFT JOIN payment_orders payment ON payment.fulfillment_job_id=admission.id
      WHERE admission.report_id=${successReport} AND admission.reason='v4_pre_admission'
    `;
    expect(counts).toMatchObject({ dispatches: 1, artifacts: 0, credits: 0, payments: 0 });
  }, 60_000);

  it("rejects a runtime profile that disagrees with the database marker", async () => {
    const database = await getDatabaseEnvironmentStatus();
    expect(database.profile).toBe("staging");
    expect(() => assertDatabaseProfileMatches(database.profile, "production")).toThrow("database environment marker");
  }, 60_000);

  it("requires the current fail-closed database schema marker", async () => {
    const rows = await getSqlClient()<Array<{ version: number }>>`
      SELECT version FROM ogc_schema_state WHERE singleton = true
    `;
    expect(rows[0]?.version).toBe(DATABASE_SCHEMA_VERSION);
  });

  it("atomically admits and recovers one pending report job", async () => {
    const siteKey = `${sitePrefix}-admission.test`;
    const now = new Date("2031-01-01T12:00:00.000Z");
    const input = {
      url: `https://${siteKey}/`,
      siteKey,
      locale: "en" as const,
      idempotencyKey: `admission-${runId}`,
      ipAddress: `${ipPrefix}::42`,
      forceFresh: false,
      stagingPreview: true,
      dailyDistinctSiteLimit: 2,
      aiDailyLimit: 10,
      now
    };

    const [first, duplicate] = await Promise.all([admitFreeScan(input), admitFreeScan(input)]);
    expect(first.outcome).toBe("created");
    expect(duplicate).toEqual(first);
    if (first.outcome !== "created") throw new Error("Expected a created admission.");

    const rows = await getSqlClient()<Array<{
      technical_status: string;
      payload: unknown;
      jobs: number;
      dispatches: number;
    }>>`
      SELECT report.technical_status, report.payload,
             count(DISTINCT job.id)::integer AS jobs,
             count(DISTINCT dispatch.id)::integer AS dispatches
      FROM scan_reports report
      LEFT JOIN scan_jobs job ON job.report_id = report.id
      LEFT JOIN job_dispatch_outbox dispatch ON dispatch.job_id = job.id
      WHERE report.id = ${first.reportId}
      GROUP BY report.id
    `;
    expect(rows[0]).toMatchObject({ technical_status: "pending", payload: null, jobs: 1, dispatches: 1 });

    const reused = await admitFreeScan({ ...input, idempotencyKey: `reuse-${runId}-123456` });
    expect(reused).toMatchObject({ outcome: "reused", reportId: first.reportId, jobId: first.jobId });
  }, 60_000);

  async function insertReport(siteKey: string, suffix: string): Promise<string> {
    const id = `${runId}-${suffix}`;
    await getSqlClient()`
      INSERT INTO scan_reports (id, url, site_key, payload, report_locale)
      VALUES (${id}, ${`https://${siteKey}/`}, ${siteKey}, ${JSON.stringify({ score: 80 })}::jsonb, 'en')
    `;
    return id;
  }

  async function insertLeasedJob(
    reportId: string,
    owner: string,
    reason: "standard" | "staging_regeneration" = "staging_regeneration"
  ): Promise<string> {
    const id = randomUUID();
    await getSqlClient()`
      INSERT INTO scan_jobs
        (id, report_id, tier, locale, reason, stage, progress, attempts, max_attempts, lease_owner, lease_expires_at)
      VALUES
        (${id}, ${reportId}, 'free', 'en', ${reason}, 'analyzing', 80, 1, 3, ${owner}, now() + interval '5 minutes')
    `;
    return id;
  }
});

function restore(name: keyof NodeJS.ProcessEnv, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

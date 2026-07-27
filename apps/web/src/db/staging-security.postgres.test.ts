import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REPORT_SEMANTIC_REVIEW_CONTRACT } from "@open-geo-console/ai-report-engine";
import {
  assertDatabaseProfileMatches,
  closeDatabase,
  DATABASE_SCHEMA_VERSION,
  ensureDatabase,
  getDatabaseEnvironmentStatus,
  getSqlClient
} from "./index";
import { resumeScanJobAfterRepair, ScanJobCapacityError, terminalizeScanJob } from "./jobs";
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
  const ownedReportIds = new Set<string>();
  const ownedBindingJobIds = new Set<string>();
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
    await sql`DELETE FROM staging_free_regenerations WHERE site_key LIKE ${`${sitePrefix}-%`}`;
    await sql`DELETE FROM anonymous_rate_buckets WHERE site_key LIKE ${`${sitePrefix}-%`}`;
    for (const jobId of ownedBindingJobIds) await sql`DELETE FROM scan_jobs WHERE id=${jobId}`;
    for (const reportId of ownedReportIds) {
      await sql`DELETE FROM report_replacement_fulfillments WHERE report_id=${reportId}`;
      await sql`DELETE FROM report_artifact_revisions WHERE report_id=${reportId}`;
      await sql`DELETE FROM report_corrections WHERE report_id=${reportId}`;
      await sql`DELETE FROM report_business_question_sets WHERE report_id=${reportId}`;
      await sql`DELETE FROM payment_orders WHERE report_id=${reportId}`;
      await sql`DELETE FROM scan_jobs WHERE report_id=${reportId}`;
      await sql`DELETE FROM scan_reports WHERE id=${reportId}`;
    }
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
      creditReservationId: null,
      checkpoint: {
        semanticReviewContractVersion: REPORT_SEMANTIC_REVIEW_CONTRACT
      }
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

  it("excludes only unrecoverable repair waits from protected-staging regeneration capacity", async () => {
    const sql = getSqlClient();
    const leaseConstraints = await sql<Array<{ convalidated: boolean; definition: string }>>`
      SELECT convalidated, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'scan_jobs'::regclass
        AND conname = 'scan_jobs_repair_wait_lease_check'`;
    expect(leaseConstraints).toHaveLength(1);
    expect(leaseConstraints[0]).toMatchObject({ convalidated: true });
    expect(leaseConstraints[0]?.definition).toContain("execution_state");
    expect(leaseConstraints[0]?.definition).toContain("repair_wait");
    expect(leaseConstraints[0]?.definition).toContain("lease_owner IS NULL");
    expect(leaseConstraints[0]?.definition).toContain("lease_expires_at IS NULL");
    const now = new Date("2031-01-01T12:00:00.000Z");
    const allowedSite = `${sitePrefix}-repair-capacity-allowed.test`;
    const blockedSite = `${sitePrefix}-repair-capacity-blocked.test`;
    const [allowedTrial, blockedTrial, repairA, repairB] = await Promise.all([
      insertReport(allowedSite, "repair-capacity-allowed"),
      insertReport(blockedSite, "repair-capacity-blocked"),
      insertReport(`${sitePrefix}-repair-capacity-a.test`, "repair-capacity-a"),
      insertReport(`${sitePrefix}-repair-capacity-b.test`, "repair-capacity-b")
    ]);
    await sql`INSERT INTO free_site_trials (site_key, report_id, claimed_at, expires_at) VALUES
      (${allowedSite},${allowedTrial},${now.toISOString()},${new Date("2031-02-01T12:00:00.000Z").toISOString()}),
      (${blockedSite},${blockedTrial},${now.toISOString()},${new Date("2031-02-01T12:00:00.000Z").toISOString()})`;
    const [baseline] = await sql<Array<{ count: number }>>`SELECT count(*)::integer AS count FROM scan_jobs
      WHERE tier='free' AND stage NOT IN ('completed','completed_limited','failed') AND NOT (
        execution_state='repair_wait' AND lease_owner IS NULL AND lease_expires_at IS NULL
        AND retry_not_before IS NULL AND repair_deadline_at IS NULL)`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,locale,stage,execution_state) VALUES
      (${randomUUID()},${repairA},'free','en','analyzing','repair_wait'),
      (${randomUUID()},${repairB},'free','en','analyzing','repair_wait')`;
    const inputFor = (siteKey: string, suffix: string, maxActiveStagingJobs: number) => ({
      url: `https://${siteKey}/`, siteKey, locale: "en" as const,
      idempotencyKey: `capacity-${runId}-${suffix}`, ipAddress: `${ipPrefix}::50`,
      forceFresh: true, stagingPreview: true, dailyDistinctSiteLimit: 2, aiDailyLimit: 10,
      now, maxActiveStagingJobs
    });
    expect(await admitFreeScan(inputFor(allowedSite, "allowed", baseline.count + 1))).toMatchObject({ outcome: "created" });

    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,locale,stage,execution_state,lease_owner,lease_expires_at,retry_not_before,repair_deadline_at) VALUES
      (${randomUUID()},${repairA},'free','en','analyzing','running','capacity-worker',now()+interval '5 minutes',NULL,NULL),
      (${randomUUID()},${repairA},'free','en','analyzing','repair_wait',NULL,NULL,now()+interval '5 minutes',NULL),
      (${randomUUID()},${repairB},'free','en','analyzing','repair_wait',NULL,NULL,NULL,now()+interval '5 minutes')`;
    await expect(admitFreeScan(inputFor(blockedSite, "blocked", baseline.count + 4)))
      .rejects.toBeInstanceOf(ScanJobCapacityError);
  }, 60_000);

  it("supersedes only a quiescent staging repair reservation and rejects its resume", async () => {
    const sql = getSqlClient();
    const siteKey = `${sitePrefix}-supersede.test`;
    const now = new Date("2031-01-01T12:00:00.000Z");
    const oldReportId = await insertReport(siteKey, "supersede-old");
    const oldJobId = randomUUID();
    const oldReservationId = randomUUID();
    await sql`INSERT INTO free_site_trials (site_key,report_id,claimed_at,expires_at)
      VALUES (${siteKey},${oldReportId},${now.toISOString()},${new Date("2031-02-01T12:00:00.000Z").toISOString()})`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,locale,reason,stage,execution_state,repair_reason_code,error_code)
      VALUES (${oldJobId},${oldReportId},'free','en','staging_regeneration','analyzing','repair_wait','provider_unavailable','provider_unavailable')`;
    ownedBindingJobIds.add(oldJobId);
    await sql`INSERT INTO staging_free_regenerations (site_key,reservation_id,report_id,job_id)
      VALUES (${siteKey},${oldReservationId},${oldReportId},${oldJobId})`;
    const [before] = await sql<Array<{ row: unknown }>>`SELECT to_jsonb(job) AS row FROM scan_jobs job WHERE id=${oldJobId}`;
    const input = (idempotencyKey: string) => ({
      url: `https://${siteKey}/`, siteKey, locale: "en" as const, idempotencyKey,
      ipAddress: `${ipPrefix}::61`, forceFresh: true, stagingPreview: true,
      dailyDistinctSiteLimit: 2, aiDailyLimit: 10, maxActiveStagingJobs: 1_000, now
    });
    const requests = [`supersede-${runId}-first`, `supersede-${runId}-second`];
    const results = await Promise.all(requests.map((idempotencyKey) => admitFreeScan(input(idempotencyKey))));
    const created = results.filter((result) => result.outcome === "created");
    expect(created).toHaveLength(1);
    expect(results.map((result) => result.outcome).sort()).toEqual(["active_regeneration", "created"]);
    const createdIndex = results.findIndex((result) => result.outcome === "created");
    const replacement = results[createdIndex];
    if (!replacement || replacement.outcome !== "created") throw new Error("Expected replacement admission.");
    expect(await admitFreeScan(input(requests[createdIndex]!))).toEqual(replacement);
    await expect(resumeScanJobAfterRepair({ id: oldJobId, inputHash: "wrong", readiness: async () => undefined }))
      .rejects.toThrow(/superseded/i);
    const [after] = await sql<Array<{ row: unknown }>>`SELECT to_jsonb(job) AS row FROM scan_jobs job WHERE id=${oldJobId}`;
    expect(after).toEqual(before);
    const reservations = await sql<Array<{ reservation_id: string; report_id: string; job_id: string }>>`
      SELECT reservation_id,report_id,job_id FROM staging_free_regenerations WHERE site_key=${siteKey}`;
    expect(reservations).toEqual([{ reservation_id: expect.any(String), report_id: replacement.reportId, job_id: replacement.jobId }]);
    expect(reservations[0]?.reservation_id).not.toBe(oldReservationId);
  }, 60_000);

  it("linearizes resume against supersession without recovering a deleted reservation", async () => {
    const sql = getSqlClient();
    const siteKey = `${sitePrefix}-resume-race.test`;
    const now = new Date("2031-01-01T12:00:00.000Z");
    const reportId = await insertReport(siteKey, "resume-race-old");
    const jobId = randomUUID();
    const reservationId = randomUUID();
    const inputHash = `resume-race-${runId}`;
    const checkpoint = { recovery: { schemaVersion: 1, phase: "admission", revision: 0, phaseAttempt: 0,
      resumeGeneration: 0, identity: { jobId, reportId, productContract: "legacy_website_audit_v1", methodology: null,
        locale: "en", authorityId: null }, inputHash, completedArtifacts: [], remainingWork: [], priorTransitionId: null } };
    await sql`INSERT INTO free_site_trials (site_key,report_id,claimed_at,expires_at)
      VALUES (${siteKey},${reportId},${now.toISOString()},${new Date("2031-02-01T12:00:00.000Z").toISOString()})`;
    await sql`INSERT INTO scan_jobs
      (id,report_id,tier,locale,reason,stage,execution_state,repair_reason_code,error_code,checkpoint)
      VALUES (${jobId},${reportId},'free','en','staging_regeneration','queued','repair_wait','repairable','repairable',${JSON.stringify(checkpoint)}::jsonb)`;
    ownedBindingJobIds.add(jobId);
    await sql`INSERT INTO staging_free_regenerations (site_key,reservation_id,report_id,job_id)
      VALUES (${siteKey},${reservationId},${reportId},${jobId})`;
    const [before] = await sql<Array<{ row: unknown }>>`SELECT to_jsonb(job) AS row FROM scan_jobs job WHERE id=${jobId}`;
    const admission = admitFreeScan({ url: `https://${siteKey}/`, siteKey, locale: "en", idempotencyKey: `resume-race-${runId}`,
      ipAddress: `${ipPrefix}::62`, forceFresh: true, stagingPreview: true, dailyDistinctSiteLimit: 2, aiDailyLimit: 10, maxActiveStagingJobs: 1_000, now });
    const [resume, forceFresh] = await Promise.allSettled([
      resumeScanJobAfterRepair({ id: jobId, inputHash, readiness: async () => undefined }), admission
    ]);
    const resumed = resume.status === "fulfilled";
    const superseded = forceFresh.status === "fulfilled" && forceFresh.value.outcome === "created";
    expect(Number(resumed) + Number(superseded)).toBe(1);
    const [currentJob] = await sql<Array<{ execution_state: string; row: unknown }>>`
      SELECT execution_state,to_jsonb(job) AS row FROM scan_jobs job WHERE id=${jobId}`;
    const reservations = await sql<Array<{ reservation_id: string; job_id: string }>>`
      SELECT reservation_id,job_id FROM staging_free_regenerations WHERE site_key=${siteKey}`;
    if (resumed) {
      expect(forceFresh).toMatchObject({ status: "fulfilled", value: { outcome: "active_regeneration", jobId } });
      expect(currentJob?.execution_state).toBe("queued");
      expect(reservations).toEqual([{ reservation_id: reservationId, job_id: jobId }]);
    } else {
      expect(resume).toMatchObject({ status: "rejected", reason: expect.objectContaining({ message: expect.stringMatching(/superseded/i) }) });
      expect(currentJob?.row).toEqual(before?.row);
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.reservation_id).not.toBe(reservationId);
    }
  }, 60_000);

  it("does not deadlock terminalization against a force-fresh reservation lookup", async () => {
    const siteKey = `${sitePrefix}-terminalize-race.test`;
    const now = new Date("2031-01-01T12:00:00.000Z");
    const oldReportId = await insertReport(siteKey, "terminalize-race-old");
    const reportId = await insertReport(siteKey, "terminalize-race-new");
    await getSqlClient()`INSERT INTO free_site_trials (site_key,report_id,claimed_at,expires_at)
      VALUES (${siteKey},${oldReportId},${now.toISOString()},${new Date("2031-02-01T12:00:00.000Z").toISOString()})`;
    const reservation = await beginStagingFreeRegeneration({ siteKey, now });
    if (reservation.outcome !== "created") throw new Error("Expected a regeneration reservation.");
    const jobId = await insertLeasedJob(reportId, "terminalize-race-worker");
    expect(await attachStagingFreeRegeneration({ siteKey, reservationId: reservation.reservationId, reportId, jobId })).toBe(true);
    const [terminalized, admitted] = await Promise.allSettled([
      terminalizeScanJob(jobId, "terminalize-race-worker", { stage: "completed", coverage: { plannedPages: 1, successfulPages: 1, failedPages: 0 } }),
      admitFreeScan({ url: `https://${siteKey}/`, siteKey, locale: "en", idempotencyKey: `terminalize-race-${runId}`,
        ipAddress: `${ipPrefix}::64`, forceFresh: true, stagingPreview: true, dailyDistinctSiteLimit: 2, aiDailyLimit: 10, maxActiveStagingJobs: 1_000, now })
    ]);
    expect(terminalized).toMatchObject({ status: "fulfilled" });
    expect(admitted).toMatchObject({ status: "fulfilled" });
    if (admitted.status === "fulfilled") expect(["active_regeneration", "created"]).toContain(admitted.value.outcome);
  }, 60_000);

  it("keeps every non-supersedable reservation and its historical rows immutable", async () => {
    const sql = getSqlClient();
    const now = new Date("2031-01-01T12:00:00.000Z");
    const cases = [
      { name: "queued", tier: "free", reason: "staging_regeneration", stage: "queued", state: "queued" },
      { name: "running", tier: "free", reason: "staging_regeneration", stage: "analyzing", state: "running", lease: true },
      { name: "retry", tier: "free", reason: "staging_regeneration", stage: "analyzing", state: "retry_wait", retry: true },
      { name: "deadline", tier: "free", reason: "staging_regeneration", stage: "analyzing", state: "repair_wait", deadline: true },
      { name: "wrong-tier", tier: "deep", reason: "staging_regeneration", stage: "analyzing", state: "repair_wait" },
      { name: "wrong-reason", tier: "free", reason: "standard", stage: "analyzing", state: "repair_wait" },
      { name: "wrong-error", tier: "free", reason: "staging_regeneration", stage: "analyzing", state: "repair_wait", error: "different" },
      { name: "terminal", tier: "free", reason: "staging_regeneration", stage: "completed", state: "completed" },
      { name: "correction", tier: "free", reason: "staging_regeneration", stage: "analyzing", state: "repair_wait", correction: true },
      { name: "credit", tier: "free", reason: "staging_regeneration", stage: "analyzing", state: "repair_wait", credit: true },
      { name: "replacement", tier: "deep", reason: "replacement_fulfillment", stage: "queued", state: "queued", replacement: true }
    ];
    for (const variant of cases) {
      const siteKey = `${sitePrefix}-conservative-${variant.name}.test`;
      const reportId = await insertReport(siteKey, `conservative-${variant.name}`);
      const jobId = randomUUID(), reservationId = randomUUID();
      const authority = variant.correction || variant.replacement ? await seedConservativeAuthority(reportId) : null;
      await sql`INSERT INTO free_site_trials (site_key,report_id,claimed_at,expires_at)
        VALUES (${siteKey},${reportId},${now.toISOString()},${new Date("2031-02-01T12:00:00.000Z").toISOString()})`;
      await sql`INSERT INTO scan_jobs
        (id,report_id,tier,locale,reason,stage,execution_state,lease_owner,lease_expires_at,retry_not_before,repair_deadline_at,repair_reason_code,error_code,credit_reservation_id,correction_id,replacement_fulfillment_id,artifact_contract,business_question_set_id)
        VALUES (${jobId},${reportId},${variant.tier},'en',${variant.reason},${variant.stage},${variant.state},
          ${variant.lease ? "worker" : null},${variant.lease ? new Date("2031-01-01T13:00:00.000Z").toISOString() : null},${variant.retry ? new Date("2031-01-01T13:00:00.000Z").toISOString() : null},${variant.deadline ? new Date("2031-01-01T13:00:00.000Z").toISOString() : null},
          ${variant.state === "repair_wait" ? "repairable" : null},${variant.error ?? (variant.state === "repair_wait" ? "repairable" : null)},${variant.credit ? randomUUID() : null},${variant.correction ? authority!.correctionId : null},${variant.replacement ? authority!.replacementId : null},${variant.replacement ? "combined_geo_report_v3" : null},${variant.replacement ? authority!.questionSetId : null})`;
      ownedBindingJobIds.add(jobId);
      await sql`INSERT INTO staging_free_regenerations (site_key,reservation_id,report_id,job_id)
        VALUES (${siteKey},${reservationId},${reportId},${jobId})`;
      const [before] = await sql<Array<{ row: unknown }>>`SELECT jsonb_build_object('job',to_jsonb(job),'trial',to_jsonb(trial),'reservation',to_jsonb(regeneration)) AS row
        FROM scan_jobs job JOIN free_site_trials trial ON trial.site_key=${siteKey}
        JOIN staging_free_regenerations regeneration ON regeneration.site_key=${siteKey} WHERE job.id=${jobId}`;
      await expect(admitFreeScan({ url: `https://${siteKey}/`, siteKey, locale: "en", idempotencyKey: `conservative-${runId}-${variant.name}`,
        ipAddress: `${ipPrefix}::63`, forceFresh: true, stagingPreview: true, dailyDistinctSiteLimit: 2, aiDailyLimit: 10, now }))
        .resolves.toMatchObject({ outcome: "active_regeneration", jobId });
      const [after] = await sql<Array<{ row: unknown }>>`SELECT jsonb_build_object('job',to_jsonb(job),'trial',to_jsonb(trial),'reservation',to_jsonb(regeneration)) AS row
        FROM scan_jobs job JOIN free_site_trials trial ON trial.site_key=${siteKey}
        JOIN staging_free_regenerations regeneration ON regeneration.site_key=${siteKey} WHERE job.id=${jobId}`;
      expect(after).toEqual(before);
    }
  }, 60_000);

  async function insertReport(siteKey: string, suffix: string): Promise<string> {
    const id = `${runId}-${suffix}`;
    await getSqlClient()`
      INSERT INTO scan_reports (id, url, site_key, payload, report_locale)
      VALUES (${id}, ${`https://${siteKey}/`}, ${siteKey}, ${JSON.stringify({ score: 80 })}::jsonb, 'en')
    `;
    ownedReportIds.add(id);
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

  async function seedConservativeAuthority(reportId: string): Promise<{ correctionId: string; replacementId: string; questionSetId: string }> {
    const sql = getSqlClient();
    const jobId = randomUUID(), orderId = randomUUID(), questionSetId = randomUUID();
    const correctionId = randomUUID(), artifactId = randomUUID(), replacementId = randomUUID();
    await sql`INSERT INTO scan_jobs (id,report_id,tier,locale,reason,stage,execution_state)
      VALUES (${jobId},${reportId},'free','en','standard','failed','failed')`;
    await sql`INSERT INTO payment_orders
      (id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor)
      VALUES (${orderId},${`fixture-${orderId}`},'airwallex',${reportId},'fixture.test','encrypted','hmac','v1','legacy_website_audit_v1','v1','v1','v1','en','USD',1)`;
    await sql`INSERT INTO report_business_question_sets
      (id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
      VALUES (${questionSetId},${reportId},${orderId},1,'en','US','candidate','low','v1','v1','fixture')`;
    await sql`INSERT INTO report_corrections (id,order_id,report_id,original_paid_job_id,question_set_id)
      VALUES (${correctionId},${orderId},${reportId},${jobId},${questionSetId})`;
    await sql`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash)
      VALUES (${artifactId},${reportId},${orderId},${jobId},1,'combined_geo_report_v1','pending','fixture')`;
    await sql`INSERT INTO report_replacement_fulfillments
      (id,order_id,report_id,original_failed_job_id,failed_artifact_revision_id,question_set_id,reason_code,state,operator_authorization_ref)
      VALUES (${replacementId},${orderId},${reportId},${jobId},${artifactId},${questionSetId},'paid_report_not_delivered','prepared','fixture')`;
    return { correctionId, replacementId, questionSetId };
  }
});

function restore(name: keyof NodeJS.ProcessEnv, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { closeDatabase, getDatabasePoolSize } from "./index";
import { DATABASE_MIGRATIONS, V37_DATABASE_MIGRATIONS } from "./migrations";
import { createPostgresReportV4AcceptanceLedgerStore, createReportV4AcceptanceLedgerRepository } from "./report-v4-acceptance-ledger";
import {
  armReportV4ProhibitedOperationGuard,
  loadReportV4ProhibitedOperationGuardAuthority,
  reportV4ProhibitedOperationEventUnitId,
  reportV4ProhibitedOperationGuardRunId
} from "./report-v4-prohibited-operation-guard";
import {
  ReportV4ProhibitedOperationGuardContextConflictError,
  runReportV4GuardedOperation,
  withReportV4ProhibitedOperationGuard
} from "@/report-v4/prohibited-operation-guard-runtime";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as unknown as NodeJS.ProcessEnv;
const workerGitSha = "a".repeat(40);
const previousEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  OGC_DEPLOYMENT_PROFILE: process.env.OGC_DEPLOYMENT_PROFILE,
  COMMERCE_MODE: process.env.COMMERCE_MODE,
  OGC_DATABASE_POOL_SIZE: process.env.OGC_DATABASE_POOL_SIZE
};

// @requirement GEO-V4-ACCEPT-01
suite("Report V4 prohibited-operation guard PostgreSQL 17 authority", () => {
  const databaseName = `ogc_v37_guard_${randomUUID().replaceAll("-", "")}`;
  const upgradeDatabaseName = `ogc_v37_upgrade_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const databaseUrl = withDatabase(adminUrl!, databaseName);
    sql = postgres(databaseUrl, { max: 8, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    await sql`CREATE TABLE ogc_schema_state (
      singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
      version integer NOT NULL CHECK (version > 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`INSERT INTO ogc_schema_state(singleton,version) VALUES(true,37)`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_DATABASE_POOL_SIZE = "1";
    expect(getDatabasePoolSize()).toBe(1);
    const version = await sql<{ version: string }[]>`SELECT current_setting('server_version') AS version`;
    expect(version[0]?.version).toMatch(/^17\./u);
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(upgradeDatabaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
    restoreEnvironment();
  }, 120_000);

  it("arms and replays one in-process capability for the exact protected authority with fifteen zero seeds", async () => {
    const ids = await seedGuardLineage(sql, "question_failure", "replay");
    const first = await armReportV4ProhibitedOperationGuard(ids, environment);
    const replay = await armReportV4ProhibitedOperationGuard(ids, environment);
    expect(first).toBe(replay);
    const authority = await loadReportV4ProhibitedOperationGuardAuthority(sql, {
      sessionId: ids.sessionId, scenarioId: ids.scenarioId, jobId: ids.jobId
    });
    expect(authority?.run).toMatchObject({
      sessionId: ids.sessionId, scenarioId: ids.scenarioId, jobId: ids.jobId, workerGitSha, state: "armed"
    });
    expect(authority?.counters).toHaveLength(15);
    expect(authority?.counters.every(({ attemptCount, attemptedAt }) => attemptCount === 0 && attemptedAt === null)).toBe(true);
  }, 120_000);

  it("permits one simultaneous replay execution authority and rejects the other before work", async () => {
    const ids = await seedGuardLineage(sql, "diagnosis_failure", "simultaneous");
    const first = await armReportV4ProhibitedOperationGuard(ids, environment);
    const replay = await armReportV4ProhibitedOperationGuard(ids, environment);
    expect(first).toBe(replay);
    let releaseWork!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const gate = new Promise<void>((resolve) => { releaseWork = resolve; });
    const firstWork = vi.fn(async () => { markStarted(); await gate; return "first"; });
    const replayWork = vi.fn(async () => "replay");
    const firstExecution = withReportV4ProhibitedOperationGuard(first, firstWork);
    await started;
    await expect(withReportV4ProhibitedOperationGuard(replay, replayWork))
      .rejects.toBeInstanceOf(ReportV4ProhibitedOperationGuardContextConflictError);
    expect(replayWork).not.toHaveBeenCalled();
    releaseWork();
    await expect(firstExecution).resolves.toBe("first");
    expect(firstWork).toHaveBeenCalledTimes(1);
  }, 120_000);

  it("allows nested use of the same authority and rejects a different nested authority", async () => {
    const sameIds = await seedGuardLineage(sql, "question_failure", "nested-same");
    const same = await armReportV4ProhibitedOperationGuard(sameIds, environment);
    await expect(withReportV4ProhibitedOperationGuard(same, () =>
      withReportV4ProhibitedOperationGuard(same, async () => "nested"))).resolves.toBe("nested");

    const outerIds = await seedGuardLineage(sql, "question_failure", "nested-outer");
    const innerIds = await seedGuardLineage(sql, "diagnosis_failure", "nested-inner");
    const outer = await armReportV4ProhibitedOperationGuard(outerIds, environment);
    const inner = await armReportV4ProhibitedOperationGuard(innerIds, environment);
    const innerWork = vi.fn(async () => "wrong");
    await expect(withReportV4ProhibitedOperationGuard(outer, () =>
      withReportV4ProhibitedOperationGuard(inner, innerWork)))
      .rejects.toBeInstanceOf(ReportV4ProhibitedOperationGuardContextConflictError);
    expect(innerWork).not.toHaveBeenCalled();
  }, 120_000);

  it("trips counter then append-only ledger event with a one-connection guard pool, never delegates, and rejects reset or delete", async () => {
    const ids = await seedGuardLineage(sql, "question_failure", "trip");
    const capability = await armReportV4ProhibitedOperationGuard(ids, environment);
    const delegate = vi.fn();
    await expect(withReportV4ProhibitedOperationGuard(capability, () =>
      runReportV4GuardedOperation({ guardSite: "correction_confirm", delegate }))).rejects.toThrow(/blocked prohibited/u);
    expect(delegate).not.toHaveBeenCalled();
    const runId = reportV4ProhibitedOperationGuardRunId(ids);
    const counter = await sql`SELECT operation,guard_site,attempt_count,attempted_at
      FROM report_v4_prohibited_operation_guard_counters WHERE run_id=${runId} AND guard_site='correction_confirm'`;
    expect(counter[0]).toMatchObject({ operation: "correction", guard_site: "correction_confirm", attempt_count: 1 });
    expect(counter[0]?.attempted_at).toBeTruthy();
    const events = await sql`SELECT operation,unit_id,attempt,phase,details FROM report_v4_acceptance_events
      WHERE session_id=${ids.sessionId} AND scenario_id=${ids.scenarioId} AND kind='prohibited_operation'`;
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ operation: "correction",
      unit_id: reportV4ProhibitedOperationEventUnitId(ids.jobId, "correction_confirm"),
      attempt: 0, phase: "started", details: {} });
    await expectExecutionLockReleased(runId);
    await expect(sql`UPDATE report_v4_prohibited_operation_guard_counters SET attempt_count=0,attempted_at=NULL
      WHERE run_id=${runId} AND guard_site='correction_confirm'`).rejects.toThrow(/zero to one|timestamp|constraint/u);
    await expect(sql`DELETE FROM report_v4_prohibited_operation_guard_counters
      WHERE run_id=${runId} AND guard_site='correction_confirm'`).rejects.toThrow(/immutable/u);
    await expect(sql`UPDATE report_v4_prohibited_operation_guard_counters SET operation='pdf'
      WHERE run_id=${runId} AND guard_site='qualification'`).rejects.toThrow(/canonical|immutable/u);
    await expect(sql`UPDATE report_v4_prohibited_operation_guard_counters SET attempted_at=clock_timestamp()
      WHERE run_id=${runId} AND guard_site='correction_confirm'`).rejects.toThrow(/zero to one/u);
    await expect(sql`DELETE FROM report_v4_prohibited_operation_guard_runs WHERE id=${runId}`).rejects.toThrow(/immutable/u);
  }, 120_000);

  it("fails closed when the exact prohibited event already exists and never delegates", async () => {
    const ids = await seedGuardLineage(sql, "question_failure", "append-failure");
    const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
    await ledger.appendEvent({ sessionId: ids.sessionId, scenarioId: ids.scenarioId, kind: "prohibited_operation",
      operation: "qualification", unitId: reportV4ProhibitedOperationEventUnitId(ids.jobId, "qualification"),
      attempt: 0, phase: "started", details: {} });
    const capability = await armReportV4ProhibitedOperationGuard(ids, environment);
    const delegate = vi.fn();
    await expect(withReportV4ProhibitedOperationGuard(capability, () =>
      runReportV4GuardedOperation({ guardSite: "qualification", delegate }))).rejects.toThrow(/not a new exact trip event/u);
    expect(delegate).not.toHaveBeenCalled();
    const runId = reportV4ProhibitedOperationGuardRunId(ids);
    expect((await sql`SELECT attempt_count FROM report_v4_prohibited_operation_guard_counters
      WHERE run_id=${runId} AND guard_site='qualification'`)[0]?.attempt_count).toBe(1);
    await expectExecutionLockReleased(runId);
  }, 120_000);

  it("rejects stale authority after another process has completed the run before delegate", async () => {
    const ids = await seedGuardLineage(sql, "diagnosis_failure", "stale");
    const stale = await armReportV4ProhibitedOperationGuard(ids, environment);
    const runId = reportV4ProhibitedOperationGuardRunId(ids);
    await sql`UPDATE report_v4_prohibited_operation_guard_runs
      SET state='completed',completed_at=clock_timestamp() WHERE id=${runId}`;
    const work = vi.fn(async () => "must-not-run");
    await expect(withReportV4ProhibitedOperationGuard(stale, work))
      .rejects.toBeInstanceOf(ReportV4ProhibitedOperationGuardContextConflictError);
    expect(work).not.toHaveBeenCalled();
    await expectExecutionLockReleased(runId);
  }, 120_000);

  it("rejects sealed session/scenario, an unowned job, and the wrong worker SHA at the V37 trigger", async () => {
    const sealedSession = await seedGuardLineage(sql, "question_failure", "sealed-session");
    await sql`UPDATE report_v4_acceptance_sessions SET state='failed',terminal_at=clock_timestamp()
      WHERE id=${sealedSession.sessionId}`;
    await expect(armReportV4ProhibitedOperationGuard(sealedSession, environment)).rejects.toThrow(/collecting protected scenario/u);

    const sealedScenario = await seedGuardLineage(sql, "question_failure", "sealed-scenario");
    await sql.unsafe("ALTER TABLE report_v4_acceptance_scenarios DISABLE TRIGGER report_v4_acceptance_scenarios_guard");
    try {
      await sql`UPDATE report_v4_acceptance_scenarios SET state='failed',terminal_at=clock_timestamp()
        WHERE id=${sealedScenario.scenarioId}`;
    } finally {
      await sql.unsafe("ALTER TABLE report_v4_acceptance_scenarios ENABLE TRIGGER report_v4_acceptance_scenarios_guard");
    }
    await expect(armReportV4ProhibitedOperationGuard(sealedScenario, environment)).rejects.toThrow(/collecting protected scenario/u);

    const unowned = await seedGuardLineage(sql, "diagnosis_failure", "unowned");
    const unownedJobId = "job-unowned-extra";
    const reportId = String((await sql`SELECT report_id FROM scan_jobs WHERE id=${unowned.jobId}`)[0]?.report_id);
    await sql`INSERT INTO scan_jobs(id,report_id,tier,locale,reason)
      VALUES(${unownedJobId},${reportId},'deep','en','standard')`;
    await expect(armReportV4ProhibitedOperationGuard({ ...unowned, jobId: unownedJobId }, environment))
      .rejects.toThrow(/owns the exact job/u);

    const wrongSha = await seedGuardLineage(sql, "question_failure", "wrong-sha");
    await expect(armReportV4ProhibitedOperationGuard({ ...wrongSha, workerGitSha: "b".repeat(40) }, environment))
      .rejects.toThrow(/exact worker SHA/u);
  }, 120_000);

  it("rejects missing or extra seeded counters on exact replay", async () => {
    const missing = await seedGuardLineage(sql, "question_failure", "missing-seed");
    await armReportV4ProhibitedOperationGuard(missing, environment);
    const missingRunId = reportV4ProhibitedOperationGuardRunId(missing);
    await sql.unsafe("ALTER TABLE report_v4_prohibited_operation_guard_counters DISABLE TRIGGER report_v4_prohibited_operation_guard_counters_guard");
    try {
      await sql`DELETE FROM report_v4_prohibited_operation_guard_counters
        WHERE run_id=${missingRunId} AND guard_site='legacy_mutation'`;
    } finally {
      await sql.unsafe("ALTER TABLE report_v4_prohibited_operation_guard_counters ENABLE TRIGGER report_v4_prohibited_operation_guard_counters_guard");
    }
    await expect(armReportV4ProhibitedOperationGuard(missing, environment)).rejects.toThrow(/fifteen canonical/u);

    const extra = await seedGuardLineage(sql, "diagnosis_failure", "extra-seed");
    await armReportV4ProhibitedOperationGuard(extra, environment);
    const extraRunId = reportV4ProhibitedOperationGuardRunId(extra);
    await sql.unsafe("ALTER TABLE report_v4_prohibited_operation_guard_counters DISABLE TRIGGER report_v4_prohibited_operation_guard_counters_guard");
    try {
      await sql`INSERT INTO report_v4_prohibited_operation_guard_counters(run_id,operation,guard_site,attempt_count)
        VALUES(${extraRunId},'pdf','extra_site',0)`;
    } finally {
      await sql.unsafe("ALTER TABLE report_v4_prohibited_operation_guard_counters ENABLE TRIGGER report_v4_prohibited_operation_guard_counters_guard");
    }
    await expect(armReportV4ProhibitedOperationGuard(extra, environment)).rejects.toThrow(/fifteen canonical/u);
  }, 120_000);

  it("completes only a successful all-zero run and rejects completed capability reuse before work", async () => {
    const ids = await seedGuardLineage(sql, "diagnosis_failure", "complete");
    const capability = await armReportV4ProhibitedOperationGuard(ids, environment);
    await expect(withReportV4ProhibitedOperationGuard(capability, async () => "ok")).resolves.toBe("ok");
    const runId = reportV4ProhibitedOperationGuardRunId(ids);
    expect((await sql`SELECT state,completed_at FROM report_v4_prohibited_operation_guard_runs WHERE id=${runId}`)[0])
      .toMatchObject({ state: "completed" });
    const repeatedWork = vi.fn(async () => "again");
    await expect(withReportV4ProhibitedOperationGuard(capability, repeatedWork)).rejects.toThrow(/conflicting or completed/u);
    expect(repeatedWork).not.toHaveBeenCalled();
  }, 120_000);

  it("upgrades a real V36 database to V37 and safely replays every V37 DDL statement", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(upgradeDatabaseName)}`);
    const upgrade = postgres(withDatabase(adminUrl!, upgradeDatabaseName), { max: 1, prepare: false });
    try {
      const throughV36 = DATABASE_MIGRATIONS.slice(0, -V37_DATABASE_MIGRATIONS.length);
      await upgrade.begin(async (tx) => { for (const statement of throughV36) await tx.unsafe(statement); });
      expect((await upgrade`SELECT to_regclass('report_v4_prohibited_operation_guard_runs')::text AS name`)[0]?.name).toBeNull();
      await upgrade.begin(async (tx) => { for (const statement of V37_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await upgrade.begin(async (tx) => { for (const statement of V37_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      expect((await upgrade`SELECT to_regclass('report_v4_prohibited_operation_guard_runs')::text AS name`)[0]?.name)
        .toBe("report_v4_prohibited_operation_guard_runs");
      expect((await upgrade`SELECT to_regclass('report_v4_prohibited_operation_guard_counters')::text AS name`)[0]?.name)
        .toBe("report_v4_prohibited_operation_guard_counters");
    } finally {
      await upgrade.end({ timeout: 5 });
    }
  }, 120_000);
});

async function seedGuardLineage(
  sql: ReturnType<typeof postgres>,
  kind: "question_failure" | "diagnosis_failure",
  label: string
) {
  const sessionId = randomUUID();
  const scenarioId = randomUUID();
  const reportId = `report-${label}`;
  const jobId = `job-${label}`;
  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  await ledger.createSession({ sessionId, previewDeploymentId: "dpl-v37", protectedAliasUrl: "https://preview.example",
    webGitSha: workerGitSha, workerGitSha });
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${reportId},${`https://${label}.example/`},${`${label}.example`},'en','completed')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,locale,reason) VALUES(${jobId},${reportId},'deep','en','standard')`;
  if (kind === "question_failure") {
    await ledger.createScenario({ sessionId, scenarioId, kind, faultKind: kind, faultQuestionId: "question-1", expectedFaultOccurrences: 2 });
  } else {
    await ledger.createScenario({ sessionId, scenarioId, kind, faultKind: kind, faultQuestionId: "question-1", expectedFaultOccurrences: 2 });
  }
  await ledger.bindPreAdmissionJob({ sessionId, scenarioId, preAdmissionJobId: jobId });
  return { sessionId, scenarioId, jobId, workerGitSha };
}

function restoreEnvironment(): void {
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function expectExecutionLockReleased(runId: string): Promise<void> {
  const probe = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
  const key = `ogc:report-v4:prohibited-operation-guard-execution:v1:${runId}`;
  try {
    const rows = await probe<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(hashtextextended(${key},0)) AS acquired`;
    expect(rows[0]?.acquired).toBe(true);
    expect((await probe<{ released: boolean }[]>`
      SELECT pg_advisory_unlock(hashtextextended(${key},0)) AS released`)[0]?.released).toBe(true);
  } finally {
    await probe.end({ timeout: 5 });
  }
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

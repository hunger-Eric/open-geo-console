import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DATABASE_SCHEMA_VERSION, closeDatabase } from "./index";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4AcceptanceLedgerStore,
  createReportV4AcceptanceLedgerRepository
} from "./report-v4-acceptance-ledger";
import {
  loadReportV4AcceptanceLedgerGuardAuthority,
  loadReportV4AcceptanceLedgerGuardAuthorityInTransaction
} from "./report-v4-acceptance-ledger-guard-authority";
import {
  armReportV4ProhibitedOperationGuard,
  reportV4ProhibitedOperationEventUnitId,
  runReportV4GuardedOperation,
  withReportV4ProhibitedOperationGuard
} from "./report-v4-prohibited-operation-guard";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const environment = {
  VERCEL_ENV: "preview",
  OGC_DEPLOYMENT_PROFILE: "staging",
  COMMERCE_MODE: "test"
} as unknown as NodeJS.ProcessEnv;
const workerGitSha = "a".repeat(40);
const previousEnvironment = {
  DATABASE_URL: process.env.DATABASE_URL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  OGC_DEPLOYMENT_PROFILE: process.env.OGC_DEPLOYMENT_PROFILE,
  COMMERCE_MODE: process.env.COMMERCE_MODE,
  OGC_DATABASE_POOL_SIZE: process.env.OGC_DATABASE_POOL_SIZE
};

// @requirement GEO-V4-ACCEPT-01
suite("Report V4 ledger/guard authority PostgreSQL 17", () => {
  const databaseName = `ogc_v4_ledger_guard_authority_${randomUUID().replaceAll("-", "")}`;
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
    await sql`INSERT INTO ogc_schema_state(singleton,version) VALUES(true,${DATABASE_SCHEMA_VERSION})`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_DATABASE_POOL_SIZE = "1";
    const version = await sql<{ version: string }[]>`SELECT current_setting('server_version') AS version`;
    expect(version[0]?.version).toMatch(/^17\./u);
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
    restoreEnvironment();
  }, 120_000);

  it("loads real appended ledger rows and an exact armed/replayed fifteen-zero guard authority", async () => {
    const ids = await seedLineage(sql, "replay");
    const first = await armReportV4ProhibitedOperationGuard(ids, environment);
    const replay = await armReportV4ProhibitedOperationGuard(ids, environment);
    expect(replay).toBe(first);

    const authority = await loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: ids.sessionId, scenarioId: ids.scenarioId, phase: "baseline"
    });
    expect(authority.ledgerAuthority.events).toHaveLength(1);
    expect(authority.ledgerAuthority.events[0]).toMatchObject({
      sequence: 1, kind: "scenario_bound", operation: "v4_dispatch", eventPhase: "observed"
    });
    expect(authority.ledgerAuthority.events[0]?.eventHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(authority.prohibitedOperationGuardAuthority.run).toMatchObject({
      workerGitSha, state: "armed"
    });
    expect(authority.prohibitedOperationGuardAuthority.counters).toHaveLength(15);
    expect(authority.prohibitedOperationGuardAuthority.counters.every(({ attemptCount }) => attemptCount === 0)).toBe(true);
  }, 120_000);

  it("rejects a real trip with its exactly matched ledger event and accepts a separately completed all-zero final", async () => {
    const tripped = await seedLineage(sql, "trip");
    const capability = await armReportV4ProhibitedOperationGuard(tripped, environment);
    const delegate = vi.fn();
    await expect(withReportV4ProhibitedOperationGuard(capability, () =>
      runReportV4GuardedOperation({ guardSite: "correction_confirm", delegate }))).rejects.toThrow(/blocked prohibited/iu);
    expect(delegate).not.toHaveBeenCalled();
    const event = await sql`SELECT operation,unit_id,attempt,phase,details FROM report_v4_acceptance_events
      WHERE session_id=${tripped.sessionId} AND scenario_id=${tripped.scenarioId} AND kind='prohibited_operation'`;
    expect(event).toEqual([expect.objectContaining({
      operation: "correction",
      unit_id: reportV4ProhibitedOperationEventUnitId(tripped.jobId, "correction_confirm"),
      attempt: 0,
      phase: "started",
      details: {}
    })]);
    await expect(loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: tripped.sessionId, scenarioId: tripped.scenarioId, phase: "baseline"
    })).rejects.toThrow(/baseline.*zero/iu);

    const completed = await seedLineage(sql, "complete");
    const completedCapability = await armReportV4ProhibitedOperationGuard(completed, environment);
    await expect(withReportV4ProhibitedOperationGuard(completedCapability, async () => "ok")).resolves.toBe("ok");
    const final = await loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: completed.sessionId, scenarioId: completed.scenarioId, phase: "final"
    });
    expect(final.prohibitedOperationGuardAuthority.run.state).toBe("completed");
    expect(final.prohibitedOperationGuardAuthority.run.completedAt).not.toBeNull();
    expect(final.prohibitedOperationGuardAuthority.counters.every(({ attemptCount }) => attemptCount === 0)).toBe(true);
  }, 120_000);

  it("keeps ledger and counters consistent inside one repeatable-read snapshot while a real trip commits concurrently", async () => {
    const ids = await seedLineage(sql, "rr-consistency");
    const capability = await armReportV4ProhibitedOperationGuard(ids, environment);
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const first = await loadReportV4AcceptanceLedgerGuardAuthorityInTransaction(tx, {
        sessionId: ids.sessionId, scenarioId: ids.scenarioId, phase: "baseline"
      });
      expect(first.ledgerAuthority.events).toHaveLength(1);
      expect(first.prohibitedOperationGuardAuthority.counters.every(({ attemptCount }) => attemptCount === 0)).toBe(true);

      await expect(withReportV4ProhibitedOperationGuard(capability, () =>
        runReportV4GuardedOperation({ guardSite: "qualification", delegate: vi.fn() }))).rejects.toThrow(/blocked prohibited/iu);

      const second = await loadReportV4AcceptanceLedgerGuardAuthorityInTransaction(tx, {
        sessionId: ids.sessionId, scenarioId: ids.scenarioId, phase: "baseline"
      });
      expect(second).toEqual(first);
    });
    await expect(loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: ids.sessionId, scenarioId: ids.scenarioId, phase: "baseline"
    })).rejects.toThrow(/baseline.*zero/iu);
  }, 120_000);
});

async function seedLineage(sql: ReturnType<typeof postgres>, label: string) {
  const sessionId = randomUUID();
  const scenarioId = randomUUID();
  const reportId = `report-ledger-guard-${label}`;
  const jobId = `job-ledger-guard-${label}`;
  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  await ledger.createSession({
    sessionId,
    previewDeploymentId: `dpl-${label}`,
    protectedAliasUrl: `https://${label}.preview.example`,
    webGitSha: workerGitSha,
    workerGitSha
  });
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${reportId},${`https://${label}.example/`},${`${label}.example`},'en','completed')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,locale,reason)
    VALUES(${jobId},${reportId},'deep','en','standard')`;
  await ledger.createScenario({ sessionId, scenarioId, kind: "question_failure", faultKind: "question_failure",
    faultQuestionId: "question-1", expectedFaultOccurrences: 2 });
  await ledger.bindPreAdmissionJob({ sessionId, scenarioId, preAdmissionJobId: jobId });
  await ledger.appendEvent({ sessionId, scenarioId, kind: "scenario_bound", operation: "v4_dispatch",
    unitId: `binding-${label}`, attempt: 0, phase: "observed", details: { bindingHash: "b".repeat(64) } });
  return { sessionId, scenarioId, jobId, workerGitSha };
}

function restoreEnvironment(): void {
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

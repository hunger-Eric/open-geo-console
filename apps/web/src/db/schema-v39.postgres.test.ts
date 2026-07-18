import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReportV4CommerceAuthoritySnapshotPair } from "../report-v4/report-v4-commerce-authority-comparator.test-fixture";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V39_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";
import {
  loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction,
  persistReportV4AcceptanceAuthorityPhaseSnapshot
} from "./report-v4-acceptance-authority-phase-snapshot";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";
const TIMING_SESSION = "33333333-3333-4333-8333-333333333333";
const TIMING_SCENARIO = "44444444-4444-4444-8444-444444444444";
const FAILED_SESSION = "55555555-5555-4555-8555-555555555555";
const FAILED_SCENARIO = "66666666-6666-4666-8666-666666666666";
const WORKER_SHA = "a".repeat(40);
const databaseName = `ogc_v39_phase_${randomUUID().replaceAll("-", "")}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const withDb = (url: string, database: string) => url.replace(/\/[^/]+$/, `/${database}`);

suite("schema V39 complete acceptance authority phase snapshots", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDb(adminUrl!, databaseName), { max: 4, prepare: false });
    const throughV38 = DATABASE_MIGRATIONS.slice(0, -V39_DATABASE_MIGRATIONS.length);
    await sql.begin(async (tx) => { for (const statement of throughV38) await tx.unsafe(statement); });
    await sql.begin(async (tx) => { for (const statement of V39_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql.begin(async (tx) => { for (const statement of V39_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile)
      VALUES(true,'staging')
      ON CONFLICT(singleton) DO UPDATE SET profile=EXCLUDED.profile,updated_at=clock_timestamp()`;
    await sql`INSERT INTO report_v4_acceptance_sessions
      (id,environment,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
      VALUES(${SESSION},'protected_staging','preview-v39','https://preview.example.com',${WORKER_SHA},${WORKER_SHA})`;
    await sql`INSERT INTO report_v4_acceptance_scenarios
      (id,session_id,kind,fault_kind,fault_question_id,expected_fault_occurrences)
      VALUES(${SCENARIO},${SESSION},'question_failure','question_failure','question-3',2)`;
    await seedScenario(sql, TIMING_SESSION, TIMING_SCENARIO, "preview-v39-timing");
    await seedScenario(sql, FAILED_SESSION, FAILED_SCENARIO, "preview-v39-failed");
    await sql`UPDATE report_v4_acceptance_sessions SET state='failed',terminal_at=clock_timestamp()
      WHERE id=${FAILED_SESSION}`;
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("registers one replay-safe V39 forward migration after V38", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(40);
    expect(databaseMigrationsAfter(38)).toEqual([...V39_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(39)).toEqual([]);
    const source = V39_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("report_v4_acceptance_authority_phase_snapshots");
    expect(source.indexOf("DROP TRIGGER IF EXISTS report_v4_acceptance_authority_phase_snapshots_guard"))
      .toBeLessThan(source.indexOf("CREATE TRIGGER report_v4_acceptance_authority_phase_snapshots_guard"));
  });

  it("uses test-only direct SQL to prove exact replay and append-only baseline/final trigger behavior", async () => {
    const first = await insertRawPhase(sql, SESSION, SCENARIO, "baseline", "2026-07-17T00:00:00.000Z");
    const replay = await insertRawPhase(sql, SESSION, SCENARIO, "baseline", "2026-07-17T00:00:00.000Z", WORKER_SHA, true);
    expect(first).toHaveLength(1);
    expect(replay).toHaveLength(0);
    await expect(insertRawPhase(sql, SESSION, SCENARIO, "final", "2026-07-17T00:02:00.000Z"))
      .resolves.toHaveLength(1);
    await expect(sql`UPDATE report_v4_acceptance_authority_phase_snapshots SET worker_git_sha=${"b".repeat(40)}
      WHERE session_id=${SESSION} AND scenario_id=${SCENARIO} AND phase='baseline'`).rejects.toThrow(/append-only|immutable/i);
    await expect(sql`DELETE FROM report_v4_acceptance_authority_phase_snapshots
      WHERE session_id=${SESSION} AND scenario_id=${SCENARIO} AND phase='final'`).rejects.toThrow(/append-only|immutable/i);
  }, 120_000);

  it("rejects wrong worker, noncanonical time, final-before-baseline, nonincreasing time, and noncollecting state", async () => {
    await expect(insertRawPhase(sql, TIMING_SESSION, TIMING_SCENARIO, "baseline", "2026-07-17T00:00:00.000Z", "b".repeat(40)))
      .rejects.toThrow(/collecting protected-Staging/i);
    await expect(insertRawPhase(sql, TIMING_SESSION, TIMING_SCENARIO, "baseline", "2026-07-17T00:00:00Z"))
      .rejects.toThrow(/captured_at|check constraint/i);
    await expect(insertRawPhase(sql, TIMING_SESSION, TIMING_SCENARIO, "final", "2026-07-17T00:01:00.000Z"))
      .rejects.toThrow(/earlier persisted baseline/i);
    await expect(insertRawPhase(sql, TIMING_SESSION, TIMING_SCENARIO, "baseline", "2026-07-17T00:01:00.000Z"))
      .resolves.toBeDefined();
    await expect(insertRawPhase(sql, TIMING_SESSION, TIMING_SCENARIO, "final", "2026-07-17T00:01:00.000Z"))
      .rejects.toThrow(/earlier persisted baseline/i);
    await expect(insertRawPhase(sql, FAILED_SESSION, FAILED_SCENARIO, "baseline", "2026-07-17T00:00:00.000Z"))
      .rejects.toThrow(/collecting protected-Staging/i);
  }, 120_000);

  it("keeps public generic persistence at zero writes and refuses to brand any existing direct-SQL row", async () => {
    const before = await sql<Array<{ count: number }>>`SELECT count(*)::integer count FROM report_v4_acceptance_authority_phase_snapshots`;
    const tampered = structuredClone(completePayload("baseline"));
    tampered.commerce.fingerprint = "f".repeat(64);
    for (const payload of [completePayload("baseline"), tampered, genericPayload("baseline"), { contractVersion: "unknown" }]) {
      await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql, persistenceInput("baseline", payload)))
        .rejects.toMatchObject({ code: "phase_authority_incomplete" });
    }
    const after = await sql<Array<{ count: number }>>`SELECT count(*)::integer count FROM report_v4_acceptance_authority_phase_snapshots`;
    expect(after[0]?.count).toBe(before[0]?.count);
    await expect(loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(sql as never, {
      sessionId: SESSION, scenarioId: SCENARIO, phase: "baseline"
    })).rejects.toMatchObject({ code: "phase_authority_incomplete" });
  }, 120_000);
});

function persistenceInput(phase: "baseline" | "final", payload: unknown) {
  return { sessionId: SESSION, scenarioId: SCENARIO, phase, workerGitSha: WORKER_SHA, payload };
}

async function seedScenario(
  sql: ReturnType<typeof postgres>,
  sessionId: string,
  scenarioId: string,
  previewDeploymentId: string
): Promise<void> {
  await sql`INSERT INTO report_v4_acceptance_sessions
    (id,environment,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
    VALUES(${sessionId},'protected_staging',${previewDeploymentId},'https://preview.example.com',${WORKER_SHA},${WORKER_SHA})`;
  await sql`INSERT INTO report_v4_acceptance_scenarios
    (id,session_id,kind,fault_kind,fault_question_id,expected_fault_occurrences)
    VALUES(${scenarioId},${sessionId},'question_failure','question_failure','question-3',2)`;
}

async function insertRawPhase(
  sql: ReturnType<typeof postgres>,
  sessionId: string,
  scenarioId: string,
  phase: "baseline" | "final",
  capturedAt: string,
  workerGitSha = WORKER_SHA,
  replay = false
) {
  const payload = genericPayload(phase);
  return sql.unsafe(`INSERT INTO report_v4_acceptance_authority_phase_snapshots
    (session_id,scenario_id,phase,captured_at,payload,payload_hash,commerce_fingerprint,worker_git_sha)
    VALUES($1,$2,$3,$4,$5::text::jsonb,$6,$7,$8)
    ${replay ? "ON CONFLICT(session_id,scenario_id,phase) DO NOTHING" : ""}
    RETURNING session_id,scenario_id,phase`, [sessionId, scenarioId, phase, capturedAt, JSON.stringify(payload),
    hash(stable(payload)), hash(`commerce-${phase}`), workerGitSha]);
}

function completePayload(phase: "baseline" | "final") {
  const commerce = createReportV4CommerceAuthoritySnapshotPair("question_failure")[phase];
  const slot = (name: string) => {
    const records = [{ name, identityHash: hash(name) }];
    return { records, recordCount: 1, canonicalHash: hash(stable(records)) };
  };
  return {
    contractVersion: "report-v4-acceptance-authority-phase-v1" as const,
    phase,
    capturedAt: commerce.capturedAt,
    scenarioKind: "question_failure" as const,
    session: { sessionIdHash: hash(SESSION), scenarioIdHash: hash(SCENARIO), sessionState: "collecting" as const,
      scenarioState: "collecting" as const, headSequence: 0, headHash: "0".repeat(64), eventCount: 0 },
    commerce,
    paidAt: commerce.orders[0]!.paidAt!,
    websiteCheckpoint: { state: "completed" as const, providerCallCount: 1 as const, correctionCount: 0 as const,
      pageSummaryCount: 1, identityHash: "1".repeat(64), inputIdentityHash: "2".repeat(64),
      pageSummaryIdentitySetHash: "3".repeat(64), outputHash: "4".repeat(64) },
    authorities: {
      site_snapshot_pages: slot("site_snapshot_pages"), page_summary_integrity: slot("page_summary_integrity"),
      artifact_combined_payload_integrity: slot("artifact_combined_payload_integrity"), site_read_manifest: slot("site_read_manifest"),
      ledger_authority: slot("ledger_authority"), prohibited_operation_guard_authority: slot("prohibited_operation_guard_authority"),
      zero_database_effect_counts: slot("zero_database_effect_counts")
    },
    transactionProfile: { isolation: "repeatable read" as const, readOnly: true as const }
  };
}

function genericPayload(phase: "baseline" | "final") { return { testOnlyDirectSqlFixture: true, phase }; }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

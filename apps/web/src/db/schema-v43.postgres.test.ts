import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V43_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";
import { createPostgresReportV4AcceptanceLedgerStore, createReportV4AcceptanceLedgerRepository } from "./report-v4-acceptance-ledger";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const legacyHash = "e7f33b34d76384bbb9366f4f7cc109e6bd63dc84ea962fc9ad410ddb1b6c197b";
const currentHash = "c05eaacb4e1746187a5ca37295b3329357c90b27d464fb5e6c87aea4164c390d";
const manifestDomain = "open-geo-console/report-v4/prohibited-operation-manifest";
const workerGitSha = "a".repeat(40);
const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as NodeJS.ProcessEnv;
const legacyPairs = [
  ["pdf", "pdf_export_url"], ["pdf", "pdf_export_html"], ["pdf", "pdf_readiness_chromium"], ["pdf", "pdf_readiness_storage"],
  ["full_report_rerun", "full_report_rerun"], ["provider_claim", "provider_claim"], ["qualification", "qualification"], ["four_snapshot", "four_snapshot"],
  ["replacement_fulfillment", "replacement_prepare"], ["replacement_fulfillment", "replacement_resume"], ["replacement_fulfillment", "replacement_terminalize"],
  ["correction", "correction_prepare"], ["correction", "correction_confirm"], ["correction", "correction_terminalize"], ["legacy_mutation", "legacy_mutation"]
] as const;
const currentPairs = [
  ["pdf", "pdf_export_url"], ["pdf", "pdf_export_html"], ["pdf", "pdf_readiness_chromium"], ["pdf", "pdf_readiness_storage"],
  ["full_report_rerun", "full_report_rerun"], ["provider_claim", "provider_claim"], ["qualification", "qualification"], ["four_snapshot", "four_snapshot"],
  ["replacement_fulfillment", "replacement_terminalize"], ["legacy_mutation", "legacy_mutation"]
] as const;

suite("schema V43 prohibited-operation manifest convergence", () => {
  const databaseName = `ogc_v43_guard_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDb(adminUrl!, databaseName), { max: 1, prepare: false });
    const throughV42 = DATABASE_MIGRATIONS.slice(0, -V43_DATABASE_MIGRATIONS.length);
    await sql.begin(async (tx) => { for (const statement of throughV42) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("preserves a legal V42 fifteen-counter row and admits only current ten-counter V43 runs", async () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(43);
    expect(databaseMigrationsAfter(42)).toEqual([...V43_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(43)).toEqual([]);
    const historical = await seedLineage(sql, "historical");
    const historicalRunId = runId(historical, legacyHash);
    await insertRun(sql, historical, historicalRunId, legacyHash, legacyPairs);
    const before = await snapshot(sql, historicalRunId);

    await sql.begin(async (tx) => { for (const statement of V43_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql.begin(async (tx) => { for (const statement of V43_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    expect(await snapshot(sql, historicalRunId)).toEqual(before);
    await expect(sql`UPDATE report_v4_prohibited_operation_guard_runs SET state='completed',completed_at=clock_timestamp()
      WHERE id=${historicalRunId}`).resolves.toBeDefined();

    const current = await seedLineage(sql, "current");
    const currentRunId = runId(current, currentHash);
    await insertRun(sql, current, currentRunId, currentHash, currentPairs);
    expect((await sql`SELECT count(*)::integer AS count FROM report_v4_prohibited_operation_guard_counters WHERE run_id=${currentRunId}`)[0]?.count).toBe(10);
    await expect(sql`INSERT INTO report_v4_prohibited_operation_guard_counters(run_id,operation,guard_site,attempt_count)
      VALUES(${currentRunId},'replacement_fulfillment','replacement_prepare',0)`).rejects.toThrow(/canonical/i);
    await expect(sql`UPDATE report_v4_prohibited_operation_guard_runs SET state='completed',completed_at=clock_timestamp()
      WHERE id=${currentRunId}`).resolves.toBeDefined();
  }, 120_000);
});

async function seedLineage(sql: ReturnType<typeof postgres>, label: string) {
  const sessionId = randomUUID();
  const scenarioId = randomUUID();
  const reportId = `report-v43-${label}`;
  const jobId = `job-v43-${label}`;
  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  await ledger.createSession({ sessionId, previewDeploymentId: `dpl-v43-${label}`, protectedAliasUrl: "https://preview.example", webGitSha: workerGitSha, workerGitSha });
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${reportId},${`https://${label}.example/`},${`${label}.example`},'en','completed')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,locale,reason) VALUES(${jobId},${reportId},'deep','en','standard')`;
  await ledger.createScenario({ sessionId, scenarioId, kind: "question_failure", faultKind: "question_failure", faultQuestionId: "question-1", expectedFaultOccurrences: 2 });
  await ledger.bindPreAdmissionJob({ sessionId, scenarioId, preAdmissionJobId: jobId });
  return { sessionId, scenarioId, jobId };
}

async function insertRun(sql: ReturnType<typeof postgres>, lineage: { sessionId: string; scenarioId: string; jobId: string }, id: string, manifestHash: string, pairs: readonly (readonly [string, string])[]) {
  await sql`INSERT INTO report_v4_prohibited_operation_guard_runs(id,domain,session_id,scenario_id,job_id,worker_git_sha,manifest_hash,state)
    VALUES(${id},${manifestDomain},${lineage.sessionId},${lineage.scenarioId},${lineage.jobId},${workerGitSha},${manifestHash},'armed')`;
  for (const [operation, guardSite] of pairs) {
    await sql`INSERT INTO report_v4_prohibited_operation_guard_counters(run_id,operation,guard_site,attempt_count)
      VALUES(${id},${operation},${guardSite},0)`;
  }
}

async function snapshot(sql: ReturnType<typeof postgres>, id: string) {
  return await sql`SELECT runs.id,runs.domain,runs.session_id,runs.scenario_id,runs.job_id,runs.worker_git_sha,runs.manifest_hash,runs.state,runs.armed_at,runs.completed_at,
    (SELECT jsonb_agg(jsonb_build_object('operation',operation,'guard_site',guard_site,'attempt_count',attempt_count,'seeded_at',seeded_at,'attempted_at',attempted_at) ORDER BY guard_site)
      FROM report_v4_prohibited_operation_guard_counters WHERE run_id=runs.id) AS counters
    FROM report_v4_prohibited_operation_guard_runs runs WHERE runs.id=${id}`;
}

function runId(lineage: { sessionId: string; scenarioId: string; jobId: string }, manifestHash: string): string {
  return createHash("sha256").update(["ogc:report-v4:prohibited-operation-guard-run:v1", manifestDomain, lineage.sessionId, lineage.scenarioId, lineage.jobId, workerGitSha, manifestHash].join("\x1f")).digest("hex");
}
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDb(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

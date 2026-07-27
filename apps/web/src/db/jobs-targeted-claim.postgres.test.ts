import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { claimExactScanJob, claimScanJob } from "./jobs";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "");
const dbName = `ogc_exact_${suffix}`;
const ids = { report: `report-${suffix}`, old: `old-${suffix}`, target: `target-${suffix}`, expired: `expired-${suffix}`, exhausted: `exhausted-${suffix}` };

suite("targeted PostgreSQL scan-job claim", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  beforeAll(async () => { await admin.unsafe(`CREATE DATABASE \"${dbName}\"`); process.env.DATABASE_URL = withDb(adminUrl!, dbName); process.env.OGC_DEPLOYMENT_PROFILE = "staging"; await initializeDatabaseEnvironment("staging"); await seed(); }, 180_000);
  afterAll(async () => { await closeDatabase(); await admin.unsafe(`DROP DATABASE IF EXISTS \"${dbName}\" WITH (FORCE)`); await admin.end(); }, 60_000);

  it("claims its newer exact identity without FIFO or unrelated maintenance, while ordinary claim remains FIFO", async () => {
    const exact = await claimExactScanJob("exact", { jobId: ids.target, reportId: ids.report, tier: "deep" });
    expect(exact).toMatchObject({ id: ids.target, leaseOwner: "exact", executionState: "running" });
    const sql = getSqlClient();
    expect(Object.fromEntries((await sql`SELECT id,execution_state FROM scan_jobs WHERE id IN (${ids.old},${ids.expired},${ids.exhausted})`).map((row) => [row.id, row.execution_state]))).toEqual({ [ids.old]: "queued", [ids.expired]: "running", [ids.exhausted]: "retry_wait" });
    const fifo = await claimScanJob("ordinary", "deep");
    expect(fifo).toMatchObject({ id: ids.old });
  }, 180_000);

  it("preserves ordinary exact eligibility for retry, lease, and attempt conditions", async () => {
    await expect(claimExactScanJob("nope", { jobId: ids.exhausted, reportId: ids.report, tier: "deep" })).resolves.toBeNull();
    await expect(claimExactScanJob("nope", { jobId: ids.expired, reportId: ids.report, tier: "deep" })).resolves.toBeNull();
  });
});

async function seed() { const sql = getSqlClient(); await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status) VALUES(${ids.report},'https://exact.example/','exact.example','{}','en','completed')`;
  for (const [id, state, created, attempts, max, lease] of [[ids.old,"queued","now()-interval '2 minutes'",0,3,"NULL"],[ids.target,"queued","now()-interval '1 minute'",0,3,"NULL"],[ids.expired,"running","now()",0,3,"now()+interval '1 hour'"],[ids.exhausted,"retry_wait","now()",3,3,"NULL"]] as const) await sql.unsafe(`INSERT INTO scan_jobs(id,report_id,tier,locale,stage,execution_state,current_phase,created_at,attempts,phase_attempt,max_attempts,lease_expires_at) VALUES($1,$2,'deep','en','queued',$3,'admission',${created},$4,$4,$5,${lease})`, [id, ids.report, state, attempts, max]); }
function withDb(url: string, name: string) { const parsed = new URL(url); parsed.pathname = `/${name}`; return parsed.toString(); }

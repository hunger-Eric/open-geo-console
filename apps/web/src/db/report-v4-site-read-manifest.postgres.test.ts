import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS, V36_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";
import {
  createPostgresReportV4AcceptanceLedgerStore,
  createReportV4AcceptanceLedgerRepository
} from "./report-v4-acceptance-ledger";
import {
  createPostgresReportV4AcceptanceSiteReadManifestStore,
  createReportV4AcceptanceSiteReadManifestRepository,
  loadExactReportV4AcceptanceSiteReadManifest,
  loadReportV4AcceptanceSiteReadManifestAuthority,
  loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction,
  reportV4AcceptanceSiteReadIdentityHash,
  reportV4AcceptanceSiteReadPairBindingHash
} from "./report-v4-site-read-manifest";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as NodeJS.ProcessEnv;
const sessionId = "31111111-1111-4111-8111-111111111111";
const scenarioId = "41111111-1111-4111-8111-111111111111";
const admissionOnlySessionId = "71111111-1111-4111-8111-111111111111";
const admissionOnlyScenarioId = "81111111-1111-4111-8111-111111111111";

// @requirement GEO-V4-ACCEPT-01
suite("Report V4 protected-acceptance site-read manifest PostgreSQL", () => {
  const databaseName = `ogc_v36_site_reads_${randomUUID().replaceAll("-", "")}`;
  const upgradeDatabaseName = `ogc_v36_upgrade_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;
  let questionFinalNull: TopologyLineage;
  let questionFinalEnhancement: TopologyLineage;
  let diagnosisFinalNull: TopologyLineage;
  let diagnosisFinalEnhancement: TopologyLineage;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 8, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    await seedCollectingLineage(sql);
    await seedAdmissionOnlyLineage(sql);
    questionFinalNull = await seedTopologyLineage(sql, "question-null", "question_failure", false);
    questionFinalEnhancement = await seedTopologyLineage(sql, "question-enh", "question_failure", true);
    diagnosisFinalNull = await seedTopologyLineage(sql, "diagnosis-null", "diagnosis_failure", false);
    diagnosisFinalEnhancement = await seedTopologyLineage(sql, "diagnosis-enh", "diagnosis_failure", true);
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(upgradeDatabaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("begins once, loads started-only rows through a read-only transaction, and terminalizes exactly once", async () => {
    const repository = manifestRepo(sql);
    const input = admission("https://example.com/robots.txt?opaque=never-store#fragment", "raw", "robots");
    const first = await repository.begin(input);
    expect(first.inserted).toBe(true);
    expect(first.entry.terminalPhase).toBeNull();
    expect(first.entry.terminalAt).toBeNull();
    expect(first.entry.urlHash).toBe(sha("https://example.com/robots.txt?opaque=never-store"));
    expect(first.entry).not.toHaveProperty("rawUrl");

    const replay = await repository.begin(input);
    expect(replay).toEqual({ entry: first.entry, inserted: false });
    const loaded = await sql.begin("isolation level repeatable read read only", (tx) =>
      loadExactReportV4AcceptanceSiteReadManifest(tx, { sessionId, scenarioId }));
    expect(loaded).toEqual([first.entry]);

    const terminal = await repository.terminalize({ sessionId, scenarioId,
      identityHash: first.entry.identityHash, terminalPhase: "completed" });
    expect(terminal.terminalPhase).toBe("completed");
    expect(terminal.terminalAt).toBeInstanceOf(Date);
    await expect(repository.terminalize({ sessionId, scenarioId,
      identityHash: first.entry.identityHash, terminalPhase: "completed" })).rejects.toThrow(/only once/i);
  }, 120_000);

  it("pairs raw/browser by deterministic URL binding but keeps distinct physical identities", async () => {
    const repository = manifestRepo(sql);
    const raw = await repository.begin(admission("https://example.com/page", "raw", "page"));
    await repository.terminalize({ sessionId, scenarioId, identityHash: raw.entry.identityHash, terminalPhase: "completed" });
    const browser = await repository.begin(admission("https://example.com/page#client-fragment", "browser", "page"));
    expect(raw.entry.urlHash).toBe(browser.entry.urlHash);
    expect(raw.entry.pairBindingHash).toBe(browser.entry.pairBindingHash);
    expect(raw.entry.identityHash).not.toBe(browser.entry.identityHash);
  });

  it("projects real binding and exact raw/browser pair topology from the full schema", async () => {
    const admissionOnly = { sessionId: admissionOnlySessionId, scenarioId: admissionOnlyScenarioId, phase: "baseline" as const,
      scenarioKind: "success" as const, reportId: "report-admission-only",
      preAdmissionJobId: "pre-admission-only", enhancementJobId: null };
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, admissionOnly))
      .resolves.toMatchObject({ records: [], requiredIdentityHashes: [], allowedIdentityHashes: [] });
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, {
      ...admissionOnly, enhancementJobId: "enhancement-1"
    })).rejects.toThrow(/exact scenario kind, report, and job binding/i);
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, {
      ...admissionOnly, reportId: "report-1"
    })).rejects.toThrow(/exact scenario kind, report, and job binding/i);

    const repository = manifestRepo(sql);
    const rawOnly = await repository.begin(admission("https://example.com/projector-raw-only", "raw", "page"));
    let authority = await loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput());
    expect(authority.records.find(({ identityHash }) => identityHash === rawOnly.entry.identityHash)?.semanticState)
      .toBe("started_only");
    await repository.terminalize({ sessionId, scenarioId, identityHash: rawOnly.entry.identityHash, terminalPhase: "failed" });
    const pairedBrowser = await repository.begin(admission("https://example.com/projector-raw-only", "browser", "page"));
    authority = await loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput());
    expect(authority.records.map(({ identityHash }) => identityHash)).toEqual(expect.arrayContaining([
      rawOnly.entry.identityHash, pairedBrowser.entry.identityHash
    ]));

    const browserOnly = await repository.begin(admission("https://example.com/projector-browser-first", "browser", "page"));
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput()))
      .rejects.toThrow(/raw.*cardinality/i);
    const lateRaw = await repository.begin(admission("https://example.com/projector-browser-first", "raw", "page"));
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput()))
      .rejects.toThrow(/raw read.*terminalize/i);
    await repository.terminalize({ sessionId, scenarioId, identityHash: lateRaw.entry.identityHash, terminalPhase: "completed" });
    authority = await loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput());
    expect(authority.records.find(({ identityHash }) => identityHash === browserOnly.entry.identityHash)).toBeDefined();
  }, 120_000);

  it("enforces phase/scenario-kind enhancement topology from exact full-schema bindings", async () => {
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, {
      ...authorityInput(), phase: "baseline"
    })).rejects.toThrow(/baseline.*forbids enhancement/i);
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, {
      sessionId: admissionOnlySessionId, scenarioId: admissionOnlyScenarioId, phase: "final",
      scenarioKind: "success", reportId: "report-admission-only", preAdmissionJobId: "pre-admission-only",
      enhancementJobId: null
    })).rejects.toThrow(/success.*requires enhancement/i);
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never,
      topologyInput(questionFinalEnhancement, "final"))).rejects.toThrow(/question_failure.*forbids enhancement/i);
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never,
      topologyInput(diagnosisFinalNull, "final"))).rejects.toThrow(/diagnosis_failure.*requires enhancement/i);

    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never,
      topologyInput(questionFinalNull, "baseline"))).resolves.toMatchObject({ phase: "baseline", scenarioKind: "question_failure" });
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never,
      topologyInput(questionFinalNull, "final"))).resolves.toMatchObject({ phase: "final", scenarioKind: "question_failure" });
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never,
      topologyInput(diagnosisFinalNull, "baseline"))).resolves.toMatchObject({ phase: "baseline", scenarioKind: "diagnosis_failure" });
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never,
      topologyInput(diagnosisFinalEnhancement, "final"))).resolves.toMatchObject({ phase: "final", scenarioKind: "diagnosis_failure" });
    await expect(loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput()))
      .resolves.toMatchObject({ phase: "final", scenarioKind: "success" });
  }, 120_000);

  it("keeps one RR/RO authority projection stable across a concurrent terminalization", async () => {
    const repository = manifestRepo(sql);
    const started = await repository.begin(admission("https://example.com/rr-drift", "raw", "page"));
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      await tx`SELECT count(*) FROM report_v4_acceptance_site_read_manifest`;
      await repository.terminalize({ sessionId, scenarioId, identityHash: started.entry.identityHash, terminalPhase: "failed" });
      const snapshot = await loadReportV4AcceptanceSiteReadManifestAuthorityInTransaction(tx as never, authorityInput());
      expect(snapshot.records.find(({ identityHash }) => identityHash === started.entry.identityHash)?.semanticState)
        .toBe("started_only");
    });
    const current = await loadReportV4AcceptanceSiteReadManifestAuthority(sql as never, authorityInput());
    expect(current.records.find(({ identityHash }) => identityHash === started.entry.identityHash)?.semanticState)
      .toBe("terminal");
  }, 120_000);

  it("enforces exact collecting lineage, scope constraints, physical enhancement ownership, and immutable rows", async () => {
    const repository = manifestRepo(sql);
    await expect(repository.begin({ ...admission("https://example.com/wrong", "raw", "page"), jobId: "wrong-job" }))
      .rejects.toThrow(/lineage|foreign key/i);
    await expect(repository.begin({ ...admission("https://example.com/wrong", "raw", "page"), reportId: "wrong-report" }))
      .rejects.toThrow(/lineage|foreign key/i);
    const invalidScope = { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1",
      scope: "admission_page" as const, purpose: "source" as const, urlHash: "b".repeat(64),
      mode: "raw" as const, attempt: 0 as const, ownerQuestionId: null, ownerSourceId: null };
    await expect(sql`INSERT INTO report_v4_acceptance_site_read_manifest
      (identity_hash,session_id,scenario_id,report_id,job_id,scope,purpose,url_hash,mode,attempt,pair_binding_hash,network_performed)
      VALUES(${reportV4AcceptanceSiteReadIdentityHash(invalidScope)},${sessionId},${scenarioId},'report-1','pre-1',
        'admission_page','source',${invalidScope.urlHash},'raw',0,
        ${reportV4AcceptanceSiteReadPairBindingHash(invalidScope)},true)`)
      .rejects.toThrow(/scope_check|check constraint/i);

    const firstOwner = await repository.begin(enhancement("https://source.example/fact", "raw", "question-1", "source-1"));
    await expect(repository.begin(enhancement("https://source.example/fact#same-read", "raw", "question-2", "source-2")))
      .rejects.toThrow(/enh_physical_uidx|unique/i);
    await expect(sql`UPDATE report_v4_acceptance_site_read_manifest SET owner_source_id='other-source'
      WHERE identity_hash=${firstOwner.entry.identityHash}`).rejects.toThrow(/identity and owner are immutable/i);
    await expect(sql`DELETE FROM report_v4_acceptance_site_read_manifest WHERE identity_hash=${firstOwner.entry.identityHash}`)
      .rejects.toThrow(/immutable.*deleted/i);
    await expect(repository.terminalize({ sessionId, scenarioId, identityHash: "f".repeat(64), terminalPhase: "failed" }))
      .rejects.toThrow(/exact started/i);
  }, 120_000);

  it("stores no raw URL, HTML, error, status, or secret-bearing columns", async () => {
    const rows = await sql<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='report_v4_acceptance_site_read_manifest' ORDER BY ordinal_position`;
    const columns = rows.map(({ column_name }) => column_name);
    expect(columns).toEqual([
      "identity_hash", "session_id", "scenario_id", "report_id", "job_id", "scope", "purpose", "url_hash", "mode",
      "attempt", "pair_binding_hash", "owner_question_id", "owner_source_id", "network_performed", "terminal_phase",
      "started_at", "terminal_at"
    ]);
    expect(columns.join(" ")).not.toMatch(/raw_url|canonical_url|html|error|status|secret|token/iu);
  });

  it("rejects begin when the database marker is production", async () => {
    await sql`UPDATE deployment_environment SET profile='production' WHERE singleton=true`;
    await expect(manifestRepo(sql).begin(admission("https://example.com/production", "raw", "page")))
      .rejects.toThrow(/protected staging database marker/i);
    await sql`UPDATE deployment_environment SET profile='staging' WHERE singleton=true`;
  });

  it("replays the complete V36 migration idempotently without losing manifest rows or duplicating its guard", async () => {
    const before = await sql<{ count: number }[]>`SELECT count(*)::integer AS count
      FROM report_v4_acceptance_site_read_manifest`;
    await sql.begin(async (tx) => { for (const statement of V36_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    const after = await sql<{ count: number }[]>`SELECT count(*)::integer AS count
      FROM report_v4_acceptance_site_read_manifest`;
    const triggers = await sql<{ count: number }[]>`SELECT count(*)::integer AS count FROM pg_trigger
      WHERE tgrelid='report_v4_acceptance_site_read_manifest'::regclass
        AND tgname='report_v4_acceptance_site_read_manifest_guard' AND NOT tgisinternal`;
    expect(after[0]?.count).toBe(before[0]?.count);
    expect(triggers[0]?.count).toBe(1);
  }, 120_000);

  it("upgrades an actual V35 database to the V36 manifest without rewriting V35 authority", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(upgradeDatabaseName)}`);
    const upgradeSql = postgres(withDatabase(adminUrl!, upgradeDatabaseName), { max: 1, prepare: false });
    try {
      const v35Migrations = DATABASE_MIGRATIONS.slice(0, -databaseMigrationsAfter(35).length);
      await upgradeSql.begin(async (tx) => { for (const statement of v35Migrations) await tx.unsafe(statement); });
      expect((await upgradeSql`SELECT to_regclass('report_v4_acceptance_site_read_manifest')::text AS name`)[0]?.name).toBeNull();
      expect((await upgradeSql`SELECT to_regclass('report_v4_acceptance_sessions')::text AS name`)[0]?.name)
        .toBe("report_v4_acceptance_sessions");
      await upgradeSql.begin(async (tx) => { for (const statement of V36_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      expect((await upgradeSql`SELECT to_regclass('report_v4_acceptance_site_read_manifest')::text AS name`)[0]?.name)
        .toBe("report_v4_acceptance_site_read_manifest");
    } finally {
      await upgradeSql.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(upgradeDatabaseName)} WITH (FORCE)`);
    }
  }, 120_000);
});

function manifestRepo(sql: ReturnType<typeof postgres>) {
  return createReportV4AcceptanceSiteReadManifestRepository(
    createPostgresReportV4AcceptanceSiteReadManifestStore(sql), environment);
}

function authorityInput() {
  return { sessionId, scenarioId, phase: "final" as const, scenarioKind: "success" as const, reportId: "report-1",
    preAdmissionJobId: "pre-1", enhancementJobId: "enhancement-1" };
}

interface TopologyLineage {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly scenarioKind: "diagnosis_failure" | "question_failure";
  readonly reportId: string;
  readonly preAdmissionJobId: string;
  readonly enhancementJobId: string | null;
}

function topologyInput(lineage: TopologyLineage, phase: "baseline" | "final") {
  return { ...lineage, phase };
}

function admission(rawUrl: string, mode: "raw" | "browser", purpose: "homepage" | "robots" | "sitemap" | "page") {
  return purpose === "page"
    ? { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1", scope: "admission_page" as const,
        purpose, rawUrl, mode, attempt: 0 as const }
    : { sessionId, scenarioId, reportId: "report-1", jobId: "pre-1", scope: "admission_discovery" as const,
        purpose, rawUrl, mode, attempt: 0 as const };
}

function enhancement(rawUrl: string, mode: "raw" | "browser", ownerQuestionId: string, ownerSourceId: string) {
  return { sessionId, scenarioId, reportId: "report-1", jobId: "enhancement-1", scope: "enhancement_source" as const,
    purpose: "source" as const, rawUrl, mode, attempt: 1 as const, ownerQuestionId, ownerSourceId };
}

async function seedCollectingLineage(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES('report-1','https://example.com/','example.com','en','completed')`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES('questions-1','report-1',1,'en','US','candidate','high',false,'v1','v1','profile')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
    VALUES('pre-1','report-1','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
    VALUES('enhancement-1','report-1','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-1','en','v4_diagnosis_enhancement')`;
  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  await ledger.createSession({ sessionId, previewDeploymentId: "dpl-v36", protectedAliasUrl: "https://preview.example",
    webGitSha: "a".repeat(40), workerGitSha: "a".repeat(40) });
  await ledger.createScenario({ sessionId, scenarioId, kind: "success", faultKind: "independent_source_read_failure",
    faultQuestionId: "question-1", faultSourceId: "source-1", expectedFaultOccurrences: 1 });
  await ledger.bindPreAdmissionJob({ sessionId, scenarioId, preAdmissionJobId: "pre-1" });
  await sql`UPDATE report_v4_acceptance_scenarios SET report_id='report-1',enhancement_job_id='enhancement-1'
    WHERE id=${scenarioId} AND session_id=${sessionId}`;
}

async function seedAdmissionOnlyLineage(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES('report-admission-only','https://admission.example/','admission.example','en','completed')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
    VALUES('pre-admission-only','report-admission-only','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','en','v4_pre_admission')`;
  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  await ledger.createSession({ sessionId: admissionOnlySessionId, previewDeploymentId: "dpl-v36-admission",
    protectedAliasUrl: "https://admission-preview.example", webGitSha: "b".repeat(40), workerGitSha: "b".repeat(40) });
  await ledger.createScenario({ sessionId: admissionOnlySessionId, scenarioId: admissionOnlyScenarioId, kind: "success",
    faultKind: "independent_source_read_failure", faultQuestionId: "question-1", faultSourceId: "source-1",
    expectedFaultOccurrences: 1 });
  await ledger.bindPreAdmissionJob({ sessionId: admissionOnlySessionId, scenarioId: admissionOnlyScenarioId,
    preAdmissionJobId: "pre-admission-only" });
  await sql`UPDATE report_v4_acceptance_scenarios SET report_id='report-admission-only'
    WHERE id=${admissionOnlyScenarioId} AND session_id=${admissionOnlySessionId}`;
}

async function seedTopologyLineage(
  sql: ReturnType<typeof postgres>,
  label: string,
  scenarioKind: TopologyLineage["scenarioKind"],
  withEnhancement: boolean
): Promise<TopologyLineage> {
  const session = randomUUID();
  const scenario = randomUUID();
  const report = `report-${label}`;
  const pre = `pre-${label}`;
  const questions = `questions-${label}`;
  const enhancementJobId = withEnhancement ? `enhancement-${label}` : null;
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${report},${`https://${label}.example/`},${`${label}.example`},'en','completed')`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
    VALUES(${pre},${report},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','en','v4_pre_admission')`;
  if (enhancementJobId !== null) {
    await sql`INSERT INTO report_business_question_sets
      (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
      VALUES(${questions},${report},1,'en','US','candidate','high',false,'v1','v1','profile')`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason)
      VALUES(${enhancementJobId},${report},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
        'combined_geo_report_v4',${questions},'en','v4_diagnosis_enhancement')`;
  }
  await sql`INSERT INTO report_v4_acceptance_sessions
    (id,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
    VALUES(${session},${`dpl-${label}`},${`https://preview-${label}.example`},${"c".repeat(40)},${"c".repeat(40)})`;
  const faultKind = scenarioKind;
  await sql`INSERT INTO report_v4_acceptance_scenarios
    (id,session_id,kind,fault_kind,fault_question_id,expected_fault_occurrences,report_id,pre_admission_job_id,enhancement_job_id)
    VALUES(${scenario},${session},${scenarioKind},${faultKind},'question-1',2,${report},${pre},${enhancementJobId})`;
  return { sessionId: session, scenarioId: scenario, scenarioKind, reportId: report,
    preAdmissionJobId: pre, enhancementJobId };
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

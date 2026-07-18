import { createHash, randomUUID } from "node:crypto";
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
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "@/report-v4/report-v4-acceptance-fingerprints";

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

  it("rejects a real trip with its exactly matched ledger event and rejects a completed zero-fault final", async () => {
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
    await expect(loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: completed.sessionId, scenarioId: completed.scenarioId, phase: "final"
    })).rejects.toThrow(/final.*fault.*exact/iu);
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

  it("accepts a real collecting final with the exact recomputed lineage baseline and fault occurrences", async () => {
    const prepared = await seedCompleteQuestionFailureLineage(sql, "valid-final");
    const baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(prepared.scenario);
    for (const occurrence of [1, 2] as const) {
      await prepared.ledger.appendEvent({
        sessionId: prepared.guard.sessionId, scenarioId: prepared.guard.scenarioId, kind: "fault_injection",
        operation: "question_failure", unitId: `${prepared.coreJobId}:question-1`, attempt: occurrence, phase: "consumed",
        details: { fault: "question_failure", occurrence, baselineFingerprint }
      });
    }
    const capability = await armReportV4ProhibitedOperationGuard(prepared.guard, environment);
    await withReportV4ProhibitedOperationGuard(capability, async () => "ok");
    const authority = await loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: prepared.guard.sessionId, scenarioId: prepared.guard.scenarioId, phase: "final"
    });
    expect(authority.ledgerAuthority.events.filter(({ kind }) => kind === "fault_injection")).toHaveLength(2);
    expect(authority.ledgerAuthority.scenario.baselineFingerprint).toBe(baselineFingerprint);
    expect(authority.ledgerAuthority.scenario.storedBaselineFingerprint).toBeNull();
  }, 120_000);

  it("rejects real hash-valid rows with a forged stored/event baseline or foreign artifact lineage", async () => {
    const prepared = await seedCompleteQuestionFailureLineage(sql, "forged-baseline");
    const forgedBaseline = "e".repeat(64);
    await sql`UPDATE report_v4_acceptance_scenarios
      SET baseline_fingerprint=${forgedBaseline} WHERE id=${prepared.guard.scenarioId}`;
    for (const occurrence of [1, 2] as const) {
      await prepared.ledger.appendEvent({
        sessionId: prepared.guard.sessionId, scenarioId: prepared.guard.scenarioId, kind: "fault_injection",
        operation: "question_failure", unitId: `${prepared.coreJobId}:question-1`, attempt: occurrence, phase: "consumed",
        details: { fault: "question_failure", occurrence, baselineFingerprint: forgedBaseline }
      });
    }
    const capability = await armReportV4ProhibitedOperationGuard(prepared.guard, environment);
    await withReportV4ProhibitedOperationGuard(capability, async () => "ok");
    await expect(loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: prepared.guard.sessionId, scenarioId: prepared.guard.scenarioId, phase: "final"
    })).rejects.toThrow(/provenance|lineage.*fingerprint/iu);

    const artifact = await seedLineage(sql, "foreign-artifact");
    const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
    await ledger.appendEvent({
      sessionId: artifact.sessionId, scenarioId: artifact.scenarioId, kind: "html_assembly",
      operation: "core_html", unitId: "artifact-foreign", attempt: 0, phase: "started",
      details: { artifactRevisionId: "artifact-foreign", htmlSha256: "c".repeat(64) }
    });
    await expect(loadReportV4AcceptanceLedgerGuardAuthority(sql, {
      sessionId: artifact.sessionId, scenarioId: artifact.scenarioId, phase: "baseline"
    })).rejects.toThrow(/html.*artifact|scenario.*artifact/iu);
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

async function seedCompleteQuestionFailureLineage(sql: ReturnType<typeof postgres>, label: string) {
  const guard = await seedLineage(sql, label);
  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  const reportId = `report-ledger-guard-${label}`;
  const orderId = `order-ledger-guard-${label}`;
  const coreJobId = `core-ledger-guard-${label}`;
  const siteSnapshotId = `snapshot-ledger-guard-${label}`;
  const questionSetId = `questions-ledger-guard-${label}`;
  const configSnapshotId = `v4-config-${hashText(`config-${label}`)}`;
  const coreArtifactRevisionId = `artifact-ledger-guard-${label}`;
  const siteKey = `${label}.example`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
      candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${siteSnapshotId},${reportId},${siteKey},'completed',now(),now(),${hashText(`collector-${label}`)},
      ${hashText(`snapshot-${label}`)},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,
      neutralization_version,profile_evidence_identity)
    VALUES(${questionSetId},${reportId},1,'en','US','candidate','high',false,'v1','v1','profile')`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason)
    VALUES(${coreJobId},${reportId},${siteSnapshotId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4',${questionSetId},'en','standard')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,
      customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,
      fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
      report_locale,currency,amount_minor,payment_status)
    VALUES(${orderId},${hashText(`checkout-${label}`)},'airwallex',${reportId},${siteSnapshotId},${coreJobId},${siteKey},
      'cipher',${hashText(`email-${label}`)},'v1','recommendation_forensics_v1',${questionSetId},
      'two_stage_geo_report_v4',4,'v1','v1','v1','en','USD',100,'paid')`;
  await sql`UPDATE report_business_question_sets SET order_id=${orderId} WHERE id=${questionSetId}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
      report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${configSnapshotId},${reportId},${orderId},${coreJobId},${configSnapshotId.slice(10)},'model',
      ${hashText(`model-${label}`)},'{}'::jsonb,'report',${hashText(`report-${label}`)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,artifact_contract,status,
      payload_identity_hash,html_sha256,readiness,ready_at,activated_at)
    VALUES(${coreArtifactRevisionId},${reportId},${orderId},${coreJobId},${configSnapshotId},1,'generation',
      'combined_geo_report_v4','active',${hashText(`payload-${label}`)},${hashText(`html-${label}`)},
      '{"htmlCanonical":true}'::jsonb,now(),now())`;
  const scenario = await ledger.bindScenario({
    sessionId: guard.sessionId, scenarioId: guard.scenarioId, reportId, orderId,
    preAdmissionJobId: guard.jobId, coreJobId, enhancementJobId: null, siteSnapshotId, configSnapshotId,
    questionSetId, coreArtifactRevisionId, enhancementArtifactRevisionId: null
  });
  return { guard, ledger, scenario, coreJobId };
}

function restoreEnvironment(): void {
  for (const [name, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function hashText(value: string): string { return createHash("sha256").update(value).digest("hex"); }

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "@/report-v4/report-v4-acceptance-fingerprints";
import { computeReportV4QuestionTerminalCheckpointFingerprint } from "@/report-v4/report-v4-acceptance-checkpoint-fingerprints";
import { closeDatabase, DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction,
  loadReportV4AcceptanceAuthorityPhaseSnapshot,
  persistReportV4AcceptanceAuthorityPhaseSnapshot
} from "./report-v4-acceptance-authority-phase-snapshot";
import {
  createReportV4PageSummaryPostgresDatabase,
  createPostgresReportV4PageSummaryStore,
  createReportV4PageSummaryRepository
} from "./report-v4-page-summaries";
import {
  createReportV4ArtifactPersistencePostgresDatabase,
  createPostgresReportV4ArtifactPersistenceStore,
  persistReportV4ArtifactPayload
} from "./report-v4-artifact-persistence";
import {
  createPostgresReportV4AcceptanceLedgerStore,
  createReportV4AcceptanceLedgerRepository,
  type ReportV4AcceptanceScenario
} from "./report-v4-acceptance-ledger";
import {
  createPostgresReportV4AcceptanceSiteReadManifestStore,
  createReportV4AcceptanceSiteReadManifestRepository
} from "./report-v4-site-read-manifest";
import { createPostgresReportV4WebsiteSynthesisCheckpointRepository } from "./report-v4-website-synthesis-checkpoints";
import { createReportV4QuestionCheckpointRepository } from "./report-v4-question-checkpoints";
import {
  armReportV4ProhibitedOperationGuard,
  runReportV4GuardedOperation,
  withReportV4ProhibitedOperationGuard
} from "./report-v4-prohibited-operation-guard";

const execFileAsync = promisify(execFile);
const WORKER_SHA = "a".repeat(40);
const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as NodeJS.ProcessEnv;
const previousEnvironment = { DATABASE_URL: process.env.DATABASE_URL, VERCEL_ENV: process.env.VERCEL_ENV,
  OGC_DEPLOYMENT_PROFILE: process.env.OGC_DEPLOYMENT_PROFILE, COMMERCE_MODE: process.env.COMMERCE_MODE,
  OGC_DATABASE_POOL_SIZE: process.env.OGC_DATABASE_POOL_SIZE };

describe("Report V4 complete authority phase PostgreSQL 17 acceptance", () => {
  const databaseName = `ogc_v4_phase_complete_${randomUUID().replaceAll("-", "")}`;
  let adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim() ?? "";
  let containerName: string | null = null;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  let writer: postgres.Sql;

  beforeAll(async () => {
    if (!adminUrl) {
      const disposable = await startPostgres17();
      adminUrl = disposable.adminUrl;
      containerName = disposable.containerName;
    }
    admin = postgres(adminUrl, { max: 1, prepare: false });
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const databaseUrl = withDatabase(adminUrl, databaseName);
    sql = postgres(databaseUrl, { max: 8, prepare: false });
    writer = postgres(databaseUrl, { max: 2, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    await sql`CREATE TABLE ogc_schema_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),
      version integer NOT NULL CHECK(version>0),updated_at timestamptz NOT NULL DEFAULT now())`;
    await sql`INSERT INTO ogc_schema_state(singleton,version) VALUES(true,${DATABASE_SCHEMA_VERSION})`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.VERCEL_ENV = "preview";
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.COMMERCE_MODE = "test";
    process.env.OGC_DATABASE_POOL_SIZE = "2";
    expect((await sql<{ version: string }[]>`SELECT current_setting('server_version') version`)[0]?.version).toMatch(/^17\./u);
  }, 180_000);

  afterAll(async () => {
    await closeDatabase();
    if (writer) await writer.end({ timeout: 5 });
    if (sql) await sql.end({ timeout: 5 });
    if (admin) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    }
    restoreEnvironment();
    if (containerName) await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 30_000 });
  }, 120_000);

  // @requirement GEO-V4-ACCEPT-01
  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-PDF-01
  // @requirement GEO-V4-LEGACY-01
  it("captures one typed RR/RO payload with all seven database authority slots and accepts advancing clocks", async () => {
    const seeded = await seedScenario(sql, "typed");
    const baseline = await load(seeded, "baseline");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await load(seeded, "baseline");
    expect(baseline.transactionProfile).toEqual({ isolation: "repeatable read", readOnly: true });
    expect(Object.keys(baseline.authorities).sort()).toEqual([
      "artifact_combined_payload_integrity", "ledger_authority", "page_summary_integrity",
      "prohibited_operation_guard_authority", "site_read_manifest", "site_snapshot_pages", "zero_database_effect_counts"
    ]);
    expect(Object.values(baseline.authorities)).toHaveLength(7);
    expect(Date.parse(second.capturedAt)).toBeGreaterThan(Date.parse(baseline.capturedAt));
  }, 120_000);

  it("rejects a completed V38 checkpoint whose persisted output payload and hash disagree", async () => {
    const seeded = await seedScenario(sql, "v38-output-drift");
    await sql.unsafe(`ALTER TABLE report_v4_website_synthesis_checkpoints
      DISABLE TRIGGER report_v4_website_synthesis_checkpoints_guard`);
    try {
      await sql`UPDATE report_v4_website_synthesis_checkpoints SET output_hash=${"f".repeat(64)}
        WHERE core_job_id=${seeded.core} AND state='completed'`;
    } finally {
      await sql.unsafe(`ALTER TABLE report_v4_website_synthesis_checkpoints
        ENABLE TRIGGER report_v4_website_synthesis_checkpoints_guard`);
    }
    await expect(load(seeded, "baseline")).rejects.toThrow(/V38|website checkpoint|output.*hash|payload.*hash/iu);
  }, 120_000);

  it("keeps one RR capture stable across a concurrently committed forbidden row and rejects a later load", async () => {
    const seeded = await seedScenario(sql, "concurrent");
    const capture = loadReportV4AcceptanceAuthorityPhaseSnapshot(sql as never, identity(seeded, "baseline"));
    await expect(withReportV4ProhibitedOperationGuard(seeded.guard, () =>
      runReportV4GuardedOperation({ guardSite: "qualification", delegate: vi.fn() })))
      .rejects.toThrow(/blocked prohibited/iu);
    await expect(capture).resolves.toMatchObject({ authorities: {
      prohibited_operation_guard_authority: { counters: expect.arrayContaining([expect.objectContaining({ attemptCount: 0 })]) }
    } });
    await expect(load(seeded, "baseline")).rejects.toThrow(/baseline.*zero|prohibited/iu);
  }, 120_000);

  it("persists baseline then final, replays exactly, rejects conflicts/order violations, and survives sealing", async () => {
    const seeded = await seedScenario(sql, "persistence");
    const baseline = await load(seeded, "baseline");
    const baselineStored = await persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(seeded, "baseline", baseline));
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(seeded, "baseline", baseline))).resolves.toEqual(baselineStored);

    const conflict = structuredClone(baseline);
    conflict.websiteCheckpoint.outputHash = "f".repeat(64);
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(seeded, "baseline", conflict))).rejects.toThrow(/conflict|replay|stale|exact payload|loader/iu);
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      { ...persistenceInput(seeded, "baseline", baseline), workerGitSha: "b".repeat(40) }))
      .rejects.toThrow(/worker|collecting|stale/iu);

    await prepareFinalCheckpoints(sql, seeded);
    const baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(seeded.boundScenario);
    for (const occurrence of [1, 2] as const) await seeded.ledger.appendEvent({ sessionId: seeded.session,
      scenarioId: seeded.scenario, kind: "fault_injection", operation: "question_failure",
      unitId: `${seeded.core}:${seeded.faultQuestionId}`, attempt: occurrence, phase: "consumed",
      details: { fault: "question_failure", occurrence, baselineFingerprint } });
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(seeded, "baseline", baseline))).rejects.toThrow(/head|stale|collecting authority/iu);
    await withReportV4ProhibitedOperationGuard(seeded.guard, async () => "ok");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const final = await load(seeded, "final");
    expect(Date.parse(final.capturedAt)).toBeGreaterThan(Date.parse(baseline.capturedAt));
    const finalStored = await persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(seeded, "final", final));
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(seeded, "final", final))).resolves.toEqual(finalStored);
    await expect(sql`UPDATE report_v4_acceptance_authority_phase_snapshots SET worker_git_sha=${"c".repeat(40)}
      WHERE session_id=${seeded.session} AND scenario_id=${seeded.scenario} AND phase='baseline'`)
      .rejects.toThrow(/append-only|immutable/iu);
    await expect(sql`DELETE FROM report_v4_acceptance_authority_phase_snapshots
      WHERE session_id=${seeded.session} AND scenario_id=${seeded.scenario} AND phase='final'`)
      .rejects.toThrow(/append-only|immutable/iu);

    await seeded.ledger.sealScenario({ sessionId: seeded.session, scenarioId: seeded.scenario,
      baselineFingerprint, finalFingerprint: final.commerce.fingerprint });
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const reloadedBaseline = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx as never,
        identity(seeded, "baseline"));
      const reloadedFinal = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx as never,
        identity(seeded, "final"));
      expect(reloadedBaseline).toEqual(baselineStored);
      expect(reloadedFinal).toEqual(finalStored);
      expect(reloadedBaseline?.payloadHash).toBe(hash(stable(reloadedBaseline.payload)));
      expect(reloadedFinal?.commerceFingerprint).toBe(reloadedFinal?.payload.commerce.fingerprint);
    });
  }, 120_000);

  it("rejects final before baseline and baseline after final through the public persistence boundary", async () => {
    const finalFirst = await seedScenario(sql, "final-first");
    await prepareFinalCheckpoints(sql, finalFirst);
    const finalFirstFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(finalFirst.boundScenario);
    for (const occurrence of [1, 2] as const) await finalFirst.ledger.appendEvent({ sessionId: finalFirst.session,
      scenarioId: finalFirst.scenario, kind: "fault_injection", operation: "question_failure",
      unitId: `${finalFirst.core}:${finalFirst.faultQuestionId}`, attempt: occurrence, phase: "consumed",
      details: { fault: "question_failure", occurrence, baselineFingerprint: finalFirstFingerprint } });
    await withReportV4ProhibitedOperationGuard(finalFirst.guard, async () => "ok");
    const finalPayload = await load(finalFirst, "final");
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(finalFirst, "final", finalPayload))).rejects.toThrow(/persisted baseline|requires.*baseline/iu);

    const ordered = await seedScenario(sql, "baseline-after-final");
    const baseline = await load(ordered, "baseline");
    await persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never, persistenceInput(ordered, "baseline", baseline));
    await prepareFinalCheckpoints(sql, ordered);
    const fingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(ordered.boundScenario);
    for (const occurrence of [1, 2] as const) await ordered.ledger.appendEvent({ sessionId: ordered.session,
      scenarioId: ordered.scenario, kind: "fault_injection", operation: "question_failure",
      unitId: `${ordered.core}:${ordered.faultQuestionId}`, attempt: occurrence, phase: "consumed",
      details: { fault: "question_failure", occurrence, baselineFingerprint: fingerprint } });
    await withReportV4ProhibitedOperationGuard(ordered.guard, async () => "ok");
    const final = await load(ordered, "final");
    await persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never, persistenceInput(ordered, "final", final));
    await expect(persistReportV4AcceptanceAuthorityPhaseSnapshot(sql as never,
      persistenceInput(ordered, "baseline", { ...baseline, capturedAt: final.capturedAt })))
      .rejects.toThrow(/conflict|replay|capture|stale/iu);
  }, 120_000);

  function load(seeded: Seeded, phase: "baseline" | "final") {
    return loadReportV4AcceptanceAuthorityPhaseSnapshot(sql as never, identity(seeded, phase));
  }
});

interface Seeded {
  session: string; scenario: string; report: string; order: string; snapshot: string; pre: string; core: string; config: string;
  questions: string; artifact: string; faultQuestionId: string; guard: Awaited<ReturnType<typeof armReportV4ProhibitedOperationGuard>>;
  ledger: ReturnType<typeof createReportV4AcceptanceLedgerRepository>;
  boundScenario: ReportV4AcceptanceScenario;
}

async function seedScenario(sql: postgres.Sql, label: string): Promise<Seeded> {
  const suffix = `${label}-${randomUUID().replaceAll("-", "")}`;
  const session = randomUUID(), scenario = randomUUID(), report = `report-${suffix}`, order = `order-${suffix}`;
  const snapshot = `snapshot-${suffix}`, page = `page-${suffix}`, pre = `pre-${suffix}`, core = `core-${suffix}`;
  const questions = `questions-${suffix}`, artifact = `artifact-${suffix}`, access = `access-${suffix}`, credit = `credit-${suffix}`;
  const configHash = hash(`config-${suffix}`), config = `v4-config-${configHash}`, siteKey = `${suffix}.example`;
  const targetUrl = `https://${siteKey}/`, retainedText = `Complete retained evidence for ${label}.`, contentHash = hash(retainedText);
  const faultQuestionId = `${questions}-q2`;
  const chunks = [{ order: 1, summary: `Summary for ${label}.`, sourceLocations: [{ locationId: `${page}:0-8`, startOffset: 0, endOffset: 8 }] }];
  const snapshotPages = [{ id: page, ordinal: 1, normalizedUrl: targetUrl, analyzable: true,
    readMode: "direct_readable", summary: "Home page", retainedText, contentHash, exclusionReason: null }];
  const snapshotHash = hash(JSON.stringify({ status: "completed", candidateUrlCount: 1, pages: snapshotPages }));

  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${report},${targetUrl},${siteKey},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,collector_config_identity_hash)
    VALUES(${snapshot},${report},${siteKey},'collecting',now(),${hash(`collector-${suffix}`)})`;
  await sql`INSERT INTO report_v4_site_snapshot_pages(id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,
    retained_cleaned_text,content_hash) VALUES(${page},${snapshot},1,${targetUrl},true,'direct_readable','Home page',${retainedText},${contentHash})`;
  await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),content_identity_hash=${snapshotHash},
    candidate_url_count=1,analyzable_page_count=1,excluded_page_count=0 WHERE id=${snapshot}`;
  const summaryRepo = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
    createReportV4PageSummaryPostgresDatabase(sql)));
  const persistedSummary = await summaryRepo.persist({ reportId: report, snapshotId: snapshot, pageId: page, url: targetUrl,
    contentHash, readability: "direct_readable", sourceLength: retainedText.length, output: { chunks } });
  await insertJob(sql, pre, report, null, null, "v4_pre_admission", null);
  const paidAt = new Date(Date.now() - 3_600_000);
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,
    customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,
    recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,
    payment_status,fulfillment_status,refund_status,delivery_status,paid_at,delivery_deadline_at,fulfilled_at)
    VALUES(${order},${hash(`checkout-${suffix}`)},'airwallex',${report},${snapshot},${siteKey},'encrypted',${hash(`email-${suffix}`)},'v1',
      'recommendation_forensics_v1','two_stage_geo_report_v4',4,'catalog-v4','terms-v4','refund-v4','en','USD',100,
      'paid','completed','not_required','delivered',${paidAt},${new Date(paidAt.getTime()+86_400_000)},now())`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining,expires_at)
    VALUES(${access},'prefix',${hash(`access-${suffix}`)},${order},'exhausted',0,now()+interval '1 day')`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,idempotency_key,payment_order_id,credits,status,reserved_at,settled_at)
    VALUES(${credit},${access},${report},${`credit-${suffix}`},${order},1,'settled',now()-interval '50 minutes',now()-interval '40 minutes')`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,
    generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${questions},${report},${order},1,'en','US','candidate','high','v1','v1','profile')`;
  for (const ordinal of [1, 2, 3]) await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,
    generated_text,private_text,neutral_public_text,neutral_content_hash) VALUES(${`${questions}-q${ordinal}`},${questions},${ordinal},
      ${["core_service_discovery","customer_region_fit","purchase_delivery_risk"][ordinal-1]!},${`Question ${ordinal}?`},
      ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${String(ordinal).repeat(64)})`;
  await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${"e".repeat(64)},neutral_content_hash=${"f".repeat(64)},
    payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id=${questions}`;
  await insertJob(sql, core, report, snapshot, questions, "standard", credit);
  await sql`UPDATE credit_ledger SET job_id=${core} WHERE id=${credit}`;
  await sql`UPDATE payment_orders SET fulfillment_job_id=${core},business_question_set_id=${questions} WHERE id=${order}`;
  await sql`INSERT INTO job_dispatch_outbox(id,job_id,tier,schema_version,state,attempts,published_at) VALUES
    (${`dispatch-${pre}`},${pre},'deep',1,'published',1,now()),(${`dispatch-${core}`},${core},'deep',1,'published',1,now())`;
  await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,
    model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${config},${report},${order},${core},${configHash},'model-v4',${hash(`model-${suffix}`)},'{}'::jsonb,
      'report-v4',${hash(`profile-${suffix}`)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,
    artifact_contract,status,payload_identity_hash) VALUES(${artifact},${report},${order},${core},${config},'generation',1,
      'combined_geo_report_v4','pending',${`v4-pending:${core}:${artifact}`})`;
  const reportPayload = combinedPayload(report, artifact, questions, targetUrl);
  const artifactStore = createPostgresReportV4ArtifactPersistenceStore(createReportV4ArtifactPersistencePostgresDatabase(sql));
  await persistReportV4ArtifactPayload({ report: reportPayload, canonicalHtml: '<main data-report-version="4">ok</main>',
    artifactRevisionId: artifact, reportId: report, orderId: order, jobId: core, coreJobId: core, questionSetId: questions,
    configSnapshotId: config, siteSnapshotId: snapshot, revisionKind: "generation", sourceArtifactRevisionId: null }, artifactStore);
  await sql`UPDATE report_artifact_revisions SET status='active',ready_at=now(),activated_at=now() WHERE id=${artifact}`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${artifact} WHERE id=${report}`;

  const checkpointRepo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(sql);
  const checkpointIdentity = { reportId: report, orderId: order, coreJobId: core, configSnapshotId: config,
    siteSnapshotId: snapshot, operationId: "website-synthesis", profileId: "model-v4",
    inputIdentityHash: hash(`website-input-${suffix}`), pageSummaryIdentitySetHash: hash(JSON.stringify([persistedSummary.identityHash])),
    pageSummaryCount: 1 };
  await checkpointRepo.initialize(checkpointIdentity);
  await checkpointRepo.claim({ ...checkpointIdentity, workerId: `worker-${label}`, leaseMs: 60_000 });
  await checkpointRepo.beginProviderCall({ ...checkpointIdentity, workerId: `worker-${label}` });
  await checkpointRepo.complete({ ...checkpointIdentity, workerId: `worker-${label}`,
    output: { summary: "Summary", strengths: ["Strength"], gaps: ["Gap"], actions: ["Action"] } });

  const ledger = createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
  await ledger.createSession({ sessionId: session, previewDeploymentId: `dpl-${label}`,
    protectedAliasUrl: `https://${label}.preview.example`, webGitSha: WORKER_SHA, workerGitSha: WORKER_SHA });
  await ledger.createScenario({ sessionId: session, scenarioId: scenario, kind: "question_failure",
    faultKind: "question_failure", faultQuestionId, expectedFaultOccurrences: 2 });
  const boundScenario = await ledger.bindScenario({ sessionId: session, scenarioId: scenario, reportId: report, orderId: order,
    preAdmissionJobId: pre, coreJobId: core, enhancementJobId: null, siteSnapshotId: snapshot, configSnapshotId: config,
    questionSetId: questions, coreArtifactRevisionId: artifact, enhancementArtifactRevisionId: null });
  const manifest = createReportV4AcceptanceSiteReadManifestRepository(
    createPostgresReportV4AcceptanceSiteReadManifestStore(sql), environment);
  const read = await manifest.begin({ sessionId: session, scenarioId: scenario, reportId: report, jobId: pre,
    scope: "admission_page", purpose: "page", rawUrl: targetUrl, mode: "raw", attempt: 0 });
  await manifest.terminalize({ sessionId: session, scenarioId: scenario, identityHash: read.entry.identityHash, terminalPhase: "completed" });
  await sql`INSERT INTO payment_events(id,provider,provider_event_id,event_type,order_id,provider_created_at,processed_at,
    processing_status,payload_hash,selected_fields) VALUES(${`payment-event-${suffix}`},'airwallex',${`provider-${suffix}`},
    'payment_intent.succeeded',${order},${paidAt},now(),'processed',${hash(`payment-${suffix}`)},'{}'::jsonb)`;
  await sql`INSERT INTO email_deliveries(id,order_id,report_id,template_type,template_version,locale,recipient_ref,provider,
    provider_email_id,business_idempotency_key,state,attempts,sent_at,delivered_at) VALUES
    (${`payment-email-${suffix}`},${order},${report},'payment_confirmed','v4','en','recipient','resend',${`provider-payment-${suffix}`},
      ${`payment-idem-${suffix}`},'delivered',1,now(),now()),
    (${`report-email-${suffix}`},${order},${report},'report_ready','v4','en','recipient','resend',${`provider-report-${suffix}`},
      ${`report-idem-${suffix}`},'delivered',1,now(),now())`;
  await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
    VALUES(${`token-${suffix}`},${report},'v4',${hash(`token-${suffix}`)},'combined_geo_report_v4',now()+interval '1 day')`;
  const guard = await armReportV4ProhibitedOperationGuard({ sessionId: session, scenarioId: scenario, jobId: core,
    workerGitSha: WORKER_SHA }, environment);
  return { session, scenario, report, order, snapshot, pre, core, config, questions, artifact, faultQuestionId, guard, ledger, boundScenario };
}

async function prepareFinalCheckpoints(sql: postgres.Sql, seeded: Seeded): Promise<void> {
  const questionRepo = createReportV4QuestionCheckpointRepository(((strings: TemplateStringsArray, ...values: readonly unknown[]) =>
    sql(strings, ...values.map((value) => typeof value === "string" && /^[\[{]/u.test(value)
      ? sql.json(JSON.parse(value) as never) : value) as never)) as never);
  const checkpoints = await questionRepo.initialize({ jobId: seeded.core, checkpoints: ([1, 2, 3] as const).map((ordinal) => {
    const questionId = `${seeded.questions}-q${ordinal}`;
    const questionIdentityHash = hash(`question-identity-${seeded.core}-${ordinal}`);
    const modelConfigIdentityHash = hash(`model-config-${seeded.config}`);
    const inputIdentityHash = hash(`question-input-${seeded.core}-${ordinal}`);
    const identityHash = hash(JSON.stringify({ reportId: seeded.report, jobId: seeded.core,
      questionSetId: seeded.questions, snapshotId: seeded.snapshot, modelConfigIdentityHash, order: ordinal,
      questionId, questionIdentityHash, inputIdentityHash }));
    return { identityHash, reportId: seeded.report, jobId: seeded.core, questionSetId: seeded.questions,
      questionId, snapshotId: seeded.snapshot, ordinal, questionIdentityHash, modelConfigIdentityHash, inputIdentityHash };
  }) });
  for (const checkpoint of checkpoints) {
    let terminal;
    if (checkpoint.ordinal === 2) {
      terminal = await questionRepo.markUnavailable({ identityHash: checkpoint.identityHash, providerCallCount: 0 });
    } else {
      await questionRepo.recordProviderCall({ identityHash: checkpoint.identityHash, expectedProviderCallCount: 0 });
      const answerPayload = { order: checkpoint.ordinal, questionId: checkpoint.questionId,
        questionText: `Question ${checkpoint.ordinal}?`, status: "answered" as const, answer: `Answer ${checkpoint.ordinal}.` };
      const sourcePayload = [{ questionId: checkpoint.questionId, sourceId: `source-${checkpoint.ordinal}`,
        title: `Source ${checkpoint.ordinal}`, canonicalUrl: `https://source-${checkpoint.ordinal}.example/evidence`,
        citedText: `Evidence ${checkpoint.ordinal}.`, retrievalStatus: "not_checked" as const }];
      terminal = await questionRepo.saveAnswered({ identityHash: checkpoint.identityHash, providerCallCount: 1, answerPayload,
        sourcePayload, answerContentHash: hash(JSON.stringify({ answerPayload, sourcePayload })) });
    }
    await seeded.ledger.appendEvent({ sessionId: seeded.session, scenarioId: seeded.scenario, kind: "checkpoint_terminal",
      operation: "question_answer", unitId: terminal.identityHash, attempt: 0, phase: "observed",
      details: { checkpointHash: computeReportV4QuestionTerminalCheckpointFingerprint(terminal), state: terminal.state } });
  }
}

async function insertJob(sql: postgres.Sql, id: string, reportId: string, snapshotId: string | null,
  questionSetId: string | null, reason: "v4_pre_admission" | "standard", credit: string | null): Promise<void> {
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,
    recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,
    checkpoint_revision,phase_attempt,resume_generation,progress,planned_pages,successful_pages,failed_pages,attempts,max_attempts,
    credit_reservation_id) VALUES(${id},${reportId},${snapshotId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4',${questionSetId},'en',${reason},'completed','completed','terminalization',1,0,0,100,1,1,0,1,3,${credit})`;
}

function combinedPayload(reportId: string, artifactRevisionId: string, questions: string, targetUrl: string) {
  return { version: 4, artifactContract: "combined_geo_report_v4", reportId, artifactRevisionId, targetUrl, locale: "en",
    generatedAt: "2026-07-17T00:00:00.000Z", status: "completed_limited", websiteSynthesis: {
      summary: "Summary", strengths: [], gaps: [], actions: [] }, questions: [1, 2, 3].map((ordinal) => ordinal === 2
      ? { order: ordinal, questionId: `${questions}-q${ordinal}`, questionText: `Question ${ordinal}?`, status: "unavailable", answer: null, sources: [] }
      : { order: ordinal, questionId: `${questions}-q${ordinal}`, questionText: `Question ${ordinal}?`, status: "answered",
        answer: `Answer ${ordinal}.`, sources: [{ questionId: `${questions}-q${ordinal}`, sourceId: `source-${ordinal}`,
          title: `Source ${ordinal}`, canonicalUrl: `https://source-${ordinal}.example/evidence`, citedText: `Evidence ${ordinal}.`,
          retrievalStatus: "not_checked" }] }) };
}

function identity(seeded: Seeded, phase: "baseline" | "final") {
  return { sessionId: seeded.session, scenarioId: seeded.scenario, phase };
}
function persistenceInput(seeded: Seeded, phase: "baseline" | "final", payload: unknown) {
  return { ...identity(seeded, phase), workerGitSha: WORKER_SHA, payload };
}

async function startPostgres17(): Promise<{ adminUrl: string; containerName: string }> {
  const port = await freePort();
  const containerName = `ogc-v4-phase-pg-${randomUUID().slice(0, 8)}`;
  await execFileAsync("docker", ["run", "--rm", "-d", "--name", containerName, "-e", "POSTGRES_PASSWORD=postgres",
    "-p", `127.0.0.1:${port}:5432`, "postgres:17"], { timeout: 120_000 });
  const adminUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const probe = postgres(adminUrl, { max: 1, connect_timeout: 1, prepare: false });
    try { await probe`SELECT 1`; await probe.end({ timeout: 1 }); return { adminUrl, containerName }; }
    catch (error) { lastError = error; await probe.end({ timeout: 1 }).catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 30_000 }).catch(() => undefined);
  throw lastError;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => { const server = createServer(); server.unref(); server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0; server.close((error) => error ? reject(error) : resolve(port)); }); });
}
function restoreEnvironment(): void { for (const [key, value] of Object.entries(previousEnvironment)) {
  if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
  return JSON.stringify(value); }

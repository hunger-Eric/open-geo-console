import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS, V35_DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4AcceptanceLedgerStore,
  createReportV4AcceptanceLedgerRepository,
  type AppendReportV4AcceptanceEventInput,
  type BindReportV4AcceptanceScenarioInput,
  type CreateReportV4AcceptanceScenarioInput
} from "./report-v4-acceptance-ledger";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const environment = { VERCEL_ENV: "preview", OGC_DEPLOYMENT_PROFILE: "staging", COMMERCE_MODE: "test" } as NodeJS.ProcessEnv;

// @requirement GEO-V4-ACCEPT-01
suite("Report V4 protected-Staging acceptance ledger PostgreSQL", () => {
  const databaseName = `ogc_v35_ledger_${randomUUID().replaceAll("-", "")}`;
  const upgradeDatabaseName = `ogc_v35_upgrade_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 12, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
  }, 120_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(upgradeDatabaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("serializes concurrent append, preserves the hash chain, and enforces exact idempotency", async () => {
    const repository = repo(sql);
    const sessionId = "11111111-1111-4111-8111-111111111111";
    const scenarioId = "21111111-1111-4111-8111-111111111111";
    await repository.createSession(session(sessionId));
    await repository.createScenario(scenario(sessionId, scenarioId, "success"));
    const inputs = Array.from({ length: 16 }, (_, index) => modelEvent(sessionId, scenarioId, `page-${index + 1}`, index + 1));
    const appends = await Promise.all(inputs.map((input) => repository.appendEvent(input)));
    expect(appends.every(({ inserted }) => inserted)).toBe(true);
    expect(new Set(appends.map(({ event }) => event.sequence)).size).toBe(16);
    const ordered = await repository.loadEvents(sessionId);
    expect(ordered.map(({ sequence }) => sequence)).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    expect(ordered[0]!.prevHash).toBe("0".repeat(64));
    expect(ordered[0]!.occurredAtCanonical).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u);
    expect(ordered[0]!.eventHash).toBe(recomputeEventHash(ordered[0]!));
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!.prevHash).toBe(ordered[index - 1]!.eventHash);
      expect(ordered[index]!.eventHash).toMatch(/^[a-f0-9]{64}$/u);
      expect(ordered[index]!.eventHash).toBe(recomputeEventHash(ordered[index]!));
    }
    const before = await repository.loadSession(sessionId);
    const duplicate = await repository.appendEvent(inputs[0]!);
    expect(duplicate).toEqual({ event: ordered[0], inserted: false });
    expect((await repository.loadSession(sessionId))?.headSequence).toBe(before?.headSequence);

    const claimedStarted = modelEvent(sessionId, scenarioId, "restart-safe-page", 17);
    const competingClaims = await Promise.all([
      repository.appendEvent(claimedStarted),
      repository.appendEvent(claimedStarted)
    ]);
    expect(competingClaims.map(({ inserted }) => inserted).sort()).toEqual([false, true]);
    expect(competingClaims[0]!.event).toEqual(competingClaims[1]!.event);
    const restartedRepository = repo(sql);
    expect(await restartedRepository.appendEvent(claimedStarted)).toEqual({ event: competingClaims[0]!.event, inserted: false });
    await expect(restartedRepository.appendEvent({ ...claimedStarted, attempt: 2, phase: "completed" }))
      .rejects.toThrow(/same unit and attempt/i);
    const completed = { ...claimedStarted, phase: "completed" as const };
    expect((await restartedRepository.appendEvent(completed)).inserted).toBe(true);
    expect((await restartedRepository.appendEvent(completed)).inserted).toBe(false);
    await expect(restartedRepository.appendEvent({ ...claimedStarted, phase: "failed" }))
      .rejects.toThrow(/same unit and attempt/i);
    const first = inputs[0] as Extract<AppendReportV4AcceptanceEventInput, { kind: "model_operation" }>;
    await expect(repository.appendEvent({
      ...first, details: { ...first.details, inputTokens: 999 }
    })).rejects.toThrow(/idempotency.*conflict/i);
  }, 120_000);

  it("rejects event tampering, entity rebinding, and append after failed state", async () => {
    const repository = repo(sql);
    const sessionId = "12222222-2222-4222-8222-222222222222";
    const scenarioId = "22222222-2222-4222-8222-222222222222";
    await repository.createSession(session(sessionId));
    await repository.createScenario(scenario(sessionId, scenarioId, "question_failure"));
    const { event } = await repository.appendEvent(modelEvent(sessionId, scenarioId, "question-1", 1));
    await expect(sql`UPDATE report_v4_acceptance_events SET details='{}'::jsonb WHERE idempotency_key=${event.idempotencyKey}`)
      .rejects.toThrow(/append-only|immutable/i);
    await expect(sql`DELETE FROM report_v4_acceptance_events WHERE idempotency_key=${event.idempotencyKey}`)
      .rejects.toThrow(/append-only|immutable/i);
    await repository.failSession(sessionId);
    await expect(repository.appendEvent(modelEvent(sessionId, scenarioId, "question-2", 2)))
      .rejects.toThrow(/collecting/i);
  }, 120_000);

  it("seals only three exact terminal scenarios and rejects later append or lineage rebinding", async () => {
    const repository = repo(sql);
    const sessionId = "13333333-3333-4333-8333-333333333333";
    await repository.createSession(session(sessionId));
    for (const [index, kind] of (["success", "diagnosis_failure", "question_failure"] as const).entries()) {
      const scenarioId = `23333333-3333-4333-8333-33333333333${index}`;
      const label = `sealed-${index}`;
      await seedV4Lineage(sql, label);
      await repository.createScenario(scenario(sessionId, scenarioId, kind));
      const binding = lineage(sessionId, scenarioId, label);
      const preAdmission = { sessionId, scenarioId, preAdmissionJobId: binding.preAdmissionJobId };
      expect((await repository.bindPreAdmissionJob(preAdmission)).preAdmissionJobId).toBe(binding.preAdmissionJobId);
      expect((await repository.bindPreAdmissionJob(preAdmission)).preAdmissionJobId).toBe(binding.preAdmissionJobId);
      expect((await repository.loadCollectingScenarioByJob({ sessionId, jobId: binding.preAdmissionJobId }))?.scenarioId).toBe(scenarioId);
      await expect(repository.bindPreAdmissionJob({ ...preAdmission, preAdmissionJobId: `other-${label}` }))
        .rejects.toThrow(/rebind/i);
      await repository.bindScenario(binding);
      expect((await repository.loadCollectingScenarioByJob({ sessionId, jobId: binding.coreJobId }))?.scenarioId).toBe(scenarioId);
      if (binding.enhancementJobId) {
        expect((await repository.loadCollectingScenarioByJob({ sessionId, jobId: binding.enhancementJobId }))?.scenarioId).toBe(scenarioId);
      }
      await expect(repository.bindScenario({ ...binding, reportId: `other-${label}` }))
        .rejects.toThrow(/rebind|foreign key|not present/i);
      await repository.sealScenario({ sessionId, scenarioId, baselineFingerprint: hash(`before-${label}`), finalFingerprint: hash(`after-${label}`) });
    }
    const sealed = await repository.sealSession(sessionId);
    expect(sealed.state).toBe("sealed");
    await expect(repository.appendEvent(modelEvent(sessionId, "23333333-3333-4333-8333-333333333330", "late", 1)))
      .rejects.toThrow(/collecting/i);
    await expect(sql`UPDATE report_v4_acceptance_sessions SET web_git_sha=${"c".repeat(40)} WHERE id=${sessionId}`)
      .rejects.toThrow(/terminal|immutable/i);
  }, 120_000);

  it("rejects direct writes when the database marker is production", async () => {
    const store = createPostgresReportV4AcceptanceLedgerStore(sql);
    await expect(store.createSession({ ...session("14444444-4444-4444-8444-444444444444"), workerGitSha: "b".repeat(40) }))
      .rejects.toThrow(/sha_check|check constraint/i);
    await sql`UPDATE deployment_environment SET profile='production' WHERE singleton=true`;
    await expect(store.createSession(session("14444444-4444-4444-8444-444444444444")))
      .rejects.toThrow(/staging database marker/i);
    await sql`UPDATE deployment_environment SET profile='staging' WHERE singleton=true`;
  });

  it("defers a successful scenario fault source to one immutable collecting-state binding", async () => {
    const repository = repo(sql);
    const sessionId = "16666666-6666-4666-8666-666666666666";
    const successScenarioId = "26666666-6666-4666-8666-666666666661";
    const diagnosisScenarioId = "26666666-6666-4666-8666-666666666662";
    const questionScenarioId = "26666666-6666-4666-8666-666666666663";
    const label = "deferred-source";
    await repository.createSession(session(sessionId));
    await seedV4Lineage(sql, label);
    const created = await repository.createScenario({
      sessionId, scenarioId: successScenarioId, kind: "success", faultKind: "independent_source_read_failure",
      faultQuestionId: "question-1", expectedFaultOccurrences: 1
    });
    expect(created.faultSourceId).toBeNull();
    await repository.bindScenario(lineage(sessionId, successScenarioId, label));
    const terminal = { sessionId, scenarioId: successScenarioId,
      baselineFingerprint: hash("deferred-before"), finalFingerprint: hash("deferred-after") };
    await expect(repository.sealScenario(terminal)).rejects.toThrow(/bound independent fault source/i);
    const sourceBinding = { sessionId, scenarioId: successScenarioId, sourceId: "source-deferred" };
    expect((await repository.bindFaultSource(sourceBinding)).faultSourceId).toBe(sourceBinding.sourceId);
    expect((await repository.bindFaultSource(sourceBinding)).faultSourceId).toBe(sourceBinding.sourceId);
    await expect(repository.bindFaultSource({ ...sourceBinding, sourceId: "source-other" })).rejects.toThrow(/rebind/i);
    expect((await repository.sealScenario(terminal)).state).toBe("sealed");

    await repository.createScenario(scenario(sessionId, diagnosisScenarioId, "diagnosis_failure"));
    await repository.createScenario(scenario(sessionId, questionScenarioId, "question_failure"));
    await expect(repository.bindFaultSource({ sessionId, scenarioId: diagnosisScenarioId, sourceId: "forbidden" }))
      .rejects.toThrow(/only a collecting successful/i);
    await expect(repository.bindFaultSource({ sessionId, scenarioId: questionScenarioId, sourceId: "forbidden" }))
      .rejects.toThrow(/only a collecting successful/i);
  }, 120_000);

  it("rejects an ambiguous collecting-scenario job lookup across job roles", async () => {
    const repository = repo(sql);
    const sessionId = "15555555-5555-4555-8555-555555555555";
    const firstScenarioId = "25555555-5555-4555-8555-555555555551";
    const secondScenarioId = "25555555-5555-4555-8555-555555555552";
    const label = "ambiguous-job";
    await repository.createSession(session(sessionId));
    await seedV4Lineage(sql, label);
    await repository.createScenario(scenario(sessionId, firstScenarioId, "success"));
    await repository.createScenario(scenario(sessionId, secondScenarioId, "question_failure"));
    const firstBinding = lineage(sessionId, firstScenarioId, label);
    await repository.bindScenario(firstBinding);
    await repository.bindPreAdmissionJob({ sessionId, scenarioId: secondScenarioId, preAdmissionJobId: firstBinding.coreJobId });
    await expect(repository.loadCollectingScenarioByJob({ sessionId, jobId: firstBinding.coreJobId }))
      .rejects.toThrow(/more than one collecting scenario/i);
    expect(await repository.loadCollectingScenarioByJob({ sessionId, jobId: "missing-job" })).toBeNull();
  }, 120_000);

  it("upgrades an actual V34 database to the append-only V35 ledger", async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(upgradeDatabaseName)}`);
    const upgradeSql = postgres(withDatabase(adminUrl!, upgradeDatabaseName), { max: 1, prepare: false });
    try {
      const v34Migrations = DATABASE_MIGRATIONS.slice(0, -V35_DATABASE_MIGRATIONS.length);
      await upgradeSql.begin(async (tx) => { for (const statement of v34Migrations) await tx.unsafe(statement); });
      expect((await upgradeSql`SELECT to_regclass('report_v4_acceptance_sessions')::text AS name`)[0]?.name).toBeNull();
      await upgradeSql.begin(async (tx) => { for (const statement of V35_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      expect((await upgradeSql`SELECT to_regclass('report_v4_acceptance_sessions')::text AS name`)[0]?.name)
        .toBe("report_v4_acceptance_sessions");
    } finally {
      await upgradeSql.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(upgradeDatabaseName)} WITH (FORCE)`);
    }
  }, 120_000);
});

function repo(sql: ReturnType<typeof postgres>) {
  return createReportV4AcceptanceLedgerRepository(createPostgresReportV4AcceptanceLedgerStore(sql), environment);
}

function session(sessionId: string) {
  return { sessionId, previewDeploymentId: `dpl-${sessionId}`, protectedAliasUrl: "https://preview.example",
    webGitSha: "a".repeat(40), workerGitSha: "a".repeat(40) };
}

function recomputeEventHash(event: {
  prevHash: string; idempotencyKey: string; sequence: number; kind: string; operation: string; unitId: string;
  attempt: number; phase: string; detailsCanonical: string; occurredAtCanonical: string;
}): string {
  return hash([event.prevHash, event.idempotencyKey, event.sequence, event.kind, event.operation, event.unitId,
    event.attempt, event.phase, event.detailsCanonical, event.occurredAtCanonical].join("\x1f"));
}

function scenario(sessionId: string, scenarioId: string, kind: "success" | "diagnosis_failure" | "question_failure"): CreateReportV4AcceptanceScenarioInput {
  if (kind === "success") return { sessionId, scenarioId, kind, faultKind: "independent_source_read_failure", faultQuestionId: "question-1", faultSourceId: "source-1", expectedFaultOccurrences: 1 };
  return { sessionId, scenarioId, kind, faultKind: kind, faultQuestionId: "question-1", expectedFaultOccurrences: 2 };
}

function modelEvent(sessionId: string, scenarioId: string, unitId: string, inputTokens: number): Extract<AppendReportV4AcceptanceEventInput, { kind: "model_operation" }> {
  return { sessionId, scenarioId, kind: "model_operation", operation: "page_analysis", unitId, attempt: 1, phase: "started",
    details: { providerCall: true, retry: false, budgetOutcome: "allowed", inputTokens, outputTokens: 0 } };
}

function lineage(sessionId: string, scenarioId: string, label: string): BindReportV4AcceptanceScenarioInput {
  return { sessionId, scenarioId, reportId: `report-${label}`, orderId: `order-${label}`,
    preAdmissionJobId: `pre-${label}`, coreJobId: `core-${label}`, enhancementJobId: `enhance-${label}`,
    siteSnapshotId: `snapshot-${label}`, configSnapshotId: `v4-config-${hash(`config-${label}`)}`,
    questionSetId: `questions-${label}`, coreArtifactRevisionId: `core-artifact-${label}`,
    enhancementArtifactRevisionId: `enhance-artifact-${label}` };
}

async function seedV4Lineage(sql: ReturnType<typeof postgres>, label: string): Promise<void> {
  const ids = lineage("ignored", "ignored", label);
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${ids.reportId},${`https://${label}.example/`},${`${label}.example`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.siteSnapshotId},${ids.reportId},${`${label}.example`},'completed',now(),now(),${hash(`collector-${label}`)},${hash(`snapshot-${label}`)},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questionSetId},${ids.reportId},1,'en','US','candidate','high',false,'v1','v1','profile')`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`${ids.questionSetId}-q${ordinal}`},${ids.questionSetId},${ordinal},${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
        ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${hash(`${label}-q${ordinal}`)})`;
  }
  await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${hash(`private-${label}`)},neutral_content_hash=${hash(`neutral-${label}`)},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,reason)
    VALUES(${ids.preAdmissionJobId},${ids.reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','v4_pre_admission')`;
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
    VALUES(${ids.coreJobId},${ids.reportId},${ids.siteSnapshotId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'en','standard')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
    VALUES(${ids.orderId},${hash(`checkout-${label}`)},'airwallex',${ids.reportId},${ids.siteSnapshotId},${ids.coreJobId},${`${label}.example`},'cipher',${hash(`email-${label}`)},'v1','recommendation_forensics_v1',${ids.questionSetId},'two_stage_geo_report_v4',4,'v1','v1','v1','en','USD',100,'paid')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.orderId} WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${ids.configSnapshotId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.configSnapshotId.slice(10)},'model',${hash(`model-${label}`)},'{}'::jsonb,'report',${hash(`report-${label}`)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,artifact_contract,status,payload_identity_hash,html_sha256,readiness,ready_at,activated_at)
    VALUES(${ids.coreArtifactRevisionId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.configSnapshotId},1,'generation','combined_geo_report_v4','active',
      ${hash(`core-payload-${label}`)},${hash(`core-html-${label}`)},'{"htmlCanonical":true}'::jsonb,now(),now())`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.coreArtifactRevisionId} WHERE id=${ids.reportId}`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
    VALUES(${ids.enhancementJobId},${ids.reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'en','v4_diagnosis_enhancement')`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,source_artifact_revision_id,artifact_contract,status,payload_identity_hash)
    VALUES(${ids.enhancementArtifactRevisionId},${ids.reportId},${ids.orderId},${ids.enhancementJobId},${ids.configSnapshotId},2,'diagnosis_enhancement',${ids.coreArtifactRevisionId},'combined_geo_report_v4','pending',${`v4-pending:${ids.enhancementJobId}:${ids.enhancementArtifactRevisionId}`})`;
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

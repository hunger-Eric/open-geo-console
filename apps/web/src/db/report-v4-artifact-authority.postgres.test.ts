import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadReportV4ArtifactAuthority, loadReportV4ArtifactAuthorityInTransaction } from "./report-v4-artifact-authority";
import {
  createPostgresReportV4ArtifactPersistenceStore,
  createReportV4ArtifactPersistencePostgresDatabase,
  persistReportV4ArtifactPayload
} from "./report-v4-artifact-persistence";
import {
  createPostgresReportV4DiagnosisCheckpointStore,
  createReportV4DiagnosisCheckpointPostgresDatabase,
  createReportV4DiagnosisCheckpointRepository,
  type InitializeReportV4DiagnosisCheckpointsInput
} from "./report-v4-diagnosis-checkpoints";
import { DATABASE_MIGRATIONS } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;

suite("Report V4 artifact authority PostgreSQL", () => {
  const databaseName = `ogc_v4_artifact_authority_${randomUUID().replaceAll("-", "")}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;

  beforeAll(async () => {
    admin = postgres(adminUrl!, { max: 1, prepare: false });
    await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 3, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
  }, 120_000);

  afterAll(async () => {
    await sql?.end({ timeout: 1 });
    if (admin) { await admin.unsafe(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`); await admin.end({ timeout: 1 }); }
  }, 60_000);

  it("loads a real persistence seed under repeatable-read read-only and rejects conflicting immutable reentry", async () => {
    const ids = await seedCore(sql);
    const authority = await loadReportV4ArtifactAuthority(sql, { sessionId: ids.session, scenarioId: ids.scenario, phase: "final" });
    expect(authority.transactionProfile).toEqual({ isolation: "repeatable read", readOnly: true });
    expect(authority.artifacts).toEqual([expect.objectContaining({ revisionKind: "generation", status: "active" })]);
    expect(JSON.stringify(authority)).not.toMatch(/SECRET_(URL|EXCERPT|EMAIL|TOKEN)/u);

    const changed = structuredClone(ids.reportPayload);
    changed.questions[0]!.answer = "conflicting answer";
    await expect(persistReportV4ArtifactPayload({ ...ids.persistenceInput, report: changed }, ids.store))
      .rejects.toThrow(/identity conflicts|payload identity/i);
  });

  it("keeps one caller-owned RR snapshot stable and detects canonical payload tampering on a later snapshot", async () => {
    const ids = await seedCore(sql);
    const writer = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    try {
      await sql.begin("isolation level repeatable read read only", async (tx) => {
        const first = await loadReportV4ArtifactAuthorityInTransaction(tx, { sessionId: ids.session, scenarioId: ids.scenario, phase: "final" });
        await writer`UPDATE combined_geo_reports SET payload=jsonb_set(payload,'{websiteSynthesis,summary}','"tampered"'::jsonb) WHERE artifact_revision_id=${ids.artifact}`;
        const second = await loadReportV4ArtifactAuthorityInTransaction(tx, { sessionId: ids.session, scenarioId: ids.scenario, phase: "final" });
        expect(second.canonicalHash).toBe(first.canonicalHash);
      });
      await expect(loadReportV4ArtifactAuthority(sql, { sessionId: ids.session, scenarioId: ids.scenario, phase: "final" }))
        .rejects.toThrow(/stored payload identity/i);
    } finally { await writer.end({ timeout: 1 }); }
  }, 30_000);

  it("rejects a raw sixth JSONB source whose stored hash matches only the parser-normalized payload", async () => {
    const ids = await seedCore(sql);
    const rawPayload = structuredClone(ids.reportPayload);
    for (let index = 2; index <= 6; index += 1) {
      rawPayload.questions[0]!.sources.push({ ...rawPayload.questions[0]!.sources[0]!,
        sourceId: `source-1-${index}`, canonicalUrl: `https://source-${index}.example/evidence` });
    }
    const normalizedPayload = structuredClone(rawPayload);
    normalizedPayload.questions[0]!.sources = normalizedPayload.questions[0]!.sources.slice(0, 5);
    await sql.begin(async (tx) => {
      await tx`UPDATE combined_geo_reports SET payload=${tx.json(rawPayload)} WHERE artifact_revision_id=${ids.artifact}`;
      await tx`UPDATE report_artifact_revisions SET payload_identity_hash=${hashJson(normalizedPayload)} WHERE id=${ids.artifact}`;
    });
    await expect(loadReportV4ArtifactAuthority(sql, { sessionId: ids.session, scenarioId: ids.scenario, phase: "final" }))
      .rejects.toThrow(/exact raw persisted JSONB/i);
  }, 30_000);

  it("accepts real success and exact-target diagnosis-failure enhancement handoffs", async () => {
    const success = await seedCore(sql, { kind: "success" });
    const successAuthority = await loadReportV4ArtifactAuthority(sql, { sessionId: success.session, scenarioId: success.scenario, phase: "final" });
    expect(successAuthority.artifacts[1]?.diagnosisContentHashes.every(Boolean)).toBe(true);
    expect(successAuthority.faultSourceIdHash).toMatch(/^[a-f0-9]{64}$/u);

    const failure = await seedCore(sql, { kind: "diagnosis_failure" });
    const failureAuthority = await loadReportV4ArtifactAuthority(sql, { sessionId: failure.session, scenarioId: failure.scenario, phase: "final" });
    expect(failureAuthority.artifacts[1]?.diagnosisContentHashes).toEqual([expect.any(String), null, expect.any(String)]);
  }, 60_000);

  it("rejects real diagnosis topology, preservation, checkpoint, and source-fault drift", async () => {
    const cases: Array<[string, SeedOptions]> = [
      ["wrong target", { kind: "diagnosis_failure", failedOrdinals: [1] }],
      ["multiple failed", { kind: "diagnosis_failure", failedOrdinals: [1,2] }],
      ["all completed", { kind: "diagnosis_failure", failedOrdinals: [] }],
      ["preservation drift", { kind: "diagnosis_failure", preservationDrift: true }],
      ["checkpoint drift", { kind: "diagnosis_failure", diagnosisDriftOrdinal: 1 }],
      ["wrong source target", { kind: "success", faultSourceOrdinal: 1 }],
      ["all sources available", { kind: "success", inaccessibleOrdinals: [] }],
      ["multiple inaccessible sources", { kind: "success", inaccessibleOrdinals: [1,2] }],
      ["source audit versus artifact drift", { kind: "success", artifactRetrievalDriftOrdinal: 2 }],
      ["non-success source fault drift", { kind: "diagnosis_failure", inaccessibleOrdinals: [1] }]
    ];
    for (const [, options] of cases) {
      const ids = await seedCore(sql, options);
      await expect(loadReportV4ArtifactAuthority(sql, { sessionId: ids.session, scenarioId: ids.scenario, phase: "final" }))
        .rejects.toThrow(/fault target|drifted core|checkpoint.*does not match|fault source|unique inaccessible|artifact retrieval lineage|non-success.*source-fault/i);
    }
  }, 120_000);
});

type ScenarioKind = "question_failure" | "success" | "diagnosis_failure";
type SeedOptions = { kind?: ScenarioKind; failedOrdinals?: number[]; preservationDrift?: boolean; diagnosisDriftOrdinal?: number;
  faultSourceOrdinal?: number; inaccessibleOrdinals?: number[]; artifactRetrievalDriftOrdinal?: number };

async function seedCore(sql: postgres.Sql, options: SeedOptions = {}) {
  const kind = options.kind ?? "question_failure";
  const suffix = randomUUID().replaceAll("-", "");
  const report = `report-${suffix}`, snapshot = `snapshot-${suffix}`, order = `order-${suffix}`;
  const core = `core-${suffix}`, questions = `questions-${suffix}`, artifact = `artifact-${suffix}`;
  const session = randomUUID(), scenario = randomUUID(), credit = `credit-${suffix}`, access = `access-${suffix}`;
  const configHash = suffix.repeat(2), config = `v4-config-${configHash}`;
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${report},'https://example.test/SECRET_URL',${`site-${suffix}`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${snapshot},${report},${`site-${suffix}`},'completed',now(),now(),${"c".repeat(64)},${"d".repeat(64)},1,1,0)`;
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,customer_email_hmac,
    email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
    report_locale,currency,amount_minor,payment_status,fulfillment_status,refund_status,delivery_status,paid_at,delivery_deadline_at,fulfilled_at)
    VALUES(${order},${`checkout-${suffix}`},'airwallex',${report},${snapshot},${`site-${suffix}`},'SECRET_EMAIL',${`email-${suffix}`},'v1',
      'recommendation_forensics_v1','two_stage_geo_report_v4',4,'catalog-v4','terms-v4','refund-v4','en','USD',100,'paid','completed',
      'not_required','delivered',now(),now(),now())`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining,expires_at)
    VALUES(${access},${`prefix-${suffix}`},${`key-${suffix}`},${order},'exhausted',0,now()+interval '1 day')`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,idempotency_key,payment_order_id,credits,status,reserved_at,settled_at)
    VALUES(${credit},${access},${report},${`credit-idem-${suffix}`},${order},1,'settled',now(),now())`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${questions},${report},${order},1,'en','US','candidate','high','v1','v1','profile')`;
  for (const ordinal of [1,2,3]) await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
    VALUES(${`${questions}-q${ordinal}`},${questions},${ordinal},${["core_service_discovery","customer_region_fit","purchase_delivery_risk"][ordinal-1]!},
      ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${String(ordinal).repeat(64)})`;
  await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${"e".repeat(64)},neutral_content_hash=${"f".repeat(64)},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id=${questions}`;
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,
    business_question_set_id,locale,reason,stage,execution_state,current_phase,checkpoint_revision,phase_attempt,resume_generation,progress,planned_pages,
    successful_pages,failed_pages,attempts,max_attempts,credit_reservation_id)
    VALUES(${core},${report},${snapshot},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${questions},'en','standard',
      'completed','completed','terminalization',1,0,0,100,1,1,0,1,3,${credit})`;
  await sql`UPDATE credit_ledger SET job_id=${core} WHERE id=${credit}`;
  await sql`UPDATE payment_orders SET fulfillment_job_id=${core},business_question_set_id=${questions} WHERE id=${order}`;
  await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${config},${report},${order},${core},${configHash},'model-v4',${"1".repeat(64)},'{}'::jsonb,'report-v4',${"2".repeat(64)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,payload_identity_hash)
    VALUES(${artifact},${report},${order},${core},${config},'generation',1,'combined_geo_report_v4','pending',${`v4-pending:${core}:${artifact}`})`;
  const reportPayload = combinedPayload(report, artifact, questions, kind);
  const persistenceInput = { report: reportPayload, canonicalHtml: '<main data-report-version="4">ok</main>', artifactRevisionId: artifact,
    reportId: report, orderId: order, jobId: core, coreJobId: core, questionSetId: questions, configSnapshotId: config,
    siteSnapshotId: snapshot, revisionKind: "generation" as const, sourceArtifactRevisionId: null };
  const store = createPostgresReportV4ArtifactPersistenceStore(createReportV4ArtifactPersistencePostgresDatabase(sql));
  await persistReportV4ArtifactPayload(persistenceInput, store);
  await sql`UPDATE report_artifact_revisions SET status='active',ready_at=now(),activated_at=now() WHERE id=${artifact}`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${artifact} WHERE id=${report}`;
  let enhancement: string | null = null;
  let enhancementJob: string | null = null;
  if (kind !== "question_failure") {
    enhancement = `artifact-enhancement-${suffix}`;
    enhancementJob = `enhancement-${suffix}`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,
      business_question_set_id,locale,reason,stage,execution_state,current_phase,checkpoint_revision,phase_attempt,resume_generation,progress,
      planned_pages,successful_pages,failed_pages,attempts,max_attempts)
      VALUES(${enhancementJob},${report},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${questions},'en',
        'v4_diagnosis_enhancement','completed','completed','terminalization',1,0,0,100,1,1,0,1,3)`;
    const repository = createReportV4DiagnosisCheckpointRepository(createPostgresReportV4DiagnosisCheckpointStore(
      createReportV4DiagnosisCheckpointPostgresDatabase(sql)
    ));
    const inaccessibleOrdinals = options.inaccessibleOrdinals ?? (kind === "success" ? [2] : []);
    const retrievalStatus = (ordinal: number): "available" | "inaccessible" =>
      inaccessibleOrdinals.includes(ordinal) ? "inaccessible" : "available";
    const initialization = diagnosisInitialization(report, enhancementJob, artifact, config, questions, snapshot, retrievalStatus);
    const checkpoints = await repository.initialize(initialization);
    const failedOrdinals = options.failedOrdinals ?? (kind === "diagnosis_failure" ? [2] : []);
    for (const ordinal of [1,2,3] as const) {
      const checkpoint = checkpoints[ordinal - 1]!;
      await repository.startAttempt({ identityHash: checkpoint.identityHash, expectedProviderCallCount: 0,
        diagnosisInput: diagnosisInput(questions, ordinal, retrievalStatus(ordinal)),
        sourceAudits: diagnosisSourceAudits(questions, ordinal, retrievalStatus(ordinal)) });
      if (failedOrdinals.includes(ordinal)) await repository.markFailed({ identityHash: checkpoint.identityHash, providerCallCount: 1,
        diagnosisInput: diagnosisInput(questions, ordinal, retrievalStatus(ordinal)) });
      else await repository.complete({ identityHash: checkpoint.identityHash, providerCallCount: 1,
        diagnosisInput: diagnosisInput(questions, ordinal, retrievalStatus(ordinal)), diagnosis: diagnosisOutput(ordinal) });
    }
    const enhancementPayload = structuredClone(reportPayload);
    enhancementPayload.artifactRevisionId = enhancement;
    enhancementPayload.generatedAt = "2026-07-17T00:01:00.000Z";
    enhancementPayload.questions.forEach((question, index) => {
      const ordinal = index + 1;
      const status = options.artifactRetrievalDriftOrdinal === ordinal
        ? retrievalStatus(ordinal) === "available" ? "inaccessible" : "available"
        : retrievalStatus(ordinal);
      question.sources.forEach((source) => { source.retrievalStatus = status; });
      if (!failedOrdinals.includes(ordinal)) question.diagnosis = diagnosisOutput(ordinal as 1|2|3);
    });
    if (options.preservationDrift) enhancementPayload.questions[0]!.answer = "drifted answer";
    if (options.diagnosisDriftOrdinal) {
      const question = enhancementPayload.questions[options.diagnosisDriftOrdinal - 1]!;
      if (question.diagnosis) question.diagnosis.targetGap = "artifact-only diagnosis drift";
    }
    await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,
      revision_kind,revision,artifact_contract,status,payload_identity_hash)
      VALUES(${enhancement},${report},${order},${enhancementJob},${config},${artifact},'diagnosis_enhancement',2,
        'combined_geo_report_v4','pending',${`v4-pending:${enhancementJob}:${enhancement}`})`;
    await persistReportV4ArtifactPayload({ report: enhancementPayload, canonicalHtml: '<main data-report-version="4">enhancement</main>',
      artifactRevisionId: enhancement, reportId: report, orderId: order, jobId: enhancementJob, coreJobId: core,
      questionSetId: questions, configSnapshotId: config, siteSnapshotId: snapshot, revisionKind: "diagnosis_enhancement",
      sourceArtifactRevisionId: artifact }, store);
    await sql`UPDATE report_artifact_revisions SET status='ready',ready_at=now() WHERE id=${enhancement}`;
    await sql.begin(async (tx) => {
      await tx`UPDATE report_artifact_revisions SET status='ready' WHERE id=${artifact}`;
      await tx`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id=${enhancement}`;
      await tx`UPDATE scan_reports SET active_artifact_revision_id=${enhancement} WHERE id=${report}`;
    });
  }
  await sql`INSERT INTO report_v4_acceptance_sessions(id,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
    VALUES(${session},'preview-v4','https://preview.test',${"4".repeat(40)},${"4".repeat(40)})`;
  const faultKind = kind === "success" ? "independent_source_read_failure" : kind;
  await sql`INSERT INTO report_v4_acceptance_scenarios(id,session_id,kind,fault_kind,fault_question_id,fault_source_id,expected_fault_occurrences,report_id,order_id,
    core_job_id,enhancement_job_id,site_snapshot_id,config_snapshot_id,question_set_id,core_artifact_revision_id,enhancement_artifact_revision_id)
    VALUES(${scenario},${session},${kind},${faultKind},${`${questions}-q2`},
      ${kind === "success" ? `source-${options.faultSourceOrdinal ?? 2}` : null},${kind === "success" ? 1 : 2},
      ${report},${order},${core},${enhancementJob},${snapshot},${config},${questions},${artifact},${enhancement})`;
  return { session, scenario, artifact, reportPayload, persistenceInput, store };
}

function combinedPayload(reportId: string, artifactRevisionId: string, questions: string, kind: ScenarioKind) {
  return { version: 4, artifactContract: "combined_geo_report_v4", reportId, artifactRevisionId, targetUrl: "https://example.test/SECRET_URL",
    locale: "en", generatedAt: "2026-07-17T00:00:00.000Z", status: kind === "question_failure" ? "completed_limited" : "completed",
    websiteSynthesis: { summary: "Summary", strengths: [], gaps: [], actions: [] },
    questions: [1,2,3].map((ordinal) => kind === "question_failure" && ordinal === 2
      ? { order: ordinal, questionId: `${questions}-q${ordinal}`, questionText: `Question ${ordinal}?`, status: "unavailable", answer: null, sources: [] }
      : { order: ordinal, questionId: `${questions}-q${ordinal}`, questionText: `Question ${ordinal}?`, status: "answered",
        answer: `Answer ${ordinal}.`, sources: [{ questionId: `${questions}-q${ordinal}`, sourceId: `source-${ordinal}`, title: `Source ${ordinal}`,
          canonicalUrl: `https://source-${ordinal}.example/evidence`, citedText: `Evidence ${ordinal}.`, retrievalStatus: "not_checked" }] }) };
}

function diagnosisInitialization(reportId: string, enhancementJobId: string, coreArtifactRevisionId: string,
  configSnapshotId: string, questionSetId: string, snapshotId: string,
  retrievalStatus: (ordinal: number) => "available" | "inaccessible"): InitializeReportV4DiagnosisCheckpointsInput {
  return { reportId, enhancementJobId, coreArtifactRevisionId, configSnapshotId, questionSetId, snapshotId,
    checkpoints: [1,2,3].map((ordinal) => ({ ordinal: ordinal as 1|2|3, questionId: `${questionSetId}-q${ordinal}`,
      diagnosisInput: diagnosisInput(questionSetId, ordinal as 1|2|3, retrievalStatus(ordinal)) })) as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"] };
}

function diagnosisInput(questionSetId: string, ordinal: 1|2|3, retrievalStatus: "available" | "inaccessible") {
  return { question: { questionId: `${questionSetId}-q${ordinal}`, text: `Question ${ordinal}?` }, answer: `Answer ${ordinal}.`, locale: "en",
    sources: [{ questionId: `${questionSetId}-q${ordinal}`, sourceId: `source-${ordinal}`, title: `Source ${ordinal}`,
      canonicalUrl: `https://source-${ordinal}.example/evidence`, excerpt: `Evidence ${ordinal}.`, retrievalStatus }],
    targetPages: [{ questionId: `${questionSetId}-q${ordinal}`, pageId: `page-${ordinal}`, url: `https://example.test/page-${ordinal}`,
      relevanceReason: `Relevant ${ordinal}.`, summary: `Target summary ${ordinal}.`,
      sourceLocations: [{ locationId: `location-${ordinal}`, startOffset: 0, endOffset: 20 }] }] };
}

function diagnosisSourceAudits(questionSetId: string, ordinal: 1|2|3, status: "available" | "inaccessible") {
  return [{ questionId: `${questionSetId}-q${ordinal}`, sourceId: `source-${ordinal}`, canonicalUrl: `https://source-${ordinal}.example/evidence`,
    status, ...(status === "available" ? { summary: `Audited evidence ${ordinal}.` } : {}) }];
}

function diagnosisOutput(ordinal: 1|2|3) {
  const refs = [`source-${ordinal}`, `location-${ordinal}`];
  return { selectionSummary: `Selection ${ordinal}.`, observableFactors: ["problem_match","factual_specificity","target_clarity"].map((kind,index) => ({
    kind, observation: `Observation ${ordinal}-${index}.`, evidenceRefs: refs })), targetGap: `Target gap ${ordinal}.`,
    recommendedActions: [1,2,3].map((priority) => ({ priority, action: `Action ${ordinal}-${priority}.`, evidenceRefs: refs })), detailedEvidenceRefs: refs };
}

function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value as Record<string,unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string,unknown>)[key])}`).join(",")}}`;
}
function hashJson(value: unknown): string { return createHash("sha256").update(stableJson(value)).digest("hex"); }

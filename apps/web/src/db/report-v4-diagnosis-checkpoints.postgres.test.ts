import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4DiagnosisCheckpointStore,
  createReportV4DiagnosisCheckpointPostgresDatabase,
  createReportV4DiagnosisCheckpointRepository,
  type InitializeReportV4DiagnosisCheckpointsInput
} from "./report-v4-diagnosis-checkpoints";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
describeDisposablePostgres("V4 diagnosis checkpoint repository PostgreSQL parity", () => {
  const databaseName = `ogc_v4_diagnosis_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 4, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await seedExactRun(sql);
  }, 60_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("initializes concurrently with exact idempotency and rejects wrong active lineage", async () => {
    const repository = postgresRepository(sql);
    const exact = initialization();
    const [left, right] = await Promise.all([repository.initialize(exact), repository.initialize(exact)]);
    expect(left).toEqual(right);
    expect(left).toHaveLength(3);
    expect(left[0].diagnosisInput).toEqual(diagnosisInput(1));
    expect(await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM report_v4_diagnosis_checkpoints`)
      .toEqual([{ count: 3 }]);
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints
      SET diagnosis_input_payload=diagnosis_input_payload || '{"locale":"drift"}'::jsonb
      WHERE enhancement_job_id='enhancement-job-1' AND ordinal=1`)
      .rejects.toThrow(/identity.*immutable/i);
    await expect(repository.initialize({ ...exact, snapshotId: "missing-snapshot" }))
      .rejects.toThrow(/exact|binding|lineage/i);
    await expect(repository.initialize({
      ...exact,
      checkpoints: exact.checkpoints.map((checkpoint, index) => index === 0
        ? { ...checkpoint, diagnosisInput: { ...diagnosisInput(1), answer: "drift" } }
        : checkpoint) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"]
    })).rejects.toThrow(/identity|idempotency|drift/i);
  }, 120_000);

  it("serializes attempts and composes an ordered terminal mix without losing successful diagnoses", async () => {
    const repository = postgresRepository(sql);
    const checkpoints = await repository.initialize(initialization());
    const attempt = {
      identityHash: checkpoints[0]!.identityHash,
      expectedProviderCallCount: 0 as const,
      diagnosisInput: diagnosisInput(1),
      sourceAudits: sourceAudits(1)
    };
    const [left, right] = await Promise.all([repository.startAttempt(attempt), repository.startAttempt(attempt)]);
    expect(left).toEqual(right);
    expect(left.providerCallCount).toBe(1);
    await expect(sql`UPDATE report_v4_diagnosis_checkpoints
      SET diagnosis_input_payload=diagnosis_input_payload || '{"locale":"drift"}'::jsonb
      WHERE identity_hash=${checkpoints[0]!.identityHash}`)
      .rejects.toThrow(/identity.*immutable/i);
    await repository.complete({
      identityHash: checkpoints[0]!.identityHash, providerCallCount: 1,
      diagnosisInput: diagnosisInput(1), diagnosis: diagnosis(1)
    });
    await expect(repository.loadForEnhancementComposition(initialization()))
      .rejects.toThrow(/three terminal|nonterminal|queued|running|partial/i);

    for (const ordinal of [2, 3] as const) {
      const checkpoint = checkpoints[ordinal - 1]!;
      await repository.startAttempt({
        identityHash: checkpoint.identityHash, expectedProviderCallCount: 0,
        diagnosisInput: diagnosisInput(ordinal), sourceAudits: sourceAudits(ordinal)
      });
      if (ordinal === 2) {
        await repository.startAttempt({
          identityHash: checkpoint.identityHash, expectedProviderCallCount: 1,
          diagnosisInput: diagnosisInput(ordinal), sourceAudits: sourceAudits(ordinal)
        });
        await expect(repository.startAttempt({
          identityHash: checkpoint.identityHash, expectedProviderCallCount: 2,
          diagnosisInput: diagnosisInput(ordinal), sourceAudits: sourceAudits(ordinal)
        })).rejects.toThrow(/one local retry|two|2/i);
      }
      if (ordinal === 2) {
        await repository.markFailed({
          identityHash: checkpoint.identityHash, providerCallCount: 2,
          diagnosisInput: diagnosisInput(ordinal)
        });
      } else {
        await repository.complete({
          identityHash: checkpoint.identityHash, providerCallCount: 1,
          diagnosisInput: diagnosisInput(ordinal), diagnosis: diagnosis(ordinal)
        });
      }
    }
    const composition = await repository.loadForEnhancementComposition(initialization());
    expect(composition.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3]);
    expect(composition.map(({ state }) => state)).toEqual(["completed", "failed", "completed"]);
    expect(composition[0]!.diagnosis).toEqual(diagnosis(1));
    expect(composition[1]!.diagnosis).toBeNull();
    expect(Object.isFrozen(composition[2]!.diagnosis!.observableFactors)).toBe(true);
    const recovery = await repository.loadTerminalRecovery("enhancement-job-1");
    expect(recovery?.map(({ state }) => state)).toEqual(["completed", "failed", "completed"]);
    expect(recovery?.[2].diagnosisInput).toEqual(diagnosisInput(3));
    await expect(repository.complete({
      identityHash: checkpoints[0]!.identityHash, providerCallCount: 1,
      diagnosisInput: diagnosisInput(1), diagnosis: { ...diagnosis(1), targetGap: "terminal drift" }
    })).rejects.toThrow(/terminal|immutable|drift|idempotency/i);
  }, 120_000);
});

function postgresRepository(sql: ReturnType<typeof postgres>) {
  return createReportV4DiagnosisCheckpointRepository(createPostgresReportV4DiagnosisCheckpointStore(
    createReportV4DiagnosisCheckpointPostgresDatabase(sql)
  ));
}

async function seedExactRun(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES('report-1','https://target.example/','target.example','en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
     candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES('snapshot-1','report-1','target.example','completed',now(),now(),${hash("collector")},${hash("snapshot")},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,acknowledged_low_confidence,generation_rule_version,
     neutralization_version,profile_evidence_identity)
    VALUES('question-set-1','report-1',1,'en','US','candidate','high',false,'v1','v1','profile')`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${`question-${ordinal}`},'question-set-1',${ordinal},
       ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
       ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${hash(`question-${ordinal}`)})`;
  }
  await sql`UPDATE report_business_question_sets SET status='locked',content_hash=${hash("private-questions")},
    neutral_content_hash=${hash("neutral-questions")},payload='{}'::jsonb,confirmed_at=now(),locked_at=now()
    WHERE id='question-set-1'`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason)
    VALUES('core-job-1','report-1','snapshot-1','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
     'combined_geo_report_v4','question-set-1','en','standard')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,
     customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,
     fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,
     report_locale,currency,amount_minor,payment_status)
    VALUES('order-1','checkout-1','airwallex','report-1','snapshot-1','core-job-1','target.example',
     'cipher','email-hmac','v1','recommendation_forensics_v1','question-set-1','two_stage_geo_report_v4',4,
     'v1','v1','v1','en','USD',100,'paid')`;
  await sql`UPDATE report_business_question_sets SET order_id='order-1' WHERE id='question-set-1'`;
  const configHash = hash("config");
  const configId = `v4-config-${configHash}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${configId},'report-1','order-1','core-job-1',${configHash},'model',${hash("model")},
     '{"provider":"mimo","model":"test","capabilities":{"structuredOutput":true,"publicSearch":true}}'::jsonb,
     'report-profile',${hash("report-profile")},
     '{"id":"report-profile","locale":"en","audience":"business","terminology":"geo","forbiddenTerms":["SEO"]}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision,revision_kind,artifact_contract,status,
     payload_identity_hash,html_sha256,ready_at,activated_at)
    VALUES('core-revision-1','report-1','order-1','core-job-1',${configId},1,'generation','combined_geo_report_v4',
     'active',${hash("core-payload")},${hash("core-html")},now(),now())`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id='core-revision-1' WHERE id='report-1'`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,
     business_question_set_id,locale,reason)
    VALUES('enhancement-job-1','report-1','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
     'combined_geo_report_v4','question-set-1','en','v4_diagnosis_enhancement')`;
}

function initialization(): InitializeReportV4DiagnosisCheckpointsInput {
  return {
    reportId: "report-1", enhancementJobId: "enhancement-job-1", coreArtifactRevisionId: "core-revision-1",
    configSnapshotId: `v4-config-${hash("config")}`, questionSetId: "question-set-1", snapshotId: "snapshot-1",
    checkpoints: [1, 2, 3].map((ordinal) => ({
      ordinal: ordinal as 1 | 2 | 3, questionId: `question-${ordinal}`,
      diagnosisInput: diagnosisInput(ordinal as 1 | 2 | 3)
    })) as unknown as InitializeReportV4DiagnosisCheckpointsInput["checkpoints"]
  };
}

function diagnosisInput(ordinal: 1 | 2 | 3) {
  return {
    question: { questionId: `question-${ordinal}`, text: `Question ${ordinal}?` }, answer: `Answer ${ordinal}.`, locale: "en",
    sources: [{
      questionId: `question-${ordinal}`, sourceId: `source-${ordinal}`, title: `Source ${ordinal}`,
      canonicalUrl: `https://source-${ordinal}.example/evidence`, excerpt: `Evidence ${ordinal}.`, retrievalStatus: "available"
    }],
    targetPages: [{
      questionId: `question-${ordinal}`, pageId: `page-${ordinal}`, url: `https://target.example/page-${ordinal}`,
      relevanceReason: `Relevant ${ordinal}.`, summary: `Target summary ${ordinal}.`,
      sourceLocations: [{ locationId: `location-${ordinal}`, startOffset: 0, endOffset: 20 }]
    }]
  };
}

function sourceAudits(ordinal: 1 | 2 | 3) {
  return [{
    questionId: `question-${ordinal}`, sourceId: `source-${ordinal}`,
    canonicalUrl: `https://source-${ordinal}.example/evidence`, status: "available" as const,
    summary: `Audited evidence ${ordinal}.`
  }];
}

function diagnosis(ordinal: 1 | 2 | 3) {
  const refs = [`source-${ordinal}`, `location-${ordinal}`];
  return {
    selectionSummary: `Selection summary ${ordinal}.`,
    observableFactors: ["problem_match", "factual_specificity", "target_clarity"].map((kind, index) => ({
      kind, observation: `Observation ${ordinal}-${index}.`, evidenceRefs: refs
    })),
    targetGap: `Target gap ${ordinal}.`,
    recommendedActions: [1, 2, 3].map((priority) => ({ priority, action: `Action ${ordinal}-${priority}.`, evidenceRefs: refs })),
    detailedEvidenceRefs: refs
  };
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString();
}

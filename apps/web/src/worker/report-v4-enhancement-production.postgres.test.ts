import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CombinedGeoReportV4, CombinedGeoReportV4Question } from "@open-geo-console/ai-report-engine";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "../db";
import { persistReportV4PageSummary } from "../db/report-v4-page-summaries";
import {
  loadReportV4ModelRuntimeConfig,
  REPORT_V4_MIMO_V25_PRO_PROFILE_ID
} from "../report-v4/model-runtime-config";
import { loadReportV4ReportRuntimeConfig } from "../report-v4/report-runtime-config";
import {
  buildReportV4EnhancementArtifactRevisionId,
  createReportV4EnhancementProduction,
  type ClaimedReportV4EnhancementJob
} from "./report-v4-enhancement-production";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-SOURCE-02
// @requirement GEO-V4-DELIVERY-01
// @requirement GEO-V4-DIAG-01
// @requirement GEO-V4-DIAG-02
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-COMMERCE-01

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "");
const databaseName = `ogc_v4_enhancement_runner_${suffix}`;
const testEnvironment = {
  NODE_ENV: "test",
  OGC_REPORT_V4_MODEL_PROFILE_ID: REPORT_V4_MIMO_V25_PRO_PROFILE_ID
} as NodeJS.ProcessEnv;
const lockedModelProfile = loadReportV4ModelRuntimeConfig(testEnvironment).modelProfile;
const lockedReportProfile = loadReportV4ReportRuntimeConfig("en").reportProfile;
const ids = {
  reportId: `report-${suffix}`, orderId: `order-${suffix}`, coreJobId: `core-${suffix}`,
  enhancementJobId: `enhancement-${suffix}`, siteSnapshotId: `site-${suffix}`,
  questionSetId: `questions-${suffix}`, configSnapshotId: "pending-config-id",
  coreArtifactId: `core-artifact-${suffix}`, workerId: `worker-${suffix}`,
  creditId: `credit-${suffix}`, accessKeyId: `key-${suffix}`, accessTokenId: `token-${suffix}`
};
let configIdentityHash = sha(stableJson({
  coreJobId: ids.coreJobId,
  modelProfileHash: sha(stableJson(lockedModelProfile)),
  orderId: ids.orderId,
  reportId: ids.reportId,
  reportProfileHash: sha(stableJson(lockedReportProfile))
}));
ids.configSnapshotId = `v4-config-${configIdentityHash}`;
ids.enhancementJobId = `v4-diagnosis-job-${sha([
  ids.reportId, ids.orderId, ids.coreJobId, ids.coreArtifactId, ids.configSnapshotId,
  ids.siteSnapshotId, ids.questionSetId, "en"
].join("\0"))}`;
let enhancementArtifactId = buildReportV4EnhancementArtifactRevisionId({
  reportId: ids.reportId, orderId: ids.orderId, coreJobId: ids.coreJobId,
  coreArtifactRevisionId: ids.coreArtifactId, configSnapshotId: ids.configSnapshotId,
  siteSnapshotId: ids.siteSnapshotId, questionSetId: ids.questionSetId, locale: "en"
});
const original = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  memoryPath: process.env.OPEN_GEO_DB_PATH
};

suite("Report V4 enhancement production PostgreSQL recovery", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    delete process.env.OPEN_GEO_DB_PATH;
    await initializeDatabaseEnvironment("staging");
    await seedLineage(false);
  }, 180_000);

  afterAll(async () => {
    await closeDatabase();
    restore("DATABASE_URL", original.databaseUrl);
    restore("OGC_DEPLOYMENT_PROFILE", original.deploymentProfile);
    restore("OPEN_GEO_DB_PATH", original.memoryPath);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("runs a real claimed enhancement through shared source audit, checkpoints, persistence, activation and terminalization", async () => {
    let sourceReads = 0;
    let providerCalls = 0;
    const fetch = async (request: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = String(request);
      if (url === "https://source.example/shared") {
        sourceReads += 1;
        return new Response("<html><body>Shared current evidence for all three buyer questions.</body></html>", {
          status: 200, headers: { "Content-Type": "text/html" }
        });
      }
      providerCalls += 1;
      const body = String(init?.body ?? "");
      const sourceId = questionIds().map((id) => `${id}-source`).find((id) => body.includes(id));
      if (!sourceId) throw new Error("provider request omitted exact question source identity");
      return mimoResponse(diagnosisForEvidence(sourceId));
    };
    const run = createReportV4EnhancementProduction({
      environment: providerEnvironment(), fetch, now: () => new Date("2026-07-17T00:05:00.000Z")
    });

    const result = await run({ job: claimedJob(), workerId: ids.workerId, signal: new AbortController().signal });

    expect(result.delivery).toBe("enhancement_active");
    expect(result.enhancement.status).toBe("completed");
    expect(result.counters.modelCalls.sourceDiagnosis).toBe(3);
    expect(sourceReads).toBe(1);
    expect(providerCalls).toBe(3);
    const rows = await getSqlClient()<Array<Record<string, unknown>>>`
      SELECT status,job_id,source_artifact_revision_id FROM report_artifact_revisions WHERE id=${enhancementArtifactId}
    `;
    expect(rows[0]).toMatchObject({ status: "active", job_id: ids.enhancementJobId, source_artifact_revision_id: ids.coreArtifactId });
  }, 180_000);

  it("recovers the exact active enhancement with zero network calls and terminalizes its claimed job", async () => {
    await getSqlClient()`UPDATE scan_jobs SET stage='analyzing',execution_state='running',current_phase='evidence_graph',
      progress=50,lease_owner=${ids.workerId},lease_expires_at=now()+interval '10 minutes' WHERE id=${ids.enhancementJobId}`;
    let fetchCalls = 0;
    const run = createReportV4EnhancementProduction({
      environment: testEnvironment,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("active recovery must not call source or model providers");
      }
    });

    const result = await run({
      job: claimedJob(), workerId: ids.workerId, signal: new AbortController().signal
    });

    expect(result.delivery).toBe("enhancement_active");
    expect(result.counters.modelCalls.total).toBe(0);
    expect(result.counters.sourceReads).toEqual({ raw: 0, browser: 0 });
    expect(fetchCalls).toBe(0);
    const state = (await getSqlClient()<Array<Record<string, unknown>>>`
      SELECT stage,execution_state,lease_owner,lease_expires_at,checkpoint
      FROM scan_jobs WHERE id=${ids.enhancementJobId}
    `)[0]!;
    expect(state).toMatchObject({ stage: "completed", execution_state: "completed", lease_owner: null, lease_expires_at: null });
    expect(state.checkpoint).toMatchObject({
      reportV4Diagnosis: { completedQuestionIds: questionIds(), failedQuestionIds: [] }
    });
  }, 180_000);

  it("terminalizes zero completed diagnoses without preparing an artifact revision", async () => {
    resetIds("failure");
    await seedLineage(false);
    let sourceReads = 0;
    let providerCalls = 0;
    const run = createReportV4EnhancementProduction({
      environment: providerEnvironment(),
      fetch: async (request) => {
        if (String(request) === "https://source.example/shared") {
          sourceReads += 1;
          return new Response("<html><body>Shared evidence remains readable.</body></html>", {
            status: 200, headers: { "Content-Type": "text/html" }
          });
        }
        providerCalls += 1;
        return mimoResponse({});
      },
      now: () => new Date("2026-07-17T00:10:00.000Z")
    });

    const result = await run({ job: claimedJob(), workerId: ids.workerId, signal: new AbortController().signal });

    expect(result.delivery).toBe("core_active");
    expect(result.enhancement.status).toBe("failed");
    expect(sourceReads).toBe(1);
    expect(providerCalls).toBe(6);
    const artifactCount = (await getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM report_artifact_revisions WHERE job_id=${ids.enhancementJobId}
    `)[0]!.count;
    expect(artifactCount).toBe(0);
    const checkpointStates = await getSqlClient()<Array<{ state: string; provider_call_count: number }>>`
      SELECT state,provider_call_count FROM report_v4_diagnosis_checkpoints
      WHERE enhancement_job_id=${ids.enhancementJobId} ORDER BY ordinal
    `;
    expect(checkpointStates).toEqual([
      { state: "failed", provider_call_count: 2 },
      { state: "failed", provider_call_count: 2 },
      { state: "failed", provider_call_count: 2 }
    ]);
    const jobState = (await getSqlClient()<Array<{ stage: string; execution_state: string }>>`
      SELECT stage,execution_state FROM scan_jobs WHERE id=${ids.enhancementJobId}
    `)[0]!;
    expect(jobState).toEqual({ stage: "failed", execution_state: "failed" });
  }, 180_000);

  it("recovers terminal failed checkpoints with zero source/provider I/O and no provider credentials", async () => {
    await getSqlClient()`UPDATE scan_jobs SET stage='analyzing',execution_state='running',current_phase='evidence_graph',
      progress=50,lease_owner=${ids.workerId},lease_expires_at=now()+interval '10 minutes',error_code=NULL,public_error=NULL
      WHERE id=${ids.enhancementJobId}`;
    let fetchCalls = 0;
    const run = createReportV4EnhancementProduction({
      environment: testEnvironment,
      fetch: async () => {
        fetchCalls += 1;
        throw new Error("terminal checkpoint recovery must not perform I/O");
      }
    });

    const result = await run({ job: claimedJob(), workerId: ids.workerId, signal: new AbortController().signal });

    expect(result.delivery).toBe("core_active");
    expect(result.enhancement.status).toBe("failed");
    expect(result.counters.modelCalls.total).toBe(0);
    expect(result.counters.sourceReads).toEqual({ raw: 0, browser: 0 });
    expect(fetchCalls).toBe(0);
  }, 180_000);
});

function claimedJob(): ClaimedReportV4EnhancementJob {
  return {
    id: ids.enhancementJobId, reportId: ids.reportId, siteSnapshotId: null, tier: "deep",
    productContract: "recommendation_forensics_v1", fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4, artifactContract: "combined_geo_report_v4",
    businessQuestionSetId: ids.questionSetId, locale: "en", reason: "v4_diagnosis_enhancement",
    stage: "analyzing", executionState: "running", leaseOwner: ids.workerId,
    leaseExpiresAt: new Date("2099-01-01T00:00:00.000Z"), creditReservationId: null,
    correctionId: null, replacementFulfillmentId: null
  };
}

async function seedLineage(initialActiveEnhancement: boolean): Promise<void> {
  const sql = getSqlClient();
  const modelProfile = lockedModelProfile;
  const reportProfile = lockedReportProfile;
  const core = coreReport();
  const enhancement = enhancedReport(core);
  const pageText = "Target product and delivery details for diagnosis recovery.";

  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES(${ids.reportId},'https://recovery.example/','recovery.example','{}'::jsonb,'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
     candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.siteSnapshotId},${ids.reportId},'recovery.example','collecting',now()-interval '1 minute',NULL,
      ${sha("collector")},NULL,0,0,0)`;
  await sql`INSERT INTO report_v4_site_snapshot_pages
    (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash,exclusion_reason)
    VALUES(${`page-${suffixForIds()}`},${ids.siteSnapshotId},1,'https://recovery.example/',true,'direct_readable',
      'Recovery page',${pageText},${sha(pageText)},NULL)`;
  await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),
    content_identity_hash=${sha("content")},candidate_url_count=1,analyzable_page_count=1,excluded_page_count=0
    WHERE id=${ids.siteSnapshotId}`;
  await persistReportV4PageSummary({
    reportId: ids.reportId,
    snapshotId: ids.siteSnapshotId,
    pageId: `page-${suffixForIds()}`,
    url: "https://recovery.example/",
    contentHash: sha(pageText),
    readability: "direct_readable",
    sourceLength: pageText.length,
    output: {
      chunks: [{
        order: 1,
        summary: "Question answer product delivery recovery evidence.",
        sourceLocations: [{ locationId: `page-${suffixForIds()}:0-20`, startOffset: 0, endOffset: 20 }]
      }]
    }
  });
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questionSetId},${ids.reportId},1,'en','US','candidate','high','v4','v4',${sha("profile")})`;
  for (const [index, questionId] of questionIds().entries()) {
    const ordinal = index + 1;
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash)
      VALUES(${questionId},${ids.questionSetId},${ordinal},${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][index]!},
        ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Question ${ordinal}?`},${sha(`question-${ordinal}`)})`;
  }
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,progress)
    VALUES(${ids.coreJobId},${ids.reportId},${ids.siteSnapshotId},'deep','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'en','standard',
      'completed','completed','terminalization',100)`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_snapshot_id,business_question_set_id,site_key,
     customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,
     recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,
     payment_status,fulfillment_status,refund_status)
    VALUES(${ids.orderId},${sha(`checkout-${ids.orderId}`)},'airwallex',${ids.reportId},${ids.coreJobId},${ids.siteSnapshotId},
      ${ids.questionSetId},'recovery.example','encrypted',${sha(`email-${ids.orderId}`)},'v1','recommendation_forensics_v1',
      'two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','en','USD',2900,'paid','completed','not_required')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.orderId},status='locked',
    content_hash=${sha("questions")},neutral_content_hash=${sha("neutral")},payload='{}'::jsonb,
    confirmed_at=now(),locked_at=now() WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining)
    VALUES(${ids.accessKeyId},${`key-${suffixForIds()}`},${sha(`key-${ids.accessKeyId}`)},${ids.orderId},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger
    (id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status,settled_at)
    VALUES(${ids.creditId},${ids.accessKeyId},${ids.reportId},${ids.coreJobId},${`settled-${ids.creditId}`},${ids.orderId},1,'settled',now())`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${ids.creditId} WHERE id=${ids.coreJobId}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
     report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${ids.configSnapshotId},${ids.reportId},${ids.orderId},${ids.coreJobId},${configIdentityHash},
      ${modelProfile.profileId},${sha(stableJson(modelProfile))},${JSON.stringify(modelProfile)}::jsonb,
      ${reportProfile.profileId},${sha(stableJson(reportProfile))},${JSON.stringify(reportProfile)}::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,
     payload_identity_hash,html_sha256,readiness,ready_at,activated_at)
    VALUES(${ids.coreArtifactId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.configSnapshotId},
      'generation',1,'combined_geo_report_v4','active',${sha(stableJson(core))},${sha("core-html")},
      '{"htmlCanonical":true}'::jsonb,now(),now())`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
    VALUES(${ids.coreArtifactId},${ids.reportId},${ids.orderId},${ids.coreJobId},${ids.questionSetId},${JSON.stringify(core)}::jsonb)`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.coreArtifactId} WHERE id=${ids.reportId}`;
  await sql`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
    VALUES(${ids.accessTokenId},${ids.reportId},'ogc_report_test',${sha(`token-${ids.accessTokenId}`)},'combined_geo_report_v4',now()+interval '30 days')`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,progress,
     lease_owner,lease_expires_at,credit_reservation_id,correction_id,replacement_fulfillment_id)
    VALUES(${ids.enhancementJobId},${ids.reportId},NULL,'deep','recommendation_forensics_v1','two_stage_geo_report_v4',
      4,'combined_geo_report_v4',${ids.questionSetId},'en','v4_diagnosis_enhancement','analyzing','running',
      'evidence_graph',50,${ids.workerId},now()+interval '10 minutes',NULL,NULL,NULL)`;
  if (!initialActiveEnhancement) return;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,revision_kind,revision,
     artifact_contract,status,payload_identity_hash)
    VALUES(${enhancementArtifactId},${ids.reportId},${ids.orderId},${ids.enhancementJobId},${ids.configSnapshotId},
      ${ids.coreArtifactId},'diagnosis_enhancement',2,'combined_geo_report_v4','pending',
      ${`v4-pending:${ids.enhancementJobId}:${enhancementArtifactId}`})`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload)
    VALUES(${enhancementArtifactId},${ids.reportId},${ids.orderId},${ids.enhancementJobId},${ids.questionSetId},
      ${JSON.stringify(enhancement)}::jsonb)`;
  await sql`UPDATE report_artifact_revisions SET status='ready',payload_identity_hash=${sha(stableJson(enhancement))},
    html_sha256=${sha("enhancement-html")},readiness='{"htmlCanonical":true}'::jsonb,ready_at=now()
    WHERE id=${enhancementArtifactId}`;
  await sql.begin(async (transaction) => {
    await transaction`UPDATE report_artifact_revisions SET status='ready' WHERE id=${ids.coreArtifactId} AND status='active'`;
    await transaction`UPDATE report_artifact_revisions SET status='active',activated_at=now()
      WHERE id=${enhancementArtifactId} AND status='ready'`;
    await transaction`UPDATE scan_reports SET active_artifact_revision_id=${enhancementArtifactId} WHERE id=${ids.reportId}`;
  });
}

function coreReport(): CombinedGeoReportV4 {
  return {
    version: 4, artifactContract: "combined_geo_report_v4", reportId: ids.reportId,
    artifactRevisionId: ids.coreArtifactId, targetUrl: "https://recovery.example/", locale: "en",
    generatedAt: "2026-07-17T00:00:00.000Z", status: "completed",
    websiteSynthesis: { summary: "Website summary.", strengths: ["Strength."], gaps: ["Gap."], actions: ["Action."] },
    questions: questionIds().map((questionId, index) => question(questionId, index + 1)) as unknown as CombinedGeoReportV4["questions"]
  };
}

function enhancedReport(core: CombinedGeoReportV4): CombinedGeoReportV4 {
  return {
    ...core,
    artifactRevisionId: enhancementArtifactId,
    generatedAt: "2026-07-17T00:05:00.000Z",
    questions: core.questions.map((value) => ({ ...value, diagnosis: diagnosis(value) })) as unknown as CombinedGeoReportV4["questions"]
  };
}

function question(questionId: string, order: number): CombinedGeoReportV4Question {
  const sourceId = `${questionId}-source`;
  return {
    order: order as 1 | 2 | 3, questionId, questionText: `Question ${order}?`, status: "answered",
    answer: `Answer ${order}.`,
    sources: [{ questionId, sourceId, title: `Source ${order}`, canonicalUrl: "https://source.example/shared",
      citedText: `Evidence ${order}.`, retrievalStatus: "available" }]
  };
}

function diagnosis(question: CombinedGeoReportV4Question) {
  return diagnosisForEvidence(question.sources[0]!.sourceId);
}

function diagnosisForEvidence(sourceId: string) {
  const evidenceRefs = [sourceId];
  return {
    selectionSummary: "The source directly addresses the question.",
    observableFactors: [
      { kind: "problem_match" as const, observation: "The problem matches.", evidenceRefs },
      { kind: "factual_specificity" as const, observation: "The source is specific.", evidenceRefs },
      { kind: "entity_clarity" as const, observation: "The entity is clear.", evidenceRefs }
    ],
    targetGap: "The target site lacks equivalent details.",
    recommendedActions: [
      { priority: 1 as const, action: "Add exact conditions.", evidenceRefs },
      { priority: 2 as const, action: "Clarify the entity.", evidenceRefs },
      { priority: 3 as const, action: "Keep facts current.", evidenceRefs }
    ],
    detailedEvidenceRefs: evidenceRefs
  };
}

function providerEnvironment(): NodeJS.ProcessEnv {
  return {
    ...testEnvironment,
    OGC_REPORT_V4_MIMO_BASE_URL: "https://api.xiaomimimo.com/v1",
    OGC_REPORT_V4_MIMO_API_KEY: "test-secret"
  };
}

function mimoResponse(value: unknown): Response {
  return new Response(JSON.stringify({
    id: "response-1",
    choices: [{ message: { content: JSON.stringify(value), annotations: [] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function resetIds(label: string): void {
  const next = `${label}-${randomUUID().replaceAll("-", "")}`;
  Object.assign(ids, {
    reportId: `report-${next}`, orderId: `order-${next}`, coreJobId: `core-${next}`,
    enhancementJobId: `enhancement-${next}`, siteSnapshotId: `site-${next}`,
    questionSetId: `questions-${next}`, configSnapshotId: "pending-config-id",
    coreArtifactId: `core-artifact-${next}`, workerId: `worker-${next}`,
    creditId: `credit-${next}`, accessKeyId: `key-${next}`, accessTokenId: `token-${next}`
  });
  configIdentityHash = sha(stableJson({
    coreJobId: ids.coreJobId,
    modelProfileHash: sha(stableJson(lockedModelProfile)),
    orderId: ids.orderId,
    reportId: ids.reportId,
    reportProfileHash: sha(stableJson(lockedReportProfile))
  }));
  ids.configSnapshotId = `v4-config-${configIdentityHash}`;
  ids.enhancementJobId = `v4-diagnosis-job-${sha([
    ids.reportId, ids.orderId, ids.coreJobId, ids.coreArtifactId, ids.configSnapshotId,
    ids.siteSnapshotId, ids.questionSetId, "en"
  ].join("\0"))}`;
  enhancementArtifactId = buildReportV4EnhancementArtifactRevisionId({
    reportId: ids.reportId, orderId: ids.orderId, coreJobId: ids.coreJobId,
    coreArtifactRevisionId: ids.coreArtifactId, configSnapshotId: ids.configSnapshotId,
    siteSnapshotId: ids.siteSnapshotId, questionSetId: ids.questionSetId, locale: "en"
  });
}

function suffixForIds(): string {
  return ids.siteSnapshotId.slice("site-".length);
}

function questionIds(): [string, string, string] {
  return [`${ids.questionSetId}-q1`, `${ids.questionSetId}-q2`, `${ids.questionSetId}-q3`];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }
function restore(key: string, value: string | undefined): void { if (value === undefined) delete process.env[key]; else process.env[key] = value; }

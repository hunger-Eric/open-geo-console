import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { terminalizePaidPublicSourceReport, terminalizePaidReportV4Core, terminalizeUnavailablePaidReportV4Core } from "./public-source-commerce";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "./public-search-authority";
import { acquireMarketSnapshotLease, appendMarketSnapshotQueries, beginMarketSearchAttempt, completeMarketSearchAttempt, completeMarketSnapshotLease, createMarketSnapshotRefresh } from "./market-snapshots";
import { createMarketSnapshotIdentity } from "@open-geo-console/public-search-observer";
import { createTestSourceForensicReport } from "../public-source-forensics/testing";

const adminUrl=process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres=adminUrl?describe:describe.skip;

describe("V4 commerce PostgreSQL fixture conformance",()=>{
  it("uses the V27 content-addressed configuration snapshot identity",()=>{
    const ids=v4Identity("fixture-suffix","complete");
    expect(ids.configSnapshotId).toBe(`v4-config-${ids.configIdentityHash}`);
  });
  it("exposes a dedicated HTML-only all-questions-unavailable terminalizer",()=>{
    expect(terminalizeUnavailablePaidReportV4Core).toBeTypeOf("function");
  });
});

describePostgres("paid public-source atomic terminalization",()=>{
  const suffix=randomUUID().replaceAll("-",""); const databaseName=`ogc_v2_commerce_${suffix}`;
  const reportId=`report-${suffix}`,jobId=`job-${suffix}`,orderId=`order-${suffix}`,workerId=`worker-${suffix}`;
  const checkpointIdentityHash=`checkpoint-${suffix}`; const admin=postgres(adminUrl!,{max:1,prepare:false});
  const originalDatabaseUrl=process.env.DATABASE_URL; const originalTokenSecret=process.env.OGC_TOKEN_HASH_SECRET;
  let report=createTestSourceForensicReport({reportId,jobId});
  const refs:Array<{snapshotId:string;cacheIdentity:string;freshnessState:"fresh";actualCostMicros:number;allocatedCostMicros:number;avoidedCostMicros:number}>=[];
  beforeAll(async()=>{
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`); const databaseUrl=withDatabase(adminUrl!,databaseName);
    const bootstrap=postgres(databaseUrl,{max:1,prepare:false}); try{await bootstrap`CREATE TABLE deployment_environment(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),profile text NOT NULL CHECK(profile IN ('staging','production')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;}finally{await bootstrap.end({timeout:5});}
    process.env.DATABASE_URL=databaseUrl; process.env.OGC_TOKEN_HASH_SECRET="v4-commerce-test-token-secret-value-000000000000";
    await ensureDatabase(); const sql=getSqlClient();
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${reportId},${report.targetUrl},'customer-logistics.example','zh','completed')`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage,execution_state,current_phase,lease_owner,lease_expires_at,checkpoint)
      VALUES(${jobId},${reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'zh','synthesizing','running','terminalization',${workerId},now()+interval '1 hour',${JSON.stringify({publicSourceForensics:{identityHash:checkpointIdentityHash}})}::jsonb)`;
    await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
      VALUES(${orderId},${`checkout-${suffix}`},'airwallex',${reportId},${jobId},'customer-logistics.example','encrypted','email-hmac','v1','recommendation_forensics_v1','public_search_source_forensics_v1',2,'v2','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
    const surface=report.authority.surface; const installed=await installPublicSearchSurfaceAuthority({environment:"staging",adapterId:"fixture",providerId:surface.providerId,productId:surface.productId,modelId:"fixture-model",adapterVersion:surface.adapterVersion,surfaceId:surface.surfaceId,surfaceVersion:surface.surfaceVersion,localeCapabilities:[surface.locale],regionCapabilities:[surface.region],termsReviewedAt:"2030-01-01T00:00:00.000Z",evidenceReferences:["fixture-review"],capturedAt:"2030-01-02T00:00:00.000Z",active:false});
    const authority=await activatePublicSearchSurfaceAuthority({authorityVersion:installed.authorityVersion,environment:"staging",adapterId:installed.adapterId,providerId:installed.providerId,productId:installed.productId,modelId:installed.modelId,adapterVersion:installed.adapterVersion,surfaceId:installed.surfaceId,surfaceVersion:installed.surfaceVersion});
    const snapshotIds:string[]=[];
    for(const [index,question] of report.questions.questions.entries()){
      const identity=createMarketSnapshotIdentity({question,surface,fanout:report.fanouts[index]!}); const claim=await acquireMarketSnapshotLease({cacheIdentity:identity.id,leaseOwner:`snapshot-worker-${index}`,leaseDurationMs:60_000}); if(!claim.acquired)throw new Error("fixture lease");
      const snapshot=await createMarketSnapshotRefresh({identity,authorityVersion:authority.authorityVersion,token:claim.token,questionHash:sha(question.normalizedText)}); const query={id:`query-${suffix}-${index}`,queryOrder:0,queryText:question.normalizedText,queryHash:sha(question.normalizedText),derivationRule:"canonical"};
      await appendMarketSnapshotQueries({snapshotId:snapshot.id,token:claim.token,queries:[query]}); const attempt=await beginMarketSearchAttempt({snapshotId:snapshot.id,queryId:query.id,token:claim.token,idempotencyReference:`attempt-${suffix}-${index}`,configuredCostMicros:10});
      await completeMarketSearchAttempt({attemptId:attempt.id,token:claim.token,requestStatus:"succeeded",usage:{requestCount:1,resultCount:0},providerCostMicros:10,costUncertain:false}); await completeMarketSnapshotLease({snapshotId:snapshot.id,token:claim.token,queryFanoutHash:sha(`fanout-${index}`)});
      snapshotIds.push(snapshot.id); refs.push({snapshotId:snapshot.id,cacheIdentity:identity.id,freshnessState:"fresh",actualCostMicros:10,allocatedCostMicros:0,avoidedCostMicros:0});
    }
    const evidenceCutoffAt=new Date((await sql<Array<{now:Date}>>`SELECT clock_timestamp() AS now`)[0]!.now).toISOString();
    report={...report,generatedAt:evidenceCutoffAt,evidenceCutoffAt,snapshotRefs:report.snapshotRefs.map((ref,index)=>({...ref,snapshotId:snapshotIds[index]!}))};
    await seedPaidV4Core(sql,v4Identity(suffix,"complete"),"completed");
    await seedPaidV4Core(sql,v4Identity(suffix,"limited"),"completed_limited");
    await seedPaidV4Core(sql,v4Identity(suffix,"missing-config"),"completed",false);
    await seedUnavailablePaidV4Core(sql,v4UnavailableIdentity(suffix,"unavailable"));
    await seedUnavailablePaidV4Core(sql,v4UnavailableIdentity(suffix,"unavailable-call-counts"),undefined,"completed",[0,1,2]);
    await seedUnavailablePaidV4Core(sql,v4UnavailableIdentity(suffix,"unavailable-limited-site"),undefined,"completed_limited");
    await seedUnavailablePaidV4Core(sql,v4UnavailableIdentity(suffix,"one-answered"),["unavailable","answered","unavailable"]);
    await seedUnavailablePaidV4Core(sql,v4UnavailableIdentity(suffix,"nonterminal"),["unavailable","answering","unavailable"]);
    const rejects=v4UnavailableIdentity(suffix,"rejects");
    await seedUnavailablePaidV4Core(sql,rejects);
    await seedStandaloneUnavailableSnapshot(sql,rejects);
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
      VALUES(${rejects.enhancementJobId},${rejects.reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${rejects.questionSetId},'zh','v4_diagnosis_enhancement')`;
  },120_000);
  afterAll(async()=>{await closeDatabase();if(originalDatabaseUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalDatabaseUrl;if(originalTokenSecret===undefined)delete process.env.OGC_TOKEN_HASH_SECRET;else process.env.OGC_TOKEN_HASH_SECRET=originalTokenSecret;await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);await admin.end({timeout:5});},120_000);
  it("rolls back every injected write boundary and succeeds exactly once on retry",async()=>{
    for(const faultAfter of ["report","refs","job","credit","order","email"] as const){
      await expect(terminalizePaidPublicSourceReport({report,workerId,checkpointIdentityHash,coverage:{plannedPages:3,successfulPages:3,failedPages:0},snapshotRefs:refs,faultAfter})).rejects.toThrow(/Injected fault/);
      const counts=(await getSqlClient()<Array<{reports:number;refs:number;emails:number;refunds:number;stage:string;fulfillment:string}>>`SELECT (SELECT count(*)::int FROM report_source_forensics) reports,(SELECT count(*)::int FROM report_market_snapshot_refs) refs,(SELECT count(*)::int FROM email_deliveries) emails,(SELECT count(*)::int FROM payment_refunds) refunds,(SELECT stage FROM scan_jobs WHERE id=${jobId}) stage,(SELECT fulfillment_status FROM payment_orders WHERE id=${orderId}) fulfillment`)[0]!;
      expect(counts).toMatchObject({reports:0,refs:0,emails:0,refunds:0,stage:"synthesizing",fulfillment:"processing"});
    }
    const result=await terminalizePaidPublicSourceReport({report,workerId,checkpointIdentityHash,coverage:{plannedPages:3,successfulPages:3,failedPages:0},snapshotRefs:refs}); expect(result).toMatchObject({orderId,refundId:null});
    const counts=(await getSqlClient()<Array<{reports:number;refs:number;emails:number;stage:string;fulfillment:string}>>`SELECT (SELECT count(*)::int FROM report_source_forensics) reports,(SELECT count(*)::int FROM report_market_snapshot_refs) refs,(SELECT count(*)::int FROM email_deliveries) emails,(SELECT stage FROM scan_jobs WHERE id=${jobId}) stage,(SELECT fulfillment_status FROM payment_orders WHERE id=${orderId}) fulfillment`)[0]!;
    expect(counts).toMatchObject({reports:1,refs:3,emails:1,stage:"completed",fulfillment:"completed"});
  });

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-DELIVERY-01
  // @requirement GEO-V4-PDF-01
  it("atomically terminalizes one HTML-only V4 core and remains idempotent after diagnosis activation",async()=>{
    const ids=v4Identity(suffix,"complete"),core=v4Report(ids,"completed");
    for(const faultAfter of ["job","credit","order","access","email"] as const){
      await expect(terminalizePaidReportV4Core({report:core,workerId:ids.workerId,faultAfter})).rejects.toThrow(/Injected fault/);
      expect(await readV4CommerceState(getSqlClient(),ids)).toMatchObject({
        stage:"synthesizing",execution_state:"running",fulfillment_status:"processing",credit_status:"reserved",
        credits_remaining:0,refunds:0,emails:0,tokens:0,transitions:0
      });
    }
    const first=await terminalizePaidReportV4Core({report:core,workerId:ids.workerId});
    expect(first).toMatchObject({outcome:"completed",orderId:ids.orderId,refundId:null});
    const terminal=await readV4CommerceState(getSqlClient(),ids);
    expect(terminal).toMatchObject({stage:"completed",execution_state:"completed",fulfillment_status:"completed",
      refund_status:"not_required",credit_status:"settled",credits_remaining:0,refunds:0,emails:1,tokens:1,transitions:1,
      token_scope:"combined_geo_report_v4",pdf_sha256:null,pdf_storage_key:null});
    expect(await terminalizePaidReportV4Core({report:core,workerId:ids.workerId})).toMatchObject({
      accessTokenId:first.accessTokenId,emailDeliveryId:first.emailDeliveryId
    });
    expect(await readV4CommerceState(getSqlClient(),ids)).toEqual(terminal);

    await activateV4DiagnosisFixture(getSqlClient(),ids);
    expect(await terminalizePaidReportV4Core({report:core,workerId:ids.workerId})).toMatchObject({
      accessTokenId:first.accessTokenId,emailDeliveryId:first.emailDeliveryId
    });
    const afterEnhancement=await readV4CommerceState(getSqlClient(),ids);
    expect(afterEnhancement).toMatchObject({emails:1,tokens:1,refunds:0,transitions:1,credits_remaining:0,credit_status:"settled"});
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  it("refunds a limited V4 outcome exactly once without duplicating credit, cash refund, access or email",async()=>{
    const ids=v4Identity(suffix,"limited"),core=v4Report(ids,"completed_limited");
    const first=await terminalizePaidReportV4Core({report:core,workerId:ids.workerId});
    expect(first).toMatchObject({outcome:"completed_limited",orderId:ids.orderId,refundId:expect.any(String)});
    const terminal=await readV4CommerceState(getSqlClient(),ids);
    expect(terminal).toMatchObject({stage:"completed_limited",execution_state:"completed",fulfillment_status:"completed_limited",
      refund_status:"pending",credit_status:"refunded",credits_remaining:1,refunds:1,refund_reason:"completed_limited",
      emails:1,tokens:1,transitions:1,token_scope:"combined_geo_report_v4"});
    expect(await terminalizePaidReportV4Core({report:core,workerId:ids.workerId})).toMatchObject({
      refundId:first.refundId,accessTokenId:first.accessTokenId,emailDeliveryId:first.emailDeliveryId
    });
    expect(await readV4CommerceState(getSqlClient(),ids)).toEqual(terminal);
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-DELIVERY-01
  it("rejects a V27-compatible V4 core whose configuration snapshot binding is NULL",async()=>{
    const ids=v4Identity(suffix,"missing-config"),core=v4Report(ids,"completed");
    await expect(terminalizePaidReportV4Core({report:core,workerId:ids.workerId})).rejects.toThrow(/configuration snapshot/i);
    expect(await readV4CommerceState(getSqlClient(),ids)).toMatchObject({
      stage:"synthesizing",execution_state:"running",fulfillment_status:"processing",credit_status:"reserved",
      refunds:0,emails:0,tokens:0,transitions:0,pdf_sha256:null,pdf_storage_key:null
    });
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-DELIVERY-01
  // @requirement GEO-V4-PDF-01
  it("atomically refunds an analyzable V4 core with exactly three unavailable checkpoints and reenters without duplicates",async()=>{
    const ids=v4UnavailableIdentity(suffix,"unavailable"),input=v4UnavailableInput(ids);
    for(const faultAfter of ["job","access","credit","order","refund","email"] as const){
      await expect(terminalizeUnavailablePaidReportV4Core({...input,faultAfter})).rejects.toThrow(/Injected fault/);
      expect(await readUnavailableV4CommerceState(getSqlClient(),ids)).toMatchObject({
        stage:"synthesizing",execution_state:"running",lease_owner:ids.workerId,retry_not_before:null,
        fulfillment_status:"processing",refund_status:"not_required",delivery_status:"not_queued",
        credit_status:"reserved",credits_remaining:0,refunds:0,emails:0,tokens:0,artifacts:0,combined_reports:0,transitions:0
      });
    }
    const first=await terminalizeUnavailablePaidReportV4Core(input);
    expect(first).toMatchObject({outcome:"unavailable",reportId:ids.reportId,coreJobId:ids.jobId,orderId:ids.orderId,
      siteSnapshotId:ids.siteSnapshotId,questionSetId:ids.questionSetId,configSnapshotId:ids.configSnapshotId,
      creditReservationId:ids.creditId,refundId:expect.any(String),emailDeliveryId:expect.any(String)});
    const terminal=await readUnavailableV4CommerceState(getSqlClient(),ids);
    expect(terminal).toMatchObject({stage:"failed",execution_state:"failed",lease_owner:null,retry_not_before:null,
      repair_reason_code:null,fulfillment_status:"failed",refund_status:"pending",delivery_status:"queued",
      credit_status:"refunded",credits_remaining:1,refunds:1,refund_reason:"report_failed",emails:1,
      email_template:"report_failed_refund",tokens:0,artifacts:0,combined_reports:0,transitions:1,
      error_code:"report_v4_all_questions_unavailable"});
    expect(await terminalizeUnavailablePaidReportV4Core(input)).toMatchObject({
      refundId:first.refundId,emailDeliveryId:first.emailDeliveryId
    });
    expect(await readUnavailableV4CommerceState(getSqlClient(),ids)).toEqual(terminal);
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  it("rejects one answered or one nonterminal question checkpoint with zero commercial side effects",async()=>{
    for(const label of ["one-answered","nonterminal"]){
      const ids=v4UnavailableIdentity(suffix,label);
      await expect(terminalizeUnavailablePaidReportV4Core(v4UnavailableInput(ids))).rejects.toThrow(/all three exact/i);
      expect(await readUnavailableV4CommerceState(getSqlClient(),ids)).toMatchObject({
        stage:"synthesizing",execution_state:"running",credit_status:"reserved",credits_remaining:0,
        fulfillment_status:"processing",refund_status:"not_required",refunds:0,emails:0,tokens:0,artifacts:0,transitions:0
      });
    }
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  it("accepts an analyzable completed_limited site snapshot only when all three questions are unavailable",async()=>{
    const ids=v4UnavailableIdentity(suffix,"unavailable-limited-site");
    await expect(terminalizeUnavailablePaidReportV4Core(v4UnavailableInput(ids))).resolves.toMatchObject({
      outcome:"unavailable",siteSnapshotId:ids.siteSnapshotId,refundId:expect.any(String)
    });
    expect(await readUnavailableV4CommerceState(getSqlClient(),ids)).toMatchObject({
      stage:"failed",credit_status:"refunded",credits_remaining:1,fulfillment_status:"failed",
      refund_reason:"report_failed",tokens:0,artifacts:0,combined_reports:0
    });
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  it("refunds three terminal unavailable checkpoints with zero, one and two provider calls",async()=>{
    const ids=v4UnavailableIdentity(suffix,"unavailable-call-counts");
    await expect(terminalizeUnavailablePaidReportV4Core(v4UnavailableInput(ids))).resolves.toMatchObject({
      outcome:"unavailable",refundId:expect.any(String),emailDeliveryId:expect.any(String)
    });
    expect(await readUnavailableV4CommerceState(getSqlClient(),ids)).toMatchObject({
      stage:"failed",credit_status:"refunded",credits_remaining:1,fulfillment_status:"failed",
      refunds:1,emails:1,tokens:0,artifacts:0,transitions:1
    });
  },120_000);

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-PDF-01
  it("rejects zero-page, lineage-drift, enhancement-job and PDF-shaped inputs without writes",async()=>{
    const ids=v4UnavailableIdentity(suffix,"rejects"),base=v4UnavailableInput(ids);
    await expect(terminalizeUnavailablePaidReportV4Core({...base,siteSnapshotId:ids.zeroPageSnapshotId})).rejects.toThrow();
    await expect(terminalizeUnavailablePaidReportV4Core({...base,configSnapshotId:`${ids.configSnapshotId}-drift`})).rejects.toThrow(/configuration snapshot/i);
    await expect(terminalizeUnavailablePaidReportV4Core({...base,coreJobId:ids.enhancementJobId})).rejects.toThrow(/standard paid core/i);
    await expect(terminalizeUnavailablePaidReportV4Core({...base,pdfStorageKey:"forbidden"} as never)).rejects.toThrow(/PDF/i);
    expect(await readUnavailableV4CommerceState(getSqlClient(),ids)).toMatchObject({
      stage:"synthesizing",execution_state:"running",credit_status:"reserved",credits_remaining:0,
      fulfillment_status:"processing",refund_status:"not_required",refunds:0,emails:0,tokens:0,artifacts:0,transitions:0
    });
  },120_000);
});

interface V4FixtureIdentity { reportId:string;jobId:string;orderId:string;questionSetId:string;artifactRevisionId:string;configSnapshotId:string;configIdentityHash:string;workerId:string;accessKeyId:string;creditId:string;label:string; }
function v4Identity(suffix:string,label:string):V4FixtureIdentity{const configIdentityHash=sha(`config-${label}`);return{label,reportId:`v4-report-${label}-${suffix}`,jobId:`v4-job-${label}-${suffix}`,orderId:`v4-order-${label}-${suffix}`,questionSetId:`v4-questions-${label}-${suffix}`,artifactRevisionId:`v4-core-${label}-${suffix}`,configSnapshotId:`v4-config-${configIdentityHash}`,configIdentityHash,workerId:`v4-worker-${label}-${suffix}`,accessKeyId:`v4-key-${label}-${suffix}`,creditId:`v4-credit-${label}-${suffix}`};}
function v4Report(ids:V4FixtureIdentity,status:"completed"|"completed_limited") {return{version:4,artifactContract:"combined_geo_report_v4",reportId:ids.reportId,artifactRevisionId:ids.artifactRevisionId,targetUrl:`https://${ids.label}.example/`,locale:"zh-CN",generatedAt:"2026-07-17T00:00:00.000Z",status,websiteSynthesis:{summary:"Public website summary",strengths:["Clear service description"],gaps:["Missing delivery details"],actions:["Publish verifiable delivery terms"]},questions:[1,2,3].map(order=>({order,questionId:`${ids.questionSetId}-q${order}`,questionText:`Business question ${order}`,status:"answered",answer:`Business answer ${order}`,sources:[]}))};}
async function seedPaidV4Core(sql:ReturnType<typeof getSqlClient>,ids:V4FixtureIdentity,status:"completed"|"completed_limited",bindConfigSnapshot=true){
  const payload=v4Report(ids,status);
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status) VALUES(${ids.reportId},${payload.targetUrl},${`${ids.label}.example`},'{}','zh','completed')`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questionSetId},${ids.reportId},1,'zh','CN','candidate','high','v4','v4',${`profile-${ids.label}`})`;
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,lease_owner,lease_expires_at)
    VALUES(${ids.jobId},${ids.reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'zh','standard','synthesizing','running','terminalization',${ids.workerId},now()+interval '1 hour')`;
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
    VALUES(${ids.orderId},${`checkout-${ids.label}-${ids.reportId}`},'airwallex',${ids.reportId},${ids.jobId},${`${ids.label}.example`},'encrypted',${`email-${ids.label}`},'v1','recommendation_forensics_v1',${ids.questionSetId},'two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.orderId} WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining) VALUES(${ids.accessKeyId},${`key-${ids.label}`},${`key-hmac-${ids.label}-${ids.reportId}`},${ids.orderId},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status) VALUES(${ids.creditId},${ids.accessKeyId},${ids.reportId},${ids.jobId},${`reserve-${ids.label}`},${ids.orderId},1,'reserved')`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${ids.creditId} WHERE id=${ids.jobId}`;
  if(bindConfigSnapshot)await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${ids.configSnapshotId},${ids.reportId},${ids.orderId},${ids.jobId},${ids.configIdentityHash},${`model-${ids.label}`},${sha(`model-${ids.label}`)},${JSON.stringify({profileId:`model-${ids.label}`})}::jsonb,${`report-profile-${ids.label}`},${sha(`report-profile-${ids.label}`)},${JSON.stringify({profileId:`report-profile-${ids.label}`})}::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key,readiness,ready_at,activated_at)
    VALUES(${ids.artifactRevisionId},${ids.reportId},${ids.orderId},${ids.jobId},${bindConfigSnapshot?ids.configSnapshotId:null},'generation',1,'combined_geo_report_v4','active',${sha(JSON.stringify(payload))},${sha(`html-${ids.label}`)},NULL,NULL,'{"htmlCanonical":true}'::jsonb,now(),now())`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload) VALUES(${ids.artifactRevisionId},${ids.reportId},${ids.orderId},${ids.jobId},${ids.questionSetId},${JSON.stringify(payload)}::jsonb)`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.artifactRevisionId} WHERE id=${ids.reportId}`;
}
async function activateV4DiagnosisFixture(sql:ReturnType<typeof getSqlClient>,ids:V4FixtureIdentity){
  const enhancementJob=`v4-enhancement-job-${ids.label}-${ids.reportId}`,enhancementRevision=`v4-enhancement-${ids.label}-${ids.reportId}`;
  const enhanced={...v4Report(ids,"completed"),artifactRevisionId:enhancementRevision,questions:v4Report(ids,"completed").questions.map((question,index)=>index?question:{...question,diagnosis:{selectionSummary:"Source selection summary",observableFactors:[1,2,3].map(item=>({kind:`factor-${item}`,observation:`observation-${item}`,evidenceRefs:[]})),targetGap:"Target website gap",recommendedActions:[1,2,3].map(priority=>({priority,action:`action-${priority}`,evidenceRefs:[]})),detailedEvidenceRefs:[]}})};
  await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason) VALUES(${enhancementJob},${ids.reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'zh','v4_diagnosis_enhancement')`;
  await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,config_snapshot_id,source_artifact_revision_id,revision_kind,revision,artifact_contract,status,payload_identity_hash)
    VALUES(${enhancementRevision},${ids.reportId},${ids.orderId},${enhancementJob},${ids.configSnapshotId},${ids.artifactRevisionId},'diagnosis_enhancement',2,'combined_geo_report_v4','pending',${sha(JSON.stringify(enhanced))})`;
  await sql`INSERT INTO combined_geo_reports(artifact_revision_id,report_id,order_id,job_id,question_set_id,payload) VALUES(${enhancementRevision},${ids.reportId},${ids.orderId},${enhancementJob},${ids.questionSetId},${JSON.stringify(enhanced)}::jsonb)`;
  await sql`UPDATE report_artifact_revisions SET status='ready',html_sha256=${sha('enhanced-html')},pdf_sha256=NULL,pdf_storage_key=NULL,readiness='{"htmlCanonical":true}'::jsonb,ready_at=now() WHERE id=${enhancementRevision} AND status='pending'`;
  await sql`UPDATE report_artifact_revisions SET status='ready',activated_at=NULL WHERE id=${ids.artifactRevisionId} AND status='active'`;
  await sql`UPDATE report_artifact_revisions SET status='active',activated_at=now() WHERE id=${enhancementRevision} AND status='ready'`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${enhancementRevision} WHERE id=${ids.reportId}`;
}
async function readV4CommerceState(sql:ReturnType<typeof getSqlClient>,ids:V4FixtureIdentity){return(await sql<Array<Record<string,unknown>>>`SELECT job.stage,job.execution_state,orders.fulfillment_status,orders.refund_status,credit.status credit_status,keys.credits_remaining,
  (SELECT count(*)::int FROM payment_refunds WHERE order_id=${ids.orderId}) refunds,(SELECT reason FROM payment_refunds WHERE order_id=${ids.orderId}) refund_reason,
  (SELECT count(*)::int FROM email_deliveries WHERE order_id=${ids.orderId}) emails,(SELECT count(*)::int FROM report_access_tokens WHERE report_id=${ids.reportId}) tokens,
  (SELECT artifact_scope FROM report_access_tokens WHERE report_id=${ids.reportId} LIMIT 1) token_scope,
  (SELECT count(*)::int FROM scan_job_transition_events WHERE job_id=${ids.jobId}) transitions,artifact.pdf_sha256,artifact.pdf_storage_key
  FROM scan_jobs job JOIN payment_orders orders ON orders.id=${ids.orderId} JOIN credit_ledger credit ON credit.id=${ids.creditId} JOIN access_keys keys ON keys.id=${ids.accessKeyId}
  JOIN report_artifact_revisions artifact ON artifact.id=${ids.artifactRevisionId} WHERE job.id=${ids.jobId}`)[0]!;}

interface V4UnavailableFixtureIdentity extends V4FixtureIdentity {
  siteSnapshotId:string;zeroPageSnapshotId:string;enhancementJobId:string;
}
function v4UnavailableIdentity(suffix:string,label:string):V4UnavailableFixtureIdentity{
  return {...v4Identity(suffix,label),siteSnapshotId:`v4-site-${label}-${suffix}`,
    zeroPageSnapshotId:`v4-site-zero-${label}-${suffix}`,enhancementJobId:`v4-enhancement-job-${label}-${suffix}`};
}
function v4UnavailableInput(ids:V4UnavailableFixtureIdentity){return{
  reportId:ids.reportId,coreJobId:ids.jobId,orderId:ids.orderId,siteSnapshotId:ids.siteSnapshotId,
  questionSetId:ids.questionSetId,configSnapshotId:ids.configSnapshotId,locale:"zh-CN",workerId:ids.workerId
};}
async function seedUnavailablePaidV4Core(
  sql:ReturnType<typeof getSqlClient>,ids:V4UnavailableFixtureIdentity,
  states:readonly ("unavailable"|"answered"|"answering")[]=["unavailable","unavailable","unavailable"],
  snapshotStatus:"completed"|"completed_limited"="completed",
  providerCallCounts:readonly number[]=[1,1,1]
){
  const contentHash=sha(`site-content-${ids.label}`),modelProfileHash=sha(`model-${ids.label}`);
  const questionPayload={questions:[1,2,3].map(order=>({order,questionId:`${ids.questionSetId}-q${order}`,questionText:`Business question ${order}`}))};
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES(${ids.reportId},${`https://${ids.label}.example/`},${`${ids.label}.example`},'{}','zh','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.siteSnapshotId},${ids.reportId},${`${ids.label}.example`},${snapshotStatus},now()-interval '1 minute',now(),${sha(`collector-${ids.label}`)},${contentHash},${snapshotStatus==="completed"?3:4},3,${snapshotStatus==="completed"?0:1})`;
  await sql`INSERT INTO report_business_question_sets(id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questionSetId},${ids.reportId},1,'zh','CN','candidate','high','v4','v4',${`profile-${ids.label}`})`;
  for(const ordinal of [1,2,3])await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,neutral_public_text,neutral_content_hash,derivation)
    VALUES(${`${ids.questionSetId}-q${ordinal}`},${ids.questionSetId},${ordinal},${["core_service_discovery","customer_region_fit","purchase_delivery_risk"][ordinal-1]!},${`Generated question ${ordinal}`},${`Business question ${ordinal}`},${sha(`question-${ids.label}-${ordinal}`)},'{}'::jsonb)`;
  await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,lease_owner,lease_expires_at)
    VALUES(${ids.jobId},${ids.reportId},${ids.siteSnapshotId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4',${ids.questionSetId},'zh','standard','synthesizing','running','terminalization',${ids.workerId},now()+interval '1 hour')`;
  await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
    VALUES(${ids.orderId},${`checkout-${ids.label}-${ids.reportId}`},'airwallex',${ids.reportId},${ids.siteSnapshotId},${ids.jobId},${`${ids.label}.example`},'encrypted',${`email-${ids.label}`},'v1','recommendation_forensics_v1',${ids.questionSetId},'two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
  await sql`UPDATE report_business_question_sets SET order_id=${ids.orderId},status='locked',confirmed_at=now(),locked_at=now(),
    content_hash=${sha(`content-${ids.label}`)},neutral_content_hash=${sha(`neutral-${ids.label}`)},payload=${JSON.stringify(questionPayload)}::jsonb
    WHERE id=${ids.questionSetId}`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining)
    VALUES(${ids.accessKeyId},${`key-${ids.label}`},${`key-hmac-${ids.label}-${ids.reportId}`},${ids.orderId},'exhausted',0)`;
  await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,job_id,idempotency_key,payment_order_id,credits,status)
    VALUES(${ids.creditId},${ids.accessKeyId},${ids.reportId},${ids.jobId},${`reserve-${ids.label}`},${ids.orderId},1,'reserved')`;
  await sql`UPDATE scan_jobs SET credit_reservation_id=${ids.creditId} WHERE id=${ids.jobId}`;
  await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${ids.configSnapshotId},${ids.reportId},${ids.orderId},${ids.jobId},${ids.configIdentityHash},${`model-${ids.label}`},${modelProfileHash},${JSON.stringify({profileId:`model-${ids.label}`})}::jsonb,${`report-profile-${ids.label}`},${sha(`report-profile-${ids.label}`)},${JSON.stringify({profileId:`report-profile-${ids.label}`})}::jsonb)`;
  for(const ordinal of [1,2,3]){
    const state=states[ordinal-1]!,answered=state==="answered";
    await sql`INSERT INTO report_v4_question_checkpoints(identity_hash,report_id,job_id,question_set_id,question_id,snapshot_id,ordinal,state,question_identity_hash,model_config_identity_hash,input_identity_hash,provider_call_count,answer_payload,source_payload,answer_content_hash)
      VALUES(${sha(`checkpoint-${ids.label}-${ordinal}`)},${ids.reportId},${ids.jobId},${ids.questionSetId},${`${ids.questionSetId}-q${ordinal}`},${ids.siteSnapshotId},${ordinal},${state},${sha(`question-identity-${ids.label}-${ordinal}`)},${modelProfileHash},${sha(`input-${ids.label}-${ordinal}`)},${providerCallCounts[ordinal-1]!},${answered?JSON.stringify({answer:`Business answer ${ordinal}`}):null}::jsonb,'[]'::jsonb,${answered?sha(`answer-${ids.label}-${ordinal}`):null})`;
  }
}
async function seedStandaloneUnavailableSnapshot(sql:ReturnType<typeof getSqlClient>,ids:V4UnavailableFixtureIdentity){
  await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count)
    VALUES(${ids.zeroPageSnapshotId},${ids.reportId},${`${ids.label}.example`},'unavailable',now()-interval '1 minute',now(),${sha(`zero-collector-${ids.label}`)},${sha(`zero-content-${ids.label}`)},0,0,0)`;
}
async function readUnavailableV4CommerceState(sql:ReturnType<typeof getSqlClient>,ids:V4UnavailableFixtureIdentity){return(await sql<Array<Record<string,unknown>>>`
  SELECT job.stage,job.execution_state,job.lease_owner,job.retry_not_before,job.repair_reason_code,job.error_code,
    orders.fulfillment_status,orders.refund_status,orders.delivery_status,credit.status AS credit_status,keys.credits_remaining,
    (SELECT count(*)::int FROM payment_refunds WHERE order_id=${ids.orderId}) refunds,
    (SELECT reason FROM payment_refunds WHERE order_id=${ids.orderId}) refund_reason,
    (SELECT count(*)::int FROM email_deliveries WHERE order_id=${ids.orderId}) emails,
    (SELECT template_type FROM email_deliveries WHERE order_id=${ids.orderId} LIMIT 1) email_template,
    (SELECT count(*)::int FROM report_access_tokens WHERE report_id=${ids.reportId}) tokens,
    (SELECT count(*)::int FROM report_artifact_revisions WHERE job_id=${ids.jobId}) artifacts,
    (SELECT count(*)::int FROM combined_geo_reports WHERE job_id=${ids.jobId}) combined_reports,
    (SELECT count(*)::int FROM scan_job_transition_events WHERE job_id=${ids.jobId}) transitions
  FROM scan_jobs job JOIN payment_orders orders ON orders.id=${ids.orderId}
  JOIN credit_ledger credit ON credit.id=${ids.creditId} JOIN access_keys keys ON keys.id=${ids.accessKeyId}
  WHERE job.id=${ids.jobId}`)[0]!;}
function sha(value:string){return createHash("sha256").update(value).digest("hex");} function withDatabase(url:string,database:string){const parsed=new URL(url);parsed.pathname=`/${database}`;return parsed.toString();} function quote(value:string){return `"${value.replaceAll('"','""')}"`;}

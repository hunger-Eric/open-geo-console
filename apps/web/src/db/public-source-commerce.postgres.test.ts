import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { terminalizePaidPublicSourceReport } from "./public-source-commerce";
import { activatePublicSearchSurfaceAuthority, installPublicSearchSurfaceAuthority } from "./public-search-authority";
import { acquireMarketSnapshotLease, appendMarketSnapshotQueries, beginMarketSearchAttempt, completeMarketSearchAttempt, completeMarketSnapshotLease, createMarketSnapshotRefresh } from "./market-snapshots";
import { createMarketSnapshotIdentity } from "@open-geo-console/public-search-observer";
import { createTestSourceForensicReport } from "../public-source-forensics/testing";

const adminUrl=process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres=adminUrl?describe:describe.skip;

describePostgres("paid public-source atomic terminalization",()=>{
  const suffix=randomUUID().replaceAll("-",""); const databaseName=`ogc_v2_commerce_${suffix}`;
  const reportId=`report-${suffix}`,jobId=`job-${suffix}`,orderId=`order-${suffix}`,workerId=`worker-${suffix}`;
  const checkpointIdentityHash=`checkpoint-${suffix}`; const admin=postgres(adminUrl!,{max:1,prepare:false});
  const originalDatabaseUrl=process.env.DATABASE_URL; let report=createTestSourceForensicReport({reportId,jobId});
  const refs:Array<{snapshotId:string;cacheIdentity:string;freshnessState:"fresh";actualCostMicros:number;allocatedCostMicros:number;avoidedCostMicros:number}>=[];
  beforeAll(async()=>{
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`); const databaseUrl=withDatabase(adminUrl!,databaseName);
    const bootstrap=postgres(databaseUrl,{max:1,prepare:false}); try{await bootstrap`CREATE TABLE deployment_environment(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),profile text NOT NULL CHECK(profile IN ('staging','production')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;}finally{await bootstrap.end({timeout:5});}
    process.env.DATABASE_URL=databaseUrl; await ensureDatabase(); const sql=getSqlClient();
    await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${reportId},${report.targetUrl},'customer-logistics.example','zh','completed')`;
    await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage,lease_owner,lease_expires_at,checkpoint)
      VALUES(${jobId},${reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'zh','synthesizing',${workerId},now()+interval '1 hour',${JSON.stringify({publicSourceForensics:{identityHash:checkpointIdentityHash}})}::jsonb)`;
    await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
      VALUES(${orderId},${`checkout-${suffix}`},'airwallex',${reportId},${jobId},'customer-logistics.example','encrypted','email-hmac','v1','recommendation_forensics_v1','public_search_source_forensics_v1',2,'v2','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
    const surface=report.authority.surface; const installed=await installPublicSearchSurfaceAuthority({environment:"staging",adapterId:"fixture",providerId:surface.providerId,productId:surface.productId,modelId:"fixture-model",adapterVersion:surface.adapterVersion,surfaceId:surface.surfaceId,surfaceVersion:surface.surfaceVersion,localeCapabilities:[surface.locale],regionCapabilities:[surface.region],termsReviewedAt:"2030-01-01T00:00:00.000Z",evidenceReferences:["fixture-review"],capturedAt:"2030-01-02T00:00:00.000Z",active:false});
    const authority=await activatePublicSearchSurfaceAuthority({authorityVersion:installed.authorityVersion,environment:"staging",adapterId:installed.adapterId,providerId:installed.providerId,productId:installed.productId,modelId:installed.modelId,adapterVersion:installed.adapterVersion,surfaceId:installed.surfaceId,surfaceVersion:installed.surfaceVersion});
    const snapshotIds:string[]=[];
    for(const [index,question] of report.questions.questions.entries()){
      const identity=createMarketSnapshotIdentity({question,surface,fanoutVersion:report.fanouts[index]!.fanoutVersion}); const claim=await acquireMarketSnapshotLease({cacheIdentity:identity.id,leaseOwner:`snapshot-worker-${index}`,leaseDurationMs:60_000}); if(!claim.acquired)throw new Error("fixture lease");
      const snapshot=await createMarketSnapshotRefresh({identity,authorityVersion:authority.authorityVersion,token:claim.token,questionHash:sha(question.normalizedText)}); const query={id:`query-${suffix}-${index}`,queryOrder:0,queryText:question.normalizedText,queryHash:sha(question.normalizedText),derivationRule:"canonical"};
      await appendMarketSnapshotQueries({snapshotId:snapshot.id,token:claim.token,queries:[query]}); const attempt=await beginMarketSearchAttempt({snapshotId:snapshot.id,queryId:query.id,token:claim.token,idempotencyReference:`attempt-${suffix}-${index}`,configuredCostMicros:10});
      await completeMarketSearchAttempt({attemptId:attempt.id,token:claim.token,requestStatus:"succeeded",usage:{requestCount:1,resultCount:0},providerCostMicros:10,costUncertain:false}); await completeMarketSnapshotLease({snapshotId:snapshot.id,token:claim.token,queryFanoutHash:sha(`fanout-${index}`)});
      snapshotIds.push(snapshot.id); refs.push({snapshotId:snapshot.id,cacheIdentity:identity.id,freshnessState:"fresh",actualCostMicros:10,allocatedCostMicros:0,avoidedCostMicros:0});
    }
    const evidenceCutoffAt=new Date((await sql<Array<{now:Date}>>`SELECT clock_timestamp() AS now`)[0]!.now).toISOString();
    report={...report,generatedAt:evidenceCutoffAt,evidenceCutoffAt,snapshotRefs:report.snapshotRefs.map((ref,index)=>({...ref,snapshotId:snapshotIds[index]!}))};
  },120_000);
  afterAll(async()=>{await closeDatabase();if(originalDatabaseUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalDatabaseUrl;await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);await admin.end({timeout:5});},120_000);
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
});
function sha(value:string){return createHash("sha256").update(value).digest("hex");} function withDatabase(url:string,database:string){const parsed=new URL(url);parsed.pathname=`/${database}`;return parsed.toString();} function quote(value:string){return `"${value.replaceAll('"','""')}"`;}

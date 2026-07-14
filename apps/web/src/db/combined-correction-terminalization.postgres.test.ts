import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@open-geo-console/ai-report-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@open-geo-console/ai-report-engine")>();
  return { ...actual, requireReadyCombinedGeoReportV3: (value: unknown) => value };
});

import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { terminalizePaidCombinedReport } from "./combined-correction-terminalization";

const adminUrl=process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describePostgres=adminUrl?describe:describe.skip;

describePostgres("paid combined V3 atomic terminalization",()=>{
  const suffix=randomUUID().replaceAll("-","");
  const databaseName=`ogc_combined_v3_${suffix}`;
  const workerId=`worker-${suffix}`;
  const checkpointIdentityHash=`answer-${suffix}`;
  const admin=postgres(adminUrl!,{max:1,prepare:false});
  const originalDatabaseUrl=process.env.DATABASE_URL;
  const outcomes=["completed","completed_limited","failed"] as const;
  const records=outcomes.map((outcome)=>({outcome,reportId:`report-${outcome}-${suffix}`,jobId:`job-${outcome}-${suffix}`,
    orderId:`order-${outcome}-${suffix}`,questionSetId:`questions-${outcome}-${suffix}`,artifactRevisionId:`artifact-${outcome}-${suffix}`,
    accessId:`access-${outcome}-${suffix}`,creditId:`credit-${outcome}-${suffix}`}));

  beforeAll(async()=>{
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const databaseUrl=withDatabase(adminUrl!,databaseName);
    const bootstrap=postgres(databaseUrl,{max:1,prepare:false});
    try{
      await bootstrap`CREATE TABLE deployment_environment(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton=true),profile text NOT NULL CHECK(profile IN ('staging','production')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
      await bootstrap`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    }finally{await bootstrap.end({timeout:5});}
    process.env.DATABASE_URL=databaseUrl;
    await ensureDatabase();
    const sql=getSqlClient();
    for(const row of records){
      await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status) VALUES(${row.reportId},'https://example.com/','example.com','zh','completed')`;
      await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status)
        VALUES(${row.orderId},${`checkout-${row.orderId}`},'airwallex',${row.reportId},'example.com','encrypted',${`email-${row.orderId}`},'v1','recommendation_forensics_v1','public_search_source_forensics_v1',2,'v2','terms-v1','refund-v1','zh','USD',2900,'paid','processing')`;
      await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity,content_hash,neutral_content_hash,payload,confirmed_at,locked_at)
        VALUES(${row.questionSetId},${row.reportId},${row.orderId},1,'zh-CN','CN','locked','high','v1','identity-neutral-v1','profile',${`content-${row.outcome}`},${`neutral-${row.outcome}`},'{}'::jsonb,now(),now())`;
      await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,status,credits_remaining,payment_order_id) VALUES(${row.accessId},'v3',${`hmac-${row.accessId}`},'exhausted',0,${row.orderId})`;
      await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,stage,execution_state,current_phase,lease_owner,lease_expires_at,credit_reservation_id,checkpoint)
        VALUES(${row.jobId},${row.reportId},'deep','recommendation_forensics_v1','public_search_source_forensics_v1',2,'combined_geo_report_v3',${row.questionSetId},'zh','synthesizing','running','terminalization',${workerId},now()+interval '1 hour',${row.creditId},${JSON.stringify({answerFirstV3:{identityHash:checkpointIdentityHash}})}::jsonb)`;
      await sql`UPDATE payment_orders SET fulfillment_job_id=${row.jobId} WHERE id=${row.orderId}`;
      await sql`INSERT INTO credit_ledger(id,access_key_id,report_id,idempotency_key,payment_order_id,job_id,credits,status) VALUES(${row.creditId},${row.accessId},${row.reportId},${`credit-${row.orderId}`},${row.orderId},${row.jobId},1,'reserved')`;
      await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash) VALUES(${row.artifactRevisionId},${row.reportId},${row.orderId},${row.jobId},1,'combined_geo_report_v3','pending',${`payload-${row.outcome}`})`;
    }
  },120_000);

  afterAll(async()=>{
    await closeDatabase();
    if(originalDatabaseUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=originalDatabaseUrl;
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({timeout:5});
  },120_000);

  it("rolls back injected boundaries and persists each commercial result exactly once",async()=>{
    const complete=records[0]!;
    for(const faultAfter of ["report","refs","job","credit","order","email"] as const){
      await expect(terminalizePaidCombinedReport(input(complete,faultAfter))).rejects.toThrow(/Injected fault/);
      expect(await state(complete)).toMatchObject({reports:0,emails:0,refunds:0,stage:"synthesizing",credit:"reserved",fulfillment:"processing"});
    }
    for(const row of records){
      const result=await terminalizePaidCombinedReport(input(row));
      expect(result.outcome).toBe(row.outcome);
      expect(result.refundId===null).toBe(row.outcome==="completed");
      const stored=await state(row);
      expect(stored).toMatchObject({reports:1,emails:1,refunds:row.outcome==="completed"?0:1,stage:row.outcome,
        credit:row.outcome==="completed"?"settled":"refunded",fulfillment:row.outcome,active:row.outcome==="failed"?0:1});
      await expect(terminalizePaidCombinedReport(input(row))).rejects.toThrow(/leased job/i);
      expect(await state(row)).toEqual(stored);
    }
  },120_000);

  function input(row:typeof records[number],faultAfter?:"report"|"refs"|"job"|"credit"|"order"|"email"){
    const statuses=row.outcome==="completed"?["answered","answered","answered"]:row.outcome==="completed_limited"?["answered","limited","insufficient"]:["insufficient","insufficient","insufficient"];
    const report={version:3,artifactContract:"combined_geo_report_v3",reportId:row.reportId,jobId:row.jobId,orderId:row.orderId,
      artifactRevisionId:row.artifactRevisionId,artifactRevision:1,questionSetIdentity:row.questionSetId,evidenceCutoffAt:new Date().toISOString(),
      answerCards:statuses.map((status,index)=>({status,sentences:status==="insufficient"?[]:[{kind:"grounded_claim",evidenceIds:[`evidence-${index}`]}]})),
      publicSourceForensics:{commercialOutcome:"completed"}};
    return {report,workerId,checkpointIdentityHash,snapshotRefs:[],htmlSha256:"a".repeat(64),pdfSha256:"b".repeat(64),pdfStorageKey:`private/${row.artifactRevisionId}.pdf`,pageCount:5,faultAfter};
  }
  async function state(row:typeof records[number]){return (await getSqlClient()<Array<{reports:number;emails:number;refunds:number;stage:string;credit:string;fulfillment:string;active:number}>>`
    SELECT (SELECT count(*)::int FROM combined_geo_reports WHERE job_id=${row.jobId}) reports,
      (SELECT count(*)::int FROM email_deliveries WHERE order_id=${row.orderId}) emails,
      (SELECT count(*)::int FROM payment_refunds WHERE order_id=${row.orderId}) refunds,
      (SELECT stage FROM scan_jobs WHERE id=${row.jobId}) stage,
      (SELECT status FROM credit_ledger WHERE id=${row.creditId}) credit,
      (SELECT fulfillment_status FROM payment_orders WHERE id=${row.orderId}) fulfillment,
      (SELECT count(*)::int FROM report_artifact_revisions WHERE id=${row.artifactRevisionId} AND status='active') active`)[0]!;}
});

function withDatabase(url:string,database:string){const parsed=new URL(url);parsed.pathname=`/${database}`;return parsed.toString();}
function quote(value:string){return `"${value.replaceAll('"','""')}"`;}

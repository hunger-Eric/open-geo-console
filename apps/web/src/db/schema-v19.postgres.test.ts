import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V19_DATABASE_MIGRATIONS } from "./migrations";

const adminUrl=process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres=adminUrl?describe:describe.skip;

describeDisposablePostgres("schema v19 staging presentation refresh",()=>{
  const databaseName=`ogc_v19_${randomUUID().replaceAll("-","")}`;
  const admin=postgres(adminUrl!,{max:1,prepare:false});
  afterAll(async()=>{await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);await admin.end({timeout:5});},60_000);

  it("requires a non-billable combined deep job and source revision lineage",async()=>{
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql=postgres(withDatabase(adminUrl!,databaseName),{max:1,prepare:false});
    try{
      await sql.begin(async(tx)=>{for(const statement of DATABASE_MIGRATIONS)await tx.unsafe(statement);});
      expect(DATABASE_SCHEMA_VERSION).toBe(26);
      expect(DATABASE_MIGRATIONS).toEqual(expect.arrayContaining([...V19_DATABASE_MIGRATIONS]));
      await sql`INSERT INTO scan_reports(id,url,payload,report_locale) VALUES('report','https://example.com','{}','en')`;
      await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,fulfillment_methodology,recommendation_report_version)
        VALUES('original','report','deep','recommendation_forensics_v1','en','public_search_source_forensics_v1',2)`;
      await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,
        customer_email_hmac,email_key_version,product_code,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,fulfillment_methodology,recommendation_report_version)
        VALUES('order','checkout','stripe','report','original','example.com','cipher','email','v1','recommendation_forensics_v1','v1','v1','v1','en','USD',100,'public_search_source_forensics_v1',2)`;
      await sql`INSERT INTO report_business_question_sets(id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
        VALUES('questions','report','order',1,'en','US','candidate','high','v1','v1','profile')`;
      await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision,artifact_contract,status,payload_identity_hash,html_sha256,pdf_sha256,pdf_storage_key,ready_at)
        VALUES('source','report','order','original',1,'combined_geo_report_v1','active','source','html','pdf','reports/report/evidence/source.pdf',now())`;
      await expect(sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,reason,artifact_contract,business_question_set_id,credit_reservation_id,fulfillment_methodology,recommendation_report_version)
        VALUES('bad','report','deep','recommendation_forensics_v1','en','staging_artifact_refresh','combined_geo_report_v1','questions','credit','public_search_source_forensics_v1',2)`).rejects.toThrow();
      await sql`INSERT INTO scan_jobs(id,report_id,tier,product_contract,locale,reason,artifact_contract,business_question_set_id,fulfillment_methodology,recommendation_report_version)
        VALUES('refresh','report','deep','recommendation_forensics_v1','en','staging_artifact_refresh','combined_geo_report_v1','questions','public_search_source_forensics_v1',2)`;
      await expect(sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,revision,revision_kind,artifact_contract,status,payload_identity_hash)
        VALUES('bad-artifact','report','order','refresh',2,'presentation_refresh','combined_geo_report_v1','pending','bad')`).rejects.toThrow();
      await sql`INSERT INTO report_artifact_revisions(id,report_id,order_id,job_id,source_artifact_revision_id,revision,revision_kind,artifact_contract,status,payload_identity_hash)
        VALUES('refresh-artifact','report','order','refresh','source',2,'presentation_refresh','combined_geo_report_v1','pending','refresh')`;
    }finally{await sql.end({timeout:5});}
  },120_000);
});

function quote(value:string){return `"${value.replaceAll('"','""')}"`;}
function withDatabase(url:string,database:string){const parsed=new URL(url);parsed.pathname=`/${database}`;return parsed.toString();}

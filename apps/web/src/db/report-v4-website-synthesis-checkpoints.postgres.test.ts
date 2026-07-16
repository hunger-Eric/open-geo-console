import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import { createPostgresReportV4WebsiteSynthesisCheckpointRepository } from "./report-v4-website-synthesis-checkpoints";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const lineage = { reportId: "r", orderId: "o", coreJobId: "c", configSnapshotId: `v4-config-${'e'.repeat(64)}`, siteSnapshotId: "s", operationId: "op", profileId: "p" };
const output = { summary: "summary", strengths: ["a"], gaps: ["b"], actions: ["c"] };
const dbName = `ogc_v4_synth_${randomUUID().replaceAll("-", "")}`;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const withDb = (url: string, db: string) => url.replace(/\/[^/]+$/, `/${db}`);

suite("V4 website synthesis checkpoint PostgreSQL parity", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(dbName)}`);
    sql = postgres(withDb(adminUrl!, dbName), { max: 8, prepare: false });
    await sql.begin(async tx => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await seedParents();
  }, 120_000);

  async function seedParents() {
    await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status) VALUES('r','https://example.com/','example.com','{}','en','completed')`;
    await sql`INSERT INTO report_v4_site_snapshots(id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,candidate_url_count,analyzable_page_count,excluded_page_count) VALUES('s','r','example.com','completed',now(),now(),${'a'.repeat(64)},${'b'.repeat(64)},1,1,0)`;
    await sql`INSERT INTO report_business_question_sets(id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity) VALUES('qset','r',1,'en','US','candidate','high','v4','v4',${'2'.repeat(64)})`;
    for (const [ordinal, purpose] of [[1, 'core_service_discovery'], [2, 'customer_region_fit'], [3, 'purchase_delivery_risk']] as const) await sql`INSERT INTO report_business_questions(id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash) VALUES(${`qset-q${ordinal}`},'qset',${ordinal},${purpose},${`Question ${ordinal}`},${`Private ${ordinal}`},${`Neutral ${ordinal}`},${'5'.repeat(64)})`;
    await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase) VALUES('c','r','s','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','qset','en','standard','completed','completed','terminalization')`;
    for (const id of ['stale-zero', 'stale-one', 'drift', 'tampered']) await sql`INSERT INTO scan_jobs(id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase) VALUES(${id},'r','s','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','qset','en','standard','completed','completed','terminalization')`;
    await sql`INSERT INTO payment_orders(id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_snapshot_id,business_question_set_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,fulfillment_status,refund_status) VALUES('o',${'c'.repeat(64)},'airwallex','r','c','s','qset','example.com','encrypted',${'d'.repeat(64)},'v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','en','USD',2900,'paid','completed','not_required')`;
    await sql`UPDATE report_business_question_sets SET status='locked',order_id='o',content_hash=${'3'.repeat(64)},neutral_content_hash=${'4'.repeat(64)},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id='qset'`;
    await sql`INSERT INTO report_v4_config_snapshots(id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,report_profile_id,report_profile_hash,report_profile_payload) VALUES(${`v4-config-${'e'.repeat(64)}`},'r','o','c',${'e'.repeat(64)},'model-v4',${'f'.repeat(64)},'{}'::jsonb,'report-v4',${'1'.repeat(64)},'{}'::jsonb)`;
  }
  afterAll(async () => { if (sql) await sql.end({ timeout: 5 }); await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(dbName)} WITH (FORCE)`); await admin.end({ timeout: 5 }); }, 120_000);

  it("round-trips initialize, claim, provider authorization, completion and idempotent completed claim", async () => {
    const repo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(sql);
    expect((await repo.initialize(lineage)).state).toBe("queued");
    expect((await repo.claim({ ...lineage, workerId: "w", leaseMs: 60_000 })).state).toBe("running");
    await expect(repo.claim({ ...lineage, workerId: "w2", leaseMs: 60_000 })).rejects.toThrow(/claim/i);
    await repo.beginProviderCall({ ...lineage, workerId: "w" });
    await expect(repo.beginProviderCall({ ...lineage, workerId: "w" })).rejects.toThrow(/authorization/i);
    const done = await repo.complete({ ...lineage, workerId: "w", output });
    expect(done.state).toBe("completed");
    expect(await repo.claim({ ...lineage, workerId: "w2", leaseMs: 1 })).toMatchObject({ state: "completed" });
  }, 120_000);

  it("recovers stale count-zero leases but never reclaims count-one crashes", async () => {
    const zero = { ...lineage, coreJobId: "stale-zero" };
    const repo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(sql);
    await repo.initialize(zero); await repo.claim({ ...zero, workerId: "w", leaseMs: 1 });
    await new Promise(resolve => setTimeout(resolve, 20));
    await expect(repo.claim({ ...zero, workerId: "w2", leaseMs: 1000 })).resolves.toMatchObject({ workerId: "w2" });
    const one = { ...lineage, coreJobId: "stale-one" };
    await repo.initialize(one); await repo.claim({ ...one, workerId: "w", leaseMs: 60_000 }); await repo.beginProviderCall({ ...one, workerId: "w" });
    await sql`UPDATE report_v4_website_synthesis_checkpoints SET lease_expires_at=now()-interval '1 second' WHERE core_job_id=${one.coreJobId}`;
    await expect(repo.claim({ ...one, workerId: "w2", leaseMs: 1000 })).rejects.toThrow(/claim|replay/i);
  }, 120_000);

  it("rejects same-core lineage drift and output/hash tampering", async () => {
    const repo = createPostgresReportV4WebsiteSynthesisCheckpointRepository(sql);
    const drift = { ...lineage, coreJobId: "drift" };
    await repo.initialize(drift);
    await expect(repo.initialize({ ...drift, operationId: "other" })).rejects.toThrow(/unique|lineage|drift/i);
    const tampered = { ...lineage, coreJobId: "tampered" };
    await repo.initialize(tampered); await repo.claim({ ...tampered, workerId: "w", leaseMs: 60_000 }); await repo.beginProviderCall({ ...tampered, workerId: "w" }); await repo.complete({ ...tampered, workerId: "w", output });
    await sql`UPDATE report_v4_website_synthesis_checkpoints SET output_hash=${'0'.repeat(64)} WHERE core_job_id=${tampered.coreJobId}`;
    await expect(repo.load(tampered)).rejects.toThrow(/integrity/i);
  }, 120_000);
});

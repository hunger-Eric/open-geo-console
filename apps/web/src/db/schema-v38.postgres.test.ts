import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION } from "./index";
import { DATABASE_MIGRATIONS, V38_DATABASE_MIGRATIONS, V39_DATABASE_MIGRATIONS, databaseMigrationsAfter } from "./migrations";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const suite = adminUrl ? describe : describe.skip;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const withDb = (url: string, database: string) => url.replace(/\/[^/]+$/, `/${database}`);

suite("schema V38 website-synthesis input authority", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  const emptyDatabase = `ogc_v38_empty_${randomUUID().replaceAll("-", "")}`;
  const historicalDatabase = `ogc_v38_history_${randomUUID().replaceAll("-", "")}`;
  let empty: ReturnType<typeof postgres>;
  let historical: ReturnType<typeof postgres>;
  const throughV37 = DATABASE_MIGRATIONS.slice(0, -(V38_DATABASE_MIGRATIONS.length + V39_DATABASE_MIGRATIONS.length));

  beforeAll(async () => {
    for (const database of [emptyDatabase, historicalDatabase]) await admin.unsafe(`CREATE DATABASE ${quote(database)}`);
    empty = postgres(withDb(adminUrl!, emptyDatabase), { max: 1, prepare: false });
    historical = postgres(withDb(adminUrl!, historicalDatabase), { max: 1, prepare: false });
    for (const sql of [empty, historical]) {
      await sql.begin(async (tx) => { for (const statement of throughV37) await tx.unsafe(statement); });
    }
  }, 120_000);

  afterAll(async () => {
    if (empty) await empty.end({ timeout: 5 });
    if (historical) await historical.end({ timeout: 5 });
    for (const database of [emptyDatabase, historicalDatabase]) {
      await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(database)} WITH (FORCE)`);
    }
    await admin.end({ timeout: 5 });
  }, 120_000);

  it("registers exactly one V38 forward step", () => {
    expect(DATABASE_SCHEMA_VERSION).toBe(40);
    expect(databaseMigrationsAfter(37)).toEqual([...V38_DATABASE_MIGRATIONS, ...V39_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(38)).toEqual([...V39_DATABASE_MIGRATIONS]);
    expect(databaseMigrationsAfter(39)).toEqual([]);
    const source = V38_DATABASE_MIGRATIONS.join("\n");
    expect(source).toContain("input_identity_hash");
    expect(source).toContain("page_summary_identity_set_hash");
    expect(source).toContain("operator disposition is required");
    expect(source).toContain("report_v4_website_synthesis_checkpoint_state_authority_check");
    expect(source).toContain("terminal V4 website synthesis checkpoint requires one authorized provider call");
    expect(source.indexOf("DROP TRIGGER IF EXISTS report_v4_website_synthesis_checkpoints_guard"))
      .toBeLessThan(source.indexOf("CREATE TRIGGER report_v4_website_synthesis_checkpoints_guard"));
  });

  it("upgrades an empty V37 table and replays V38 idempotently", async () => {
    await empty.begin(async (tx) => { for (const statement of V38_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    await empty.begin(async (tx) => { for (const statement of V38_DATABASE_MIGRATIONS) await tx.unsafe(statement); });
    const columns = await empty<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='report_v4_website_synthesis_checkpoints'
        AND column_name IN ('input_identity_hash','page_summary_identity_set_hash','page_summary_count')
      ORDER BY column_name`;
    expect(columns).toEqual([
      { column_name: "input_identity_hash", is_nullable: "NO" },
      { column_name: "page_summary_count", is_nullable: "NO" },
      { column_name: "page_summary_identity_set_hash", is_nullable: "NO" }
    ]);
  }, 120_000);

  it("fails the V37 upgrade when an old row has no provable input identity", async () => {
    await seedV37Parents(historical);
    await historical`INSERT INTO report_v4_website_synthesis_checkpoints(
      identity_hash,report_id,order_id,core_job_id,config_snapshot_id,site_snapshot_id,operation_id,profile_id
    ) VALUES(${'9'.repeat(64)},'r','o','c',${`v4-config-${'e'.repeat(64)}`},'s','websiteSynthesis','profile')`;
    await expect(historical.begin(async (tx) => {
      for (const statement of V38_DATABASE_MIGRATIONS) await tx.unsafe(statement);
    })).rejects.toThrow(/operator disposition|provable input identity/i);
    const columns = await historical<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='report_v4_website_synthesis_checkpoints'
        AND column_name='input_identity_hash'`;
    expect(columns).toHaveLength(0);
  }, 120_000);
});

async function seedV37Parents(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES('r','https://example.com/','example.com','{}','en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots(
    id,report_id,site_key,status,captured_at,completed_at,collector_config_identity_hash,content_identity_hash,
    candidate_url_count,analyzable_page_count,excluded_page_count
  ) VALUES('s','r','example.com','completed',now(),now(),${'a'.repeat(64)},${'b'.repeat(64)},1,1,0)`;
  await sql`INSERT INTO report_business_question_sets(
    id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity
  ) VALUES('qset','r',1,'en','US','candidate','high','v4','v4',${'2'.repeat(64)})`;
  for (const [ordinal, purpose] of [[1, "core_service_discovery"], [2, "customer_region_fit"], [3, "purchase_delivery_risk"]] as const) {
    await sql`INSERT INTO report_business_questions(
      id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,neutral_content_hash
    ) VALUES(${`qset-q${ordinal}`},'qset',${ordinal},${purpose},${`Question ${ordinal}`},${`Private ${ordinal}`},${`Neutral ${ordinal}`},${'5'.repeat(64)})`;
  }
  await sql`INSERT INTO scan_jobs(
    id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
    artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase
  ) VALUES('c','r','s','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
    'combined_geo_report_v4','qset','en','standard','completed','completed','terminalization')`;
  await sql`INSERT INTO payment_orders(
    id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_snapshot_id,business_question_set_id,
    site_key,customer_email_encrypted,customer_email_hmac,email_key_version,product_code,fulfillment_methodology,
    recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,
    amount_minor,payment_status,fulfillment_status,refund_status
  ) VALUES('o',${'c'.repeat(64)},'airwallex','r','c','s','qset','example.com','encrypted',${'d'.repeat(64)},'v1',
    'recommendation_forensics_v1','two_stage_geo_report_v4',4,'v4','terms-v1','refund-v1','en','USD',2900,
    'paid','completed','not_required')`;
  await sql`UPDATE report_business_question_sets SET status='locked',order_id='o',content_hash=${'3'.repeat(64)},
    neutral_content_hash=${'4'.repeat(64)},payload='{}'::jsonb,confirmed_at=now(),locked_at=now() WHERE id='qset'`;
  await sql`INSERT INTO report_v4_config_snapshots(
    id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
    report_profile_id,report_profile_hash,report_profile_payload
  ) VALUES(${`v4-config-${'e'.repeat(64)}`},'r','o','c',${'e'.repeat(64)},'model-v4',${'f'.repeat(64)},'{}'::jsonb,
    'report-v4',${'1'.repeat(64)},'{}'::jsonb)`;
}

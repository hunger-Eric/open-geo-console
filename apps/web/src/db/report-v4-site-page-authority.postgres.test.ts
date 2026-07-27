import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4PageSummaryStore,
  createReportV4PageSummaryPostgresDatabase,
  createReportV4PageSummaryRepository
} from "./report-v4-page-summaries";
import {
  loadReportV4SitePageAuthority,
  loadReportV4SitePageAuthorityInTransaction
} from "./report-v4-site-page-authority";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v4_group1_authority_${randomUUID().replaceAll("-", "")}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describeDisposablePostgres("Report V4 Group 1 authority on the complete PostgreSQL schema", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;
  let writer: ReturnType<typeof postgres>;
  let immutable: SeededLineage;
  let tampered: SeededLineage;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const url = withDatabase(adminUrl!, databaseName);
    sql = postgres(url, { max: 3, prepare: false });
    writer = postgres(url, { max: 1, prepare: false });
    await sql.begin(async (tx) => {
      for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement);
    });
    await sql`INSERT INTO deployment_environment(singleton,profile) VALUES(true,'staging')`;
    immutable = await seedCompleteAuthorityLineage(sql, "immutable", "repository");
    tampered = await seedCompleteAuthorityLineage(sql, "tampered", "stored_identity_drift");
  }, 120_000);

  afterAll(async () => {
    if (writer) await writer.end({ timeout: 5 });
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("proves immutable authority consistency in one RR/RO snapshot on the complete schema", async () => {
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const first = await loadReportV4SitePageAuthorityInTransaction(tx as never, immutable.input);
      await expect(writer`UPDATE report_v4_site_snapshot_pages
        SET retained_cleaned_text='forbidden terminal drift' WHERE id=${immutable.pageId}`)
        .rejects.toThrow(/immutable|terminal/i);
      const second = await loadReportV4SitePageAuthorityInTransaction(tx as never, immutable.input);
      expect(second).toEqual(first);
      expect(second.siteSnapshotPages.records[0]!.contentHash).toBe(sha(immutable.retainedText));
    });
    await expect(loadReportV4SitePageAuthority(sql as never, immutable.input))
      .resolves.toMatchObject({ siteSnapshotPages: { recordCount: 1 }, pageSummaryIntegrity: { recordCount: 1 } });
  }, 30_000);

  it("rejects a trigger-permitted initial stored summary identity drift", async () => {
    await expect(loadReportV4SitePageAuthority(sql as never, tampered.input))
      .rejects.toThrow(/stored page-summary identity hash/i);
    const stored = await sql<{ identity_hash: string }[]>`SELECT identity_hash FROM report_v4_page_summaries
      WHERE page_id=${tampered.pageId}`;
    expect(stored[0]?.identity_hash).toBe(sha("deliberately-wrong-initial-summary-identity"));
  });
});

type SummarySeedMode = "repository" | "stored_identity_drift";
interface SeededLineage {
  readonly input: { readonly sessionId: string; readonly scenarioId: string; readonly phase: "baseline" };
  readonly pageId: string;
  readonly retainedText: string;
}

async function seedCompleteAuthorityLineage(
  sql: ReturnType<typeof postgres>,
  label: string,
  summaryMode: SummarySeedMode
): Promise<SeededLineage> {
  const suffix = `${label}-${randomUUID().replaceAll("-", "")}`;
  const ids = {
    sessionId: randomUUID(), scenarioId: randomUUID(), report: `report-${suffix}`,
    snapshot: `snapshot-${suffix}`, page: `page-${suffix}`, order: `order-${suffix}`,
    pre: `pre-${suffix}`, core: `core-${suffix}`, questions: `questions-${suffix}`,
    access: `access-${suffix}`, credit: `credit-${suffix}`, artifact: `artifact-${suffix}`
  };
  const configHash = sha(`config-${suffix}`);
  const config = `v4-config-${configHash}`;
  const siteKey = `${label}.example`;
  const normalizedUrl = `https://${siteKey}/`;
  const retainedText = `Complete-schema retained evidence for ${label}.`;
  const contentHash = sha(retainedText);
  const chunks = [{ order: 1, summary: `Complete-schema ${label} page summary`, sourceLocations: [{
    locationId: `${ids.page}:0-20`, startOffset: 0, endOffset: 20
  }] }];
  const snapshotPages = [{
    id: ids.page, ordinal: 1, normalizedUrl, analyzable: true, readMode: "direct_readable",
    summary: "Home page", retainedText, contentHash, exclusionReason: null
  }];
  const snapshotContentIdentityHash = sha(JSON.stringify({
    status: "completed", candidateUrlCount: 1, pages: snapshotPages
  }));

  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${ids.report},${normalizedUrl},${siteKey},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
    VALUES(${ids.snapshot},${ids.report},${siteKey},'collecting',now(),${sha(`collector-${suffix}`)})`;
  await sql`INSERT INTO report_v4_site_snapshot_pages
    (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash,exclusion_reason)
    VALUES(${ids.page},${ids.snapshot},1,${normalizedUrl},true,'direct_readable','Home page',${retainedText},${contentHash},NULL)`;
  await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),
    content_identity_hash=${snapshotContentIdentityHash},candidate_url_count=1,analyzable_page_count=1,excluded_page_count=0
    WHERE id=${ids.snapshot}`;

  if (summaryMode === "repository") {
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
      createReportV4PageSummaryPostgresDatabase(sql)
    ));
    await repository.persist({
      reportId: ids.report,
      snapshotId: ids.snapshot,
      pageId: ids.page,
      url: normalizedUrl,
      contentHash,
      readability: "direct_readable",
      sourceLength: retainedText.length,
      output: { chunks }
    });
  } else {
    await sql`INSERT INTO report_v4_page_summaries
      (identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks)
      VALUES(${sha("deliberately-wrong-initial-summary-identity")},${ids.report},${ids.snapshot},${ids.page},
        ${contentHash},${retainedText.length},${JSON.stringify(chunks)}::text::jsonb)`;
  }

  await insertJob(sql, ids.pre, ids.report, null, null, "v4_pre_admission", null);
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,site_snapshot_id,site_key,customer_email_encrypted,
      customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,
      catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,
      fulfillment_status,refund_status,delivery_status,paid_at,delivery_deadline_at,fulfilled_at)
    VALUES(${ids.order},${sha(`checkout-${suffix}`)},'airwallex',${ids.report},${ids.snapshot},${siteKey},
      ${`encrypted-${suffix}`},${sha(`email-${suffix}`)},'v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'catalog-v4','terms-v4','refund-v4','en','USD',100,'paid','completed','not_required','delivered',now(),now(),now())`;
  await sql`INSERT INTO access_keys(id,key_prefix,key_hmac,payment_order_id,status,credits_remaining,expires_at)
    VALUES(${ids.access},'prefix',${sha(`access-${suffix}`)},${ids.order},'exhausted',0,now()+interval '1 day')`;
  await sql`INSERT INTO credit_ledger
    (id,access_key_id,report_id,idempotency_key,payment_order_id,credits,status,reserved_at,settled_at)
    VALUES(${ids.credit},${ids.access},${ids.report},${`credit-${suffix}`},${ids.order},1,'settled',now(),now())`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,order_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${ids.questions},${ids.report},${ids.order},1,'en','US','candidate','high','v1','v1','profile')`;
  await insertJob(sql, ids.core, ids.report, ids.snapshot, ids.questions, "standard", ids.credit);
  await sql`UPDATE credit_ledger SET job_id=${ids.core} WHERE id=${ids.credit}`;
  await sql`UPDATE payment_orders SET fulfillment_job_id=${ids.core},business_question_set_id=${ids.questions}
    WHERE id=${ids.order}`;
  await sql`INSERT INTO report_v4_config_snapshots
    (id,report_id,order_id,core_job_id,identity_hash,model_profile_id,model_profile_hash,model_profile_payload,
      report_profile_id,report_profile_hash,report_profile_payload)
    VALUES(${config},${ids.report},${ids.order},${ids.core},${configHash},'model-v4',${sha(`model-${suffix}`)},'{}'::jsonb,
      'report-v4',${sha(`report-profile-${suffix}`)},'{}'::jsonb)`;
  await sql`INSERT INTO report_artifact_revisions
    (id,report_id,order_id,job_id,config_snapshot_id,revision_kind,revision,artifact_contract,status,
      payload_identity_hash,html_sha256,ready_at,activated_at)
    VALUES(${ids.artifact},${ids.report},${ids.order},${ids.core},${config},'generation',1,'combined_geo_report_v4','active',
      ${sha(`artifact-${suffix}`)},${sha(`html-${suffix}`)},now(),now())`;
  await sql`UPDATE scan_reports SET active_artifact_revision_id=${ids.artifact} WHERE id=${ids.report}`;
  await sql`INSERT INTO report_v4_acceptance_sessions
    (id,preview_deployment_id,protected_alias_url,web_git_sha,worker_git_sha)
    VALUES(${ids.sessionId},${`preview-${suffix}`},${`https://preview-${siteKey}`},${"4".repeat(40)},${"4".repeat(40)})`;
  await sql`INSERT INTO report_v4_acceptance_scenarios
    (id,session_id,kind,fault_kind,fault_question_id,expected_fault_occurrences,report_id,order_id,
      pre_admission_job_id,core_job_id,site_snapshot_id,config_snapshot_id,question_set_id,core_artifact_revision_id)
    VALUES(${ids.scenarioId},${ids.sessionId},'question_failure','question_failure','question-1',2,${ids.report},${ids.order},
      ${ids.pre},${ids.core},${ids.snapshot},${config},${ids.questions},${ids.artifact})`;

  return {
    input: { sessionId: ids.sessionId, scenarioId: ids.scenarioId, phase: "baseline" },
    pageId: ids.page,
    retainedText
  };
}

async function insertJob(
  sql: ReturnType<typeof postgres>,
  id: string,
  reportId: string,
  snapshotId: string | null,
  questionSetId: string | null,
  reason: "v4_pre_admission" | "standard",
  creditReservationId: string | null
): Promise<void> {
  await sql`INSERT INTO scan_jobs
    (id,report_id,site_snapshot_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
      artifact_contract,business_question_set_id,locale,reason,stage,execution_state,current_phase,checkpoint_revision,
      phase_attempt,resume_generation,progress,planned_pages,successful_pages,failed_pages,attempts,max_attempts,credit_reservation_id)
    VALUES(${id},${reportId},${snapshotId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4',${questionSetId},'en',${reason},'completed','completed','terminalization',1,0,0,100,1,1,0,1,3,
      ${creditReservationId})`;
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString();
}

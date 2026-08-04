import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAiReport } from "./ai-reports";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";
import { inspectReportAccessToken, issueReportAccessToken, redeemReportAccessToken, verifyReportAccessToken } from "./report-tokens";
import { hmacSecret } from "./secrets";

const enabled = Boolean(process.env.DATABASE_URL && process.env.OGC_DEPLOYMENT_PROFILE === "staging");
const describePostgres = enabled ? describe : describe.skip;

describePostgres("artifact scope PostgreSQL isolation", () => {
  const suffix = randomUUID();
  const reportId = `artifact-scope-report-${suffix}`;
  const legacyJobId = `artifact-scope-legacy-${suffix}`;
  const recommendationJobId = `artifact-scope-recommendation-${suffix}`;
  const v4ReportId = `artifact-scope-v4-report-${suffix}`;
  const v4JobId = `artifact-scope-v4-${suffix}`;
  const v4OrderId = randomUUID();
  const v4ArtifactId = `artifact-scope-v4-artifact-${suffix}`;
  let originalTokenSecret: string | undefined;

  beforeAll(async () => {
    originalTokenSecret = process.env.OGC_TOKEN_HASH_SECRET;
    process.env.OGC_TOKEN_HASH_SECRET = originalTokenSecret?.trim() || "artifact-scope-postgres-test-secret-2030";
    await initializeDatabaseEnvironment("staging");
    const sql = getSqlClient();
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${reportId},'https://scope.example','scope.example','en','completed')`;
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${v4ReportId},'https://v4-scope.example','v4-scope.example','en','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,locale,stage) VALUES (${legacyJobId},${reportId},'deep','legacy_website_audit_v1','en','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,locale,stage) VALUES (${recommendationJobId},${reportId},'deep','recommendation_forensics_v1','answer_engine_recommendation_forensics_v1',1,'en','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,locale,stage,execution_state) VALUES (${v4JobId},${v4ReportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','en','completed','completed')`;
    await sql`INSERT INTO ai_reports (id,report_id,job_id,tier,product_contract,locale,payload,model,prompt_version,content_hash,is_private) VALUES (${`ai-legacy-${suffix}`},${reportId},${legacyJobId},'deep','legacy_website_audit_v1','en','{"artifact":"legacy"}'::jsonb,'fixture','v1','legacy-hash',true)`;
    await sql`INSERT INTO ai_reports (id,report_id,job_id,tier,product_contract,locale,payload,model,prompt_version,content_hash,is_private) VALUES (${`ai-new-${suffix}`},${reportId},${recommendationJobId},'deep','recommendation_forensics_v1','en','{"artifact":"recommendation"}'::jsonb,'fixture','v1','recommendation-hash',true)`;
    await sql`INSERT INTO payment_orders
      (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,site_key,customer_email_encrypted,
       customer_email_hmac,email_key_version,product_code,fulfillment_methodology,recommendation_report_version,
       catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,
       fulfillment_status,refund_status)
      VALUES(${v4OrderId},${digest(`checkout-${suffix}`)},'airwallex',${v4ReportId},${v4JobId},'v4-scope.example','encrypted',
        ${digest(`email-${suffix}`)},'v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,
        'v4','terms-v1','refund-v1','en','USD',2900,'paid','completed','not_required')`;
    await sql`INSERT INTO report_artifact_revisions
      (id,report_id,order_id,job_id,revision_kind,revision,artifact_contract,status,payload_identity_hash,
       html_sha256,readiness,ready_at,activated_at)
      VALUES(${v4ArtifactId},${v4ReportId},${v4OrderId},${v4JobId},'generation',1,'combined_geo_report_v4','active',
        ${digest(`payload-${suffix}`)},${digest(`html-${suffix}`)},'{"htmlCanonical":true}'::jsonb,now(),now())`;
    await sql`UPDATE scan_reports SET active_artifact_revision_id=${v4ArtifactId} WHERE id=${v4ReportId}`;
  }, 60_000);

  afterAll(async () => {
    const sql = getSqlClient();
    await sql`UPDATE scan_reports SET active_artifact_revision_id=NULL WHERE id IN (${reportId},${v4ReportId})`;
    await sql`DELETE FROM report_access_tokens WHERE report_id IN (${reportId},${v4ReportId})`;
    await sql`DELETE FROM report_artifact_revisions WHERE report_id IN (${reportId},${v4ReportId})`;
    await sql`DELETE FROM payment_orders WHERE report_id IN (${reportId},${v4ReportId})`;
    await sql`DELETE FROM scan_reports WHERE id IN (${reportId},${v4ReportId})`;
    await closeDatabase();
    if (originalTokenSecret === undefined) delete process.env.OGC_TOKEN_HASH_SECRET;
    else process.env.OGC_TOKEN_HASH_SECRET = originalTokenSecret;
  }, 60_000);

  it("stores and reads both products for the same report without ambiguous fallback", async () => {
    const legacy = await getAiReport(reportId, "deep", "legacy_website_audit_v1");
    const recommendation = await getAiReport(reportId, "deep", "recommendation_forensics_v1");
    expect(legacy?.jobId).toBe(legacyJobId);
    expect(recommendation?.jobId).toBe(recommendationJobId);
    expect(legacy?.payload).toMatchObject({ artifact: "legacy" });
    expect(recommendation?.payload).toMatchObject({ artifact: "recommendation" });
    const rows = await getSqlClient()<Array<{ product_contract: string }>>`SELECT product_contract FROM ai_reports WHERE report_id=${reportId} AND tier='deep' ORDER BY product_contract`;
    expect(rows.map(({ product_contract }) => product_contract)).toEqual(["legacy_website_audit_v1", "recommendation_forensics_v1"]);
  });

  it("binds access tokens to independent persisted artifact scopes", async () => {
    const legacy = await issueReportAccessToken({ reportId, artifactScope: "legacy_website_audit_v1", idempotencyKey: `scope/${suffix}` });
    const recommendation = await issueReportAccessToken({ reportId, artifactScope: "recommendation_forensics_v1", idempotencyKey: `scope/${suffix}` });
    expect(legacy.rawToken).not.toBe(recommendation.rawToken);
    await expect(verifyReportAccessToken(legacy.rawToken)).resolves.toMatchObject({ reportId, artifactScope: "legacy_website_audit_v1" });
    await expect(verifyReportAccessToken(recommendation.rawToken)).resolves.toMatchObject({ reportId, artifactScope: "recommendation_forensics_v1" });
  });

  it("continues to inspect, redeem, and verify a pre-v9 legacy raw token", async () => {
    const rawToken = `ogc_report_pre_v9_${suffix}`;
    const secret = process.env.OGC_TOKEN_HASH_SECRET!;
    await getSqlClient()`
      INSERT INTO report_access_tokens (id,report_id,token_prefix,token_hmac,expires_at)
      VALUES (${`pre-v9-${suffix}`},${reportId},'ogc_report_pre',${hmacSecret(rawToken, secret)},now()+interval '1 day')
    `;
    await expect(inspectReportAccessToken(rawToken)).resolves.toMatchObject({ reportId, artifactScope: "legacy_website_audit_v1" });
    await expect(redeemReportAccessToken(rawToken)).resolves.toMatchObject({ reportId, artifactScope: "legacy_website_audit_v1" });
    await expect(verifyReportAccessToken(rawToken)).resolves.toMatchObject({ reportId, artifactScope: "legacy_website_audit_v1" });
  });

  it("denies an existing V4 token as soon as its paid order enters a refund state", async () => {
    const access = await issueReportAccessToken({
      reportId: v4ReportId,
      orderId: v4OrderId,
      artifactScope: "combined_geo_report_v4",
      idempotencyKey: `v4-entitlement/${suffix}`
    });
    await expect(verifyReportAccessToken(access.rawToken)).resolves.toMatchObject({
      reportId: v4ReportId, artifactScope: "combined_geo_report_v4"
    });
    const protectedPreview = await issueReportAccessToken({
      reportId: v4ReportId,
      artifactScope: "combined_geo_report_v4",
      idempotencyKey: `v4-protected-preview/${suffix}`
    });
    await expect(verifyReportAccessToken(protectedPreview.rawToken)).resolves.toMatchObject({ reportId: v4ReportId });

    await getSqlClient()`UPDATE payment_orders SET refund_status='pending' WHERE id=${v4OrderId}`;
    await expect(verifyReportAccessToken(access.rawToken)).resolves.toBeNull();
    await getSqlClient()`UPDATE payment_orders SET fulfillment_status='completed_limited',refund_status='refunded' WHERE id=${v4OrderId}`;
    await expect(verifyReportAccessToken(access.rawToken)).resolves.toBeNull();
    const historicalV3Token = `ogc_report_v3_refunded_${suffix}`;
    await getSqlClient()`INSERT INTO report_access_tokens(id,report_id,token_prefix,token_hmac,artifact_scope,expires_at)
      VALUES(${`v3-refunded-${suffix}`},${v4ReportId},'ogc_report_v3',
        ${hmacSecret(historicalV3Token, process.env.OGC_TOKEN_HASH_SECRET!)},'combined_geo_report_v3',now()+interval '1 day')`;
    await expect(verifyReportAccessToken(historicalV3Token)).resolves.toBeNull();
    await expect(issueReportAccessToken({
      reportId: v4ReportId,
      orderId: v4OrderId,
      artifactScope: "combined_geo_report_v4",
      idempotencyKey: `v4-refunded/${suffix}`
    })).rejects.toThrow(/current exact order entitlement/i);
  });

  it("has the scoped columns, check constraints, and replacement unique index", async () => {
    const columns = await getSqlClient()<Array<{ table_name: string; column_name: string; column_default: string | null }>>`
      SELECT table_name,column_name,column_default FROM information_schema.columns
      WHERE table_schema='public' AND ((table_name='ai_reports' AND column_name='product_contract') OR (table_name='report_access_tokens' AND column_name='artifact_scope'))
      ORDER BY table_name
    `;
    expect(columns).toHaveLength(2);
    expect(columns.every(({ column_default }) => column_default?.includes("legacy_website_audit_v1"))).toBe(true);
    const indexes = await getSqlClient()<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='ai_reports'`;
    expect(indexes.map(({ indexname }) => indexname)).toContain("ai_reports_report_tier_product_uidx");
    expect(indexes.map(({ indexname }) => indexname)).not.toContain("ai_reports_report_tier_uidx");
  });
});

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

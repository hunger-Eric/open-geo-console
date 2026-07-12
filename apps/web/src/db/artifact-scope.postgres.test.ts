import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAiReport } from "./ai-reports";
import { closeDatabase, ensureDatabase, getSqlClient } from "./index";
import { inspectReportAccessToken, issueReportAccessToken, redeemReportAccessToken, verifyReportAccessToken } from "./report-tokens";
import { hmacSecret } from "./secrets";

const enabled = Boolean(process.env.DATABASE_URL && process.env.OGC_DEPLOYMENT_PROFILE === "staging");
const describePostgres = enabled ? describe : describe.skip;

describePostgres("artifact scope PostgreSQL isolation", () => {
  const suffix = randomUUID();
  const reportId = `artifact-scope-report-${suffix}`;
  const legacyJobId = `artifact-scope-legacy-${suffix}`;
  const recommendationJobId = `artifact-scope-recommendation-${suffix}`;
  let originalTokenSecret: string | undefined;

  beforeAll(async () => {
    originalTokenSecret = process.env.OGC_TOKEN_HASH_SECRET;
    process.env.OGC_TOKEN_HASH_SECRET = originalTokenSecret?.trim() || "artifact-scope-postgres-test-secret-2030";
    await ensureDatabase();
    const sql = getSqlClient();
    await sql`INSERT INTO scan_reports (id,url,site_key,report_locale,technical_status) VALUES (${reportId},'https://scope.example','scope.example','en','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,locale,stage) VALUES (${legacyJobId},${reportId},'deep','legacy_website_audit_v1','en','completed')`;
    await sql`INSERT INTO scan_jobs (id,report_id,tier,product_contract,locale,stage) VALUES (${recommendationJobId},${reportId},'deep','recommendation_forensics_v1','en','completed')`;
    await sql`INSERT INTO ai_reports (id,report_id,job_id,tier,product_contract,locale,payload,model,prompt_version,content_hash,is_private) VALUES (${`ai-legacy-${suffix}`},${reportId},${legacyJobId},'deep','legacy_website_audit_v1','en','{"artifact":"legacy"}'::jsonb,'fixture','v1','legacy-hash',true)`;
    await sql`INSERT INTO ai_reports (id,report_id,job_id,tier,product_contract,locale,payload,model,prompt_version,content_hash,is_private) VALUES (${`ai-new-${suffix}`},${reportId},${recommendationJobId},'deep','recommendation_forensics_v1','en','{"artifact":"recommendation"}'::jsonb,'fixture','v1','recommendation-hash',true)`;
  }, 60_000);

  afterAll(async () => {
    await getSqlClient()`DELETE FROM scan_reports WHERE id=${reportId}`;
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

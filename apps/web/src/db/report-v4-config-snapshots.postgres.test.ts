import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4ConfigSnapshotStore,
  createReportV4ConfigSnapshotPostgresDatabase,
  createReportV4ConfigSnapshotRepository,
  lockReportV4ConfigSnapshot
} from "./report-v4-config-snapshots";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_v4_config_${randomUUID().replaceAll("-", "")}`;
const admin = adminUrl ? postgres(adminUrl, { max: 1, prepare: false }) : null;

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-DELIVERY-01
describeDisposablePostgres("V4 configuration snapshot PostgreSQL repository", () => {
  afterAll(async () => {
    await admin!.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin!.end({ timeout: 5 });
  }, 60_000);

  it("persists one exact immutable parsed snapshot and reuses it on resume", async () => {
    await admin!.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    const sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    try {
      await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
      await seedBinding(sql);
      const repository = createReportV4ConfigSnapshotRepository(createPostgresReportV4ConfigSnapshotStore(
        createReportV4ConfigSnapshotPostgresDatabase(sql)
      ));
      const input = snapshotInput();

      const first = await lockReportV4ConfigSnapshot(input, repository);
      expect(await lockReportV4ConfigSnapshot(input, repository)).toEqual(first);
      await expect(lockReportV4ConfigSnapshot({
        ...input,
        modelProfile: { ...input.modelProfile, provider: "different-provider" }
      }, repository)).rejects.toThrow(/configuration drift|immutable/i);

      const rows = await sql<Array<{
        id: string;
        identity_hash: string;
        model_profile_payload: Record<string, unknown>;
        report_profile_payload: Record<string, unknown>;
      }>>`SELECT id,identity_hash,model_profile_payload,report_profile_payload FROM report_v4_config_snapshots`;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: first.id, identity_hash: first.identityHash });
      expect(JSON.stringify(rows[0])).not.toMatch(/api.?key|secret|raw.?prompt/i);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }, 180_000);
});

async function seedBinding(sql: ReturnType<typeof postgres>): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,payload,report_locale,technical_status)
    VALUES('report-v4','https://example.com','example.com','{}','zh','completed')`;
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,revision,locale,region,status,confidence,generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES('questions-v4','report-v4',1,'zh','CN','candidate','high','v4','v4','profile-v4')`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,artifact_contract,business_question_set_id,locale,reason)
    VALUES('core-job','report-v4','deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,'combined_geo_report_v4','questions-v4','zh','standard')`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,fulfillment_job_id,business_question_set_id,site_key,customer_email_encrypted,customer_email_hmac,email_key_version,
     product_code,fulfillment_methodology,recommendation_report_version,catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status)
    VALUES('order-v4','checkout-v4','airwallex','report-v4','core-job','questions-v4','example.com','cipher','email','v1','recommendation_forensics_v1','two_stage_geo_report_v4',4,'v1','v1','v1','zh','USD',100,'paid')`;
}

function snapshotInput() {
  const operation = (model: string, nativeWebSearch: boolean) => ({
    model, contextWindowTokens: 128_000, maxInputTokens: 32_000, maxOutputTokens: 8_000,
    timeoutMs: 120_000, nativeWebSearch, structuredOutput: true, tokenizer: "mimo"
  });
  return {
    reportId: "report-v4",
    orderId: "order-v4",
    coreJobId: "core-job",
    modelProfile: {
      profileId: "mimo-v4", provider: "mimo", adapterId: "mimo-native-v1",
      operations: {
        pageAnalysis: operation("mimo-analysis", false),
        websiteSynthesis: operation("mimo-synthesis", false),
        questionAnswer: operation("mimo-search", true),
        sourceDiagnosis: operation("mimo-analysis", false)
      }
    },
    reportProfile: {
      schemaVersion: 1, profileId: "business-operator-zh-v1", locale: "zh-CN",
      audiences: { primary: ["business operator"], secondary: ["marketing lead"] },
      readingOrder: ["conclusion", "reason", "action"], tone: ["professional"],
      terminology: {
        requiredGeoTerms: ["GEO", "AI visibility", "source readiness"],
        prohibitedSeoFraming: ["SEO"], prohibitedInternalLanguage: ["checkpoint"],
        prohibitedPromptLeakage: ["system prompt"]
      },
      presentation: { conciseByDefault: true, detailedEvidenceCollapsed: true },
      fieldBounds: {
        websiteSummary: { minChars: 20, maxChars: 500 },
        websiteListItem: { minChars: 5, maxChars: 200, minItems: 1, maxItems: 5 },
        questionAnswer: { minChars: 20, maxChars: 800 },
        selectionSummary: { minChars: 20, maxChars: 500 },
        observableFactors: { minChars: 5, maxChars: 200, exactItems: 3 },
        targetGap: { minChars: 20, maxChars: 500 },
        recommendedActions: { minChars: 5, maxChars: 200, exactItems: 3 }
      }
    }
  };
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string { const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString(); }

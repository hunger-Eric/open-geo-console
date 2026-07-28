import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CommercialOrderConflictError,
  createPaymentOrder,
  type CreatePaymentOrderInput
} from "./commercial-orders";
import { closeDatabase, getSqlClient, initializeDatabaseEnvironment } from "./index";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const databaseName = `ogc_reissue_${randomUUID().replaceAll("-", "")}`;
const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  deploymentProfile: process.env.OGC_DEPLOYMENT_PROFILE,
  tokenHashSecret: process.env.OGC_TOKEN_HASH_SECRET
};

describeDisposablePostgres("Refunded paid question-set reissue at checkout", () => {
  const admin = postgres(adminUrl!, { max: 1, prepare: false });

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    process.env.DATABASE_URL = withDatabase(adminUrl!, databaseName);
    process.env.OGC_DEPLOYMENT_PROFILE = "staging";
    process.env.OGC_TOKEN_HASH_SECRET = "reissue-test-token-hash-secret-32-chars";
    await initializeDatabaseEnvironment("staging");
  }, 120_000);

  afterAll(async () => {
    await closeDatabase();
    restoreEnvironment("DATABASE_URL", originalEnvironment.databaseUrl);
    restoreEnvironment("OGC_DEPLOYMENT_PROFILE", originalEnvironment.deploymentProfile);
    restoreEnvironment("OGC_TOKEN_HASH_SECRET", originalEnvironment.tokenHashSecret);
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("reissues a confirmed revision for a set locked to a terminally refunded order", async () => {
    const fixture = await seedLockedFixture("refunded", "paid", "refunded");
    const order = await createPaymentOrder(orderInput(fixture));

    const expectedSetId = `business-question-set-${hash(`${fixture.priorSetId}:reissue:2`)}`;
    expect(order.businessQuestionSetId).toBe(expectedSetId);
    await expect(getSqlClient()<Array<Record<string, unknown>>>`
      SELECT id,revision,status,order_id,content_hash,acknowledged_low_confidence,payload,confirmed_at::text confirmed_at
      FROM report_business_question_sets WHERE report_id=${fixture.reportId} ORDER BY revision
    `).resolves.toEqual([
      expect.objectContaining({
        id: fixture.priorSetId, revision: 1, status: "locked", order_id: fixture.priorOrderId
      }),
      expect.objectContaining({
        id: expectedSetId, revision: 2, status: "locked", order_id: order.id,
        content_hash: fixture.contentHash, acknowledged_low_confidence: true,
        confirmed_at: "2026-07-01 00:00:00+00",
        payload: expect.objectContaining({
          id: expectedSetId, revision: 2, contentHash: fixture.contentHash, questions: fixture.questions
        })
      })
    ]);
    await expect(getSqlClient()<Array<Record<string, unknown>>>`
      SELECT id,question_set_id,ordinal,private_text,edited FROM report_business_questions
      WHERE question_set_id=${expectedSetId} ORDER BY ordinal
    `).resolves.toEqual([1, 2, 3].map((ordinal) => expect.objectContaining({
      id: `${expectedSetId}:${ordinal}`, question_set_id: expectedSetId, ordinal,
      private_text: `Question ${ordinal}?`, edited: true
    })));
    await expect(getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM report_business_questions WHERE question_set_id=${fixture.priorSetId}
    `).resolves.toEqual([{ count: 3 }]);
  }, 120_000);

  it("still rejects a set locked to a paid order that was not refunded", async () => {
    const fixture = await seedLockedFixture("paid-active", "paid", "not_required");
    await expect(createPaymentOrder(orderInput(fixture))).rejects.toThrow(
      new CommercialOrderConflictError("Three confirmed business questions are required before checkout.")
    );
    await expect(getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM report_business_question_sets WHERE report_id=${fixture.reportId}
    `).resolves.toEqual([{ count: 1 }]);
  }, 120_000);

  it.each([["created"], ["pending"]] as const)("still rejects a set locked to a %s order", async (paymentStatus) => {
    const fixture = await seedLockedFixture(`unpaid-${paymentStatus}`, paymentStatus, "not_required");
    await expect(createPaymentOrder(orderInput(fixture))).rejects.toThrow(CommercialOrderConflictError);
    await expect(getSqlClient()<Array<{ count: number }>>`
      SELECT count(*)::int count FROM report_business_question_sets WHERE report_id=${fixture.reportId}
    `).resolves.toEqual([{ count: 1 }]);
  }, 120_000);
});

interface LockedFixture {
  reportId: string;
  priorSetId: string;
  priorOrderId: string;
  contentHash: string;
  questions: Array<{ ordinal: number; privateText: string }>;
}

async function seedLockedFixture(suffix: string, paymentStatus: string, refundStatus: string): Promise<LockedFixture> {
  const sql = getSqlClient();
  const reportId = `report-${suffix}`;
  const priorSetId = `questions-${suffix}`;
  const priorOrderId = randomUUID();
  const contentHash = hash(`content-${suffix}`);
  const questions = [1, 2, 3].map((ordinal) => ({ ordinal, privateText: `Question ${ordinal}?` }));
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${reportId},${`https://${suffix}.example/`},${`${suffix}.example`},'en','completed')`;
  const payload = {
    id: priorSetId, revision: 1, contentHash, confirmedAt: "2026-07-01T00:00:00.000Z",
    acknowledgedLowConfidence: true, questions
  };
  await sql`INSERT INTO report_business_question_sets
    (id,report_id,order_id,revision,locale,region,status,confidence,acknowledged_low_confidence,
     generation_rule_version,neutralization_version,profile_evidence_identity)
    VALUES(${priorSetId},${reportId},NULL,1,'en','US','candidate','high',false,'v4','v4',${`profile-${suffix}`})`;
  for (const ordinal of [1, 2, 3]) {
    await sql`INSERT INTO report_business_questions
      (id,question_set_id,ordinal,purpose,generated_text,private_text,neutral_public_text,edited,neutral_content_hash)
      VALUES(${`${priorSetId}:${ordinal}`},${priorSetId},${ordinal},
        ${["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][ordinal - 1]!},
        ${`Question ${ordinal}?`},${`Question ${ordinal}?`},${`Neutral ${ordinal}?`},true,
        ${hash(`question-${suffix}-${ordinal}`)})`;
  }
  await sql`UPDATE report_business_question_sets
    SET status='confirmed',acknowledged_low_confidence=true,content_hash=${contentHash},
      neutral_content_hash=${hash(`neutral-${suffix}`)},payload=${JSON.stringify(payload)}::jsonb,
      confirmed_at='2026-07-01T00:00:00.000Z',updated_at=now() WHERE id=${priorSetId}`;
  await sql`INSERT INTO payment_orders
    (id,checkout_idempotency_hmac,provider,report_id,site_key,customer_email_encrypted,customer_email_hmac,
     email_key_version,product_code,business_question_set_id,fulfillment_methodology,recommendation_report_version,
     catalog_version,terms_version,refund_policy_version,report_locale,currency,amount_minor,payment_status,refund_status)
    VALUES(${priorOrderId},${`checkout-prior-${suffix}`},'airwallex',${reportId},${`${suffix}.example`},'cipher',
      ${`email-${suffix}`},'v1','recommendation_forensics_v1',${priorSetId},'two_stage_geo_report_v4',4,
      'v4','v4','v4','en','USD',2900,${paymentStatus},${refundStatus})`;
  await sql`UPDATE report_business_question_sets
    SET status='locked',order_id=${priorOrderId},locked_at=now(),updated_at=now() WHERE id=${priorSetId}`;
  await sql`INSERT INTO scan_jobs
    (id,report_id,tier,product_contract,fulfillment_methodology,recommendation_report_version,
     artifact_contract,locale,reason,stage,execution_state,current_phase,progress,checkpoint)
    VALUES(${`free-${suffix}`},${reportId},'deep','recommendation_forensics_v1','two_stage_geo_report_v4',4,
      'combined_geo_report_v4','en','v4_pre_admission','completed','completed','terminalization',100,'{}'::jsonb)`;
  return { reportId, priorSetId, priorOrderId, contentHash, questions };
}

function orderInput(fixture: LockedFixture): CreatePaymentOrderInput {
  return {
    checkoutIdempotencyHmac: `checkout-new-${fixture.reportId}`,
    provider: "airwallex",
    reportId: fixture.reportId,
    siteKey: `${fixture.reportId.replace("report-", "")}.example`,
    customerEmailEncrypted: "cipher",
    customerEmailHmac: `email-${fixture.reportId}`,
    emailKeyVersion: "v1",
    productCode: "recommendation_forensics_v1",
    businessQuestionSetId: fixture.priorSetId,
    catalogVersion: "v4",
    termsVersion: "v4",
    refundPolicyVersion: "v4",
    reportLocale: "en",
    currency: "USD",
    amountMinor: 2900
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function quote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

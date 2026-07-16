import { beforeEach, describe, expect, it, vi } from "vitest";
import { terminalizePaidReportV4Core, terminalizeUnavailablePaidReportV4Core } from "./public-source-commerce";

const database = vi.hoisted(() => ({
  ensureDatabase: vi.fn(),
  getSqlClient: vi.fn()
}));
vi.mock("./index", () => database);

beforeEach(() => {
  database.ensureDatabase.mockReset().mockResolvedValue(undefined);
  database.getSqlClient.mockReset();
  process.env.OGC_TOKEN_HASH_SECRET = "unit-test-token-secret-value-0000000000000000";
});

function report(status: "completed" | "completed_limited" | "unavailable" = "completed") {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId: "core-v4",
    targetUrl: "https://example.com/",
    locale: "zh-CN",
    generatedAt: "2026-07-17T00:00:00.000Z",
    status,
    websiteSynthesis: {
      summary: "Public website summary",
      strengths: ["Clear service description"],
      gaps: ["Missing delivery details"],
      actions: ["Publish verifiable delivery terms"]
    },
    questions: [1, 2, 3].map((order) => ({
      order,
      questionId: `question-${order}`,
      questionText: `Business question ${order}`,
      status: status === "unavailable" ? "unavailable" : "answered",
      answer: status === "unavailable" ? null : `Business answer ${order}`,
      sources: []
    }))
  };
}

describe("V4 core commercial terminalization admission", () => {
  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-DELIVERY-01
  it("rejects an unavailable report before any commercial write", async () => {
    await expect(terminalizePaidReportV4Core({
      report: report("unavailable"),
      workerId: "worker-v4"
    })).rejects.toThrow(/deliverable core/i);
  });

  // @requirement GEO-V4-COMMERCE-01
  it("rejects a diagnosis-enhanced payload as a new commercial trigger", async () => {
    const enhanced = report();
    enhanced.questions[0]!.diagnosis = {
      selectionSummary: "Source selection summary",
      observableFactors: [1, 2, 3].map((index) => ({
        kind: `factor-${index}`,
        observation: `observation-${index}`,
        evidenceRefs: []
      })),
      targetGap: "Target website gap",
      recommendedActions: [1, 2, 3].map((priority) => ({
        priority,
        action: `action-${priority}`,
        evidenceRefs: []
      })),
      detailedEvidenceRefs: []
    };
    await expect(terminalizePaidReportV4Core({
      report: enhanced,
      workerId: "worker-v4"
    })).rejects.toThrow(/diagnosis enhancement/i);
  });

  // @requirement GEO-V4-PDF-01
  it("rejects every PDF-shaped V4 terminalization input", async () => {
    await expect(terminalizePaidReportV4Core({
      report: report(),
      workerId: "worker-v4",
      pdfSha256: "forbidden"
    } as never)).rejects.toThrow(/PDF/i);
  });

  // @requirement GEO-V4-COMMERCE-01
  it("uses current transaction refund truth and keeps a limited first run plus reentry exactly once", async () => {
    const fake = fakeLimitedCommerceDatabase(report("completed_limited"));
    database.getSqlClient.mockReturnValue({ begin: fake.begin });
    const first = await terminalizePaidReportV4Core({ report: report("completed_limited"), workerId: "worker-v4" });
    expect(first).toMatchObject({ outcome: "completed_limited", refundId: "refund-v4" });
    expect(fake.state).toMatchObject({
      jobStage: "completed_limited",
      orderStatus: "completed_limited",
      orderRefundStatus: "pending",
      creditStatus: "refunded",
      creditsRemaining: 1,
      refunds: 1,
      tokens: 1,
      emails: 1,
      transitions: 1
    });
    const reentry = await terminalizePaidReportV4Core({ report: report("completed_limited"), workerId: "worker-v4" });
    expect(reentry).toMatchObject({ refundId: "refund-v4", accessTokenId: "token-v4", emailDeliveryId: "email-v4" });
    expect(fake.state).toMatchObject({ creditsRemaining: 1, refunds: 1, tokens: 1, emails: 1, transitions: 1 });
  });

  // @requirement GEO-V4-DELIVERY-01
  it("does not let a first commercial transition depend on an already-active diagnosis enhancement", async () => {
    const fake = fakeLimitedCommerceDatabase(report("completed_limited"), true);
    database.getSqlClient.mockReturnValue({ begin: fake.begin });
    await expect(terminalizePaidReportV4Core({
      report: report("completed_limited"),
      workerId: "worker-v4"
    })).rejects.toThrow(/active delivery revision/i);
    expect(fake.state).toMatchObject({
      jobStage: "synthesizing",
      creditStatus: "reserved",
      refunds: 0,
      tokens: 0,
      emails: 0,
      transitions: 0
    });
  });

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-DELIVERY-01
  it("rejects a historical-compatible V4 core without a locked configuration snapshot", async () => {
    const fake = fakeLimitedCommerceDatabase(report("completed_limited"), false, true);
    database.getSqlClient.mockReturnValue({ begin: fake.begin });
    await expect(terminalizePaidReportV4Core({
      report: report("completed_limited"),
      workerId: "worker-v4"
    })).rejects.toThrow(/configuration snapshot/i);
    expect(fake.state).toMatchObject({ transitions: 0, refunds: 0, tokens: 0, emails: 0 });
  });
});

describe("V4 all-questions-unavailable commercial terminalization admission", () => {
  const unavailableInput = () => ({
    reportId: "report-v4",
    coreJobId: "job-v4",
    orderId: "order-v4",
    siteSnapshotId: "snapshot-v4",
    questionSetId: "questions-v4",
    configSnapshotId: "config-v4",
    locale: "zh-CN",
    workerId: "worker-v4"
  });

  // @requirement GEO-V4-COMMERCE-01
  // @requirement GEO-V4-DELIVERY-01
  // @requirement GEO-V4-PDF-01
  it("rejects PDF-shaped unavailable terminalization input before touching PostgreSQL", async () => {
    await expect(terminalizeUnavailablePaidReportV4Core({
      ...unavailableInput(),
      pdfSha256: "forbidden"
    } as never)).rejects.toThrow(/PDF/i);
    expect(database.ensureDatabase).not.toHaveBeenCalled();
    expect(database.getSqlClient).not.toHaveBeenCalled();
  });

  // @requirement GEO-V4-COMMERCE-01
  it("rejects missing lineage identities and unsupported locales before touching PostgreSQL", async () => {
    await expect(terminalizeUnavailablePaidReportV4Core({ ...unavailableInput(), coreJobId: " " }))
      .rejects.toThrow(/core job identity/i);
    await expect(terminalizeUnavailablePaidReportV4Core({ ...unavailableInput(), locale: "fr-FR" }))
      .rejects.toThrow(/locale|language/i);
    expect(database.ensureDatabase).not.toHaveBeenCalled();
    expect(database.getSqlClient).not.toHaveBeenCalled();
  });

  // @requirement GEO-V4-COMMERCE-01
  it("refunds terminal unavailable checkpoints with mixed zero, one and two provider calls", async () => {
    const fake = fakeUnavailableCommerceDatabase([0, 1, 2]);
    database.getSqlClient.mockReturnValue({ begin: fake.begin });
    const first = await terminalizeUnavailablePaidReportV4Core(unavailableInput());
    expect(first).toMatchObject({ outcome: "unavailable", refundId: "refund-v4", emailDeliveryId: "email-v4" });
    expect(fake.state).toMatchObject({
      jobStage: "failed", jobExecution: "failed", orderStatus: "failed", orderRefundStatus: "pending",
      creditStatus: "refunded", keyStatus: "active", creditsRemaining: 1, refunds: 1, emails: 1, transitions: 1
    });
    expect(await terminalizeUnavailablePaidReportV4Core(unavailableInput())).toMatchObject({
      refundId: first.refundId, emailDeliveryId: first.emailDeliveryId
    });
    expect(fake.state).toMatchObject({ creditsRemaining: 1, refunds: 1, emails: 1, transitions: 1 });
  });
});

function fakeLimitedCommerceDatabase(payload: ReturnType<typeof report>, enhancementAlreadyActive = false, missingConfigSnapshot = false) {
  const state = {
    jobStage: "synthesizing",
    jobExecution: "running",
    orderStatus: "processing",
    orderRefundStatus: "not_required",
    creditStatus: "reserved",
    creditsRemaining: 0,
    refunds: 0,
    tokens: 0,
    emails: 0,
    transitions: 0
  };
  const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?").replaceAll(/\s+/gu, " ").trim();
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.includes("FROM report_artifact_revisions core")) return [{
      id: "core-v4", report_id: "report-v4", order_id: "order-v4", job_id: "job-v4", revision_kind: "generation",
      artifact_contract: "combined_geo_report_v4", status: enhancementAlreadyActive ? "ready" : "active", html_sha256: "html-hash", pdf_sha256: null,
      pdf_storage_key: null, ready_at: "2026-07-17T00:00:00.000Z", combined_report_id: "report-v4",
      combined_order_id: "order-v4", combined_job_id: "job-v4", question_set_id: "questions-v4", payload,
      scan_report_locale: "zh", config_snapshot_id: missingConfigSnapshot ? null : "config-v4",
      config_report_id: missingConfigSnapshot ? null : "report-v4", config_order_id: missingConfigSnapshot ? null : "order-v4",
      config_core_job_id: missingConfigSnapshot ? null : "job-v4",
      active_artifact_revision_id: enhancementAlreadyActive ? "enhancement-v4" : "core-v4",
      active_revision_kind: enhancementAlreadyActive ? "diagnosis_enhancement" : "generation",
      active_source_artifact_revision_id: enhancementAlreadyActive ? "core-v4" : null,
      active_artifact_contract: "combined_geo_report_v4", active_status: "active", active_order_id: "order-v4",
      active_report_id: "report-v4", active_html_sha256: "html-hash", active_pdf_sha256: null,
      active_pdf_storage_key: null, active_ready_at: "2026-07-17T00:00:00.000Z"
    }];
    if (sql.includes("FROM scan_jobs WHERE")) return [{
      id: "job-v4", report_id: "report-v4", locale: "zh", stage: state.jobStage, execution_state: state.jobExecution,
      checkpoint_revision: 7, lease_owner: state.jobExecution === "running" ? "worker-v4" : null,
      lease_expires_at: state.jobExecution === "running" ? "2099-01-01T00:00:00.000Z" : null,
      credit_reservation_id: "credit-v4", product_contract: "recommendation_forensics_v1",
      fulfillment_methodology: "two_stage_geo_report_v4", recommendation_report_version: 4,
      artifact_contract: "combined_geo_report_v4", business_question_set_id: "questions-v4", reason: "standard",
      correction_id: null, replacement_fulfillment_id: null
    }];
    if (sql.includes("FROM payment_orders WHERE id=") && sql.includes("fulfillment_job_id")) return [{
      id: "order-v4", report_id: "report-v4", fulfillment_job_id: "job-v4", provider: "airwallex",
      amount_minor: 2900, currency: "USD", report_locale: "zh", product_code: "recommendation_forensics_v1",
      fulfillment_methodology: "two_stage_geo_report_v4", recommendation_report_version: 4,
      business_question_set_id: "questions-v4", payment_status: "paid", fulfillment_status: state.orderStatus,
      refund_status: state.orderRefundStatus, delivery_status: "queued"
    }];
    if (sql.includes("FROM credit_ledger WHERE")) return [{
      id: "credit-v4", status: state.creditStatus, access_key_id: "key-v4", credits: 1, job_id: "job-v4",
      report_id: "report-v4", payment_order_id: "order-v4"
    }];
    if (sql.startsWith("UPDATE scan_jobs SET")) { state.jobStage = "completed_limited"; state.jobExecution = "completed"; return [{ id: "job-v4" }]; }
    if (sql.startsWith("INSERT INTO scan_job_transition_events")) { state.transitions += 1; return []; }
    if (sql.startsWith("UPDATE access_keys SET")) { state.creditsRemaining += 1; return [{ id: "key-v4" }]; }
    if (sql.startsWith("UPDATE credit_ledger SET status='refunded'")) { state.creditStatus = "refunded"; return [{ id: "credit-v4" }]; }
    if (sql.startsWith("INSERT INTO payment_refunds")) { state.refunds = 1; return []; }
    if (sql.startsWith("UPDATE payment_orders SET")) { state.orderStatus = "completed_limited"; state.orderRefundStatus = "pending"; return [{ id: "order-v4" }]; }
    if (sql.startsWith("SELECT refund_status FROM payment_orders")) return [{ refund_status: state.orderRefundStatus }];
    if (sql.startsWith("SELECT id,provider,reason,amount_minor,currency FROM payment_refunds")) return state.refunds ? [{ id: "refund-v4", provider: "airwallex", reason: "completed_limited", amount_minor: 2900, currency: "USD" }] : [];
    if (sql.startsWith("INSERT INTO report_access_tokens")) { state.tokens = 1; return []; }
    if (sql.startsWith("SELECT id,report_id,artifact_scope FROM report_access_tokens")) return [{ id: "token-v4", report_id: "report-v4", artifact_scope: "combined_geo_report_v4" }];
    if (sql.startsWith("INSERT INTO email_deliveries")) { state.emails = 1; return []; }
    if (sql.startsWith("SELECT id,order_id,report_id,template_type FROM email_deliveries")) return [{ id: "email-v4", order_id: "order-v4", report_id: "report-v4", template_type: "limited_report_refund" }];
    throw new Error(`Unexpected SQL in V4 commerce fixture: ${sql}; values=${values.length}`);
  };
  return { state, begin: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx) };
}

function fakeUnavailableCommerceDatabase(providerCallCounts: readonly number[]) {
  const state = {
    jobStage: "synthesizing", jobExecution: "running", orderStatus: "processing", orderRefundStatus: "not_required",
    deliveryStatus: "not_queued", creditStatus: "reserved", keyStatus: "exhausted", creditsRemaining: 0,
    refunds: 0, emails: 0, transitions: 0
  };
  const tx = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.join("?").replaceAll(/\s+/gu, " ").trim();
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.includes("FROM scan_jobs WHERE id=") && sql.includes("site_snapshot_id")) return [{
      id: "job-v4", report_id: "report-v4", site_snapshot_id: "snapshot-v4", locale: "zh", stage: state.jobStage,
      execution_state: state.jobExecution, checkpoint_revision: 4, lease_owner: state.jobExecution === "running" ? "worker-v4" : null,
      lease_expires_at: state.jobExecution === "running" ? "2099-01-01T00:00:00.000Z" : null,
      credit_reservation_id: "credit-v4", product_contract: "recommendation_forensics_v1",
      fulfillment_methodology: "two_stage_geo_report_v4", recommendation_report_version: 4,
      artifact_contract: "combined_geo_report_v4", business_question_set_id: "questions-v4", reason: "standard",
      correction_id: null, replacement_fulfillment_id: null
    }];
    if (sql.includes("FROM payment_orders WHERE id=")) return [{
      id: "order-v4", report_id: "report-v4", site_snapshot_id: "snapshot-v4", fulfillment_job_id: "job-v4",
      provider: "airwallex", amount_minor: 2900, currency: "USD", report_locale: "zh",
      product_code: "recommendation_forensics_v1", fulfillment_methodology: "two_stage_geo_report_v4",
      recommendation_report_version: 4, business_question_set_id: "questions-v4", payment_status: "paid",
      fulfillment_status: state.orderStatus, refund_status: state.orderRefundStatus, delivery_status: state.deliveryStatus
    }];
    if (sql.includes("FROM report_v4_config_snapshots")) return [{
      id: "config-v4", report_id: "report-v4", order_id: "order-v4", core_job_id: "job-v4", model_profile_hash: "model-hash"
    }];
    if (sql.includes("FROM report_v4_site_snapshots")) return [{
      id: "snapshot-v4", report_id: "report-v4", status: "completed", content_identity_hash: "content-hash", analyzable_page_count: 3
    }];
    if (sql.includes("FROM report_business_question_sets")) return [{
      id: "questions-v4", report_id: "report-v4", order_id: "order-v4", locale: "zh", status: "locked"
    }];
    if (sql.includes("FROM report_business_questions")) return [1, 2, 3].map((ordinal) => ({ id: `question-${ordinal}`, ordinal }));
    if (sql.includes("FROM report_v4_question_checkpoints")) return [1, 2, 3].map((ordinal) => ({
      identity_hash: `checkpoint-${ordinal}`, report_id: "report-v4", job_id: "job-v4", question_set_id: "questions-v4",
      question_id: `question-${ordinal}`, snapshot_id: "snapshot-v4", ordinal, state: "unavailable",
      model_config_identity_hash: "model-hash", provider_call_count: providerCallCounts[ordinal - 1],
      answer_payload: null, answer_content_hash: null
    }));
    if (sql.includes("FROM scan_reports scan")) return [{
      active_artifact_revision_id: null, artifacts: 0, combined_reports: 0, access_tokens: 0
    }];
    if (sql.includes("FROM credit_ledger credit JOIN access_keys")) return [{
      id: "credit-v4", status: state.creditStatus, access_key_id: "key-v4", credits: 1, job_id: "job-v4",
      report_id: "report-v4", payment_order_id: "order-v4", key_payment_order_id: "order-v4",
      key_status: state.keyStatus, key_credits_remaining: state.creditsRemaining
    }];
    if (sql.startsWith("UPDATE scan_jobs SET")) { state.jobStage = "failed"; state.jobExecution = "failed"; return [{ id: "job-v4" }]; }
    if (sql.startsWith("INSERT INTO scan_job_transition_events")) { state.transitions += 1; return []; }
    if (sql.startsWith("UPDATE access_keys SET")) { state.keyStatus = "active"; state.creditsRemaining += 1; return [{ id: "key-v4" }]; }
    if (sql.startsWith("UPDATE credit_ledger SET")) { state.creditStatus = "refunded"; return [{ id: "credit-v4" }]; }
    if (sql.startsWith("UPDATE payment_orders SET")) { state.orderStatus = "failed"; state.orderRefundStatus = "pending"; state.deliveryStatus = "queued"; return [{ id: "order-v4" }]; }
    if (sql.startsWith("INSERT INTO payment_refunds")) { state.refunds = 1; return []; }
    if (sql.startsWith("INSERT INTO email_deliveries")) { state.emails = 1; return []; }
    if (sql.includes("FROM scan_jobs job") && sql.includes("JOIN credit_ledger")) return [{
      job_stage: state.jobStage, execution_state: state.jobExecution, credit_status: state.creditStatus,
      fulfillment_status: state.orderStatus, refund_status: state.orderRefundStatus, artifacts: 0, combined_reports: 0, access_tokens: 0
    }];
    if (sql.startsWith("SELECT id,provider,reason,amount_minor,currency FROM payment_refunds")) return state.refunds ? [{
      id: "refund-v4", provider: "airwallex", reason: "report_failed", amount_minor: 2900, currency: "USD"
    }] : [];
    if (sql.startsWith("SELECT id,order_id,report_id,template_type FROM email_deliveries")) return state.emails ? [{
      id: "email-v4", order_id: "order-v4", report_id: "report-v4", template_type: "report_failed_refund"
    }] : [];
    throw new Error(`Unexpected SQL in unavailable V4 commerce fixture: ${sql}; values=${values.length}`);
  };
  return { state, begin: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx) };
}

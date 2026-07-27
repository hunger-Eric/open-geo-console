import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeReportV4DiagnosisTerminalCheckpointFingerprint, computeReportV4QuestionTerminalCheckpointFingerprint } from "../report-v4/report-v4-acceptance-checkpoint-fingerprints";
import type { ReportV4DiagnosisCheckpoint } from "./report-v4-diagnosis-checkpoints";
import type { ReportV4QuestionCheckpoint } from "./report-v4-question-checkpoints";
import {
  loadReportV4CommerceAuthoritySnapshot,
  loadReportV4CommerceAuthoritySnapshotInTransaction,
  type ReportV4CommerceAuthoritySnapshotSql,
} from "./report-v4-commerce-authority-snapshot";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";

// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-ACCEPT-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
describe("Report V4 commerce authority snapshot projector", () => {
  it("fails closed when the exact scenario or a bound anchor is missing", async () => {
    const missingScenario = fixture();
    missingScenario.scenario = [];
    await expect(load(missingScenario)).rejects.toThrow(/scenario/i);

    const missingConfig = fixture();
    missingConfig.config = [];
    await expect(load(missingConfig)).rejects.toThrow(/config/i);
  });

  it("rejects every missing or extra V4 job and artifact for the report", async () => {
    const missingJob = fixture();
    missingJob.jobs = missingJob.jobs.slice(0, 1);
    await expect(load(missingJob)).rejects.toThrow(/job/i);

    const extraJob = fixture();
    extraJob.jobs.push({ ...extraJob.jobs[0]!, id: "v4-extra", reason: "v4_pre_admission" });
    await expect(load(extraJob)).rejects.toThrow(/job/i);

    const missingArtifact = fixture();
    missingArtifact.artifacts = [];
    await expect(load(missingArtifact)).rejects.toThrow(/artifact/i);

    const extraArtifact = fixture();
    extraArtifact.artifacts.push({ ...extraArtifact.artifacts[0]!, id: "artifact-extra", revision: 2 });
    await expect(load(extraArtifact)).rejects.toThrow(/artifact/i);
  });

  it("requires one tier-matched dispatch for every scoped job", async () => {
    const missing = fixture();
    missing.dispatches = missing.dispatches.slice(0, 1);
    await expect(load(missing)).rejects.toThrow(/dispatch/i);

    const wrongTier = fixture();
    wrongTier.dispatches[0] = { ...wrongTier.dispatches[0]!, tier: "free" };
    await expect(load(wrongTier)).rejects.toThrow(/tier|dispatch/i);
  });

  it("canonically hashes selected_fields and never returns secret sentinels", async () => {
    const first = fixture();
    const second = fixture();
    first.paymentEvents[0]!.selected_fields = { z: 1, a: { beta: true, alpha: null } };
    second.paymentEvents[0]!.selected_fields = { a: { alpha: null, beta: true }, z: 1 };
    const left = await load(first);
    const right = await load(second);
    expect(left.paymentEvents[0]!.selectedFieldsHash).toBe(right.paymentEvents[0]!.selectedFieldsHash);
    expect(left.fingerprint).toBe(right.fingerprint);
    const serialized = JSON.stringify(left);
    for (const sentinel of [
      "SECRET_EMAIL", "SECRET_URL", "SECRET_TOKEN", "SECRET_KEY", "SECRET_PROVIDER_PAYLOAD",
      "SECRET_STORAGE_KEY", "SECRET_READINESS",
    ]) expect(serialized).not.toContain(sentinel);
  });

  it("opens the complete observation in one repeatable-read read-only transaction", async () => {
    const rows = fixture();
    const calls: string[] = [];
    await load(rows, calls);
    expect(calls[0]).toBe("begin:isolation level repeatable read read only");
    expect(calls.filter((call) => call.startsWith("begin:"))).toHaveLength(1);
    expect(calls).toContain("query:isolation");
    const statements = calls.filter((call) => call.startsWith("sql:")).join("\n");
    expect(statements).not.toMatch(/select\s+\*/iu);
    expect(statements).not.toMatch(/customer_email_(encrypted|hmac)|checkout_idempotency_hmac|token_hmac|key_hmac|\breadiness\b/iu);
  });

  it("projects through the caller-owned transaction without opening a nested transaction", async () => {
    const rows = fixture();
    const calls: string[] = [];
    const sql = createFakeSql(rows, calls);
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      const result = await loadReportV4CommerceAuthoritySnapshotInTransaction(tx, {
        sessionId: SESSION,
        scenarioId: SCENARIO,
        phase: "baseline"
      });
      expect(result.phase).toBe("baseline");
    });
    expect(calls.filter((call) => call.startsWith("begin:"))).toHaveLength(1);
  });

  it("rejects a missing, foreign, or state-mismatched checkpoint terminal event", async () => {
    const rows = fixture();
    rows.terminalEvents.push({ operation: "question_answer", unit_id: "foreign-question", details: { checkpointHash: sha("foreign"), state: "answered" } });
    await expect(load(rows)).rejects.toThrow(/checkpoint terminal event/i);
  });

  it("pairs every terminal checkpoint to its identity-hash event at attempt zero", async () => {
    const rows = fixture();
    const evidence = terminalQuestionEvidence();
    rows.questionCheckpoints.push(...evidence.checkpoints);
    rows.terminalEvents.push(...evidence.events);
    const result = await load(rows);
    expect(result.questionCheckpoints).toHaveLength(3);
    expect(result.questionCheckpoints.every((checkpoint) => checkpoint.state === "unavailable")).toBe(true);
    rows.terminalEvents[0] = { ...rows.terminalEvents[0]!, attempt: 1 };
    await expect(load(rows)).rejects.toThrow(/terminal event lineage/i);
  });

  it("rejects V4 PDF presence and hashes a non-null public error", async () => {
    const pdf = fixture();
    pdf.artifacts[0] = { ...pdf.artifacts[0]!, pdf_sha256: sha("pdf") };
    await expect(load(pdf)).rejects.toThrow(/PDF|artifact/i);
    const safe = fixture();
    safe.jobs[0] = { ...safe.jobs[0]!, public_error: "SECRET_URL" };
    const result = await load(safe);
    expect(result.jobs.find((job) => job.reason === "v4_pre_admission")!.publicError).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(result)).not.toContain("SECRET_URL");
  });

  it("enforces the persisted report locale against the exact order", async () => {
    const rows = fixture();
    rows.report[0] = { ...rows.report[0]!, report_locale: "zh" };
    await expect(load(rows)).rejects.toThrow(/locale lineage/i);
  });

  it("binds email events to one exact delivery/provider pair", async () => {
    const positive = fixture();
    addEmailPair(positive);
    positive.emailEvents[0] = { ...positive.emailEvents[0]!, delivery_id: null };
    await expect(load(positive)).resolves.toMatchObject({ emailAuthority: { events: [{ deliveryIdHash: null }] } });

    const crossed = fixture();
    addEmailPair(crossed);
    crossed.emailEvents[0] = { ...crossed.emailEvents[0]!, provider_email_id: crossed.deliveries[1]!.provider_email_id };
    await expect(load(crossed)).rejects.toThrow(/provider pair/i);

    const ambiguous = fixture();
    addEmailPair(ambiguous);
    ambiguous.deliveries[1] = { ...ambiguous.deliveries[1]!, provider_email_id: ambiguous.deliveries[0]!.provider_email_id };
    ambiguous.emailEvents[0] = { ...ambiguous.emailEvents[0]!, delivery_id: null };
    await expect(load(ambiguous)).rejects.toThrow(/exactly one scoped delivery pair/i);
  });

  it.each([
    ["success", 3, 0],
    ["diagnosis_failure", 3, 1],
    ["question_failure", 0, 0],
  ] as const)("accepts the protected final %s topology", async (kind, diagnosisCount, failedDiagnoses) => {
    const rows = protectedFinalFixture(kind);
    const result = await load(rows, [], "final");
    expect(result.scenarioKind).toBe(kind);
    expect(result.diagnosisCheckpoints).toHaveLength(diagnosisCount);
    expect(result.diagnosisCheckpoints.filter((checkpoint) => checkpoint.state === "failed")).toHaveLength(failedDiagnoses);
    if (kind === "question_failure") {
      expect(result.jobs.some((job) => job.reason === "v4_diagnosis_enhancement")).toBe(false);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]!.status).toBe("active");
    } else {
      expect(result.artifacts.find((artifact) => artifact.revisionKind === "generation")!.status).toBe("ready");
      expect(result.artifacts.find((artifact) => artifact.revisionKind === "diagnosis_enhancement")!.status).toBe("active");
    }
  });

  it("projects diagnosis source audits as canonical hash-safe records without plaintext", async () => {
    const rows = protectedFinalFixture("success");
    const result = await load(rows, [], "final");
    const checkpoint = result.diagnosisCheckpoints.find((item) => item.ordinal === 1)!;
    expect(checkpoint.sourceAuditCount).toBe(1);
    expect(checkpoint.sourceAuditRecords).toEqual([{
      questionIdHash: sha("question-1"),
      sourceIdHash: sha("source-1"),
      canonicalUrlHash: sha("https://source-1.example/evidence"),
      status: "available",
      summaryHash: sha("Audited evidence 1."),
    }]);
    const sourceAuditPayload = rows.diagnosisCheckpoints.find((item) => item.ordinal === 1)!.source_audit_payload;
    expect(checkpoint.sourceAuditPayloadHash).toBe(sha(stableTestJson(sourceAuditPayload)));
    expect(result.diagnosisCheckpoints.find((item) => item.ordinal === 2)!.sourceAuditRecords).toEqual([
      expect.objectContaining({ status: "inaccessible", summaryHash: null }),
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("https://source-1.example/evidence");
    expect(serialized).not.toContain("Audited evidence 1.");
  });

  it("projects question sources as canonical hash-safe records without plaintext", async () => {
    const rows = protectedFinalFixture("success");
    const result = await load(rows, [], "final");
    const checkpoint = result.questionCheckpoints.find((item) => item.ordinal === 1)!;
    expect(checkpoint.sourceCount).toBe(1);
    expect(checkpoint.sourceRecords).toEqual([{
      questionIdHash: sha("question-1"),
      sourceIdHash: sha("source-1"),
      titleHash: sha("Source 1"),
      canonicalUrlHash: sha("https://source-1.example/evidence"),
      citedTextHash: sha("Evidence 1."),
      retrievalStatus: "available",
    }]);
    const sourcePayload = rows.questionCheckpoints.find((item) => item.ordinal === 1)!.source_payload;
    expect(checkpoint.sourcePayloadHash).toBe(sha(stableTestJson(sourcePayload)));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("https://source-1.example/evidence");
    expect(serialized).not.toContain("Source 1");
    expect(serialized).not.toContain("Evidence 1.");
  });

  it.each([
    ["extra field", (source: Record<string, unknown>) => ({ ...source, extra: "plaintext" }), /fields.*exact/iu],
    ["duplicate source ID", (source: Record<string, unknown>) => [source, { ...source, canonicalUrl: "https://other.example/evidence" }], /sourceId.*unique/iu],
    ["duplicate normalized URL", (source: Record<string, unknown>) => [source, { ...source, sourceId: "source-alias",
      canonicalUrl: "https://source-1.example:443/evidence#duplicate" }], /canonical URL.*unique.*normalization/iu],
    ["wrong status", (source: Record<string, unknown>) => ({ ...source, retrievalStatus: "unknown" }), /retrievalStatus.*invalid/iu],
    ["wrong question", (source: Record<string, unknown>) => ({ ...source, questionId: "foreign-question" }), /checkpoint question/iu],
  ] as const)("rejects raw question source %s", async (_label, mutate, pattern) => {
    const rows = protectedFinalFixture("success");
    const checkpoint = rows.questionCheckpoints.find((item) => item.ordinal === 1)!;
    const source = (checkpoint.source_payload as Record<string, unknown>[])[0]!;
    const changed = mutate(source);
    checkpoint.source_payload = Array.isArray(changed) ? changed : [changed];
    await expect(load(rows, [], "final")).rejects.toThrow(pattern);
  });

  it("rejects distinct source IDs that collapse to one normalized canonical URL", async () => {
    const rows = protectedFinalFixture("success");
    const diagnosis = rows.diagnosisCheckpoints.find((item) => item.ordinal === 1)!;
    const firstAudit = (diagnosis.source_audit_payload as Record<string, unknown>[])[0]!;
    diagnosis.source_audit_payload = [firstAudit, {
      ...firstAudit,
      sourceId: "source-1-alias",
      canonicalUrl: "https://source-1.example:443/evidence#duplicate",
    }];
    await expect(load(rows, [], "final")).rejects.toThrow(/canonical URL.*unique.*normalization/iu);
  });
});

type Rows = ReturnType<typeof fixture>;
async function load(rows: Rows, calls: string[] = [], phase: "baseline" | "final" = "baseline") {
  return loadReportV4CommerceAuthoritySnapshot(createFakeSql(rows, calls), {
    sessionId: SESSION,
    scenarioId: SCENARIO,
    phase,
  });
}

function createFakeSql(rows: Rows, calls: string[]): ReportV4CommerceAuthoritySnapshotSql {
  return {
    async begin<T>(options: string, work: (sql: { unsafe<R extends Record<string, unknown>[]>(query: string, parameters?: readonly unknown[]): Promise<R> }) => Promise<T>): Promise<T> {
      calls.push(`begin:${options}`);
      return work({
        async unsafe<R extends Record<string, unknown>[]>(query: string): Promise<R> {
          const match = /\/\* authority:([a-z-]+) \*\//u.exec(query);
          if (!match) throw new Error(`unlabelled authority query: ${query}`);
          calls.push(`query:${match[1]}`);
          calls.push(`sql:${query}`);
          return structuredClone(rows[camel(match[1])] ?? []) as R;
        },
      });
    },
  };
}

function camel(value: string): keyof Rows {
  return value.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase()) as keyof Rows;
}

function fixture() {
  const at = "2026-07-16T00:00:00.000Z";
  const report = "report-v4";
  const order = "order-v4";
  const pre = "job-pre";
  const core = "job-core";
  const snapshot = "snapshot-v4";
  const config = "v4-config-" + sha("config");
  const questions = "questions-v4";
  const artifact = "artifact-core";
  const access = "access-v4";
  const credit = "credit-v4";
  const commonJob = {
    report_id: report, tier: "deep", product_contract: "recommendation_forensics_v1",
    fulfillment_methodology: "two_stage_geo_report_v4", recommendation_report_version: 4,
    artifact_contract: "combined_geo_report_v4", locale: "en", stage: "completed",
    execution_state: "completed", current_phase: "terminalization", checkpoint_revision: 1,
    phase_attempt: 0, resume_generation: 0, progress: 100, planned_pages: 1,
    successful_pages: 1, failed_pages: 0, attempts: 1, max_attempts: 3,
    error_code: null, public_error: null,
  };
  return {
    isolation: [{ transaction_isolation: "repeatable read", transaction_read_only: "on", captured_at: at }],
    scenario: [{ session_id: SESSION, scenario_id: SCENARIO, kind: "question_failure", report_id: report, order_id: order,
      pre_admission_job_id: pre, core_job_id: core, enhancement_job_id: null, site_snapshot_id: snapshot,
      config_snapshot_id: config, question_set_id: questions, core_artifact_revision_id: artifact,
      enhancement_artifact_revision_id: null }],
    report: [{ id: report, site_key: "SECRET_URL", report_locale: "en", active_artifact_revision_id: artifact }],
    siteSnapshot: [{ id: snapshot, report_id: report, site_key: "SECRET_URL" }],
    config: [{ id: config, report_id: report, order_id: order, core_job_id: core }],
    questionSet: [{ id: questions, report_id: report, order_id: order }],
    orders: [{ id: order, provider: "airwallex", provider_checkout_id: "provider-checkout",
      provider_payment_id: "provider-payment", report_id: report, site_key: "SECRET_URL",
      site_snapshot_id: snapshot, fulfillment_job_id: core, product_code: "recommendation_forensics_v1",
      business_question_set_id: questions, fulfillment_methodology: "two_stage_geo_report_v4",
      recommendation_report_version: 4, catalog_version: "catalog-v4", terms_version: "terms-v4",
      refund_policy_version: "refund-v4", report_locale: "en", currency: "USD", amount_minor: 100,
      tax_amount_minor: null, payment_status: "paid", fulfillment_status: "completed",
      refund_status: "not_required", delivery_status: "delivered", courtesy_non_billable: false,
      paid_at: at, delivery_deadline_at: at, fulfilled_at: at, refunded_at: null,
      checkout_idempotency_hmac: "SECRET_KEY", customer_email_encrypted: "SECRET_EMAIL" }],
    paymentEvents: [{ id: "payment-event", provider: "airwallex", provider_event_id: "provider-event",
      event_type: "payment_intent.succeeded", payload_hash: sha("payload"), selected_fields: { a: 1 },
      processing_status: "processed", order_id: order, provider_created_at: at, processed_at: at,
      error_code: null, raw_payload: "SECRET_PROVIDER_PAYLOAD" }],
    jobs: [
      { ...commonJob, id: pre, site_snapshot_id: null, business_question_set_id: null,
        reason: "v4_pre_admission", credit_reservation_id: null },
      { ...commonJob, id: core, site_snapshot_id: snapshot, business_question_set_id: questions,
        reason: "standard", credit_reservation_id: credit },
    ],
    dispatches: [
      { id: "dispatch-pre", job_id: pre, tier: "deep", schema_version: 1, state: "published", attempts: 1, published_at: at, last_error_code: null },
      { id: "dispatch-core", job_id: core, tier: "deep", schema_version: 1, state: "published", attempts: 1, published_at: at, last_error_code: null },
    ],
    accessKeys: [{ id: access, key_prefix: "SECRET_KEY", payment_order_id: order, status: "exhausted",
      credits_remaining: 0, expires_at: at, revoked_at: null, key_hmac: "SECRET_KEY" }],
    credits: [{ id: credit, access_key_id: access, report_id: report, job_id: core,
      payment_order_id: order, idempotency_key: "SECRET_KEY", credits: 1, status: "settled",
      reserved_at: at, settled_at: at, refunded_at: null }],
    refunds: [],
    deliveries: [], emailEvents: [],
    tokens: [{ id: "token-v4", report_id: report, token_prefix: "SECRET_TOKEN",
      artifact_scope: "combined_geo_report_v4", expires_at: at, last_used_at: null, revoked_at: null,
      token_hmac: "SECRET_TOKEN" }],
    artifacts: [{ id: artifact, report_id: report, order_id: order, job_id: core,
      config_snapshot_id: config, correction_id: null, replacement_fulfillment_id: null,
      source_artifact_revision_id: null, revision_kind: "generation", revision: 1,
      artifact_contract: "combined_geo_report_v4", status: "active", payload_identity_hash: sha("artifact-payload"),
      html_sha256: sha("html"), pdf_sha256: null, pdf_storage_key_present: false,
      unselected_storage_key: "SECRET_STORAGE_KEY", readiness: "SECRET_READINESS", ready_at: at, activated_at: at }],
    questionCheckpoints: [], diagnosisCheckpoints: [], terminalEvents: [],
  };
}

function terminalQuestionEvidence() {
  const checkpoints: Record<string, unknown>[] = [];
  const events: Record<string, unknown>[] = [];
  for (const ordinal of [1, 2, 3] as const) {
    const questionId = `question-${ordinal}`;
    const questionIdentityHash = sha(`question-identity-${ordinal}`);
    const modelConfigIdentityHash = sha("model-config");
    const inputIdentityHash = sha(`input-${ordinal}`);
    const identityHash = sha(JSON.stringify({ reportId: "report-v4", jobId: "job-core", questionSetId: "questions-v4",
      snapshotId: "snapshot-v4", modelConfigIdentityHash, order: ordinal, questionId, questionIdentityHash, inputIdentityHash }));
    const checkpoint = { identityHash, reportId: "report-v4", jobId: "job-core", questionSetId: "questions-v4", questionId,
      snapshotId: "snapshot-v4", ordinal, state: "unavailable", questionIdentityHash, modelConfigIdentityHash, inputIdentityHash,
      providerCallCount: 0, answerPayload: null, sourcePayload: [], answerContentHash: null } satisfies ReportV4QuestionCheckpoint;
    checkpoints.push({ identity_hash: identityHash, report_id: checkpoint.reportId, job_id: checkpoint.jobId,
      question_set_id: checkpoint.questionSetId, question_id: questionId, snapshot_id: checkpoint.snapshotId, ordinal,
      state: checkpoint.state, question_identity_hash: questionIdentityHash, model_config_identity_hash: modelConfigIdentityHash,
      input_identity_hash: inputIdentityHash, provider_call_count: 0, answer_payload: null, source_payload: [], answer_content_hash: null });
    events.push({ operation: "question_answer", unit_id: identityHash, attempt: 0, phase: "observed",
      details: { checkpointHash: computeReportV4QuestionTerminalCheckpointFingerprint(checkpoint), state: "unavailable" } });
  }
  return { checkpoints, events };
}

function addEmailPair(rows: ReturnType<typeof fixture>): void {
  const at = "2026-07-16T00:00:00.000Z";
  rows.deliveries.push(...[1, 2].map((index) => ({ id: `delivery-${index}`, order_id: "order-v4", report_id: "report-v4",
    template_type: "report_ready", template_version: "v4", locale: "en", recipient_ref: `recipient-${index}`,
    provider: "resend", provider_email_id: `provider-email-${index}`, business_idempotency_key: `email-idem-${index}`,
    state: "delivered", attempts: 1, failure_code: null, last_provider_event_at: at, sent_at: at, delivered_at: at })));
  rows.emailEvents.push({ id: "email-event-1", provider_event_id: "provider-event-1", provider_email_id: "provider-email-1",
    delivery_id: "delivery-1", provider: "resend", event_type: "email.delivered", processing_status: "processed",
    payload_hash: sha("email-payload"), provider_created_at: at, error_code: null });
}

function protectedFinalFixture(kind: "success" | "diagnosis_failure" | "question_failure") {
  const rows = fixture();
  rows.scenario[0] = { ...rows.scenario[0]!, kind };
  if (kind === "question_failure") {
    const questions = terminalQuestionEvidence();
    rows.questionCheckpoints.push(...questions.checkpoints);
    rows.terminalEvents.push(...questions.events);
    return rows;
  }
  rows.scenario[0] = { ...rows.scenario[0]!, enhancement_job_id: "job-enhancement", enhancement_artifact_revision_id: "artifact-enhancement" };
  rows.report[0] = { ...rows.report[0]!, active_artifact_revision_id: "artifact-enhancement" };
  const core = rows.jobs.find((job) => job.id === "job-core")!;
  rows.jobs.push({ ...core, id: "job-enhancement", site_snapshot_id: null, reason: "v4_diagnosis_enhancement", credit_reservation_id: null });
  rows.dispatches.push({ ...rows.dispatches[0]!, id: "dispatch-enhancement", job_id: "job-enhancement" });
  rows.artifacts[0] = { ...rows.artifacts[0]!, status: "ready" };
  rows.artifacts.push({ ...rows.artifacts[0]!, id: "artifact-enhancement", job_id: "job-enhancement", source_artifact_revision_id: "artifact-core",
    revision_kind: "diagnosis_enhancement", revision: 2, status: "active", payload_identity_hash: sha("enhancement-payload"), html_sha256: sha("enhancement-html") });
  const evidence = answeredQuestionAndDiagnosisEvidence(
    kind === "diagnosis_failure" ? 2 : null,
    kind === "success" ? 2 : null,
  );
  rows.questionCheckpoints.push(...evidence.questions);
  rows.diagnosisCheckpoints.push(...evidence.diagnoses);
  rows.terminalEvents.push(...evidence.events);
  return rows;
}

function answeredQuestionAndDiagnosisEvidence(
  failedOrdinal: 1 | 2 | 3 | null,
  inaccessibleOrdinal: 1 | 2 | 3 | null = null,
) {
  const questions: Record<string, unknown>[] = [], diagnoses: Record<string, unknown>[] = [], events: Record<string, unknown>[] = [];
  for (const ordinal of [1, 2, 3] as const) {
    const questionId=`question-${ordinal}`, questionIdentityHash=sha(`question-identity-${ordinal}`), modelConfigIdentityHash=sha("model-config"), inputIdentityHash=sha(`question-input-${ordinal}`);
    const identityHash=sha(JSON.stringify({reportId:"report-v4",jobId:"job-core",questionSetId:"questions-v4",snapshotId:"snapshot-v4",modelConfigIdentityHash,order:ordinal,questionId,questionIdentityHash,inputIdentityHash}));
    const answerPayload={order:ordinal,questionId,questionText:`Question ${ordinal}?`,status:"answered" as const,answer:`Answer ${ordinal}.`};
    const sourcePayload=[{questionId,sourceId:`source-${ordinal}`,title:`Source ${ordinal}`,canonicalUrl:`https://source-${ordinal}.example/evidence`,citedText:`Evidence ${ordinal}.`,retrievalStatus:"available" as const}];
    const question={identityHash,reportId:"report-v4",jobId:"job-core",questionSetId:"questions-v4",questionId,snapshotId:"snapshot-v4",ordinal,state:"answered" as const,questionIdentityHash,modelConfigIdentityHash,inputIdentityHash,providerCallCount:1 as const,answerPayload,sourcePayload,answerContentHash:sha(JSON.stringify({answerPayload,sourcePayload}))} satisfies ReportV4QuestionCheckpoint;
    questions.push({identity_hash:identityHash,report_id:question.reportId,job_id:question.jobId,question_set_id:question.questionSetId,question_id:questionId,snapshot_id:question.snapshotId,ordinal,state:question.state,question_identity_hash:questionIdentityHash,model_config_identity_hash:modelConfigIdentityHash,input_identity_hash:inputIdentityHash,provider_call_count:1,answer_payload:answerPayload,source_payload:sourcePayload,answer_content_hash:question.answerContentHash});
    events.push({operation:"question_answer",unit_id:identityHash,attempt:0,phase:"observed",details:{checkpointHash:computeReportV4QuestionTerminalCheckpointFingerprint(question),state:"answered"}});

    const sourceStatus=inaccessibleOrdinal===ordinal?"inaccessible" as const:"available" as const;
    const diagnosisInput=diagnosisInputFixture(ordinal,sourceStatus), diagnosisInputIdentityHash=fingerprint(diagnosisInput);
    const diagnosisIdentityHash=fingerprint({reportId:"report-v4",enhancementJobId:"job-enhancement",coreArtifactRevisionId:"artifact-core",configSnapshotId:`v4-config-${sha("config")}`,questionSetId:"questions-v4",snapshotId:"snapshot-v4",questionId,ordinal,inputIdentityHash:diagnosisInputIdentityHash});
    const failed=failedOrdinal===ordinal, sourceAudits=diagnosisSourceAudits(ordinal,sourceStatus), diagnosis=failed?null:diagnosisOutput(ordinal), diagnosisContentHash=diagnosis===null?null:fingerprint(diagnosis);
    const checkpoint={reportId:"report-v4",enhancementJobId:"job-enhancement",coreArtifactRevisionId:"artifact-core",configSnapshotId:`v4-config-${sha("config")}`,questionSetId:"questions-v4",snapshotId:"snapshot-v4",questionId,ordinal,identityHash:diagnosisIdentityHash,state:failed?"failed" as const:"completed" as const,inputIdentityHash:diagnosisInputIdentityHash,diagnosisInput,providerCallCount:failed?2 as const:1 as const,sourceAudits,diagnosis,diagnosisContentHash} satisfies ReportV4DiagnosisCheckpoint;
    diagnoses.push({identity_hash:diagnosisIdentityHash,report_id:checkpoint.reportId,enhancement_job_id:checkpoint.enhancementJobId,core_artifact_revision_id:checkpoint.coreArtifactRevisionId,config_snapshot_id:checkpoint.configSnapshotId,question_set_id:checkpoint.questionSetId,question_id:questionId,snapshot_id:checkpoint.snapshotId,ordinal,state:checkpoint.state,input_identity_hash:diagnosisInputIdentityHash,diagnosis_input_payload:diagnosisInput,provider_call_count:checkpoint.providerCallCount,source_audit_payload:sourceAudits,diagnosis_payload:diagnosis,diagnosis_content_hash:diagnosisContentHash});
    events.push({operation:"source_diagnosis",unit_id:diagnosisIdentityHash,attempt:0,phase:"observed",details:{checkpointHash:computeReportV4DiagnosisTerminalCheckpointFingerprint(checkpoint),state:checkpoint.state}});
  }
  return {questions,diagnoses,events};
}

function diagnosisInputFixture(ordinal:1|2|3,status:"available"|"inaccessible"="available"){return{question:{questionId:`question-${ordinal}`,text:`Question ${ordinal}?`},answer:`Answer ${ordinal}.`,locale:"en",sources:[{questionId:`question-${ordinal}`,sourceId:`source-${ordinal}`,title:`Source ${ordinal}`,canonicalUrl:`https://source-${ordinal}.example/evidence`,excerpt:`Evidence ${ordinal}.`,retrievalStatus:status}],targetPages:[{questionId:`question-${ordinal}`,pageId:`page-${ordinal}`,url:`https://target.example/page-${ordinal}`,relevanceReason:`Relevant ${ordinal}.`,summary:`Target summary ${ordinal}.`,sourceLocations:[{locationId:`location-${ordinal}`,startOffset:0,endOffset:20}]}]};}
function diagnosisSourceAudits(ordinal:1|2|3,status:"available"|"inaccessible"="available"){return[{questionId:`question-${ordinal}`,sourceId:`source-${ordinal}`,canonicalUrl:`https://source-${ordinal}.example/evidence`,status,...(status==="available"?{summary:`Audited evidence ${ordinal}.`}:{})}];}
function diagnosisOutput(ordinal:1|2|3){const refs=[`source-${ordinal}`,`location-${ordinal}`];return{selectionSummary:`Selection summary ${ordinal}.`,observableFactors:["problem_match","factual_specificity","target_clarity"].map((kind,index)=>({kind,observation:`Observation ${ordinal}-${index}.`,evidenceRefs:refs})),targetGap:`Target gap ${ordinal}.`,recommendedActions:[1,2,3].map((priority)=>({priority,action:`Action ${ordinal}-${priority}.`,evidenceRefs:refs})),detailedEvidenceRefs:refs};}
function fingerprint(value:unknown):string{return sha(stableTestJson(value));}
function stableTestJson(value:unknown):string{if(value===null||typeof value==="string"||typeof value==="boolean"||typeof value==="number")return JSON.stringify(value);if(Array.isArray(value))return`[${value.map(stableTestJson).join(",")}]`;return`{${Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>`${JSON.stringify(key)}:${stableTestJson(child)}`).join(",")}}`;}

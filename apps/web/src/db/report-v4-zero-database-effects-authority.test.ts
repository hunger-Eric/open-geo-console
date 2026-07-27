import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  REPORT_V4_ZERO_DATABASE_FACT_NAMES,
  loadReportV4ZeroDatabaseEffectsAuthorityInTransaction,
  projectReportV4ZeroDatabaseEffectsAuthority,
  type LoadReportV4ZeroDatabaseEffectsAuthorityInput,
  type ReportV4ZeroDatabaseEffectsRawSnapshot
} from "./report-v4-zero-database-effects-authority";
import type { ReportV4CommerceAuthoritySnapshot } from "./report-v4-commerce-authority-snapshot";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";
const PAID_AT = "2026-07-16T10:00:00.000Z";

function input(overrides: Partial<LoadReportV4ZeroDatabaseEffectsAuthorityInput> = {}): LoadReportV4ZeroDatabaseEffectsAuthorityInput {
  return {
    sessionId: SESSION,
    scenarioId: SCENARIO,
    phase: "baseline",
    ...overrides
  };
}

function anchor(overrides: Record<string, unknown> = {}) {
  return {
    session_id: SESSION, scenario_id: SCENARIO, kind: "success", scenario_state: "collecting", session_state: "collecting",
    report_id: "report-secret", order_id: "order-secret", pre_admission_job_id: "pre-secret", core_job_id: "core-secret",
    enhancement_job_id: null, site_snapshot_id: "snapshot-secret", config_snapshot_id: "config-secret",
    question_set_id: "questions-secret", core_artifact_revision_id: "artifact-secret",
    enhancement_artifact_revision_id: null, bound_report_id: "report-secret", active_artifact_revision_id: "artifact-secret",
    report_locale: "en", order_report_id: "report-secret", order_core_job_id: "core-secret",
    order_site_snapshot_id: "snapshot-secret", order_question_set_id: "questions-secret", order_report_locale: "en",
    order_provider: "airwallex", payment_status: "paid", fulfillment_status: "completed", refund_status: "not_required", paid_at: PAID_AT,
    product_code: "recommendation_forensics_v1", fulfillment_methodology: "two_stage_geo_report_v4",
    recommendation_report_version: 4,
    pre_job_id: "pre-secret", pre_report_id: "report-secret", pre_site_snapshot_id: null, pre_tier: "deep",
    pre_product_contract: "recommendation_forensics_v1", pre_fulfillment_methodology: "two_stage_geo_report_v4",
    pre_recommendation_report_version: 4, pre_artifact_contract: "combined_geo_report_v4", pre_question_set_id: null,
    pre_locale: "en", pre_reason: "v4_pre_admission", pre_credit_reservation_id: null, pre_correction_id: null,
    pre_replacement_fulfillment_id: null,
    core_job_row_id: "core-secret", core_report_id: "report-secret", core_site_snapshot_id: "snapshot-secret",
    core_tier: "deep", core_product_contract: "recommendation_forensics_v1",
    core_fulfillment_methodology: "two_stage_geo_report_v4", core_recommendation_report_version: 4,
    core_artifact_contract: "combined_geo_report_v4", core_question_set_id: "questions-secret", core_locale: "en",
    core_reason: "standard", core_credit_reservation_id: "credit", core_correction_id: null,
    core_replacement_fulfillment_id: null,
    enhancement_job_row_id: null, enhancement_report_id: null, enhancement_site_snapshot_id: null, enhancement_tier: null,
    enhancement_product_contract: null, enhancement_fulfillment_methodology: null,
    enhancement_recommendation_report_version: null, enhancement_artifact_contract: null,
    enhancement_question_set_id: null, enhancement_locale: null, enhancement_reason: null,
    enhancement_credit_reservation_id: null, enhancement_correction_id: null, enhancement_replacement_fulfillment_id: null,
    core_artifact_row_id: "artifact-secret", core_artifact_report_id: "report-secret", core_artifact_order_id: "order-secret",
    core_artifact_job_id: "core-secret", core_artifact_config_snapshot_id: "config-secret",
    core_artifact_source_revision_id: null, core_artifact_revision_kind: "generation",
    core_artifact_row_contract: "combined_geo_report_v4", core_artifact_status: "active",
    core_payload_report_id: "report-secret", core_payload_order_id: "order-secret", core_payload_job_id: "core-secret",
    core_payload_question_set_id: "questions-secret",
    enhancement_artifact_row_id: null, enhancement_artifact_report_id: null, enhancement_artifact_order_id: null,
    enhancement_artifact_job_id: null, enhancement_artifact_config_snapshot_id: null,
    enhancement_artifact_source_revision_id: null, enhancement_artifact_revision_kind: null,
    enhancement_artifact_row_contract: null, enhancement_artifact_status: null, enhancement_payload_report_id: null,
    enhancement_payload_order_id: null, enhancement_payload_job_id: null, enhancement_payload_question_set_id: null,
    ...overrides
  };
}

function enhancedAnchor(overrides: Record<string, unknown> = {}) {
  const enhancementJobId = deterministicEnhancementJobId();
  return anchor({
    enhancement_job_id: enhancementJobId, enhancement_artifact_revision_id: "enhancement-artifact-secret",
    active_artifact_revision_id: "enhancement-artifact-secret", core_artifact_status: "ready",
    enhancement_job_row_id: enhancementJobId, enhancement_report_id: "report-secret", enhancement_site_snapshot_id: null,
    enhancement_tier: "deep", enhancement_product_contract: "recommendation_forensics_v1",
    enhancement_fulfillment_methodology: "two_stage_geo_report_v4", enhancement_recommendation_report_version: 4,
    enhancement_artifact_contract: "combined_geo_report_v4", enhancement_question_set_id: "questions-secret",
    enhancement_locale: "en", enhancement_reason: "v4_diagnosis_enhancement", enhancement_credit_reservation_id: null,
    enhancement_correction_id: null, enhancement_replacement_fulfillment_id: null,
    enhancement_artifact_row_id: "enhancement-artifact-secret", enhancement_artifact_report_id: "report-secret",
    enhancement_artifact_order_id: "order-secret", enhancement_artifact_job_id: enhancementJobId,
    enhancement_artifact_config_snapshot_id: "config-secret", enhancement_artifact_source_revision_id: "artifact-secret",
    enhancement_artifact_revision_kind: "diagnosis_enhancement",
    enhancement_artifact_row_contract: "combined_geo_report_v4", enhancement_artifact_status: "active",
    enhancement_payload_report_id: "report-secret", enhancement_payload_order_id: "order-secret",
    enhancement_payload_job_id: enhancementJobId, enhancement_payload_question_set_id: "questions-secret",
    ...overrides
  });
}

function deterministicEnhancementJobId(): string {
  const digest = createHash("sha256").update([
    "report-secret", "order-secret", "core-secret", "artifact-secret", "config-secret", "snapshot-secret",
    "questions-secret", "en"
  ].join("\0")).digest("hex");
  return `v4-diagnosis-job-${digest}`;
}

function commerceRows() {
  return [
    commerceRow("paymentEventIds", "payment-event", { order_id: "order-secret", role: "payment_intent.succeeded",
      status: "processed", provider: "airwallex", occurred_at: PAID_AT }),
    commerceRow("accessKeyIds", "access-key", { order_id: "order-secret", status: "exhausted", numeric_value: 0 }),
    commerceRow("creditLedgerIds", "credit", { order_id: "order-secret", report_id: "report-secret",
      parent_id: "core-secret", status: "settled", numeric_value: 1, occurred_at: PAID_AT, auxiliary_id: "access-key" }),
    commerceRow("emailDeliveryIds", "payment-email", { order_id: "order-secret", report_id: "report-secret",
      role: "payment_confirmed", status: "delivered", numeric_value: 1, provider: "resend", auxiliary_id: "provider-payment" }),
    commerceRow("emailDeliveryIds", "report-email", { order_id: "order-secret", report_id: "report-secret",
      role: "report_ready", status: "delivered", numeric_value: 1, provider: "resend", auxiliary_id: "provider-report" }),
    commerceRow("accessTokenIds", "token", { report_id: "report-secret", role: "combined_geo_report_v4", status: "active" })
  ];
}

function commerceRow(collection: string, id: string, overrides: Record<string, unknown> = {}) {
  return { collection, id, order_id: null, report_id: null, parent_id: null, role: null, status: null,
    numeric_value: null, provider: null, occurred_at: null, auxiliary_id: null, ...overrides };
}

function commerceAuthority(options: { phase?: "baseline" | "final"; rows?: ReturnType<typeof commerceRows>;
  scope?: Partial<Record<"preAdmissionJobId" | "coreJobId" | "enhancementJobId" | "configSnapshotId" |
    "questionSetId" | "coreArtifactRevisionId" | "enhancementArtifactRevisionId" | "activeArtifactRevisionId", string | null>> } = {}) {
  const rows = options.rows ?? commerceRows();
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const selected = (collection: string) => rows.filter((row) => row.collection === collection);
  const finalEnhancementJob = options.phase === "final" ? deterministicEnhancementJobId() : null;
  const scope = { preAdmissionJobId: "pre-secret", coreJobId: "core-secret", enhancementJobId: finalEnhancementJob,
    configSnapshotId: "config-secret", questionSetId: "questions-secret", coreArtifactRevisionId: "artifact-secret",
    enhancementArtifactRevisionId: options.phase === "final" ? "enhancement-artifact-secret" : null,
    activeArtifactRevisionId: options.phase === "final" ? "enhancement-artifact-secret" : "artifact-secret", ...options.scope };
  return {
    phase: options.phase ?? "baseline", scenarioKind: "success", orders: [{ paidAt: PAID_AT }],
    scope: { reportIdHash: hash("report-secret"), orderIdHash: hash("order-secret"), siteSnapshotIdHash: hash("snapshot-secret"),
      configSnapshotIdHash: hash(scope.configSnapshotId!), questionSetIdHash: hash(scope.questionSetId!),
      preAdmissionJobIdHash: hash(scope.preAdmissionJobId!), coreJobIdHash: hash(scope.coreJobId!),
      enhancementJobIdHash: scope.enhancementJobId ? hash(scope.enhancementJobId) : null,
      coreArtifactRevisionIdHash: hash(scope.coreArtifactRevisionId!),
      enhancementArtifactRevisionIdHash: scope.enhancementArtifactRevisionId ? hash(scope.enhancementArtifactRevisionId) : null,
      activeArtifactRevisionIdHash: hash(scope.activeArtifactRevisionId!) },
    paymentEvents: selected("paymentEventIds").map((row) => ({ idHash: hash(String(row.id)), eventType: row.role,
      processingStatus: row.status, provider: row.provider })),
    creditAuthority: {
      accessKeys: selected("accessKeyIds").map((row) => ({ idHash: hash(String(row.id)), status: row.status,
        creditsRemaining: row.numeric_value })),
      creditLedger: selected("creditLedgerIds").map((row) => ({ idHash: hash(String(row.id)),
        jobIdHash: row.parent_id ? hash(String(row.parent_id)) : null,
        accessKeyIdHash: hash(String(row.auxiliary_id)), status: row.status, credits: row.numeric_value })),
      refunds: selected("refundIds").map((row) => ({ idHash: hash(String(row.id)) }))
    },
    emailAuthority: {
      deliveries: selected("emailDeliveryIds").map((row) => ({ idHash: hash(String(row.id)), templateType: row.role,
        state: row.status, provider: row.provider })),
      events: selected("emailEventIds").map((row) => ({ idHash: hash(String(row.id)), eventType: row.role,
        processingStatus: row.status, provider: row.provider }))
    },
    accessTokens: selected("accessTokenIds").map((row) => ({ idHash: hash(String(row.id)), artifactScope: row.role,
      revokedAt: row.status === "active" ? null : PAID_AT }))
  } as unknown as ReportV4CommerceAuthoritySnapshot;
}

function raw(overrides: Partial<ReportV4ZeroDatabaseEffectsRawSnapshot> = {}): ReportV4ZeroDatabaseEffectsRawSnapshot {
  return {
    capturedAt: "2026-07-16T10:01:00.000Z",
    anchor: anchor(),
    commerceAuthority: commerceAuthority(),
    commerceRows: commerceRows(),
    factRows: REPORT_V4_ZERO_DATABASE_FACT_NAMES.map((fact_name) => ({ fact_name, count: 0 })),
    ...overrides
  };
}

// @requirement GEO-V4-ACCEPT-01
// @requirement GEO-V4-COMMERCE-01
// @requirement GEO-V4-PDF-01
// @requirement GEO-V4-LEGACY-01
describe("Report V4 zero database effects authority", () => {
  it("projects the complete named zero set without exposing raw lineage", () => {
    const authority = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw());
    expect(authority.facts.map(({ name, count }) => [name, count])).toEqual(
      REPORT_V4_ZERO_DATABASE_FACT_NAMES.map((name) => [name, 0]));
    expect(authority.unavailableRuntimeFacts).toEqual([{
      name: "pdf_invocation_count", availability: "runtime_only", reason: "no_attempt_authority_in_postgresql"
    }]);
    expect(authority.semanticZeroProjection).toEqual({
      databaseSupported: {
        replacementFulfillmentCount: 0, correctionFulfillmentCount: 0,
        fullRerunCount: 0, extraSnapshotCountAfterPayment: 0
      },
      runtimeOnly: { pdfInvocationCount: "unavailable" }
    });
    expect(authority.transactionProfile).toEqual({ isolation: "repeatable read", readOnly: true });
    expect(authority.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(authority)).not.toMatch(/report-secret|order-secret|core-secret|artifact-secret|payment-event|access-key/u);
  });

  it.each(REPORT_V4_ZERO_DATABASE_FACT_NAMES)("fails closed when %s is nonzero", (name) => {
    const snapshot = raw({ factRows: REPORT_V4_ZERO_DATABASE_FACT_NAMES.map((fact_name) => ({ fact_name, count: fact_name === name ? 1 : 0 })) });
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), snapshot)).toThrow(new RegExp(name, "u"));
  });

  it("rejects missing, duplicate, extra and malformed facts", () => {
    const rows = raw().factRows;
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ factRows: rows.slice(1) }))).toThrow(/incomplete/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ factRows: [...rows.slice(0, -1), rows[0]!] }))).toThrow(/duplicate/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ factRows: rows.map((row, index) => index ? row : { ...row, extra: true }) }))).toThrow(/non-canonical/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ factRows: rows.map((row, index) => index ? row : { ...row, count: -1 }) }))).toThrow(/count is invalid/u);
  });

  it("rejects trusted commerce hash drift, extra paid events, foreign credit jobs, and raw collection injection", () => {
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ commerceRows: commerceRows().slice(1) }))).toThrow(/paymentEventIds/u);
    const extraPayment = commerceRow("paymentEventIds", "extra-payment", { order_id: "order-secret",
      role: "payment_intent.succeeded", status: "processed", provider: "airwallex", occurred_at: PAID_AT });
    const paymentRows = [...commerceRows(), extraPayment];
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      commerceAuthority: commerceAuthority({ rows: paymentRows }), commerceRows: paymentRows
    }))).toThrow(/unique processed paid-order event/u);
    const foreignCreditRows = commerceRows().map((row) => row.collection === "creditLedgerIds"
      ? { ...row, parent_id: "foreign-job" } : row);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      commerceAuthority: commerceAuthority({ rows: foreignCreditRows }), commerceRows: foreignCreditRows
    }))).toThrow(/unique settled core-job reservation/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ commerceRows: [...commerceRows(), {
      ...commerceRow("unknown", "raw")
    }] }))).toThrow(/unknown collection/u);
  });

  it("accepts one null-delivery or dual-bound email event match and rejects extra/unbound matches", () => {
    const matchedEvent = commerceRow("emailEventIds", "email-event", { order_id: "order-secret",
      report_id: "report-secret", parent_id: "report-email", role: "email.delivered", status: "processed",
      provider: "resend", occurred_at: PAID_AT, auxiliary_id: "provider-report" });
    const matchedRows = [...commerceRows(), matchedEvent];
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      commerceAuthority: commerceAuthority({ rows: matchedRows }), commerceRows: matchedRows
    }))).not.toThrow();

    const extraNullDeliveryMatch = { ...matchedEvent, id: "email-event-extra" };
    const duplicateRows = [...commerceRows(), matchedEvent, extraNullDeliveryMatch];
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      commerceAuthority: commerceAuthority({ rows: duplicateRows }), commerceRows: duplicateRows
    }))).toThrow(/at-most-once/u);
    const unboundRows = [...commerceRows(), { ...matchedEvent, parent_id: "not-allowed" }];
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      commerceAuthority: commerceAuthority({ rows: unboundRows }), commerceRows: unboundRows
    }))).toThrow(/allowed email delivery/u);
  });

  it("rejects phase, paidAt and scenario lineage tampering", () => {
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({ paid_at: "2026-07-16T10:00:01.000Z" }) }))).toThrow(/paidAt/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({ order_report_id: "other-report" }) }))).toThrow(/order report/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input({ phase: "final" }), raw())).toThrow(/enhancement topology/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: { ...anchor(), unexpected: true } }))).toThrow(/non-canonical/u);
  });

  it("binds actual production job rows and rejects duplicate, foreign, or wrong-role jobs", () => {
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      pre_admission_job_id: "core-secret", pre_job_id: "core-secret"
    }) }))).toThrow(/must be distinct/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      pre_report_id: "foreign-report"
    }) }))).toThrow(/pre job report/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      core_reason: "v4_pre_admission"
    }) }))).toThrow(/core job.*production V4 role/u);
  });

  it("canonicalizes job roles rather than only the unordered job identity set", () => {
    const baseline = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw());
    const swappedCommerce = commerceRows().map((row) => row.collection === "creditLedgerIds"
      ? { ...row, parent_id: "pre-secret" } : row);
    const swapped = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      anchor: anchor({
        pre_admission_job_id: "core-secret", core_job_id: "pre-secret", order_core_job_id: "pre-secret",
        pre_job_id: "core-secret", core_job_row_id: "pre-secret",
        core_artifact_job_id: "pre-secret", core_payload_job_id: "pre-secret"
      }),
      commerceAuthority: commerceAuthority({ rows: swappedCommerce,
        scope: { preAdmissionJobId: "core-secret", coreJobId: "pre-secret" } }),
      commerceRows: swappedCommerce
    }));
    expect(swapped.lineage.jobIdSetHash).toBe(baseline.lineage.jobIdSetHash);
    expect(swapped.canonicalHash).not.toBe(baseline.canonicalHash);
  });

  it("canonicalizes delivery roles rather than only the unordered delivery identity set", () => {
    const baseline = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw());
    const swappedRows = commerceRows().map((row) => row.id === "payment-email" ? { ...row, role: "report_ready" }
      : row.id === "report-email" ? { ...row, role: "payment_confirmed" } : row);
    const swapped = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({
      commerceAuthority: commerceAuthority({ rows: swappedRows }), commerceRows: swappedRows
    }));
    expect(swapped.allowedCommerceTopology.emailDeliveryIds.idSetHash)
      .toBe(baseline.allowedCommerceTopology.emailDeliveryIds.idSetHash);
    expect(swapped.canonicalHash).not.toBe(baseline.canonicalHash);
  });

  it("canonicalizes config and question identities and rejects active-role drift", () => {
    const baseline = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw());
    const config = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      config_snapshot_id: "config-other", core_artifact_config_snapshot_id: "config-other"
    }), commerceAuthority: commerceAuthority({ scope: { configSnapshotId: "config-other" } }) }));
    const question = projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      question_set_id: "questions-other", order_question_set_id: "questions-other",
      core_question_set_id: "questions-other", core_payload_question_set_id: "questions-other"
    }), commerceAuthority: commerceAuthority({ scope: { questionSetId: "questions-other" } }) }));
    expect(config.canonicalHash).not.toBe(baseline.canonicalHash);
    expect(question.canonicalHash).not.toBe(baseline.canonicalHash);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      active_artifact_revision_id: "other-active"
    }) }))).toThrow(/active core artifact/u);
  });

  it("binds actual core artifact/payload and report active lineage", () => {
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      core_artifact_report_id: "foreign-report"
    }) }))).toThrow(/core artifact report/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      core_payload_question_set_id: "foreign-questions"
    }) }))).toThrow(/core payload question set/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      active_artifact_revision_id: "foreign-artifact"
    }) }))).toThrow(/active core artifact/u);
  });

  it("accepts exact final enhancement and rejects job/source/active/null topology drift", () => {
    const finalInput = input({ phase: "final" });
    const finalRaw = (anchorRow: ReturnType<typeof enhancedAnchor>) => raw({ anchor: anchorRow,
      commerceAuthority: commerceAuthority({ phase: "final" }) });
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(finalInput, finalRaw(enhancedAnchor()))).not.toThrow();
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(finalInput, raw({ anchor: enhancedAnchor({
      enhancement_artifact_job_id: "foreign-job"
    }), commerceAuthority: commerceAuthority({ phase: "final" }) }))).toThrow(/enhancement artifact job/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(finalInput, raw({ anchor: enhancedAnchor({
      enhancement_artifact_source_revision_id: "foreign-artifact"
    }), commerceAuthority: commerceAuthority({ phase: "final" }) }))).toThrow(/enhancement artifact source/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(finalInput, raw({ anchor: enhancedAnchor({
      active_artifact_revision_id: "artifact-secret"
    }), commerceAuthority: commerceAuthority({ phase: "final" }) }))).toThrow(/active enhancement artifact/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(input(), raw({ anchor: anchor({
      enhancement_report_id: "foreign-report"
    }) }))).toThrow(/enhancement job null topology/u);
    expect(() => projectReportV4ZeroDatabaseEffectsAuthority(finalInput, raw())).toThrow(/enhancement topology/u);
  });

  it("uses the caller-owned RR/RO transaction without nesting a begin", async () => {
    const queries: string[] = [];
    const unsafe = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes("transaction_isolation")) return [{ transaction_isolation: "repeatable read", transaction_read_only: "on", captured_at: "2026-07-16T10:01:00.000Z" }];
      if (query.includes("report_v4_acceptance_scenarios")) return [anchor()];
      if (query.includes("'paymentEventIds' collection")) return commerceRows();
      if (query.includes("WITH allowed_jobs")) return raw().factRows;
      throw new Error("unexpected query");
    });
    const tx = { unsafe };
    await expect(loadReportV4ZeroDatabaseEffectsAuthorityInTransaction(tx, input(), commerceAuthority()))
      .resolves.toMatchObject({ phase: "baseline" });
    const commerceSql = queries.find((query) => query.includes("email_event_candidates"))!;
    expect(commerceSql).toMatch(/CASE WHEN e\.delivery_id IS NULL/u);
    expect(commerceSql).toMatch(/match\.match_count=1/u);
    const factsSql = queries.find((query) => query.includes("WITH allowed_jobs"))!;
    expect(factsSql).toMatch(/created_at\s+>=\s+\$3::timestamptz/u);
    expect(factsSql).toMatch(/NOT \(s\.id=ANY\(\$13::text\[\]\)\)/u);
  });

  it("fails closed outside RR/RO and wraps query failures", async () => {
    await expect(loadReportV4ZeroDatabaseEffectsAuthorityInTransaction({ unsafe: async () => [{
      transaction_isolation: "read committed", transaction_read_only: "on", captured_at: PAID_AT
    }] }, input(), commerceAuthority())).rejects.toThrow(/repeatable-read/u);
    await expect(loadReportV4ZeroDatabaseEffectsAuthorityInTransaction({ unsafe: async () => { throw new Error("db raw"); } }, input(), commerceAuthority()))
      .rejects.toThrow(/query failed closed/u);
  });
});

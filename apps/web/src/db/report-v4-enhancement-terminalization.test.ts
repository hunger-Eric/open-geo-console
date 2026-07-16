import { describe, expect, it } from "vitest";
import {
  terminalizeReportV4EnhancementJob,
  type ReportV4EnhancementTerminalizationExecutor,
  type ReportV4EnhancementTerminalizationInput
} from "./report-v4-enhancement-terminalization";

describe("report v4 enhancement terminalization", () => {
  it("rejects incomplete identities before opening a transaction", async () => {
    let called = false;
    await expect(terminalizeReportV4EnhancementJob({
      ...input("failed"), reportId: ""
    }, { transaction: async () => { called = true; } })).rejects.toThrow(/Missing reportId/);
    expect(called).toBe(false);
  });

  it("terminalizes a completed active successor and persists the exact question partition", async () => {
    const fake = executor({ outcome: "completed" });
    await terminalizeReportV4EnhancementJob(input("completed"), fake);
    expect(fake.state).toMatchObject({ stage: "completed", executionState: "completed", updates: 1 });
    expect(fake.state.updateSql).toContain("'{reportV4Diagnosis}'");
    expect(fake.state.updateValues).toContain(JSON.stringify(["q1", "q2"]));
    expect(fake.state.updateValues).toContain(JSON.stringify(["q3"]));
  });

  it("allows a failed enhancement with no prepared revision and leaves artifact activation untouched", async () => {
    const fake = executor({ outcome: "failed", revisionStatus: null });
    await terminalizeReportV4EnhancementJob(input("failed"), fake);
    expect(fake.state).toMatchObject({ stage: "failed", executionState: "failed", updates: 1 });
  });

  it("is idempotent after a completed commit without requiring a surviving lease", async () => {
    const fake = executor({ outcome: "completed", terminal: true });
    await terminalizeReportV4EnhancementJob(input("completed"), fake);
    expect(fake.state.updates).toBe(0);
  });

  it("rejects a pending revision for a failed outcome without updating the job", async () => {
    const fake = executor({ outcome: "failed", revisionStatus: "pending" });
    await expect(terminalizeReportV4EnhancementJob(input("failed"), fake)).rejects.toThrow(/pending, ready or active/i);
    expect(fake.state.updates).toBe(0);
  });

  it("rejects an incomplete database-backed question partition", async () => {
    const fake = executor({ outcome: "failed", revisionStatus: null });
    await expect(terminalizeReportV4EnhancementJob({
      ...input("failed"), completedQuestionIds: [], failedQuestionIds: ["q1", "q2"]
    }, fake)).rejects.toThrow(/answered source-core question/i);
    expect(fake.state.updates).toBe(0);
  });

  it("terminalizes only the two answered questions when the source core has one unavailable question", async () => {
    const fake = executor({ outcome: "completed", unavailableQuestion: 3 });
    await terminalizeReportV4EnhancementJob({
      ...input("completed"), completedQuestionIds: ["q1"], failedQuestionIds: ["q2"]
    }, fake);
    expect(fake.state).toMatchObject({ stage: "completed", executionState: "completed", updates: 1 });
  });

  it("rejects omission of an answered source-core question", async () => {
    const fake = executor({ outcome: "completed", unavailableQuestion: 3 });
    await expect(terminalizeReportV4EnhancementJob({
      ...input("completed"), completedQuestionIds: ["q1"], failedQuestionIds: []
    }, fake)).rejects.toThrow(/answered source-core question/i);
    expect(fake.state.updates).toBe(0);
  });

  it("rejects an unavailable source-core question in the enhancement outcome partition", async () => {
    const fake = executor({ outcome: "completed", unavailableQuestion: 3 });
    await expect(terminalizeReportV4EnhancementJob({
      ...input("completed"), completedQuestionIds: ["q1"], failedQuestionIds: ["q2", "q3"]
    }, fake)).rejects.toThrow(/answered source-core question/i);
    expect(fake.state.updates).toBe(0);
  });
});

function input(outcome: "completed" | "failed"): ReportV4EnhancementTerminalizationInput {
  return {
    reportId: "report-v4", coreJobId: "core-v4", enhancementJobId: "enhancement-v4",
    sourceCoreArtifactRevisionId: "core-artifact-v4", enhancementArtifactRevisionId: "enhancement-artifact-v4",
    outcome, completedQuestionIds: outcome === "completed" ? ["q1", "q2"] : ["q1"],
    failedQuestionIds: outcome === "completed" ? ["q3"] : ["q2", "q3"], workerId: "worker-v4"
  };
}

function executor(options: {
  outcome: "completed" | "failed";
  revisionStatus?: "pending" | "ready" | "active" | "failed" | null;
  terminal?: boolean;
  unavailableQuestion?: 1 | 2 | 3;
}): ReportV4EnhancementTerminalizationExecutor & {
  state: { stage: string; executionState: string; updates: number; updateSql: string; updateValues: readonly unknown[] };
} {
  const revisionStatus = options.revisionStatus === undefined
    ? options.outcome === "completed" ? "active" : "failed"
    : options.revisionStatus;
  const state = {
    stage: options.terminal ? options.outcome : "analyzing",
    executionState: options.terminal ? options.outcome : "running",
    updates: 0,
    updateSql: "",
    updateValues: [] as readonly unknown[]
  };
  const sourceStatus = options.outcome === "completed" ? "ready" : "active";
  const activeEnhancement = options.outcome === "completed";
  const sql = async (strings: TemplateStringsArray, ...values: readonly unknown[]) => {
    const query = strings.join("?").replaceAll(/\s+/gu, " ").trim();
    if (query.includes("FROM scan_jobs WHERE id=")) return [{
      id: "enhancement-v4", report_id: "report-v4", site_snapshot_id: null, tier: "deep",
      product_contract: "recommendation_forensics_v1", fulfillment_methodology: "two_stage_geo_report_v4",
      recommendation_report_version: 4, artifact_contract: "combined_geo_report_v4",
      business_question_set_id: "questions-v4", locale: "en", reason: "v4_diagnosis_enhancement",
      stage: state.stage, execution_state: state.executionState,
      lease_owner: options.terminal ? null : "worker-v4",
      lease_expires_at: options.terminal ? null : "2099-01-01T00:00:00.000Z",
      lease_is_live: !options.terminal,
      credit_reservation_id: null, correction_id: null, replacement_fulfillment_id: null
    }];
    if (query.includes("FROM scan_jobs core")) return [{
      id: "core-v4", report_id: "report-v4", site_snapshot_id: "snapshot-v4",
      product_contract: "recommendation_forensics_v1", fulfillment_methodology: "two_stage_geo_report_v4",
      recommendation_report_version: 4, artifact_contract: "combined_geo_report_v4",
      business_question_set_id: "questions-v4", locale: "en", reason: "standard", stage: "completed",
      execution_state: "completed", credit_reservation_id: "credit-v4",
      order_id: "order-v4", order_report_id: "report-v4", order_fulfillment_job_id: "core-v4",
      order_site_snapshot_id: "snapshot-v4", order_question_set_id: "questions-v4",
      order_product_code: "recommendation_forensics_v1", order_methodology: "two_stage_geo_report_v4",
      order_version: 4, order_locale: "en", payment_status: "paid", fulfillment_status: "completed",
      refund_status: "not_required", credit_id: "credit-v4", credit_report_id: "report-v4",
      credit_job_id: "core-v4", credit_order_id: "order-v4", credit_status: "settled",
      source_id: "core-artifact-v4", source_report_id: "report-v4", source_order_id: "order-v4",
      source_job_id: "core-v4", source_config_snapshot_id: "config-v4", source_revision_kind: "generation",
      source_artifact_contract: "combined_geo_report_v4", source_status: sourceStatus,
      config_report_id: "report-v4", config_order_id: "order-v4", config_core_job_id: "core-v4",
      active_artifact_revision_id: activeEnhancement ? "enhancement-artifact-v4" : "core-artifact-v4",
      active_id: activeEnhancement ? "enhancement-artifact-v4" : "core-artifact-v4",
      active_report_id: "report-v4", active_order_id: "order-v4",
      active_job_id: activeEnhancement ? "enhancement-v4" : "core-v4", active_config_snapshot_id: "config-v4",
      active_revision_kind: activeEnhancement ? "diagnosis_enhancement" : "generation",
      active_source_artifact_revision_id: activeEnhancement ? "core-artifact-v4" : null,
      active_artifact_contract: "combined_geo_report_v4", active_status: "active", access_count: 1,
      source_payload: sourceCorePayload(options.unavailableQuestion)
    }];
    if (query.includes("FROM report_business_questions")) return [
      { id: "q1", ordinal: 1 }, { id: "q2", ordinal: 2 }, { id: "q3", ordinal: 3 }
    ];
    if (query.includes("FROM report_artifact_revisions WHERE job_id=")) {
      if (revisionStatus === null) return [];
      return [{
        id: "enhancement-artifact-v4", job_id: "enhancement-v4", report_id: "report-v4", order_id: "order-v4",
        config_snapshot_id: "config-v4", revision_kind: "diagnosis_enhancement",
        artifact_contract: "combined_geo_report_v4", source_artifact_revision_id: "core-artifact-v4",
        status: revisionStatus
      }];
    }
    if (query.startsWith("UPDATE scan_jobs SET")) {
      state.updates += 1;
      state.stage = options.outcome;
      state.executionState = options.outcome;
      state.updateSql = query;
      state.updateValues = values;
      return [{ id: "enhancement-v4" }];
    }
    throw new Error(`Unexpected SQL in V4 enhancement unit fixture: ${query}`);
  };
  return {
    state,
    transaction: async <T>(work: (transaction: typeof sql) => Promise<T>) => work(sql)
  } as ReportV4EnhancementTerminalizationExecutor & { state: typeof state };
}

function sourceCorePayload(unavailableQuestion?: 1 | 2 | 3) {
  return {
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "report-v4",
    artifactRevisionId: "core-artifact-v4",
    targetUrl: "https://target.example/",
    locale: "en",
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: unavailableQuestion ? "completed_limited" : "completed",
    websiteSynthesis: {
      summary: "Website synthesis.", strengths: ["Strength."], gaps: ["Gap."], actions: ["Action."]
    },
    questions: [1, 2, 3].map((order) => ({
      order,
      questionId: `q${order}`,
      questionText: `Question ${order}`,
      status: order === unavailableQuestion ? "unavailable" : "answered",
      answer: order === unavailableQuestion ? null : `Answer ${order}`,
      sources: []
    }))
  };
}

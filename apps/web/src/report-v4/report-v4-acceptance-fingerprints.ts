import { createHash } from "node:crypto";
import type { ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";

export const REPORT_V4_ACCEPTANCE_FAULT_PROVENANCE_FINGERPRINT_CONTRACT =
  "report-v4-acceptance-fault-provenance-lineage/v1" as const;

/**
 * Binds a fault-consumption event to one immutable acceptance scenario and its
 * exact persisted lineage. This is deliberately a fault-provenance baseline,
 * not a before/after business-state invariant and not vendor evidence.
 *
 * faultSourceId is intentionally excluded: the success drill discovers and
 * binds its first source at consumption time. That source remains proven by
 * the fault event target plus the sealed scenario. Mutable business state must
 * be established independently by final acceptance evidence.
 */
export function computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(
  scenario: ReportV4AcceptanceScenario
): string {
  const contract = exactFaultContract(scenario);
  const canonical = [
    ["contract", REPORT_V4_ACCEPTANCE_FAULT_PROVENANCE_FINGERPRINT_CONTRACT],
    ["sessionId", required(scenario.sessionId, "sessionId")],
    ["scenarioId", required(scenario.scenarioId, "scenarioId")],
    ["kind", scenario.kind],
    ["faultKind", contract.faultKind],
    ["faultQuestionId", required(scenario.faultQuestionId, "faultQuestionId")],
    ["expectedOccurrences", contract.expectedOccurrences],
    ["reportId", required(scenario.reportId, "reportId")],
    ["orderId", required(scenario.orderId, "orderId")],
    ["preAdmissionJobId", required(scenario.preAdmissionJobId, "preAdmissionJobId")],
    ["coreJobId", required(scenario.coreJobId, "coreJobId")],
    ["enhancementJobId", contract.enhancementJobId],
    ["siteSnapshotId", required(scenario.siteSnapshotId, "siteSnapshotId")],
    ["configSnapshotId", required(scenario.configSnapshotId, "configSnapshotId")],
    ["questionSetId", required(scenario.questionSetId, "questionSetId")],
    ["coreArtifactRevisionId", required(scenario.coreArtifactRevisionId, "coreArtifactRevisionId")],
    ["enhancementArtifactRevisionId", contract.enhancementArtifactRevisionId]
  ] as const;
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function exactFaultContract(scenario: ReportV4AcceptanceScenario): {
  readonly faultKind: ReportV4AcceptanceScenario["faultKind"];
  readonly expectedOccurrences: 1 | 2;
  readonly enhancementJobId: string | null;
  readonly enhancementArtifactRevisionId: string | null;
} {
  if (scenario.kind === "success") {
    if (scenario.faultKind !== "independent_source_read_failure" || scenario.expectedFaultOccurrences !== 1) {
      throw new TypeError("The success fault contract must be independent_source_read_failure exactly once.");
    }
    return {
      faultKind: scenario.faultKind,
      expectedOccurrences: 1,
      enhancementJobId: required(scenario.enhancementJobId, "enhancementJobId"),
      enhancementArtifactRevisionId: required(scenario.enhancementArtifactRevisionId, "enhancementArtifactRevisionId")
    };
  }
  if (scenario.kind === "diagnosis_failure") {
    if (scenario.faultKind !== "diagnosis_failure" || scenario.expectedFaultOccurrences !== 2) {
      throw new TypeError("The diagnosis fault contract must be diagnosis_failure exactly twice.");
    }
    return {
      faultKind: scenario.faultKind,
      expectedOccurrences: 2,
      enhancementJobId: required(scenario.enhancementJobId, "enhancementJobId"),
      enhancementArtifactRevisionId: required(scenario.enhancementArtifactRevisionId, "enhancementArtifactRevisionId")
    };
  }
  if (scenario.kind === "question_failure") {
    if (scenario.faultKind !== "question_failure" || scenario.expectedFaultOccurrences !== 2) {
      throw new TypeError("The question fault contract must be question_failure exactly twice.");
    }
    return {
      faultKind: scenario.faultKind,
      expectedOccurrences: 2,
      enhancementJobId: optional(scenario.enhancementJobId, "enhancementJobId"),
      enhancementArtifactRevisionId: optional(scenario.enhancementArtifactRevisionId, "enhancementArtifactRevisionId")
    };
  }
  throw new TypeError("The acceptance scenario kind is not recognized by the fault-provenance contract.");
}

function required(value: string | null, field: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) {
    throw new TypeError(`${field} is required by the exact fault-provenance lineage.`);
  }
  return value;
}

function optional(value: string | null, field: string): string | null {
  return value === null ? null : required(value, field);
}

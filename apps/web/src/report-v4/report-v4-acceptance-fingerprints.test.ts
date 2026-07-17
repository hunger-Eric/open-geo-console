import { describe, expect, it } from "vitest";
import type { ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "./report-v4-acceptance-fingerprints";

describe("Report V4 acceptance fault-provenance baseline fingerprint", () => {
  it.each(["success", "diagnosis_failure", "question_failure"] as const)("is deterministic for a complete %s lineage", (kind) => {
    const scenario = boundScenario(kind);
    const first = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
    expect(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint({ ...scenario })).toBe(first);
  });

  it.each([
    "sessionId", "scenarioId", "faultQuestionId", "reportId", "orderId", "preAdmissionJobId", "coreJobId",
    "enhancementJobId", "siteSnapshotId", "configSnapshotId", "questionSetId", "coreArtifactRevisionId",
    "enhancementArtifactRevisionId"
  ] as const)("changes when canonical lineage field %s changes", (field) => {
    const scenario = boundScenario("success");
    const changed = { ...scenario, [field]: `${scenario[field]}-changed` };
    expect(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(changed))
      .not.toBe(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario));
  });

  it("binds kind, faultKind, and expected occurrences", () => {
    const success = boundScenario("success");
    const diagnosis = boundScenario("diagnosis_failure");
    expect(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(success))
      .not.toBe(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(diagnosis));
    expect(() => computeReportV4AcceptanceFaultProvenanceBaselineFingerprint({
      ...success,
      expectedFaultOccurrences: 2
    })).toThrow(/fault contract/iu);
  });

  it("deliberately excludes success faultSourceId to avoid first-source binding cycles", () => {
    const scenario = boundScenario("success");
    expect(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint({ ...scenario, faultSourceId: "source-a" }))
      .toBe(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint({ ...scenario, faultSourceId: "source-b" }));
  });

  it.each([
    ["common report", "question_failure", "reportId"],
    ["success enhancement job", "success", "enhancementJobId"],
    ["diagnosis enhancement job", "diagnosis_failure", "enhancementJobId"],
    ["success enhancement artifact", "success", "enhancementArtifactRevisionId"],
    ["diagnosis enhancement artifact", "diagnosis_failure", "enhancementArtifactRevisionId"]
  ] as const)("fails closed for missing %s", (_label, kind, field) => {
    const scenario = { ...boundScenario(kind), [field]: null };
    expect(() => computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(scenario)).toThrow(new RegExp(field, "u"));
  });

  it("keeps optional failure-only enhancement lineage slots canonical as explicit nulls", () => {
    const question = boundScenario("question_failure");
    expect(question.enhancementJobId).toBeNull();
    expect(question.enhancementArtifactRevisionId).toBeNull();
    expect(computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(question)).toMatch(/^[a-f0-9]{64}$/u);
  });
});

function boundScenario(kind: ReportV4AcceptanceScenario["kind"]): ReportV4AcceptanceScenario {
  const success = kind === "success";
  const diagnosis = kind === "diagnosis_failure";
  return {
    sessionId: "11111111-1111-4111-8111-111111111111",
    scenarioId: success
      ? "21111111-1111-4111-8111-111111111111"
      : diagnosis
        ? "31111111-1111-4111-8111-111111111111"
        : "41111111-1111-4111-8111-111111111111",
    reportId: `report-${kind}`,
    orderId: `order-${kind}`,
    preAdmissionJobId: `pre-${kind}`,
    coreJobId: `core-${kind}`,
    enhancementJobId: success || diagnosis ? `enhance-${kind}` : null,
    siteSnapshotId: `site-${kind}`,
    configSnapshotId: `config-${kind}`,
    questionSetId: `questions-${kind}`,
    coreArtifactRevisionId: `core-artifact-${kind}`,
    enhancementArtifactRevisionId: success || diagnosis ? `enhancement-artifact-${kind}` : null,
    kind,
    faultKind: success ? "independent_source_read_failure" : kind,
    faultQuestionId: `question-${kind}`,
    faultSourceId: success ? "source-success" : null,
    expectedFaultOccurrences: success ? 1 : 2,
    baselineFingerprint: null,
    finalFingerprint: null,
    state: "collecting",
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    terminalAt: null
  };
}

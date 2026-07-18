import { describe, expect, it } from "vitest";
import { completePayload, reseal } from "../db/report-v4-acceptance-authority-phase-snapshot.test-fixture";
import { assertReportV4AcceptanceCompleteAuthorityPhasePayload } from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4AcceptanceEvent, ReportV4AcceptanceScenario } from "../db/report-v4-acceptance-ledger";
import { projectReportV4AcceptanceSemanticAuthority,
  type ProjectReportV4AcceptanceSemanticAuthorityInput } from "./acceptance-semantic-authority-projector";
import { makeSemanticCheckpointFixture, makeSemanticDiagnosisFailureBaselineFixture, makeSemanticQuestionFailureBaselineFixture, makeSemanticSuccessBaselineFixture, makeSemanticSuccessConfig } from "./acceptance-semantic-authority-projector.test-fixture";
import { verifyReportV4AcceptanceScenarioSemantics } from "./acceptance-semantic-verifier";

describe("Report V4 semantic authority aggregator", () => {
  it.each(["success", "diagnosis_failure", "question_failure"] as const)("imports a sealed %s fixture", (kind) => {
    const fixture = makeSemanticCheckpointFixture(kind);
    expect(fixture.input.finalPhase).toMatchObject({ phase: "final", scenarioKind: kind });
  });
  it("fails closed unless the two independently valid payloads are baseline then final", () => {
    const baseline = completePayload();
    const input = { scenario: scenario(), events: [], baselinePhase: baseline, finalPhase: baseline,
      config: {} } as unknown as ProjectReportV4AcceptanceSemanticAuthorityInput;
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/baseline\/final phases/i);
  });

  it("validates complete payload seals before projecting any caller-visible authority", () => {
    const baseline = structuredClone(completePayload()); baseline.session.scenarioIdHash = "f".repeat(64);
    const input = { scenario: scenario(), events: [], baselinePhase: baseline, finalPhase: completePayload(),
      config: {} } as unknown as ProjectReportV4AcceptanceSemanticAuthorityInput;
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow();
  });

  it("builds a sealed success baseline authority payload", () => {
    const { baselinePhase } = makeSemanticSuccessBaselineFixture();
    expect(() => assertReportV4AcceptanceCompleteAuthorityPhasePayload(baselinePhase)).not.toThrow();
  });

  it("projects and verifies the complete success scenario end to end", () => {
    const { input, baselinePhase } = makeSemanticSuccessBaselineFixture();
    const authority = projectReportV4AcceptanceSemanticAuthority({
      scenario: input.scenario,
      events: input.events,
      baselinePhase,
      finalPhase: input.finalPhase,
      config: makeSemanticSuccessConfig(),
    });
    expect(verifyReportV4AcceptanceScenarioSemantics({ scenario: input.scenario, events: input.events, authority })).toMatchObject({ valid: true });
  });

  it("projects and verifies the complete diagnosis_failure scenario end to end", () => {
    const { input, baselinePhase } = makeSemanticDiagnosisFailureBaselineFixture();
    const authority = projectReportV4AcceptanceSemanticAuthority({
      scenario: input.scenario,
      events: input.events,
      baselinePhase,
      finalPhase: input.finalPhase,
      config: makeSemanticSuccessConfig(),
    });
    expect(authority.diagnoses.find((diagnosis) => diagnosis.questionId === input.scenario.faultQuestionId)).toMatchObject({
      state: "failed", logicalProviderCallCount: 2, physicalProviderCallCount: 0,
    });
    expect(verifyReportV4AcceptanceScenarioSemantics({ scenario: input.scenario, events: input.events, authority }))
      .toMatchObject({ valid: true });
  });

  it("projects and verifies the complete question_failure scenario end to end", () => {
    const { input, baselinePhase } = makeSemanticQuestionFailureBaselineFixture();
    const authority = projectReportV4AcceptanceSemanticAuthority({ scenario: input.scenario, events: input.events,
      baselinePhase, finalPhase: input.finalPhase, config: makeSemanticSuccessConfig() });
    expect(authority.questions.find((question) => question.questionId === input.scenario.faultQuestionId)).toMatchObject({
      state: "unavailable", logicalProviderCallCount: 2, physicalProviderCallCount: 0,
    });
    expect(authority.dispatch.enhancementJobId).toBeNull();
    expect(authority.enhancementArtifact).toBeNull();
    expect(authority.diagnoses).toHaveLength(0);
    expect(input.finalPhase.authorities.artifact_combined_payload_integrity.artifacts.find((artifact) =>
      artifact.revisionKind === "generation")?.status).toBe("active");
    expect(input.finalPhase.commerce.diagnosisCheckpoints).toHaveLength(0);
    expect(input.finalPhase.commerce.scope.enhancementJobIdHash).toBeNull();
    expect(input.finalPhase.commerce.scope.enhancementArtifactRevisionIdHash).toBeNull();
    expect(input.finalPhase.commerce.artifacts).toHaveLength(1);
    expect(input.finalPhase.commerce.artifacts[0]?.status).toBe("active");
    expect(input.events.filter((event) => event.kind === "v4_dispatch" && event.unitId === "job-enhancement")).toHaveLength(0);
    expect(input.events.filter((event) => event.operation === "source_diagnosis")).toHaveLength(0);
    expect(input.events.filter((event) => event.kind === "site_read" && event.unitId.startsWith("job-enhancement:"))).toHaveLength(0);
    expect(input.events.filter((event) => event.kind === "html_assembly" && event.operation === "enhancement_html")).toHaveLength(0);
    expect(input.events.filter((event) => event.kind === "artifact_activation" && event.unitId === "artifact-enhancement")).toHaveLength(0);
    expect(verifyReportV4AcceptanceScenarioSemantics({ scenario: input.scenario, events: input.events, authority }))
      .toMatchObject({ valid: true });
  });

  it("rejects question_failure topology tamper when one fault occurrence is missing or retargeted", () => {
    for (const mutate of [
      (events: ReportV4AcceptanceEvent[]) => {
        const index = events.findIndex((event) => event.kind === "fault_injection" && event.attempt === 2);
        events.splice(index, 1);
      },
      (events: ReportV4AcceptanceEvent[]) => {
        const event = events.find((candidate) => candidate.kind === "fault_injection");
        if (event) (event as MutableEvent).unitId = "job-core:question-1";
      },
    ]) {
      const fixture = makeSemanticQuestionFailureBaselineFixture();
      const events = structuredClone(fixture.input.events) as ReportV4AcceptanceEvent[];
      mutate(events);
      expect(() => projectReportV4AcceptanceSemanticAuthority({ scenario: fixture.input.scenario, events,
        baselinePhase: fixture.baselinePhase, finalPhase: fixture.input.finalPhase, config: makeSemanticSuccessConfig() }))
        .toThrow(/checkpoint|fault|capture boundary|prefix/iu);
    }
  });

  it("rejects question_failure absence tamper that introduces enhancement work", () => {
    const { input, baselinePhase } = makeSemanticQuestionFailureBaselineFixture();
    const authority = projectReportV4AcceptanceSemanticAuthority({ scenario: input.scenario, events: input.events,
      baselinePhase, finalPhase: input.finalPhase, config: makeSemanticSuccessConfig() });
    const tampered = structuredClone(authority) as unknown as MutableAuthority & {
      dispatch: { enhancementJobId: string | null };
    };
    tampered.dispatch.enhancementJobId = "job-enhancement";
    expect(() => verifyReportV4AcceptanceScenarioSemantics({ scenario: input.scenario, events: input.events,
      authority: tampered as never })).toThrow(/question_failure|enhancement|diagnos/iu);
  });

  it.each([
    ["fault diagnosis state", (authority: MutableAuthority) => { authority.diagnoses[1]!.state = "completed"; }],
    ["fault diagnosis logical calls", (authority: MutableAuthority) => { authority.diagnoses[1]!.logicalProviderCallCount = 1; }],
    ["fault diagnosis physical calls", (authority: MutableAuthority) => { authority.diagnoses[1]!.physicalProviderCallCount = 1; }],
  ] as const)("rejects diagnosis_failure core tamper: %s", (_label, mutate) => {
    const { input, baselinePhase } = makeSemanticDiagnosisFailureBaselineFixture();
    const authority = projectReportV4AcceptanceSemanticAuthority({ scenario: input.scenario, events: input.events,
      baselinePhase, finalPhase: input.finalPhase, config: makeSemanticSuccessConfig() });
    const tampered = structuredClone(authority) as unknown as MutableAuthority;
    mutate(tampered);
    expect(() => verifyReportV4AcceptanceScenarioSemantics({ scenario: input.scenario, events: input.events,
      authority: tampered as never })).toThrow(/diagnosis_failure|diagnosis question-2|source_diagnosis/iu);
  });

  it.each([
    ["missing second fault consumption", (events: ReportV4AcceptanceEvent[]) => {
      const index = events.findIndex((event) => event.kind === "fault_injection" && event.attempt === 2);
      events.splice(index, 1);
    }],
    ["fault consumption unit drift", (events: ReportV4AcceptanceEvent[]) => {
      const event = events.find((candidate) => candidate.kind === "fault_injection");
      if (event) (event as MutableEvent).unitId = "job-enhancement:question-1";
    }],
  ] as const)("rejects diagnosis_failure fault topology tamper: %s", (_label, mutate) => {
    const fixture = makeSemanticDiagnosisFailureBaselineFixture();
    const events = structuredClone(fixture.input.events) as ReportV4AcceptanceEvent[];
    mutate(events);
    expect(() => projectReportV4AcceptanceSemanticAuthority({ scenario: fixture.input.scenario, events,
      baselinePhase: fixture.baselinePhase, finalPhase: fixture.input.finalPhase, config: makeSemanticSuccessConfig() }))
      .toThrow(/checkpoint|fault|capture boundary|prefix/iu);
  });

  it("rejects an independently resealed baseline ledger that diverges from the final/raw prefix", () => {
    const { input, baselinePhase } = makeSemanticSuccessBaselineFixture();
    const divergent = structuredClone(baselinePhase);
    (divergent.authorities.ledger_authority.events[0] as unknown as { unitIdHash: string }).unitIdHash = "f".repeat(64);
    reseal(divergent, "ledger_authority");
    expect(() => projectReportV4AcceptanceSemanticAuthority({ scenario: input.scenario, events: input.events,
      baselinePhase: divergent, finalPhase: input.finalPhase, config: makeSemanticSuccessConfig() }))
      .toThrow(/exact unchanged prefix/iu);
  });

  it("rejects a missing post-baseline commerce boundary event", () => {
    const fixture = successFixture();
    fixture.events = fixture.events.filter((event) => event.unitId !== "commerce-baseline");
    expect(() => projectReportV4AcceptanceSemanticAuthority(fixture)).toThrow(/capture boundary|commerce fingerprint/iu);
  });

  it("rejects a commerce-baseline event that is not immediately after the baseline ledger", () => {
    const fixture = successFixture();
    const index = fixture.events.findIndex((event) => event.unitId === "commerce-baseline");
    [fixture.events[index], fixture.events[index + 1]] = [fixture.events[index + 1]!, fixture.events[index]!];
    expect(() => projectReportV4AcceptanceSemanticAuthority(fixture)).toThrow(/baseline.*immediately followed/iu);
  });

  it("rejects a post-final commerce event with the wrong persisted fingerprint", () => {
    const fixture = successFixture();
    const event = fixture.events.at(-1)!;
    (event as unknown as { details: { fingerprint: string } }).details = { fingerprint: "f".repeat(64) };
    expect(() => projectReportV4AcceptanceSemanticAuthority(fixture)).toThrow(/final.*commerce fingerprint/iu);
  });

  it("rejects any raw event tail after the canonical commerce-final event", () => {
    const fixture = successFixture();
    fixture.events.push(structuredClone(fixture.events.at(-1)!));
    expect(() => projectReportV4AcceptanceSemanticAuthority(fixture)).toThrow(/capture boundary counts/iu);
  });

  it.each([
    ["sequence", (event: MutableEvent) => { event.sequence += 1; }],
    ["previous hash", (event: MutableEvent) => { event.prevHash = "f".repeat(64); }],
    ["session scope", (event: MutableEvent) => { event.sessionId = "33333333-3333-4333-8333-333333333333"; }],
    ["scenario scope", (event: MutableEvent) => { event.scenarioId = "33333333-3333-4333-8333-333333333333"; }],
    ["idempotency key", (event: MutableEvent) => { event.idempotencyKey = "f".repeat(64); }],
    ["details canonical", (event: MutableEvent) => { event.detailsCanonical = "{}"; }],
    ["occurred-at canonical", (event: MutableEvent) => { event.occurredAtCanonical = "2026-07-18T00:00:00.000Z"; }],
    ["event hash", (event: MutableEvent) => { event.eventHash = "f".repeat(64); }],
  ] as const)("rejects a post-final commerce event with a forged %s", (_label, mutate) => {
    const fixture = successFixture();
    mutate(fixture.events.at(-1)! as MutableEvent);
    expect(() => projectReportV4AcceptanceSemanticAuthority(fixture)).toThrow(/post-final commerce event/iu);
  });
});

type MutableEvent = { -readonly [Key in keyof ReportV4AcceptanceEvent]: ReportV4AcceptanceEvent[Key] };
type MutableAuthority = { diagnoses: Array<{ state: "completed" | "failed"; logicalProviderCallCount: number; physicalProviderCallCount: number }> };

function successFixture(): Omit<ProjectReportV4AcceptanceSemanticAuthorityInput, "events"> & {
  events: ReportV4AcceptanceEvent[];
} {
  const { input, baselinePhase } = makeSemanticSuccessBaselineFixture();
  return { scenario: input.scenario, events: structuredClone(input.events), baselinePhase,
    finalPhase: input.finalPhase, config: makeSemanticSuccessConfig() };
}

function scenario(): ReportV4AcceptanceScenario {
  return { sessionId: "11111111-1111-4111-8111-111111111111",
    scenarioId: "22222222-2222-4222-8222-222222222222", reportId: "report", orderId: "order",
    preAdmissionJobId: "job-pre", coreJobId: "job-core", enhancementJobId: null, siteSnapshotId: "snapshot",
    configSnapshotId: "config", questionSetId: "questions", coreArtifactRevisionId: "artifact-core",
    enhancementArtifactRevisionId: null, kind: "question_failure", faultKind: "question_failure",
    faultQuestionId: "question-3", faultSourceId: null, expectedFaultOccurrences: 2,
    baselineFingerprint: null, finalFingerprint: null, state: "collecting",
    createdAt: new Date("2026-07-17T00:00:00.000Z"), terminalAt: null };
}

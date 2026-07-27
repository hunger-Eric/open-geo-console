import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { reseal } from "../db/report-v4-acceptance-authority-phase-snapshot.test-fixture";
import type { ReportV4AcceptanceEvent, ReportV4AcceptanceSession } from "../db/report-v4-acceptance-ledger";
import { projectReportV4AcceptanceSemanticAuthority,
  type ProjectReportV4AcceptanceSemanticAuthorityInput } from "./acceptance-semantic-authority-projector";
import { makeSemanticGlobalAuthorityFixture } from "./acceptance-semantic-authority-projector.test-fixture";
import { verifyReportV4AcceptanceScenarioSemantics } from "./acceptance-semantic-verifier";

describe("Report V4 semantic authority aggregator", () => {
  it.each(["success", "diagnosis_failure", "question_failure"] as const)(
    "projects a genuine sealed three-scenario global %s ledger",
    (kind) => {
      const input = makeSemanticGlobalAuthorityFixture(kind);
      const authority = projectReportV4AcceptanceSemanticAuthority(input);
      const currentEvents = input.events.filter((event) => event.scenarioId === input.scenario.scenarioId);
      expect(input.scenarios).toHaveLength(3);
      expect(new Set(input.scenarios.map((scenario) => scenario.kind))).toEqual(
        new Set(["success", "diagnosis_failure", "question_failure"]),
      );
      expect(verifyReportV4AcceptanceScenarioSemantics({ scenario: input.scenario, events: currentEvents, authority }))
        .toMatchObject({ valid: true });
      if (kind === "diagnosis_failure") {
        expect(authority.diagnoses.find((row) => row.questionId === input.scenario.faultQuestionId))
          .toMatchObject({ state: "failed", logicalProviderCallCount: 2, physicalProviderCallCount: 0 });
      }
      if (kind === "question_failure") {
        expect(authority.questions.find((row) => row.questionId === input.scenario.faultQuestionId))
          .toMatchObject({ state: "unavailable", logicalProviderCallCount: 2, physicalProviderCallCount: 0 });
        expect(authority.enhancementArtifact).toBeNull();
      }
    },
  );

  it("accepts foreign semantic collisions after each capture head and a foreign tail", () => {
    const input = makeSemanticGlobalAuthorityFixture("success");
    const baselineCount = input.baselinePhase.session.eventCount;
    const finalCount = input.finalPhase.session.eventCount;
    expect(input.events[baselineCount]!.scenarioId).not.toBe(input.scenario.scenarioId);
    expect(input.events[baselineCount]!).toMatchObject({ kind: "model_operation", operation: "website_synthesis",
      unitId: "website-synthesis" });
    expect(input.events[finalCount]!.scenarioId).not.toBe(input.scenario.scenarioId);
    expect(input.events[finalCount]!).toMatchObject({ kind: "site_read", operation: "site_raw_read" });
    const finalCommerce = input.events.findIndex((event) => event.scenarioId === input.scenario.scenarioId
      && event.unitId === "commerce-final");
    expect(input.events.slice(finalCommerce + 1).every((event) => event.scenarioId !== input.scenario.scenarioId)).toBe(true);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).not.toThrow();
  });

  it("rejects a current scenario clone even when its ID and fields are equal", () => {
    const input = makeSemanticGlobalAuthorityFixture("success");
    const clone = structuredClone(input.scenario);
    expect(() => projectReportV4AcceptanceSemanticAuthority({ ...input, scenario: clone }))
      .toThrow(/exact sealed scenario member/i);
  });

  it("reports structural ledger invalidity before equal-field current-scenario identity drift", () => {
    const input = mutableFixture("success");
    input.events[0]!.prevHash = "f".repeat(64);
    const clone = structuredClone(input.scenario);
    expect(() => projectReportV4AcceptanceSemanticAuthority({ ...input, scenario: clone }))
      .toThrow(/ledger verification.*prevHash/is);
  });

  it("rejects structural invalidity before semantic projection", () => {
    const input = mutableFixture("success");
    input.events[0]!.prevHash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/ledger verification|prevHash/i);
  });

  it("rejects a fully rechained missing current fault occurrence", () => {
    const input = mutableFixture("diagnosis_failure");
    const index = input.events.findIndex((event) => event.scenarioId === input.scenario.scenarioId
      && event.kind === "fault_injection" && event.attempt === 2);
    input.events.splice(index, 1);
    resequenceAndRehash(input.events, index);
    syncSession(input.session, input.events);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/fault occurrences.*exactly 1,2/i);
  });

  it("rejects a tampered final phase seal before projection", () => {
    const input = mutableFixture("success");
    input.finalPhase.session.scenarioIdHash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/lineage|scenario|mismatch/i);
  });

  it("rejects truncation or omission from the sealed global ledger", () => {
    const input = mutableFixture("success");
    input.events.pop();
    syncSession(input.session, input.events);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/fault occurrences|ledger verification/i);
  });

  it("rejects an independently resealed baseline that is not the exact global prefix", () => {
    const input = mutableFixture("success");
    input.baselinePhase.authorities.ledger_authority.events[0]!.unitIdHash = "f".repeat(64);
    reseal(input.baselinePhase, "ledger_authority");
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/exact unchanged prefix|global raw prefix/i);
  });

  it("rejects a final phase prefix with one globally captured record omitted", () => {
    const input = mutableFixture("success");
    const ledger = input.finalPhase.authorities.ledger_authority;
    ledger.events.pop();
    const headHash = ledger.events.at(-1)?.eventHash ?? "0".repeat(64);
    Object.assign(ledger.session, { headSequence: ledger.events.length, headHash, eventCount: ledger.events.length });
    Object.assign(input.finalPhase.session,
      { headSequence: ledger.events.length, headHash, eventCount: ledger.events.length });
    reseal(input.finalPhase, "ledger_authority");
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/final.*commerce|phase ledger|following/i);
  });

  it("rejects a structurally valid later current-scenario event after commerce-final", () => {
    const input = mutableFixture("success");
    input.events.push(canonicalEvent(input.events, input.scenario.scenarioId, {
      kind: "scenario_bound", operation: "v4_dispatch", unitId: "late-current", attempt: 0,
      phase: "observed", details: { bindingHash: sha("late-current") },
    }));
    syncSession(input.session, input.events);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/after commerce-final/i);
  });

  it("rejects a fully rechained commerce-final canonical-details tamper", () => {
    const input = mutableFixture("success");
    const index = input.events.findIndex((event) => event.scenarioId === input.scenario.scenarioId
      && event.unitId === "commerce-final");
    input.events[index]!.detailsCanonical = JSON.stringify(input.events[index]!.details);
    rehashSuffix(input.events, index);
    syncSession(input.session, input.events);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/commerce event envelope/i);
  });

  it("rejects a commerce-final hash tamper", () => {
    const input = mutableFixture("success");
    const event = input.events.find((candidate) => candidate.scenarioId === input.scenario.scenarioId
      && candidate.unitId === "commerce-final")!;
    event.eventHash = "f".repeat(64);
    expect(() => projectReportV4AcceptanceSemanticAuthority(input)).toThrow(/eventHash|ledger verification/i);
  });

  it("fails closed unless the phase order is baseline then final", () => {
    const input = makeSemanticGlobalAuthorityFixture("success");
    expect(() => projectReportV4AcceptanceSemanticAuthority({ ...input, baselinePhase: input.finalPhase }))
      .toThrow(/baseline\/final phases/i);
  });
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[]
  : T[K] extends Date ? Date : T[K] extends object ? Mutable<T[K]> : T[K] };
type MutableInput = Mutable<ProjectReportV4AcceptanceSemanticAuthorityInput>;

function mutableFixture(kind: "success" | "diagnosis_failure" | "question_failure"): MutableInput {
  const source = makeSemanticGlobalAuthorityFixture(kind);
  const cloned = structuredClone(source) as MutableInput;
  const scenario = cloned.scenarios.find((candidate) => candidate.scenarioId === source.scenario.scenarioId)!;
  cloned.scenario = scenario;
  return cloned;
}

function syncSession(session: Mutable<ReportV4AcceptanceSession>, events: readonly ReportV4AcceptanceEvent[]): void {
  Object.assign(session, { headSequence: events.length, eventCount: events.length,
    headHash: events.at(-1)?.eventHash ?? "0".repeat(64) });
}

function canonicalEvent(events: readonly ReportV4AcceptanceEvent[], scenarioId: string,
  value: Pick<ReportV4AcceptanceEvent, "kind" | "operation" | "unitId" | "attempt" | "phase" | "details">): Mutable<ReportV4AcceptanceEvent> {
  const sequence = events.length + 1; const previousHash = events.at(-1)?.eventHash ?? "0".repeat(64);
  const occurredAt = new Date(Date.parse("2026-07-18T00:02:00.000Z") + sequence);
  const occurredAtCanonical = `${occurredAt.toISOString().slice(0, 23)}000Z`;
  const detailsCanonical = JSON.stringify(value.details);
  const idempotencyKey = shaParts([events[0]!.sessionId, scenarioId, value.kind, value.operation, value.unitId,
    String(value.attempt), value.phase]);
  const eventHash = shaParts([previousHash, idempotencyKey, String(sequence), value.kind, value.operation,
    value.unitId, String(value.attempt), value.phase, detailsCanonical, occurredAtCanonical]);
  return { ...value, sessionId: events[0]!.sessionId, scenarioId, sequence, idempotencyKey, detailsCanonical,
    prevHash: previousHash, eventHash, occurredAt, occurredAtCanonical } as Mutable<ReportV4AcceptanceEvent>;
}

function rehashSuffix(events: Mutable<ReportV4AcceptanceEvent>[], start: number): void {
  let previousHash = start === 0 ? "0".repeat(64) : events[start - 1]!.eventHash;
  for (let index = start; index < events.length; index += 1) {
    const event = events[index]!;
    event.prevHash = previousHash;
    event.idempotencyKey = shaParts([event.sessionId, event.scenarioId, event.kind, event.operation, event.unitId,
      String(event.attempt), event.phase]);
    event.eventHash = shaParts([event.prevHash, event.idempotencyKey, String(event.sequence), event.kind,
      event.operation, event.unitId, String(event.attempt), event.phase, event.detailsCanonical,
      event.occurredAtCanonical]);
    previousHash = event.eventHash;
  }
}

function resequenceAndRehash(events: Mutable<ReportV4AcceptanceEvent>[], start: number): void {
  for (let index = start; index < events.length; index += 1) events[index]!.sequence = index + 1;
  rehashSuffix(events, start);
}

function sha(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function shaParts(values: readonly string[]): string { return sha(values.join("\x1f")); }

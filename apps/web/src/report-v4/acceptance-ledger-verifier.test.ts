import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  ReportV4AcceptanceEvent,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import {
  ReportV4AcceptanceLedgerVerificationError,
  verifyReportV4AcceptanceLedger
} from "./acceptance-ledger-verifier";
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "./report-v4-acceptance-fingerprints";

const ZERO_HASH = "0".repeat(64);
const US = "\x1f";

describe("Report V4 acceptance ledger verifier", () => {
  it("accepts a complete sealed three-scenario ledger and returns only derived evidence", () => {
    const fixture = validLedger();
    expect(verify(fixture)).toEqual({
      valid: true,
      sessionId: fixture.session.sessionId,
      scenarioCount: 3,
      eventCount: 5,
      headHash: fixture.session.headHash
    });
  });

  it.each([
    ["unsealed session", (f: Fixture) => { f.session.state = "collecting"; }, /session\.state/u],
    ["missing scenario", (f: Fixture) => { f.scenarios.pop(); }, /exactly three/u],
    ["duplicate kind", (f: Fixture) => { f.scenarios[2]!.kind = "diagnosis_failure"; }, /scenario kinds/u],
    ["unsealed scenario", (f: Fixture) => { f.scenarios[0]!.state = "failed"; }, /scenario.*state/u],
    ["missing lineage", (f: Fixture) => { f.scenarios[0]!.coreArtifactRevisionId = ""; }, /coreArtifactRevisionId/u],
    ["missing fingerprint", (f: Fixture) => { f.scenarios[1]!.baselineFingerprint = null; }, /baselineFingerprint/u],
    ["wrong lineage baseline", (f: Fixture) => { f.scenarios[1]!.baselineFingerprint = "f".repeat(64); }, /fault-provenance lineage fingerprint/u],
    ["missing success source", (f: Fixture) => { f.scenarios[0]!.faultSourceId = null; }, /faultSourceId/u],
    ["missing diagnosis enhancement artifact", (f: Fixture) => {
      f.scenarios[1]!.enhancementArtifactRevisionId = null;
    }, /enhancementArtifactRevisionId must be nonblank/u]
  ])("rejects %s", (_label, mutate, message) => {
    const fixture = validLedger();
    mutate(fixture);
    expect(() => verify(fixture)).toThrow(message);
  });

  it.each([
    ["sequence gap", (f: Fixture) => { f.events[1]!.sequence = 7; rehash(f); }, /sequence must equal 2/u],
    ["broken previous hash", (f: Fixture) => {
      f.events[1]!.prevHash = hash("wrong-prev");
      f.events[1]!.eventHash = eventHash(f.events[1]!);
      rehashFrom(f, 2);
    }, /prevHash/u],
    ["event count", (f: Fixture) => { f.session.eventCount += 1; }, /eventCount/u],
    ["head sequence", (f: Fixture) => { f.session.headSequence -= 1; }, /headSequence/u],
    ["head hash", (f: Fixture) => { f.session.headHash = hash("wrong-head"); }, /headHash/u],
    ["idempotency key", (f: Fixture) => {
      f.events[0]!.idempotencyKey = hash("wrong-key");
      rehash(f);
    }, /idempotencyKey/u],
    ["event hash", (f: Fixture) => { f.events[2]!.eventHash = hash("wrong-event"); }, /eventHash/u],
    ["invalid canonical JSON", (f: Fixture) => {
      f.events[0]!.detailsCanonical = "{";
      rehash(f);
    }, /detailsCanonical must be valid JSON/u],
    ["semantically different canonical JSON", (f: Fixture) => {
      f.events[0]!.detailsCanonical = JSON.stringify({ ...f.events[0]!.details, occurrence: 2 });
      rehash(f);
    }, /detailsCanonical JSON must equal details/u],
    ["non-canonical timestamp", (f: Fixture) => {
      f.events[0]!.occurredAtCanonical = "2026-07-17T00:00:00.000Z";
      rehash(f);
    }, /occurredAtCanonical/u]
  ])("rejects a tampered %s", (_label, mutate, message) => {
    const fixture = validLedger();
    mutate(fixture);
    expect(() => verify(fixture)).toThrow(message);
  });

  it.each([
    ["fault", (f: Fixture) => {
      f.events[0]!.operation = "question_failure";
      setFaultDetails(f.events[0]!, { fault: "question_failure" });
      recanonicalizeAndRehash(f);
    }, /fault must equal/u],
    ["target", (f: Fixture) => { f.events[1]!.unitId = "wrong-target"; recalculateAll(f); }, /target/u],
    ["occurrence", (f: Fixture) => {
      setFaultDetails(f.events[2]!, { occurrence: 1 });
      recanonicalizeAndRehash(f);
    }, /occurrences must be exactly 1,2/u],
    ["attempt", (f: Fixture) => { f.events[3]!.attempt = 2; recalculateAll(f); }, /attempt must equal occurrence/u],
    ["missing fault event", (f: Fixture) => { f.events.splice(2, 1); recalculateAll(f); }, /occurrences must be exactly 1,2/u],
    ["extra fault event", (f: Fixture) => {
      const extra = structuredClone(f.events[0]!);
      extra.sequence = f.events.length + 1;
      extra.unitId = f.events[0]!.unitId;
      f.events.push(extra);
      recalculateAll(f);
    }, /occurrences must be exactly 1/u]
  ])("rejects a tampered scenario fault %s without relying on a broken chain", (_label, mutate, message) => {
    const fixture = validLedger();
    mutate(fixture);
    expect(() => verify(fixture)).toThrow(message);
  });

  it("aggregates independent gaps into one fail-closed error", () => {
    const fixture = validLedger();
    fixture.session.state = "failed";
    fixture.scenarios[0]!.reportId = null;
    fixture.events[0]!.eventHash = hash("bad");
    try {
      verify(fixture);
      throw new Error("expected verification failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ReportV4AcceptanceLedgerVerificationError);
      const issues = (error as ReportV4AcceptanceLedgerVerificationError).issues;
      expect(issues.some((issue) => issue.includes("session.state"))).toBe(true);
      expect(issues.some((issue) => issue.includes("reportId"))).toBe(true);
      expect(issues.some((issue) => issue.includes("eventHash"))).toBe(true);
    }
  });
});

interface Fixture {
  session: Mutable<ReportV4AcceptanceSession>;
  scenarios: Array<Mutable<ReportV4AcceptanceScenario>>;
  events: Array<Mutable<ReportV4AcceptanceEvent>>;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type FaultDetails = {
  readonly fault: "question_failure" | "diagnosis_failure" | "independent_source_read_failure";
  readonly occurrence: 1 | 2;
  readonly baselineFingerprint: string;
};

function verify(fixture: Fixture) {
  return verifyReportV4AcceptanceLedger(fixture.session, fixture.scenarios, fixture.events);
}

function validLedger(): Fixture {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const scenarios = [
    scenario(sessionId, "21111111-1111-4111-8111-111111111111", "success"),
    scenario(sessionId, "31111111-1111-4111-8111-111111111111", "diagnosis_failure"),
    scenario(sessionId, "41111111-1111-4111-8111-111111111111", "question_failure")
  ];
  const events = [
    faultEvent(scenarios[0]!, 1),
    faultEvent(scenarios[1]!, 1),
    faultEvent(scenarios[1]!, 2),
    faultEvent(scenarios[2]!, 1),
    faultEvent(scenarios[2]!, 2)
  ];
  const fixture: Fixture = {
    session: {
      sessionId,
      environment: "protected_staging",
      previewDeploymentId: "preview-1",
      protectedAliasUrl: "https://staging.example.com",
      webGitSha: "a".repeat(40),
      workerGitSha: "a".repeat(40),
      state: "sealed",
      headSequence: events.length,
      headHash: ZERO_HASH,
      eventCount: events.length,
      startedAt: new Date("2026-07-17T00:00:00.000Z"),
      terminalAt: new Date("2026-07-17T00:10:00.000Z")
    },
    scenarios,
    events
  };
  recalculateAll(fixture);
  return fixture;
}

function scenario(sessionId: string, scenarioId: string, kind: ReportV4AcceptanceScenario["kind"]): Mutable<ReportV4AcceptanceScenario> {
  const success = kind === "success";
  const diagnosis = kind === "diagnosis_failure";
  const result: Mutable<ReportV4AcceptanceScenario> = {
    sessionId,
    scenarioId,
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
    finalFingerprint: hash(`final-${kind}`),
    state: "sealed",
    createdAt: new Date("2026-07-17T00:00:00.000Z"),
    terminalAt: new Date("2026-07-17T00:09:00.000Z")
  };
  result.baselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(result);
  return result;
}

function faultEvent(scenarioValue: Mutable<ReportV4AcceptanceScenario>, occurrence: 1 | 2): Mutable<ReportV4AcceptanceEvent> {
  const target = scenarioValue.kind === "question_failure"
    ? `${scenarioValue.coreJobId}:${scenarioValue.faultQuestionId}`
    : scenarioValue.kind === "diagnosis_failure"
      ? `${scenarioValue.enhancementJobId}:${scenarioValue.faultQuestionId}`
      : `${scenarioValue.enhancementJobId}:${scenarioValue.faultQuestionId}:${scenarioValue.faultSourceId}`;
  const details = {
    fault: scenarioValue.faultKind,
    occurrence,
    baselineFingerprint: scenarioValue.baselineFingerprint!
  };
  return {
    idempotencyKey: "",
    sessionId: scenarioValue.sessionId,
    scenarioId: scenarioValue.scenarioId,
    sequence: 0,
    kind: "fault_injection",
    operation: scenarioValue.faultKind,
    unitId: target,
    attempt: occurrence,
    phase: "consumed",
    details,
    detailsCanonical: JSON.stringify(details),
    prevHash: ZERO_HASH,
    eventHash: ZERO_HASH,
    occurredAt: new Date(`2026-07-17T00:00:0${occurrence}.123Z`),
    occurredAtCanonical: `2026-07-17T00:00:0${occurrence}.123456Z`
  };
}

function setFaultDetails(event: Mutable<ReportV4AcceptanceEvent>, patch: Partial<FaultDetails>): void {
  event.details = { ...(event.details as FaultDetails), ...patch };
}

function recanonicalizeAndRehash(fixture: Fixture): void {
  for (const event of fixture.events) event.detailsCanonical = JSON.stringify(event.details);
  recalculateAll(fixture);
}

function recalculateAll(fixture: Fixture): void {
  for (let index = 0; index < fixture.events.length; index += 1) {
    const event = fixture.events[index]!;
    event.sequence = index + 1;
    event.prevHash = index === 0 ? ZERO_HASH : fixture.events[index - 1]!.eventHash;
    event.idempotencyKey = idempotencyKey(event);
    event.eventHash = eventHash(event);
  }
  fixture.session.eventCount = fixture.events.length;
  fixture.session.headSequence = fixture.events.length;
  fixture.session.headHash = fixture.events.at(-1)?.eventHash ?? ZERO_HASH;
}

function rehash(fixture: Fixture): void {
  for (let index = 0; index < fixture.events.length; index += 1) {
    const event = fixture.events[index]!;
    event.prevHash = index === 0 ? ZERO_HASH : fixture.events[index - 1]!.eventHash;
    event.eventHash = eventHash(event);
  }
  fixture.session.headHash = fixture.events.at(-1)?.eventHash ?? ZERO_HASH;
}

function rehashFrom(fixture: Fixture, startIndex: number): void {
  for (let index = startIndex; index < fixture.events.length; index += 1) {
    const event = fixture.events[index]!;
    event.prevHash = fixture.events[index - 1]!.eventHash;
    event.eventHash = eventHash(event);
  }
  fixture.session.headHash = fixture.events.at(-1)?.eventHash ?? ZERO_HASH;
}

function idempotencyKey(event: ReportV4AcceptanceEvent): string {
  return hashFields(event.sessionId, event.scenarioId, event.kind, event.operation, event.unitId, event.attempt, event.phase);
}

function eventHash(event: ReportV4AcceptanceEvent): string {
  return hashFields(event.prevHash, event.idempotencyKey, event.sequence, event.kind, event.operation, event.unitId,
    event.attempt, event.phase, event.detailsCanonical, event.occurredAtCanonical);
}

function hashFields(...values: ReadonlyArray<string | number>): string {
  return createHash("sha256").update(values.join(US)).digest("hex");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

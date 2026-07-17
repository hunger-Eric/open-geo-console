import { createHash } from "node:crypto";
import type {
  ReportV4AcceptanceEvent,
  ReportV4AcceptanceScenario,
  ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";

const ZERO_HASH = "0".repeat(64);
const US = "\x1f";
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const CANONICAL_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/u;
const SCENARIO_KINDS = ["success", "diagnosis_failure", "question_failure"] as const;
const COMMON_LINEAGE_FIELDS = [
  "reportId",
  "orderId",
  "preAdmissionJobId",
  "coreJobId",
  "siteSnapshotId",
  "configSnapshotId",
  "questionSetId",
  "coreArtifactRevisionId"
] as const;

export interface ReportV4AcceptanceLedgerVerification {
  readonly valid: true;
  readonly sessionId: string;
  readonly scenarioCount: 3;
  readonly eventCount: number;
  readonly headHash: string;
}

export class ReportV4AcceptanceLedgerVerificationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Report V4 acceptance ledger verification failed:\n- ${issues.join("\n- ")}`);
    this.name = "ReportV4AcceptanceLedgerVerificationError";
    this.issues = Object.freeze([...issues]);
  }
}

/**
 * Recomputes a returned acceptance ledger without consulting PostgreSQL or any
 * external service. Every detected gap is retained so callers get one
 * fail-closed verdict instead of repairing a forged chain one field at a time.
 */
export function verifyReportV4AcceptanceLedger(
  session: ReportV4AcceptanceSession,
  scenarios: readonly ReportV4AcceptanceScenario[],
  events: readonly ReportV4AcceptanceEvent[]
): ReportV4AcceptanceLedgerVerification {
  const issues: string[] = [];
  verifySessionIdentity(session, issues);
  verifyScenarios(session, scenarios, issues);
  verifyEvents(session, scenarios, events, issues);
  verifyFaultInjections(scenarios, events, issues);

  if (issues.length > 0) throw new ReportV4AcceptanceLedgerVerificationError(issues);
  return Object.freeze({
    valid: true,
    sessionId: session.sessionId,
    scenarioCount: 3,
    eventCount: events.length,
    headHash: session.headHash
  });
}

function verifySessionIdentity(session: ReportV4AcceptanceSession, issues: string[]): void {
  if (session.state !== "sealed") issues.push("session.state must be sealed");
  if (session.environment !== "protected_staging") issues.push("session.environment must be protected_staging");
  if (!nonblank(session.sessionId)) issues.push("session.sessionId must be nonblank");
  if (!GIT_SHA_PATTERN.test(session.webGitSha) || session.webGitSha !== session.workerGitSha) {
    issues.push("session webGitSha and workerGitSha must be the same lowercase full Git SHA");
  }
  if (!validDate(session.terminalAt)) issues.push("sealed session.terminalAt must be present and valid");
}

function verifyScenarios(
  session: ReportV4AcceptanceSession,
  scenarios: readonly ReportV4AcceptanceScenario[],
  issues: string[]
): void {
  if (scenarios.length !== 3) issues.push("scenarios must contain exactly three entries");
  const kinds = scenarios.map((scenario) => scenario.kind);
  if (SCENARIO_KINDS.some((kind) => kinds.filter((candidate) => candidate === kind).length !== 1)
    || kinds.some((kind) => !SCENARIO_KINDS.includes(kind))) {
    issues.push("scenario kinds must be unique and exactly success, diagnosis_failure, question_failure");
  }
  const scenarioIds = new Set<string>();
  for (const scenario of scenarios) {
    const label = scenario.scenarioId || "<missing>";
    if (!nonblank(scenario.scenarioId) || scenarioIds.has(scenario.scenarioId)) issues.push(`scenario ${label} scenarioId must be unique and nonblank`);
    scenarioIds.add(scenario.scenarioId);
    if (scenario.sessionId !== session.sessionId) issues.push(`scenario ${label} sessionId does not match session`);
    if (scenario.state !== "sealed") issues.push(`scenario ${label} state must be sealed`);
    if (!validDate(scenario.terminalAt)) issues.push(`scenario ${label} terminalAt must be present and valid`);
    for (const field of COMMON_LINEAGE_FIELDS) {
      if (!nonblank(scenario[field])) issues.push(`scenario ${label} ${field} must be nonblank`);
    }
    if (!HASH_PATTERN.test(scenario.baselineFingerprint ?? "")) issues.push(`scenario ${label} baselineFingerprint must be a SHA-256 hash`);
    if (!HASH_PATTERN.test(scenario.finalFingerprint ?? "")) issues.push(`scenario ${label} finalFingerprint must be a SHA-256 hash`);
    if (!nonblank(scenario.faultQuestionId)) issues.push(`scenario ${label} faultQuestionId must be nonblank`);
    verifyScenarioContract(scenario, label, issues);
  }
}

function verifyScenarioContract(scenario: ReportV4AcceptanceScenario, label: string, issues: string[]): void {
  if (scenario.kind === "success") {
    if (scenario.faultKind !== "independent_source_read_failure" || scenario.expectedFaultOccurrences !== 1) {
      issues.push(`scenario ${label} success fault contract must be independent_source_read_failure exactly once`);
    }
    if (!nonblank(scenario.enhancementJobId)) issues.push(`scenario ${label} enhancementJobId must be nonblank`);
    if (!nonblank(scenario.enhancementArtifactRevisionId)) issues.push(`scenario ${label} enhancementArtifactRevisionId must be nonblank`);
    if (!nonblank(scenario.faultSourceId)) issues.push(`scenario ${label} faultSourceId must be nonblank for success`);
    return;
  }
  if (scenario.kind === "diagnosis_failure") {
    if (scenario.faultKind !== "diagnosis_failure" || scenario.expectedFaultOccurrences !== 2) {
      issues.push(`scenario ${label} diagnosis fault contract must be diagnosis_failure exactly twice`);
    }
    if (!nonblank(scenario.enhancementJobId)) issues.push(`scenario ${label} enhancementJobId must be nonblank`);
    if (scenario.faultSourceId !== null) issues.push(`scenario ${label} faultSourceId must be null for diagnosis_failure`);
    return;
  }
  if (scenario.kind === "question_failure") {
    if (scenario.faultKind !== "question_failure" || scenario.expectedFaultOccurrences !== 2) {
      issues.push(`scenario ${label} question fault contract must be question_failure exactly twice`);
    }
    if (scenario.faultSourceId !== null) issues.push(`scenario ${label} faultSourceId must be null for question_failure`);
  }
}

function verifyEvents(
  session: ReportV4AcceptanceSession,
  scenarios: readonly ReportV4AcceptanceScenario[],
  events: readonly ReportV4AcceptanceEvent[],
  issues: string[]
): void {
  const scenarioIds = new Set(scenarios.map((scenario) => scenario.scenarioId));
  const idempotencyKeys = new Set<string>();
  let expectedPreviousHash = ZERO_HASH;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const expectedSequence = index + 1;
    const label = `event ${expectedSequence}`;
    if (event.sequence !== expectedSequence) issues.push(`${label} sequence must equal ${expectedSequence}`);
    if (event.sessionId !== session.sessionId) issues.push(`${label} sessionId does not match session`);
    if (!scenarioIds.has(event.scenarioId)) issues.push(`${label} scenarioId is not one of the sealed scenarios`);
    if (event.prevHash !== expectedPreviousHash) issues.push(`${label} prevHash does not extend the previous eventHash`);
    if (!nonblank(event.unitId)) issues.push(`${label} unitId must be nonblank`);
    if (!Number.isSafeInteger(event.attempt) || event.attempt < 0 || event.attempt > 2) issues.push(`${label} attempt must be an integer from 0 through 2`);

    const expectedIdempotencyKey = sha256([
      event.sessionId,
      event.scenarioId,
      event.kind,
      event.operation,
      event.unitId,
      event.attempt,
      event.phase
    ].join(US));
    if (event.idempotencyKey !== expectedIdempotencyKey) issues.push(`${label} idempotencyKey does not match the database formula`);
    if (idempotencyKeys.has(event.idempotencyKey)) issues.push(`${label} idempotencyKey is duplicated`);
    idempotencyKeys.add(event.idempotencyKey);

    verifyCanonicalDetails(event, label, issues);
    verifyCanonicalTimestamp(event, label, issues);
    const expectedEventHash = sha256([
      event.prevHash,
      event.idempotencyKey,
      event.sequence,
      event.kind,
      event.operation,
      event.unitId,
      event.attempt,
      event.phase,
      event.detailsCanonical,
      event.occurredAtCanonical
    ].join(US));
    if (event.eventHash !== expectedEventHash) issues.push(`${label} eventHash does not match the database formula`);
    expectedPreviousHash = event.eventHash;
  }

  if (session.eventCount !== events.length) issues.push("session.eventCount must equal the returned event count");
  if (session.headSequence !== events.length) issues.push("session.headSequence must equal the returned event count");
  const expectedHeadHash = events.at(-1)?.eventHash ?? ZERO_HASH;
  if (session.headHash !== expectedHeadHash) issues.push("session.headHash must equal the final returned eventHash");
}

function verifyCanonicalDetails(event: ReportV4AcceptanceEvent, label: string, issues: string[]): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.detailsCanonical);
  } catch {
    issues.push(`${label} detailsCanonical must be valid JSON`);
    return;
  }
  try {
    if (semanticJson(parsed) !== semanticJson(event.details)) issues.push(`${label} detailsCanonical JSON must equal details semantically`);
  } catch {
    issues.push(`${label} details must be JSON-compatible`);
  }
}

function verifyCanonicalTimestamp(event: ReportV4AcceptanceEvent, label: string, issues: string[]): void {
  const match = CANONICAL_TIMESTAMP_PATTERN.exec(event.occurredAtCanonical);
  if (!match) {
    issues.push(`${label} occurredAtCanonical must use six-digit UTC microsecond format`);
    return;
  }
  const millisecondTimestamp = `${match[1]}.${match[2]!.slice(0, 3)}Z`;
  const parsed = new Date(millisecondTimestamp);
  if (!validDate(parsed) || parsed.toISOString() !== millisecondTimestamp) {
    issues.push(`${label} occurredAtCanonical must be a real canonical UTC timestamp`);
    return;
  }
  if (!validDate(event.occurredAt) || event.occurredAt.toISOString() !== millisecondTimestamp) {
    issues.push(`${label} occurredAt must match occurredAtCanonical at returned Date precision`);
  }
}

function verifyFaultInjections(
  scenarios: readonly ReportV4AcceptanceScenario[],
  events: readonly ReportV4AcceptanceEvent[],
  issues: string[]
): void {
  for (const scenario of scenarios) {
    const label = scenario.scenarioId || "<missing>";
    const faultEvents = events.filter((event) => event.scenarioId === scenario.scenarioId && event.kind === "fault_injection");
    const expectedOccurrences = Array.from({ length: scenario.expectedFaultOccurrences }, (_, index) => index + 1);
    const actualOccurrences = faultEvents.map((event) => faultDetails(event)?.occurrence);
    if (faultEvents.length !== expectedOccurrences.length
      || actualOccurrences.some((occurrence, index) => occurrence !== expectedOccurrences[index])) {
      issues.push(`scenario ${label} fault occurrences must be exactly ${expectedOccurrences.join(",")}, with no extras`);
    }
    const expectedTarget = faultTarget(scenario);
    for (const event of faultEvents) {
      const details = faultDetails(event);
      if (!details) {
        issues.push(`scenario ${label} fault event details must contain fault, occurrence, and baselineFingerprint`);
        continue;
      }
      if (event.operation !== scenario.faultKind || details.fault !== scenario.faultKind) {
        issues.push(`scenario ${label} fault must equal scenario.faultKind`);
      }
      if (event.phase !== "consumed") issues.push(`scenario ${label} fault event phase must be consumed`);
      if (event.unitId !== expectedTarget) issues.push(`scenario ${label} fault target must equal ${expectedTarget}`);
      if (event.attempt !== details.occurrence) issues.push(`scenario ${label} fault event attempt must equal occurrence`);
      if (details.baselineFingerprint !== scenario.baselineFingerprint) {
        issues.push(`scenario ${label} fault baselineFingerprint must equal the sealed scenario baseline`);
      }
    }
  }
}

function faultTarget(scenario: ReportV4AcceptanceScenario): string {
  if (scenario.kind === "question_failure") return `${scenario.coreJobId}:${scenario.faultQuestionId}`;
  if (scenario.kind === "diagnosis_failure") return `${scenario.enhancementJobId}:${scenario.faultQuestionId}`;
  return `${scenario.enhancementJobId}:${scenario.faultQuestionId}:${scenario.faultSourceId}`;
}

function faultDetails(event: ReportV4AcceptanceEvent): { fault: unknown; occurrence: unknown; baselineFingerprint: unknown } | null {
  if (!event.details || typeof event.details !== "object" || Array.isArray(event.details)) return null;
  const details = event.details as unknown as Record<string, unknown>;
  if (!("fault" in details) || !("occurrence" in details) || !("baselineFingerprint" in details)) return null;
  return { fault: details.fault, occurrence: details.occurrence, baselineFingerprint: details.baselineFingerprint };
}

function semanticJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("JSON numbers must be finite.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(semanticJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${semanticJson(item)}`).join(",")}}`;
  }
  throw new TypeError("Value is not JSON-compatible.");
}

function nonblank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

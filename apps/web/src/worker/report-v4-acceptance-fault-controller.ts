import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import {
  createProductionReportV4AcceptanceLedgerRepository,
  type AppendReportV4AcceptanceEventInput,
  type ReportV4AcceptanceEvent,
  type ReportV4AcceptanceLedgerRepository,
  type ReportV4AcceptanceScenario,
  type ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";
import type { ReportV4AcceptanceFaultKind } from "../db/schema";

const SESSION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

export type ReportV4AcceptanceFaultControllerErrorCode =
  | "invalid_configuration"
  | "invalid_context"
  | "invalid_ledger_state";

export class ReportV4AcceptanceFaultControllerError extends Error {
  constructor(readonly code: ReportV4AcceptanceFaultControllerErrorCode, message: string) {
    super(message);
    this.name = "ReportV4AcceptanceFaultControllerError";
  }
}

export interface ReportV4AcceptanceFaultContext {
  readonly jobId: string;
  readonly questionId: string;
  readonly sourceId?: string;
  readonly occurrence: 1 | 2;
  readonly baselineFingerprint: string;
}

export type ReportV4AcceptanceFaultConsumptionResult =
  | { readonly status: "noop" }
  | { readonly status: "not_targeted"; readonly reason: "question" | "source" }
  | { readonly status: "already_consumed"; readonly fault: ReportV4AcceptanceFaultKind; readonly occurrence: 1 | 2 }
  | {
      readonly status: "inject";
      readonly fault: ReportV4AcceptanceFaultKind;
      readonly occurrence: 1 | 2;
      readonly event: ReportV4AcceptanceEvent;
    };

export interface ReportV4AcceptanceFaultController {
  readonly mode: "noop" | "active";
  consume(context: ReportV4AcceptanceFaultContext): Promise<ReportV4AcceptanceFaultConsumptionResult>;
}

export interface CreateReportV4AcceptanceFaultControllerInput {
  readonly jobId: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly repository?: ReportV4AcceptanceLedgerRepository;
}

const NOOP_CONTROLLER: ReportV4AcceptanceFaultController = Object.freeze({
  mode: "noop" as const,
  async consume() { return { status: "noop" as const }; }
});

export async function createReportV4AcceptanceFaultController(
  input: CreateReportV4AcceptanceFaultControllerInput
): Promise<ReportV4AcceptanceFaultController> {
  const environment = input.environment ?? process.env;
  const sessionId = environment.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
  if (sessionId === undefined || sessionId === "") return NOOP_CONTROLLER;

  assertProtectedStagingCommercePreview(environment);
  if (!SESSION_UUID_PATTERN.test(sessionId)) {
    throw configurationError("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID must be an exact lowercase session UUID.");
  }
  const jobId = exactText(input.jobId, "jobId");
  const repository = input.repository ?? createProductionReportV4AcceptanceLedgerRepository(environment);
  const session = await repository.loadSession(sessionId);
  assertExactSession(session, sessionId, environment.OGC_DEPLOYMENT_VERSION);
  const loadedScenario = await repository.loadCollectingScenarioByJob({ sessionId, jobId });
  assertExactScenario(loadedScenario, sessionId, jobId);
  let scenario: ReportV4AcceptanceScenario = loadedScenario;

  return Object.freeze({
    mode: "active" as const,
    async consume(rawContext: ReportV4AcceptanceFaultContext): Promise<ReportV4AcceptanceFaultConsumptionResult> {
      const context = parseContext(rawContext);
      if (context.jobId !== jobId) throw contextError("Fault consumption jobId must equal the controller's exact job.");
      if (context.questionId !== scenario.faultQuestionId) return { status: "not_targeted", reason: "question" };
      if (context.occurrence > scenario.expectedFaultOccurrences) {
        throw contextError(`${scenario.faultKind} occurrence budget is exactly ${scenario.expectedFaultOccurrences}.`);
      }

      if (scenario.kind === "success") {
        if (!context.sourceId) throw contextError("The independent source read fault requires an explicit sourceId.");
        scenario = await bindOrReloadFirstSource(repository, scenario, jobId, context.sourceId);
        if (scenario.faultSourceId !== context.sourceId) return { status: "not_targeted", reason: "source" };
      } else if (context.sourceId !== undefined) {
        throw contextError(`${scenario.faultKind} does not accept a sourceId.`);
      }

      const unitId = faultTarget(scenario);
      const previous = await repository.loadEvents(sessionId);
      validateExistingFaultEvents(previous, scenario, unitId, context.baselineFingerprint, context.occurrence);
      const eventInput = faultEventInput(sessionId, scenario, unitId, context);
      const result = await repository.appendEvent(eventInput);
      if (!matchesFaultEvent(result.event, eventInput)) {
        throw ledgerError("The appended fault-consumption event does not match the exact verifier contract.");
      }
      if (!result.inserted) {
        return { status: "already_consumed", fault: scenario.faultKind, occurrence: context.occurrence };
      }
      return { status: "inject", fault: scenario.faultKind, occurrence: context.occurrence, event: result.event };
    }
  });
}

function assertExactSession(
  session: ReportV4AcceptanceSession | null,
  sessionId: string,
  deploymentVersion: string | undefined
): asserts session is ReportV4AcceptanceSession {
  if (!session || session.sessionId !== sessionId || session.environment !== "protected_staging"
    || session.state !== "collecting" || session.terminalAt !== null) {
    throw ledgerError("A matching collecting protected-Staging acceptance session is required.");
  }
  if (!deploymentVersion || deploymentVersion !== session.webGitSha || deploymentVersion !== session.workerGitSha) {
    throw configurationError("The deployment SHA must exactly match both acceptance session Git SHAs.");
  }
}

function assertExactScenario(
  scenario: ReportV4AcceptanceScenario | null,
  sessionId: string,
  jobId: string
): asserts scenario is ReportV4AcceptanceScenario {
  if (!scenario || scenario.sessionId !== sessionId || scenario.state !== "collecting" || scenario.terminalAt !== null) {
    throw ledgerError("A matching collecting acceptance scenario is required.");
  }
  const exact = scenario.kind === "question_failure"
    ? scenario.faultKind === "question_failure" && scenario.expectedFaultOccurrences === 2
      && scenario.coreJobId === jobId && scenario.faultSourceId === null
    : scenario.kind === "diagnosis_failure"
      ? scenario.faultKind === "diagnosis_failure" && scenario.expectedFaultOccurrences === 2
        && scenario.enhancementJobId === jobId && scenario.faultSourceId === null
      : scenario.kind === "success"
        && scenario.faultKind === "independent_source_read_failure" && scenario.expectedFaultOccurrences === 1
        && scenario.enhancementJobId === jobId;
  if (!exact) throw ledgerError(`The exact ${scenario.kind} job and fault contract are required.`);
}

async function bindOrReloadFirstSource(
  repository: ReportV4AcceptanceLedgerRepository,
  current: ReportV4AcceptanceScenario,
  jobId: string,
  sourceId: string
): Promise<ReportV4AcceptanceScenario> {
  if (current.faultSourceId !== null) return current;
  try {
    const bound = await repository.bindFaultSource({
      sessionId: current.sessionId, scenarioId: current.scenarioId, sourceId
    });
    assertExactScenario(bound, current.sessionId, jobId);
    return bound;
  } catch (error) {
    const reloaded = await repository.loadCollectingScenarioByJob({ sessionId: current.sessionId, jobId });
    if (!reloaded) throw error;
    assertExactScenario(reloaded, current.sessionId, jobId);
    if (reloaded.faultSourceId === null) throw error;
    return reloaded;
  }
}

function validateExistingFaultEvents(
  events: readonly ReportV4AcceptanceEvent[],
  scenario: ReportV4AcceptanceScenario,
  unitId: string,
  baselineFingerprint: string,
  requestedOccurrence: 1 | 2
): void {
  const faultEvents = events
    .filter((event) => event.scenarioId === scenario.scenarioId && event.kind === "fault_injection")
    .sort((left, right) => left.sequence - right.sequence);
  for (const [index, event] of faultEvents.entries()) {
    const occurrence = index + 1;
    const details = event.details as unknown as Record<string, unknown>;
    if (details.baselineFingerprint !== baselineFingerprint) {
      throw ledgerError("Existing fault-consumption baselineFingerprint differs from the explicit call context.");
    }
    if (occurrence > scenario.expectedFaultOccurrences || !matchesStoredFaultEvent(
      event, scenario, unitId, occurrence as 1 | 2, baselineFingerprint
    )) {
      throw ledgerError("Existing fault-consumption events do not match the exact ordered verifier contract.");
    }
  }
  if (requestedOccurrence > faultEvents.length + 1) {
    throw contextError(`Fault occurrence ${requestedOccurrence} requires occurrence 1 to be consumed first.`);
  }
}

function matchesStoredFaultEvent(
  event: ReportV4AcceptanceEvent,
  scenario: ReportV4AcceptanceScenario,
  unitId: string,
  occurrence: 1 | 2,
  baselineFingerprint: string
): boolean {
  const details = event.details as unknown as Record<string, unknown>;
  return event.sessionId === scenario.sessionId && event.operation === scenario.faultKind
    && event.phase === "consumed" && event.unitId === unitId && event.attempt === occurrence
    && details.fault === scenario.faultKind && details.occurrence === occurrence
    && details.baselineFingerprint === baselineFingerprint;
}

function faultEventInput(
  sessionId: string,
  scenario: ReportV4AcceptanceScenario,
  unitId: string,
  context: ReportV4AcceptanceFaultContext
): AppendReportV4AcceptanceEventInput {
  return {
    sessionId, scenarioId: scenario.scenarioId, kind: "fault_injection", operation: scenario.faultKind,
    unitId, attempt: context.occurrence, phase: "consumed",
    details: { fault: scenario.faultKind, occurrence: context.occurrence, baselineFingerprint: context.baselineFingerprint }
  };
}

function matchesFaultEvent(event: ReportV4AcceptanceEvent, input: AppendReportV4AcceptanceEventInput): boolean {
  return event.sessionId === input.sessionId && event.scenarioId === input.scenarioId && event.kind === input.kind
    && event.operation === input.operation && event.unitId === input.unitId && event.attempt === input.attempt
    && event.phase === input.phase && matchesExactFaultDetails(event.details, input.details);
}

function matchesExactFaultDetails(left: unknown, right: unknown): boolean {
  if (!isExactFaultDetails(left) || !isExactFaultDetails(right)) return false;
  return left.fault === right.fault
    && left.occurrence === right.occurrence
    && left.baselineFingerprint === right.baselineFingerprint;
}

function isExactFaultDetails(value: unknown): value is {
  fault: unknown;
  occurrence: unknown;
  baselineFingerprint: unknown;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return keys.length === 3
    && Object.hasOwn(record, "fault")
    && Object.hasOwn(record, "occurrence")
    && Object.hasOwn(record, "baselineFingerprint");
}

function faultTarget(scenario: ReportV4AcceptanceScenario): string {
  if (scenario.kind === "question_failure") return `${scenario.coreJobId}:${scenario.faultQuestionId}`;
  if (scenario.kind === "diagnosis_failure") return `${scenario.enhancementJobId}:${scenario.faultQuestionId}`;
  return `${scenario.enhancementJobId}:${scenario.faultQuestionId}:${scenario.faultSourceId}`;
}

function parseContext(value: ReportV4AcceptanceFaultContext): ReportV4AcceptanceFaultContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw contextError("Fault context must be an object.");
  const jobId = exactText(value.jobId, "jobId");
  const questionId = exactText(value.questionId, "questionId");
  const sourceId = value.sourceId === undefined ? undefined : exactText(value.sourceId, "sourceId");
  if (value.occurrence !== 1 && value.occurrence !== 2) throw contextError("Fault occurrence must be 1 or 2.");
  if (!HASH_PATTERN.test(value.baselineFingerprint)) {
    throw contextError("baselineFingerprint must be an explicit lowercase SHA-256 hash.");
  }
  return { jobId, questionId, ...(sourceId === undefined ? {} : { sourceId }),
    occurrence: value.occurrence, baselineFingerprint: value.baselineFingerprint };
}

function exactText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 500) {
    throw contextError(`${field} must be an exact bounded nonblank string.`);
  }
  return value;
}

function configurationError(message: string): ReportV4AcceptanceFaultControllerError {
  return new ReportV4AcceptanceFaultControllerError("invalid_configuration", message);
}
function contextError(message: string): ReportV4AcceptanceFaultControllerError {
  return new ReportV4AcceptanceFaultControllerError("invalid_context", message);
}
function ledgerError(message: string): ReportV4AcceptanceFaultControllerError {
  return new ReportV4AcceptanceFaultControllerError("invalid_ledger_state", message);
}

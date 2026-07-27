import { assertProtectedStagingCommercePreview } from "@/security/deployment-policy";
import {
  createProductionReportV4AcceptanceLedgerRepository,
  type AppendReportV4AcceptanceEventInput,
  type ReportV4AcceptanceEventAppendResult,
  type ReportV4AcceptanceLedgerRepository,
  type ReportV4AcceptanceScenario,
  type ReportV4AcceptanceSession
} from "../db/report-v4-acceptance-ledger";

const SESSION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EXTERNAL_IO_KINDS = new Set(["crawl_run", "site_read", "model_operation"]);

export type ReportV4AcceptanceObserverEvent = AppendReportV4AcceptanceEventInput extends infer Event
  ? Event extends AppendReportV4AcceptanceEventInput
    ? Omit<Event, "sessionId" | "scenarioId">
    : never
  : never;

export interface ReportV4AcceptanceObserver {
  readonly session: ReportV4AcceptanceSession;
  readonly scenario: ReportV4AcceptanceScenario;
  observe(event: ReportV4AcceptanceObserverEvent): Promise<ReportV4AcceptanceEventAppendResult>;
  claimExternalIo(event: ReportV4AcceptanceObserverEvent): Promise<ReportV4AcceptanceEventAppendResult>;
  finishExternalIo(event: ReportV4AcceptanceObserverEvent): Promise<ReportV4AcceptanceEventAppendResult>;
}

export interface CreateReportV4AcceptanceObserverInput {
  readonly jobId: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly repository?: ReportV4AcceptanceLedgerRepository;
}

export class ReportV4AcceptanceIndeterminateOperationError extends Error {
  constructor() {
    super("The Report V4 acceptance external-I/O event was already claimed, so a second physical operation is forbidden.");
    this.name = "ReportV4AcceptanceIndeterminateOperationError";
  }
}

export async function createReportV4AcceptanceObserver(
  input: CreateReportV4AcceptanceObserverInput
): Promise<ReportV4AcceptanceObserver | null> {
  const environment = input.environment ?? process.env;
  const rawSessionId = environment.OGC_REPORT_V4_ACCEPTANCE_SESSION_ID;
  if (rawSessionId === undefined || rawSessionId === "") return null;

  assertProtectedStagingCommercePreview(environment);
  if (!SESSION_UUID_PATTERN.test(rawSessionId)) {
    throw new TypeError("OGC_REPORT_V4_ACCEPTANCE_SESSION_ID must be an exact lowercase session UUID.");
  }
  const jobId = exactJobId(input.jobId);
  const repository = input.repository ?? createProductionReportV4AcceptanceLedgerRepository(environment);
  const session = await repository.loadSession(rawSessionId);
  if (!session || session.sessionId !== rawSessionId || session.environment !== "protected_staging"
    || session.state !== "collecting" || session.terminalAt !== null) {
    throw new Error("A matching collecting Report V4 acceptance session is required.");
  }
  if (environment.OGC_DEPLOYMENT_VERSION !== session.workerGitSha) {
    throw new Error("OGC_DEPLOYMENT_VERSION must exactly match the acceptance session worker Git SHA.");
  }

  const scenario = await repository.loadCollectingScenarioByJob({ sessionId: rawSessionId, jobId });
  if (!scenario || scenario.sessionId !== rawSessionId || scenario.state !== "collecting"
    || scenario.terminalAt !== null || !scenarioOwnsJob(scenario, jobId)) {
    throw new Error("A matching collecting Report V4 acceptance scenario and exact job lineage are required.");
  }

  const append = (event: ReportV4AcceptanceObserverEvent) => repository.appendEvent({
    ...event,
    sessionId: session.sessionId,
    scenarioId: scenario.scenarioId
  } as AppendReportV4AcceptanceEventInput);

  return Object.freeze({
    session,
    scenario,
    async observe(event: ReportV4AcceptanceObserverEvent) {
      if (isExternalIoEvent(event) && event.phase === "started") {
        throw new TypeError("Started crawl, site-read, and model events must use claimExternalIo.");
      }
      return append(event);
    },
    async claimExternalIo(event: ReportV4AcceptanceObserverEvent) {
      if (!isExternalIoEvent(event) || event.phase !== "started") {
        throw new TypeError("claimExternalIo requires a started crawl, site-read, or model event.");
      }
      const result = await append(event);
      if (!result.inserted) throw new ReportV4AcceptanceIndeterminateOperationError();
      return result;
    },
    async finishExternalIo(event: ReportV4AcceptanceObserverEvent) {
      if (!isExternalIoEvent(event) || event.phase === "started") {
        throw new TypeError("finishExternalIo requires a terminal crawl, site-read, or model event.");
      }
      return append(event);
    }
  });
}

function isExternalIoEvent(event: ReportV4AcceptanceObserverEvent): boolean {
  return EXTERNAL_IO_KINDS.has(event.kind);
}

function scenarioOwnsJob(scenario: ReportV4AcceptanceScenario, jobId: string): boolean {
  return scenario.preAdmissionJobId === jobId || scenario.coreJobId === jobId || scenario.enhancementJobId === jobId;
}

function exactJobId(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 500) {
    throw new TypeError("An exact bounded Report V4 acceptance job ID is required.");
  }
  return value;
}

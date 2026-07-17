import { pathToFileURL } from "node:url";
import { closeDatabase } from "../db";
import {
  createProductionReportV4AcceptanceLedgerRepository,
  createReportV4AcceptanceLedgerRepository,
  type BindReportV4AcceptanceScenarioInput,
  type CreateReportV4AcceptanceScenarioInput,
  type ReportV4AcceptanceLedgerStore,
  type ReportV4AcceptanceScenario,
  type ReportV4AcceptanceSession,
  type TerminalizeReportV4AcceptanceScenarioInput
} from "../db/report-v4-acceptance-ledger";
import { assertProtectedStagingCommercePreview } from "../security/deployment-policy";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const SCENARIO_KINDS = ["success", "diagnosis_failure", "question_failure"] as const;

export type ReportV4AcceptanceOperatorAction =
  | "begin"
  | "bind-source"
  | "bind-pre-admission"
  | "bind-lineage"
  | "seal-scenario"
  | "fail-scenario"
  | "seal-session"
  | "fail-session";

export interface ReportV4AcceptanceOperator {
  execute(action: ReportV4AcceptanceOperatorAction | string, payload: unknown): Promise<unknown>;
}

export function createReportV4AcceptanceOperator(
  store: ReportV4AcceptanceLedgerStore,
  environment: NodeJS.ProcessEnv = process.env
): ReportV4AcceptanceOperator {
  const ledger = createReportV4AcceptanceLedgerRepository(store, environment);
  return {
    async execute(action, payload) {
      assertProtectedStagingCommercePreview(environment);
      switch (action) {
        case "begin": {
          const input = parseBegin(payload);
          const session = await ledger.createSession(input.session);
          const scenarios: ReportV4AcceptanceScenario[] = [];
          for (const scenario of input.scenarios) scenarios.push(await ledger.createScenario(scenario));
          return { action, session, scenarios } as const;
        }
        case "bind-source": {
          const input = parseSimpleBinding(payload, "sourceId");
          const scenario = await ledger.bindFaultSource({ ...input.base, sourceId: input.value });
          return { action, scenario } as const;
        }
        case "bind-pre-admission": {
          const input = parseSimpleBinding(payload, "preAdmissionJobId");
          const scenario = await ledger.bindPreAdmissionJob({ ...input.base, preAdmissionJobId: input.value });
          return { action, scenario } as const;
        }
        case "bind-lineage": {
          const scenario = await ledger.bindScenario(parseLineage(payload));
          return { action, scenario } as const;
        }
        case "seal-scenario":
        case "fail-scenario": {
          const target = action === "seal-scenario" ? "sealed" : "failed";
          const input = parseScenarioTerminalization(payload);
          const scenario = await terminalizeScenarioIdempotently(ledger, input, target);
          return { action, scenario } as const;
        }
        case "seal-session":
        case "fail-session": {
          const target = action === "seal-session" ? "sealed" : "failed";
          const sessionId = parseSessionReference(payload);
          const session = await terminalizeSessionIdempotently(ledger, sessionId, target);
          return { action, session } as const;
        }
        default:
          throw new TypeError("The Report V4 acceptance operator action is not recognized.");
      }
    }
  };
}

async function terminalizeScenarioIdempotently(
  ledger: ReportV4AcceptanceLedgerStore,
  input: TerminalizeReportV4AcceptanceScenarioInput,
  target: "sealed" | "failed"
): Promise<ReportV4AcceptanceScenario> {
  const matches = (await ledger.loadScenarios(input.sessionId)).filter((scenario) => scenario.scenarioId === input.scenarioId);
  if (matches.length !== 1) throw new Error("The exact Report V4 acceptance scenario was not found.");
  const existing = matches[0]!;
  if (existing.state === target) {
    if (existing.baselineFingerprint === input.baselineFingerprint && existing.finalFingerprint === input.finalFingerprint) return existing;
    throw new Error("The terminal Report V4 acceptance scenario fingerprint conflicts with this command.");
  }
  if (existing.state !== "collecting") throw new Error(`The Report V4 acceptance scenario is already ${existing.state}; terminal state conflicts cannot be swallowed.`);
  return target === "sealed" ? ledger.sealScenario(input) : ledger.failScenario(input);
}

async function terminalizeSessionIdempotently(
  ledger: ReportV4AcceptanceLedgerStore,
  sessionId: string,
  target: "sealed" | "failed"
): Promise<ReportV4AcceptanceSession> {
  const existing = await ledger.loadSession(sessionId);
  if (!existing) throw new Error("The exact Report V4 acceptance session was not found.");
  if (existing.state === target) return existing;
  if (existing.state !== "collecting") throw new Error(`The Report V4 acceptance session is already ${existing.state}; terminal state conflicts cannot be swallowed.`);
  return target === "sealed" ? ledger.sealSession(sessionId) : ledger.failSession(sessionId);
}

interface ParsedBegin {
  readonly session: {
    readonly sessionId: string;
    readonly previewDeploymentId: string;
    readonly protectedAliasUrl: string;
    readonly webGitSha: string;
    readonly workerGitSha: string;
  };
  readonly scenarios: readonly CreateReportV4AcceptanceScenarioInput[];
}

function parseBegin(value: unknown): ParsedBegin {
  const input = strictRecord(value, ["sessionId", "previewDeploymentId", "protectedAliasUrl", "webGitSha", "workerGitSha", "scenarios"], "begin");
  const sessionId = uuid(input.sessionId, "sessionId");
  const webGitSha = gitSha(input.webGitSha, "webGitSha");
  const workerGitSha = gitSha(input.workerGitSha, "workerGitSha");
  if (webGitSha !== workerGitSha) throw new TypeError("Web and Worker SHA must identify the same exact commit.");
  if (!Array.isArray(input.scenarios) || input.scenarios.length !== 3) throw new TypeError("begin requires exactly three scenarios.");
  const parsed = input.scenarios.map((scenario) => parseBeginScenario(sessionId, scenario));
  const byKind = new Map(parsed.map((scenario) => [scenario.kind, scenario]));
  if (byKind.size !== 3 || SCENARIO_KINDS.some((kind) => !byKind.has(kind))) {
    throw new TypeError("begin requires exactly one success, diagnosis_failure, and question_failure scenario.");
  }
  const ids = [sessionId, ...parsed.map((scenario) => scenario.scenarioId)];
  if (new Set(ids).size !== ids.length) throw new TypeError("Session and scenario UUIDs must be unique.");
  return {
    session: {
      sessionId,
      previewDeploymentId: boundedText(input.previewDeploymentId, "previewDeploymentId", 200),
      protectedAliasUrl: protectedAlias(input.protectedAliasUrl),
      webGitSha,
      workerGitSha
    },
    scenarios: SCENARIO_KINDS.map((kind) => byKind.get(kind)!)
  };
}

function parseBeginScenario(sessionId: string, value: unknown): CreateReportV4AcceptanceScenarioInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("begin scenario must be an object.");
  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "success") {
    const allowed = candidate.faultSourceId === undefined
      ? ["scenarioId", "kind", "faultQuestionId"]
      : ["scenarioId", "kind", "faultQuestionId", "faultSourceId"];
    const input = strictRecord(value, allowed, "success scenario");
    const base = { sessionId, scenarioId: uuid(input.scenarioId, "scenarioId"), kind: "success" as const,
      faultKind: "independent_source_read_failure" as const, faultQuestionId: boundedText(input.faultQuestionId, "faultQuestionId", 500), expectedFaultOccurrences: 1 as const };
    return input.faultSourceId === undefined ? base : { ...base, faultSourceId: boundedText(input.faultSourceId, "faultSourceId", 500) };
  }
  const input = strictRecord(value, ["scenarioId", "kind", "faultQuestionId"], "failure scenario");
  const base = { sessionId, scenarioId: uuid(input.scenarioId, "scenarioId"), faultQuestionId: boundedText(input.faultQuestionId, "faultQuestionId", 500) };
  if (input.kind === "diagnosis_failure") return { ...base, kind: "diagnosis_failure", faultKind: "diagnosis_failure", expectedFaultOccurrences: 2 };
  if (input.kind === "question_failure") return { ...base, kind: "question_failure", faultKind: "question_failure", expectedFaultOccurrences: 2 };
  throw new TypeError("The Report V4 acceptance scenario kind is not recognized.");
}

function parseSimpleBinding(value: unknown, field: "sourceId" | "preAdmissionJobId") {
  const input = strictRecord(value, ["sessionId", "scenarioId", field], field);
  return {
    base: { sessionId: uuid(input.sessionId, "sessionId"), scenarioId: uuid(input.scenarioId, "scenarioId") },
    value: boundedText(input[field], field, 500)
  };
}

function parseLineage(value: unknown): BindReportV4AcceptanceScenarioInput {
  const fields = ["sessionId", "scenarioId", "reportId", "orderId", "preAdmissionJobId", "coreJobId", "enhancementJobId",
    "siteSnapshotId", "configSnapshotId", "questionSetId", "coreArtifactRevisionId", "enhancementArtifactRevisionId"];
  const input = strictRecord(value, fields, "lineage");
  const text = (field: string) => boundedText(input[field], field, 500);
  return {
    sessionId: uuid(input.sessionId, "sessionId"),
    scenarioId: uuid(input.scenarioId, "scenarioId"),
    reportId: text("reportId"),
    orderId: text("orderId"),
    preAdmissionJobId: text("preAdmissionJobId"),
    coreJobId: text("coreJobId"),
    enhancementJobId: nullableText(input.enhancementJobId, "enhancementJobId"),
    siteSnapshotId: text("siteSnapshotId"),
    configSnapshotId: text("configSnapshotId"),
    questionSetId: text("questionSetId"),
    coreArtifactRevisionId: text("coreArtifactRevisionId"),
    enhancementArtifactRevisionId: nullableText(input.enhancementArtifactRevisionId, "enhancementArtifactRevisionId")
  };
}

function parseScenarioTerminalization(value: unknown): TerminalizeReportV4AcceptanceScenarioInput {
  const input = strictRecord(value, ["sessionId", "scenarioId", "baselineFingerprint", "finalFingerprint"], "scenario terminalization");
  return {
    sessionId: uuid(input.sessionId, "sessionId"),
    scenarioId: uuid(input.scenarioId, "scenarioId"),
    baselineFingerprint: sha256(input.baselineFingerprint, "baselineFingerprint"),
    finalFingerprint: sha256(input.finalFingerprint, "finalFingerprint")
  };
}

function parseSessionReference(value: unknown): string {
  return uuid(strictRecord(value, ["sessionId"], "session reference").sessionId, "sessionId");
}

function strictRecord(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input);
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key)) || fields.some((field) => !(field in input))) {
    throw new TypeError(`${label} fields must match the strict contract.`);
  }
  return input;
}

function boundedText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > maximum) {
    throw new TypeError(`${field} must be a bounded nonblank trimmed string.`);
  }
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : boundedText(value, field, 500);
}

function uuid(value: unknown, field: string): string {
  const result = boundedText(value, field, 36);
  if (!UUID_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase UUID.`);
  return result;
}

function gitSha(value: unknown, field: string): string {
  const result = boundedText(value, field, 40);
  if (!GIT_SHA_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase full Git SHA.`);
  return result;
}

function sha256(value: unknown, field: string): string {
  const result = boundedText(value, field, 64);
  if (!HASH_PATTERN.test(result)) throw new TypeError(`${field} must be a lowercase SHA-256 hash.`);
  return result;
}

function protectedAlias(value: unknown): string {
  const raw = boundedText(value, "protectedAliasUrl", 2_000);
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new TypeError("protectedAliasUrl must be a canonical HTTPS origin.");
  }
  return url.origin;
}

async function main(): Promise<number> {
  try {
    const [action, payloadJson] = process.argv.slice(2);
    if (!action || !payloadJson) throw new TypeError("Usage: report-v4-acceptance-operator <action> '<json-payload>'");
    const payload: unknown = JSON.parse(payloadJson);
    const operator = createReportV4AcceptanceOperator(createProductionReportV4AcceptanceLedgerRepository(process.env), process.env);
    process.stdout.write(`${JSON.stringify(await operator.execute(action, payload))}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Report V4 acceptance operator failed.";
    process.stderr.write(`Report V4 acceptance operator failed: ${message}\n`);
    return 1;
  } finally {
    await closeDatabase();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();

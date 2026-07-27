import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { closeDatabase, ensureDatabase, getSqlClient } from "../db";
import {
  assertReportV4AcceptanceAuthorityCaptureOrder,
  assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction,
  type PersistedReportV4AcceptanceAuthorityPhaseSnapshot,
  type ReportV4AcceptanceCompleteAuthorityPhasePayload
} from "../db/report-v4-acceptance-authority-phase-snapshot";
import type { ReportV4CommerceAuthoritySnapshotTransactionSql } from "../db/report-v4-commerce-authority-snapshot";
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
import { computeReportV4AcceptanceFaultProvenanceBaselineFingerprint } from "../report-v4/report-v4-acceptance-fingerprints";
import {
  compareReportV4CommerceAuthoritySnapshots,
  type ReportV4CommerceAuthorityComparison
} from "../report-v4/report-v4-commerce-authority-comparator";
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

interface ReportV4AcceptanceSealAuthorityPair {
  readonly baseline: PersistedReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly final: PersistedReportV4AcceptanceAuthorityPhaseSnapshot;
  readonly sessionWorkerGitSha: string;
  readonly sessionState: "collecting" | "sealed" | "failed";
  readonly scenarioState: "collecting" | "sealed" | "failed";
  readonly scenarioKind: ReportV4AcceptanceScenario["kind"];
}

export interface ReportV4AcceptanceOperatorTestOnlyDependencies {
  readonly loadSealAuthorityPair: (input: TerminalizeReportV4AcceptanceScenarioInput) => Promise<ReportV4AcceptanceSealAuthorityPair>;
  readonly sealScenarioAtomically?: (input: TerminalizeReportV4AcceptanceScenarioInput) => Promise<void>;
  readonly assertCompleteAuthorityPhase: (payload: unknown) => asserts payload is ReportV4AcceptanceCompleteAuthorityPhasePayload;
  readonly assertCaptureOrder: typeof assertReportV4AcceptanceAuthorityCaptureOrder;
  readonly compareCommerce: typeof compareReportV4CommerceAuthoritySnapshots;
}

export function createReportV4AcceptanceOperator(
  store: ReportV4AcceptanceLedgerStore,
  environment: NodeJS.ProcessEnv = process.env,
  testOnlyDependencies?: ReportV4AcceptanceOperatorTestOnlyDependencies
): ReportV4AcceptanceOperator {
  if (testOnlyDependencies && environment.NODE_ENV !== "test") {
    throw new Error("Report V4 acceptance operator dependency injection is test-only.");
  }
  const sealAuthority = testOnlyDependencies ?? productionSealAuthorityDependencies;
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
          const scenario = await terminalizeScenarioIdempotently(ledger, input, target, sealAuthority);
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
  target: "sealed" | "failed",
  sealAuthority: ReportV4AcceptanceOperatorTestOnlyDependencies
): Promise<ReportV4AcceptanceScenario> {
  const matches = (await ledger.loadScenarios(input.sessionId)).filter((scenario) => (
    scenario.sessionId === input.sessionId && scenario.scenarioId === input.scenarioId
  ));
  if (matches.length !== 1) throw new Error("The exact Report V4 acceptance scenario was not found.");
  const existing = matches[0]!;
  const expectedBaselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(existing);
  if (input.baselineFingerprint !== expectedBaselineFingerprint) {
    throw new Error("The Report V4 acceptance scenario baseline fingerprint does not match its exact persisted fault provenance.");
  }
  if (target === "sealed" && sealAuthority.sealScenarioAtomically) {
    await sealAuthority.sealScenarioAtomically(input);
    return loadExactTerminalScenario(ledger, input, target);
  }
  if (target === "sealed") await assertAtomicSealAuthority(input, existing, sealAuthority);
  if (existing.state === target) {
    if (existing.baselineFingerprint === input.baselineFingerprint && existing.finalFingerprint === input.finalFingerprint) return existing;
    throw new Error("The terminal Report V4 acceptance scenario fingerprint conflicts with this command.");
  }
  if (existing.state !== "collecting") throw new Error(`The Report V4 acceptance scenario is already ${existing.state}; terminal state conflicts cannot be swallowed.`);
  return target === "sealed" ? ledger.sealScenario(input) : ledger.failScenario(input);
}

async function loadExactTerminalScenario(
  ledger: ReportV4AcceptanceLedgerStore,
  input: TerminalizeReportV4AcceptanceScenarioInput,
  target: "sealed"
): Promise<ReportV4AcceptanceScenario> {
  const matches = (await ledger.loadScenarios(input.sessionId)).filter((scenario) => (
    scenario.sessionId === input.sessionId && scenario.scenarioId === input.scenarioId
  ));
  const scenario = matches.length === 1 ? matches[0] : undefined;
  if (!scenario || scenario.state !== target || scenario.baselineFingerprint !== input.baselineFingerprint
      || scenario.finalFingerprint !== input.finalFingerprint) {
    throw new Error("The atomic Report V4 acceptance seal did not produce its exact durable terminal result.");
  }
  return scenario;
}

async function assertAtomicSealAuthority(
  input: TerminalizeReportV4AcceptanceScenarioInput,
  scenario: ReportV4AcceptanceScenario,
  dependencies: ReportV4AcceptanceOperatorTestOnlyDependencies
): Promise<void> {
  const pair = await dependencies.loadSealAuthorityPair(input);
  assertPersistedSealPair(input, pair, dependencies);

  if (pair.scenarioKind !== scenario.kind) {
    throw new Error("The seal authority scenario lineage drifted from the acceptance ledger.");
  }
  if (pair.sessionState !== "collecting" && pair.sessionState !== "sealed") {
    throw new Error("The seal authority session is not collecting or sealed.");
  }
  if (pair.scenarioState !== scenario.state || (scenario.state !== "collecting" && scenario.state !== "sealed")) {
    throw new Error("The seal authority scenario state drifted from the acceptance ledger.");
  }
}

function assertPersistedSealPair(
  input: TerminalizeReportV4AcceptanceScenarioInput,
  pair: ReportV4AcceptanceSealAuthorityPair,
  dependencies: Pick<ReportV4AcceptanceOperatorTestOnlyDependencies, "assertCompleteAuthorityPhase" | "assertCaptureOrder" | "compareCommerce">
): void {
  dependencies.assertCompleteAuthorityPhase(pair.baseline.payload);
  dependencies.assertCompleteAuthorityPhase(pair.final.payload);
  dependencies.assertCaptureOrder(pair.baseline.payload, pair.final.payload);

  if (pair.baseline.sessionId !== input.sessionId || pair.final.sessionId !== input.sessionId
      || pair.baseline.scenarioId !== input.scenarioId || pair.final.scenarioId !== input.scenarioId
      || pair.baseline.phase !== "baseline" || pair.final.phase !== "final") {
    throw new Error("The seal authority pair does not match the exact requested session and scenario.");
  }
  if (pair.baseline.payload.scenarioKind !== pair.scenarioKind
      || pair.final.payload.scenarioKind !== pair.scenarioKind) {
    throw new Error("The persisted seal authority phase lineage is inconsistent.");
  }
  if (pair.baseline.workerGitSha !== pair.final.workerGitSha
      || pair.final.workerGitSha !== pair.sessionWorkerGitSha) {
    throw new Error("The seal authority baseline, final, and session Worker SHA must match exactly.");
  }
  if (pair.baseline.commerceFingerprint !== pair.baseline.payload.commerce.fingerprint
      || pair.final.commerceFingerprint !== pair.final.payload.commerce.fingerprint) {
    throw new Error("The persisted seal authority commerce fingerprint does not match its complete payload.");
  }

  const comparison = dependencies.compareCommerce({
    baseline: pair.baseline.payload.commerce,
    final: pair.final.payload.commerce,
    scenarioKind: pair.scenarioKind
  });
  assertVerifiedCommerceComparison(comparison);
  if (input.finalFingerprint !== pair.final.commerceFingerprint
      || input.finalFingerprint !== pair.final.payload.commerce.fingerprint
      || input.finalFingerprint !== comparison.finalFingerprint) {
    throw new Error("The seal command final fingerprint does not match the exact final commerce authority.");
  }
}

function assertVerifiedCommerceComparison(comparison: ReportV4CommerceAuthorityComparison): void {
  if (!comparison.valid || comparison.violations.length !== 0
      || !Object.values(comparison.verified).every((verified) => verified)) {
    throw new Error("The Report V4 commerce authority comparison is not fully valid and verified.");
  }
}

const productionSealValidationDependencies = {
  assertCompleteAuthorityPhase: assertReportV4AcceptanceCompleteAuthorityPhasePayload,
  assertCaptureOrder: assertReportV4AcceptanceAuthorityCaptureOrder,
  compareCommerce: compareReportV4CommerceAuthoritySnapshots
};

const productionSealAuthorityDependencies: ReportV4AcceptanceOperatorTestOnlyDependencies = {
  loadSealAuthorityPair: loadProductionSealAuthorityPair,
  sealScenarioAtomically: sealProductionScenarioAtomically,
  ...productionSealValidationDependencies
};

async function sealProductionScenarioAtomically(input: TerminalizeReportV4AcceptanceScenarioInput): Promise<void> {
  await ensureDatabase();
  await getSqlClient().begin("isolation level repeatable read read write", async (tx) => {
    const sessionRows = await tx.unsafe(`/* report-v4-operator:atomic-seal-session-lock */
      SELECT worker_git_sha,state,head_sequence,head_hash,event_count
      FROM report_v4_acceptance_sessions WHERE id=$1 FOR UPDATE`, [input.sessionId]);
    if (sessionRows.length !== 1) throw new Error("The exact atomic seal session authority was not found.");
    const scenarioRows = await tx.unsafe(`/* report-v4-operator:atomic-seal-scenario-lock */
      SELECT id,session_id,report_id,order_id,pre_admission_job_id,core_job_id,enhancement_job_id,
        site_snapshot_id,config_snapshot_id,question_set_id,core_artifact_revision_id,enhancement_artifact_revision_id,
        kind,fault_kind,fault_question_id,fault_source_id,expected_fault_occurrences,
        baseline_fingerprint,final_fingerprint,state,created_at,terminal_at
      FROM report_v4_acceptance_scenarios WHERE session_id=$1 AND id=$2 FOR UPDATE`,
    [input.sessionId, input.scenarioId]);
    if (scenarioRows.length !== 1) throw new Error("The exact atomic seal scenario authority was not found.");

    const session = sessionRows[0]!;
    const scenario = scenarioRows[0]!;
    const lockedScenario = parseLockedAcceptanceScenario(scenario);
    const lockedBaselineFingerprint = computeReportV4AcceptanceFaultProvenanceBaselineFingerprint(lockedScenario);
    if (lockedBaselineFingerprint !== input.baselineFingerprint) {
      throw new Error("The locked Report V4 acceptance scenario fault-provenance baseline does not match this seal command.");
    }
    const baseline = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, { ...input, phase: "baseline" });
    const final = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, { ...input, phase: "final" });
    if (!baseline || !final) throw new Error("Atomic sealing requires the exact persisted baseline and final authority phase rows.");
    const pair: ReportV4AcceptanceSealAuthorityPair = {
      baseline,
      final,
      sessionWorkerGitSha: parseAuthorityGitSha(session.worker_git_sha),
      sessionState: parseAuthorityState(session.state, "session"),
      scenarioState: lockedScenario.state,
      scenarioKind: lockedScenario.kind
    };
    assertPersistedSealPair(input, pair, productionSealValidationDependencies);
    await assertExactPostFinalCommerceEventRange(tx, input, final, session);
    if (pair.sessionState !== "collecting" && pair.sessionState !== "sealed") {
      throw new Error("Atomic sealing requires a collecting or sealed acceptance session.");
    }

    if (pair.scenarioState === "sealed") {
      if (lockedScenario.baselineFingerprint !== input.baselineFingerprint || lockedScenario.finalFingerprint !== input.finalFingerprint) {
        throw new Error("The sealed Report V4 acceptance scenario fingerprint conflicts with this command.");
      }
      return;
    }
    if (pair.sessionState !== "collecting" || pair.scenarioState !== "collecting") {
      throw new Error("Atomic sealing requires an exact collecting session and scenario.");
    }
    const updated = await tx.unsafe(`/* report-v4-operator:atomic-seal-cas */
      UPDATE report_v4_acceptance_scenarios
      SET state='sealed',baseline_fingerprint=$3,final_fingerprint=$4,terminal_at=clock_timestamp()
      WHERE session_id=$1 AND id=$2 AND state='collecting'
        AND baseline_fingerprint IS NULL AND final_fingerprint IS NULL
      RETURNING state,baseline_fingerprint,final_fingerprint`,
    [input.sessionId, input.scenarioId, input.baselineFingerprint, input.finalFingerprint]);
    if (updated.length !== 1 || updated[0]!.state !== "sealed"
        || updated[0]!.baseline_fingerprint !== input.baselineFingerprint
        || updated[0]!.final_fingerprint !== input.finalFingerprint) {
      throw new Error("The atomic Report V4 acceptance scenario seal CAS failed.");
    }
  });
}

async function assertExactPostFinalCommerceEventRange(
  tx: ReportV4CommerceAuthoritySnapshotTransactionSql,
  input: TerminalizeReportV4AcceptanceScenarioInput,
  final: PersistedReportV4AcceptanceAuthorityPhaseSnapshot,
  session: Record<string, unknown>
): Promise<void> {
  const liveHeadSequence = nonnegativeAuthorityInteger(session.head_sequence, "head_sequence");
  const liveEventCount = nonnegativeAuthorityInteger(session.event_count, "event_count");
  const rows = await tx.unsafe(`/* report-v4-operator:post-final-commerce-event-range */
    SELECT idempotency_key,session_id,scenario_id,sequence,kind,operation,unit_id,attempt,phase,
      details,details_canonical,prev_hash,event_hash,occurred_at,occurred_at_canonical,
      to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') recomputed_occurred_at_canonical
    FROM report_v4_acceptance_events
    WHERE session_id=$1 AND sequence>$2 ORDER BY sequence`,
  [input.sessionId, final.payload.session.headSequence]);
  assertReportV4AcceptanceAtomicSealEventRangeForTestOnly({
    sessionId: input.sessionId, scenarioId: input.scenarioId,
    finalHeadSequence: final.payload.session.headSequence, finalHeadHash: final.payload.session.headHash,
    finalCommerceFingerprint: final.commerceFingerprint, liveHeadSequence,
    liveHeadHash: parseAuthorityHash(session.head_hash, "head_hash"), liveEventCount, rows,
  });
}

export interface ReportV4AcceptanceAtomicSealEventRangeTestInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly finalHeadSequence: number;
  readonly finalHeadHash: string;
  readonly finalCommerceFingerprint: string;
  readonly liveHeadSequence: number;
  readonly liveHeadHash: string;
  readonly liveEventCount: number;
  readonly rows: readonly Record<string, unknown>[];
}

export function assertReportV4AcceptanceAtomicSealEventRangeForTestOnly(
  input: ReportV4AcceptanceAtomicSealEventRangeTestInput
): void {
  if (input.liveHeadSequence !== input.liveEventCount || input.liveHeadSequence <= input.finalHeadSequence
      || input.rows.length !== input.liveHeadSequence - input.finalHeadSequence) {
    throw new Error("The locked live acceptance head/count does not match the exact post-final global range.");
  }
  let previousHash = parseAuthorityHash(input.finalHeadHash, "final phase head_hash");
  let commerceFound = false;
  for (const [index, row] of input.rows.entries()) {
    const sequence = input.finalHeadSequence + index + 1;
    const sessionId = uuid(row.session_id, "post-final event session_id");
    const scenarioId = uuid(row.scenario_id, "post-final event scenario_id");
    const actualSequence = nonnegativeAuthorityInteger(row.sequence, "post-final event sequence");
    const kind = boundedText(row.kind, "post-final event kind", 100);
    const operation = boundedText(row.operation, "post-final event operation", 100);
    const unitId = boundedText(row.unit_id, "post-final event unit_id", 500);
    const attempt = nonnegativeAuthorityInteger(row.attempt, "post-final event attempt");
    const phase = boundedText(row.phase, "post-final event phase", 100);
    const detailsCanonical = boundedText(row.details_canonical, "post-final details_canonical", 100_000);
    const detailsValue = typeof row.details === "string" ? JSON.parse(row.details) as unknown : row.details;
    if (semanticJson(JSON.parse(detailsCanonical)) !== semanticJson(detailsValue)) {
      throw new Error("A post-final event details canonical form does not match its payload.");
    }
    if (sessionId !== input.sessionId || actualSequence !== sequence || attempt > 2
        || parseAuthorityHash(row.prev_hash, "post-final event prev_hash") !== previousHash) {
      throw new Error("The post-final global event range is not contiguous from the final phase head.");
    }
    const expectedIdempotencyKey = sha256Parts([sessionId, scenarioId, kind, operation, unitId, String(attempt), phase]);
    if (parseAuthorityHash(row.idempotency_key, "post-final event idempotency_key") !== expectedIdempotencyKey) {
      throw new Error("A post-final global event idempotency key is invalid.");
    }
    const occurredAtCanonical = boundedText(row.occurred_at_canonical, "post-final occurred_at_canonical", 27);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(occurredAtCanonical)
        || row.recomputed_occurred_at_canonical !== occurredAtCanonical
        || lockedDate(row.occurred_at, "post-final occurred_at").toISOString() !== `${occurredAtCanonical.slice(0, 23)}Z`) {
      throw new Error("A post-final global event timestamp canonical form is invalid.");
    }
    const expectedEventHash = sha256Parts([previousHash, expectedIdempotencyKey, String(sequence), kind, operation,
      unitId, String(attempt), phase, detailsCanonical, occurredAtCanonical]);
    const eventHash = parseAuthorityHash(row.event_hash, "post-final event_hash");
    if (eventHash !== expectedEventHash) throw new Error("The post-final global event hash chain is invalid.");

    if (scenarioId === input.scenarioId) {
      if (commerceFound) throw new Error("A current-scenario event exists after commerce-final.");
      if (kind !== "commerce_fingerprint" || operation !== "commerce" || unitId !== "commerce-final"
          || attempt !== 0 || phase !== "observed") {
        throw new Error("The first current-scenario event after the final phase is not the exact commerce-final authority.");
      }
      const details = strictRecord(detailsValue, ["fingerprint"], "post-final commerce event details");
      const fingerprint = parseAuthorityHash(details.fingerprint, "post-final commerce fingerprint");
      const expectedDetailsCanonical = `{"fingerprint": "${fingerprint}"}`;
      if (fingerprint !== input.finalCommerceFingerprint || detailsCanonical !== expectedDetailsCanonical) {
        throw new Error("The first current-scenario event after the final phase is not the exact commerce-final authority.");
      }
      commerceFound = true;
    }
    previousHash = eventHash;
  }
  if (!commerceFound) throw new Error("The exact post-final commerce fingerprint event is missing.");
  if (previousHash !== parseAuthorityHash(input.liveHeadHash, "live head_hash")) {
    throw new Error("The locked live acceptance head hash does not match the exact global event tail.");
  }
}

function sha256Parts(parts: readonly string[]): string {
  return createHash("sha256").update(parts.join("\x1f")).digest("hex");
}

function semanticJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Post-final event details contain a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(semanticJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${semanticJson(child)}`).join(",")}}`;
  throw new Error("Post-final event details are not JSON-compatible.");
}

async function loadProductionSealAuthorityPair(
  input: TerminalizeReportV4AcceptanceScenarioInput
): Promise<ReportV4AcceptanceSealAuthorityPair> {
  await ensureDatabase();
  return getSqlClient().begin("isolation level repeatable read read only", async (tx) => {
    const authorityRows = await tx.unsafe(`/* report-v4-operator:atomic-seal-authority */
      SELECT sessions.worker_git_sha,sessions.state session_state,
        scenarios.state scenario_state,scenarios.kind scenario_kind
      FROM report_v4_acceptance_sessions sessions
      JOIN report_v4_acceptance_scenarios scenarios
        ON scenarios.session_id=sessions.id AND scenarios.id=$2
      WHERE sessions.id=$1`, [input.sessionId, input.scenarioId]);
    if (authorityRows.length !== 1) throw new Error("The exact seal session/scenario authority was not found.");
    const baseline = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, { ...input, phase: "baseline" });
    const final = await loadPersistedReportV4AcceptanceAuthorityPhaseSnapshotInTransaction(tx, { ...input, phase: "final" });
    if (!baseline || !final) throw new Error("Sealing requires the exact persisted baseline and final authority phase rows.");
    const row = authorityRows[0]!;
    const pair: ReportV4AcceptanceSealAuthorityPair = {
      baseline,
      final,
      sessionWorkerGitSha: parseAuthorityGitSha(row.worker_git_sha),
      sessionState: parseAuthorityState(row.session_state, "session"),
      scenarioState: parseAuthorityState(row.scenario_state, "scenario"),
      scenarioKind: parseAuthorityScenarioKind(row.scenario_kind)
    };
    // Keep every durable seal check inside the same PostgreSQL RR/RO authority boundary.
    assertPersistedSealPair(input, pair, productionSealAuthorityDependencies);
    return pair;
  });
}

function parseAuthorityGitSha(value: unknown): string {
  if (typeof value !== "string" || !GIT_SHA_PATTERN.test(value)) throw new Error("The seal authority session Worker SHA is invalid.");
  return value;
}

function parseAuthorityHash(value: unknown, label: string): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`The seal authority ${label} is invalid.`);
  return value;
}

function nonnegativeAuthorityInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`The seal authority ${label} is invalid.`);
  }
  return value;
}

function parseAuthorityState(value: unknown, label: string): "collecting" | "sealed" | "failed" {
  if (value !== "collecting" && value !== "sealed" && value !== "failed") throw new Error(`The seal authority ${label} state is invalid.`);
  return value;
}

function parseAuthorityScenarioKind(value: unknown): ReportV4AcceptanceScenario["kind"] {
  if (value !== "success" && value !== "diagnosis_failure" && value !== "question_failure") {
    throw new Error("The seal authority scenario kind is invalid.");
  }
  return value;
}

function parseLockedAcceptanceScenario(row: Record<string, unknown>): ReportV4AcceptanceScenario {
  const kind = parseAuthorityScenarioKind(row.kind);
  const expectedFaultOccurrences = row.expected_fault_occurrences;
  if (expectedFaultOccurrences !== 1 && expectedFaultOccurrences !== 2) {
    throw new Error("The locked acceptance scenario expected fault occurrence count is invalid.");
  }
  const faultKind = row.fault_kind;
  if (faultKind !== "independent_source_read_failure" && faultKind !== "diagnosis_failure" && faultKind !== "question_failure") {
    throw new Error("The locked acceptance scenario fault kind is invalid.");
  }
  return {
    sessionId: uuid(row.session_id, "locked session_id"),
    scenarioId: uuid(row.id, "locked scenario id"),
    reportId: lockedNullableText(row.report_id, "report_id"),
    orderId: lockedNullableText(row.order_id, "order_id"),
    preAdmissionJobId: lockedNullableText(row.pre_admission_job_id, "pre_admission_job_id"),
    coreJobId: lockedNullableText(row.core_job_id, "core_job_id"),
    enhancementJobId: lockedNullableText(row.enhancement_job_id, "enhancement_job_id"),
    siteSnapshotId: lockedNullableText(row.site_snapshot_id, "site_snapshot_id"),
    configSnapshotId: lockedNullableText(row.config_snapshot_id, "config_snapshot_id"),
    questionSetId: lockedNullableText(row.question_set_id, "question_set_id"),
    coreArtifactRevisionId: lockedNullableText(row.core_artifact_revision_id, "core_artifact_revision_id"),
    enhancementArtifactRevisionId: lockedNullableText(row.enhancement_artifact_revision_id, "enhancement_artifact_revision_id"),
    kind,
    faultKind,
    faultQuestionId: boundedText(row.fault_question_id, "locked fault_question_id", 500),
    faultSourceId: lockedNullableText(row.fault_source_id, "fault_source_id"),
    expectedFaultOccurrences,
    baselineFingerprint: lockedNullableHash(row.baseline_fingerprint, "baseline_fingerprint"),
    finalFingerprint: lockedNullableHash(row.final_fingerprint, "final_fingerprint"),
    state: parseAuthorityState(row.state, "scenario"),
    createdAt: lockedDate(row.created_at, "created_at"),
    terminalAt: row.terminal_at === null ? null : lockedDate(row.terminal_at, "terminal_at")
  };
}

function lockedNullableText(value: unknown, label: string): string | null {
  return value === null ? null : boundedText(value, `locked ${label}`, 500);
}

function lockedNullableHash(value: unknown, label: string): string | null {
  return value === null ? null : parseAuthorityHash(value, label);
}

function lockedDate(value: unknown, label: string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : typeof value === "string" ? new Date(value) : new Date(Number.NaN);
  if (!Number.isFinite(date.getTime())) throw new Error(`The locked acceptance scenario ${label} is invalid.`);
  return date;
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

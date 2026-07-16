import { createHash } from "node:crypto";
import type postgres from "postgres";
import {
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput,
  type ReportV4DiagnosisInput,
  type ReportV4DiagnosisOutput
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

const INITIALIZE_FIELDS = new Set([
  "reportId", "enhancementJobId", "coreArtifactRevisionId", "configSnapshotId",
  "questionSetId", "snapshotId", "checkpoints"
]);
const CHECKPOINT_FIELDS = new Set(["ordinal", "questionId", "diagnosisInput"]);
const SOURCE_AUDIT_FIELDS = new Set(["questionId", "sourceId", "canonicalUrl", "status", "summary"]);

export type ReportV4DiagnosisCheckpointOrdinal = 1 | 2 | 3;
export type ReportV4DiagnosisCheckpointState = "queued" | "running" | "completed" | "failed";

export interface ReportV4DiagnosisSourceAudit {
  readonly questionId: string;
  readonly sourceId: string;
  readonly canonicalUrl: string;
  readonly status: "available" | "inaccessible";
  readonly summary?: string;
}

export interface ReportV4DiagnosisRunLineage {
  readonly reportId: string;
  readonly enhancementJobId: string;
  readonly coreArtifactRevisionId: string;
  readonly configSnapshotId: string;
  readonly questionSetId: string;
  readonly snapshotId: string;
}

export interface ReportV4DiagnosisQuestionBinding extends ReportV4DiagnosisRunLineage {
  readonly questionId: string;
  readonly ordinal: ReportV4DiagnosisCheckpointOrdinal;
}

export interface ReportV4DiagnosisCheckpointInput {
  readonly questionId: string;
  readonly ordinal: ReportV4DiagnosisCheckpointOrdinal;
  readonly diagnosisInput: unknown;
}

export interface InitializeReportV4DiagnosisCheckpointsInput extends ReportV4DiagnosisRunLineage {
  readonly checkpoints: readonly [
    ReportV4DiagnosisCheckpointInput,
    ReportV4DiagnosisCheckpointInput,
    ReportV4DiagnosisCheckpointInput
  ];
}

export interface ReportV4DiagnosisCheckpointRow extends ReportV4DiagnosisQuestionBinding {
  readonly identityHash: string;
  readonly state: ReportV4DiagnosisCheckpointState;
  readonly inputIdentityHash: string;
  readonly providerCallCount: 0 | 1 | 2;
  readonly sourceAuditPayload: unknown;
  readonly diagnosisPayload: unknown | null;
  readonly diagnosisContentHash: string | null;
}

export interface ReportV4DiagnosisCheckpoint extends ReportV4DiagnosisQuestionBinding {
  readonly identityHash: string;
  readonly state: ReportV4DiagnosisCheckpointState;
  readonly inputIdentityHash: string;
  readonly providerCallCount: 0 | 1 | 2;
  readonly sourceAudits: readonly ReportV4DiagnosisSourceAudit[];
  readonly diagnosis: ReportV4DiagnosisOutput | null;
  readonly diagnosisContentHash: string | null;
}

export interface StartReportV4DiagnosisAttemptInput {
  readonly identityHash: string;
  readonly expectedProviderCallCount: 0 | 1 | 2;
  readonly diagnosisInput: unknown;
  readonly sourceAudits: unknown;
}

export interface CompleteReportV4DiagnosisInput {
  readonly identityHash: string;
  readonly providerCallCount: 1 | 2;
  readonly diagnosisInput: unknown;
  readonly diagnosis: unknown;
}

export interface FailReportV4DiagnosisInput {
  readonly identityHash: string;
  readonly providerCallCount: 0 | 1 | 2;
  readonly diagnosisInput: unknown;
}

export type ReportV4DiagnosisCompositionItem =
  | {
      readonly ordinal: ReportV4DiagnosisCheckpointOrdinal;
      readonly questionId: string;
      readonly state: "completed";
      readonly diagnosis: ReportV4DiagnosisOutput;
    }
  | {
      readonly ordinal: ReportV4DiagnosisCheckpointOrdinal;
      readonly questionId: string;
      readonly state: "failed";
      readonly diagnosis: null;
    };

export interface ReportV4DiagnosisCheckpointRepository {
  initialize(input: InitializeReportV4DiagnosisCheckpointsInput): Promise<readonly [
    ReportV4DiagnosisCheckpoint,
    ReportV4DiagnosisCheckpoint,
    ReportV4DiagnosisCheckpoint
  ]>;
  startAttempt(input: StartReportV4DiagnosisAttemptInput): Promise<ReportV4DiagnosisCheckpoint>;
  complete(input: CompleteReportV4DiagnosisInput): Promise<ReportV4DiagnosisCheckpoint>;
  markFailed(input: FailReportV4DiagnosisInput): Promise<ReportV4DiagnosisCheckpoint>;
  loadForEnhancementComposition(input: InitializeReportV4DiagnosisCheckpointsInput): Promise<readonly [
    ReportV4DiagnosisCompositionItem,
    ReportV4DiagnosisCompositionItem,
    ReportV4DiagnosisCompositionItem
  ]>;
}

export interface ReportV4DiagnosisCheckpointTransaction {
  lockBinding(binding: ReportV4DiagnosisQuestionBinding): Promise<boolean>;
  listByEnhancementJob(enhancementJobId: string): Promise<ReportV4DiagnosisCheckpointRow[]>;
  findByIdentity(identityHash: string, lock: boolean): Promise<ReportV4DiagnosisCheckpointRow | null>;
  insert(row: ReportV4DiagnosisCheckpointRow): Promise<void>;
  updateAttempt(
    identityHash: string,
    expectedProviderCallCount: 0 | 1,
    nextProviderCallCount: 1 | 2,
    sourceAudits: readonly ReportV4DiagnosisSourceAudit[]
  ): Promise<ReportV4DiagnosisCheckpointRow | null>;
  updateCompleted(
    identityHash: string,
    providerCallCount: 1 | 2,
    diagnosis: ReportV4DiagnosisOutput,
    diagnosisContentHash: string
  ): Promise<ReportV4DiagnosisCheckpointRow | null>;
  updateFailed(identityHash: string, providerCallCount: 0 | 1 | 2): Promise<ReportV4DiagnosisCheckpointRow | null>;
}

export interface ReportV4DiagnosisCheckpointStore {
  transaction<T>(work: (tx: ReportV4DiagnosisCheckpointTransaction) => Promise<T>): Promise<T>;
}

export interface ReportV4DiagnosisCheckpointMemorySeed {
  readonly bindings?: readonly ReportV4DiagnosisQuestionBinding[];
  readonly checkpoints?: readonly ReportV4DiagnosisCheckpointRow[];
}

export interface ReportV4DiagnosisCheckpointSql {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4DiagnosisCheckpointSqlValue[]
  ): Promise<T[]>;
}
export type ReportV4DiagnosisCheckpointSqlValue = string | number | boolean | Date | null;
export interface ReportV4DiagnosisCheckpointPostgresDatabase {
  transaction<T>(work: (sql: ReportV4DiagnosisCheckpointSql) => Promise<T>): Promise<T>;
}

export function createReportV4DiagnosisCheckpointRepository(
  store: ReportV4DiagnosisCheckpointStore = createPostgresReportV4DiagnosisCheckpointStore()
): ReportV4DiagnosisCheckpointRepository {
  return {
    initialize: (input) => initializeWithStore(input, store),
    startAttempt: (input) => startAttemptWithStore(input, store),
    complete: (input) => completeWithStore(input, store),
    markFailed: (input) => failWithStore(input, store),
    loadForEnhancementComposition: (input) => loadCompositionWithStore(input, store)
  };
}

export function createMemoryReportV4DiagnosisCheckpointStore(
  seed: ReportV4DiagnosisCheckpointMemorySeed = {}
): ReportV4DiagnosisCheckpointStore {
  const bindings = new Set((seed.bindings ?? []).map(bindingKey));
  const checkpoints = new Map((seed.checkpoints ?? []).map((row) => [row.identityHash, clone(row)]));
  let tail: Promise<void> = Promise.resolve();
  const tx: ReportV4DiagnosisCheckpointTransaction = {
    async lockBinding(binding) {
      return bindings.has(bindingKey(binding));
    },
    async listByEnhancementJob(enhancementJobId) {
      return [...checkpoints.values()]
        .filter((row) => row.enhancementJobId === enhancementJobId)
        .sort((left, right) => left.ordinal - right.ordinal)
        .map(clone);
    },
    async findByIdentity(identityHash) {
      const row = checkpoints.get(identityHash);
      return row ? clone(row) : null;
    },
    async insert(row) {
      if (!checkpoints.has(row.identityHash)) checkpoints.set(row.identityHash, clone(row));
    },
    async updateAttempt(identityHash, expected, next, sourceAudits) {
      const row = checkpoints.get(identityHash);
      if (!row || row.providerCallCount !== expected
        || (expected === 0 ? row.state !== "queued" : row.state !== "running")) return null;
      const updated: ReportV4DiagnosisCheckpointRow = {
        ...row, state: "running", providerCallCount: next, sourceAuditPayload: clone(sourceAudits)
      };
      checkpoints.set(identityHash, updated);
      return clone(updated);
    },
    async updateCompleted(identityHash, providerCallCount, diagnosis, diagnosisContentHash) {
      const row = checkpoints.get(identityHash);
      if (!row || row.state !== "running" || row.providerCallCount !== providerCallCount) return null;
      const updated: ReportV4DiagnosisCheckpointRow = {
        ...row, state: "completed", diagnosisPayload: clone(diagnosis), diagnosisContentHash
      };
      checkpoints.set(identityHash, updated);
      return clone(updated);
    },
    async updateFailed(identityHash, providerCallCount) {
      const row = checkpoints.get(identityHash);
      if (!row || row.providerCallCount !== providerCallCount || (row.state !== "queued" && row.state !== "running")) return null;
      const updated: ReportV4DiagnosisCheckpointRow = { ...row, state: "failed" };
      checkpoints.set(identityHash, updated);
      return clone(updated);
    }
  };
  return {
    transaction<T>(work: (transaction: ReportV4DiagnosisCheckpointTransaction) => Promise<T>): Promise<T> {
      const run = tail.then(() => work(tx));
      tail = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

export function createReportV4DiagnosisCheckpointPostgresDatabase(
  sql: Pick<postgres.Sql, "begin">
): ReportV4DiagnosisCheckpointPostgresDatabase {
  return {
    async transaction(work) {
      const envelope = await sql.begin(async (tx) => ({ value: await work(adaptPostgresSql(tx)) }));
      return envelope.value;
    }
  };
}

export function createPostgresReportV4DiagnosisCheckpointStore(
  database: ReportV4DiagnosisCheckpointPostgresDatabase = livePostgresDatabase()
): ReportV4DiagnosisCheckpointStore {
  return { transaction: (work) => database.transaction((sql) => work(postgresTransaction(sql))) };
}

interface Candidate {
  readonly binding: ReportV4DiagnosisQuestionBinding;
  readonly input: ReportV4DiagnosisInput;
  readonly inputIdentityHash: string;
  readonly identityHash: string;
  readonly row: ReportV4DiagnosisCheckpointRow;
}

async function initializeWithStore(
  inputValue: InitializeReportV4DiagnosisCheckpointsInput,
  store: ReportV4DiagnosisCheckpointStore
): Promise<readonly [ReportV4DiagnosisCheckpoint, ReportV4DiagnosisCheckpoint, ReportV4DiagnosisCheckpoint]> {
  const candidates = buildCandidates(inputValue);
  return store.transaction(async (tx) => {
    for (const candidate of candidates) await requireBinding(tx, candidate.binding);
    const existing = await tx.listByEnhancementJob(candidates[0].binding.enhancementJobId);
    if (existing.length !== 0 && existing.length !== 3) {
      throw new Error("Partial V4 diagnosis checkpoint initialization is forbidden; exactly zero or three rows are required.");
    }
    if (existing.length === 0) {
      for (const candidate of candidates) await tx.insert(candidate.row);
    }
    const loaded = await tx.listByEnhancementJob(candidates[0].binding.enhancementJobId);
    if (loaded.length !== 3) throw new Error("V4 diagnosis checkpoint initialization must resolve exactly three rows.");
    const parsed = candidates.map((candidate, index) => {
      const checkpoint = parseRow(loaded[index]!, candidate.input);
      assertExactCheckpoint(checkpoint, candidate);
      return checkpoint;
    });
    return deepFreeze(parsed) as unknown as readonly [
      ReportV4DiagnosisCheckpoint, ReportV4DiagnosisCheckpoint, ReportV4DiagnosisCheckpoint
    ];
  });
}

async function startAttemptWithStore(
  input: StartReportV4DiagnosisAttemptInput,
  store: ReportV4DiagnosisCheckpointStore
): Promise<ReportV4DiagnosisCheckpoint> {
  const identityHash = sha256(input.identityHash, "identityHash");
  const expectedProviderCallCount = input.expectedProviderCallCount;
  if (expectedProviderCallCount !== 0 && expectedProviderCallCount !== 1) {
    throw new TypeError("A V4 diagnosis permits one initial provider call and at most one local retry.");
  }
  const diagnosisInput = parseReportV4DiagnosisInput(input.diagnosisInput);
  const inputIdentityHash = hashStableJson(diagnosisInput);
  const sourceAudits = parseSourceAudits(input.sourceAudits, diagnosisInput, false);
  const next = expectedProviderCallCount + 1 as 1 | 2;
  return store.transaction(async (tx) => {
    const raw = await tx.findByIdentity(identityHash, true);
    if (!raw) throw new Error("The V4 diagnosis checkpoint does not exist.");
    const current = parseRow(raw, diagnosisInput);
    if (current.inputIdentityHash !== inputIdentityHash) throw new Error("V4 diagnosis question/source/answer input lineage drift was detected.");
    if (current.state === "running" && current.providerCallCount === next) {
      if (stableJson(current.sourceAudits) !== stableJson(sourceAudits)) {
        throw new Error("V4 diagnosis source-audit lineage drift violates exact retry idempotency.");
      }
      return current;
    }
    if (current.state === "completed" || current.state === "failed") {
      throw new Error("A terminal V4 diagnosis checkpoint is immutable.");
    }
    if (current.providerCallCount !== expectedProviderCallCount) {
      throw new Error("V4 diagnosis provider attempt state changed concurrently.");
    }
    if (current.providerCallCount === 1 && stableJson(current.sourceAudits) !== stableJson(sourceAudits)) {
      throw new Error("A V4 diagnosis retry must preserve the exact source-audit lineage.");
    }
    const updated = await tx.updateAttempt(identityHash, expectedProviderCallCount, next, sourceAudits);
    if (!updated) throw new Error("V4 diagnosis provider attempt state changed concurrently.");
    return parseRow(updated, diagnosisInput);
  });
}

async function completeWithStore(
  input: CompleteReportV4DiagnosisInput,
  store: ReportV4DiagnosisCheckpointStore
): Promise<ReportV4DiagnosisCheckpoint> {
  const identityHash = sha256(input.identityHash, "identityHash");
  if (input.providerCallCount !== 1 && input.providerCallCount !== 2) {
    throw new TypeError("A completed V4 diagnosis requires one or two provider calls.");
  }
  const diagnosisInput = parseReportV4DiagnosisInput(input.diagnosisInput);
  const diagnosis = parseReportV4DiagnosisOutput(input.diagnosis, diagnosisInput);
  const diagnosisContentHash = hashStableJson(diagnosis);
  return store.transaction(async (tx) => {
    const raw = await tx.findByIdentity(identityHash, true);
    if (!raw) throw new Error("The V4 diagnosis checkpoint does not exist.");
    const current = parseRow(raw, diagnosisInput);
    if (current.state === "completed") {
      if (current.providerCallCount === input.providerCallCount
        && current.diagnosisContentHash === diagnosisContentHash
        && stableJson(current.diagnosis) === stableJson(diagnosis)) return current;
      throw new Error("Terminal V4 diagnosis drift violates immutable exact idempotency.");
    }
    if (current.state === "failed") throw new Error("A terminal V4 diagnosis checkpoint is immutable.");
    if (current.state !== "running" || current.providerCallCount !== input.providerCallCount) {
      throw new Error("V4 diagnosis completion does not match the exact local attempt state.");
    }
    const updated = await tx.updateCompleted(identityHash, input.providerCallCount, diagnosis, diagnosisContentHash);
    if (!updated) throw new Error("V4 diagnosis completion state changed concurrently.");
    return parseRow(updated, diagnosisInput);
  });
}

async function failWithStore(
  input: FailReportV4DiagnosisInput,
  store: ReportV4DiagnosisCheckpointStore
): Promise<ReportV4DiagnosisCheckpoint> {
  const identityHash = sha256(input.identityHash, "identityHash");
  if (![0, 1, 2].includes(input.providerCallCount)) throw new TypeError("providerCallCount must be between zero and two.");
  const diagnosisInput = parseReportV4DiagnosisInput(input.diagnosisInput);
  return store.transaction(async (tx) => {
    const raw = await tx.findByIdentity(identityHash, true);
    if (!raw) throw new Error("The V4 diagnosis checkpoint does not exist.");
    const current = parseRow(raw, diagnosisInput);
    if (current.state === "failed" && current.providerCallCount === input.providerCallCount) return current;
    if (current.state === "completed" || current.state === "failed") throw new Error("A terminal V4 diagnosis checkpoint is immutable.");
    if (current.providerCallCount !== input.providerCallCount) throw new Error("V4 diagnosis failure does not match the exact local attempt state.");
    const updated = await tx.updateFailed(identityHash, input.providerCallCount);
    if (!updated) throw new Error("V4 diagnosis failure state changed concurrently.");
    return parseRow(updated, diagnosisInput);
  });
}

async function loadCompositionWithStore(
  inputValue: InitializeReportV4DiagnosisCheckpointsInput,
  store: ReportV4DiagnosisCheckpointStore
): Promise<readonly [ReportV4DiagnosisCompositionItem, ReportV4DiagnosisCompositionItem, ReportV4DiagnosisCompositionItem]> {
  const candidates = buildCandidates(inputValue);
  return store.transaction(async (tx) => {
    for (const candidate of candidates) await requireBinding(tx, candidate.binding);
    const rows = await tx.listByEnhancementJob(candidates[0].binding.enhancementJobId);
    if (rows.length !== 3) throw new Error("Enhancement composition requires exactly three terminal V4 diagnosis checkpoints; partial load is forbidden.");
    const composition = candidates.map((candidate, index) => {
      const checkpoint = parseRow(rows[index]!, candidate.input);
      assertExactCheckpoint(checkpoint, candidate);
      if (checkpoint.state !== "completed" && checkpoint.state !== "failed") {
        throw new Error("Enhancement composition requires exactly three terminal V4 diagnosis checkpoints; queued or running partial load is forbidden.");
      }
      if (checkpoint.state === "completed") {
        if (!checkpoint.diagnosis) throw new Error("A completed V4 diagnosis checkpoint is missing its strict diagnosis output.");
        return deepFreeze({
          ordinal: checkpoint.ordinal,
          questionId: checkpoint.questionId,
          state: "completed" as const,
          diagnosis: checkpoint.diagnosis
        });
      }
      return deepFreeze({
        ordinal: checkpoint.ordinal,
        questionId: checkpoint.questionId,
        state: "failed" as const,
        diagnosis: null
      });
    });
    return deepFreeze(composition) as unknown as readonly [
      ReportV4DiagnosisCompositionItem, ReportV4DiagnosisCompositionItem, ReportV4DiagnosisCompositionItem
    ];
  });
}

async function requireBinding(
  tx: ReportV4DiagnosisCheckpointTransaction,
  binding: ReportV4DiagnosisQuestionBinding
): Promise<void> {
  if (!await tx.lockBinding(binding)) {
    throw new Error("The exact V4 active core, enhancement job, configuration, snapshot and question binding is missing.");
  }
}

function buildCandidates(inputValue: InitializeReportV4DiagnosisCheckpointsInput): readonly [Candidate, Candidate, Candidate] {
  const input = strictObject(inputValue, "V4 diagnosis checkpoint initialization", INITIALIZE_FIELDS);
  if (!Array.isArray(input.checkpoints) || input.checkpoints.length !== 3) {
    throw new TypeError("V4 diagnosis checkpoint initialization requires exactly three ordered questions.");
  }
  const lineage: ReportV4DiagnosisRunLineage = {
    reportId: boundedText(input.reportId, "reportId", 500),
    enhancementJobId: boundedText(input.enhancementJobId, "enhancementJobId", 500),
    coreArtifactRevisionId: boundedText(input.coreArtifactRevisionId, "coreArtifactRevisionId", 500),
    configSnapshotId: boundedText(input.configSnapshotId, "configSnapshotId", 500),
    questionSetId: boundedText(input.questionSetId, "questionSetId", 500),
    snapshotId: boundedText(input.snapshotId, "snapshotId", 500)
  };
  const questionIds = new Set<string>();
  const candidates = input.checkpoints.map((value, index) => {
    const checkpoint = strictObject(value, `checkpoints[${index}]`, CHECKPOINT_FIELDS);
    const ordinal = diagnosisOrdinal(checkpoint.ordinal);
    if (ordinal !== index + 1) throw new TypeError("V4 diagnosis checkpoints must preserve ordered ordinals 1, 2, 3.");
    const questionId = boundedText(checkpoint.questionId, `checkpoints[${index}].questionId`, 500);
    if (questionIds.has(questionId)) throw new TypeError("V4 diagnosis checkpoint questionId values must be unique; duplicate question detected.");
    questionIds.add(questionId);
    const diagnosisInput = parseReportV4DiagnosisInput(checkpoint.diagnosisInput);
    if (diagnosisInput.question.questionId !== questionId) {
      throw new TypeError("V4 diagnosis checkpoint question input does not match its exact questionId lineage.");
    }
    const binding = deepFreeze({ ...lineage, questionId, ordinal });
    const inputIdentityHash = hashStableJson(diagnosisInput);
    const identityHash = hashStableJson({ ...binding, inputIdentityHash });
    return deepFreeze({
      binding,
      input: diagnosisInput,
      inputIdentityHash,
      identityHash,
      row: {
        ...binding,
        identityHash,
        state: "queued" as const,
        inputIdentityHash,
        providerCallCount: 0 as const,
        sourceAuditPayload: [],
        diagnosisPayload: null,
        diagnosisContentHash: null
      }
    });
  });
  return candidates as unknown as readonly [Candidate, Candidate, Candidate];
}

function parseRow(row: ReportV4DiagnosisCheckpointRow, input: ReportV4DiagnosisInput): ReportV4DiagnosisCheckpoint {
  const binding: ReportV4DiagnosisQuestionBinding = deepFreeze({
    reportId: boundedText(row.reportId, "checkpoint.reportId", 500),
    enhancementJobId: boundedText(row.enhancementJobId, "checkpoint.enhancementJobId", 500),
    coreArtifactRevisionId: boundedText(row.coreArtifactRevisionId, "checkpoint.coreArtifactRevisionId", 500),
    configSnapshotId: boundedText(row.configSnapshotId, "checkpoint.configSnapshotId", 500),
    questionSetId: boundedText(row.questionSetId, "checkpoint.questionSetId", 500),
    snapshotId: boundedText(row.snapshotId, "checkpoint.snapshotId", 500),
    questionId: boundedText(row.questionId, "checkpoint.questionId", 500),
    ordinal: diagnosisOrdinal(row.ordinal)
  });
  if (binding.questionId !== input.question.questionId) throw new Error("Persisted V4 diagnosis checkpoint question lineage drift was detected.");
  const identityHash = sha256(row.identityHash, "checkpoint.identityHash");
  const inputIdentityHash = sha256(row.inputIdentityHash, "checkpoint.inputIdentityHash");
  if (inputIdentityHash !== hashStableJson(input)) throw new Error("V4 diagnosis question/source/answer input lineage drift was detected.");
  if (identityHash !== hashStableJson({ ...binding, inputIdentityHash })) throw new Error("Persisted V4 diagnosis checkpoint identity drift was detected.");
  const state = diagnosisState(row.state);
  const providerCallCount = diagnosisCallCount(row.providerCallCount);
  const sourceAudits = parseSourceAudits(
    jsonValue(row.sourceAuditPayload), input,
    state === "queued" || (state === "failed" && providerCallCount === 0)
  );
  const diagnosis = row.diagnosisPayload == null ? null : parseReportV4DiagnosisOutput(jsonValue(row.diagnosisPayload), input);
  const diagnosisContentHash = row.diagnosisContentHash == null ? null : sha256(row.diagnosisContentHash, "checkpoint.diagnosisContentHash");
  if (state === "queued" && (providerCallCount !== 0 || sourceAudits.length || diagnosis || diagnosisContentHash)) {
    throw new Error("Queued V4 diagnosis checkpoint payload is inconsistent.");
  }
  if (state === "running" && (providerCallCount < 1 || diagnosis || diagnosisContentHash)) {
    throw new Error("Running V4 diagnosis checkpoint payload is inconsistent.");
  }
  if (state === "completed" && (providerCallCount < 1 || !diagnosis || !diagnosisContentHash
    || diagnosisContentHash !== hashStableJson(diagnosis))) {
    throw new Error("Completed V4 diagnosis checkpoint payload or content hash is inconsistent.");
  }
  if (state === "failed" && (diagnosis || diagnosisContentHash)) {
    throw new Error("Failed V4 diagnosis checkpoint cannot retain diagnosis output.");
  }
  return deepFreeze({
    ...binding, identityHash, state, inputIdentityHash, providerCallCount,
    sourceAudits, diagnosis, diagnosisContentHash
  });
}

function assertExactCheckpoint(checkpoint: ReportV4DiagnosisCheckpoint, candidate: Candidate): void {
  if (checkpoint.identityHash !== candidate.identityHash || checkpoint.inputIdentityHash !== candidate.inputIdentityHash) {
    throw new Error("V4 diagnosis checkpoint immutable identity or idempotency drift was detected.");
  }
  for (const field of [
    "reportId", "enhancementJobId", "coreArtifactRevisionId", "configSnapshotId",
    "questionSetId", "snapshotId", "questionId", "ordinal"
  ] as const) {
    if (checkpoint[field] !== candidate.binding[field]) {
      throw new Error(`V4 diagnosis checkpoint ${field} lineage drift was detected.`);
    }
  }
}

function parseSourceAudits(
  value: unknown,
  input: ReportV4DiagnosisInput,
  allowEmpty: boolean
): readonly ReportV4DiagnosisSourceAudit[] {
  if (!Array.isArray(value) || value.length > 5) throw new TypeError("V4 diagnosis source audits must be an array of at most five rows.");
  if (value.length === 0 && allowEmpty) return Object.freeze([]);
  if (value.length !== input.sources.length) throw new TypeError("V4 diagnosis source audits must preserve every exact question-owned source.");
  const byId = new Map<string, ReportV4DiagnosisSourceAudit>();
  for (const [index, auditValue] of value.entries()) {
    const audit = strictObject(auditValue, `sourceAudits[${index}]`, SOURCE_AUDIT_FIELDS);
    const questionId = boundedText(audit.questionId, `sourceAudits[${index}].questionId`, 500);
    const sourceId = boundedText(audit.sourceId, `sourceAudits[${index}].sourceId`, 500);
    const canonicalUrl = httpUrl(audit.canonicalUrl, `sourceAudits[${index}].canonicalUrl`);
    const status = audit.status;
    if (status !== "available" && status !== "inaccessible") throw new TypeError(`sourceAudits[${index}].status is invalid.`);
    if (byId.has(sourceId)) throw new TypeError("V4 diagnosis source audit sourceId values must be unique.");
    const summary = audit.summary === undefined ? undefined : boundedText(audit.summary, `sourceAudits[${index}].summary`, 5_000);
    if (status === "inaccessible" && summary !== undefined) throw new TypeError("An inaccessible V4 diagnosis source audit cannot retain a summary.");
    byId.set(sourceId, deepFreeze({ questionId, sourceId, canonicalUrl, status, ...(summary ? { summary } : {}) }));
  }
  const ordered = input.sources.map((source) => {
    const audit = byId.get(source.sourceId);
    if (!audit || audit.questionId !== input.question.questionId || audit.canonicalUrl !== source.canonicalUrl
      || audit.status !== source.retrievalStatus) {
      throw new Error("V4 diagnosis source audit does not match the exact question/source retrieval lineage.");
    }
    return audit;
  });
  return deepFreeze(ordered);
}

function livePostgresDatabase(): ReportV4DiagnosisCheckpointPostgresDatabase {
  return {
    async transaction(work) {
      await ensureDatabase();
      return createReportV4DiagnosisCheckpointPostgresDatabase(getSqlClient()).transaction(work);
    }
  };
}

function adaptPostgresSql(tx: postgres.TransactionSql): ReportV4DiagnosisCheckpointSql {
  return async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4DiagnosisCheckpointSqlValue[]
  ): Promise<T[]> => [...await tx<T[]>(strings, ...values)];
}

function postgresTransaction(sql: ReportV4DiagnosisCheckpointSql): ReportV4DiagnosisCheckpointTransaction {
  return {
    async lockBinding(binding) {
      const rows = await sql`
        SELECT question.id
        FROM scan_jobs enhancement
        JOIN scan_reports report ON report.id=enhancement.report_id
        JOIN report_artifact_revisions core ON core.id=${binding.coreArtifactRevisionId}
        JOIN report_v4_config_snapshots config ON config.id=${binding.configSnapshotId}
        JOIN scan_jobs core_job ON core_job.id=core.job_id
        JOIN report_v4_site_snapshots snapshot ON snapshot.id=${binding.snapshotId}
        JOIN report_business_question_sets question_set ON question_set.id=${binding.questionSetId}
        JOIN report_business_questions question ON question.id=${binding.questionId}
        WHERE enhancement.id=${binding.enhancementJobId} AND enhancement.report_id=${binding.reportId}
          AND enhancement.tier='deep' AND enhancement.product_contract='recommendation_forensics_v1'
          AND enhancement.fulfillment_methodology='two_stage_geo_report_v4'
          AND enhancement.recommendation_report_version=4 AND enhancement.artifact_contract='combined_geo_report_v4'
          AND enhancement.reason='v4_diagnosis_enhancement' AND enhancement.credit_reservation_id IS NULL
          AND enhancement.business_question_set_id=${binding.questionSetId}
          AND report.active_artifact_revision_id=core.id
          AND core.report_id=${binding.reportId} AND core.config_snapshot_id=config.id
          AND core.revision_kind='generation' AND core.artifact_contract='combined_geo_report_v4'
          AND core.status='active' AND core.source_artifact_revision_id IS NULL
          AND config.report_id=${binding.reportId} AND config.core_job_id=core_job.id
          AND core_job.report_id=${binding.reportId} AND core_job.site_snapshot_id=snapshot.id
          AND core_job.tier='deep' AND core_job.product_contract='recommendation_forensics_v1'
          AND core_job.fulfillment_methodology='two_stage_geo_report_v4'
          AND core_job.recommendation_report_version=4 AND core_job.artifact_contract='combined_geo_report_v4'
          AND core_job.reason='standard'
          AND core_job.business_question_set_id=${binding.questionSetId}
          AND snapshot.report_id=${binding.reportId} AND snapshot.status IN ('completed','completed_limited')
          AND question_set.report_id=${binding.reportId} AND question_set.status='locked'
          AND question.question_set_id=question_set.id AND question.ordinal=${binding.ordinal}
        FOR UPDATE OF enhancement,report,core,config,core_job,snapshot,question_set,question
      `;
      if (rows.length > 1) throw new Error("The exact V4 diagnosis binding returned multiple rows.");
      return rows.length === 1;
    },
    async listByEnhancementJob(enhancementJobId) {
      const rows = await sql`
        SELECT * FROM report_v4_diagnosis_checkpoints
        WHERE enhancement_job_id=${enhancementJobId} ORDER BY ordinal
      `;
      return rows.map(postgresRow);
    },
    async findByIdentity(identityHash, lock) {
      const rows = lock
        ? await sql`SELECT * FROM report_v4_diagnosis_checkpoints WHERE identity_hash=${identityHash} FOR UPDATE`
        : await sql`SELECT * FROM report_v4_diagnosis_checkpoints WHERE identity_hash=${identityHash}`;
      if (rows.length > 1) throw new Error("The V4 diagnosis identity returned multiple checkpoint rows.");
      return rows[0] ? postgresRow(rows[0]) : null;
    },
    async insert(row) {
      await sql`
        INSERT INTO report_v4_diagnosis_checkpoints (
          identity_hash,report_id,enhancement_job_id,core_artifact_revision_id,config_snapshot_id,
          question_set_id,question_id,snapshot_id,ordinal,state,input_identity_hash,provider_call_count,
          source_audit_payload,diagnosis_payload,diagnosis_content_hash
        ) VALUES (
          ${row.identityHash},${row.reportId},${row.enhancementJobId},${row.coreArtifactRevisionId},${row.configSnapshotId},
          ${row.questionSetId},${row.questionId},${row.snapshotId},${row.ordinal},'queued',${row.inputIdentityHash},0,
          '[]'::jsonb,NULL,NULL
        ) ON CONFLICT (identity_hash) DO NOTHING
      `;
    },
    async updateAttempt(identityHash, expected, next, sourceAudits) {
      const expectedState = expected === 0 ? "queued" : "running";
      const rows = await sql`
        UPDATE report_v4_diagnosis_checkpoints
        SET state='running',provider_call_count=${next},source_audit_payload=${stableJson(sourceAudits)}::text::jsonb,
          updated_at=clock_timestamp()
        WHERE identity_hash=${identityHash} AND state=${expectedState} AND provider_call_count=${expected}
        RETURNING *
      `;
      return rows[0] ? postgresRow(rows[0]) : null;
    },
    async updateCompleted(identityHash, providerCallCount, diagnosis, diagnosisContentHash) {
      const rows = await sql`
        UPDATE report_v4_diagnosis_checkpoints
        SET state='completed',diagnosis_payload=${stableJson(diagnosis)}::text::jsonb,
          diagnosis_content_hash=${diagnosisContentHash},updated_at=clock_timestamp()
        WHERE identity_hash=${identityHash} AND state='running' AND provider_call_count=${providerCallCount}
        RETURNING *
      `;
      return rows[0] ? postgresRow(rows[0]) : null;
    },
    async updateFailed(identityHash, providerCallCount) {
      const rows = await sql`
        UPDATE report_v4_diagnosis_checkpoints SET state='failed',updated_at=clock_timestamp()
        WHERE identity_hash=${identityHash} AND state IN ('queued','running') AND provider_call_count=${providerCallCount}
        RETURNING *
      `;
      return rows[0] ? postgresRow(rows[0]) : null;
    }
  };
}

function postgresRow(row: Record<string, unknown>): ReportV4DiagnosisCheckpointRow {
  return {
    identityHash: String(row.identity_hash),
    reportId: String(row.report_id),
    enhancementJobId: String(row.enhancement_job_id),
    coreArtifactRevisionId: String(row.core_artifact_revision_id),
    configSnapshotId: String(row.config_snapshot_id),
    questionSetId: String(row.question_set_id),
    questionId: String(row.question_id),
    snapshotId: String(row.snapshot_id),
    ordinal: Number(row.ordinal) as ReportV4DiagnosisCheckpointOrdinal,
    state: String(row.state) as ReportV4DiagnosisCheckpointState,
    inputIdentityHash: String(row.input_identity_hash),
    providerCallCount: Number(row.provider_call_count) as 0 | 1 | 2,
    sourceAuditPayload: row.source_audit_payload,
    diagnosisPayload: row.diagnosis_payload,
    diagnosisContentHash: row.diagnosis_content_hash == null ? null : String(row.diagnosis_content_hash)
  };
}

function bindingKey(binding: ReportV4DiagnosisQuestionBinding): string {
  return stableJson(binding);
}

function strictObject(value: unknown, path: string, fields: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).find((key) => !fields.has(key));
  if (unknown) throw new TypeError(`${path} contains unknown field ${unknown}.`);
  return row;
}

function diagnosisOrdinal(value: unknown): ReportV4DiagnosisCheckpointOrdinal {
  const number = Number(value);
  if (number !== 1 && number !== 2 && number !== 3) throw new TypeError("V4 diagnosis ordinal must be 1, 2, or 3.");
  return number;
}

function diagnosisState(value: unknown): ReportV4DiagnosisCheckpointState {
  if (value !== "queued" && value !== "running" && value !== "completed" && value !== "failed") {
    throw new TypeError("V4 diagnosis checkpoint state is invalid.");
  }
  return value;
}

function diagnosisCallCount(value: unknown): 0 | 1 | 2 {
  const number = Number(value);
  if (number !== 0 && number !== 1 && number !== 2) throw new TypeError("V4 diagnosis provider call count must be between zero and two.");
  return number;
}

function boundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty bounded text.`);
  return value.trim();
}

function sha256(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${path} must be a lowercase SHA-256 hash.`);
  return value;
}

function httpUrl(value: unknown, path: string): string {
  const text = boundedText(value, path, 2_000);
  try {
    const url = new URL(text);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error();
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${path} must be an HTTP(S) URL without credentials.`);
  }
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { throw new TypeError("Persisted V4 diagnosis JSON is invalid."); }
}

function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("V4 diagnosis checkpoint identities cannot contain undefined values.");
  return json;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    if (!Object.isFrozen(value)) Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function clone<T>(value: T): T { return structuredClone(value); }

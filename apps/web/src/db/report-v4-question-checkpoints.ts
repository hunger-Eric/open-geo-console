export type ReportV4QuestionCheckpointOrdinal = 1 | 2 | 3;
export type ReportV4QuestionCheckpointState = "queued" | "answering" | "retrying" | "answered" | "unavailable";

export interface ReportV4QuestionCheckpointAnswerPayload {
  readonly order: ReportV4QuestionCheckpointOrdinal;
  readonly questionId: string;
  readonly questionText: string;
  readonly status: "answered";
  readonly answer: string;
}

export interface ReportV4QuestionCheckpointSourcePayload {
  readonly questionId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly citedText: string | null;
  readonly retrievalStatus: "not_checked" | "available" | "inaccessible";
}

export interface ReportV4QuestionCheckpointSeed {
  readonly identityHash: string;
  readonly reportId: string;
  readonly jobId: string;
  readonly questionSetId: string;
  readonly questionId: string;
  readonly snapshotId: string;
  readonly ordinal: ReportV4QuestionCheckpointOrdinal;
  readonly questionIdentityHash: string;
  readonly modelConfigIdentityHash: string;
  readonly inputIdentityHash: string;
}

export interface ReportV4QuestionCheckpoint extends ReportV4QuestionCheckpointSeed {
  readonly state: ReportV4QuestionCheckpointState;
  readonly providerCallCount: 0 | 1 | 2;
  readonly answerPayload: ReportV4QuestionCheckpointAnswerPayload | null;
  readonly sourcePayload: readonly ReportV4QuestionCheckpointSourcePayload[];
  readonly answerContentHash: string | null;
}

export interface ReportV4QuestionCheckpointInitializeInput {
  readonly jobId: string;
  readonly checkpoints: readonly ReportV4QuestionCheckpointSeed[];
}

export interface ReportV4QuestionCheckpointSaveAnsweredInput {
  readonly identityHash: string;
  readonly providerCallCount: 1 | 2;
  readonly answerPayload: ReportV4QuestionCheckpointAnswerPayload;
  readonly sourcePayload: readonly ReportV4QuestionCheckpointSourcePayload[];
  readonly answerContentHash: string;
}

export interface ReportV4QuestionCheckpointRepository {
  initialize(input: ReportV4QuestionCheckpointInitializeInput): Promise<readonly [ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint]>;
  load(jobId: string): Promise<readonly ReportV4QuestionCheckpoint[]>;
  recordProviderCall(input: { readonly identityHash: string; readonly expectedProviderCallCount: number }): Promise<ReportV4QuestionCheckpoint>;
  saveAnswered(input: ReportV4QuestionCheckpointSaveAnsweredInput): Promise<ReportV4QuestionCheckpoint>;
  markUnavailable(input: { readonly identityHash: string; readonly providerCallCount: number }): Promise<ReportV4QuestionCheckpoint>;
}

export interface ReportV4QuestionCheckpointSqlExecutor {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<T[]>;
}

export function createReportV4QuestionCheckpointRepository(
  executor: ReportV4QuestionCheckpointSqlExecutor
): ReportV4QuestionCheckpointRepository {
  return {
    async initialize(input) {
      const checkpoints = orderedSeeds(input);
      for (const checkpoint of checkpoints) {
        await executor`
          INSERT INTO report_v4_question_checkpoints (
            identity_hash, report_id, job_id, question_set_id, question_id, snapshot_id, ordinal, state,
            question_identity_hash, model_config_identity_hash, input_identity_hash, provider_call_count,
            answer_payload, source_payload, answer_content_hash
          ) VALUES (
            ${checkpoint.identityHash}, ${checkpoint.reportId}, ${checkpoint.jobId}, ${checkpoint.questionSetId},
            ${checkpoint.questionId}, ${checkpoint.snapshotId}, ${checkpoint.ordinal}, 'queued',
            ${checkpoint.questionIdentityHash}, ${checkpoint.modelConfigIdentityHash}, ${checkpoint.inputIdentityHash},
            0, NULL, '[]'::jsonb, NULL
          ) ON CONFLICT (identity_hash) DO NOTHING
        `;
      }
      const loaded = await loadJob(executor, input.jobId);
      if (loaded.length !== 3) throw new Error("V4 question checkpoint initialization must resolve exactly three rows.");
      checkpoints.forEach((expected, index) => assertSameIdentity(loaded[index]!, expected));
      return loaded as [ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint, ReportV4QuestionCheckpoint];
    },

    load(jobId) {
      return loadJob(executor, boundedText(jobId, "jobId", 500));
    },

    async recordProviderCall(input) {
      const identityHash = sha256(input.identityHash, "identityHash");
      if (!Number.isInteger(input.expectedProviderCallCount) || input.expectedProviderCallCount < 0 || input.expectedProviderCallCount >= 2) {
        throw new TypeError("A V4 question allows at most two provider attempts.");
      }
      const nextCount = input.expectedProviderCallCount + 1 as 1 | 2;
      const rows = nextCount === 1
        ? await executor<Record<string, unknown>>`
            UPDATE report_v4_question_checkpoints
            SET state='answering', provider_call_count=1, updated_at=clock_timestamp()
            WHERE identity_hash=${identityHash}
              AND state IN ('queued','answering','retrying')
              AND provider_call_count=0
            RETURNING *
          `
        : await executor<Record<string, unknown>>`
            UPDATE report_v4_question_checkpoints
            SET state='retrying', provider_call_count=2, updated_at=clock_timestamp()
            WHERE identity_hash=${identityHash}
              AND state IN ('answering','retrying')
              AND provider_call_count=1
            RETURNING *
          `;
      if (!rows[0]) await throwTransitionConflict(executor, identityHash);
      return parseRow(rows[0]!);
    },

    async saveAnswered(input) {
      const identityHash = sha256(input.identityHash, "identityHash");
      if (input.providerCallCount !== 1 && input.providerCallCount !== 2) throw new TypeError("Answered V4 questions require one or two provider calls.");
      const answerPayload = parseAnswerPayload(input.answerPayload, "$answerPayload");
      const sourcePayload = parseSourcePayload(input.sourcePayload, answerPayload.questionId, "$sourcePayload");
      const answerContentHash = sha256(input.answerContentHash, "answerContentHash");
      const rows = await executor<Record<string, unknown>>`
        UPDATE report_v4_question_checkpoints
        SET state='answered', answer_payload=${JSON.stringify(answerPayload)}::jsonb,
          source_payload=${JSON.stringify(sourcePayload)}::jsonb, answer_content_hash=${answerContentHash},
          updated_at=clock_timestamp()
        WHERE identity_hash=${identityHash}
          AND state IN ('answering','retrying')
          AND provider_call_count=${input.providerCallCount}
        RETURNING *
      `;
      if (!rows[0]) await throwTransitionConflict(executor, identityHash);
      return parseRow(rows[0]!);
    },

    async markUnavailable(input) {
      const identityHash = sha256(input.identityHash, "identityHash");
      if (!Number.isInteger(input.providerCallCount) || input.providerCallCount < 0 || input.providerCallCount > 2) {
        throw new TypeError("providerCallCount must be between zero and two.");
      }
      const rows = await executor<Record<string, unknown>>`
        UPDATE report_v4_question_checkpoints
        SET state='unavailable', answer_payload=NULL, source_payload='[]'::jsonb,
          answer_content_hash=NULL, updated_at=clock_timestamp()
        WHERE identity_hash=${identityHash}
          AND state IN ('queued','answering','retrying')
          AND provider_call_count=${input.providerCallCount}
        RETURNING *
      `;
      if (!rows[0]) await throwTransitionConflict(executor, identityHash);
      return parseRow(rows[0]!);
    }
  };
}

async function loadJob(executor: ReportV4QuestionCheckpointSqlExecutor, jobId: string): Promise<ReportV4QuestionCheckpoint[]> {
  const rows = await executor<Record<string, unknown>>`
    SELECT * FROM report_v4_question_checkpoints WHERE job_id=${jobId} ORDER BY ordinal
  `;
  return rows.map(parseRow);
}

async function throwTransitionConflict(executor: ReportV4QuestionCheckpointSqlExecutor, identityHash: string): Promise<never> {
  const rows = await executor<Record<string, unknown>>`
    SELECT * FROM report_v4_question_checkpoints WHERE identity_hash=${identityHash} LIMIT 1
  `;
  if (!rows[0]) throw new Error("V4 question checkpoint does not exist.");
  const checkpoint = parseRow(rows[0]);
  if (checkpoint.state === "answered" || checkpoint.state === "unavailable") {
    throw new Error("A terminal V4 question checkpoint is immutable.");
  }
  throw new Error("V4 question checkpoint state or provider attempt changed concurrently.");
}

function orderedSeeds(input: ReportV4QuestionCheckpointInitializeInput): readonly [ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed] {
  const jobId = boundedText(input.jobId, "jobId", 500);
  if (input.checkpoints.length !== 3) throw new TypeError("V4 question checkpoints require exactly three ordered seeds.");
  const ids = new Set<string>();
  const identities = new Set<string>();
  const checkpoints = input.checkpoints.map((seed, index) => {
    if (seed.ordinal !== index + 1) throw new TypeError("V4 question checkpoint seeds must preserve ordered ordinals 1, 2, 3.");
    if (seed.jobId !== jobId) throw new TypeError("Every V4 question checkpoint seed must belong to the initialized jobId.");
    const parsed = parseSeed(seed);
    if (ids.has(parsed.questionId) || identities.has(parsed.identityHash)) throw new TypeError("V4 question checkpoint question and identity values must be unique.");
    ids.add(parsed.questionId);
    identities.add(parsed.identityHash);
    return parsed;
  });
  return checkpoints as [ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed, ReportV4QuestionCheckpointSeed];
}

function parseSeed(seed: ReportV4QuestionCheckpointSeed): ReportV4QuestionCheckpointSeed {
  return Object.freeze({
    identityHash: sha256(seed.identityHash, "identityHash"),
    reportId: boundedText(seed.reportId, "reportId", 500),
    jobId: boundedText(seed.jobId, "jobId", 500),
    questionSetId: boundedText(seed.questionSetId, "questionSetId", 500),
    questionId: boundedText(seed.questionId, "questionId", 500),
    snapshotId: boundedText(seed.snapshotId, "snapshotId", 500),
    ordinal: ordinal(seed.ordinal),
    questionIdentityHash: sha256(seed.questionIdentityHash, "questionIdentityHash"),
    modelConfigIdentityHash: sha256(seed.modelConfigIdentityHash, "modelConfigIdentityHash"),
    inputIdentityHash: sha256(seed.inputIdentityHash, "inputIdentityHash")
  });
}

function parseRow(row: Record<string, unknown>): ReportV4QuestionCheckpoint {
  const seed = parseSeed({
    identityHash: row.identity_hash,
    reportId: row.report_id,
    jobId: row.job_id,
    questionSetId: row.question_set_id,
    questionId: row.question_id,
    snapshotId: row.snapshot_id,
    ordinal: row.ordinal,
    questionIdentityHash: row.question_identity_hash,
    modelConfigIdentityHash: row.model_config_identity_hash,
    inputIdentityHash: row.input_identity_hash
  } as ReportV4QuestionCheckpointSeed);
  const state = checkpointState(row.state);
  const providerCallCount = callCount(row.provider_call_count);
  const sourcePayload = parseSourcePayload(jsonValue(row.source_payload), seed.questionId, "$checkpoint.sourcePayload");
  const answerPayload = row.answer_payload == null ? null : parseAnswerPayload(jsonValue(row.answer_payload), "$checkpoint.answerPayload");
  const answerContentHash = row.answer_content_hash == null ? null : sha256(row.answer_content_hash, "answerContentHash");
  if (state === "answered") {
    if (!answerPayload || !answerContentHash || providerCallCount === 0) throw new TypeError("Answered V4 checkpoint payload is incomplete.");
    if (answerPayload.questionId !== seed.questionId || answerPayload.order !== seed.ordinal) throw new TypeError("Answered V4 checkpoint does not own its question payload.");
  } else if (answerPayload || answerContentHash) {
    throw new TypeError("Non-answered V4 checkpoint cannot retain an answer payload or hash.");
  }
  return Object.freeze({ ...seed, state, providerCallCount, answerPayload, sourcePayload, answerContentHash });
}

function parseAnswerPayload(value: unknown, path: string): ReportV4QuestionCheckpointAnswerPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  if (row.status !== "answered") throw new TypeError(`${path}.status must be answered.`);
  return Object.freeze({
    order: ordinal(row.order),
    questionId: boundedText(row.questionId, `${path}.questionId`, 500),
    questionText: boundedText(row.questionText, `${path}.questionText`, 10_000),
    status: "answered" as const,
    answer: boundedText(row.answer, `${path}.answer`, 50_000)
  });
}

function parseSourcePayload(value: unknown, questionId: string, path: string): readonly ReportV4QuestionCheckpointSourcePayload[] {
  if (!Array.isArray(value) || value.length > 5) throw new TypeError(`${path} must contain at most five sources.`);
  const sourceIds = new Set<string>();
  const canonicalUrls = new Set<string>();
  return Object.freeze(value.map((source, index) => {
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError(`${path}[${index}] must be an object.`);
    const row = source as Record<string, unknown>;
    if (row.questionId !== questionId) throw new TypeError(`${path}[${index}] must remain owned by ${questionId}.`);
    const sourceId = boundedText(row.sourceId, `${path}[${index}].sourceId`, 500);
    const canonicalUrl = httpUrl(row.canonicalUrl, `${path}[${index}].canonicalUrl`);
    if (sourceIds.has(sourceId)) throw new TypeError(`${path} contains a duplicate sourceId; sourceId values must be unique.`);
    if (canonicalUrls.has(canonicalUrl)) throw new TypeError(`${path} contains a duplicate canonical URL; source URLs must be unique.`);
    sourceIds.add(sourceId);
    canonicalUrls.add(canonicalUrl);
    return Object.freeze({
      questionId,
      sourceId,
      title: boundedText(row.title, `${path}[${index}].title`, 2_000),
      canonicalUrl,
      citedText: row.citedText == null ? null : boundedText(row.citedText, `${path}[${index}].citedText`, 10_000),
      retrievalStatus: retrievalStatus(row.retrievalStatus, `${path}[${index}].retrievalStatus`)
    });
  }));
}

function assertSameIdentity(actual: ReportV4QuestionCheckpoint, expected: ReportV4QuestionCheckpointSeed): void {
  for (const field of ["identityHash", "reportId", "jobId", "questionSetId", "questionId", "snapshotId", "ordinal", "questionIdentityHash", "modelConfigIdentityHash", "inputIdentityHash"] as const) {
    if (actual[field] !== expected[field]) throw new Error(`V4 question checkpoint ${String(field)} identity mismatch.`);
  }
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new TypeError("V4 checkpoint JSON payload is invalid.");
  }
}

function checkpointState(value: unknown): ReportV4QuestionCheckpointState {
  if (value !== "queued" && value !== "answering" && value !== "retrying" && value !== "answered" && value !== "unavailable") {
    throw new TypeError("V4 question checkpoint state is invalid.");
  }
  return value;
}

function callCount(value: unknown): 0 | 1 | 2 {
  const number = Number(value);
  if (number !== 0 && number !== 1 && number !== 2) throw new TypeError("V4 question provider call count must be between zero and two.");
  return number;
}

function ordinal(value: unknown): ReportV4QuestionCheckpointOrdinal {
  const number = Number(value);
  if (number !== 1 && number !== 2 && number !== 3) throw new TypeError("V4 question ordinal must be 1, 2, or 3.");
  return number;
}

function retrievalStatus(value: unknown, path: string): ReportV4QuestionCheckpointSourcePayload["retrievalStatus"] {
  if (value !== "not_checked" && value !== "available" && value !== "inaccessible") throw new TypeError(`${path} is invalid.`);
  return value;
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
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error("invalid URL");
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${path} must be an HTTP(S) URL without credentials.`);
  }
}

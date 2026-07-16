import { createHash } from "node:crypto";
import type postgres from "postgres";
import {
  REPORT_V4_MAX_TOTAL_SITE_SUMMARY_CHARS,
  parseReportV4PageAnalysisOutput,
  type ReportV4PageSummary
} from "@open-geo-console/ai-report-engine";
import { ensureDatabase, getSqlClient } from "./index";

const INPUT_FIELDS = new Set([
  "reportId", "snapshotId", "pageId", "url", "contentHash", "readability", "sourceLength", "output"
]);
const PAID_SYNTHESIS_STATUSES = new Set(["completed", "completed_limited"]);

export type ReportV4PageSummarySnapshotStatus =
  | "collecting"
  | "completed"
  | "completed_limited"
  | "unavailable"
  | "custom_service";

export interface ReportV4PageSummarySnapshotRow {
  readonly id: string;
  readonly reportId: string;
  readonly status: ReportV4PageSummarySnapshotStatus;
  readonly contentIdentityHash: string | null;
  readonly analyzablePageCount: number;
}

export interface ReportV4SnapshotPageRow {
  readonly id: string;
  readonly snapshotId: string;
  readonly ordinal: number;
  readonly normalizedUrl: string;
  readonly analyzable: boolean;
  readonly readMode: "direct_readable" | "js_dependent" | null;
  readonly retainedCleanedText: string | null;
  readonly contentHash: string | null;
}

export interface ReportV4PageSummaryRow {
  readonly identityHash: string;
  readonly reportId: string;
  readonly snapshotId: string;
  readonly pageId: string;
  readonly contentHash: string;
  readonly sourceLength: number;
  readonly chunks: unknown;
}

export interface PersistReportV4PageSummaryInput {
  readonly reportId: string;
  readonly snapshotId: string;
  readonly pageId: string;
  readonly url: string;
  readonly contentHash: string;
  readonly readability: "direct_readable" | "js_dependent";
  readonly sourceLength: number;
  readonly output: unknown;
}

export interface LoadReportV4PageSummariesInput {
  readonly reportId: string;
  readonly snapshotId: string;
  readonly contentIdentityHash: string;
}

export interface PersistedReportV4PageSummary {
  readonly identityHash: string;
  readonly reportId: string;
  readonly snapshotId: string;
  readonly summary: ReportV4PageSummary;
}

export interface ReportV4PageSummaryLineage {
  readonly snapshot: ReportV4PageSummarySnapshotRow;
  readonly page: ReportV4SnapshotPageRow;
}

export interface ReportV4PageSummaryTransaction {
  lockPage(reportId: string, snapshotId: string, pageId: string): Promise<ReportV4PageSummaryLineage | null>;
  findSnapshot(reportId: string, snapshotId: string): Promise<ReportV4PageSummarySnapshotRow | null>;
  listPages(snapshotId: string): Promise<ReportV4SnapshotPageRow[]>;
  findSummaryByPage(pageId: string): Promise<ReportV4PageSummaryRow | null>;
  listSummaries(snapshotId: string): Promise<ReportV4PageSummaryRow[]>;
  insert(summary: ReportV4PageSummaryRow): Promise<ReportV4PageSummaryRow>;
}

export interface ReportV4PageSummaryStore {
  transaction<T>(work: (tx: ReportV4PageSummaryTransaction) => Promise<T>): Promise<T>;
}

export interface ReportV4PageSummaryRepository {
  persist(input: PersistReportV4PageSummaryInput): Promise<PersistedReportV4PageSummary>;
  loadForWebsiteSynthesis(input: LoadReportV4PageSummariesInput): Promise<readonly ReportV4PageSummary[]>;
}

export interface ReportV4PageSummarySql {
  <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4PageSummarySqlValue[]
  ): Promise<T[]>;
}

export type ReportV4PageSummarySqlValue = string | number | boolean | Date | null;

export interface ReportV4PageSummaryPostgresDatabase {
  transaction<T>(work: (sql: ReportV4PageSummarySql) => Promise<T>): Promise<T>;
}

export interface ReportV4PageSummaryMemorySeed {
  readonly snapshots?: readonly ReportV4PageSummarySnapshotRow[];
  readonly pages?: readonly ReportV4SnapshotPageRow[];
  readonly summaries?: readonly ReportV4PageSummaryRow[];
}

export function createReportV4PageSummaryRepository(
  store: ReportV4PageSummaryStore = createPostgresReportV4PageSummaryStore()
): ReportV4PageSummaryRepository {
  return {
    persist: (input) => persistWithStore(input, store),
    loadForWebsiteSynthesis: (input) => loadWithStore(input, store)
  };
}

export async function persistReportV4PageSummary(
  input: PersistReportV4PageSummaryInput,
  repository: ReportV4PageSummaryRepository = createReportV4PageSummaryRepository()
): Promise<PersistedReportV4PageSummary> {
  return repository.persist(input);
}

export async function loadReportV4PageSummariesForWebsiteSynthesis(
  input: LoadReportV4PageSummariesInput,
  repository: ReportV4PageSummaryRepository = createReportV4PageSummaryRepository()
): Promise<readonly ReportV4PageSummary[]> {
  return repository.loadForWebsiteSynthesis(input);
}

export function createMemoryReportV4PageSummaryStore(
  seed: ReportV4PageSummaryMemorySeed = {}
): ReportV4PageSummaryStore {
  const snapshots = new Map((seed.snapshots ?? []).map((row) => [row.id, clone(row)]));
  const pages = new Map((seed.pages ?? []).map((row) => [row.id, clone(row)]));
  const summaries = new Map((seed.summaries ?? []).map((row) => [row.pageId, clone(row)]));
  let tail: Promise<void> = Promise.resolve();
  const transaction: ReportV4PageSummaryTransaction = {
    async lockPage(reportId, snapshotId, pageId) {
      const snapshot = snapshots.get(snapshotId);
      const page = pages.get(pageId);
      if (!snapshot || snapshot.reportId !== reportId || !page || page.snapshotId !== snapshotId) return null;
      return clone({ snapshot, page });
    },
    async findSnapshot(reportId, snapshotId) {
      const snapshot = snapshots.get(snapshotId);
      return snapshot?.reportId === reportId ? clone(snapshot) : null;
    },
    async listPages(snapshotId) {
      return [...pages.values()].filter((row) => row.snapshotId === snapshotId).map(clone);
    },
    async findSummaryByPage(pageId) {
      const row = summaries.get(pageId);
      return row ? clone(row) : null;
    },
    async listSummaries(snapshotId) {
      return [...summaries.values()].filter((row) => row.snapshotId === snapshotId).map(clone);
    },
    async insert(summary) {
      if (summaries.has(summary.pageId)) throw new Error("V4 page summary insert encountered an immutable page identity conflict.");
      const row = clone(summary);
      summaries.set(row.pageId, row);
      return clone(row);
    }
  };
  return {
    transaction<T>(work: (tx: ReportV4PageSummaryTransaction) => Promise<T>): Promise<T> {
      const run = tail.then(() => work(transaction));
      tail = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

export function createReportV4PageSummaryPostgresDatabase(
  sql: Pick<postgres.Sql, "begin">
): ReportV4PageSummaryPostgresDatabase {
  return {
    async transaction(work) {
      const envelope = await sql.begin(async (tx) => ({ value: await work(adaptPostgresSql(tx)) }));
      return envelope.value;
    }
  };
}

export function createPostgresReportV4PageSummaryStore(
  database: ReportV4PageSummaryPostgresDatabase = livePostgresDatabase()
): ReportV4PageSummaryStore {
  return { transaction: (work) => database.transaction((sql) => work(postgresTransaction(sql))) };
}

async function persistWithStore(
  inputValue: PersistReportV4PageSummaryInput,
  store: ReportV4PageSummaryStore
): Promise<PersistedReportV4PageSummary> {
  const candidate = buildCandidate(inputValue);
  return store.transaction(async (tx) => {
    const lineage = await tx.lockPage(candidate.reportId, candidate.snapshotId, candidate.pageId);
    if (!lineage) throw new Error("The exact V4 terminal snapshot page lineage was not found.");
    const snapshot = parseSnapshot(lineage.snapshot);
    const page = parsePage(lineage.page);
    assertWritableLineage(snapshot, page, candidate);
    const existing = await tx.findSummaryByPage(candidate.pageId);
    if (existing) {
      const parsed = parsePersisted(existing, page);
      assertExactPersisted(parsed, candidate);
      return parsed;
    }
    const inserted = parsePersisted(await tx.insert(candidate.row), page);
    assertExactPersisted(inserted, candidate);
    return inserted;
  });
}

async function loadWithStore(
  input: LoadReportV4PageSummariesInput,
  store: ReportV4PageSummaryStore
): Promise<readonly ReportV4PageSummary[]> {
  const reportId = requiredText(input.reportId, "reportId");
  const snapshotId = requiredText(input.snapshotId, "snapshotId");
  const contentIdentityHash = sha256(input.contentIdentityHash, "snapshot contentIdentityHash");
  return store.transaction(async (tx) => {
    const rawSnapshot = await tx.findSnapshot(reportId, snapshotId);
    if (!rawSnapshot) throw new Error("The exact V4 site snapshot lineage was not found for website synthesis.");
    const snapshot = parseSnapshot(rawSnapshot);
    if (!PAID_SYNTHESIS_STATUSES.has(snapshot.status)) {
      throw new Error("Only completed or completed_limited V4 snapshots are eligible for standard website synthesis.");
    }
    if (snapshot.contentIdentityHash !== contentIdentityHash) {
      throw new Error("The terminal V4 snapshot content lineage has drifted from the exact requested snapshot.");
    }
    const pages = (await tx.listPages(snapshotId)).map(parsePage).sort((left, right) => left.ordinal - right.ordinal);
    const analyzable = pages.filter((page) => page.analyzable);
    if (analyzable.length < 1 || analyzable.length > 50 || analyzable.length !== snapshot.analyzablePageCount) {
      throw new Error("The terminal V4 snapshot analyzable-page lineage count has drifted.");
    }
    assertUnique(analyzable.map(({ id }) => id), "analyzable page id");
    assertUnique(analyzable.map(({ ordinal }) => String(ordinal)), "analyzable page ordinal");
    assertUnique(analyzable.map(({ normalizedUrl }) => normalizedUrl), "analyzable page URL");
    const summaries = await tx.listSummaries(snapshotId);
    const expectedIds = new Set(analyzable.map(({ id }) => id));
    const actualIds = new Set(summaries.map(({ pageId }) => pageId));
    if (summaries.length !== analyzable.length || actualIds.size !== summaries.length
      || [...expectedIds].some((id) => !actualIds.has(id)) || [...actualIds].some((id) => !expectedIds.has(id))) {
      throw new Error("Every analyzable V4 snapshot page must have exactly one summary with no missing or extra rows.");
    }
    const rows = new Map(summaries.map((row) => [row.pageId, row]));
    const parsed = analyzable.map((page) => parsePersisted(rows.get(page.id)!, page));
    for (const persisted of parsed) {
      if (persisted.reportId !== reportId || persisted.snapshotId !== snapshotId) {
        throw new Error("Persisted V4 page-summary terminal lineage drift was detected.");
      }
    }
    assertWebsiteSynthesisBounds(parsed.map(({ summary }) => summary));
    return deepFreeze(parsed.map(({ summary }) => summary));
  });
}

interface Candidate {
  readonly reportId: string;
  readonly snapshotId: string;
  readonly pageId: string;
  readonly summary: ReportV4PageSummary;
  readonly identityHash: string;
  readonly row: ReportV4PageSummaryRow;
}

function buildCandidate(inputValue: PersistReportV4PageSummaryInput): Candidate {
  const input = strictObject(inputValue, "V4 page-summary persistence input", INPUT_FIELDS);
  const reportId = requiredText(input.reportId, "reportId");
  const snapshotId = requiredText(input.snapshotId, "snapshotId");
  const pageId = requiredText(input.pageId, "pageId");
  const summary = parseReportV4PageAnalysisOutput(input.output, {
    pageId,
    url: input.url,
    contentHash: input.contentHash,
    readability: input.readability,
    sourceLength: input.sourceLength
  });
  const identityHash = pageSummaryIdentity(snapshotId, summary);
  return deepFreeze({
    reportId,
    snapshotId,
    pageId,
    summary,
    identityHash,
    row: {
      identityHash,
      reportId,
      snapshotId,
      pageId,
      contentHash: summary.contentHash,
      sourceLength: summary.sourceLength,
      chunks: summary.chunks
    }
  });
}

function assertWritableLineage(
  snapshot: ReportV4PageSummarySnapshotRow,
  page: ReportV4SnapshotPageRow,
  candidate: Candidate
): void {
  if (!PAID_SYNTHESIS_STATUSES.has(snapshot.status) || snapshot.contentIdentityHash === null) {
    throw new Error("A V4 page summary may be persisted only for an exact completed or completed_limited terminal snapshot.");
  }
  if (snapshot.id !== candidate.snapshotId || snapshot.reportId !== candidate.reportId
    || page.id !== candidate.pageId || page.snapshotId !== candidate.snapshotId) {
    throw new Error("The exact V4 snapshot/page/report lineage does not match the persistence request.");
  }
  if (!page.analyzable || page.readMode === null || page.contentHash === null) {
    throw new Error("Only an analyzable V4 snapshot page can receive a hierarchical summary.");
  }
  assertExactRetainedText(page, candidate.summary.sourceLength);
  if (page.readMode !== candidate.summary.readability || page.normalizedUrl !== candidate.summary.url
    || page.contentHash !== candidate.summary.contentHash) {
    throw new Error("The V4 page URL, readability or content identity has drifted from the exact snapshot page.");
  }
}

function assertExactPersisted(actual: PersistedReportV4PageSummary, candidate: Candidate): void {
  if (actual.identityHash !== candidate.identityHash || actual.reportId !== candidate.reportId
    || actual.snapshotId !== candidate.snapshotId || stableJson(actual.summary) !== stableJson(candidate.summary)) {
    throw new Error("V4 page summary drift violates immutable exact idempotency.");
  }
}

function parsePersisted(
  row: ReportV4PageSummaryRow,
  page: ReportV4SnapshotPageRow
): PersistedReportV4PageSummary {
  const identityHash = sha256(row.identityHash, "persisted page summary identityHash");
  const reportId = requiredText(row.reportId, "persisted page summary reportId");
  const snapshotId = requiredText(row.snapshotId, "persisted page summary snapshotId");
  const pageId = requiredText(row.pageId, "persisted page summary pageId");
  const contentHash = sha256(row.contentHash, "persisted page summary contentHash");
  const sourceLength = positiveInteger(row.sourceLength, "persisted page summary sourceLength");
  if (page.id !== pageId || page.snapshotId !== snapshotId || page.contentHash !== contentHash
    || !page.analyzable || page.readMode === null) {
    throw new Error("Persisted V4 page summary no longer matches its exact analyzable snapshot page lineage.");
  }
  assertExactRetainedText(page, sourceLength);
  const summary = parseReportV4PageAnalysisOutput({ chunks: row.chunks }, {
    pageId,
    url: page.normalizedUrl,
    contentHash,
    readability: page.readMode,
    sourceLength
  });
  if (identityHash !== pageSummaryIdentity(snapshotId, summary)) {
    throw new Error("Persisted V4 page summary identity hash does not match its canonical content.");
  }
  return deepFreeze({ identityHash, reportId, snapshotId, summary });
}

function pageSummaryIdentity(snapshotId: string, summary: ReportV4PageSummary): string {
  return createHash("sha256").update(stableJson({
    snapshotId,
    pageId: summary.pageId,
    contentHash: summary.contentHash,
    sourceLength: summary.sourceLength,
    chunks: summary.chunks
  })).digest("hex");
}

function livePostgresDatabase(): ReportV4PageSummaryPostgresDatabase {
  return {
    async transaction(work) {
      await ensureDatabase();
      return createReportV4PageSummaryPostgresDatabase(getSqlClient()).transaction(work);
    }
  };
}

function adaptPostgresSql(tx: postgres.TransactionSql): ReportV4PageSummarySql {
  return async <T extends Record<string, unknown> = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: readonly ReportV4PageSummarySqlValue[]
  ): Promise<T[]> => [...await tx<T[]>(strings, ...values)];
}

function postgresTransaction(sql: ReportV4PageSummarySql): ReportV4PageSummaryTransaction {
  return {
    async lockPage(reportId, snapshotId, pageId) {
      const rows = await sql`
        SELECT snapshot.id AS snapshot_id,snapshot.report_id,snapshot.status AS snapshot_status,
          snapshot.content_identity_hash,snapshot.analyzable_page_count,page.id AS page_id,page.ordinal,page.normalized_url,
          page.analyzable,page.read_mode,page.retained_cleaned_text,page.content_hash
        FROM report_v4_site_snapshots snapshot
        JOIN report_v4_site_snapshot_pages page ON page.snapshot_id=snapshot.id
        WHERE snapshot.id=${snapshotId} AND snapshot.report_id=${reportId} AND page.id=${pageId}
        FOR UPDATE OF snapshot,page
      `;
      if (rows.length > 1) throw new Error("The exact V4 snapshot page lock returned multiple rows.");
      return rows[0] ? postgresLineage(rows[0]) : null;
    },
    async findSnapshot(reportId, snapshotId) {
      const rows = await sql`
        SELECT id,report_id,status,content_identity_hash,analyzable_page_count
        FROM report_v4_site_snapshots WHERE id=${snapshotId} AND report_id=${reportId}
      `;
      if (rows.length > 1) throw new Error("The exact V4 site snapshot query returned multiple rows.");
      return rows[0] ? postgresSnapshot(rows[0]) : null;
    },
    async listPages(snapshotId) {
      const rows = await sql`
        SELECT id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,retained_cleaned_text,content_hash
        FROM report_v4_site_snapshot_pages WHERE snapshot_id=${snapshotId} ORDER BY ordinal,id
      `;
      return rows.map(postgresPage);
    },
    async findSummaryByPage(pageId) {
      const rows = await sql`
        SELECT identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks
        FROM report_v4_page_summaries WHERE page_id=${pageId}
      `;
      if (rows.length > 1) throw new Error("The V4 page summary query returned multiple rows for one page.");
      return rows[0] ? postgresSummary(rows[0]) : null;
    },
    async listSummaries(snapshotId) {
      const rows = await sql`
        SELECT identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks
        FROM report_v4_page_summaries WHERE snapshot_id=${snapshotId} ORDER BY page_id
      `;
      return rows.map(postgresSummary);
    },
    async insert(summary) {
      const rows = await sql`
        INSERT INTO report_v4_page_summaries (
          identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks
        ) VALUES (
          ${summary.identityHash},${summary.reportId},${summary.snapshotId},${summary.pageId},${summary.contentHash},
          ${summary.sourceLength},${stableJson(summary.chunks)}::text::jsonb
        ) ON CONFLICT DO NOTHING
        RETURNING identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks
      `;
      if (rows.length !== 1) throw new Error("V4 page summary insert must affect exactly one row without identity conflict.");
      return postgresSummary(rows[0]!);
    }
  };
}

function postgresLineage(row: Record<string, unknown>): ReportV4PageSummaryLineage {
  return {
    snapshot: postgresSnapshot({
      id: row.snapshot_id,
      report_id: row.report_id,
      status: row.snapshot_status,
      content_identity_hash: row.content_identity_hash,
      analyzable_page_count: row.analyzable_page_count
    }),
    page: postgresPage({
      id: row.page_id,
      snapshot_id: row.snapshot_id,
      ordinal: row.ordinal,
      normalized_url: row.normalized_url,
      analyzable: row.analyzable,
      read_mode: row.read_mode,
      retained_cleaned_text: row.retained_cleaned_text,
      content_hash: row.content_hash
    })
  };
}

function postgresSnapshot(row: Record<string, unknown>): ReportV4PageSummarySnapshotRow {
  return parseSnapshot({
    id: row.id,
    reportId: row.report_id,
    status: row.status,
    contentIdentityHash: row.content_identity_hash,
    analyzablePageCount: row.analyzable_page_count
  });
}

function postgresPage(row: Record<string, unknown>): ReportV4SnapshotPageRow {
  return parsePage({
    id: row.id,
    snapshotId: row.snapshot_id,
    ordinal: row.ordinal,
    normalizedUrl: row.normalized_url,
    analyzable: row.analyzable,
    readMode: row.read_mode,
    retainedCleanedText: row.retained_cleaned_text,
    contentHash: row.content_hash
  });
}

function postgresSummary(row: Record<string, unknown>): ReportV4PageSummaryRow {
  return {
    identityHash: String(row.identity_hash),
    reportId: String(row.report_id),
    snapshotId: String(row.snapshot_id),
    pageId: String(row.page_id),
    contentHash: String(row.content_hash),
    sourceLength: Number(row.source_length),
    chunks: row.chunks
  };
}

function parseSnapshot(row: {
  readonly id: unknown;
  readonly reportId: unknown;
  readonly status: unknown;
  readonly contentIdentityHash: unknown;
  readonly analyzablePageCount: unknown;
}): ReportV4PageSummarySnapshotRow {
  const status = String(row.status);
  if (!["collecting", "completed", "completed_limited", "unavailable", "custom_service"].includes(status)) {
    throw new TypeError("Persisted V4 site snapshot has an invalid status.");
  }
  const analyzablePageCount = nonnegativeInteger(row.analyzablePageCount, "snapshot analyzablePageCount");
  const contentIdentityHash = row.contentIdentityHash == null
    ? null
    : sha256(row.contentIdentityHash, "snapshot contentIdentityHash");
  return deepFreeze({
    id: requiredText(row.id, "snapshot id"),
    reportId: requiredText(row.reportId, "snapshot reportId"),
    status: status as ReportV4PageSummarySnapshotStatus,
    contentIdentityHash,
    analyzablePageCount
  });
}

function parsePage(row: {
  readonly id: unknown;
  readonly snapshotId: unknown;
  readonly ordinal: unknown;
  readonly normalizedUrl: unknown;
  readonly analyzable: unknown;
  readonly readMode: unknown;
  readonly retainedCleanedText: unknown;
  readonly contentHash: unknown;
}): ReportV4SnapshotPageRow {
  const analyzable = row.analyzable === true;
  const readMode = row.readMode == null ? null : String(row.readMode);
  const contentHash = row.contentHash == null ? null : sha256(row.contentHash, "page contentHash");
  if (analyzable && !["direct_readable", "js_dependent"].includes(readMode ?? "")) {
    throw new TypeError("An analyzable V4 snapshot page requires a supported read mode.");
  }
  if (analyzable !== (contentHash !== null) || (!analyzable && readMode !== null)) {
    throw new TypeError("V4 snapshot page analyzability lineage is inconsistent.");
  }
  return deepFreeze({
    id: requiredText(row.id, "page id"),
    snapshotId: requiredText(row.snapshotId, "page snapshotId"),
    ordinal: positiveInteger(row.ordinal, "page ordinal"),
    normalizedUrl: httpUrl(row.normalizedUrl, "page normalizedUrl"),
    analyzable,
    readMode: readMode as ReportV4SnapshotPageRow["readMode"],
    retainedCleanedText: row.retainedCleanedText == null ? null : String(row.retainedCleanedText),
    contentHash
  });
}

function assertExactRetainedText(page: ReportV4SnapshotPageRow, sourceLength: number): void {
  const retainedText = page.retainedCleanedText;
  if (retainedText === null || !retainedText.trim()) {
    throw new Error("The exact terminal V4 snapshot page has no retained cleaned text; legacy previews cannot be summarized.");
  }
  if (page.contentHash !== createHash("sha256").update(retainedText).digest("hex")) {
    throw new Error("The V4 snapshot page content hash has drifted from its exact retained cleaned text.");
  }
  if (sourceLength !== retainedText.length) {
    throw new Error("The V4 page-summary source length must equal the retained text JavaScript source-location length.");
  }
}

function strictObject(value: unknown, name: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).find((key) => !allowed.has(key));
  if (unknown) throw new TypeError(`${name} contains unknown field ${unknown}.`);
  return row;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} must be nonblank text.`);
  return value.trim();
}

function sha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${field} must be a lowercase SHA-256.`);
  return value;
}

function httpUrl(value: unknown, field: string): string {
  const text = requiredText(value, field);
  try {
    const url = new URL(text);
    if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error();
    url.hash = "";
    return url.href;
  } catch {
    throw new TypeError(`${field} must be an HTTP(S) URL without credentials.`);
  }
}

function nonnegativeInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new TypeError(`${field} must be a nonnegative integer.`);
  return parsed;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new TypeError(`${field} must be a positive integer.`);
  return parsed;
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`V4 ${field} values must be unique.`);
}

function assertWebsiteSynthesisBounds(summaries: readonly ReportV4PageSummary[]): void {
  const locationIds = new Set<string>();
  let summaryCharacters = 0;
  for (const summary of summaries) {
    for (const chunk of summary.chunks) {
      summaryCharacters += chunk.summary.length;
      for (const location of chunk.sourceLocations) {
        if (locationIds.has(location.locationId)) {
          throw new Error("V4 page-summary locationId values must be unique across the exact website synthesis input.");
        }
        locationIds.add(location.locationId);
      }
    }
  }
  if (summaryCharacters > REPORT_V4_MAX_TOTAL_SITE_SUMMARY_CHARS) {
    throw new Error("V4 page-summary text exceeds the bounded exact website synthesis input.");
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("V4 page-summary identity cannot contain undefined values.");
  return json;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

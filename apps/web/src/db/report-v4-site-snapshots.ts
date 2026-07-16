import type postgres from "postgres";
import { ensureDatabase, getSqlClient, isMemoryPersistence } from "./index";
import type { ReportV4SiteSnapshotReadMode, ReportV4SiteSnapshotStatus } from "./schema";

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const TERMINAL_STATUSES = new Set<ReportV4SiteSnapshotStatus>([
  "completed",
  "completed_limited",
  "unavailable",
  "custom_service"
]);
const PAID_RESOLVABLE_STATUSES = new Set<ReportV4SiteSnapshotStatus>(["completed", "completed_limited"]);

export interface ReportV4SiteSnapshotIdentityInput {
  id: string;
  reportId: string;
  siteKey: string;
  collectorConfigIdentityHash: string;
  capturedAt: Date;
}

export interface ReportV4SiteSnapshotPageInput {
  id: string;
  ordinal: number;
  normalizedUrl: string;
  analyzable: boolean;
  readMode: ReportV4SiteSnapshotReadMode | null;
  summary: string | null;
  contentHash: string | null;
  exclusionReason: string | null;
}

export interface ReportV4SiteSnapshotRecord extends ReportV4SiteSnapshotIdentityInput {
  status: ReportV4SiteSnapshotStatus;
  completedAt: Date | null;
  contentIdentityHash: string | null;
  candidateUrlCount: number;
  analyzablePageCount: number;
  excludedPageCount: number;
  createdAt: Date;
}

export interface ReportV4SiteSnapshotPageRecord extends ReportV4SiteSnapshotPageInput {
  snapshotId: string;
  createdAt: Date;
}

export interface ReportV4SiteSnapshotBundle {
  snapshot: ReportV4SiteSnapshotRecord;
  pages: ReportV4SiteSnapshotPageRecord[];
}

export interface FinalizeReportV4PreAdmissionSnapshotInput extends ReportV4SiteSnapshotIdentityInput {
  status: Exclude<ReportV4SiteSnapshotStatus, "collecting">;
  completedAt: Date;
  contentIdentityHash: string;
  candidateUrlCount: number;
  pages: readonly ReportV4SiteSnapshotPageInput[];
}

export interface ResolvePaidReportV4SiteSnapshotInput {
  id: string;
  reportId: string;
  siteKey: string;
  collectorConfigIdentityHash: string;
  contentIdentityHash: string;
}

interface MemoryState {
  snapshots: Map<string, ReportV4SiteSnapshotRecord>;
  pages: Map<string, ReportV4SiteSnapshotPageRecord[]>;
  reportBindings: Map<string, string>;
}

const memoryStates = new Map<string, MemoryState>();

export async function beginReportV4PreAdmissionSnapshot(
  input: ReportV4SiteSnapshotIdentityInput
): Promise<ReportV4SiteSnapshotRecord> {
  const identity = validateIdentity(input);
  if (isMemoryPersistence()) return beginMemory(identity);
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(identity.reportId)}, 0))`;
    const byReport = await tx<Array<Record<string, unknown>>>`
      SELECT * FROM report_v4_site_snapshots WHERE report_id=${identity.reportId}
      ORDER BY created_at,id FOR UPDATE
    `;
    if (byReport.length > 1) throw new Error("Multiple V4 site snapshots are bound to the same report; refusing implicit selection.");
    if (byReport[0]) return acceptExistingBegin(dbSnapshot(byReport[0]), identity);
    const byId = await tx<Array<Record<string, unknown>>>`
      SELECT * FROM report_v4_site_snapshots WHERE id=${identity.id} FOR UPDATE
    `;
    if (byId[0]) return acceptExistingBegin(dbSnapshot(byId[0]), identity);
    const rows = await tx<Array<Record<string, unknown>>>`
      INSERT INTO report_v4_site_snapshots (
        id,report_id,site_key,status,captured_at,collector_config_identity_hash,
        candidate_url_count,analyzable_page_count,excluded_page_count
      ) VALUES (
        ${identity.id},${identity.reportId},${identity.siteKey},'collecting',${identity.capturedAt},
        ${identity.collectorConfigIdentityHash},0,0,0
      ) RETURNING *
    `;
    return dbSnapshot(rows[0]!);
  });
}

export async function finalizeReportV4PreAdmissionSnapshot(
  input: FinalizeReportV4PreAdmissionSnapshotInput
): Promise<ReportV4SiteSnapshotBundle> {
  const terminal = validateTerminalInput(input);
  if (isMemoryPersistence()) return finalizeMemory(terminal);
  await ensureDatabase();
  return getSqlClient().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(terminal.reportId)}, 0))`;
    const rows = await tx<Array<Record<string, unknown>>>`
      SELECT * FROM report_v4_site_snapshots WHERE id=${terminal.id} FOR UPDATE
    `;
    const existing = rows[0] ? dbSnapshot(rows[0]) : null;
    if (!existing) throw new Error("The pre-admission V4 site snapshot does not exist.");
    assertIdentity(existing, terminal);
    if (existing.status !== "collecting") {
      const bundle = await loadBundleTx(tx, existing);
      if (sameTerminalBundle(bundle, terminal)) return bundle;
      throw new Error("The terminal V4 site snapshot is immutable; idempotency identity conflict.");
    }
    for (const page of terminal.pages) {
      await tx`
        INSERT INTO report_v4_site_snapshot_pages (
          id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,content_hash,exclusion_reason
        ) VALUES (
          ${page.id},${terminal.id},${page.ordinal},${page.normalizedUrl},${page.analyzable},${page.readMode},
          ${page.summary},${page.contentHash},${page.exclusionReason}
        )
      `;
    }
    const updated = await tx<Array<Record<string, unknown>>>`
      UPDATE report_v4_site_snapshots SET
        status=${terminal.status},completed_at=${terminal.completedAt},content_identity_hash=${terminal.contentIdentityHash},
        candidate_url_count=${terminal.candidateUrlCount},analyzable_page_count=${terminal.analyzablePageCount},
        excluded_page_count=${terminal.excludedPageCount}
      WHERE id=${terminal.id} AND status='collecting'
      RETURNING *
    `;
    if (!updated[0]) throw new Error("The collecting V4 site snapshot lost its terminalization boundary.");
    return loadBundleTx(tx, dbSnapshot(updated[0]));
  });
}

export async function resolvePaidReportV4SiteSnapshot(
  input: ResolvePaidReportV4SiteSnapshotInput
): Promise<ReportV4SiteSnapshotBundle> {
  const expected = validateResolveInput(input);
  if (isMemoryPersistence()) {
    const state = memoryState();
    const snapshot = state.snapshots.get(expected.id);
    if (!snapshot) throw new Error("The paid report's pre-admission V4 site snapshot was not found.");
    assertTerminal(snapshot);
    assertIdentity(snapshot, expected);
    if (snapshot.contentIdentityHash !== expected.contentIdentityHash) throw new Error("V4 site snapshot identity mismatch.");
    assertPaidResolvable(snapshot);
    return clone({ snapshot, pages: state.pages.get(snapshot.id) ?? [] });
  }
  await ensureDatabase();
  const rows = await getSqlClient()<Array<Record<string, unknown>>>`
    SELECT * FROM report_v4_site_snapshots WHERE report_id=${expected.reportId} ORDER BY created_at,id
  `;
  if (rows.length > 1) throw new Error("Multiple V4 site snapshots are bound to the same report; refusing implicit selection.");
  if (!rows[0]) throw new Error("The paid report's pre-admission V4 site snapshot was not found.");
  const snapshot = dbSnapshot(rows[0]);
  assertTerminal(snapshot);
  assertIdentity(snapshot, expected);
  if (snapshot.contentIdentityHash !== expected.contentIdentityHash) throw new Error("V4 site snapshot identity mismatch.");
  assertPaidResolvable(snapshot);
  return loadBundle(snapshot);
}

function beginMemory(identity: ReportV4SiteSnapshotIdentityInput): ReportV4SiteSnapshotRecord {
  const state = memoryState();
  const reportSnapshotId = state.reportBindings.get(identity.reportId);
  if (reportSnapshotId) return acceptExistingBegin(state.snapshots.get(reportSnapshotId)!, identity);
  const idCollision = state.snapshots.get(identity.id);
  if (idCollision) return acceptExistingBegin(idCollision, identity);
  const row: ReportV4SiteSnapshotRecord = {
    ...identity,
    status: "collecting",
    completedAt: null,
    contentIdentityHash: null,
    candidateUrlCount: 0,
    analyzablePageCount: 0,
    excludedPageCount: 0,
    createdAt: new Date()
  };
  state.snapshots.set(row.id, row);
  state.reportBindings.set(row.reportId, row.id);
  state.pages.set(row.id, []);
  return clone(row);
}

function finalizeMemory(terminal: ValidatedTerminalInput): ReportV4SiteSnapshotBundle {
  const state = memoryState();
  const existing = state.snapshots.get(terminal.id);
  if (!existing) throw new Error("The pre-admission V4 site snapshot does not exist.");
  assertIdentity(existing, terminal);
  if (existing.status !== "collecting") {
    const bundle = { snapshot: existing, pages: state.pages.get(existing.id) ?? [] };
    if (sameTerminalBundle(bundle, terminal)) return clone(bundle);
    throw new Error("The terminal V4 site snapshot is immutable; idempotency identity conflict.");
  }
  const createdAt = new Date();
  const pages = terminal.pages.map((page) => ({ ...page, snapshotId: terminal.id, createdAt }));
  const snapshot: ReportV4SiteSnapshotRecord = {
    id: terminal.id,
    reportId: terminal.reportId,
    siteKey: terminal.siteKey,
    collectorConfigIdentityHash: terminal.collectorConfigIdentityHash,
    capturedAt: terminal.capturedAt,
    status: terminal.status,
    completedAt: terminal.completedAt,
    contentIdentityHash: terminal.contentIdentityHash,
    candidateUrlCount: terminal.candidateUrlCount,
    analyzablePageCount: terminal.analyzablePageCount,
    excludedPageCount: terminal.excludedPageCount,
    createdAt: existing.createdAt
  };
  state.snapshots.set(snapshot.id, snapshot);
  state.pages.set(snapshot.id, pages);
  return clone({ snapshot, pages });
}

function acceptExistingBegin(
  existing: ReportV4SiteSnapshotRecord,
  expected: ReportV4SiteSnapshotIdentityInput
): ReportV4SiteSnapshotRecord {
  if (existing.reportId !== expected.reportId || existing.id !== expected.id) {
    throw new Error("The report is already bound to another pre-admission V4 site snapshot.");
  }
  assertIdentity(existing, expected);
  if (existing.status !== "collecting") throw new Error("The report's terminal V4 site snapshot is immutable.");
  return clone(existing);
}

type ValidatedTerminalInput = FinalizeReportV4PreAdmissionSnapshotInput & {
  pages: ReportV4SiteSnapshotPageInput[];
  analyzablePageCount: number;
  excludedPageCount: number;
};

function validateTerminalInput(input: FinalizeReportV4PreAdmissionSnapshotInput): ValidatedTerminalInput {
  const identity = validateIdentity(input);
  const contentIdentityHash = validHash(input.contentIdentityHash, "content identity hash");
  const completedAt = validDate(input.completedAt, "completedAt");
  if (completedAt < identity.capturedAt) throw new Error("Snapshot completion cannot precede capture.");
  if (!TERMINAL_STATUSES.has(input.status)) throw new Error("A legal V4 site snapshot terminal status is required.");
  if (!Number.isSafeInteger(input.candidateUrlCount) || input.candidateUrlCount < 0) throw new Error("candidateUrlCount must be non-negative.");
  const snapshotPages = input.pages.map(validatePage).sort((left, right) => left.ordinal - right.ordinal);
  assertUnique(snapshotPages.map(({ id }) => id), "page id");
  assertUnique(snapshotPages.map(({ ordinal }) => String(ordinal)), "page ordinal");
  assertUnique(snapshotPages.map(({ normalizedUrl }) => normalizedUrl), "page URL");
  const analyzablePageCount = snapshotPages.filter(({ analyzable }) => analyzable).length;
  const excludedPageCount = snapshotPages.length - analyzablePageCount;
  if (input.candidateUrlCount < snapshotPages.length) throw new Error("candidateUrlCount cannot be lower than the persisted page count.");
  if (input.status === "completed" && (analyzablePageCount < 1 || analyzablePageCount > 50)) {
    throw new Error("A completed snapshot requires 1 to 50 analyzable pages.");
  }
  if (input.status === "completed_limited" && (analyzablePageCount < 1 || analyzablePageCount > 50)) {
    throw new Error("A completed limited snapshot requires 1 to 50 analyzable pages.");
  }
  if (input.status === "completed_limited" && excludedPageCount < 1) {
    throw new Error("A completed limited snapshot requires an explicit excluded-page coverage gap.");
  }
  if (input.status === "unavailable" && analyzablePageCount !== 0) {
    throw new Error("An unavailable snapshot must have zero analyzable pages.");
  }
  if (input.status === "custom_service" && analyzablePageCount !== 51) {
    throw new Error("A custom service snapshot requires exactly 51 analyzable pages as threshold evidence.");
  }
  return { ...identity, status: input.status, completedAt, contentIdentityHash, candidateUrlCount: input.candidateUrlCount, pages: snapshotPages, analyzablePageCount, excludedPageCount };
}

function validateIdentity(input: ReportV4SiteSnapshotIdentityInput): ReportV4SiteSnapshotIdentityInput {
  return {
    id: requiredText(input.id, "snapshot id"),
    reportId: requiredText(input.reportId, "report id"),
    siteKey: requiredText(input.siteKey, "site identity"),
    collectorConfigIdentityHash: validHash(input.collectorConfigIdentityHash, "collector config identity hash"),
    capturedAt: validDate(input.capturedAt, "capturedAt")
  };
}

function validateResolveInput(input: ResolvePaidReportV4SiteSnapshotInput): ResolvePaidReportV4SiteSnapshotInput {
  return {
    id: requiredText(input.id, "snapshot id"),
    reportId: requiredText(input.reportId, "report id"),
    siteKey: requiredText(input.siteKey, "site identity"),
    collectorConfigIdentityHash: validHash(input.collectorConfigIdentityHash, "collector config identity hash"),
    contentIdentityHash: validHash(input.contentIdentityHash, "content identity hash")
  };
}

function validatePage(page: ReportV4SiteSnapshotPageInput): ReportV4SiteSnapshotPageInput {
  const id = requiredText(page.id, "page id");
  if (!Number.isSafeInteger(page.ordinal) || page.ordinal < 1) throw new Error("A positive page ordinal is required.");
  let normalizedUrl: string;
  try {
    const parsed = new URL(page.normalizedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    normalizedUrl = parsed.toString();
  } catch {
    throw new Error("A normalized HTTP(S) page URL is required.");
  }
  if (page.analyzable) {
    if (page.readMode !== "direct_readable" && page.readMode !== "js_dependent") throw new Error("An analyzable page requires a read mode.");
    const summary = requiredText(page.summary ?? "", "page summary");
    const contentHash = validHash(page.contentHash ?? "", "page content hash");
    if (page.exclusionReason !== null) throw new Error("An analyzable page cannot have an exclusion reason.");
    return { id, ordinal: page.ordinal, normalizedUrl, analyzable: true, readMode: page.readMode, summary, contentHash, exclusionReason: null };
  }
  if (page.readMode !== null || page.summary !== null || page.contentHash !== null) throw new Error("An excluded page cannot retain analyzed content.");
  return { id, ordinal: page.ordinal, normalizedUrl, analyzable: false, readMode: null, summary: null, contentHash: null, exclusionReason: requiredText(page.exclusionReason ?? "", "page exclusion reason") };
}

function assertIdentity(
  actual: Pick<ReportV4SiteSnapshotRecord, "id" | "reportId" | "siteKey" | "collectorConfigIdentityHash" | "capturedAt">,
  expected: Pick<ReportV4SiteSnapshotIdentityInput, "id" | "reportId" | "siteKey" | "collectorConfigIdentityHash"> & { capturedAt?: Date }
): void {
  if (actual.id !== expected.id || actual.reportId !== expected.reportId || actual.siteKey !== expected.siteKey ||
      actual.collectorConfigIdentityHash !== expected.collectorConfigIdentityHash ||
      (expected.capturedAt && actual.capturedAt.getTime() !== expected.capturedAt.getTime())) {
    throw new Error("V4 site snapshot identity mismatch.");
  }
}

function assertTerminal(snapshot: ReportV4SiteSnapshotRecord): void {
  if (!TERMINAL_STATUSES.has(snapshot.status)) throw new Error("The pre-admission V4 site snapshot is not terminal.");
}

function assertPaidResolvable(snapshot: ReportV4SiteSnapshotRecord): void {
  if (!PAID_RESOLVABLE_STATUSES.has(snapshot.status)) {
    throw new Error("This V4 site snapshot is not eligible for standard paid generation.");
  }
}

function sameTerminalBundle(bundle: ReportV4SiteSnapshotBundle, expected: ValidatedTerminalInput): boolean {
  const snapshot = bundle.snapshot;
  return snapshot.status === expected.status && snapshot.completedAt?.getTime() === expected.completedAt.getTime() &&
    snapshot.contentIdentityHash === expected.contentIdentityHash && snapshot.candidateUrlCount === expected.candidateUrlCount &&
    snapshot.analyzablePageCount === expected.analyzablePageCount && snapshot.excludedPageCount === expected.excludedPageCount &&
    JSON.stringify(comparablePages(bundle.pages)) === JSON.stringify(comparablePages(expected.pages));
}

function comparablePages(pages: readonly (ReportV4SiteSnapshotPageInput | ReportV4SiteSnapshotPageRecord)[]) {
  return [...pages].sort((a, b) => a.ordinal - b.ordinal).map(({ id, ordinal, normalizedUrl, analyzable, readMode, summary, contentHash, exclusionReason }) => ({ id, ordinal, normalizedUrl, analyzable, readMode, summary, contentHash, exclusionReason }));
}

async function loadBundle(snapshot: ReportV4SiteSnapshotRecord): Promise<ReportV4SiteSnapshotBundle> {
  const rows = await getSqlClient()<Array<Record<string, unknown>>>`
    SELECT * FROM report_v4_site_snapshot_pages WHERE snapshot_id=${snapshot.id} ORDER BY ordinal
  `;
  return { snapshot, pages: rows.map(dbPage) };
}

async function loadBundleTx(
  tx: postgres.TransactionSql,
  snapshot: ReportV4SiteSnapshotRecord
): Promise<ReportV4SiteSnapshotBundle> {
  const rows = await tx<Array<Record<string, unknown>>>`
    SELECT * FROM report_v4_site_snapshot_pages WHERE snapshot_id=${snapshot.id} ORDER BY ordinal
  `;
  return { snapshot, pages: rows.map(dbPage) };
}

function dbSnapshot(row: Record<string, unknown>): ReportV4SiteSnapshotRecord {
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    siteKey: String(row.site_key),
    status: String(row.status) as ReportV4SiteSnapshotStatus,
    capturedAt: new Date(row.captured_at as string | Date),
    completedAt: row.completed_at == null ? null : new Date(row.completed_at as string | Date),
    collectorConfigIdentityHash: String(row.collector_config_identity_hash),
    contentIdentityHash: row.content_identity_hash == null ? null : String(row.content_identity_hash),
    candidateUrlCount: Number(row.candidate_url_count),
    analyzablePageCount: Number(row.analyzable_page_count),
    excludedPageCount: Number(row.excluded_page_count),
    createdAt: new Date(row.created_at as string | Date)
  };
}

function dbPage(row: Record<string, unknown>): ReportV4SiteSnapshotPageRecord {
  return {
    id: String(row.id),
    snapshotId: String(row.snapshot_id),
    ordinal: Number(row.ordinal),
    normalizedUrl: String(row.normalized_url),
    analyzable: Boolean(row.analyzable),
    readMode: row.read_mode == null ? null : String(row.read_mode) as ReportV4SiteSnapshotReadMode,
    summary: row.summary == null ? null : String(row.summary),
    contentHash: row.content_hash == null ? null : String(row.content_hash),
    exclusionReason: row.exclusion_reason == null ? null : String(row.exclusion_reason),
    createdAt: new Date(row.created_at as string | Date)
  };
}

function memoryState(): MemoryState {
  const namespace = process.env.OPEN_GEO_DB_PATH?.trim() || "memory-v4-site-default";
  let state = memoryStates.get(namespace);
  if (!state) {
    state = { snapshots: new Map(), pages: new Map(), reportBindings: new Map() };
    memoryStates.set(namespace, state);
  }
  return state;
}

function lockKey(reportId: string): string {
  return `report-v4-site-snapshot:${reportId}`;
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`A non-empty ${field} is required.`);
  return normalized;
}

function validHash(value: string, field: string): string {
  const normalized = value.trim();
  if (!HASH_PATTERN.test(normalized)) throw new Error(`A lowercase SHA-256 ${field} is required.`);
  return normalized;
}

function validDate(value: Date, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`A valid ${field} is required.`);
  return date;
}

function assertUnique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new Error(`V4 site snapshot ${field} values must be unique.`);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

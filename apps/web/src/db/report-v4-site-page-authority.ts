import { createHash } from "node:crypto";
import {
  parseReportV4PageAnalysisOutput,
  type ReportV4PageSummary
} from "@open-geo-console/ai-report-engine";
import { reportV4PageSummaryIdentitySetHash } from "./report-v4-website-synthesis-checkpoints";

type Row = Record<string, unknown>;
type Rows = Row[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;

export interface ReportV4SitePageAuthorityTransactionSql {
  unsafe<T extends Rows = Rows>(query: string, parameters?: unknown[]): Promise<T>;
}

export interface ReportV4SitePageAuthoritySql {
  begin<T>(
    options: string,
    work: (tx: ReportV4SitePageAuthorityTransactionSql) => Promise<T>
  ): Promise<T>;
}

export interface LoadReportV4SitePageAuthorityInput {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly phase: "baseline" | "final";
}

export interface ReportV4SiteSnapshotPageAuthorityRecord {
  readonly scenarioIdHash: string;
  readonly reportIdHash: string;
  readonly coreJobIdHash: string;
  readonly snapshotIdHash: string;
  readonly snapshotStatus: "completed" | "completed_limited";
  readonly snapshotContentIdentityHash: string;
  readonly collectorConfigIdentityHash: string;
  readonly candidatePageCount: number;
  readonly selectedPageCount: number;
  readonly analyzablePageCount: number;
  readonly excludedPageCount: number;
  readonly jsDependentPageCount: number;
  readonly pageIdHash: string;
  readonly ordinal: number;
  readonly locationIdentityHash: string;
  readonly analyzable: boolean;
  readonly readMode: "direct_readable" | "js_dependent" | null;
  readonly summaryHash: string | null;
  readonly sourceLength: number | null;
  readonly contentHash: string | null;
  readonly exclusionReasonHash: string | null;
  readonly pageIdentityHash: string;
}

export interface ReportV4PageSummaryIntegrityAuthorityRecord {
  readonly scenarioIdHash: string;
  readonly reportIdHash: string;
  readonly coreJobIdHash: string;
  readonly snapshotIdHash: string;
  readonly pageIdHash: string;
  readonly ordinal: number;
  readonly readability: "direct_readable" | "js_dependent";
  readonly sourceLength: number;
  readonly contentHash: string;
  readonly chunksHash: string;
  readonly summaryPayloadHash: string;
  readonly summaryIdentityHash: string;
  readonly websiteInputSetHash: string;
}

export interface ReportV4AuthoritySlot<T extends object> {
  readonly records: readonly Readonly<T>[];
  readonly recordCount: number;
  readonly canonicalHash: string;
}

export interface ReportV4SitePageAuthority {
  readonly siteSnapshotPages: ReportV4AuthoritySlot<ReportV4SiteSnapshotPageAuthorityRecord>;
  readonly pageSummaryIntegrity: ReportV4AuthoritySlot<ReportV4PageSummaryIntegrityAuthorityRecord>;
  readonly websiteInputSetHash: string;
}

interface ParsedPage {
  readonly id: string;
  readonly snapshotId: string;
  readonly ordinal: number;
  readonly normalizedUrl: string;
  readonly analyzable: boolean;
  readonly readMode: "direct_readable" | "js_dependent" | null;
  readonly summary: string | null;
  readonly retainedText: string | null;
  readonly contentHash: string | null;
  readonly exclusionReason: string | null;
}

interface ParsedSummary {
  readonly pageId: string;
  readonly identityHash: string;
  readonly summary: ReportV4PageSummary;
}

/** Opens the sole transaction used by the standalone Group 1 authority reader. */
export async function loadReportV4SitePageAuthority(
  sql: ReportV4SitePageAuthoritySql,
  input: LoadReportV4SitePageAuthorityInput
): Promise<ReportV4SitePageAuthority> {
  const parsed = parseInput(input);
  return sql.begin("isolation level repeatable read read only", (tx) =>
    loadReportV4SitePageAuthorityInTransaction(tx, parsed));
}

/** Transaction-scoped Group 1 projection. The caller owns the transaction. */
export async function loadReportV4SitePageAuthorityInTransaction(
  tx: ReportV4SitePageAuthorityTransactionSql,
  input: LoadReportV4SitePageAuthorityInput
): Promise<ReportV4SitePageAuthority> {
  const parsed = parseInput(input);
  const binding = exactlyOne(await tx.unsafe(`/* report-v4-authority:group1-binding */
    SELECT s.session_id,s.id scenario_id,s.report_id,s.core_job_id,s.site_snapshot_id,
      j.report_id job_report_id,j.site_snapshot_id job_site_snapshot_id,
      snapshot.id snapshot_id,snapshot.report_id snapshot_report_id,snapshot.status snapshot_status,
      snapshot.collector_config_identity_hash,snapshot.content_identity_hash,
      snapshot.candidate_url_count,snapshot.analyzable_page_count,snapshot.excluded_page_count
    FROM report_v4_acceptance_scenarios s
    JOIN scan_jobs j ON j.id=s.core_job_id
    JOIN report_v4_site_snapshots snapshot ON snapshot.id=s.site_snapshot_id
    WHERE s.session_id=$1 AND s.id=$2`, [parsed.sessionId, parsed.scenarioId]), "scenario/report/job/site snapshot binding");

  equal(binding.session_id, parsed.sessionId, "scenario session");
  equal(binding.scenario_id, parsed.scenarioId, "scenario identity");
  const reportId = requiredText(binding.report_id, "report_id");
  const coreJobId = requiredText(binding.core_job_id, "core_job_id");
  const snapshotId = requiredText(binding.site_snapshot_id, "site_snapshot_id");
  equal(binding.job_report_id, reportId, "core job report lineage");
  equal(binding.job_site_snapshot_id, snapshotId, "core job snapshot lineage");
  equal(binding.snapshot_id, snapshotId, "snapshot identity lineage");
  equal(binding.snapshot_report_id, reportId, "snapshot report lineage");

  const status = terminalStatus(binding.snapshot_status);
  const collectorConfigIdentityHash = hash(binding.collector_config_identity_hash, "collector config identity hash");
  const snapshotContentIdentityHash = hash(binding.content_identity_hash, "snapshot content identity hash");
  const candidatePageCount = nonnegativeInteger(binding.candidate_url_count, "candidate page count");
  const storedAnalyzablePageCount = positiveBoundedInteger(binding.analyzable_page_count, "analyzable page count", 50);
  const storedExcludedPageCount = nonnegativeInteger(binding.excluded_page_count, "excluded page count");

  const pageRows = await tx.unsafe(`/* report-v4-authority:group1-pages */
    SELECT id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,
      retained_cleaned_text,content_hash,exclusion_reason
    FROM report_v4_site_snapshot_pages WHERE snapshot_id=$1 ORDER BY ordinal,id`, [snapshotId]);
  if (pageRows.length < 1 || pageRows.length > 50) {
    throw new Error("Report V4 authority requires between 1 and 50 selected snapshot pages.");
  }
  const pages = pageRows.map((row) => parsePage(row, snapshotId));
  assertUnique(pages.map(({ id }) => id), "page identities");
  assertUnique(pages.map(({ ordinal }) => String(ordinal)), "page ordinals");
  assertUnique(pages.map(({ normalizedUrl }) => normalizedUrl), "page locations");
  const analyzablePageCount = pages.filter(({ analyzable }) => analyzable).length;
  const excludedPageCount = pages.length - analyzablePageCount;
  const jsDependentPageCount = pages.filter(({ readMode }) => readMode === "js_dependent").length;
  if (analyzablePageCount !== storedAnalyzablePageCount || excludedPageCount !== storedExcludedPageCount) {
    throw new Error("Snapshot completed page counts do not match the exact selected page set.");
  }
  if (candidatePageCount < pages.length) throw new Error("Snapshot candidate page count is smaller than its selected page set.");
  if (jsDependentPageCount > analyzablePageCount) throw new Error("Snapshot JS-dependent page count exceeds analyzable pages.");
  if (status === "completed" && excludedPageCount !== 0) throw new Error("A completed snapshot cannot contain excluded selected pages.");
  if (status === "completed_limited" && excludedPageCount < 1) throw new Error("A completed_limited snapshot requires excluded selected pages.");

  const recomputedSnapshotContentIdentityHash = digestJson({
    status,
    candidateUrlCount: candidatePageCount,
    pages: pages.map((page) => ({
      id: page.id,
      ordinal: page.ordinal,
      normalizedUrl: page.normalizedUrl,
      analyzable: page.analyzable,
      readMode: page.readMode,
      summary: page.summary,
      retainedText: page.retainedText,
      contentHash: page.contentHash,
      exclusionReason: page.exclusionReason
    }))
  });
  if (recomputedSnapshotContentIdentityHash !== snapshotContentIdentityHash) {
    throw new Error("Snapshot content identity hash does not match its canonical selected page payload.");
  }

  const summaryRows = await tx.unsafe(`/* report-v4-authority:group1-page-summaries */
    SELECT identity_hash,report_id,snapshot_id,page_id,content_hash,source_length,chunks
    FROM report_v4_page_summaries WHERE snapshot_id=$1 ORDER BY page_id,identity_hash`, [snapshotId]);
  const analyzablePages = pages.filter(({ analyzable }) => analyzable);
  if (summaryRows.length !== analyzablePages.length) {
    throw new Error("Page-summary authority must contain exactly one summary for every analyzable page.");
  }
  const pageById = new Map(analyzablePages.map((page) => [page.id, page]));
  const parsedSummaries = summaryRows.map((row) => parseSummary(row, reportId, snapshotId, pageById));
  assertUnique(parsedSummaries.map(({ pageId }) => pageId), "page-summary page identities");
  if (parsedSummaries.some(({ pageId }) => !pageById.has(pageId))
      || analyzablePages.some(({ id }) => !parsedSummaries.some(({ pageId }) => pageId === id))) {
    throw new Error("Page-summary authority contains a missing or extra page relative to the analyzable snapshot set.");
  }
  const websiteInputSetHash = reportV4PageSummaryIdentitySetHash(parsedSummaries.map(({ identityHash }) => identityHash));
  const common = {
    scenarioIdHash: digestText(parsed.scenarioId),
    reportIdHash: digestText(reportId),
    coreJobIdHash: digestText(coreJobId),
    snapshotIdHash: digestText(snapshotId)
  };
  const siteRecords = pages.map((page): ReportV4SiteSnapshotPageAuthorityRecord => {
    const locationIdentityHash = digestText(page.normalizedUrl);
    const pageIdentityHash = digestStable({
      snapshotId,
      pageId: page.id,
      ordinal: page.ordinal,
      locationIdentityHash,
      analyzable: page.analyzable,
      readMode: page.readMode,
      summaryHash: nullableDigestText(page.summary),
      sourceLength: page.retainedText?.length ?? null,
      contentHash: page.contentHash,
      exclusionReasonHash: nullableDigestText(page.exclusionReason)
    });
    return Object.freeze({
      ...common,
      snapshotStatus: status,
      snapshotContentIdentityHash,
      collectorConfigIdentityHash,
      candidatePageCount,
      selectedPageCount: pages.length,
      analyzablePageCount,
      excludedPageCount,
      jsDependentPageCount,
      pageIdHash: digestText(page.id),
      ordinal: page.ordinal,
      locationIdentityHash,
      analyzable: page.analyzable,
      readMode: page.readMode,
      summaryHash: nullableDigestText(page.summary),
      sourceLength: page.retainedText?.length ?? null,
      contentHash: page.contentHash,
      exclusionReasonHash: nullableDigestText(page.exclusionReason),
      pageIdentityHash
    });
  });
  const summaryByPage = new Map(parsedSummaries.map((summary) => [summary.pageId, summary]));
  const summaryRecords = analyzablePages.map((page): ReportV4PageSummaryIntegrityAuthorityRecord => {
    const parsedSummary = summaryByPage.get(page.id);
    if (!parsedSummary) throw new Error("Page-summary authority is missing an analyzable page.");
    return Object.freeze({
      ...common,
      pageIdHash: digestText(page.id),
      ordinal: page.ordinal,
      readability: parsedSummary.summary.readability,
      sourceLength: parsedSummary.summary.sourceLength,
      contentHash: parsedSummary.summary.contentHash,
      chunksHash: digestStable(parsedSummary.summary.chunks),
      summaryPayloadHash: digestStable(parsedSummary.summary),
      summaryIdentityHash: parsedSummary.identityHash,
      websiteInputSetHash
    });
  });
  return Object.freeze({
    siteSnapshotPages: slot(siteRecords),
    pageSummaryIntegrity: slot(summaryRecords),
    websiteInputSetHash
  });
}

function parsePage(row: Row, snapshotId: string): ParsedPage {
  const id = requiredText(row.id, "page id");
  equal(row.snapshot_id, snapshotId, "page snapshot lineage");
  const ordinal = positiveBoundedInteger(row.ordinal, "page ordinal", Number.MAX_SAFE_INTEGER);
  const normalizedUrl = canonicalHttpUrl(row.normalized_url, "page normalized location");
  if (typeof row.analyzable !== "boolean") throw new Error("Snapshot page analyzable flag is invalid.");
  const analyzable = row.analyzable;
  if (analyzable) {
    const readMode = readability(row.read_mode);
    const summary = requiredText(row.summary, "analyzable page summary");
    const retainedText = requiredText(row.retained_cleaned_text, "analyzable retained text");
    const contentHash = hash(row.content_hash, "analyzable page content hash");
    if (digestText(retainedText) !== contentHash) throw new Error("Analyzable page content hash does not match retained text.");
    if (row.exclusion_reason !== null) throw new Error("Analyzable page cannot contain an exclusion reason.");
    return { id, snapshotId, ordinal, normalizedUrl, analyzable, readMode, summary, retainedText, contentHash, exclusionReason: null };
  }
  if (row.read_mode !== null || row.summary !== null || row.retained_cleaned_text !== null || row.content_hash !== null) {
    throw new Error("Excluded snapshot page contains analyzable content fields.");
  }
  return { id, snapshotId, ordinal, normalizedUrl, analyzable, readMode: null, summary: null,
    retainedText: null, contentHash: null, exclusionReason: requiredText(row.exclusion_reason, "excluded page reason") };
}

function parseSummary(
  row: Row,
  reportId: string,
  snapshotId: string,
  pageById: ReadonlyMap<string, ParsedPage>
): ParsedSummary {
  equal(row.report_id, reportId, "page-summary report lineage");
  equal(row.snapshot_id, snapshotId, "page-summary snapshot lineage");
  const pageId = requiredText(row.page_id, "page-summary page id");
  const page = pageById.get(pageId);
  if (!page || !page.analyzable || page.readMode === null || page.retainedText === null || page.contentHash === null) {
    throw new Error("Page-summary authority contains an extra or non-analyzable page.");
  }
  const sourceLength = positiveBoundedInteger(row.source_length, "page-summary source length", 100_000);
  const storedContentHash = hash(row.content_hash, "page-summary content hash");
  const recomputedContentHash = digestText(page.retainedText);
  if (storedContentHash !== recomputedContentHash || page.contentHash !== recomputedContentHash
      || sourceLength !== page.retainedText.length) {
    throw new Error("Page-summary content hash or source length does not match retained snapshot evidence.");
  }
  const persistedChunks = typeof row.chunks === "string" ? JSON.parse(row.chunks) as unknown : row.chunks;
  const summary = parseReportV4PageAnalysisOutput({ chunks: persistedChunks }, {
    pageId,
    url: page.normalizedUrl,
    contentHash: recomputedContentHash,
    readability: page.readMode,
    sourceLength
  });
  const identityHash = digestStable({
    snapshotId,
    pageId: summary.pageId,
    contentHash: summary.contentHash,
    sourceLength: summary.sourceLength,
    chunks: summary.chunks
  });
  if (hash(row.identity_hash, "stored page-summary identity hash") !== identityHash) {
    throw new Error("Stored page-summary identity hash does not match reparsed canonical content.");
  }
  return { pageId, identityHash, summary };
}

function slot<T extends object>(records: readonly Readonly<T>[]): ReportV4AuthoritySlot<T> {
  const frozen = Object.freeze([...records]);
  return Object.freeze({ records: frozen, recordCount: frozen.length, canonicalHash: digestStable(frozen) });
}

function parseInput(input: LoadReportV4SitePageAuthorityInput): LoadReportV4SitePageAuthorityInput {
  if (!input || typeof input !== "object" || Object.keys(input).sort().join() !== "phase,scenarioId,sessionId"
      || !UUID.test(input.sessionId) || !UUID.test(input.scenarioId)
      || (input.phase !== "baseline" && input.phase !== "final")) {
    throw new TypeError("Report V4 site/page authority input is invalid.");
  }
  return input;
}

function exactlyOne(rows: Rows, label: string): Row {
  if (rows.length !== 1) throw new Error(`Report V4 authority ${label} must contain exactly one row.`);
  return rows[0]!;
}

function terminalStatus(value: unknown): "completed" | "completed_limited" {
  if (value !== "completed" && value !== "completed_limited") {
    throw new Error("Report V4 authority requires a completed paid site snapshot.");
  }
  return value;
}

function readability(value: unknown): "direct_readable" | "js_dependent" {
  if (value !== "direct_readable" && value !== "js_dependent") throw new Error("Snapshot page readability is invalid.");
  return value;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value || value.trim() !== value) throw new Error(`${label} is missing or invalid.`);
  return value;
}

function hash(value: unknown, label: string): string {
  const candidate = requiredText(value, label);
  if (!HASH.test(candidate)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return candidate;
}

function nonnegativeInteger(value: unknown, label: string): number {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 0) throw new Error(`${label} is invalid.`);
  return candidate;
}

function positiveBoundedInteger(value: unknown, label: string, maximum: number): number {
  const candidate = Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > maximum) throw new Error(`${label} is invalid.`);
  return candidate;
}

function canonicalHttpUrl(value: unknown, label: string): string {
  const candidate = requiredText(value, label);
  const parsed = new URL(candidate);
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.toString() !== candidate) {
    throw new Error(`${label} is not canonical HTTP(S).`);
  }
  return candidate;
}

function equal(actual: unknown, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`Report V4 authority ${label} mismatch.`);
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Report V4 authority ${label} must be unique.`);
}

function nullableDigestText(value: string | null): string | null {
  return value === null ? null : digestText(value);
}

function digestText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestJson(value: unknown): string {
  return digestText(JSON.stringify(value));
}

function digestStable(value: unknown): string {
  return digestText(stableJson(value));
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
  if (json === undefined) throw new TypeError("Report V4 site/page authority cannot hash undefined.");
  return json;
}

import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4PageSummaryStore,
  createReportV4PageSummaryPostgresDatabase,
  createReportV4PageSummaryRepository,
  loadReportV4PageSummaryByExactLineage
} from "./report-v4-page-summaries";

const adminUrl = process.env.OGC_TEST_DATABASE_ADMIN_URL?.trim();
const describeDisposablePostgres = adminUrl ? describe : describe.skip;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-04
describeDisposablePostgres("V4 page-summary repository PostgreSQL parity", () => {
  const databaseName = `ogc_v4_page_summaries_${randomUUID().replaceAll("-", "")}`;
  const admin = postgres(adminUrl!, { max: 1, prepare: false });
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    await admin.unsafe(`CREATE DATABASE ${quote(databaseName)}`);
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 2, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
  }, 60_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("persists only exact terminal retained text with concurrent resume and ordered exact load", async () => {
    await seedSnapshot(sql, "report-main", "snapshot-main", [2, 1, 3], "completed");
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
      createReportV4PageSummaryPostgresDatabase(sql)
    ));
    const page1 = persistenceInput("report-main", "snapshot-main", 1);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not fetch or recrawl"));
    const [first, resumed] = await Promise.all([repository.persist(page1), repository.persist(page1)]);
    expect(resumed).toEqual(first);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await expect(repository.persist({ ...page1, output: pageOutput("snapshot-main", 1, "drift") }))
      .rejects.toThrow(/drift|immutable|idempotency/i);
    await expect(repository.persist({ ...page1, sourceLength: page1.sourceLength + 1 }))
      .rejects.toThrow(/source length|retained|drift/i);
    await expect(repository.persist({ ...page1, contentHash: hash("wrong-retained-content") }))
      .rejects.toThrow(/content|retained|drift/i);
    await expect(repository.persist({ ...page1, url: "https://example.com/drift" }))
      .rejects.toThrow(/URL|drift/i);
    await expect(repository.persist({ ...page1, readability: "js_dependent" }))
      .rejects.toThrow(/readability|drift/i);
    await repository.persist(persistenceInput("report-main", "snapshot-main", 2));
    await expect(repository.persist(persistenceInput("report-main", "snapshot-main", 3)))
      .rejects.toThrow(/analyzable|lineage/i);
    const loaded = await repository.loadForWebsiteSynthesis({
      reportId: "report-main", snapshotId: "snapshot-main", contentIdentityHash: hash("snapshot-main")
    });
    expect(loaded.map(({ pageId }) => pageId)).toEqual(["snapshot-main-page-1", "snapshot-main-page-2"]);
    expect(Object.isFrozen(loaded[0]!.chunks)).toBe(true);
    await expect(loadReportV4PageSummaryByExactLineage({
      reportId: "report-main", snapshotId: "snapshot-main",
      pageUrl: "https://example.com/snapshot-main-page-1",
       contentHash: hash(retainedText("snapshot-main-page-1")), snapshotContentIdentityHash: hash("snapshot-main")
    }, repository)).resolves.toEqual(loaded[0]);
    await expect(repository.loadForWebsiteSynthesis({
      reportId: "wrong-report", snapshotId: "snapshot-main", contentIdentityHash: hash("snapshot-main")
    }))
      .rejects.toThrow(/snapshot|lineage|not found/i);
    await expect(repository.loadForWebsiteSynthesis({
      reportId: "report-main", snapshotId: "snapshot-main", contentIdentityHash: hash("wrong-content")
    })).rejects.toThrow(/content lineage|drift/i);
  }, 120_000);

  it("rejects collecting snapshots and accepts completed_limited retained pages", async () => {
    await seedSnapshot(sql, "report-collecting", "snapshot-collecting", [1], "collecting");
    await seedSnapshot(sql, "report-limited", "snapshot-limited", [1, 2, 3], "completed_limited");
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
      createReportV4PageSummaryPostgresDatabase(sql)
    ));
    await expect(repository.persist(persistenceInput("report-collecting", "snapshot-collecting", 1)))
      .rejects.toThrow(/completed|completed_limited|terminal/i);
    await expect(repository.persist(persistenceInput("report-limited", "snapshot-limited", 1)))
      .resolves.toBeDefined();
  }, 120_000);

  it("fails closed when a terminal snapshot is missing one analyzable page summary", async () => {
    await seedSnapshot(sql, "report-missing", "snapshot-missing", [1, 2], "completed");
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
      createReportV4PageSummaryPostgresDatabase(sql)
    ));
    await repository.persist(persistenceInput("report-missing", "snapshot-missing", 1));
    await expect(repository.loadForWebsiteSynthesis({
      reportId: "report-missing", snapshotId: "snapshot-missing", contentIdentityHash: hash("snapshot-missing")
    }))
      .rejects.toThrow(/every analyzable page|missing/i);
  }, 120_000);
});

async function seedSnapshot(
  sql: ReturnType<typeof postgres>,
  reportId: string,
  snapshotId: string,
  ordinals: readonly number[],
  status: "collecting" | "completed" | "completed_limited"
): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${reportId},${`https://${reportId}.example/`},${`${reportId}.example`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
    VALUES(${snapshotId},${reportId},${`${reportId}.example`},'collecting',now(),${hash(`collector-${snapshotId}`)})`;
  for (const ordinal of ordinals) {
    const analyzable = ordinal <= 2;
    const pageId = `${snapshotId}-page-${ordinal}`;
    const retainedCleanedText = retainedText(pageId);
    await sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash,exclusion_reason)
      VALUES(${pageId},${snapshotId},${ordinal},${`https://example.com/${pageId}`},${analyzable},
       ${analyzable ? "direct_readable" : null},${analyzable ? `Collector ${ordinal}` : null},
       ${analyzable ? retainedCleanedText : null},${analyzable ? hash(retainedCleanedText) : null},${analyzable ? null : "excluded"})`;
  }
  if (status !== "collecting") {
    const analyzablePageCount = Math.min(ordinals.length, 2);
    const excludedPageCount = ordinals.length - analyzablePageCount;
    await sql`UPDATE report_v4_site_snapshots SET status=${status},completed_at=now(),
      content_identity_hash=${hash(snapshotId)},candidate_url_count=${ordinals.length},
      analyzable_page_count=${analyzablePageCount},excluded_page_count=${excludedPageCount}
      WHERE id=${snapshotId}`;
  }
}

function persistenceInput(reportId: string, snapshotId: string, ordinal: number) {
  const pageId = `${snapshotId}-page-${ordinal}`;
  const text = retainedText(pageId);
  return {
    reportId, snapshotId, pageId, url: `https://example.com/${pageId}`,
    contentHash: hash(text), readability: "direct_readable" as const,
    sourceLength: text.length, output: pageOutput(snapshotId, ordinal, "valid")
  };
}

function retainedText(pageId: string): string { return `${pageId}:`.padEnd(120, "x"); }

function pageOutput(snapshotId: string, ordinal: number, label: string) {
  return { chunks: [{ order: 1, summary: `${label} page ${ordinal}`, sourceLocations: [{ locationId: `${snapshotId}-page-${ordinal}:0-20`, startOffset: 0, endOffset: 20 }] }] };
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString();
}

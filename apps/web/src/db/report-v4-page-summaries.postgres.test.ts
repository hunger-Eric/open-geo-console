import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DATABASE_MIGRATIONS } from "./migrations";
import {
  createPostgresReportV4PageSummaryStore,
  createReportV4PageSummaryPostgresDatabase,
  createReportV4PageSummaryRepository
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
    sql = postgres(withDatabase(adminUrl!, databaseName), { max: 1, prepare: false });
    await sql.begin(async (tx) => { for (const statement of DATABASE_MIGRATIONS) await tx.unsafe(statement); });
  }, 60_000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${quote(databaseName)} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
  }, 60_000);

  it("covers first write, exact resume, drift, terminal refusal and ordered exact load", async () => {
    await seedCollectingSnapshot(sql, "report-main", "snapshot-main", [2, 1, 3]);
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
      createReportV4PageSummaryPostgresDatabase(sql)
    ));
    const page1 = persistenceInput("report-main", "snapshot-main", 1);
    const first = await repository.persist(page1);
    expect(await repository.persist(page1)).toEqual(first);
    await expect(repository.persist({ ...page1, output: pageOutput("snapshot-main", 1, "drift") }))
      .rejects.toThrow(/drift|immutable|idempotency/i);
    await repository.persist(persistenceInput("report-main", "snapshot-main", 2));
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),content_identity_hash=${hash("snapshot-main")},
      candidate_url_count=3,analyzable_page_count=2,excluded_page_count=1 WHERE id='snapshot-main'`;
    await expect(repository.persist(persistenceInput("report-main", "snapshot-main", 3)))
      .rejects.toThrow(/collecting/i);
    const loaded = await repository.loadForWebsiteSynthesis({
      reportId: "report-main", snapshotId: "snapshot-main", contentIdentityHash: hash("snapshot-main")
    });
    expect(loaded.map(({ pageId }) => pageId)).toEqual(["snapshot-main-page-1", "snapshot-main-page-2"]);
    expect(Object.isFrozen(loaded[0]!.chunks)).toBe(true);
    await expect(repository.loadForWebsiteSynthesis({
      reportId: "wrong-report", snapshotId: "snapshot-main", contentIdentityHash: hash("snapshot-main")
    }))
      .rejects.toThrow(/snapshot|lineage|not found/i);
    await expect(repository.loadForWebsiteSynthesis({
      reportId: "report-main", snapshotId: "snapshot-main", contentIdentityHash: hash("wrong-content")
    })).rejects.toThrow(/content lineage|drift/i);
  }, 120_000);

  it("fails closed when a terminal snapshot is missing one analyzable page summary", async () => {
    await seedCollectingSnapshot(sql, "report-missing", "snapshot-missing", [1, 2]);
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(
      createReportV4PageSummaryPostgresDatabase(sql)
    ));
    await repository.persist(persistenceInput("report-missing", "snapshot-missing", 1));
    await sql`UPDATE report_v4_site_snapshots SET status='completed',completed_at=now(),content_identity_hash=${hash("snapshot-missing")},
      candidate_url_count=2,analyzable_page_count=2,excluded_page_count=0 WHERE id='snapshot-missing'`;
    await expect(repository.loadForWebsiteSynthesis({
      reportId: "report-missing", snapshotId: "snapshot-missing", contentIdentityHash: hash("snapshot-missing")
    }))
      .rejects.toThrow(/every analyzable page|missing/i);
  }, 120_000);
});

async function seedCollectingSnapshot(
  sql: ReturnType<typeof postgres>, reportId: string, snapshotId: string, ordinals: readonly number[]
): Promise<void> {
  await sql`INSERT INTO scan_reports(id,url,site_key,report_locale,technical_status)
    VALUES(${reportId},${`https://${reportId}.example/`},${`${reportId}.example`},'en','completed')`;
  await sql`INSERT INTO report_v4_site_snapshots
    (id,report_id,site_key,status,captured_at,collector_config_identity_hash)
    VALUES(${snapshotId},${reportId},${`${reportId}.example`},'collecting',now(),${hash(`collector-${snapshotId}`)})`;
  for (const ordinal of ordinals) {
    const analyzable = ordinal <= 2;
    const pageId = `${snapshotId}-page-${ordinal}`;
    await sql`INSERT INTO report_v4_site_snapshot_pages
      (id,snapshot_id,ordinal,normalized_url,analyzable,read_mode,summary,retained_cleaned_text,content_hash,exclusion_reason)
      VALUES(${pageId},${snapshotId},${ordinal},${`https://example.com/${pageId}`},${analyzable},
       ${analyzable ? "direct_readable" : null},${analyzable ? `Collector ${ordinal}` : null},
       ${analyzable ? pageId : null},${analyzable ? hash(pageId) : null},${analyzable ? null : "excluded"})`;
  }
}

function persistenceInput(reportId: string, snapshotId: string, ordinal: number) {
  const pageId = `${snapshotId}-page-${ordinal}`;
  return {
    reportId, snapshotId, pageId, url: `https://example.com/${pageId}`,
    contentHash: hash(pageId), readability: "direct_readable" as const,
    sourceLength: 120, output: pageOutput(snapshotId, ordinal, "valid")
  };
}

function pageOutput(snapshotId: string, ordinal: number, label: string) {
  return { chunks: [{ order: 1, summary: `${label} page ${ordinal}`, sourceLocations: [{ locationId: `${snapshotId}-page-${ordinal}:0-20`, startOffset: 0, endOffset: 20 }] }] };
}

function quote(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function withDatabase(url: string, database: string): string {
  const parsed = new URL(url); parsed.pathname = `/${database}`; return parsed.toString();
}

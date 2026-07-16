import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMemoryReportV4PageSummaryStore,
  createPostgresReportV4PageSummaryStore,
  createReportV4PageSummaryRepository,
  type ReportV4PageSummaryPostgresDatabase,
  type ReportV4PageSummaryRow,
  type ReportV4PageSummarySnapshotRow,
  type ReportV4SnapshotPageRow
} from "./report-v4-page-summaries";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-04
describe("V4 hierarchical page-summary persistence", () => {
  it("strictly parses exact page context and refuses raw or unknown payload fields", async () => {
    const repository = memoryRepository();
    await expect(repository.persist({ ...input("page-1"), output: { ...output("one"), rawPrompt: "secret" } }))
      .rejects.toThrow(/unknown field rawPrompt/i);
    await expect(repository.persist({ ...input("page-1"), rawProviderResponse: "secret" } as never))
      .rejects.toThrow(/unknown field rawProviderResponse/i);
  });

  it("persists once, resumes exactly and fails closed on same-page drift", async () => {
    const repository = memoryRepository();
    const first = await repository.persist(input("page-1"));
    const resumed = await repository.persist(input("page-1"));
    expect(resumed).toEqual(first);
    expect(first.identityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.summary.chunks)).toBe(true);
    expect(first).not.toHaveProperty("rawHtml");
    await expect(repository.persist({ ...input("page-1"), output: output("drift") }))
      .rejects.toThrow(/drift|immutable|idempotency/i);
    await expect(repository.persist({ ...input("page-1"), sourceLength: 121 }))
      .rejects.toThrow(/drift|immutable|idempotency/i);
  });

  it("loads one strict frozen summary for every analyzable page in ordinal order", async () => {
    const collecting = memoryRepository();
    const second = await collecting.persist(input("page-2"));
    const first = await collecting.persist(input("page-1"));
    const repository = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
      snapshots: [snapshot("completed", 2)],
      pages: pages(),
      summaries: [storedRow(second), storedRow(first)]
    }));
    const loaded = await repository.loadForWebsiteSynthesis(exactLoad());
    expect(loaded.map(({ pageId }) => pageId)).toEqual(["page-1", "page-2"]);
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(Object.isFrozen(loaded[0]!.chunks[0]!.sourceLocations)).toBe(true);
  });

  it("fails closed on missing, extra and ineligible terminal snapshot summaries", async () => {
    const collecting = memoryRepository();
    const first = await collecting.persist(input("page-1"));
    const missing = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
      snapshots: [snapshot("completed", 2)], pages: pages(), summaries: [storedRow(first)]
    }));
    await expect(missing.loadForWebsiteSynthesis(exactLoad()))
      .rejects.toThrow(/every analyzable page|missing/i);

    const extra = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
      snapshots: [snapshot("completed", 2)],
      pages: [...pages(), { ...page("page-extra", 3), analyzable: false, readMode: null, contentHash: null }],
      summaries: [storedRow(first), { ...storedRow(first), pageId: "page-extra", identityHash: hash("extra") }]
    }));
    await expect(extra.loadForWebsiteSynthesis(exactLoad()))
      .rejects.toThrow(/extra|every analyzable page/i);

    for (const status of ["collecting", "unavailable", "custom_service"] as const) {
      const repository = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
        snapshots: [snapshot(status, status === "custom_service" ? 51 : 0)], pages: [], summaries: []
      }));
      await expect(repository.loadForWebsiteSynthesis(exactLoad()))
        .rejects.toThrow(/completed|eligible|terminal/i);
    }
  });

  it("uses a transaction and locks the exact collecting snapshot page in PostgreSQL", async () => {
    const statements: Array<{ sql: string; values: readonly unknown[] }> = [];
    const persisted: ReportV4PageSummaryRow[] = [];
    const database: ReportV4PageSummaryPostgresDatabase = {
      async transaction(work) {
        return work(async (strings, ...values) => {
          const statement = strings.join("?");
          statements.push({ sql: statement, values });
          if (statement.includes("FROM report_v4_site_snapshots snapshot")) return [postgresLineage()] as never;
          if (statement.includes("FROM report_v4_page_summaries") && statement.includes("page_id=")) {
            return persisted.map(postgresSummary) as never;
          }
          if (statement.includes("INSERT INTO report_v4_page_summaries")) {
            const row: ReportV4PageSummaryRow = {
              identityHash: String(values[0]), reportId: String(values[1]), snapshotId: String(values[2]),
              pageId: String(values[3]), contentHash: String(values[4]), sourceLength: Number(values[5]),
              chunks: JSON.parse(String(values[6]))
            };
            persisted.push(row);
            return [postgresSummary(row)] as never;
          }
          return [] as never;
        });
      }
    };
    const repository = createReportV4PageSummaryRepository(createPostgresReportV4PageSummaryStore(database));
    await repository.persist(input("page-1"));
    expect(statements[0]!.sql).toContain("FOR UPDATE OF snapshot,page");
    expect(statements.some(({ sql }) => sql.includes("::text::jsonb"))).toBe(true);
    expect(statements.flatMap(({ values }) => values).join(" ")).not.toMatch(/rawPrompt|rawProviderResponse|raw html/i);
  });
});

function memoryRepository() {
  return createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
    snapshots: [snapshot("collecting", 0)], pages: pages(), summaries: []
  }));
}

function snapshot(status: ReportV4PageSummarySnapshotRow["status"], analyzablePageCount: number): ReportV4PageSummarySnapshotRow {
  return {
    id: "snapshot-1", reportId: "report-1", status,
    contentIdentityHash: status === "collecting" ? null : hash("snapshot-1"), analyzablePageCount
  };
}

function exactLoad() {
  return { reportId: "report-1", snapshotId: "snapshot-1", contentIdentityHash: hash("snapshot-1") };
}

function page(id: string, ordinal: number): ReportV4SnapshotPageRow {
  return {
    id, snapshotId: "snapshot-1", ordinal, normalizedUrl: `https://example.com/${id}`,
    analyzable: true, readMode: "direct_readable", contentHash: hash(id)
  };
}

function pages(): ReportV4SnapshotPageRow[] {
  return [page("page-1", 1), page("page-2", 2)];
}

function input(pageId: "page-1" | "page-2") {
  return {
    reportId: "report-1", snapshotId: "snapshot-1", pageId,
    url: `https://example.com/${pageId}`, contentHash: hash(pageId),
    readability: "direct_readable" as const, sourceLength: 120, output: output(pageId)
  };
}

function output(label: string) {
  return { chunks: [{ order: 1, summary: `Summary ${label}`, sourceLocations: [{ locationId: `${label}:0-20`, startOffset: 0, endOffset: 20 }] }] };
}

function storedRow(value: Awaited<ReturnType<ReturnType<typeof memoryRepository>["persist"]>>): ReportV4PageSummaryRow {
  return {
    identityHash: value.identityHash, reportId: value.reportId, snapshotId: value.snapshotId,
    pageId: value.summary.pageId, contentHash: value.summary.contentHash,
    sourceLength: value.summary.sourceLength, chunks: value.summary.chunks
  };
}

function postgresLineage() {
  return {
    snapshot_id: "snapshot-1", report_id: "report-1", snapshot_status: "collecting", content_identity_hash: null,
    analyzable_page_count: 0,
    page_id: "page-1", ordinal: 1, normalized_url: "https://example.com/page-1", analyzable: true,
    read_mode: "direct_readable", content_hash: hash("page-1")
  };
}

function postgresSummary(row: ReportV4PageSummaryRow = {} as ReportV4PageSummaryRow) {
  return {
    identity_hash: row.identityHash, report_id: row.reportId, snapshot_id: row.snapshotId,
    page_id: row.pageId, content_hash: row.contentHash, source_length: row.sourceLength, chunks: row.chunks
  };
}

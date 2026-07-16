import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createMemoryReportV4PageSummaryStore,
  createPostgresReportV4PageSummaryStore,
  createReportV4PageSummaryRepository,
  loadReportV4PageSummaryByExactLineage,
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

  it("persists a terminal retained-text page once, resumes concurrently and performs zero fetches", async () => {
    const repository = memoryRepository();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("must not fetch or recrawl"));
    const [first, resumed] = await Promise.all([
      repository.persist(input("page-1")),
      repository.persist(input("page-1"))
    ]);
    expect(resumed).toEqual(first);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(first.identityHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.summary.chunks)).toBe(true);
    expect(first).not.toHaveProperty("rawHtml");
    await expect(repository.persist({ ...input("page-1"), output: output("drift") }))
      .rejects.toThrow(/drift|immutable|idempotency/i);
  });

  it("accepts completed_limited but rejects collecting, unavailable and custom_service snapshots", async () => {
    await expect(memoryRepository("completed_limited").persist(input("page-1"))).resolves.toBeDefined();
    for (const status of ["collecting", "unavailable", "custom_service"] as const) {
      await expect(memoryRepository(status).persist(input("page-1")))
        .rejects.toThrow(/completed|completed_limited|terminal/i);
    }
  });

  it("uses JavaScript UTF-16 source-location length for retained non-BMP text", async () => {
    const retainedCleanedText = "A\ud83d\ude00B";
    const exactPage = {
      ...page("page-1", 1),
      retainedCleanedText,
      contentHash: hash(retainedCleanedText)
    };
    const repository = memoryRepository("completed", [exactPage]);
    await expect(repository.persist({
      ...input("page-1"),
      contentHash: hash(retainedCleanedText),
      sourceLength: retainedCleanedText.length,
      output: {
        chunks: [{
          order: 1,
          summary: "Non-BMP source location",
          sourceLocations: [{ locationId: "astral:0-4", startOffset: 0, endOffset: 4 }]
        }]
      }
    })).resolves.toBeDefined();
    expect(retainedCleanedText.length).toBe(4);
  });

  it("rejects legacy null text and exact retained-text length, hash, URL, readability or lineage drift", async () => {
    const legacy = memoryRepository("completed", [{ ...page("page-1", 1), retainedCleanedText: null }]);
    await expect(legacy.persist(input("page-1"))).rejects.toThrow(/retained|legacy|text/i);

    await expect(memoryRepository().persist({ ...input("page-1"), sourceLength: input("page-1").sourceLength + 1 }))
      .rejects.toThrow(/source length|retained|drift/i);

    const hashDriftPage = { ...page("page-1", 1), contentHash: hash("not-the-retained-text") };
    await expect(memoryRepository("completed", [hashDriftPage]).persist({
      ...input("page-1"),
      contentHash: hashDriftPage.contentHash!
    })).rejects.toThrow(/content hash|retained|drift/i);

    await expect(memoryRepository().persist({ ...input("page-1"), url: "https://example.com/drift" }))
      .rejects.toThrow(/URL|drift/i);
    await expect(memoryRepository().persist({ ...input("page-1"), readability: "js_dependent" }))
      .rejects.toThrow(/readability|drift/i);
    await expect(memoryRepository().persist({ ...input("page-1"), reportId: "other-report" }))
      .rejects.toThrow(/lineage|not found/i);
    await expect(memoryRepository().persist({ ...input("page-1"), snapshotId: "other-snapshot" }))
      .rejects.toThrow(/lineage|not found/i);
    await expect(memoryRepository().persist({ ...input("page-1"), pageId: "other-page" }))
      .rejects.toThrow(/lineage|not found/i);
  });

  it("loads one strict frozen summary for every analyzable page in ordinal order", async () => {
    const terminal = memoryRepository();
    const second = await terminal.persist(input("page-2"));
    const first = await terminal.persist(input("page-1"));
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

  it("loads only an exact persisted page by immutable URL and content lineage", async () => {
    const terminal = memoryRepository();
    const persisted = await terminal.persist(input("page-1"));
    const repository = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
      snapshots: [snapshot("completed", 2)], pages: pages(), summaries: [storedRow(persisted)]
    }));
    await expect(loadReportV4PageSummaryByExactLineage({
      reportId: "report-1", snapshotId: "snapshot-1", pageUrl: "https://example.com/page-1", contentHash: hash(retainedText("page-1"))
    }, repository)).resolves.toEqual(persisted.summary);
    await expect(loadReportV4PageSummaryByExactLineage({
      reportId: "report-1", snapshotId: "snapshot-1", pageUrl: "https://example.com/page-1", contentHash: hash("drift")
    }, repository)).resolves.toBeNull();
    await expect(loadReportV4PageSummaryByExactLineage({
      reportId: "other-report", snapshotId: "snapshot-1", pageUrl: "https://example.com/page-1", contentHash: hash(retainedText("page-1"))
    }, repository)).resolves.toBeNull();
  });

  it("fails closed on missing, extra and ineligible terminal snapshot summaries", async () => {
    const terminal = memoryRepository();
    const first = await terminal.persist(input("page-1"));
    const missing = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
      snapshots: [snapshot("completed", 2)], pages: pages(), summaries: [storedRow(first)]
    }));
    await expect(missing.loadForWebsiteSynthesis(exactLoad()))
      .rejects.toThrow(/every analyzable page|missing/i);

    const extra = createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
      snapshots: [snapshot("completed", 2)],
      pages: [...pages(), { ...page("page-extra", 3), analyzable: false, readMode: null, contentHash: null, retainedCleanedText: null }],
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

  it("uses a transaction and locks the exact terminal retained-text snapshot page in PostgreSQL", async () => {
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

function memoryRepository(
  status: ReportV4PageSummarySnapshotRow["status"] = "completed",
  seededPages: readonly ReportV4SnapshotPageRow[] = pages()
) {
  return createReportV4PageSummaryRepository(createMemoryReportV4PageSummaryStore({
    snapshots: [snapshot(status, seededPages.filter(({ analyzable }) => analyzable).length)],
    pages: seededPages,
    summaries: []
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
  const text = retainedText(id);
  return {
    id, snapshotId: "snapshot-1", ordinal, normalizedUrl: `https://example.com/${id}`,
    analyzable: true, readMode: "direct_readable", contentHash: hash(text), retainedCleanedText: text
  };
}

function pages(): ReportV4SnapshotPageRow[] {
  return [page("page-1", 1), page("page-2", 2)];
}

function input(pageId: "page-1" | "page-2") {
  const text = retainedText(pageId);
  return {
    reportId: "report-1", snapshotId: "snapshot-1", pageId,
    url: `https://example.com/${pageId}`, contentHash: hash(text),
    readability: "direct_readable" as const, sourceLength: text.length, output: output(pageId)
  };
}

function retainedText(pageId: string): string {
  return `${pageId}:`.padEnd(120, "x");
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
  const text = retainedText("page-1");
  return {
    snapshot_id: "snapshot-1", report_id: "report-1", snapshot_status: "completed",
    content_identity_hash: hash("snapshot-1"), analyzable_page_count: 2,
    page_id: "page-1", ordinal: 1, normalized_url: "https://example.com/page-1", analyzable: true,
    read_mode: "direct_readable", retained_cleaned_text: text, content_hash: hash(text)
  };
}

function postgresSummary(row: ReportV4PageSummaryRow = {} as ReportV4PageSummaryRow) {
  return {
    identity_hash: row.identityHash, report_id: row.reportId, snapshot_id: row.snapshotId,
    page_id: row.pageId, content_hash: row.contentHash, source_length: row.sourceLength, chunks: row.chunks
  };
}

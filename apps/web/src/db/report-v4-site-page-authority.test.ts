import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  loadReportV4SitePageAuthority,
  loadReportV4SitePageAuthorityInTransaction,
  type ReportV4SitePageAuthorityTransactionSql
} from "./report-v4-site-page-authority";

const SESSION = "11111111-1111-4111-8111-111111111111";
const SCENARIO = "22222222-2222-4222-8222-222222222222";
const REPORT = "report-v4";
const JOB = "job-core";
const SNAPSHOT = "snapshot-v4";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("Report V4 site/page transaction authority", () => {
  it("projects golden hash-only exact slots and uses the V38 identity-set formula", async () => {
    const fixture = authorityFixture();
    const result = await loadReportV4SitePageAuthorityInTransaction(fixture.tx, input());
    expect(result.siteSnapshotPages.recordCount).toBe(2);
    expect(result.pageSummaryIntegrity.recordCount).toBe(1);
    expect(result.siteSnapshotPages.records.map(({ ordinal }) => ordinal)).toEqual([1, 2]);
    expect(result.pageSummaryIntegrity.records[0]).toMatchObject({
      contentHash: sha(fixture.retainedText),
      sourceLength: fixture.retainedText.length,
      websiteInputSetHash: result.websiteInputSetHash
    });
    expect(result.siteSnapshotPages.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.pageSummaryIntegrity.canonicalHash).toMatch(/^[a-f0-9]{64}$/u);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("https://example.com");
    expect(serialized).not.toContain(fixture.retainedText);
    expect(serialized).not.toContain("page-v4-1");
    expect(Object.isFrozen(result.siteSnapshotPages.records)).toBe(true);
  });

  it("public wrapper opens one RR/RO transaction and the in-transaction loader opens none", async () => {
    const fixture = authorityFixture();
    const begin = vi.fn(async (_options: string, work: (tx: ReportV4SitePageAuthorityTransactionSql) => Promise<unknown>) => work(fixture.tx));
    await loadReportV4SitePageAuthority({ begin }, input());
    expect(begin).toHaveBeenCalledOnce();
    expect(begin).toHaveBeenCalledWith("isolation level repeatable read read only", expect.any(Function));
    await loadReportV4SitePageAuthorityInTransaction(fixture.tx, input());
    expect(begin).toHaveBeenCalledOnce();
  });

  it.each([
    ["stored page content hash", (fixture: Fixture) => { fixture.pages[0]!.content_hash = sha("tampered"); }, /content hash/i],
    ["snapshot content identity", (fixture: Fixture) => { fixture.binding.content_identity_hash = sha("tampered"); }, /snapshot content identity/i],
    ["stored summary identity", (fixture: Fixture) => { fixture.summaries[0]!.identity_hash = sha("tampered"); }, /identity hash/i],
    ["stored summary source length", (fixture: Fixture) => { fixture.summaries[0]!.source_length = 1; }, /source length/i],
    ["stored summary chunks", (fixture: Fixture) => { fixture.summaries[0]!.chunks = { invalid: true }; }, /chunks|output|object/i]
  ])("rejects %s tamper after recomputation", async (_label, mutate, pattern) => {
    const fixture = authorityFixture();
    mutate(fixture);
    await expect(loadReportV4SitePageAuthorityInTransaction(fixture.tx, input())).rejects.toThrow(pattern);
  });

  it("rejects missing, duplicate and extra page summaries", async () => {
    const missing = authorityFixture();
    missing.summaries.length = 0;
    await expect(loadReportV4SitePageAuthorityInTransaction(missing.tx, input())).rejects.toThrow(/exactly one summary/i);

    const duplicate = authorityFixture();
    duplicate.summaries.push({ ...duplicate.summaries[0]! });
    await expect(loadReportV4SitePageAuthorityInTransaction(duplicate.tx, input())).rejects.toThrow(/exactly one summary|unique/i);

    const extra = authorityFixture();
    extra.summaries[0]!.page_id = "extra-page";
    await expect(loadReportV4SitePageAuthorityInTransaction(extra.tx, input())).rejects.toThrow(/extra|non-analyzable/i);
  });

  it("is deterministic under row-order drift and rejects 0/51 selected-page bounds", async () => {
    const ordered = authorityFixture();
    const first = await loadReportV4SitePageAuthorityInTransaction(ordered.tx, input());
    const reordered = authorityFixture();
    reordered.pages.reverse();
    const second = await loadReportV4SitePageAuthorityInTransaction(reordered.tx, input());
    expect(second).toEqual(first);

    const empty = authorityFixture();
    empty.pages.length = 0;
    await expect(loadReportV4SitePageAuthorityInTransaction(empty.tx, input())).rejects.toThrow(/between 1 and 50/i);

    const oversized = authorityFixture();
    oversized.pages.push(...Array.from({ length: 49 }, (_, index) => ({ ...oversized.pages[1]!, id: `excluded-${index}`,
      ordinal: index + 3, normalized_url: `https://example.com/excluded-${index}` })));
    await expect(loadReportV4SitePageAuthorityInTransaction(oversized.tx, input())).rejects.toThrow(/between 1 and 50/i);
  });

  it("rejects exact scenario/report/job/snapshot lineage drift", async () => {
    for (const field of ["job_report_id", "job_site_snapshot_id", "snapshot_report_id"] as const) {
      const fixture = authorityFixture();
      fixture.binding[field] = "wrong";
      await expect(loadReportV4SitePageAuthorityInTransaction(fixture.tx, input())).rejects.toThrow(/lineage|mismatch/i);
    }
  });
});

type Fixture = ReturnType<typeof authorityFixture>;

function authorityFixture() {
  const retainedText = "Canonical retained evidence for page one.";
  const pages: Record<string, unknown>[] = [{
    id: "page-v4-1", snapshot_id: SNAPSHOT, ordinal: 1,
    normalized_url: "https://example.com/", analyzable: true, read_mode: "direct_readable",
    summary: "Home page", retained_cleaned_text: retainedText, content_hash: sha(retainedText), exclusion_reason: null
  }, {
    id: "page-v4-2", snapshot_id: SNAPSHOT, ordinal: 2,
    normalized_url: "https://example.com/excluded", analyzable: false, read_mode: null,
    summary: null, retained_cleaned_text: null, content_hash: null, exclusion_reason: "blocked"
  }];
  const snapshotContent = sha(JSON.stringify({
    status: "completed_limited",
    candidateUrlCount: 2,
    pages: pages.map((row) => ({
      id: row.id, ordinal: row.ordinal, normalizedUrl: row.normalized_url, analyzable: row.analyzable,
      readMode: row.read_mode, summary: row.summary, retainedText: row.retained_cleaned_text,
      contentHash: row.content_hash, exclusionReason: row.exclusion_reason
    }))
  }));
  const chunks = [{ order: 1, summary: "Canonical page summary", sourceLocations: [{
    locationId: "page-v4-1:0-20", startOffset: 0, endOffset: 20
  }] }];
  const identityHash = stableHash({ snapshotId: SNAPSHOT, pageId: "page-v4-1", contentHash: sha(retainedText),
    sourceLength: retainedText.length, chunks });
  const binding: Record<string, unknown> = {
    session_id: SESSION, scenario_id: SCENARIO, report_id: REPORT, core_job_id: JOB, site_snapshot_id: SNAPSHOT,
    job_report_id: REPORT, job_site_snapshot_id: SNAPSHOT, snapshot_id: SNAPSHOT, snapshot_report_id: REPORT,
    snapshot_status: "completed_limited", collector_config_identity_hash: sha("collector"),
    content_identity_hash: snapshotContent, candidate_url_count: 2, analyzable_page_count: 1, excluded_page_count: 1
  };
  const summaries: Record<string, unknown>[] = [{
    identity_hash: identityHash, report_id: REPORT, snapshot_id: SNAPSHOT, page_id: "page-v4-1",
    content_hash: sha(retainedText), source_length: retainedText.length, chunks
  }];
  const tx: ReportV4SitePageAuthorityTransactionSql = {
    async unsafe<T extends Record<string, unknown>[]>(query: string): Promise<T> {
      if (query.includes("group1-binding")) return [binding] as T;
      if (query.includes("group1-pages")) return [...pages].sort((a, b) => Number(a.ordinal) - Number(b.ordinal)) as T;
      if (query.includes("group1-page-summaries")) return [...summaries].sort((a, b) => String(a.page_id).localeCompare(String(b.page_id))) as T;
      throw new Error(`unexpected query: ${query}`);
    }
  };
  return { retainedText, binding, pages, summaries, tx };
}

function input() { return { sessionId: SESSION, scenarioId: SCENARIO, phase: "baseline" as const }; }

function stableHash(value: unknown): string { return sha(stableJson(value)); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}

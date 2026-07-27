import { describe, expect, it, vi } from "vitest";
import { ReportV4MimoSiteSynthesisOutputError } from "../report-v4/mimo-site-synthesis-provider";
import { createReportV4ProductionPageAnalysis } from "./report-v4-page-analysis-production";

// @requirement GEO-V4-TOKEN-01
// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-CRAWL-04

const base = {
  reportId: "r1", siteSnapshotId: "s1", pageId: "p1", url: "https://example.com/",
  contentHash: "a".repeat(64), readability: "direct_readable" as const, sourceLength: 8,
  retainedText: "retained", snapshotContentIdentityHash: "b".repeat(64), signal: new AbortController().signal
};
const summary = { pageId: "p1", url: base.url, contentHash: base.contentHash, readability: base.readability, sourceLength: 8,
  chunks: [{ order: 1, summary: "ok", sourceLocations: [{ locationId: "l1", startOffset: 0, endOffset: 7 }] }] };

function harness(existing: typeof summary | null = null) {
  const load = vi.fn(async () => existing);
  const analyze = vi.fn(async () => summary);
  const persist = vi.fn(async (input: { reportId: string; snapshotId: string }) => ({ identityHash: "x", reportId: input.reportId, snapshotId: input.snapshotId, summary }));
  const repository = { persist, loadForWebsiteSynthesis: vi.fn(), loadByExactLineage: vi.fn() } as unknown as import("../db/report-v4-page-summaries").ReportV4PageSummaryRepository;
  const run = createReportV4ProductionPageAnalysis({ repository, loadExactSummary: load, provider: { analyzePage: analyze }, persist });
  return { run, load, analyze, persist };
}

describe("production V4 page-analysis adapter", () => {
  it("reuses exact lineage without a provider call", async () => {
    const h = harness(summary);
    await expect(h.run(base)).resolves.toMatchObject({ providerCalls: 0, reused: true, summary });
    expect(h.analyze).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("analyzes and persists one bounded page on an exact miss", async () => {
    const h = harness();
    await expect(h.run(base)).resolves.toMatchObject({ providerCalls: 1, reused: false, summary });
    expect(h.analyze).toHaveBeenCalledWith({ context: expect.objectContaining({ pageId: "p1", sourceLength: 8 }), retainedText: "retained" }, base.signal);
    expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({
      reportId: "r1",
      snapshotId: "s1",
      pageId: "p1",
      output: { chunks: [expect.objectContaining({ sourceLocations: [expect.objectContaining({ locationId: expect.stringMatching(/^location-[a-f0-9]{64}-1-1$/u) })] })] }
    }));
  });

  it("retries one classified provider-contract failure and counts both calls", async () => {
    const h = harness();
    h.analyze
      .mockRejectedValueOnce(new ReportV4MimoSiteSynthesisOutputError("invalid output"))
      .mockResolvedValueOnce(summary);

    await expect(h.run(base)).resolves.toMatchObject({ providerCalls: 2, reused: false, summary });
    expect(h.analyze).toHaveBeenCalledTimes(2);
  });

  it("does not retry unclassified provider failures", async () => {
    const h = harness();
    h.analyze.mockRejectedValueOnce(new Error("transport failed"));

    await expect(h.run(base)).rejects.toThrow(/transport failed/i);
    expect(h.analyze).toHaveBeenCalledTimes(1);
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("rejects malicious identity before loading", async () => {
    const h = harness();
    await expect(h.run({ ...base, contentHash: "not-hash" })).rejects.toThrow(/identity|invalid/i);
    expect(h.load).not.toHaveBeenCalled();
    expect(h.analyze).not.toHaveBeenCalled();
  });

  it("does not persist after abort", async () => {
    const h = harness();
    const controller = new AbortController();
    h.analyze.mockImplementationOnce(async () => { controller.abort(); return summary; });
    await expect(h.run({ ...base, signal: controller.signal })).rejects.toBeDefined();
    expect(h.persist).not.toHaveBeenCalled();
  });

  it("does not reuse another report or snapshot", async () => {
    const h = harness();
    await h.run(base);
    expect(h.load).toHaveBeenCalledWith(expect.objectContaining({ reportId: "r1", snapshotId: "s1", pageUrl: base.url, contentHash: base.contentHash, snapshotContentIdentityHash: base.snapshotContentIdentityHash }));
  });
});

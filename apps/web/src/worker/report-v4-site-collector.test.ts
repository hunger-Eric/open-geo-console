import { describe, expect, it, vi } from "vitest";
import {
  collectReportV4Site,
  type ReportV4HtmlRead,
  type ReportV4SiteCandidate,
  type ReportV4SiteCollectorDependencies
} from "./report-v4-site-collector";

// @requirement GEO-V4-CRAWL-02
// @requirement GEO-V4-CRAWL-03

function candidate(index = 1, overrides: Partial<ReportV4SiteCandidate> = {}): ReportV4SiteCandidate {
  return {
    siteUrl: "https://example.com/",
    url: `https://example.com/page-${index}`,
    networkSafety: "public",
    access: "public",
    contentType: "text/html",
    ...overrides
  };
}

function read(index = 1, overrides: Partial<ReportV4HtmlRead> = {}): ReportV4HtmlRead {
  return {
    url: `https://example.com/page-${index}`,
    networkSafety: "public",
    access: "public",
    contentType: "text/html; charset=utf-8",
    html: `readable page ${index}`,
    ...overrides
  };
}

function dependencies(overrides: Partial<ReportV4SiteCollectorDependencies> = {}): ReportV4SiteCollectorDependencies {
  return {
    readRawHtml: vi.fn(async (value) => read(Number(value.url.match(/(\d+)$/)?.[1] ?? "1"))),
    renderBrowserHtml: vi.fn(async (url) => read(Number(url.match(/(\d+)$/)?.[1] ?? "1"))),
    extractAnalyzableText: vi.fn((value) => value.html === "EMPTY" ? "" : value.html),
    ...overrides
  };
}

describe("V4 site collector", () => {
  it("admits sufficient raw HTML as direct_readable without launching a browser", async () => {
    const deps = dependencies();
    const result = await collectReportV4Site([candidate()], deps);

    expect(result).toMatchObject({ outcome: "standard", analyzablePageCount: 1 });
    expect(result.pages).toEqual([
      expect.objectContaining({ normalizedUrl: "https://example.com/page-1", readability: "direct_readable" })
    ]);
    expect(deps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserHtml).not.toHaveBeenCalled();
  });

  it("uses exactly one browser render only after safely fetched raw HTML is insufficient", async () => {
    const deps = dependencies({
      readRawHtml: vi.fn(async () => read(1, { html: "EMPTY" })),
      renderBrowserHtml: vi.fn(async () => read(1, { html: "browser readable" }))
    });
    const result = await collectReportV4Site([candidate()], deps);

    expect(result.pages).toEqual([
      expect.objectContaining({ analyzableText: "browser readable", readability: "js_dependent" })
    ]);
    expect(deps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserHtml).toHaveBeenCalledTimes(1);
  });

  it("reclassifies browser output and records empty/error outcomes without retrying", async () => {
    const emptyDeps = dependencies({
      readRawHtml: vi.fn(async () => read(1, { html: "EMPTY" })),
      renderBrowserHtml: vi.fn(async () => read(1, { html: "EMPTY" }))
    });
    const empty = await collectReportV4Site([candidate()], emptyDeps);
    expect(empty).toMatchObject({ outcome: "unavailable", analyzablePageCount: 0 });
    expect(empty.exclusions).toContainEqual(expect.objectContaining({ reason: "empty_analyzable_body" }));
    expect(emptyDeps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(emptyDeps.renderBrowserHtml).toHaveBeenCalledTimes(1);

    const errorDeps = dependencies({
      readRawHtml: vi.fn(async () => read(1, { html: "EMPTY" })),
      renderBrowserHtml: vi.fn(async () => { throw new Error("browser unavailable"); })
    });
    const failed = await collectReportV4Site([candidate()], errorDeps);
    expect(failed.exclusions).toContainEqual(expect.objectContaining({ reason: "browser_render_failed" }));
    expect(errorDeps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(errorDeps.renderBrowserHtml).toHaveBeenCalledTimes(1);
  });

  it("treats raw transport failure as an exclusion and never converts it into browser fallback", async () => {
    const deps = dependencies({
      readRawHtml: vi.fn(async () => { throw new Error("transport failed"); })
    });
    const result = await collectReportV4Site([candidate()], deps);

    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason: "raw_fetch_failed" }));
    expect(deps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserHtml).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-site redirect", { url: "https://elsewhere.test/page-1" }, "cross_site"],
    ["unsafe redirect", { networkSafety: "unsafe" as const }, "unsafe_network"],
    ["non-HTML response", { contentType: "application/pdf" }, "non_html_content_type"]
  ] as const)("rejects raw %s metadata before extracting its body", async (_label, readOverrides, reason) => {
    const deps = dependencies({
      readRawHtml: vi.fn(async () => read(1, readOverrides))
    });

    const result = await collectReportV4Site([candidate()], deps);
    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason }));
    expect(deps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(deps.extractAnalyzableText).not.toHaveBeenCalled();
    expect(deps.renderBrowserHtml).not.toHaveBeenCalled();
  });

  it.each([
    ["cross-site redirect", { url: "https://elsewhere.test/page-1" }, "cross_site"],
    ["unsafe redirect", { networkSafety: "unsafe" as const }, "unsafe_network"],
    ["non-HTML response", { contentType: "application/pdf" }, "non_html_content_type"]
  ] as const)("rejects browser %s metadata before a second extraction", async (_label, readOverrides, reason) => {
    const deps = dependencies({
      readRawHtml: vi.fn(async () => read(1, { html: "EMPTY" })),
      renderBrowserHtml: vi.fn(async () => read(1, readOverrides))
    });

    const result = await collectReportV4Site([candidate()], deps);
    expect(result.exclusions).toContainEqual(expect.objectContaining({ reason }));
    expect(deps.readRawHtml).toHaveBeenCalledTimes(1);
    expect(deps.renderBrowserHtml).toHaveBeenCalledTimes(1);
    expect(deps.extractAnalyzableText).toHaveBeenCalledTimes(1);
  });

  it("never browser-renders PDF, known non-HTML, cross-site or unsafe candidates", async () => {
    const deps = dependencies();
    const result = await collectReportV4Site([
      candidate(1, { url: "https://example.com/catalog.pdf" }),
      candidate(2, { contentType: "application/pdf" }),
      candidate(3, { url: "https://elsewhere.test/page-3" }),
      candidate(4, { networkSafety: "unsafe" })
    ], deps);

    expect(result.outcome).toBe("unavailable");
    expect(result.exclusions.map(({ reason }) => reason)).toEqual([
      "excluded_document_type",
      "non_html_content_type",
      "cross_site",
      "unsafe_network"
    ]);
    expect(deps.readRawHtml).not.toHaveBeenCalled();
    expect(deps.renderBrowserHtml).not.toHaveBeenCalled();
  });

  it("does not consume capacity for exclusions or page failures and admits exactly fifty", async () => {
    const deps = dependencies({
      readRawHtml: vi.fn(async (value) => {
        if (value.url.includes("failed")) throw new Error("failed");
        return read(Number(value.url.match(/(\d+)$/)?.[1] ?? "1"), { url: value.url });
      })
    });
    const excluded = Array.from({ length: 25 }, (_, index) =>
      candidate(index + 1, { url: `https://example.com/excluded-${index + 1}.pdf` })
    );
    const failed = Array.from({ length: 25 }, (_, index) =>
      candidate(index + 1, { url: `https://example.com/failed-${index + 1}` })
    );
    const accepted = Array.from({ length: 50 }, (_, index) => candidate(index + 1));

    const result = await collectReportV4Site([...excluded, ...failed, ...accepted], deps);
    expect(result).toMatchObject({ outcome: "standard", analyzablePageCount: 50 });
    expect(result.pages).toHaveLength(50);
    expect(deps.readRawHtml).toHaveBeenCalledTimes(75);
    expect(deps.renderBrowserHtml).not.toHaveBeenCalled();
  });

  it("stops on the fifty-first admitted page and retains exactly the threshold evidence", async () => {
    const deps = dependencies();
    const candidates = Array.from({ length: 52 }, (_, index) => candidate(index + 1));

    const result = await collectReportV4Site(candidates, deps);
    expect(result).toMatchObject({ outcome: "custom_service", analyzablePageCount: 51 });
    expect(result.pages).toHaveLength(51);
    expect(result.pages[0]).toMatchObject({
      normalizedUrl: "https://example.com/page-1",
      analyzableText: "readable page 1",
      readability: "direct_readable"
    });
    expect(result.pages[50]).toMatchObject({
      normalizedUrl: "https://example.com/page-51",
      analyzableText: "readable page 51",
      readability: "direct_readable"
    });
    expect(deps.readRawHtml).toHaveBeenCalledTimes(51);
    expect(deps.readRawHtml).not.toHaveBeenCalledWith(candidate(52), expect.anything());
    expect(deps.renderBrowserHtml).not.toHaveBeenCalled();
  });

  it("deduplicates normalized URLs before the threshold and still stops on 51 unique pages", async () => {
    const deps = dependencies();
    const duplicateFirstPage = candidate(999, { url: "https://EXAMPLE.com/page-1#duplicate" });
    const uniqueCandidates = Array.from({ length: 52 }, (_, index) => candidate(index + 1));

    const result = await collectReportV4Site([
      uniqueCandidates[0]!,
      duplicateFirstPage,
      ...uniqueCandidates.slice(1)
    ], deps);

    expect(result).toMatchObject({ outcome: "custom_service", analyzablePageCount: 51 });
    expect(result.pages).toHaveLength(51);
    expect(new Set(result.pages.map(({ normalizedUrl }) => normalizedUrl))).toHaveLength(51);
    expect(result.exclusions).toContainEqual(expect.objectContaining({
      normalizedUrl: "https://example.com/page-1",
      reason: "duplicate"
    }));
    expect(deps.readRawHtml).toHaveBeenCalledTimes(52);
    expect(deps.readRawHtml).not.toHaveBeenCalledWith(candidate(52), expect.anything());
  });

  it("passes the caller abort/deadline signal unchanged to raw and browser dependencies", async () => {
    const controller = new AbortController();
    const deps = dependencies({
      readRawHtml: vi.fn(async () => read(1, { html: "EMPTY" })),
      renderBrowserHtml: vi.fn(async () => read(1, { html: "browser readable" }))
    });

    await collectReportV4Site([candidate()], deps, controller.signal);
    expect(deps.readRawHtml).toHaveBeenCalledWith(candidate(), controller.signal);
    expect(deps.renderBrowserHtml).toHaveBeenCalledWith("https://example.com/page-1", controller.signal);
  });
});

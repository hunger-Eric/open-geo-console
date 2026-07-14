import { afterEach, describe, expect, it, vi } from "vitest";
import {
  auditSite,
  buildFindings,
  calculateScore,
  createFinding,
  extractSitemapUrls,
  projectHomepageReport,
  selectRepresentativePages,
  type AuditedPage,
  type GeoFinding,
  type MachineReadableAssets
} from "./index";

describe("geo auditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts sitemap URLs", () => {
    expect(
      extractSitemapUrls(
        "<urlset><url><loc>https://example.com/</loc></url><url><loc>/about</loc></url></urlset>",
        new URL("https://example.com/")
      )
    ).toEqual(["https://example.com/", "https://example.com/about"]);
  });

  it("selects representative pages from sitemap candidates", () => {
    const pages = selectRepresentativePages(new URL("https://example.com/"), [
      "https://example.com/blog/launch",
      "https://example.com/services",
      "https://example.com/about",
      "https://other.example.com/products"
    ]);

    expect(pages).toEqual(
      expect.arrayContaining([
        "https://example.com/",
        "https://example.com/services",
        "https://example.com/blog/launch",
        "https://example.com/about"
      ])
    );
    expect(pages).not.toContain("https://other.example.com/products");
  });

  it("returns stable findings for missing llms, schema, sitemap, and 404 pages", async () => {
    const responses = new Map<string, Response>([
      [
        "https://example.com/",
        new Response(
          "<html><head><title>Example</title><meta name=\"description\" content=\"Short\"></head><body><h1>Example</h1><p>tiny</p></body></html>",
          { status: 200 }
        )
      ],
      ["https://example.com/robots.txt", new Response("User-agent: *", { status: 200 })],
      ["https://example.com/sitemap.xml", new Response("", { status: 404 })],
      ["https://example.com/llms.txt", new Response("", { status: 404 })]
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => responses.get(url)?.clone() ?? new Response("", { status: 404 }))
    );

    const report = await auditSite("https://example.com");
    expect(report.machineReadableAssets.llmsTxt.present).toBe(false);
    expect(report.machineReadableAssets.sitemapXml.present).toBe(false);
    expect(report.findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining(["missing-llms", "missing-sitemap"])
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        id: "missing-llms",
        messageKey: "asset.missingLlmsTxt",
        params: { assetPath: "/llms.txt" },
        title: "Missing llms.txt"
      })
    );
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        messageKey: "page.missingJsonLd",
        title: "Missing JSON-LD schema"
      })
    );
    expect(report.score).toBeLessThan(90);
  });

  it("audits only the homepage when the page limit is one", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "https://example.com/") {
        return Promise.resolve(new Response("<html><head><title>Home</title></head><body><h1>Home</h1></body></html>"));
      }
      if (url === "https://example.com/sitemap.xml") {
        return Promise.resolve(new Response("<urlset><url><loc>https://example.com/about</loc></url></urlset>"));
      }
      return Promise.resolve(new Response("", { status: 404 }));
    });

    const report = await auditSite("https://example.com", { fetchImpl: fetchMock as typeof fetch, pageLimit: 1 });

    expect(report.pages.map(({ url }) => url)).toEqual(["https://example.com/"]);
    expect(fetchMock).not.toHaveBeenCalledWith("https://example.com/about");
  });

  it("audits an explicit deep page set without adding sitemap pages", async () => {
    const requested: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      requested.push(url);
      if (url === "https://example.com/sitemap.xml") {
        return new Response("<urlset><url><loc>https://example.com/not-planned</loc></url></urlset>");
      }
      return new Response("<html><head><title>Page</title></head><body><h1>Page</h1></body></html>");
    });

    const report = await auditSite("https://example.com", {
      fetchImpl: fetchMock as typeof fetch,
      pageUrls: ["https://example.com/", "https://example.com/about"]
    });

    expect(report.pages.map(({ url }) => url)).toEqual(["https://example.com/", "https://example.com/about"]);
    expect(requested).not.toContain("https://example.com/not-planned");
  });

  it("projects legacy reports to a recalculated homepage-only report", () => {
    const report: Parameters<typeof projectHomepageReport>[0] = {
      url: "https://example.com/",
      scannedAt: "2026-07-10T00:00:00.000Z",
      score: 0,
      findings: [],
      recommendations: [],
      pages: [
        page("https://example.com/", { hasJsonLd: false }),
        page("https://example.com/about", { status: 404 })
      ],
      machineReadableAssets: availableAssets()
    };

    const projected = projectHomepageReport(report);

    expect(projected.pages).toHaveLength(1);
    expect(projected.pages[0]?.url).toBe("https://example.com/");
    expect(projected.findings.map(({ messageKey }) => messageKey)).toContain("page.missingJsonLd");
    expect(projected.findings.map(({ messageKey }) => messageKey)).not.toContain("page.badStatus");
    expect(projected.score).toBeGreaterThan(0);
  });

  it("creates keyed findings with params while preserving rendered fallback copy", () => {
    const finding = createFinding({
      id: "bad-status-test",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/missing",
        status: 404
      },
      url: "https://example.com/missing"
    });

    expect(finding).toMatchObject({
      id: "bad-status-test",
      severity: "critical",
      messageKey: "page.badStatus",
      params: {
        url: "https://example.com/missing",
        status: 404
      },
      title: "Page returned an error status",
      description: "https://example.com/missing returned HTTP 404.",
      recommendation: "Fix broken canonical pages or remove them from the sitemap."
    });
  });

  it("keeps only the root status finding for non-2xx pages", () => {
    const findings = buildFindings(
      "https://example.com/",
      [page("https://example.com/missing", { status: 404 })],
      availableAssets()
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      messageKey: "page.badStatus",
      url: "https://example.com/missing",
      aggregation: {
        affectedCount: 1,
        representativeUrls: ["https://example.com/missing"]
      }
    });
    expect(findings.map(({ messageKey }) => messageKey)).not.toContain("homepage.missingOpenGraph");
  });

  it("aggregates the same rule, page type, and query template with at most three representative URLs", () => {
    const pages = Array.from({ length: 10 }, (_, index) =>
      page(`https://example.com/index.php?route=product/product&product_id=${index + 1}`, {
        status: 404
      })
    );

    const findings = buildFindings("https://example.com/", pages, availableAssets());

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      messageKey: "page.badStatus",
      aggregation: {
        affectedCount: 10,
        pageType: "product",
        templateKey: "/index.php?product_id=:id&route=product/product"
      }
    });
    expect(findings[0].aggregation?.representativeUrls).toHaveLength(3);
    expect(findings[0].url).toBe(findings[0].aggregation?.representativeUrls[0]);
  });

  it("keeps the same rule in separate page-type and template groups", () => {
    const findings = buildFindings(
      "https://example.com/",
      [
        page("https://example.com/products/widget", { status: 404 }),
        page("https://example.com/services/freight", { status: 404 })
      ],
      availableAssets()
    );

    expect(findings).toHaveLength(2);
    expect(findings.map(({ aggregation }) => aggregation?.pageType).sort()).toEqual(["product", "service"]);
  });

  it("caps penalties globally by message key after aggregation", () => {
    const firstStatusGroup = aggregatedFinding("page.badStatus", 5, "product", "/products/:slug");
    const secondStatusGroup = aggregatedFinding("page.badStatus", 5, "service", "/services/:slug");
    const warning = aggregatedFinding("page.h1Structure", 10, "product", "/products/:slug");
    const info = aggregatedFinding("page.missingCanonical", 10, "product", "/products/:slug");

    expect(calculateScore([firstStatusGroup, secondStatusGroup], [])).toBe(58);
    expect(calculateScore([warning], [])).toBe(72);
    expect(calculateScore([info], [])).toBe(82);
  });

  it("preserves the original penalty for a single occurrence", () => {
    expect(calculateScore([aggregatedFinding("page.badStatus", 1)], [])).toBe(70);
    expect(calculateScore([aggregatedFinding("page.h1Structure", 1)], [])).toBe(80);
    expect(calculateScore([aggregatedFinding("page.missingCanonical", 1)], [])).toBe(85);
  });

  it("emits one grouped GEO finding for exact duplicate titles", () => {
    const pages = [
      page("https://example.com/first", { title: "Shared service title" }),
      page("https://example.com/second", { title: " shared   service title " })
    ];

    const findings = buildFindings("https://example.com/", pages, availableAssets());
    const titleFindings = findings.filter(({ messageKey }) =>
      messageKey === "page.duplicateTitles" || messageKey === "page.dominantTitleTemplate"
    );

    expect(titleFindings).toHaveLength(1);
    expect(titleFindings[0]).toMatchObject({
      severity: "warning",
      messageKey: "page.duplicateTitles",
      params: { patternPosition: "full", affectedCount: 2 },
      aggregation: {
        affectedCount: 2,
        representativeUrls: ["https://example.com/first", "https://example.com/second"],
        templateKey: "title-pattern:exact_duplicate"
      }
    });
  });

  it("emits one grouped GEO finding for a dominant title suffix with capped scoring", () => {
    const shared = "凌顺国际物流-16年老牌货代，专业提供台湾海快专线、台湾海运专线、菲律宾海运专线及跨境物流实时追踪";
    const names = ["首页", "国际转运流程", "集团简介", "新闻动态", "国际集运"];
    const pages = names.map((name, index) =>
      page(`https://example.com/${index || ""}`, {
        title: index === 0 ? shared : `${name}-${shared}`
      })
    );

    const findings = buildFindings("https://example.com/", pages, availableAssets());
    const titleFindings = findings.filter(({ messageKey }) =>
      messageKey === "page.duplicateTitles" || messageKey === "page.dominantTitleTemplate"
    );
    const finding = titleFindings[0];

    expect(titleFindings).toHaveLength(1);
    expect(finding).toMatchObject({
      severity: "warning",
      messageKey: "page.dominantTitleTemplate",
      params: {
        patternPosition: "suffix",
        sharedLength: [...shared].length,
        affectedCount: 5
      },
      aggregation: {
        affectedCount: 5,
        templateKey: "title-pattern:dominant_suffix"
      }
    });
    expect(finding?.aggregation?.representativeUrls).toHaveLength(3);
    expect(finding?.params).not.toHaveProperty("sharedSegment");
    expect(calculateScore(titleFindings, pages)).toBe(82);
  });
});

function page(url: string, overrides: Partial<AuditedPage> = {}): AuditedPage {
  return {
    url,
    status: 200,
    title: "Example page title",
    metaDescription: "A complete description for the representative page.",
    h1: ["Example page"],
    h2: [],
    canonical: url,
    hasOpenGraph: true,
    hasJsonLd: true,
    readableTextLength: 1_000,
    internalLinks: 3,
    ...overrides
  };
}

function availableAssets(): MachineReadableAssets {
  return {
    robotsTxt: asset("https://example.com/robots.txt"),
    sitemapXml: asset("https://example.com/sitemap.xml"),
    llmsTxt: asset("https://example.com/llms.txt")
  };
}

function asset(url: string) {
  return { url, present: true, status: 200, summary: "Available." };
}

function aggregatedFinding(
  messageKey: Parameters<typeof createFinding>[0]["messageKey"],
  affectedCount: number,
  pageType: string = "other",
  templateKey: string = "/:slug"
): GeoFinding {
  const url = "https://example.com/example";
  return {
    ...createFinding({
      id: `${messageKey}-${pageType}`,
      messageKey,
      params: { url, status: 404, h1Count: 0 },
      url
    }),
    aggregation: {
      affectedCount,
      representativeUrls: [url],
      pageType: pageType as NonNullable<GeoFinding["aggregation"]>["pageType"],
      templateKey
    }
  };
}

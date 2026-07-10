import { describe, expect, it } from "vitest";
import {
  DEEP_PAGE_LIMIT,
  FREE_PAGE_LIMIT,
  MAX_CANDIDATE_URLS,
  buildPageCandidate,
  classifyPageType,
  compressCandidates,
  inferTemplateKey,
  selectPagesForTier,
  type PageCandidate
} from "./selection";

function candidate(index: number, pageType: PageCandidate["pageType"] = "other"): PageCandidate {
  return {
    url: `https://example.com/page-${index}`,
    sources: ["sitemap"],
    pageType,
    templateKey: `/page-${index}`,
    priority: 1000 - index
  };
}

describe("page classification and sampling", () => {
  it.each([
    ["https://example.com/", "home"],
    ["https://example.com/products/widget", "product"],
    ["https://example.com/solutions/enterprise", "service"],
    ["https://example.com/about-us", "about"],
    ["https://example.com/pricing", "pricing"],
    ["https://example.com/customers/acme", "case-study"],
    ["https://example.com/blog/launch", "blog"],
    ["https://example.com/privacy", "legal"]
  ])("classifies %s as %s", (url, expected) => {
    expect(classifyPageType(url)).toBe(expected);
  });

  it("uses structured data and metadata when paths are ambiguous", () => {
    expect(classifyPageType("https://example.com/x", { jsonLdTypes: ["Product"] })).toBe("product");
    expect(classifyPageType("https://example.com/x", { title: "联系我们" })).toBe("contact");
  });

  it("groups dated article and case paths by stable templates", () => {
    expect(inferTemplateKey("https://example.com/blog/2026/07/launch", "blog")).toBe(
      "/blog/:year/:month/:slug"
    );
    expect(inferTemplateKey("https://example.com/customers/acme", "case-study")).toBe(
      "/customers/:slug"
    );
  });

  it("classifies query-routed CMS pages from route keys and values", () => {
    expect(
      classifyPageType("https://example.com/?route=product/product&product_id=42")
    ).toBe("product");
    expect(
      classifyPageType("https://example.com/index.php?module=content&action=blog&article_id=42")
    ).toBe("blog");
  });

  it("normalizes query-routed CMS record ids while retaining category boundaries", () => {
    const first = inferTemplateKey(
      "https://example.com/index.php?m=content&c=index&a=show&catid=12&id=41&utm_source=test"
    );
    const second = inferTemplateKey(
      "https://example.com/index.php?id=99&a=show&c=index&m=content&catid=12"
    );
    const otherCategory = inferTemplateKey(
      "https://example.com/index.php?m=content&c=index&a=show&catid=18&id=99"
    );

    expect(first).toBe("/index.php?a=show&c=index&catid=12&id=:id&m=content");
    expect(second).toBe(first);
    expect(otherCategory).not.toBe(first);
  });

  it("groups bare-query CMS routes used as virtual paths", () => {
    expect(inferTemplateKey("https://shun-express.com/?tw/112.html")).toBe("/tw/:id.html");
    expect(inferTemplateKey("https://shun-express.com/?tw/67.html")).toBe("/tw/:id.html");
    expect(inferTemplateKey("https://shun-express.com/?Consolidated-shipping/29.html")).toBe(
      "/consolidated-shipping/:id.html"
    );
    expect(inferTemplateKey("https://shun-express.com/?tw/")).toBe("/tw");
  });

  it("groups product and service detail paths by stable slug templates", () => {
    expect(inferTemplateKey("https://example.com/products/widget", "product")).toBe(
      "/products/:slug"
    );
    expect(inferTemplateKey("https://example.com/services/freight", "service")).toBe(
      "/services/:slug"
    );
  });

  it("builds candidates with core-page priority and discovery metadata", () => {
    const result = buildPageCandidate(
      { url: "https://example.com/about", sources: ["sitemap"], lastModified: "2026-07-01" },
      { title: "About Acme" }
    );
    expect(result).toMatchObject({ pageType: "about", templateKey: "/about", title: "About Acme" });
    expect(result.priority).toBeGreaterThan(95);
  });

  it("compresses to 500 candidates while retaining template diversity", () => {
    const input = Array.from({ length: 700 }, (_, index) => candidate(index));
    const result = compressCandidates(input, 900);
    expect(result).toHaveLength(MAX_CANDIDATE_URLS);
    expect(new Set(result.map(({ templateKey }) => templateKey)).size).toBe(MAX_CANDIDATE_URLS);
  });

  it("selects one free and at most 50 deep pages", () => {
    const input = Array.from({ length: 80 }, (_, index) => candidate(index));
    expect(selectPagesForTier(input, "free")).toHaveLength(FREE_PAGE_LIMIT);
    expect(selectPagesForTier(input, "deep")).toHaveLength(DEEP_PAGE_LIMIT);
  });

  it("covers core page types before taking a second page of a type", () => {
    const input: PageCandidate[] = [
      candidate(0, "home"),
      candidate(1, "product"),
      candidate(2, "about"),
      candidate(3, "pricing"),
      candidate(4, "case-study"),
      candidate(5, "contact"),
      candidate(6, "blog"),
      candidate(7, "help"),
      { ...candidate(8, "home"), priority: 2000 }
    ];
    const selected = selectPagesForTier(input, "deep");
    expect(new Set(selected.map(({ pageType }) => pageType))).toEqual(
      new Set(["home", "product", "about", "pricing", "case-study", "contact", "blog", "help"])
    );
  });
});

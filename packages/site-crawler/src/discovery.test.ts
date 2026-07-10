import { describe, expect, it } from "vitest";
import {
  MAX_DISCOVERED_URLS,
  SiteDiscovery,
  isAllowedByRobots,
  normalizeDiscoveredUrl,
  parseRobotsTxt,
  parseSitemapXml
} from "./discovery";

describe("site URL discovery", () => {
  it("parses URL sets with relative, escaped, and dated locations", () => {
    expect(
      parseSitemapXml(
        `<urlset>
          <url><loc>/about</loc><lastmod>2026-07-01</lastmod></url>
          <url><loc>https://example.com/search?a=1&amp;b=2</loc></url>
        </urlset>`,
        "https://example.com/sitemap.xml"
      )
    ).toEqual({
      kind: "urlset",
      entries: [
        { url: "https://example.com/about", lastModified: "2026-07-01" },
        { url: "https://example.com/search?a=1&b=2" }
      ]
    });
  });

  it("returns child sitemap URLs from sitemap indexes", () => {
    const discovery = new SiteDiscovery("https://example.com");
    expect(
      discovery.addSitemapDocument(
        "<sitemapindex><sitemap><loc>/pages.xml</loc></sitemap><sitemap><loc>https://other.test/x.xml</loc></sitemap></sitemapindex>",
        "https://example.com/sitemap.xml"
      )
    ).toEqual(["https://example.com/pages.xml"]);
  });

  it("collects same-site sitemap and HTML links while excluding assets and other sites", () => {
    const discovery = new SiteDiscovery("https://www.example.com/start", { maxUrls: 10 });
    discovery.addSitemapDocument(
      "<urlset><url><loc>https://example.com/about?utm_source=x</loc></url></urlset>",
      "https://example.com/sitemap.xml"
    );
    discovery.addHtmlDocument(
      '<a href="https://blog.example.com/about">About duplicate</a><a href="/pricing">Pricing</a><a href="/logo.png">Image</a><a href="https://other.test/page">Other</a>',
      "https://example.com"
    );
    expect(discovery.getUrls().map(({ url }) => url)).toEqual([
      "https://www.example.com/start",
      "https://example.com/about",
      "https://blog.example.com/about",
      "https://example.com/pricing"
    ]);
  });

  it("deduplicates normalized URLs and merges discovery sources", () => {
    const discovery = new SiteDiscovery("https://example.com", { maxUrls: 5 });
    discovery.addSitemapDocument(
      "<urlset><url><loc>https://example.com/about?utm_campaign=x</loc></url></urlset>",
      "https://example.com/sitemap.xml"
    );
    discovery.addHtmlDocument('<a href="/about">About</a>', "https://example.com");
    expect(discovery.getUrls().find(({ url }) => url === "https://example.com/about")?.sources).toEqual([
      "sitemap",
      "link"
    ]);
  });

  it("enforces the configured limit and never allows more than 50,000", () => {
    const discovery = new SiteDiscovery("https://example.com", { maxUrls: 2 });
    discovery.addHtmlDocument('<a href="/a">A</a><a href="/b">B</a>', "https://example.com");
    expect(discovery.getUrls()).toHaveLength(2);
    expect(new SiteDiscovery("https://example.com", { maxUrls: 99_999 }).maxUrls).toBe(
      MAX_DISCOVERED_URLS
    );
  });

  it("normalizes tracking parameters and excludes non-HTML assets", () => {
    expect(normalizeDiscoveredUrl("/page?utm_source=x&b=2&a=1", "https://example.com")?.href).toBe(
      "https://example.com/page?a=1&b=2"
    );
    expect(normalizeDiscoveredUrl("/brochure.pdf", "https://example.com")).toBeNull();
  });

  it("parses robots groups, sitemap hints, wildcards, and allow precedence", () => {
    const policy = parseRobotsTxt(
      `User-agent: *
       Disallow: /private/
       Allow: /private/public$
       Sitemap: /sitemap.xml`,
      "https://example.com/robots.txt"
    );
    expect(policy.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
    expect(isAllowedByRobots("https://example.com/private/secret", policy)).toBe(false);
    expect(isAllowedByRobots("https://example.com/private/public", policy)).toBe(true);
    expect(isAllowedByRobots("https://example.com/about", policy)).toBe(true);
  });
});

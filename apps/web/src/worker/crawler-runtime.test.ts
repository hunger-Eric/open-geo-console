import { describe, expect, it, vi } from "vitest";
import { discoverSite } from "./crawler-runtime";

describe("worker site discovery tiers", () => {
  it("estimates site size for free without fetching linked content or nested sitemaps", async () => {
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      requests.push(url);
      if (url === "https://example.com/") {
        return new Response("<html><head><title>Example</title></head><body><h1>Example</h1><a href='/about'>About</a></body></html>");
      }
      if (url === "https://example.com/robots.txt") {
        return new Response("User-agent: *\nSitemap: https://example.com/nested-index.xml");
      }
      if (url === "https://example.com/sitemap.xml") {
        return new Response("<urlset><url><loc>https://example.com/product</loc></url></urlset>");
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    const discovered = await discoverSite("https://example.com/", "free", fetchImpl as typeof fetch);

    expect(requests).toEqual([
      "https://example.com/",
      "https://example.com/robots.txt",
      "https://example.com/sitemap.xml"
    ]);
    expect(discovered.deterministicCandidates.map(({ url }) => url)).toEqual(["https://example.com/"]);
    expect(discovered.estimatedPages).toBe(3);
  });
});

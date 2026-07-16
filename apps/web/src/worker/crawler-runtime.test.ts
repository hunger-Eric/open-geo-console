import { describe, expect, it, vi } from "vitest";
import { collectReportV4Site } from "./report-v4-site-collector";
import {
  createReportV4AdmissionCollectorDependencies,
  discoverSite
} from "./crawler-runtime";

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

  it("reuses safe raw HTML extraction and discovers only same-site HTML links", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "<html><body><main>Readable company evidence</main><a href='/about'>About</a><a href='https://other.test/out'>Out</a><a href='/file.pdf'>PDF</a><a href='/brief.docx'>Word</a></body></html>",
      { headers: { "content-type": "text/html; charset=utf-8", "x-ogc-final-url": "https://example.com/" } }
    ));
    const renderBrowser = vi.fn();
    const dependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      renderBrowser
    });

    const result = await collectReportV4Site([{
      siteUrl: "https://example.com/",
      url: "https://example.com/",
      networkSafety: "public",
      access: "public",
      contentType: "text/html"
    }], dependencies);

    expect(result.pages).toEqual([expect.objectContaining({ readability: "direct_readable" })]);
    expect(result.discoveredCandidates.map(({ url }) => url)).toEqual([
      "https://example.com/",
      "https://example.com/about"
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(renderBrowser).not.toHaveBeenCalled();

    await collectReportV4Site(
      result.discoveredCandidates.filter(({ url }) => url !== "https://example.com/"),
      dependencies
    );
    expect(fetchImpl.mock.calls.map(([request]) => request.toString())).toEqual([
      "https://example.com/",
      "https://example.com/about"
    ]);
  });

  it("uses exactly one safe browser render only when raw HTML has no analyzable body", async () => {
    const fetchImpl = vi.fn(async () => new Response(
      "<html><body><div id='root'></div></body></html>",
      { headers: { "content-type": "text/html", "x-ogc-final-url": "https://example.com/app" } }
    ));
    const renderBrowser = vi.fn(async () => ({
      url: "https://example.com/app",
      html: "<html><body><main>Browser-only public evidence</main></body></html>"
    }));
    const dependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      renderBrowser
    });

    const result = await collectReportV4Site([{
      siteUrl: "https://example.com/",
      url: "https://example.com/app",
      networkSafety: "public",
      access: "public",
      contentType: "text/html"
    }], dependencies);

    expect(result.pages).toEqual([
      expect.objectContaining({ readability: "js_dependent", analyzableText: "Browser-only public evidence" })
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(renderBrowser).toHaveBeenCalledTimes(1);
  });

  it("propagates the exact abort reason from optional sitemap discovery", async () => {
    const controller = new AbortController();
    const deadlineReason = new Error("controlled product deadline");
    const fetchImpl = vi.fn(async (request: URL | RequestInfo, init?: RequestInit): Promise<Response> => {
      const url = request.toString();
      if (url.endsWith("/robots.txt")) return new Response("");
      if (url === "https://example.com/") {
        return new Response("<html><body><main>Readable homepage</main></body></html>");
      }
      return new Promise((_, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        controller.abort(deadlineReason);
      });
    });

    await expect(discoverSite("https://example.com/", "deep", fetchImpl as typeof fetch, controller.signal))
      .rejects.toBe(deadlineReason);
  });
});

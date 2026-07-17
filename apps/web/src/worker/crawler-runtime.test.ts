import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { collectReportV4Site } from "./report-v4-site-collector";
import {
  createReportV4AdmissionCollectorDependencies,
  discoverReportV4AdmissionSite,
  discoverSite
} from "./crawler-runtime";
import {
  ReportV4AcceptanceIndeterminateOperationError,
  type ReportV4AcceptanceObserver,
  type ReportV4AcceptanceObserverEvent
} from "./report-v4-acceptance-observer";

describe("worker site discovery tiers", () => {
  it("claims and terminalizes every discovery raw read without persisting plaintext URLs", async () => {
    const events: unknown[] = [];
    const observer = acceptanceObserver({
      claimExternalIo: vi.fn(async (event) => {
        events.push(event);
        return { event: {}, inserted: true } as never;
      }),
      finishExternalIo: vi.fn(async (event) => {
        events.push(event);
        return { event: {}, inserted: true } as never;
      })
    });
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith("/robots.txt")) return new Response("");
      if (url.endsWith("/sitemap.xml")) return new Response("<urlset></urlset>");
      return new Response("<html><body><main>Readable homepage</main></body></html>");
    });

    await discoverReportV4AdmissionSite(
      "https://secret.example/private?token=do-not-store",
      undefined,
      fetchImpl as typeof fetch,
      observer
    );

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(observer.claimExternalIo).toHaveBeenCalledTimes(3);
    expect(observer.finishExternalIo).toHaveBeenCalledTimes(3);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("secret.example");
    expect(serialized).not.toContain("do-not-store");
    for (const event of vi.mocked(observer.claimExternalIo).mock.calls.map(([event]) => event)) {
      const siteRead = event as Extract<ReportV4AcceptanceObserverEvent, { kind: "site_read" }>;
      expect(siteRead).toMatchObject({
        kind: "site_read",
        operation: "site_raw_read",
        attempt: 0,
        phase: "started",
        details: { readMode: "raw", networkPerformed: true }
      });
      expect(siteRead.details.urlHash).toMatch(/^[a-f0-9]{64}$/);
      expect(siteRead.unitId).toBe(`admission-discovery:raw:${siteRead.details.urlHash}`);
    }
  });

  it.each([
    ["robots", "https://example.com/robots.txt"],
    ["sitemap", "https://example.com/sitemap.xml"]
  ])("propagates an indeterminate %s discovery claim and never performs that raw read", async (_label, duplicateUrl) => {
    const indeterminate = new ReportV4AcceptanceIndeterminateOperationError();
    const observer = acceptanceObserver({
      claimExternalIo: vi.fn(async (event) => {
        const siteRead = event as Extract<ReportV4AcceptanceObserverEvent, { kind: "site_read" }>;
        if (siteRead.details.urlHash === sha(duplicateUrl)) throw indeterminate;
        return { event: {}, inserted: true } as never;
      })
    });
    const requests: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      requests.push(url);
      return new Response(url.endsWith("/robots.txt") ? "" : "<html><body><main>Readable</main></body></html>");
    });

    await expect(discoverReportV4AdmissionSite(
      "https://example.com/",
      undefined,
      fetchImpl as typeof fetch,
      observer
    )).rejects.toBe(indeterminate);
    expect(requests).not.toContain(duplicateUrl);
  });

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
    const fetchImpl = vi.fn(async (request: string | URL | Request) => {
      void request;
      return new Response(
        "<html><body><main>Readable company evidence</main><a href='/about'>About</a><a href='https://other.test/out'>Out</a><a href='/file.pdf'>PDF</a><a href='/brief.docx'>Word</a></body></html>",
        { headers: { "content-type": "text/html; charset=utf-8", "x-ogc-final-url": "https://example.com/" } }
      );
    });
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
    const order: string[] = [];
    const events: unknown[] = [];
    const observer = acceptanceObserver({
      claimExternalIo: vi.fn(async (event) => {
        order.push(`claim:${event.operation}`);
        events.push(event);
        return { event: {}, inserted: true } as never;
      }),
      finishExternalIo: vi.fn(async (event) => {
        order.push(`finish:${event.operation}:${event.phase}`);
        events.push(event);
        return { event: {}, inserted: true } as never;
      })
    });
    const fetchImpl = vi.fn(async () => new Response(
      "<html><body><div id='root'></div></body></html>",
      { headers: { "content-type": "text/html", "x-ogc-final-url": "https://example.com/app" } }
    ));
    const renderBrowser = vi.fn(async () => {
      order.push("browser-render");
      return {
        url: "https://example.com/app",
        html: "<html><body><main>Browser-only public evidence</main></body></html>"
      };
    });
    const dependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      renderBrowser,
      acceptanceObserver: observer
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
    expect(order).toEqual([
      "claim:site_raw_read",
      "finish:site_raw_read:completed",
      "claim:site_browser_read",
      "browser-render",
      "finish:site_browser_read:completed"
    ]);
    const urlHash = sha("https://example.com/app");
    expect(observer.claimExternalIo).toHaveBeenNthCalledWith(1, expect.objectContaining({
      unitId: `admission-page:raw:${urlHash}`,
      details: { urlHash, readMode: "raw", networkPerformed: true }
    }));
    expect(observer.claimExternalIo).toHaveBeenNthCalledWith(2, expect.objectContaining({
      unitId: `admission-page:browser:${urlHash}`,
      details: { urlHash, readMode: "browser", networkPerformed: true }
    }));
    expect(JSON.stringify(events)).not.toContain("https://example.com/app");
  });

  it("blocks duplicate raw claims before physical fetch and records failed terminals for attempted reads", async () => {
    const url = "https://example.com/private?secret=never-store";
    const duplicateFetch = vi.fn();
    const indeterminate = new ReportV4AcceptanceIndeterminateOperationError();
    const duplicateObserver = acceptanceObserver({
      claimExternalIo: vi.fn(async () => { throw indeterminate; })
    });
    const duplicateDependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: duplicateFetch as typeof fetch,
      acceptanceObserver: duplicateObserver
    });

    await expect(collectReportV4Site([candidate(url)], duplicateDependencies)).rejects.toBe(indeterminate);
    expect(duplicateFetch).not.toHaveBeenCalled();
    expect(duplicateObserver.finishExternalIo).not.toHaveBeenCalled();

    const failure = new Error("socket failed");
    const failedFetch = vi.fn(async () => { throw failure; });
    const failedObserver = acceptanceObserver();
    const failedDependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: failedFetch as typeof fetch,
      acceptanceObserver: failedObserver
    });
    await expect(failedDependencies.readRawHtml(candidate(url))).rejects.toBe(failure);
    expect(failedObserver.finishExternalIo).toHaveBeenCalledExactlyOnceWith({
      kind: "site_read",
      operation: "site_raw_read",
      unitId: `admission-page:raw:${sha(url)}`,
      attempt: 0,
      phase: "failed",
      details: { urlHash: sha(url), readMode: "raw", networkPerformed: true }
    });
  });

  it("blocks duplicate browser claims before render and records attempted browser failures", async () => {
    const url = "https://example.com/browser-only";
    const thinFetch = vi.fn(async () => new Response(
      "<html><body><div id='root'></div></body></html>",
      { headers: { "content-type": "text/html", "x-ogc-final-url": url } }
    ));
    const duplicateRender = vi.fn();
    const indeterminate = new ReportV4AcceptanceIndeterminateOperationError();
    const duplicateObserver = acceptanceObserver({
      claimExternalIo: vi.fn(async (event) => {
        if (event.operation === "site_browser_read") throw indeterminate;
        return { event: {}, inserted: true } as never;
      })
    });
    const duplicateDependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: thinFetch as typeof fetch,
      renderBrowser: duplicateRender,
      acceptanceObserver: duplicateObserver
    });
    await expect(collectReportV4Site([candidate(url)], duplicateDependencies)).rejects.toBe(indeterminate);
    expect(thinFetch).toHaveBeenCalledTimes(1);
    expect(duplicateRender).not.toHaveBeenCalled();

    const renderFailure = new Error("browser navigation failed");
    const failedRender = vi.fn(async () => { throw renderFailure; });
    const failedObserver = acceptanceObserver();
    const failedDependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: thinFetch as typeof fetch,
      renderBrowser: failedRender,
      acceptanceObserver: failedObserver
    });
    const failed = await collectReportV4Site([candidate(url)], failedDependencies);
    expect(failed.exclusions).toContainEqual(expect.objectContaining({ reason: "browser_render_failed" }));
    expect(failedObserver.finishExternalIo).toHaveBeenCalledWith({
      kind: "site_read",
      operation: "site_browser_read",
      unitId: `admission-page:browser:${sha(url)}`,
      attempt: 0,
      phase: "failed",
      details: { urlHash: sha(url), readMode: "browser", networkPerformed: true }
    });
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

function acceptanceObserver(
  overrides: Partial<ReportV4AcceptanceObserver> = {}
): ReportV4AcceptanceObserver {
  return {
    session: {} as never,
    scenario: {} as never,
    observe: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    claimExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    finishExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    ...overrides
  };
}

function candidate(url: string) {
  return {
    siteUrl: "https://example.com/",
    url,
    networkSafety: "public" as const,
    access: "public" as const,
    contentType: "text/html"
  };
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ReportV4AcceptanceSiteReadManifestRepository } from "../db/report-v4-site-read-manifest";
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
      observer,
      siteReadManifestRepository(),
      loadAdmissionJob
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

  it("passes homepage, robots, sitemap, and page purposes explicitly to the protected manifest", async () => {
    const repository = siteReadManifestRepository();
    const observer = acceptanceObserver();
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url.endsWith("/robots.txt")) return new Response("");
      if (url.endsWith("/sitemap.xml")) return new Response("<urlset></urlset>");
      return new Response("<html><body><main>Readable homepage</main></body></html>", {
        headers: { "content-type": "text/html" }
      });
    });

    const discovery = await discoverReportV4AdmissionSite(
      "https://example.com/", undefined, fetchImpl as typeof fetch, observer, repository, loadAdmissionJob
    );
    const collector = createReportV4AdmissionCollectorDependencies({
      targetUrl: discovery.targetUrl,
      robotsPolicy: discovery.robotsPolicy,
      fetchImpl: fetchImpl as typeof fetch,
      acceptanceObserver: observer,
      siteReadManifestRepository: repository,
      loadJob: loadAdmissionJob
    });
    await collector.readRawHtml(candidate("https://example.com/page"));

    expect(vi.mocked(repository.begin).mock.calls.map(([input]) => [input.scope, input.purpose]))
      .toEqual(expect.arrayContaining([
        ["admission_discovery", "homepage"],
        ["admission_discovery", "robots"],
        ["admission_discovery", "sitemap"],
        ["admission_page", "page"]
      ]));
  });

  it("does not touch a supplied manifest repository when no protected observer exists", async () => {
    const repository = siteReadManifestRepository();
    const fetchImpl = vi.fn(async () => new Response("<html><body><main>Readable</main></body></html>", {
      headers: { "content-type": "text/html" }
    }));
    const collector = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      siteReadManifestRepository: repository
    });

    await collector.readRawHtml(candidate("https://example.com/page"));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(repository.begin).not.toHaveBeenCalled();
    expect(repository.terminalize).not.toHaveBeenCalled();
  });

  it("fails before observer claim and physical delegation when manifest begin fails", async () => {
    const beginFailure = new Error("manifest begin failed");
    const repository = siteReadManifestRepository({
      begin: vi.fn(async () => { throw beginFailure; })
    });
    const observer = acceptanceObserver();
    const fetchImpl = vi.fn();
    const collector = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      acceptanceObserver: observer,
      siteReadManifestRepository: repository,
      loadJob: loadAdmissionJob
    });

    await expect(collector.readRawHtml(candidate("https://example.com/page"))).rejects.toBe(beginFailure);
    expect(observer.claimExternalIo).not.toHaveBeenCalled();
    expect(observer.finishExternalIo).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires the persisted pre-admission job lineage before beginning a protected manifest row", async () => {
    const repository = siteReadManifestRepository();
    const observer = acceptanceObserver();
    const fetchImpl = vi.fn();
    const loadJob = vi.fn(async () => ({
      id: "other-job",
      reportId: "report-1",
      reason: "v4_pre_admission",
      tier: "deep",
      fulfillmentMethodology: "two_stage_geo_report_v4",
      recommendationReportVersion: 4,
      artifactContract: "combined_geo_report_v4"
    }) as never);
    const collector = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      acceptanceObserver: observer,
      siteReadManifestRepository: repository,
      loadJob
    });

    await expect(collector.readRawHtml(candidate("https://example.com/page"))).rejects.toThrow(/persisted.*lineage/i);
    expect(loadJob).toHaveBeenCalledExactlyOnceWith("admission-job");
    expect(repository.begin).not.toHaveBeenCalled();
    expect(observer.claimExternalIo).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not load job authority or fabricate manifest rows until a protected physical read actually starts", () => {
    const repository = siteReadManifestRepository();
    const loadJob = vi.fn(loadAdmissionJob);
    createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      acceptanceObserver: acceptanceObserver(),
      siteReadManifestRepository: repository,
      loadJob
    });

    expect(loadJob).not.toHaveBeenCalled();
    expect(repository.begin).not.toHaveBeenCalled();
    expect(repository.terminalize).not.toHaveBeenCalled();
  });

  it("fails closed without an observer terminal when manifest terminalization fails", async () => {
    const terminalFailure = new Error("manifest terminal failed");
    const repository = siteReadManifestRepository({
      terminalize: vi.fn(async () => { throw terminalFailure; })
    });
    const observer = acceptanceObserver();
    const fetchImpl = vi.fn(async () => new Response("<html><body><main>Readable</main></body></html>", {
      headers: { "content-type": "text/html" }
    }));
    const collector = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      acceptanceObserver: observer,
      siteReadManifestRepository: repository,
      loadJob: loadAdmissionJob
    });

    await expect(collector.readRawHtml(candidate("https://example.com/page"))).rejects.toBe(terminalFailure);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(observer.claimExternalIo).toHaveBeenCalledTimes(1);
    expect(observer.finishExternalIo).not.toHaveBeenCalled();
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
      observer,
      siteReadManifestRepository(),
      loadAdmissionJob
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
    const fetchImpl = vi.fn(async () => {
      order.push("raw-read");
      return new Response(
        "<html><body><div id='root'></div></body></html>",
        { headers: { "content-type": "text/html", "x-ogc-final-url": "https://example.com/app" } }
      );
    });
    const renderBrowser = vi.fn(async () => {
      order.push("browser-render");
      return {
        url: "https://example.com/app",
        html: "<html><body><main>Browser-only public evidence</main></body></html>"
      };
    });
    const repository = siteReadManifestRepository({
      begin: vi.fn(async input => {
        order.push(`manifest:begin:${input.mode}`);
        return { entry: manifestEntry({ mode: input.mode }), inserted: true } as never;
      }),
      terminalize: vi.fn(async input => {
        order.push(`manifest:${input.terminalPhase}`);
        return manifestEntry({ terminalPhase: input.terminalPhase });
      })
    });
    const dependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: fetchImpl as typeof fetch,
      renderBrowser,
      acceptanceObserver: observer,
      siteReadManifestRepository: repository,
      loadJob: loadAdmissionJob
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
      "manifest:begin:raw",
      "claim:site_raw_read",
      "raw-read",
      "manifest:completed",
      "finish:site_raw_read:completed",
      "manifest:begin:browser",
      "claim:site_browser_read",
      "browser-render",
      "manifest:completed",
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
      acceptanceObserver: duplicateObserver,
      siteReadManifestRepository: siteReadManifestRepository(),
      loadJob: loadAdmissionJob
    });

    await expect(collectReportV4Site([candidate(url)], duplicateDependencies)).rejects.toBe(indeterminate);
    expect(duplicateFetch).not.toHaveBeenCalled();
    expect(duplicateObserver.finishExternalIo).not.toHaveBeenCalled();

    const order: string[] = [];
    const failure = new Error("socket failed");
    const failedFetch = vi.fn(async () => { order.push("raw-read"); throw failure; });
    const failedObserver = acceptanceObserver({
      claimExternalIo: vi.fn(async event => { order.push("claim"); return { event, inserted: true } as never; }),
      finishExternalIo: vi.fn(async event => { order.push(`finish:${event.phase}`); return { event, inserted: true } as never; })
    });
    const failedRepository = siteReadManifestRepository({
      begin: vi.fn(async input => { order.push("manifest:begin"); return { entry: manifestEntry({ mode: input.mode }), inserted: true } as never; }),
      terminalize: vi.fn(async input => {
        order.push(`manifest:${input.terminalPhase}`);
        return manifestEntry({ terminalPhase: input.terminalPhase });
      })
    });
    const failedDependencies = createReportV4AdmissionCollectorDependencies({
      targetUrl: "https://example.com/",
      robotsPolicy: { userAgent: "OpenGeoConsoleBot", rules: [], sitemaps: [] },
      fetchImpl: failedFetch as typeof fetch,
      acceptanceObserver: failedObserver,
      siteReadManifestRepository: failedRepository,
      loadJob: loadAdmissionJob
    });
    await expect(failedDependencies.readRawHtml(candidate(url))).rejects.toBe(failure);
    expect(order).toEqual(["manifest:begin", "claim", "raw-read", "manifest:failed", "finish:failed"]);
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
      acceptanceObserver: duplicateObserver,
      siteReadManifestRepository: siteReadManifestRepository(),
      loadJob: loadAdmissionJob
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
      acceptanceObserver: failedObserver,
      siteReadManifestRepository: siteReadManifestRepository(),
      loadJob: loadAdmissionJob
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
    session: {
      sessionId: "11111111-1111-4111-8111-111111111111", environment: "protected_staging",
      state: "collecting", terminalAt: null
    } as never,
    scenario: {
      scenarioId: "scenario-1", sessionId: "11111111-1111-4111-8111-111111111111",
      state: "collecting", terminalAt: null, reportId: null, preAdmissionJobId: "admission-job"
    } as never,
    observe: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    claimExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    finishExternalIo: vi.fn(async () => ({ event: {}, inserted: true }) as never),
    ...overrides
  };
}

async function loadAdmissionJob(id: string) {
  return {
    id,
    reportId: "report-1",
    reason: "v4_pre_admission",
    tier: "deep",
    fulfillmentMethodology: "two_stage_geo_report_v4",
    recommendationReportVersion: 4,
    artifactContract: "combined_geo_report_v4"
  } as never;
}

function siteReadManifestRepository(
  overrides: Partial<ReportV4AcceptanceSiteReadManifestRepository> = {}
): ReportV4AcceptanceSiteReadManifestRepository {
  return {
    begin: vi.fn(async input => ({ entry: manifestEntry({ mode: input.mode }), inserted: true }) as never),
    terminalize: vi.fn(async input => manifestEntry({ terminalPhase: input.terminalPhase })),
    loadScenarioManifest: vi.fn(async () => []),
    ...overrides
  };
}

function manifestEntry(overrides: { mode?: "raw" | "browser"; terminalPhase?: "completed" | "failed" } = {}) {
  return {
    identityHash: "a".repeat(64), sessionId: "11111111-1111-4111-8111-111111111111",
    scenarioId: "scenario-1", reportId: "report-1", jobId: "admission-job",
    scope: "admission_page", purpose: "page", urlHash: "b".repeat(64), mode: overrides.mode ?? "raw",
    attempt: 0, pairBindingHash: "c".repeat(64), ownerQuestionId: null, ownerSourceId: null,
    networkPerformed: true, terminalPhase: overrides.terminalPhase ?? null,
    startedAt: new Date("2030-01-01T00:00:00.000Z"),
    terminalAt: overrides.terminalPhase ? new Date("2030-01-01T00:00:01.000Z") : null
  } as never;
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

import { readFile } from "node:fs/promises";
import type { CombinedGeoReportV4Question, CombinedGeoReportV4Source } from "@open-geo-console/ai-report-engine";
import { describe, expect, it, vi } from "vitest";
import { createSafeFetch } from "@/server/safe-fetch";
import { auditReportV4Sources } from "./report-v4-source-audit";
import {
  REPORT_V4_SOURCE_AUDIT_USER_AGENT,
  createReportV4SourceAuditProductionDependencies
} from "./report-v4-source-audit-production";

// @requirement GEO-V4-SOURCE-01
// @requirement GEO-V4-SOURCE-02
// @requirement GEO-V4-DIAG-01
describe("V4 source-audit production read adapters", () => {
  it("reads the exact canonical HTML once with an explicit user agent and skips browser for nonempty raw text", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("<main>  Independent raw evidence.  </main>")) as unknown as typeof fetch;
    const renderBrowser = vi.fn();
    const deps = createReportV4SourceAuditProductionDependencies({ fetchImpl, renderBrowser, summaryLimit: 80 });
    const value = source("q1", 1);

    const result = await deps.readRawSource(value);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(value.canonicalUrl, expect.objectContaining({
      headers: { "user-agent": REPORT_V4_SOURCE_AUDIT_USER_AGENT }
    }));
    expect(result).toEqual({ status: "available", summary: "Independent raw evidence." });
    expect(renderBrowser).not.toHaveBeenCalled();
  });

  it("uses one browser read only after empty or explicitly client-dependent raw HTML", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse('<div id="app"></div><script>__NEXT_DATA__={}</script>')) as unknown as typeof fetch;
    const renderBrowser = vi.fn(async (url: string) => ({
      url,
      html: "<main>Browser-rendered independent evidence.</main>"
    }));
    const deps = createReportV4SourceAuditProductionDependencies({ fetchImpl, renderBrowser });
    const original = question("q1", 1, 1);

    const [result] = await auditReportV4Sources([original], deps);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(renderBrowser).toHaveBeenCalledTimes(1);
    expect(renderBrowser).toHaveBeenCalledWith(original.sources[0]!.canonicalUrl, undefined);
    expect(result!.sourceAudits[0]).toMatchObject({
      status: "available",
      summary: "Browser-rendered independent evidence."
    });
  });

  it("treats raw throw, HTTP failure and non-HTML content as inaccessible without browser fallback", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => { throw new Error("SECRET response body must not leak"); },
      async () => new Response("SECRET upstream body", { status: 503, headers: { "content-type": "text/html" } }),
      async () => new Response("%PDF-1.7 SECRET", { status: 200, headers: { "content-type": "application/pdf" } })
    ];
    for (const request of cases) {
      const renderBrowser = vi.fn();
      const deps = createReportV4SourceAuditProductionDependencies({
        fetchImpl: vi.fn(request) as unknown as typeof fetch,
        renderBrowser
      });
      const [result] = await auditReportV4Sources([question("q1", 1, 1)], deps);
      expect(result!.sourceAudits[0]).toMatchObject({ status: "inaccessible" });
      expect(JSON.stringify(result)).not.toContain("SECRET");
      expect(renderBrowser).not.toHaveBeenCalled();
    }
  });

  it("contains safe redirect rejection as inaccessible and never requests the private target", async () => {
    const rawFetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data", "content-type": "text/html" }
    })) as unknown as typeof fetch;
    const safeFetch = createSafeFetch({
      fetchImpl: rawFetch,
      resolver: async () => [{ address: "8.8.8.8", family: 4 as const }]
    });
    const renderBrowser = vi.fn();
    const deps = createReportV4SourceAuditProductionDependencies({ fetchImpl: safeFetch, renderBrowser });

    const [result] = await auditReportV4Sources([question("q1", 1, 1)], deps);

    expect(result!.sourceAudits[0]!.status).toBe("inaccessible");
    expect(rawFetch).toHaveBeenCalledTimes(1);
    expect(renderBrowser).not.toHaveBeenCalled();
  });

  it("contains browser failure to one source and continues independent reads", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      return url.endsWith("source-1") ? htmlResponse("") : htmlResponse("Second source independent text.");
    }) as unknown as typeof fetch;
    const renderBrowser = vi.fn(async () => { throw new Error("browser-local SECRET"); });
    const deps = createReportV4SourceAuditProductionDependencies({ fetchImpl, renderBrowser });
    const original = question("q1", 1, 2);

    const [result] = await auditReportV4Sources([original], deps);

    expect(result!.sourceAudits.map(({ status }) => status)).toEqual(["inaccessible", "available"]);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(renderBrowser).toHaveBeenCalledTimes(1);
  });

  it("normalizes and bounds evidence summaries without using citedText", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse(`<main>${"  evidence   ".repeat(30)}</main>`)) as unknown as typeof fetch;
    const deps = createReportV4SourceAuditProductionDependencies({
      fetchImpl,
      renderBrowser: vi.fn(),
      summaryLimit: 37
    });
    const value = source("q1", 1, "CITED_TEXT_MUST_NOT_BECOME_EVIDENCE");

    const result = await deps.readRawSource(value);

    expect(result.status).toBe("available");
    expect(result.status === "available" ? result.summary?.length : 0).toBeLessThanOrEqual(37);
    expect(result.status === "available" ? result.summary : "").not.toContain("  ");
    expect(JSON.stringify(result)).not.toContain("CITED_TEXT_MUST_NOT_BECOME_EVIDENCE");
  });

  it("audits at most five owned URLs while preserving the exact question, answer and links", async () => {
    const fetchImpl = vi.fn(async () => htmlResponse("Independent evidence.")) as unknown as typeof fetch;
    const deps = createReportV4SourceAuditProductionDependencies({ fetchImpl, renderBrowser: vi.fn() });
    const original = question("q1", 1, 7);

    const [result] = await auditReportV4Sources([original], deps);

    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(result!.question).toBe(original);
    expect(result!.question.answer).toBe("q1 original answer");
    expect(result!.question.sources.map(({ canonicalUrl }) => canonicalUrl))
      .toEqual(original.sources.map(({ canonicalUrl }) => canonicalUrl));
    expect(result!.sourceAudits).toHaveLength(5);
  });

  it("propagates the exact caller abort from raw or browser reads", async () => {
    const rawController = new AbortController();
    const rawReason = new Error("raw caller deadline");
    rawController.abort(rawReason);
    const rawDeps = createReportV4SourceAuditProductionDependencies({
      fetchImpl: vi.fn() as unknown as typeof fetch,
      renderBrowser: vi.fn()
    });
    await expect(auditReportV4Sources([question("q1", 1, 1)], rawDeps, rawController.signal))
      .rejects.toBe(rawReason);

    const browserController = new AbortController();
    const browserReason = new Error("browser caller deadline");
    const browserDeps = createReportV4SourceAuditProductionDependencies({
      fetchImpl: vi.fn(async () => htmlResponse("")) as unknown as typeof fetch,
      renderBrowser: vi.fn(async () => {
        browserController.abort(browserReason);
        throw browserReason;
      })
    });
    await expect(auditReportV4Sources([question("q1", 1, 1)], browserDeps, browserController.signal))
      .rejects.toBe(browserReason);
  });

  it("defaults to the pinned safe-fetch/browser/extractor stack with no global-fetch or legacy workflow bypass", async () => {
    const moduleSource = await readFile(new URL("./report-v4-source-audit-production.ts", import.meta.url), "utf8");
    const imports = [...moduleSource.matchAll(/\bfrom\s+["']([^"']+)["']/gu)].map((match) => match[1]);

    expect(imports).toEqual([
      "@open-geo-console/ai-report-engine",
      "@open-geo-console/site-crawler",
      "@/server/safe-fetch",
      "./crawler-runtime",
      "./report-v4-source-audit"
    ]);
    expect(moduleSource).toContain("createSafeFetch()");
    expect(moduleSource).toContain("renderReportV4AdmissionHtml");
    expect(moduleSource).toContain("extractPageContent");
    expect(moduleSource).not.toMatch(/globalThis\.fetch|window\.fetch|citedText|providerClaim|qualification|four.?snapshot|report-v[123]/iu);
  });
});

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function source(questionId: string, index: number, citedText = `${questionId} cited ${index}`): CombinedGeoReportV4Source {
  return {
    questionId,
    sourceId: `${questionId}-source-${index}`,
    title: `${questionId} source ${index}`,
    canonicalUrl: `https://${questionId}.example/source-${index}`,
    citedText,
    retrievalStatus: "not_checked"
  };
}

function question(questionId: string, order: 1 | 2 | 3, sourceCount: number): CombinedGeoReportV4Question {
  return {
    questionId,
    order,
    questionText: `${questionId} text`,
    status: "answered",
    answer: `${questionId} original answer`,
    sources: Array.from({ length: sourceCount }, (_, index) => source(questionId, index + 1))
  };
}

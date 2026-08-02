import type { AiWebsiteReportV1 } from "@open-geo-console/ai-report-engine";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureMocks = vi.hoisted(() => ({
  launch: vi.fn(),
  newContext: vi.fn(),
  newPage: vi.fn(),
  goto: vi.fn(),
  screenshot: vi.fn(),
  saveEvidenceAsset: vi.fn()
}));

vi.mock("playwright", () => ({ chromium: { launch: captureMocks.launch } }));
vi.mock("@/server/safe-fetch", () => ({ configuredPublicDnsResolver: () => async () => [] }));
vi.mock("@open-geo-console/site-crawler", async (importOriginal) => ({
  ...await importOriginal<typeof import("@open-geo-console/site-crawler")>(),
  resolveSafeUrl: vi.fn(async () => undefined)
}));
vi.mock("@/db/evidence-assets", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/db/evidence-assets")>(),
  saveEvidenceAsset: captureMocks.saveEvidenceAsset
}));

import {
  buildVisualEvidenceRequests,
  captureReportVisualEvidence,
  groupVisualEvidenceRequests,
  paddedClip,
  visualEvidenceHash
} from "./visual-evidence";
import { PAID_V3_DIRECT_DEBUG_TRACE_PREFIX, createPaidV3DirectDebugTrace } from "./paid-v3-direct-debug-trace";

const report = {
  tier: "deep",
  findings: [{
    id: "finding-1",
    severity: "critical",
    pageElement: "main",
    evidence: [{ url: "https://example.com/page#part", quote: "  A verified   quote  " }]
  }],
  provenance: { contentHash: "report-hash" }
} as unknown as AiWebsiteReportV1;

describe("visual evidence requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const page = {
      route: vi.fn(async () => undefined),
      goto: captureMocks.goto.mockImplementation(async (url: string) => { currentUrl = url; }),
      url: () => currentUrl,
      screenshot: captureMocks.screenshot.mockResolvedValue(Buffer.from("jpeg")),
      locator: () => ({ evaluate: vi.fn(async () => null) })
    };
    let currentUrl = "https://example.com/";
    const context = {
      newPage: captureMocks.newPage.mockResolvedValue(page),
      close: vi.fn(async () => undefined)
    };
    const browser = {
      newContext: captureMocks.newContext.mockResolvedValue(context),
      close: vi.fn(async () => undefined)
    };
    captureMocks.launch.mockResolvedValue(browser);
    captureMocks.saveEvidenceAsset.mockResolvedValue(undefined);
  });

  it("binds verified citations to crawled content and inherited page elements", () => {
    const [request] = buildVisualEvidenceRequests(report, [{
      url: "https://example.com/page",
      contentHash: "page-hash"
    }]);

    expect(request.contentHash).toBe("page-hash");
    expect(request.citation.pageElement).toBe("main");
    expect(request.citationIndex).toBe(0);
  });

  it("normalizes URL fragments and quote whitespace in the evidence hash", () => {
    const [first] = buildVisualEvidenceRequests(report, [{ url: "https://example.com/page", contentHash: "page-hash" }]);
    const [second] = buildVisualEvidenceRequests({
      ...report,
      findings: [{ ...report.findings[0], evidence: [{ url: "https://example.com/page", quote: "a verified quote" }] }]
    }, [{ url: "https://example.com/page", contentHash: "page-hash" }]);

    expect(visualEvidenceHash(first)).toBe(visualEvidenceHash(second));
  });

  it("navigates four canonical URLs once for eleven independently bound citations", async () => {
    const urls = Array.from({ length: 4 }, (_, index) => `https://example.com/page-${index}`);
    const many = {
      ...report,
      findings: Array.from({ length: 11 }, (_, index) => ({
        id: `finding-${index}`,
        severity: "opportunity" as const,
        pageElement: "main",
        evidence: [{ url: `${urls[index % urls.length]}#citation-${index}`, quote: `Verified quote ${index}` }]
      }))
    } as AiWebsiteReportV1;
    const requests = buildVisualEvidenceRequests(many, urls.map((url, index) => ({
      url,
      contentHash: `content-${index}`
    })));
    expect(groupVisualEvidenceRequests(requests)).toHaveLength(4);

    const storage = {
      provider: "filesystem" as const,
      put: vi.fn(async () => undefined),
      get: vi.fn(async () => null),
      delete: vi.fn(async () => undefined)
    };
    const traceLines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-1", reportId: "report-1", remainingMs: () => 600_000,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => traceLines.push(line)
    })!;
    await captureReportVisualEvidence({
      reportId: "report-1",
      jobId: "job-1",
      report: many,
      pages: urls.map((url, index) => ({ url, contentHash: `content-${index}` })),
      storage,
      trace
    });

    expect(captureMocks.newContext).toHaveBeenCalledTimes(4);
    expect(captureMocks.newPage).toHaveBeenCalledTimes(4);
    expect(captureMocks.goto).toHaveBeenCalledTimes(4);
    expect(storage.put).toHaveBeenCalledTimes(11);
    expect(captureMocks.saveEvidenceAsset).toHaveBeenCalledTimes(11);
    expect(captureMocks.saveEvidenceAsset.mock.calls.map(([asset]) => [
      asset.findingId, asset.citationIndex, asset.sourceUrl, asset.contentHash, asset.evidenceHash
    ])).toHaveLength(11);
    const traceEvents = traceLines.map((line) => JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as { kind: string; step: string });
    expect(traceEvents.filter(({ kind, step }) => kind === "step_started" && step === "visual_url_navigation")).toHaveLength(4);
    expect(traceEvents.filter(({ kind, step }) => kind === "step_succeeded" && step === "visual_url_navigation")).toHaveLength(4);
    expect(traceEvents.filter(({ kind, step }) => kind === "step_started" && step === "visual_citation_capture")).toHaveLength(11);
  });

  it("clamps issue crops to the rendered document bounds", () => {
    expect(paddedClip({
      x: 1380,
      y: 980,
      width: 200,
      height: 200,
      documentWidth: 1440,
      documentHeight: 1000
    })).toEqual({ x: 1356, y: 956, width: 84, height: 44 });
  });
});

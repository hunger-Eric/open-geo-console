import type { AiWebsiteReportV1, EvidenceCitation } from "@open-geo-console/ai-report-engine";
import { createHash } from "node:crypto";
import { saveEvidenceAsset, evidenceAssetId, type SaveEvidenceAssetInput } from "@/db/evidence-assets";
import type { EvidenceAssetKind } from "@/db/schema";
import { createEvidenceStorage, evidenceStorageKey, type EvidenceStorage } from "@/evidence/storage";
import { resolveSafeUrl } from "@open-geo-console/site-crawler";
import { configuredPublicDnsResolver } from "@/server/safe-fetch";
import { paidV3TraceUrlIdentity, type PaidV3DirectDebugTrace } from "./paid-v3-direct-debug-trace";

const VIEWPORT = { width: 1440, height: 1000 } as const;
const allowBenchmarkNetwork = process.env.OGC_ALLOW_BENCHMARK_NETWORK === "true";

export interface VisualEvidencePage {
  url: string;
  contentHash: string;
}

interface CaptureRequest {
  findingId: string;
  severity: AiWebsiteReportV1["findings"][number]["severity"];
  citationIndex: number;
  citation: EvidenceCitation;
  contentHash: string;
}

export function buildVisualEvidenceRequests(
  report: AiWebsiteReportV1,
  pages: VisualEvidencePage[]
): CaptureRequest[] {
  const hashes = new Map(pages.map((page) => [canonicalUrl(page.url), page.contentHash]));
  return report.findings.flatMap((finding) => finding.evidence.map((citation, citationIndex) => ({
    findingId: finding.id,
    severity: finding.severity,
    citationIndex,
    citation: {
      ...citation,
      pageElement: citation.pageElement ?? finding.pageElement
    },
    contentHash: hashes.get(canonicalUrl(citation.url)) ?? report.provenance.contentHash
  })));
}

export function visualEvidenceHash(request: Pick<CaptureRequest, "citation" | "contentHash">): string {
  return createHash("sha256").update([
    canonicalUrl(request.citation.url),
    normalizeText(request.citation.quote),
    request.citation.pageElement ?? "",
    request.contentHash
  ].join("\0")).digest("hex");
}

export function groupVisualEvidenceRequests(requests: readonly CaptureRequest[]): CaptureRequest[][] {
  const groups = new Map<string, CaptureRequest[]>();
  for (const request of requests) {
    const key = canonicalUrl(request.citation.url);
    const group = groups.get(key) ?? [];
    group.push(request);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export async function captureReportVisualEvidence(input: {
  reportId: string;
  jobId: string;
  report: AiWebsiteReportV1;
  pages: VisualEvidencePage[];
  storage?: EvidenceStorage;
  trace?: PaidV3DirectDebugTrace;
}): Promise<void> {
  const requests = buildVisualEvidenceRequests(input.report, input.pages);
  if (requests.length === 0) return;

  let storage: EvidenceStorage;
  try {
    storage = input.storage ?? createEvidenceStorage();
  } catch (error) {
    input.trace?.emit("step_failed", "visual_storage_configuration", {
      phase: "website_synthesis",
      errorName: error instanceof Error ? error.name : "UnknownError",
      citationCount: requests.length,
      uniqueUrlCount: groupVisualEvidenceRequests(requests).length
    });
    await Promise.all(requests.map((request) => saveUnavailable(input, request, intendedKind(request), "storage_configuration")));
    return;
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: process.env.OGC_BROWSER_HEADLESS !== "false" });
  try {
    for (const group of groupVisualEvidenceRequests(requests)) {
      const first = group[0];
      const details = {
        phase: "website_synthesis",
        citationCount: group.length,
        ...(first ? paidV3TraceUrlIdentity(first.citation.url) : {})
      };
      const capture = () => captureUrlGroup(input, group, storage, browser);
      await (input.trace ? input.trace.span("visual_url_navigation", details, capture) : capture()).catch(async (error) => {
        await Promise.all(group.map(async (request) => {
          logCaptureFailure(input.reportId, request, error);
          await saveUnavailable(input, request, intendedKind(request), "capture_failed");
        }));
      });
    }
  } finally {
    await browser.close();
  }
}

async function captureUrlGroup(
  input: Pick<Parameters<typeof captureReportVisualEvidence>[0], "reportId" | "jobId" | "trace">,
  requests: readonly CaptureRequest[],
  storage: EvidenceStorage,
  browser: Awaited<ReturnType<(Awaited<typeof import("playwright")>)["chromium"]["launch"]>>
) {
  const first = requests[0];
  if (!first) return;
  const context = await browser.newContext({
    userAgent: "OpenGeoConsoleBot/1.0 (+https://github.com/open-geo-console)",
    javaScriptEnabled: true,
    viewport: VIEWPORT
  });
  const resolver = configuredPublicDnsResolver();
  try {
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (!url.startsWith("http://") && !url.startsWith("https://")) return route.abort();
      if (route.request().resourceType() === "media") return route.abort();
      try {
        await resolveSafeUrl(url, { allowBenchmarkNetwork, resolver });
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await resolveSafeUrl(first.citation.url, { allowBenchmarkNetwork, resolver });
    await page.goto(first.citation.url, { waitUntil: "networkidle", timeout: 30_000 });
    await resolveSafeUrl(page.url(), { allowBenchmarkNetwork, resolver });
    const capturedAt = new Date();

    for (const request of requests) {
      const capture = () => captureCitationOnPage(input, request, storage, page, capturedAt);
      await (input.trace ? input.trace.span("visual_citation_capture", {
        phase: "website_synthesis",
        citationCount: 1,
        ...paidV3TraceUrlIdentity(request.citation.url)
      }, capture) : capture()).catch(async (error) => {
        logCaptureFailure(input.reportId, request, error);
        await saveUnavailable(input, request, intendedKind(request), "capture_failed");
      });
    }
  } finally {
    await context.close();
  }
}

async function captureCitationOnPage(
  input: Pick<Parameters<typeof captureReportVisualEvidence>[0], "reportId" | "jobId">,
  request: CaptureRequest,
  storage: EvidenceStorage,
  page: import("playwright").Page,
  capturedAt: Date
) {
  if (request.severity === "critical") {
    const rect = await locateQuoteRect(page, request.citation.quote);
    if (rect) {
      try {
        await persistCapture(input, request, storage, "issue_crop", await page.screenshot({
          type: "jpeg",
          quality: 88,
          clip: paddedClip(rect)
        }), capturedAt);
        await persistCapture(input, request, storage, "context", await page.screenshot({
          type: "jpeg",
          quality: 68,
          fullPage: false
        }), capturedAt);
        return;
      } catch {
        // A stale or oversized DOM rectangle must degrade to a readable viewport,
        // not make the verified citation disappear from the report.
      }
    }
    await persistCapture(input, request, storage, "viewport", await page.screenshot({
      type: "jpeg",
      quality: 78,
      fullPage: false
    }), capturedAt);
    return;
  }

  await persistCapture(input, request, storage, "compact", await page.screenshot({
    type: "jpeg",
    quality: 74,
    fullPage: false
  }), capturedAt);
}

function logCaptureFailure(reportId: string, request: CaptureRequest, error: unknown): void {
  console.error("Visual evidence citation capture failed.", {
    reportId,
    findingId: request.findingId,
    citationIndex: request.citationIndex,
    error: sanitizedCaptureError(error)
  });
}

async function locateQuoteRect(page: import("playwright").Page, quote: string) {
  const needle = normalizeText(quote).slice(0, 180);
  if (needle.length < 12) return null;
  return page.locator("body").evaluate((body, expected) => {
    let best: Element | null = null;
    let bestLength = Number.POSITIVE_INFINITY;
    for (const element of Array.from(body.querySelectorAll("main *, article *, section *, body *"))) {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
      if (text.includes(expected) && text.length < bestLength) {
        const rect = element.getBoundingClientRect();
        if (rect.width >= 40 && rect.height >= 16) {
          best = element;
          bestLength = text.length;
        }
      }
    }
    if (!best) return null;
    const rect = best.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
      documentWidth: Math.max(document.documentElement.scrollWidth, body.scrollWidth),
      documentHeight: Math.max(document.documentElement.scrollHeight, body.scrollHeight)
    };
  }, needle);
}

export function paddedClip(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
  documentWidth: number;
  documentHeight: number;
}) {
  const padding = 24;
  const x = Math.max(0, rect.x - padding);
  const y = Math.max(0, rect.y - padding);
  return {
    x,
    y,
    width: Math.max(1, Math.min(VIEWPORT.width, rect.width + padding * 2, rect.documentWidth - x)),
    height: Math.max(1, Math.min(900, rect.height + padding * 2, rect.documentHeight - y))
  };
}

async function persistCapture(
  input: Pick<Parameters<typeof captureReportVisualEvidence>[0], "reportId" | "jobId">,
  request: CaptureRequest,
  storage: EvidenceStorage,
  kind: EvidenceAssetKind,
  bytes: Buffer,
  capturedAt: Date
) {
  const base = metadata(input, request, kind, capturedAt);
  const assetId = evidenceAssetId(base);
  const storageKey = evidenceStorageKey(input.reportId, assetId, "jpg");
  await storage.put(storageKey, bytes, "image/jpeg");
  await saveEvidenceAsset({
    ...base,
    status: "ready",
    assetHash: createHash("sha256").update(bytes).digest("hex"),
    storageProvider: storage.provider,
    storageKey,
    mimeType: "image/jpeg",
    byteSize: bytes.byteLength
  });
}

async function saveUnavailable(
  input: Pick<Parameters<typeof captureReportVisualEvidence>[0], "reportId" | "jobId">,
  request: CaptureRequest,
  kind: EvidenceAssetKind,
  failureCode: string
) {
  await saveEvidenceAsset({
    ...metadata(input, request, kind, new Date()),
    status: "unavailable",
    failureCode
  });
}

function metadata(
  input: Pick<Parameters<typeof captureReportVisualEvidence>[0], "reportId" | "jobId">,
  request: CaptureRequest,
  kind: EvidenceAssetKind,
  capturedAt: Date
): Omit<SaveEvidenceAssetInput, "status"> {
  return {
    reportId: input.reportId,
    jobId: input.jobId,
    findingId: request.findingId,
    citationIndex: request.citationIndex,
    kind,
    sourceUrl: request.citation.url,
    quote: request.citation.quote,
    pageElement: request.citation.pageElement,
    capturedAt,
    viewportWidth: VIEWPORT.width,
    viewportHeight: VIEWPORT.height,
    contentHash: request.contentHash,
    evidenceHash: visualEvidenceHash(request)
  };
}

function intendedKind(request: CaptureRequest): EvidenceAssetKind {
  return request.severity === "critical" ? "viewport" : "compact";
}

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function sanitizedCaptureError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.replace(/https?:\/\/\S+/gi, "[url]").slice(0, 240);
}

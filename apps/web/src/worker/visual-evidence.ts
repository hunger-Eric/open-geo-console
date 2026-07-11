import type { AiWebsiteReportV1, EvidenceCitation } from "@open-geo-console/ai-report-engine";
import { createHash } from "node:crypto";
import { saveEvidenceAsset, evidenceAssetId, type SaveEvidenceAssetInput } from "@/db/evidence-assets";
import type { EvidenceAssetKind } from "@/db/schema";
import { createEvidenceStorage, evidenceStorageKey, type EvidenceStorage } from "@/evidence/storage";
import { resolveSafeUrl } from "@open-geo-console/site-crawler";

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

export async function captureReportVisualEvidence(input: {
  reportId: string;
  jobId: string;
  report: AiWebsiteReportV1;
  pages: VisualEvidencePage[];
  storage?: EvidenceStorage;
}): Promise<void> {
  const requests = buildVisualEvidenceRequests(input.report, input.pages);
  if (requests.length === 0) return;

  let storage: EvidenceStorage;
  try {
    storage = input.storage ?? createEvidenceStorage();
  } catch {
    await Promise.all(requests.map((request) => saveUnavailable(input, request, intendedKind(request), "storage_configuration")));
    return;
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: process.env.OGC_BROWSER_HEADLESS !== "false" });
  try {
    for (const request of requests) {
      await captureCitation(input, request, storage, browser).catch(async () => {
        await saveUnavailable(input, request, intendedKind(request), "capture_failed");
      });
    }
  } finally {
    await browser.close();
  }
}

async function captureCitation(
  input: Pick<Parameters<typeof captureReportVisualEvidence>[0], "reportId" | "jobId">,
  request: CaptureRequest,
  storage: EvidenceStorage,
  browser: Awaited<ReturnType<(Awaited<typeof import("playwright")>)["chromium"]["launch"]>>
) {
  const context = await browser.newContext({
    userAgent: "OpenGeoConsoleBot/1.0 (+https://github.com/open-geo-console)",
    javaScriptEnabled: true,
    viewport: VIEWPORT
  });
  try {
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (!url.startsWith("http://") && !url.startsWith("https://")) return route.abort();
      if (route.request().resourceType() === "media") return route.abort();
      try {
        await resolveSafeUrl(url, { allowBenchmarkNetwork });
        await route.continue();
      } catch {
        await route.abort();
      }
    });
    await resolveSafeUrl(request.citation.url, { allowBenchmarkNetwork });
    await page.goto(request.citation.url, { waitUntil: "networkidle", timeout: 30_000 });
    await resolveSafeUrl(page.url(), { allowBenchmarkNetwork });
    const capturedAt = new Date();

    if (request.severity === "critical") {
      const rect = await locateQuoteRect(page, request.citation.quote);
      if (rect) {
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
  } finally {
    await context.close();
  }
}

async function locateQuoteRect(page: import("playwright").Page, quote: string) {
  const needle = normalizeText(quote).slice(0, 180);
  if (needle.length < 12) return null;
  return page.locator("body").evaluate((body, expected) => {
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
    let best: Element | null = null;
    let bestLength = Number.POSITIVE_INFINITY;
    for (const element of Array.from(body.querySelectorAll("main *, article *, section *, body *"))) {
      const text = normalize(element.textContent ?? "");
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
    return { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
  }, needle);
}

function paddedClip(rect: { x: number; y: number; width: number; height: number }) {
  const padding = 24;
  return {
    x: Math.max(0, rect.x - padding),
    y: Math.max(0, rect.y - padding),
    width: Math.max(1, Math.min(VIEWPORT.width, rect.width + padding * 2)),
    height: Math.max(1, Math.min(900, rect.height + padding * 2))
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

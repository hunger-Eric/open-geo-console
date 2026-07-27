import type { CombinedGeoReportV4Source } from "@open-geo-console/ai-report-engine";
import {
  extractPageContent,
  type ExtractedPageContent
} from "@open-geo-console/site-crawler";
import { createSafeFetch } from "@/server/safe-fetch";
import { renderReportV4AdmissionHtml } from "./crawler-runtime";
import type {
  ReportV4SourceAuditDependencies,
  ReportV4SourceAuditRead
} from "./report-v4-source-audit";

export const REPORT_V4_SOURCE_AUDIT_USER_AGENT =
  "OpenGeoConsoleBot/1.0 (+https://github.com/open-geo-console)";
export const REPORT_V4_SOURCE_AUDIT_SUMMARY_LIMIT = 2_000;

export interface ReportV4SourceAuditProductionOptions {
  readonly fetchImpl?: typeof fetch;
  readonly renderBrowser?: typeof renderReportV4AdmissionHtml;
  readonly extractPage?: typeof extractPageContent;
  readonly summaryLimit?: number;
}

export function createReportV4SourceAuditProductionDependencies(
  options: ReportV4SourceAuditProductionOptions = {}
): ReportV4SourceAuditDependencies {
  const fetchImpl = options.fetchImpl ?? createSafeFetch();
  const renderBrowser = options.renderBrowser ?? renderReportV4AdmissionHtml;
  const extractPage = options.extractPage ?? extractPageContent;
  const summaryLimit = exactSummaryLimit(options.summaryLimit);

  return {
    readRawSource: (source, signal) => readRawSource(source, signal, {
      fetchImpl,
      extractPage,
      summaryLimit
    }),
    renderBrowserSource: (source, signal) => readBrowserSource(source, signal, {
      renderBrowser,
      extractPage,
      summaryLimit
    })
  };
}

async function readRawSource(
  source: CombinedGeoReportV4Source,
  signal: AbortSignal | undefined,
  dependencies: {
    readonly fetchImpl: typeof fetch;
    readonly extractPage: typeof extractPageContent;
    readonly summaryLimit: number;
  }
): Promise<ReportV4SourceAuditRead> {
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await dependencies.fetchImpl(source.canonicalUrl, {
      signal,
      headers: { "user-agent": REPORT_V4_SOURCE_AUDIT_USER_AGENT }
    });
  } catch {
    return inaccessibleUnlessAborted(signal);
  }
  signal?.throwIfAborted();
  if (!response.ok || !isHtml(response.headers.get("content-type"))) return { status: "inaccessible" };

  let extracted: ExtractedPageContent;
  try {
    const html = await response.text();
    signal?.throwIfAborted();
    const finalUrl = response.headers.get("x-ogc-final-url") ?? source.canonicalUrl;
    extracted = dependencies.extractPage(html, finalUrl, { maximumReadableCharacters: 100_000 });
  } catch {
    return inaccessibleUnlessAborted(signal);
  }
  signal?.throwIfAborted();
  const text = normalizedText(extracted.text);
  if (!text || isExplicitlyClientDependent(extracted)) return { status: "insufficient" };
  return { status: "available", summary: boundedSummary(text, dependencies.summaryLimit) };
}

async function readBrowserSource(
  source: CombinedGeoReportV4Source,
  signal: AbortSignal | undefined,
  dependencies: {
    readonly renderBrowser: typeof renderReportV4AdmissionHtml;
    readonly extractPage: typeof extractPageContent;
    readonly summaryLimit: number;
  }
): Promise<ReportV4SourceAuditRead> {
  signal?.throwIfAborted();
  try {
    const rendered = await dependencies.renderBrowser(source.canonicalUrl, signal);
    signal?.throwIfAborted();
    if (!rendered) return { status: "inaccessible" };
    const extracted = dependencies.extractPage(rendered.html, rendered.url, {
      maximumReadableCharacters: 100_000
    });
    signal?.throwIfAborted();
    const text = normalizedText(extracted.text);
    return text
      ? { status: "available", summary: boundedSummary(text, dependencies.summaryLimit) }
      : { status: "inaccessible" };
  } catch {
    return inaccessibleUnlessAborted(signal);
  }
}

function inaccessibleUnlessAborted(signal: AbortSignal | undefined): ReportV4SourceAuditRead {
  signal?.throwIfAborted();
  return { status: "inaccessible" };
}

function isHtml(contentType: string | null): boolean {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function isExplicitlyClientDependent(extracted: ExtractedPageContent): boolean {
  return extracted.browserFallback.reasons.some((reason) => (
    reason === "hydration-root-without-content" || reason === "client-rendering-marker"
  ));
}

function normalizedText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function boundedSummary(value: string, limit: number): string {
  let bounded = value.slice(0, limit).trim();
  if (/[\uD800-\uDBFF]$/u.test(bounded)) bounded = bounded.slice(0, -1);
  return bounded;
}

function exactSummaryLimit(value: number | undefined): number {
  const limit = value ?? REPORT_V4_SOURCE_AUDIT_SUMMARY_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20_000) {
    throw new TypeError("V4 source-audit summaryLimit must be an integer from 1 through 20000.");
  }
  return limit;
}

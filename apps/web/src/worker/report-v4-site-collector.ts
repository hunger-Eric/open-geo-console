import {
  V4_STANDARD_ANALYZABLE_PAGE_LIMIT,
  classifyAnalyzableSitePage,
  type AnalyzablePageAccess,
  type AnalyzablePageExclusionReason,
  type AnalyzablePageExplicitExclusion,
  type AnalyzablePageNetworkSafety,
  type AnalyzableSitePage
} from "@open-geo-console/site-crawler";

export interface ReportV4SiteCandidate {
  readonly siteUrl: string;
  readonly url: string;
  readonly networkSafety: AnalyzablePageNetworkSafety;
  readonly access: AnalyzablePageAccess;
  readonly contentType?: string;
  readonly explicitExclusion?: AnalyzablePageExplicitExclusion;
}

export interface ReportV4HtmlRead {
  /** Final URL after the injected reader has enforced its redirect/DNS safety boundary. */
  readonly url: string;
  readonly networkSafety: AnalyzablePageNetworkSafety;
  readonly access: AnalyzablePageAccess;
  readonly contentType: string;
  readonly html: string;
  readonly explicitExclusion?: AnalyzablePageExplicitExclusion;
}

export interface ReportV4SiteCollectorDependencies {
  readonly readRawHtml: (
    candidate: ReportV4SiteCandidate,
    signal?: AbortSignal
  ) => Promise<ReportV4HtmlRead>;
  readonly renderBrowserHtml: (
    url: string,
    signal?: AbortSignal
  ) => Promise<ReportV4HtmlRead>;
  readonly extractAnalyzableText: (read: ReportV4HtmlRead) => string;
}

export type ReportV4SiteCollectorExclusionReason =
  | AnalyzablePageExclusionReason
  | "raw_fetch_failed"
  | "raw_extraction_failed"
  | "browser_render_failed";

export interface ReportV4CollectedPage extends AnalyzableSitePage {
  readonly readability: "direct_readable" | "js_dependent";
}

export interface ReportV4SiteCollectionResult {
  readonly outcome: "unavailable" | "standard" | "custom_service";
  readonly analyzablePageCount: number;
  readonly pages: ReportV4CollectedPage[];
  readonly exclusions: Array<{
    url: string;
    normalizedUrl?: string;
    reason: ReportV4SiteCollectorExclusionReason;
  }>;
}

export async function collectReportV4Site(
  candidates: ReadonlyArray<ReportV4SiteCandidate>,
  dependencies: ReportV4SiteCollectorDependencies,
  signal?: AbortSignal
): Promise<ReportV4SiteCollectionResult> {
  const pages: ReportV4CollectedPage[] = [];
  const exclusions: ReportV4SiteCollectionResult["exclusions"] = [];
  const admittedUrls = new Set<string>();

  for (const candidate of candidates) {
    const preflight = classifyAnalyzableSitePage({
      siteUrl: candidate.siteUrl,
      url: candidate.url,
      networkSafety: candidate.networkSafety,
      access: candidate.access,
      contentType: candidate.contentType ?? "text/html",
      analyzableText: "candidate-preflight",
      ...(candidate.explicitExclusion ? { explicitExclusion: candidate.explicitExclusion } : {})
    });
    if (preflight.status === "excluded") {
      exclusions.push(exclusionFromClassification(preflight));
      continue;
    }

    let raw: ReportV4HtmlRead;
    try {
      raw = await dependencies.readRawHtml(candidate, signal);
    } catch {
      exclusions.push({ url: candidate.url, reason: "raw_fetch_failed" });
      continue;
    }

    const rawMetadataClassification = classifyReadMetadata(candidate.siteUrl, raw);
    if (rawMetadataClassification.status === "excluded") {
      exclusions.push(exclusionFromClassification(rawMetadataClassification));
      continue;
    }

    let rawText: string;
    try {
      rawText = dependencies.extractAnalyzableText(raw);
    } catch {
      exclusions.push({ url: raw.url, reason: "raw_extraction_failed" });
      continue;
    }
    const rawClassification = classifyRead(candidate.siteUrl, raw, rawText);
    if (rawClassification.status === "analyzable") {
      const result = admitPage(rawClassification.page, "direct_readable", admittedUrls, pages, exclusions);
      if (result === "capacity_exceeded") return customService(pages, exclusions);
      continue;
    }
    if (rawClassification.reason !== "empty_analyzable_body") {
      exclusions.push(exclusionFromClassification(rawClassification));
      continue;
    }

    let rendered: ReportV4HtmlRead;
    try {
      rendered = await dependencies.renderBrowserHtml(raw.url, signal);
    } catch {
      exclusions.push({ url: raw.url, reason: "browser_render_failed" });
      continue;
    }

    const renderedMetadataClassification = classifyReadMetadata(candidate.siteUrl, rendered);
    if (renderedMetadataClassification.status === "excluded") {
      exclusions.push(exclusionFromClassification(renderedMetadataClassification));
      continue;
    }

    let renderedText: string;
    try {
      renderedText = dependencies.extractAnalyzableText(rendered);
    } catch {
      exclusions.push({ url: rendered.url, reason: "browser_render_failed" });
      continue;
    }
    const renderedClassification = classifyRead(candidate.siteUrl, rendered, renderedText);
    if (renderedClassification.status === "excluded") {
      exclusions.push(exclusionFromClassification(renderedClassification));
      continue;
    }
    const result = admitPage(renderedClassification.page, "js_dependent", admittedUrls, pages, exclusions);
    if (result === "capacity_exceeded") return customService(pages, exclusions);
  }

  if (pages.length === 0) {
    return { outcome: "unavailable", analyzablePageCount: 0, pages: [], exclusions };
  }
  return { outcome: "standard", analyzablePageCount: pages.length, pages, exclusions };
}

function classifyReadMetadata(siteUrl: string, read: ReportV4HtmlRead) {
  return classifyRead(siteUrl, read, "read-metadata-preflight");
}

function classifyRead(siteUrl: string, read: ReportV4HtmlRead, analyzableText: string) {
  return classifyAnalyzableSitePage({
    siteUrl,
    url: read.url,
    networkSafety: read.networkSafety,
    access: read.access,
    contentType: read.contentType,
    analyzableText,
    ...(read.explicitExclusion ? { explicitExclusion: read.explicitExclusion } : {})
  });
}

function admitPage(
  page: AnalyzableSitePage,
  readability: ReportV4CollectedPage["readability"],
  admittedUrls: Set<string>,
  pages: ReportV4CollectedPage[],
  exclusions: ReportV4SiteCollectionResult["exclusions"]
): "admitted" | "duplicate" | "capacity_exceeded" {
  if (admittedUrls.has(page.normalizedUrl)) {
    exclusions.push({ url: page.normalizedUrl, normalizedUrl: page.normalizedUrl, reason: "duplicate" });
    return "duplicate";
  }
  admittedUrls.add(page.normalizedUrl);
  pages.push({ ...page, readability });
  return pages.length > V4_STANDARD_ANALYZABLE_PAGE_LIMIT ? "capacity_exceeded" : "admitted";
}

function customService(
  pages: ReportV4CollectedPage[],
  exclusions: ReportV4SiteCollectionResult["exclusions"]
): ReportV4SiteCollectionResult {
  const thresholdPages = pages.slice(0, V4_STANDARD_ANALYZABLE_PAGE_LIMIT + 1);
  return {
    outcome: "custom_service",
    analyzablePageCount: thresholdPages.length,
    pages: thresholdPages,
    exclusions
  };
}

function exclusionFromClassification(
  classification: Extract<ReturnType<typeof classifyAnalyzableSitePage>, { status: "excluded" }>
): ReportV4SiteCollectionResult["exclusions"][number] {
  return {
    url: classification.url,
    ...(classification.normalizedUrl ? { normalizedUrl: classification.normalizedUrl } : {}),
    reason: classification.reason
  };
}

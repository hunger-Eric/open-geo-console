import { normalizeDiscoveredUrl } from "./discovery";
import { isBlockedHostname, parseHttpUrl, UrlSafetyError } from "./security";
import { isSameSite } from "./site-key";

export const V4_STANDARD_ANALYZABLE_PAGE_LIMIT = 50;

export type AnalyzablePageNetworkSafety = "public" | "unsafe" | "unverified";
export type AnalyzablePageAccess = "public" | "login_required" | "captcha_required" | "paywalled";
export type AnalyzablePageExplicitExclusion = "robots_denied" | "policy_excluded";

export type AnalyzablePageExclusionReason =
  | "invalid_url"
  | "unsupported_protocol"
  | "embedded_credentials"
  | "unsafe_network"
  | "unverified_network_safety"
  | "cross_site"
  | "excluded_document_type"
  | "login_required"
  | "captcha_required"
  | "paywalled"
  | AnalyzablePageExplicitExclusion
  | "non_html_content_type"
  | "empty_analyzable_body"
  | "duplicate";

export interface AnalyzableSitePageObservation {
  /** The canonical target site whose public HTML is being admitted. */
  siteUrl: string;
  /** The final URL after redirects have already passed the crawler safety boundary. */
  url: string;
  /** A caller-supplied result from the existing DNS/redirect safety boundary. */
  networkSafety: AnalyzablePageNetworkSafety;
  access: AnalyzablePageAccess;
  contentType: string;
  analyzableText: string;
  explicitExclusion?: AnalyzablePageExplicitExclusion;
}

export interface AnalyzableSitePage {
  normalizedUrl: string;
  contentType: "text/html" | "application/xhtml+xml";
  analyzableText: string;
}

export type AnalyzableSitePageClassification =
  | { status: "analyzable"; page: AnalyzableSitePage }
  | {
      status: "excluded";
      url: string;
      normalizedUrl?: string;
      reason: Exclude<AnalyzablePageExclusionReason, "duplicate">;
    };

export interface AnalyzableSiteAdmission {
  outcome: "unavailable" | "standard" | "custom_service";
  analyzablePageCount: number;
  pages: AnalyzableSitePage[];
  exclusions: Array<{
    url: string;
    normalizedUrl?: string;
    reason: AnalyzablePageExclusionReason;
  }>;
}

const EXCLUDED_DOCUMENT_PATH = /\.(?:avif|bmp|csv|docx?|gif|ico|jpe?g|mp3|mp4|mov|pdf|png|pptx?|rar|svg|tar|tiff?|webm|webp|xlsx?|zip)$/i;
const HTML_CONTENT_TYPES = new Set<AnalyzableSitePage["contentType"]>([
  "text/html",
  "application/xhtml+xml"
]);

function excluded(
  observation: AnalyzableSitePageObservation,
  reason: Exclude<AnalyzablePageExclusionReason, "duplicate">,
  normalizedUrl?: string
): AnalyzableSitePageClassification {
  return {
    status: "excluded",
    url: observation.url,
    ...(normalizedUrl ? { normalizedUrl } : {}),
    reason
  };
}

function urlFailureReason(error: unknown): Extract<
  AnalyzablePageExclusionReason,
  "invalid_url" | "unsupported_protocol" | "embedded_credentials"
> {
  if (error instanceof UrlSafetyError && error.code === "unsupported-protocol") return "unsupported_protocol";
  if (error instanceof UrlSafetyError && error.code === "embedded-credentials") return "embedded_credentials";
  return "invalid_url";
}

export function classifyAnalyzableSitePage(
  observation: AnalyzableSitePageObservation
): AnalyzableSitePageClassification {
  let url: URL;
  let siteUrl: URL;
  try {
    url = parseHttpUrl(observation.url);
    siteUrl = parseHttpUrl(observation.siteUrl);
  } catch (error) {
    return excluded(observation, urlFailureReason(error));
  }

  if (EXCLUDED_DOCUMENT_PATH.test(url.pathname)) {
    return excluded(observation, "excluded_document_type");
  }

  if (isBlockedHostname(url.hostname) || isBlockedHostname(siteUrl.hostname)) {
    return excluded(observation, "unsafe_network");
  }

  const normalized = normalizeDiscoveredUrl(url);
  if (!normalized) return excluded(observation, "excluded_document_type");
  const normalizedUrl = normalized.href;

  if (observation.networkSafety === "unsafe") {
    return excluded(observation, "unsafe_network", normalizedUrl);
  }
  if (observation.networkSafety !== "public") {
    return excluded(observation, "unverified_network_safety", normalizedUrl);
  }
  if (!isSameSite(siteUrl, normalized)) {
    return excluded(observation, "cross_site", normalizedUrl);
  }
  if (observation.access !== "public") {
    return excluded(observation, observation.access, normalizedUrl);
  }
  if (observation.explicitExclusion) {
    return excluded(observation, observation.explicitExclusion, normalizedUrl);
  }

  const contentType = observation.contentType.split(";", 1)[0]!.trim().toLowerCase();
  if (!HTML_CONTENT_TYPES.has(contentType as AnalyzableSitePage["contentType"])) {
    return excluded(observation, "non_html_content_type", normalizedUrl);
  }

  const analyzableText = observation.analyzableText.trim();
  if (!analyzableText) {
    return excluded(observation, "empty_analyzable_body", normalizedUrl);
  }

  return {
    status: "analyzable",
    page: {
      normalizedUrl,
      contentType: contentType as AnalyzableSitePage["contentType"],
      analyzableText
    }
  };
}

export function assessAnalyzableSiteAdmission(
  observations: ReadonlyArray<AnalyzableSitePageObservation>
): AnalyzableSiteAdmission {
  const pages: AnalyzableSitePage[] = [];
  const exclusions: AnalyzableSiteAdmission["exclusions"] = [];
  const admittedUrls = new Set<string>();

  for (const observation of observations) {
    const classification = classifyAnalyzableSitePage(observation);
    if (classification.status === "excluded") {
      exclusions.push({
        url: classification.url,
        ...(classification.normalizedUrl ? { normalizedUrl: classification.normalizedUrl } : {}),
        reason: classification.reason
      });
      continue;
    }

    if (admittedUrls.has(classification.page.normalizedUrl)) {
      exclusions.push({
        url: observation.url,
        normalizedUrl: classification.page.normalizedUrl,
        reason: "duplicate"
      });
      continue;
    }
    admittedUrls.add(classification.page.normalizedUrl);
    pages.push(classification.page);
  }

  const analyzablePageCount = pages.length;
  if (analyzablePageCount === 0) {
    return { outcome: "unavailable", analyzablePageCount, pages: [], exclusions };
  }
  if (analyzablePageCount > V4_STANDARD_ANALYZABLE_PAGE_LIMIT) {
    return { outcome: "custom_service", analyzablePageCount, pages: [], exclusions };
  }
  return { outcome: "standard", analyzablePageCount, pages, exclusions };
}

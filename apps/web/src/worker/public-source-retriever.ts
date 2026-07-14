import type { RetrievedPublicSourceFact } from "@open-geo-console/citation-intelligence";
import {
  extractReadableText,
  isAllowedByRobots,
  parseRobotsTxt,
  UrlSafetyError,
  type HostnameResolver,
  type RobotsPolicy
} from "@open-geo-console/site-crawler";
import { createSafeFetch } from "@/server/safe-fetch";
import {
  createPublicSourceRetrievalRequest,
  normalizePublicSourceRetrievalResult,
  type PublicSourceRetrievalRequest
} from "./public-source-retrieval";

const PUBLIC_SOURCE_CRAWLER_USER_AGENT = "OpenGeoConsoleBot";
const ROBOTS_MAX_BYTES = 64 * 1024;
const EXCERPT_MAX_CHARACTERS = 1_000;

export interface PublicSourceRetrieverOptions {
  fetchImpl?: typeof fetch;
  resolver?: HostnameResolver;
  signal?: AbortSignal;
}

/**
 * Performs the V2-only public-source retrieval boundary. It intentionally
 * returns normalized evidence facts only; raw provider or publisher responses
 * never leave this function.
 */
export async function executePublicSourceRetrieval(input: {
  observationId: string;
  queryId: string;
  resultUrl: string;
}, options: PublicSourceRetrieverOptions = {}): Promise<RetrievedPublicSourceFact> {
  options.signal?.throwIfAborted();
  const request = createPublicSourceRetrievalRequest(input);
  const robotsPolicies = new Map<string, RobotsPolicy>();
  const robotsCheckedOrigins = new Set<string>();
  const visitedUrls: string[] = [];
  let publiclyRoutable = false;
  let robotsAllowed = true;

  const robotsFetch = createSafeFetch({
    fetchImpl: options.fetchImpl,
    resolver: options.resolver,
    maxBytes: ROBOTS_MAX_BYTES,
    maxRedirects: request.maxRedirects,
    allowedContentTypes: ["text/plain"]
  });
  const fetchSource = createSafeFetch({
    fetchImpl: options.fetchImpl,
    resolver: options.resolver,
    maxBytes: request.maxBytes,
    maxRedirects: request.maxRedirects,
    beforeRequest: async (target) => {
      publiclyRoutable = true;
      visitedUrls.push(target.href);
      const origin = target.origin;
      let policy = robotsPolicies.get(origin);
      if (!policy) {
        robotsCheckedOrigins.add(origin);
        policy = await loadRobotsPolicy(robotsFetch, origin, options.signal);
        robotsPolicies.set(origin, policy);
      }
      if (!isAllowedByRobots(target, policy)) {
        robotsAllowed = false;
        throw new PublicSourceRobotsDeniedError();
      }
    }
  });

  try {
    const response = await fetchSource(request.resultUrl, {
      signal: options.signal,
      headers: {
        accept: "text/html,text/plain,application/xhtml+xml;q=0.9",
        "user-agent": PUBLIC_SOURCE_CRAWLER_USER_AGENT
      }
    });
    const finalUrl = response.headers.get("x-ogc-final-url") ?? request.resultUrl;
    const common = retrievalCommon(request, visitedUrls, finalUrl, robotsCheckedOrigins);
    if (!response.ok) {
      return unavailableResult({
        request,
        ...common,
        publiclyRoutable,
        robotsAllowed,
        ...httpAccessState(response.status)
      });
    }

    // The raw body is kept only in-process long enough to derive bounded,
    // normalized evidence. It is never returned, logged, or persisted.
    const raw = await response.text();
    const normalizedText = extractReadableText(raw, 20_000).replace(/\s+/g, " ").trim();
    if (!normalizedText) {
      return unavailableResult({
        request,
        ...common,
        publiclyRoutable,
        robotsAllowed,
        retrievalState: "inaccessible",
        accessBarrier: "unknown"
      });
    }
    return normalizePublicSourceRetrievalResult({
      request,
      ...common,
      retrievalState: "available",
      publiclyRoutable,
      robotsAllowed,
      accessBarrier: "none",
      contentBytes: new TextEncoder().encode(raw).byteLength,
      normalizedText,
      verifiedExcerpt: normalizedText.slice(0, EXCERPT_MAX_CHARACTERS)
    });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    const common = retrievalCommon(request, visitedUrls, undefined, robotsCheckedOrigins);
    if (error instanceof PublicSourceRobotsDeniedError) {
      return unavailableResult({
        request,
        ...common,
        publiclyRoutable,
        robotsAllowed: false,
        retrievalState: "robots_denied",
        accessBarrier: "unknown"
      });
    }
    if (error instanceof UrlSafetyError) {
      return unavailableResult({
        request,
        ...common,
        publiclyRoutable: false,
        robotsAllowed: false,
        retrievalState: "unsafe_destination",
        accessBarrier: "unknown"
      });
    }
    return unavailableResult({
      request,
      ...common,
      publiclyRoutable,
      robotsAllowed: false,
      retrievalState: "inaccessible",
      accessBarrier: "unknown"
    });
  }
}

async function loadRobotsPolicy(fetchImpl: typeof fetch, origin: string, signal?: AbortSignal): Promise<RobotsPolicy> {
  const robotsUrl = new URL("/robots.txt", origin);
  const response = await fetchImpl(robotsUrl, {
    signal,
    headers: { "user-agent": PUBLIC_SOURCE_CRAWLER_USER_AGENT }
  });
  if (response.status === 404 || response.status === 410) {
    return parseRobotsTxt("", robotsUrl, PUBLIC_SOURCE_CRAWLER_USER_AGENT);
  }
  if (!response.ok) throw new Error("Public-source robots policy is unavailable.");
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && contentType !== "text/plain") throw new Error("Public-source robots policy has an unsafe content type.");
  const text = await response.text();
  if (text.includes("\0") || text.split(/\r?\n/).some((line) => {
    const normalized = line.trim();
    return normalized && !normalized.startsWith("#") && !/^[A-Za-z][A-Za-z-]*\s*:/.test(normalized);
  })) {
    throw new Error("Public-source robots policy cannot be safely parsed.");
  }
  return parseRobotsTxt(text, robotsUrl, PUBLIC_SOURCE_CRAWLER_USER_AGENT);
}

function retrievalCommon(
  request: PublicSourceRetrievalRequest,
  visitedUrls: readonly string[],
  finalUrl: string | undefined,
  robotsCheckedOrigins: ReadonlySet<string>
) {
  const normalizedFinalUrl = finalUrl ? new URL(finalUrl).href : undefined;
  const redirects = visitedUrls
    .slice(1)
    .filter((url, index, values) => url !== normalizedFinalUrl || index !== values.length - 1);
  return {
    ...(normalizedFinalUrl ? { finalUrl: normalizedFinalUrl } : {}),
    ...(redirects.length ? { redirectChain: redirects } : {}),
    robotsCheckedOrigins: [...robotsCheckedOrigins]
  };
}

function httpAccessState(status: number): Pick<RetrievedPublicSourceFact, "retrievalState" | "accessBarrier"> {
  if (status === 401) return { retrievalState: "login_required", accessBarrier: "login" };
  if (status === 402) return { retrievalState: "paywalled", accessBarrier: "paywall" };
  if (status === 429) return { retrievalState: "captcha", accessBarrier: "captcha" };
  return { retrievalState: "inaccessible", accessBarrier: "unknown" };
}

function unavailableResult(input: Parameters<typeof normalizePublicSourceRetrievalResult>[0]): RetrievedPublicSourceFact {
  return normalizePublicSourceRetrievalResult(input);
}

class PublicSourceRobotsDeniedError extends Error {}

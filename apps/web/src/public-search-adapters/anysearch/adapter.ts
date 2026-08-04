import {
  deterministicId,
  type MarketSearchObservation,
  type PublicSearchRequest,
  type PublicSearchSurface,
  type PublicSearchSurfaceAdapter,
  type PublicSearchSurfaceAuthority,
  type SearchAdapterErrorClass,
  type SearchResultObservation
} from "@open-geo-console/public-search-observer";
import { isBlockedHostname, parseHttpUrl } from "@open-geo-console/site-crawler";
import type { PublicSearchAdapterFactory, PublicSearchAdapterIdentity } from "../types";
import { readAnySearchPublicSearchConfig, type AnySearchPublicSearchConfig } from "./config";

export const ANYSEARCH_PUBLIC_SEARCH_ADAPTER_VERSION = "anysearch-rest-adapter-v1";
const ADAPTER_ID = "anysearch";
const PROVIDER_ID = "anysearch";
const PRODUCT_ID = "unified-search";
const SURFACE_ID = "anysearch-unified-search";
const SURFACE_VERSION = "anysearch-unified-search-v1";
const MODEL_ID = "anysearch-unified-search-v1";

type AnySearchErrorClass = "authentication" | "unsupported" | "rate_limited" | "aborted" | "unavailable" | "malformed";

export class AnySearchPublicSearchAdapterError extends Error {
  constructor(readonly errorClass: AnySearchErrorClass, message: string) {
    super(message);
    this.name = "AnySearchPublicSearchAdapterError";
  }
}

export interface AnySearchAdmittedResult {
  title: string;
  url: string;
  snippet: string;
}

export function createAnySearchPublicSearchAdapterFactory(): PublicSearchAdapterFactory {
  return {
    adapterId: ADAPTER_ID,
    resolveIdentity({ environment, locale, region }) {
      return identityFor(readAnySearchPublicSearchConfig(environment, locale, region));
    },
    create({ environment, authority }) {
      const config = readAnySearchPublicSearchConfig(environment, authority.surface.locale, authority.surface.region);
      assertExactAuthority(authority, identityFor(config));
      return createAnySearchPublicSearchAdapter({ config, authority });
    }
  };
}

export function createAnySearchPublicSearchAdapter(input: {
  config: AnySearchPublicSearchConfig;
  authority: PublicSearchSurfaceAuthority;
  fetch?: typeof fetch;
}): PublicSearchSurfaceAdapter {
  const identity = identityFor(input.config);
  assertExactAuthority(input.authority, identity);
  return {
    id: `${ADAPTER_ID}:${identity.surface.surfaceVersion}`,
    surface: identity.surface,
    authority: input.authority,
    async search(request: PublicSearchRequest): Promise<MarketSearchObservation> {
      if (!sameSurface(request.surface, identity.surface) || request.query.locale !== input.config.locale || request.query.region !== input.config.region) {
        throw new AnySearchPublicSearchAdapterError("unsupported", "AnySearch request identity does not match the configured public-search surface.");
      }
      const requestedAt = new Date().toISOString();
      try {
        const results = await fetchAnySearchResults({
          config: input.config,
          query: request.query.exactQuery,
          maxResults: Math.min(request.budget.maxResults, request.query.resultDepth),
          signal: request.signal,
          fetch: input.fetch
        });
        const completedAt = new Date().toISOString();
        return {
          observationId: deterministicId("observation", [ADAPTER_ID, identity.surface.adapterVersion, request.query.id, requestedAt, completedAt]),
          surface: identity.surface,
          queryId: request.query.id,
          exactQuery: request.query.exactQuery,
          requestedAt,
          completedAt,
          status: "complete",
          results: results.map((result, index): SearchResultObservation => ({
            surfaceResultOrder: index + 1,
            url: result.url,
            title: result.title,
            snippet: result.snippet,
            displayedHost: new URL(result.url).hostname.toLowerCase()
          })),
          usage: { requestCount: 1, resultCount: results.length, costUncertain: true }
        };
      } catch (error) {
        if (!(error instanceof AnySearchPublicSearchAdapterError) || error.errorClass !== "malformed") throw error;
        const completedAt = new Date().toISOString();
        return {
          observationId: deterministicId("observation", [ADAPTER_ID, identity.surface.adapterVersion, request.query.id, requestedAt, completedAt]),
          surface: identity.surface,
          queryId: request.query.id,
          exactQuery: request.query.exactQuery,
          requestedAt,
          completedAt,
          status: "malformed",
          results: [],
          usage: { requestCount: 1, resultCount: 0, costUncertain: true },
          sanitizedError: "The AnySearch response did not contain valid public search results."
        };
      }
    },
    classifyError(error: unknown): SearchAdapterErrorClass {
      if (error instanceof AnySearchPublicSearchAdapterError) return error.errorClass as SearchAdapterErrorClass;
      return isAbortError(error) ? "aborted" : "unavailable";
    }
  };
}

export async function fetchAnySearchResults(input: {
  config: AnySearchPublicSearchConfig;
  query: string;
  maxResults: number;
  signal: AbortSignal;
  fetch?: typeof fetch;
}): Promise<AnySearchAdmittedResult[]> {
  if (input.signal.aborted) throw new AnySearchPublicSearchAdapterError("aborted", "AnySearch request was aborted.");
  let response: Response;
  try {
    response = await (input.fetch ?? fetch)(input.config.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.config.apiKey}` },
      body: JSON.stringify({
        query: input.query,
        max_results: Math.max(1, Math.min(input.maxResults, 20)),
        zone: input.config.zone,
        language: input.config.locale,
        format: "json"
      }),
      signal: input.signal
    });
  } catch (error) {
    if (isAbortError(error)) throw new AnySearchPublicSearchAdapterError("aborted", "AnySearch request was aborted.");
    throw new AnySearchPublicSearchAdapterError("unavailable", "AnySearch transport failed.");
  }
  if (!response.ok) throw httpFailure(response.status);
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new AnySearchPublicSearchAdapterError("malformed", "AnySearch returned a non-JSON response."); }
  return parseAnySearchResults(payload, input.maxResults);
}

export function parseAnySearchResults(payload: unknown, maximum: number): AnySearchAdmittedResult[] {
  const root = record(payload);
  const data = record(root?.data);
  if (typeof root?.code !== "number" || root.code !== 0 || !Array.isArray(data?.results)) {
    throw new AnySearchPublicSearchAdapterError("malformed", "AnySearch returned an invalid response envelope.");
  }
  const results: AnySearchAdmittedResult[] = [];
  const seen = new Set<string>();
  for (const value of data.results) {
    const row = record(value);
    if (!row || typeof row.title !== "string" || typeof row.url !== "string" || typeof row.snippet !== "string") {
      throw new AnySearchPublicSearchAdapterError("malformed", "AnySearch returned an invalid result.");
    }
    const title = boundedText(row.title, 500);
    const snippet = boundedText(row.snippet, 2_000);
    const url = publicUrl(row.url);
    if (!title || !snippet || !url) throw new AnySearchPublicSearchAdapterError("malformed", "AnySearch returned an unsafe or invalid result.");
    if (seen.has(url)) continue;
    seen.add(url);
    if (results.length < Math.max(1, Math.min(maximum, 20))) results.push({ title, url, snippet });
  }
  return results;
}

function identityFor(config: AnySearchPublicSearchConfig): PublicSearchAdapterIdentity {
  const surface: PublicSearchSurface = {
    surfaceId: SURFACE_ID,
    providerId: PROVIDER_ID,
    productId: PRODUCT_ID,
    surfaceKind: "documented_api",
    contractVersion: "public-search-surface-v1",
    surfaceVersion: SURFACE_VERSION,
    adapterVersion: ANYSEARCH_PUBLIC_SEARCH_ADAPTER_VERSION,
    locale: config.locale,
    region: config.region
  };
  return { adapterId: ADAPTER_ID, providerId: PROVIDER_ID, productId: PRODUCT_ID, modelId: MODEL_ID, adapterVersion: ANYSEARCH_PUBLIC_SEARCH_ADAPTER_VERSION, surface };
}

function assertExactAuthority(authority: PublicSearchSurfaceAuthority, identity: PublicSearchAdapterIdentity): void {
  if (!sameSurface(authority.surface, identity.surface)) throw new Error("AnySearch public-search authority does not match the exact configured surface.");
}

function sameSurface(left: PublicSearchSurface, right: PublicSearchSurface): boolean {
  return left.surfaceId === right.surfaceId && left.providerId === right.providerId && left.productId === right.productId &&
    left.surfaceKind === right.surfaceKind && left.contractVersion === right.contractVersion && left.surfaceVersion === right.surfaceVersion &&
    left.adapterVersion === right.adapterVersion && left.locale === right.locale && left.region === right.region;
}

function publicUrl(value: string): string | null {
  if (value.length > 2_000) return null;
  try {
    const parsed = parseHttpUrl(value);
    if (isBlockedHostname(parsed.hostname) || parsed.username || parsed.password) return null;
    parsed.hash = "";
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.href;
  } catch { return null; }
}

function boundedText(value: string, maximum: number): string | null {
  const normalized = value.trim();
  return normalized && normalized.length <= maximum && !/[\u0000-\u001F\u007F]/.test(normalized) ? normalized : null;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function httpFailure(status: number): AnySearchPublicSearchAdapterError {
  if (status === 401 || status === 403) return new AnySearchPublicSearchAdapterError("authentication", "AnySearch rejected the configured credential.");
  if (status === 400 || status === 404 || status === 422) return new AnySearchPublicSearchAdapterError("unsupported", "AnySearch rejected the search request.");
  if (status === 429) return new AnySearchPublicSearchAdapterError("rate_limited", "AnySearch rate-limited the search request.");
  return new AnySearchPublicSearchAdapterError("unavailable", "AnySearch was unavailable.");
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

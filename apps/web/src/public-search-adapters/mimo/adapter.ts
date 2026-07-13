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
import type { PublicSearchAdapterFactory, PublicSearchAdapterIdentity } from "../types";
import { readMiMoPublicSearchConfig, type MiMoPublicSearchConfig } from "./config";

export const MIMO_PUBLIC_SEARCH_ADAPTER_VERSION = "mimo-web-search-adapter-v1";

const MIMO_ADAPTER_ID = "mimo";
const MIMO_PROVIDER_ID = "xiaomi-mimo";
const MIMO_PRODUCT_ID = "native-web-search";
const MIMO_SURFACE_ID = "mimo-native-web-search";
const MIMO_SURFACE_VERSION = "mimo-native-web-search-v1";

type MiMoAdapterErrorClass = "authentication" | "unsupported" | "rate_limited" | "aborted" | "unavailable" | "malformed";

export class MiMoPublicSearchAdapterError extends Error {
  constructor(readonly errorClass: MiMoAdapterErrorClass, message: string) {
    super(message);
    this.name = "MiMoPublicSearchAdapterError";
  }
}

export function createMiMoPublicSearchAdapterFactory(): PublicSearchAdapterFactory {
  return {
    adapterId: MIMO_ADAPTER_ID,
    resolveIdentity({ environment, locale, region }): PublicSearchAdapterIdentity {
      const config = readMiMoPublicSearchConfig(environment, locale, region);
      return identityFor(config);
    },
    create({ environment, authority }): PublicSearchSurfaceAdapter {
      const config = readMiMoPublicSearchConfig(environment, authority.surface.locale, authority.surface.region);
      const identity = identityFor(config);
      assertExactAuthority(authority, identity);
      return createMiMoPublicSearchAdapter({ config, authority });
    }
  };
}

export function createMiMoPublicSearchAdapter(input: {
  config: MiMoPublicSearchConfig;
  authority: PublicSearchSurfaceAuthority;
  fetch?: typeof fetch;
}): PublicSearchSurfaceAdapter {
  const identity = identityFor(input.config);
  assertExactAuthority(input.authority, identity);
  const transport = input.fetch ?? fetch;

  return {
    id: `${MIMO_ADAPTER_ID}:${identity.surface.surfaceVersion}:${input.config.model}`,
    surface: identity.surface,
    authority: input.authority,
    async search(request: PublicSearchRequest): Promise<MarketSearchObservation> {
      if (!sameSurface(request.surface, identity.surface) || request.query.locale !== input.config.locale || request.query.region !== input.config.region) {
        throw new MiMoPublicSearchAdapterError("unsupported", "MiMo request identity does not match the configured public-search surface.");
      }
      if (request.signal.aborted) throw new MiMoPublicSearchAdapterError("aborted", "MiMo public-search request was aborted.");
      const requestedAt = new Date().toISOString();
      let response: Response;
      try {
        response = await transport(`${input.config.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.config.apiKey}`
          },
          body: JSON.stringify({
            model: input.config.model,
            messages: [{ role: "user", content: request.query.exactQuery }],
            tools: [{
              type: "web_search",
              max_keyword: Math.min(request.budget.maxRequests, 3),
              force_search: true,
              limit: Math.min(request.budget.maxResults, 20)
            }],
            stream: false,
            temperature: 0.1,
            thinking: { type: "disabled" }
          }),
          signal: request.signal
        });
      } catch (error) {
        throw transportFailure(error);
      }
      if (!response.ok) throw httpFailure(response.status);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return malformedObservation({ request, surface: identity.surface, requestedAt });
      }
      return normalizeMiMoResponse({ payload, request, surface: identity.surface, model: input.config.model, requestedAt });
    },
    classifyError(error: unknown): SearchAdapterErrorClass {
      const tagged = record(error)?.errorClass;
      const classified = error instanceof MiMoPublicSearchAdapterError
        ? error.errorClass
        : isMiMoErrorClass(tagged) ? tagged
        : isAbortError(error) ? "aborted" : "unavailable";
      return classified as SearchAdapterErrorClass;
    }
  };
}

function identityFor(config: MiMoPublicSearchConfig): PublicSearchAdapterIdentity {
  const surface: PublicSearchSurface = {
    surfaceId: MIMO_SURFACE_ID,
    providerId: MIMO_PROVIDER_ID,
    productId: MIMO_PRODUCT_ID,
    surfaceKind: "documented_api",
    contractVersion: "public-search-surface-v1",
    surfaceVersion: MIMO_SURFACE_VERSION,
    adapterVersion: MIMO_PUBLIC_SEARCH_ADAPTER_VERSION,
    locale: config.locale,
    region: config.region
  };
  return {
    adapterId: MIMO_ADAPTER_ID,
    providerId: MIMO_PROVIDER_ID,
    productId: MIMO_PRODUCT_ID,
    modelId: config.model,
    adapterVersion: MIMO_PUBLIC_SEARCH_ADAPTER_VERSION,
    surface
  };
}

function assertExactAuthority(authority: PublicSearchSurfaceAuthority, identity: PublicSearchAdapterIdentity): void {
  if (!sameSurface(authority.surface, identity.surface)) {
    throw new Error("MiMo public-search authority does not match the exact configured surface.");
  }
}

function sameSurface(left: PublicSearchSurface, right: PublicSearchSurface): boolean {
  return left.surfaceId === right.surfaceId && left.providerId === right.providerId && left.productId === right.productId &&
    left.surfaceKind === right.surfaceKind && left.contractVersion === right.contractVersion && left.surfaceVersion === right.surfaceVersion &&
    left.adapterVersion === right.adapterVersion && left.locale === right.locale && left.region === right.region;
}

function normalizeMiMoResponse(input: {
  payload: unknown;
  request: PublicSearchRequest;
  surface: PublicSearchSurface;
  model: string;
  requestedAt: string;
}): MarketSearchObservation {
  const parsed = parseMiMoPayload(input.payload);
  if (!parsed) return malformedObservation(input);
  const results = toResults(parsed.annotations);
  if (!results) return malformedObservation(input, parsed.requestCount);
  const completedAt = new Date().toISOString();
  return {
    observationId: deterministicId("observation", [MIMO_ADAPTER_ID, input.surface.adapterVersion, input.model, input.request.query.id, input.requestedAt, completedAt]),
    surface: input.surface,
    queryId: input.request.query.id,
    exactQuery: input.request.query.exactQuery,
    requestedAt: input.requestedAt,
    completedAt,
    status: results.length ? "complete" : "malformed",
    results,
    usage: { requestCount: parsed.requestCount, resultCount: results.length, costUncertain: true }
  };
}

function malformedObservation(input: {
  request: PublicSearchRequest;
  surface: PublicSearchSurface;
  requestedAt: string;
  model?: string;
}, requestCount = 0): MarketSearchObservation {
  const completedAt = new Date().toISOString();
  return {
    observationId: deterministicId("observation", [MIMO_ADAPTER_ID, input.surface.adapterVersion, input.model ?? "unknown", input.request.query.id, input.requestedAt, completedAt]),
    surface: input.surface,
    queryId: input.request.query.id,
    exactQuery: input.request.query.exactQuery,
    requestedAt: input.requestedAt,
    completedAt,
    status: "malformed",
    results: [],
    usage: { requestCount, resultCount: 0, costUncertain: true },
    sanitizedError: "The MiMo public-search response did not contain valid structured annotations."
  };
}

interface MiMoAnnotation {
  url: string;
  title: string;
  summary: string;
  siteName: string;
}

function parseMiMoPayload(value: unknown): { annotations: MiMoAnnotation[]; requestCount: number; pageUsage: number } | null {
  const payload = record(value);
  const choice = Array.isArray(payload?.choices) ? record(payload.choices[0]) : undefined;
  const message = record(choice?.message);
  const usage = record(record(payload?.usage)?.web_search_usage);
  if (!message || !Array.isArray(message.annotations) || !usage) return null;
  const requestCount = nonNegativeInteger(usage.tool_usage);
  const pageUsage = nonNegativeInteger(usage.page_usage);
  if (requestCount === undefined || pageUsage === undefined) return null;
  const annotations: MiMoAnnotation[] = [];
  for (const value of message.annotations) {
    const annotation = record(value);
    if (!annotation || annotation.type !== "url_citation") continue;
    if (typeof annotation.url !== "string" || typeof annotation.title !== "string" ||
        typeof annotation.summary !== "string" || typeof annotation.site_name !== "string") return null;
    annotations.push({ url: annotation.url, title: annotation.title, summary: annotation.summary, siteName: annotation.site_name });
  }
  return annotations.length ? { annotations, requestCount, pageUsage } : null;
}

function toResults(annotations: readonly MiMoAnnotation[]): SearchResultObservation[] | null {
  const results: SearchResultObservation[] = [];
  const seen = new Set<string>();
  for (const annotation of annotations) {
    const canonical = canonicalUrl(annotation.url);
    if (!canonical || !boundedText(annotation.title, 1_000) || !boundedText(annotation.summary, 4_000) || !boundedText(annotation.siteName, 255)) {
      return null;
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    results.push({
      surfaceResultOrder: results.length + 1,
      url: canonical,
      title: annotation.title.trim(),
      snippet: annotation.summary.trim(),
      displayedHost: annotation.siteName.trim()
    });
  }
  return results;
}

function canonicalUrl(value: string): string | null {
  if (value.length > 4_096) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
  parsed.hash = "";
  if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.href;
}

function boundedText(value: string, max: number): boolean {
  return Boolean(value.trim()) && value.length <= max && !/[\u0000-\u001F\u007F]/.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function httpFailure(status: number): MiMoPublicSearchAdapterError {
  if (status === 401 || status === 403) return new MiMoPublicSearchAdapterError("authentication", "MiMo rejected the configured public-search credential.");
  if (status === 400 || status === 404 || status === 422) return new MiMoPublicSearchAdapterError("unsupported", "MiMo rejected the public-search model or tool capability.");
  if (status === 429) return new MiMoPublicSearchAdapterError("rate_limited", "MiMo rate-limited the public-search request.");
  if (status === 408 || status === 504) return new MiMoPublicSearchAdapterError("unavailable", "MiMo public-search timed out.");
  return new MiMoPublicSearchAdapterError("unavailable", "MiMo public-search was unavailable.");
}

function transportFailure(error: unknown): MiMoPublicSearchAdapterError {
  if (isAbortError(error)) return new MiMoPublicSearchAdapterError("aborted", "MiMo public-search request was aborted.");
  return new MiMoPublicSearchAdapterError("unavailable", "MiMo public-search was unavailable.");
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError" : record(error)?.name === "AbortError";
}

function isMiMoErrorClass(value: unknown): value is MiMoAdapterErrorClass {
  return value === "authentication" || value === "unsupported" || value === "rate_limited" ||
    value === "aborted" || value === "unavailable" || value === "malformed";
}

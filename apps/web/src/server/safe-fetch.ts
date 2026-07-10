import {
  resolveSafeUrl,
  validateRedirectTarget,
  type HostnameResolver
} from "@open-geo-console/site-crawler";
import { Agent, fetch as undiciFetch } from "undici";

export const MAX_CRAWL_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  "text/html",
  "text/plain",
  "text/xml",
  "application/xml",
  "application/xhtml+xml",
  "application/json",
  "application/ld+json"
];

export interface SafeFetchOptions {
  fetchImpl?: typeof fetch;
  resolver?: HostnameResolver;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
  allowBenchmarkNetwork?: boolean;
}

export function createSafeFetch(options: SafeFetchOptions = {}): typeof fetch {
  const fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as typeof fetch);
  const maxRedirects = options.maxRedirects ?? 5;
  const maxBytes = options.maxBytes ?? MAX_CRAWL_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const allowedContentTypes = options.allowedContentTypes ?? ALLOWED_CONTENT_TYPES;
  const resolver = options.resolver;
  const allowBenchmarkNetwork =
    options.allowBenchmarkNetwork ?? process.env.OGC_ALLOW_BENCHMARK_NETWORK === "true";

  return async (input, init = {}) => {
    let current = typeof input === "string" || input instanceof URL ? new URL(input) : new URL(input.url);
    let resolved = await resolveSafeUrl(current, { resolver, allowBenchmarkNetwork });

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      const pinned = resolved.addresses[0]!;
      const pinnedFamily: 4 | 6 = pinned.family === 6 ? 6 : 4;
      const dispatcher = new Agent({
        connect: {
          lookup(_hostname, lookupOptions, callback) {
            if (lookupOptions.all) {
              callback(null, [{ address: pinned.address, family: pinnedFamily }]);
              return;
            }
            callback(null, pinned.address, pinnedFamily);
          }
        }
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const inheritedSignal = init.signal;
      const abort = () => controller.abort();
      inheritedSignal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await fetchImpl(current, {
          ...init,
          redirect: "manual",
          signal: controller.signal,
          dispatcher
        } as RequestInit & { dispatcher?: Agent });

        if (isRedirect(response.status)) {
          const location = response.headers.get("location");
          if (!location) return response;
          if (redirectCount === maxRedirects) {
            throw new Error(`The response exceeded ${maxRedirects} safe redirects.`);
          }
          resolved = await validateRedirectTarget(current, location, {
            resolver,
            allowBenchmarkNetwork
          });
          current = resolved.url;
          continue;
        }

        assertAllowedContent(response, allowedContentTypes, maxBytes);
        const body = await readLimitedBody(response, maxBytes);
        const headers = new Headers(response.headers);
        headers.set("x-ogc-final-url", current.href);
        return new Response(body.buffer as ArrayBuffer, {
          status: response.status,
          statusText: response.statusText,
          headers
        });
      } finally {
        clearTimeout(timeout);
        inheritedSignal?.removeEventListener("abort", abort);
        await dispatcher.close();
      }
    }
    throw new Error("Safe redirect handling failed.");
  };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function assertAllowedContent(response: Response, allowedContentTypes: string[], maxBytes: number) {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new Error(`Response exceeds the ${maxBytes} byte crawl limit.`);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType && !allowedContentTypes.includes(contentType)) {
    throw new Error(`Unsupported crawl content type: ${contentType}`);
  }
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`Response exceeds the ${maxBytes} byte crawl limit.`);
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

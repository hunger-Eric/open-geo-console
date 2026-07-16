import { UrlSafetyError } from "./security";

export type CrawlFailureDisposition = "permanent" | "transient";
export type CrawlFailureCode =
  | "http-not-found"
  | "http-gone"
  | "robots-denied"
  | "unsupported-content"
  | "disallowed-redirect"
  | "outside-site"
  | "http-rate-limited"
  | "http-server-error"
  | "timeout"
  | "connection-reset"
  | "dns"
  | "tls"
  | "browser"
  | "network"
  | "unknown";

export interface CrawlFailureClassification {
  disposition: CrawlFailureDisposition;
  code: CrawlFailureCode;
  status?: number;
  message: string;
}

export class CrawlPageError extends Error {
  readonly code: CrawlFailureCode;
  readonly status?: number;
  readonly disposition: CrawlFailureDisposition;

  constructor(
    code: CrawlFailureCode,
    message: string,
    options: { status?: number; disposition?: CrawlFailureDisposition } = {}
  ) {
    super(message);
    this.name = "CrawlPageError";
    this.code = code;
    this.status = options.status;
    this.disposition = options.disposition ?? dispositionForCode(code);
  }
}

const permanentCodes = new Set<CrawlFailureCode>([
  "http-not-found",
  "http-gone",
  "robots-denied",
  "unsupported-content",
  "disallowed-redirect",
  "outside-site"
]);

function dispositionForCode(code: CrawlFailureCode): CrawlFailureDisposition {
  return permanentCodes.has(code) ? "permanent" : "transient";
}

export function classifyPageFailure(error: unknown): CrawlFailureClassification {
  if (error instanceof CrawlPageError) {
    return {
      disposition: error.disposition,
      code: error.code,
      ...(error.status === undefined ? {} : { status: error.status }),
      message: error.message
    };
  }

  if (error instanceof UrlSafetyError) {
    if (error.code === "dns-resolution-failed") {
      return { disposition: "transient", code: "dns", message: error.message };
    }
    const code = error.code === "cross-site-redirect" ? "outside-site" : "disallowed-redirect";
    return { disposition: "permanent", code, message: error.message };
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const status = Number(normalized.match(/(?:http|status)\s*(\d{3})/)?.[1]);
  if (status === 404) return { disposition: "permanent", code: "http-not-found", status, message };
  if (status === 410) return { disposition: "permanent", code: "http-gone", status, message };
  if (status === 429) return { disposition: "transient", code: "http-rate-limited", status, message };
  if (status >= 500 && status <= 599) return { disposition: "transient", code: "http-server-error", status, message };
  if (normalized.includes("robots.txt") || normalized.includes("robots denied")) {
    return { disposition: "permanent", code: "robots-denied", message };
  }
  if (normalized.includes("unsupported") && normalized.includes("content type")) {
    return { disposition: "permanent", code: "unsupported-content", message };
  }
  if (normalized.includes("outside") && normalized.includes("site")) {
    return { disposition: "permanent", code: "outside-site", message };
  }
  if (normalized.includes("redirect") && (normalized.includes("disallow") || normalized.includes("leaves"))) {
    return { disposition: "permanent", code: "disallowed-redirect", message };
  }
  if (normalized.includes("econnreset") || normalized.includes("connection reset")) {
    return { disposition: "transient", code: "connection-reset", message };
  }
  if (normalized.includes("timeout") || normalized.includes("timed out") || normalized.includes("aborterror")) {
    return { disposition: "transient", code: "timeout", message };
  }
  if (normalized.includes("dns") || normalized.includes("eai_again") || normalized.includes("enotfound")) {
    return { disposition: "transient", code: "dns", message };
  }
  if (normalized.includes("tls") || normalized.includes("ssl") || normalized.includes("certificate")) {
    return { disposition: "transient", code: "tls", message };
  }
  if (normalized.includes("browser") || normalized.includes("playwright") || normalized.includes("navigation")) {
    return { disposition: "transient", code: "browser", message };
  }
  if (normalized.includes("fetch failed") || normalized.includes("network") || normalized.includes("socket")) {
    return { disposition: "transient", code: "network", message };
  }
  return { disposition: "transient", code: "unknown", message };
}

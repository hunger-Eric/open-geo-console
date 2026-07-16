export interface MiMoPublicSearchConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  locale: string;
  region: string;
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SUPPORTED_LOCALES = new Set(["zh-CN", "en"]);
const REGION = /^[A-Za-z][A-Za-z0-9-]{0,34}$/;

export function readMiMoPublicSearchConfig(
  environment: NodeJS.ProcessEnv,
  locale: string,
  region: string
): MiMoPublicSearchConfig {
  const baseUrl = required(environment.OGC_PUBLIC_SEARCH_MIMO_BASE_URL, "OGC_PUBLIC_SEARCH_MIMO_BASE_URL");
  const apiKey = required(environment.OGC_PUBLIC_SEARCH_MIMO_API_KEY, "OGC_PUBLIC_SEARCH_MIMO_API_KEY");
  const model = required(environment.OGC_PUBLIC_SEARCH_MIMO_MODEL, "OGC_PUBLIC_SEARCH_MIMO_MODEL");
  if (!MODEL_ID.test(model)) throw new Error("MiMo public-search model ID is invalid.");
  if (!SUPPORTED_LOCALES.has(locale)) throw new Error("MiMo public-search locale is unsupported.");
  if (!REGION.test(region)) throw new Error("MiMo public-search region is invalid.");

  let endpoint: URL;
  try {
    endpoint = new URL(baseUrl);
  } catch {
    throw new Error("MiMo public-search base URL is invalid.");
  }
  if (!endpoint.hostname || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("MiMo public-search base URL must not include credentials, query, or fragment.");
  }
  if (endpoint.protocol !== "https:" && !isLocalOrTestRuntime(environment)) {
    throw new Error("MiMo public-search base URL must use HTTPS outside local/test runtime.");
  }
  if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
    throw new Error("MiMo public-search base URL must use HTTP(S).");
  }
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, "");
  return { baseUrl: endpoint.href.replace(/\/$/, ""), apiKey, model, locale, region };
}

function required(value: string | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  const normalized = value.trim();
  if (normalized.length > 4_096) throw new Error(`${name} is too long.`);
  return normalized;
}

function isLocalOrTestRuntime(environment: NodeJS.ProcessEnv): boolean {
  return /^(?:test|development)$/i.test(environment.NODE_ENV ?? "") ||
    /^(?:local|test|development)$/i.test(environment.OGC_DEPLOYMENT_PROFILE ?? "");
}

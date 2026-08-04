export interface AnySearchPublicSearchConfig {
  endpoint: string;
  apiKey: string;
  locale: string;
  region: string;
  zone: "cn" | "intl";
}

const OFFICIAL_ENDPOINT = "https://api.anysearch.com/v1/search";
const SUPPORTED_LOCALES = new Set(["zh-CN", "en"]);
const REGION = /^[A-Za-z][A-Za-z0-9-]{0,34}$/;

export function readAnySearchPublicSearchConfig(
  environment: NodeJS.ProcessEnv,
  locale: string,
  region: string
): AnySearchPublicSearchConfig {
  const endpoint = required(environment.OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL, "OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL");
  const apiKey = required(environment.OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY, "OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY");
  if (endpoint.replace(/\/+$/, "") !== OFFICIAL_ENDPOINT) {
    throw new Error("AnySearch public-search endpoint must be the official v1 search endpoint.");
  }
  if (!SUPPORTED_LOCALES.has(locale)) throw new Error("AnySearch public-search locale is unsupported.");
  if (!REGION.test(region)) throw new Error("AnySearch public-search region is invalid.");
  return { endpoint: OFFICIAL_ENDPOINT, apiKey, locale, region, zone: region.toUpperCase() === "CN" ? "cn" : "intl" };
}

function required(value: string | undefined, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required.`);
  const normalized = value.trim();
  if (normalized.length > 4_096) throw new Error(`${name} is too long.`);
  return normalized;
}

import { parseHttpUrl } from "./security";
import { getDomain } from "tldts";

export const DEFAULT_MULTI_LABEL_PUBLIC_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "com.br",
  "com.cn",
  "net.cn",
  "org.cn",
  "com.hk",
  "com.sg",
  "com.tw",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.in",
  "com.mx",
  "com.tr",
  "com.sa",
  "com.ar",
  "co.za"
]);

export const DEFAULT_PRIVATE_SUFFIXES = new Set([
  "github.io",
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "web.app",
  "firebaseapp.com",
  "workers.dev",
  "onrender.com",
  "herokuapp.com",
  "azurewebsites.net",
  "cloudfront.net"
]);

export interface SiteKeyOptions {
  multiLabelPublicSuffixes?: ReadonlySet<string>;
  privateSuffixes?: ReadonlySet<string>;
}

function normalizeHostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "").replace(/^www\./, "");
}

function longestMatchingSuffix(
  hostname: string,
  suffixes: ReadonlySet<string>
): string | undefined {
  return [...suffixes]
    .filter((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))
    .sort((a, b) => b.split(".").length - a.split(".").length)[0];
}

export function getRegistrableDomain(
  hostname: string,
  options: SiteKeyOptions = {}
): string {
  const normalized = normalizeHostname(hostname);
  if (!normalized.includes(".")) return normalized;

  if (!options.multiLabelPublicSuffixes && !options.privateSuffixes) {
    return getDomain(normalized, { allowPrivateDomains: true }) ?? normalized;
  }

  const labels = normalized.split(".");
  const privateSuffix = longestMatchingSuffix(
    normalized,
    options.privateSuffixes ?? DEFAULT_PRIVATE_SUFFIXES
  );
  if (privateSuffix) {
    const suffixLabels = privateSuffix.split(".").length;
    return labels.length > suffixLabels
      ? labels.slice(-(suffixLabels + 1)).join(".")
      : normalized;
  }

  const publicSuffix = longestMatchingSuffix(
    normalized,
    options.multiLabelPublicSuffixes ?? DEFAULT_MULTI_LABEL_PUBLIC_SUFFIXES
  );
  const suffixLabels = publicSuffix?.split(".").length ?? 1;
  return labels.length > suffixLabels
    ? labels.slice(-(suffixLabels + 1)).join(".")
    : normalized;
}

export function createSiteKey(input: string | URL, options: SiteKeyOptions = {}): string {
  const url = parseHttpUrl(input);
  return getRegistrableDomain(url.hostname, options);
}

export function isSameSite(
  left: string | URL,
  right: string | URL,
  options: SiteKeyOptions = {}
): boolean {
  return createSiteKey(left, options) === createSiteKey(right, options);
}

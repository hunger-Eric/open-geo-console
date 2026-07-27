import { getRegistrableDomain, parseHttpUrl } from "@open-geo-console/site-crawler";

const TRACKING_PARAMETERS = new Set([
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "referrer", "spm",
  "utm_campaign", "utm_content", "utm_medium", "utm_source", "utm_term"
]);

export interface PublicSourceDomainIdentity {
  canonicalUrl: string;
  hostname: string;
  registrableDomain: string;
}

export function canonicalizePublicSourceUrl(input: string | URL): string {
  const url = parseHttpUrl(input);
  url.hash = "";
  url.hostname = url.hostname.toLocaleLowerCase().replace(/\.$/, "");
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMETERS.has(key.toLocaleLowerCase()) || key.toLocaleLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }
  const entries = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) =>
    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
  );
  url.search = "";
  for (const [key, value] of entries) url.searchParams.append(key, value);
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href.replace(/\?$/, "");
}

export function getPublicSourceDomainIdentity(input: string | URL): PublicSourceDomainIdentity {
  const canonicalUrl = canonicalizePublicSourceUrl(input);
  const url = new URL(canonicalUrl);
  return {
    canonicalUrl,
    hostname: url.hostname,
    registrableDomain: getRegistrableDomain(url.hostname)
  };
}

export function arePublicSourcesIndependentlyControlled(left: string | URL, right: string | URL): boolean {
  return getPublicSourceDomainIdentity(left).registrableDomain !== getPublicSourceDomainIdentity(right).registrableDomain;
}

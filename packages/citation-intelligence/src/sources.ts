import type { CitationSourceCategory, SourceCategoryContext } from "./types";

export function categorizeSource(url: string, context: SourceCategoryContext): CitationSourceCategory {
  const hostname = new URL(url).hostname.toLocaleLowerCase();
  if (isSameSite(hostname, context.customerRegistrableDomain)) return "owned_customer";
  if (context.competitorRegistrableDomains.some((domain) => isSameSite(hostname, domain))) {
    return "owned_competitor";
  }

  for (const [domain, category] of Object.entries(context.knownDomains ?? {})) {
    if (isSameSite(hostname, domain)) return category;
  }
  return "unknown";
}

function isSameSite(hostname: string, registrableDomain: string): boolean {
  const normalizedDomain = registrableDomain.toLocaleLowerCase().replace(/^\.+|\.+$/g, "");
  return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
}

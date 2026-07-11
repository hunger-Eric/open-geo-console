import type { EntityResolution, EntityResolutionInput } from "./types";

export function resolveEntity(input: EntityResolutionInput): EntityResolution {
  const matchingNames = input.candidates.filter(
    (candidate) => candidate.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase()
  );
  if (matchingNames.length === 0) return { status: "unresolved", candidateEntityIds: [] };

  if (input.sourceUrl) {
    const hostname = new URL(input.sourceUrl).hostname.toLocaleLowerCase();
    const domainMatches = matchingNames.filter(
      ({ registrableDomain }) => registrableDomain && isSameSite(hostname, registrableDomain)
    );
    if (domainMatches.length === 1) {
      return { status: "resolved", entityId: domainMatches[0]!.entityId, basis: "registrable_domain" };
    }
  }

  if (input.contextText) {
    const normalizedContext = input.contextText.toLocaleLowerCase();
    const contextMatches = matchingNames.filter(({ contextTerms = [] }) =>
      contextTerms.some((term) => containsContextTerm(normalizedContext, term))
    );
    if (contextMatches.length === 1) {
      return { status: "resolved", entityId: contextMatches[0]!.entityId, basis: "context" };
    }
  }

  if (matchingNames.length === 1) {
    return { status: "resolved", entityId: matchingNames[0]!.entityId, basis: "unique_name" };
  }
  return { status: "ambiguous", candidateEntityIds: matchingNames.map(({ entityId }) => entityId).sort() };
}

function containsContextTerm(normalizedContext: string, term: string): boolean {
  const normalizedTerm = term.trim().toLocaleLowerCase();
  if (!normalizedTerm) return false;
  if (!/[a-z0-9]/i.test(normalizedTerm)) return normalizedContext.includes(normalizedTerm);
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(normalizedContext);
}

function isSameSite(hostname: string, registrableDomain: string): boolean {
  const normalizedDomain = registrableDomain.toLocaleLowerCase().replace(/^\.+|\.+$/g, "");
  return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
}

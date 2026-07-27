import { assertNoProhibitedClaims } from "@open-geo-console/public-search-observer";

export interface EvidenceBoundV2Claim {
  text: string;
  evidenceIds: readonly string[];
  websiteFindingIds: readonly string[];
}

export function verifyRecommendationForensicV2Claims(
  claims: readonly EvidenceBoundV2Claim[],
  evidenceIds: ReadonlySet<string>,
  websiteFindingIds: ReadonlySet<string>
): void {
  for (const [index, claim] of claims.entries()) {
    if (!claim.text.trim()) throw new TypeError(`claims[${index}].text must be non-empty.`);
    assertNoProhibitedClaims(claim.text);
    const refs = [...claim.evidenceIds, ...claim.websiteFindingIds];
    if (refs.length === 0) throw new TypeError(`claims[${index}] requires structured evidence.`);
    if (new Set(refs).size !== refs.length) throw new TypeError(`claims[${index}] contains duplicate evidence references.`);
    if (claim.evidenceIds.some((id) => !evidenceIds.has(id)) || claim.websiteFindingIds.some((id) => !websiteFindingIds.has(id))) {
      throw new TypeError(`claims[${index}] references unknown evidence.`);
    }
  }
}

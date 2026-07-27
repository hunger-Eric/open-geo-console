import type { PublicSourceOpportunityHypothesis } from "./types";

const PROHIBITED = [
  /(?:cause|caused|guarantee|ensure).{0,48}(?:AI|model|engine).{0,48}(?:rank|recommend)/iu,
  /(?:AI|model|engine).{0,48}(?:rank|recommend).{0,48}(?:because|due to)/iu,
  /(?:导致|保证|确保|必然).{0,48}(?:AI|模型|引擎).{0,48}(?:排名|推荐)/u,
  /(?:AI|模型|引擎).{0,48}(?:排名|推荐).{0,48}(?:因为|由于)/u,
  /(?:使得|促使).{0,48}(?:AI|模型|引擎).{0,48}(?:排名|推荐)/u
];

export function createPublicSourceOpportunityHypothesis(
  value: PublicSourceOpportunityHypothesis
): PublicSourceOpportunityHypothesis {
  if (!value.id.trim() || !value.title.trim() || !value.rationale.trim() || !value.suggestedAction.trim()) {
    throw new Error("Public-source opportunities require non-empty identifiers and copy.");
  }
  const evidenceIds = [...new Set(value.evidenceIds.map((id) => id.trim()).filter(Boolean))];
  if (evidenceIds.length === 0 || evidenceIds.length !== value.evidenceIds.length) {
    throw new Error("Public-source opportunities require unique evidence IDs.");
  }
  for (const text of [value.title, value.rationale, value.suggestedAction]) {
    if (containsProhibitedCausalClaim(text)) {
      throw new Error("Public-source opportunities must not claim causal ranking or recommendation outcomes.");
    }
  }
  return { ...value, evidenceIds };
}

function containsProhibitedCausalClaim(text: string): boolean {
  return text.split(/[。！？.!?;；\n]+/u).some((sentence) => {
    if (!PROHIBITED.some((pattern) => pattern.test(sentence))) return false;
    const denial = sentence.search(/(?:不能|不可|不应|无法|没有证据|并不|不代表|cannot|must not|does not|no evidence)/iu);
    const subject = sentence.search(/(?:AI|模型|引擎|model|engine)/iu);
    return denial < 0 || subject < 0 || denial > subject;
  });
}

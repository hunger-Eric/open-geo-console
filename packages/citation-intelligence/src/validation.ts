import type { EvidenceAssessment, OpportunityHypothesis, RecommendationSignal } from "./types";

const prohibitedClaimPatterns = [
  /\bcaus(?:e|ed|es|ing)\b.{0,48}\b(?:model|engine|ai)\b.{0,48}\b(?:rank|recommend|place)/i,
  /\bguarantee(?:d|s)?\b.{0,64}\b(?:rank|first|place|placement|recommend)/i,
  /\bensure(?:d|s)?\b.{0,64}\b(?:rank|first|place|placement|recommend)/i,
  /\bwill\s+(?:rank|place|guarantee|ensure)\b/i,
  /\b(?:model|engine|ai)\b.{0,64}\b(?:rank(?:ed|s|ing)?|recommend(?:ed|s|ing)?|plac(?:e|ed|es|ing))\b.{0,64}\b(?:because|due to|as a result of)\b/i,
  /\b(?:source|citation|coverage|article|content)\b.{0,64}\b(?:made|make|led|leads|driv(?:e|es|en)|responsible for)\b.{0,64}\b(?:model|engine|ai)\b.{0,64}\b(?:rank|recommend|place)/i,
  /(?:模型|引擎|AI|人工智能).{0,48}(?:排名|排在|推荐|收录|展示).{0,48}(?:因为|由于|归因于)/iu,
  /(?:来源|引用|报道|文章|内容).{0,48}(?:导致|促使|使得|让).{0,48}(?:模型|引擎|AI|人工智能).{0,48}(?:排名|排在|推荐|收录|展示)/iu,
  /(?:保证|确保|必然|一定会).{0,48}(?:模型|引擎|AI|人工智能)?.{0,48}(?:排名|第一|推荐|收录|展示)/iu
];

export function validateOpportunityHypothesis(value: OpportunityHypothesis): OpportunityHypothesis {
  for (const [field, text] of Object.entries({
    title: value.title,
    rationale: value.rationale,
    sourcePattern: value.sourcePattern,
    suggestedAction: value.suggestedAction
  })) {
    if (!text.trim()) throw new Error(`${field} must not be empty`);
    if (prohibitedClaimPatterns.some((pattern) => pattern.test(text))) {
      throw new Error(`${field} contains prohibited causal, ranking, or placement language`);
    }
  }
  if (!value.id.trim()) throw new Error("id must not be empty");
  const evidenceCellIds = [...new Set(value.evidenceCellIds.map((id) => id.trim()).filter(Boolean))];
  if (evidenceCellIds.length === 0) throw new Error("evidenceCellIds must name at least one evidence cell");
  if (evidenceCellIds.length !== value.evidenceCellIds.length) {
    throw new Error("evidenceCellIds must be non-empty and unique");
  }
  return value;
}

export function validateEvidenceAssessment(value: EvidenceAssessment): EvidenceAssessment {
  if (!value.evidenceId.trim() || !value.cellId.trim()) {
    throw new Error("evidenceId and cellId must not be empty");
  }
  if (value.sourceUrl) assertAbsoluteHttpUrl(value.sourceUrl);
  if (value.verifiedExcerpt !== undefined && (!value.verifiedExcerpt.trim() || value.verifiedExcerpt.length > 1_000)) {
    throw new Error("verifiedExcerpt must contain 1 to 1000 characters");
  }
  if (value.preciseMapping && !value.directSupport) {
    throw new Error("preciseMapping requires directSupport");
  }
  if (
    value.directSupport &&
    (!value.providerReturned || value.retrievalState !== "available" || !value.verifiedExcerpt || !value.relevantEntityEvidence)
  ) {
    throw new Error("directSupport requires returned, available, verified, entity-relevant evidence");
  }
  if (
    value.providerReturned &&
    value.retrievalState === "available" &&
    value.verifiedExcerpt &&
    value.relevantEntityEvidence &&
    !value.sourceUrl
  ) {
    throw new Error("available provider-returned source evidence requires sourceUrl");
  }
  if (value.repeatedPattern) {
    validateRepeatedPattern(value.repeatedPattern);
  }
  return value;
}

function validateRepeatedPattern(pattern: NonNullable<EvidenceAssessment["repeatedPattern"]>): void {
  if (!new Set(["entity", "source", "source_category", "evidence_type"]).has(pattern.kind)) {
    throw new Error("repeated pattern kind is unsupported");
  }
  const value = pattern.value.trim();
  if (!value) throw new Error("repeated pattern value must not be empty");
  if (pattern.occurrences.length < 2) throw new Error("a repeated pattern requires at least two distinct cells");
  const cellIds = pattern.occurrences.map(({ cellId }) => cellId.trim());
  if (cellIds.some((id) => !id) || new Set(cellIds).size !== cellIds.length) {
    throw new Error("a repeated pattern requires distinct non-empty cell IDs");
  }
  for (const occurrence of pattern.occurrences) {
    if (occurrence.recommendationOutcome !== "recommendations_present") {
      throw new Error("repeated pattern occurrences require a recommendation outcome");
    }
    if (!occurrence.supportingText.trim().toLocaleLowerCase().includes(value.toLocaleLowerCase())) {
      throw new Error("each occurrence must contain supporting text for the repeated pattern");
    }
  }
}

export function validateRecommendationSignal(value: RecommendationSignal): RecommendationSignal {
  if (!value.entityId.trim() || !value.entityName.trim() || !value.supportingText.trim()) {
    throw new Error("recommendation identity and supporting text must not be empty");
  }
  if (!value.supportingText.toLocaleLowerCase().includes(value.entityName.toLocaleLowerCase())) {
    throw new Error("recommendation supporting text must name the recommended entity");
  }
  return value;
}

function assertAbsoluteHttpUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("sourceUrl must be an absolute HTTP(S) URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) {
    throw new Error("sourceUrl must be an absolute HTTP(S) URL");
  }
}

import { createHash } from "node:crypto";
import type {
  ProviderClaim,
  ProviderClaimDirectness,
  ProviderEvidenceGradeV2,
  ProviderRole,
  ProviderQualificationPolicy
} from "./provider-discovery-types";
import type { ProviderEvidencePassage } from "./provider-passages";

export interface ProviderClaimCandidate {
  subjectName: string;
  genericRole: ProviderRole;
  policyRole: string;
  capability: string;
  operatingMode: string;
  serviceScope: string[];
  routeScope: string[];
  exactExcerpt: string;
  contradictionGroupId?: string;
}

export interface ProviderClaimValidationContext {
  passage: ProviderEvidencePassage;
  policy: ProviderQualificationPolicy;
  subjectEntityId: string;
  canonicalSubjectName: string;
  registrableDomain: string;
  sourceAuthority: string;
  sourceEligibility: boolean;
}

export interface RejectedProviderClaim {
  subjectName: string;
  subjectEntityId: string;
  capability: string;
  reason: "excerpt_not_bound" | "entity_not_bound" | "unsupported_capability" | "unsupported_operating_mode" | "insufficient_relevance" | "ineligible_source";
  passageId: string;
  sourceEvidenceId: string;
}

export type ProviderClaimValidation =
  | { status: "accepted"; accepted: ProviderClaim }
  | { status: "rejected"; rejected: RejectedProviderClaim };

export function validateProviderClaimCandidate(candidate: ProviderClaimCandidate, context: ProviderClaimValidationContext): ProviderClaimValidation {
  const base = {
    subjectName: candidate.subjectName,
    subjectEntityId: context.subjectEntityId,
    capability: candidate.capability,
    passageId: context.passage.passageId,
    sourceEvidenceId: context.passage.sourceEvidenceId
  };
  const exactExcerpt = candidate.exactExcerpt.normalize("NFKC").trim().replace(/\s+/g, " ");
  const passageText = context.passage.exactExcerpt.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!exactExcerpt || !passageText.includes(exactExcerpt)) return rejected(base, "excerpt_not_bound");
  if (!sameEntity(candidate.subjectName, context.canonicalSubjectName, context.passage.matchedEntityTerms)) return rejected(base, "entity_not_bound");
  const dimension = context.policy.capabilityDimensions.find(({ id }) => id === candidate.capability);
  if (!dimension) return rejected(base, "unsupported_capability");
  if (!dimension.states.includes(candidate.operatingMode)) return rejected(base, "unsupported_operating_mode");
  if (context.passage.relevanceScore < 45) return rejected(base, "insufficient_relevance");

  const directness: ProviderClaimDirectness = context.passage.relevanceScore >= 70 && context.passage.matchedControlTerms.length > 0 && context.passage.matchedCapabilityTerms.length > 0
    ? "direct"
    : "lead_only";
  const grade = evidenceGrade(context, directness);
  if (grade === "D") return rejected(base, "ineligible_source");
  const claimIdentity = JSON.stringify({
    entity: context.subjectEntityId,
    capability: candidate.capability,
    operatingMode: candidate.operatingMode,
    excerpt: exactExcerpt,
    sourceEvidenceId: context.passage.sourceEvidenceId
  });
  return {
    status: "accepted",
    accepted: {
      claimId: `provider-claim:${sha(claimIdentity)}`,
      subjectName: context.canonicalSubjectName,
      subjectEntityId: context.subjectEntityId,
      genericRole: candidate.genericRole,
      policyRole: candidate.policyRole,
      capability: candidate.capability,
      operatingMode: candidate.operatingMode,
      serviceScope: unique(candidate.serviceScope),
      routeScope: unique(candidate.routeScope),
      exactExcerpt,
      passageId: context.passage.passageId,
      sourceEvidenceId: context.passage.sourceEvidenceId,
      sourceAuthority: context.sourceAuthority,
      directness,
      relevanceScore: context.passage.relevanceScore,
      grade,
      sourceEligibility: { eligible: context.sourceEligibility },
      registrableDomain: context.registrableDomain.toLocaleLowerCase(),
      ...(candidate.contradictionGroupId ? { contradictionGroupId: candidate.contradictionGroupId } : {})
    }
  };
}

function evidenceGrade(context: ProviderClaimValidationContext, directness: ProviderClaimDirectness): ProviderEvidenceGradeV2 {
  if (!context.sourceEligibility) return context.passage.relevanceScore >= 45 ? "C" : "D";
  if (directness !== "direct" || context.passage.relevanceScore < 70) return "C";
  return new Set(["company_owned", "institution", "regulator", "registry"]).has(context.sourceAuthority) ? "A" : "B";
}

function sameEntity(candidate: string, canonical: string, matched: readonly string[]): boolean {
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const expected = normalize(canonical);
  return normalize(candidate) === expected && matched.some((value) => normalize(value) === expected);
}

function rejected(base: Omit<RejectedProviderClaim, "reason">, reason: RejectedProviderClaim["reason"]): ProviderClaimValidation {
  return { status: "rejected", rejected: { ...base, reason } };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

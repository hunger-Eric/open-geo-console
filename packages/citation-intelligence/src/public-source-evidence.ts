import type { PublicSourceEvidenceGrade, PublicSourceRetrievalState } from "./types";

export interface PublicSourceEvidenceGradeInput {
  retrievalState: PublicSourceRetrievalState;
  verifiedExcerpt?: string;
  directFactSupport: boolean;
  preciseEntityMapping: boolean;
  entityAmbiguous: boolean;
  contradictory: boolean;
  metadataOnly: boolean;
  independentPattern: boolean;
}

export function assessPublicSourceEvidenceGrade(input: PublicSourceEvidenceGradeInput): PublicSourceEvidenceGrade {
  if (
    input.retrievalState !== "available" ||
    input.entityAmbiguous ||
    input.contradictory ||
    input.metadataOnly
  ) return "D";
  const excerptAvailable = Boolean(input.verifiedExcerpt?.trim());
  if (excerptAvailable && input.directFactSupport && input.preciseEntityMapping) return "A";
  if (excerptAvailable) return "B";
  if (input.independentPattern) return "C";
  return "D";
}

import { createHash } from "node:crypto";
import {
  createAnswerEngineSurfaceKey,
  parseAnswerSnapshotCell,
  parseAnswerEngineSurface,
  type AnswerEngineSurface,
  type AnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";

export interface CertificationRetrievalEvidence {
  url: string;
  retrievalState: "available" | "inaccessible";
  excerptHash: string | null;
  contentHash: string | null;
}

export interface RecommendationCertificationArtifact {
  version: 1;
  mode: "live" | "dry_fixture";
  installable: boolean;
  environment: "protected_staging";
  providerId: "openai" | "perplexity";
  siteUrl: string;
  question: string;
  surface: AnswerEngineSurface;
  observedAt: string;
  cell: AnswerSnapshotCell;
  retrievals: CertificationRetrievalEvidence[];
  operatorReviewRequired: readonly ["commercial_terms", "surface_label", "evidence_quality"];
  artifactHash: string;
}

export function finalizeCertificationArtifact(
  input: Omit<RecommendationCertificationArtifact, "artifactHash">
): RecommendationCertificationArtifact {
  const artifact = { ...input, surface: parseAnswerEngineSurface(input.surface), cell: parseAnswerSnapshotCell(input.cell) };
  validateArtifact(artifact);
  return { ...artifact, artifactHash: certificationArtifactHash(artifact) };
}

export function parseCertificationArtifact(value: unknown): RecommendationCertificationArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Certification artifact is invalid.");
  const raw = value as RecommendationCertificationArtifact;
  const { artifactHash, ...content } = raw;
  const parsed = finalizeCertificationArtifact(content);
  if (!/^[a-f0-9]{64}$/.test(artifactHash) || artifactHash !== parsed.artifactHash) {
    throw new Error("Certification artifact hash does not match its content.");
  }
  return parsed;
}

export function certificationArtifactHash(value: Omit<RecommendationCertificationArtifact, "artifactHash">): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function assertInstallableCertificationArtifacts(
  artifacts: RecommendationCertificationArtifact[]
): void {
  if (artifacts.length !== 2 || new Set(artifacts.map(({ providerId }) => providerId)).size !== 2) {
    throw new Error("Exactly two distinct provider certification artifacts are required.");
  }
  for (const artifact of artifacts) {
    if (artifact.mode !== "live" || !artifact.installable || artifact.surface.certificationState !== "candidate_uncertified" ||
        artifact.cell.status !== "succeeded" || artifact.cell.sources.length === 0 ||
        !artifact.retrievals.some(({ retrievalState }) => retrievalState === "available")) {
      throw new Error("Only source-bearing live protected-staging artifacts are installable.");
    }
  }
}

function validateArtifact(artifact: Omit<RecommendationCertificationArtifact, "artifactHash">): void {
  if (artifact.version !== 1 || artifact.environment !== "protected_staging" ||
      (artifact.mode !== "live" && artifact.mode !== "dry_fixture") ||
      !Number.isFinite(Date.parse(artifact.observedAt))) throw new Error("Certification artifact metadata is invalid.");
  if (artifact.providerId !== artifact.surface.providerId || artifact.surface.certificationState !== "candidate_uncertified" ||
      artifact.cell.surface.providerId !== artifact.providerId || artifact.cell.surface.certificationState !== "candidate_uncertified") {
    throw new Error("Certification artifact surface is not an uncertified candidate.");
  }
  if (createAnswerEngineSurfaceKey(artifact.surface) !== createAnswerEngineSurfaceKey(artifact.cell.surface)) {
    throw new Error("Certification artifact cell does not match its exact surface.");
  }
  if (artifact.mode === "dry_fixture" && artifact.installable) throw new Error("Dry fixtures are never installable.");
  if (artifact.mode === "live" && artifact.cell.status !== "succeeded") throw new Error("Live certification requires a successful cell.");
  if (artifact.operatorReviewRequired.join(",") !== "commercial_terms,surface_label,evidence_quality") {
    throw new Error("Certification artifact review gates are invalid.");
  }
  const sourceUrls = artifact.cell.status === "succeeded" ? new Set(artifact.cell.sources.map(({ url }) => url)) : new Set<string>();
  if (artifact.retrievals.some(({ url }) => !sourceUrls.has(url))) throw new Error("Retrieval evidence is not bound to a provider source.");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

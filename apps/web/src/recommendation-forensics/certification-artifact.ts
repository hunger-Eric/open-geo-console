import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  createAnswerEngineSurfaceKey,
  parseAnswerSnapshotCell,
  parseAnswerEngineSurface,
  type AnswerEngineSurface,
  type AnswerSnapshotCell
} from "@open-geo-console/answer-engine-observer";

export interface CertificationSigningConfig {
  secret: string;
  keyId: string;
  version: "v1";
}

export interface CertificationArtifactSignature {
  algorithm: "hmac-sha256";
  keyId: string;
  version: "v1";
  value: string;
}

export interface CertificationRetrievalEvidence {
  url: string;
  retrievalState: "available" | "inaccessible";
  verifiedText: string | null;
  excerptHash: string | null;
  contentHash: string | null;
  retrievedAt: string;
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
  signature: CertificationArtifactSignature | null;
}

type ArtifactContent = Omit<RecommendationCertificationArtifact, "artifactHash" | "signature">;

export function readCertificationSigningConfig(environment: NodeJS.ProcessEnv): CertificationSigningConfig {
  const secret = environment.OGC_RECOMMENDATION_CERTIFICATION_SIGNING_SECRET?.trim();
  const keyId = environment.OGC_RECOMMENDATION_CERTIFICATION_SIGNING_KEY_ID?.trim();
  const version = environment.OGC_RECOMMENDATION_CERTIFICATION_SIGNING_VERSION?.trim();
  const missing = [
    ["OGC_RECOMMENDATION_CERTIFICATION_SIGNING_SECRET", secret],
    ["OGC_RECOMMENDATION_CERTIFICATION_SIGNING_KEY_ID", keyId],
    ["OGC_RECOMMENDATION_CERTIFICATION_SIGNING_VERSION", version]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Missing certification signing variables: ${missing.join(", ")}.`);
  if (Buffer.byteLength(secret!, "utf8") < 32) throw new Error("OGC_RECOMMENDATION_CERTIFICATION_SIGNING_SECRET must contain at least 32 bytes.");
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(keyId!)) throw new Error("OGC_RECOMMENDATION_CERTIFICATION_SIGNING_KEY_ID is invalid.");
  if (version !== "v1") throw new Error("OGC_RECOMMENDATION_CERTIFICATION_SIGNING_VERSION must be v1.");
  return { secret: secret!, keyId: keyId!, version };
}

export function finalizeCertificationArtifact(
  input: ArtifactContent,
  signing?: CertificationSigningConfig
): RecommendationCertificationArtifact {
  const content = { ...input, surface: parseAnswerEngineSurface(input.surface), cell: parseAnswerSnapshotCell(input.cell) };
  validateArtifact(content);
  if (content.mode === "live" && content.installable && !signing) {
    throw new Error("Live certification artifacts require protected-staging signing configuration.");
  }
  const artifactHash = certificationArtifactHash(content);
  return { ...content, artifactHash, signature: signing ? signArtifactHash(artifactHash, signing) : null };
}

export function parseCertificationArtifact(
  value: unknown,
  signing?: CertificationSigningConfig
): RecommendationCertificationArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Certification artifact is invalid.");
  const raw = value as RecommendationCertificationArtifact;
  if (raw.mode === "live" && raw.installable) verifyArtifactSignature(raw.artifactHash, raw.signature, signing);
  const { artifactHash, signature, ...content } = raw;
  const parsed = finalizeCertificationArtifact(content, raw.mode === "live" && raw.installable ? signing : undefined);
  if (!isSha256(artifactHash) || artifactHash !== parsed.artifactHash) {
    throw new Error("Certification artifact hash does not match its content.");
  }
  if (raw.mode === "live" && raw.installable) {
    verifyArtifactSignature(parsed.artifactHash, signature, signing);
    if (signature?.value !== parsed.signature?.value) throw new Error("Certification artifact signature is invalid.");
  } else if (signature !== null) {
    throw new Error("Dry certification artifacts must not carry an installable signature.");
  }
  return parsed;
}

export function certificationArtifactHash(value: ArtifactContent): string {
  return sha256(stableJson(value));
}

export function assertInstallableCertificationArtifacts(artifacts: RecommendationCertificationArtifact[]): void {
  if (artifacts.length !== 2 || new Set(artifacts.map(({ providerId }) => providerId)).size !== 2) {
    throw new Error("Exactly two distinct provider certification artifacts are required.");
  }
  for (const artifact of artifacts) {
    if (artifact.mode !== "live" || !artifact.installable || !artifact.signature ||
        artifact.surface.certificationState !== "candidate_uncertified" || artifact.cell.status !== "succeeded" ||
        artifact.cell.sources.length === 0 || !artifact.retrievals.some(validAvailableRetrieval)) {
      throw new Error("Only signed, source-bearing live protected-staging artifacts are installable.");
    }
  }
}

function validateArtifact(artifact: ArtifactContent): void {
  if (artifact.version !== 1 || artifact.environment !== "protected_staging" ||
      (artifact.mode !== "live" && artifact.mode !== "dry_fixture") || !Number.isFinite(Date.parse(artifact.observedAt))) {
    throw new Error("Certification artifact metadata is invalid.");
  }
  if (artifact.providerId !== artifact.surface.providerId || artifact.surface.certificationState !== "candidate_uncertified" ||
      artifact.cell.surface.providerId !== artifact.providerId || artifact.cell.surface.certificationState !== "candidate_uncertified") {
    throw new Error("Certification artifact surface is not an uncertified candidate.");
  }
  if (createAnswerEngineSurfaceKey(artifact.surface) !== createAnswerEngineSurfaceKey(artifact.cell.surface)) {
    throw new Error("Certification artifact cell does not match its exact surface.");
  }
  if (artifact.observedAt !== artifact.cell.executedAt) throw new Error("Certification artifact observation time must equal its cell execution time.");
  if (artifact.mode === "dry_fixture" && artifact.installable) throw new Error("Dry fixtures are never installable.");
  if (artifact.mode === "live" && artifact.cell.status !== "succeeded") throw new Error("Live certification requires a successful cell.");
  if (artifact.operatorReviewRequired.join(",") !== "commercial_terms,surface_label,evidence_quality") throw new Error("Certification artifact review gates are invalid.");
  const sourceUrls = artifact.cell.status === "succeeded" ? new Set(artifact.cell.sources.map(({ url }) => url)) : new Set<string>();
  const retrievalUrls = new Set<string>();
  for (const retrieval of artifact.retrievals) {
    if (!sourceUrls.has(retrieval.url) || retrievalUrls.has(retrieval.url)) throw new Error("Retrieval evidence is not uniquely bound to a provider source.");
    retrievalUrls.add(retrieval.url);
    if (!Number.isFinite(Date.parse(retrieval.retrievedAt)) || Date.parse(retrieval.retrievedAt) < Date.parse(artifact.cell.executedAt)) {
      throw new Error("Retrieval evidence predates its answer observation.");
    }
    if (retrieval.retrievalState === "available") {
      if (!validAvailableRetrieval(retrieval)) throw new Error("Available retrieval evidence must contain verified bounded text and SHA-256 hashes.");
    } else if (retrieval.verifiedText !== null || retrieval.excerptHash !== null || retrieval.contentHash !== null) {
      throw new Error("Inaccessible retrieval evidence cannot carry verified content.");
    }
  }
}

function validAvailableRetrieval(retrieval: CertificationRetrievalEvidence): boolean {
  return retrieval.retrievalState === "available" && typeof retrieval.verifiedText === "string" &&
    retrieval.verifiedText.trim().length > 0 && retrieval.verifiedText.length <= 1_000 &&
    isSha256(retrieval.excerptHash) && retrieval.excerptHash === sha256(retrieval.verifiedText) && isSha256(retrieval.contentHash);
}

function signArtifactHash(artifactHash: string, signing: CertificationSigningConfig): CertificationArtifactSignature {
  return { algorithm: "hmac-sha256", keyId: signing.keyId, version: signing.version, value: signatureValue(artifactHash, signing) };
}

function verifyArtifactSignature(artifactHash: unknown, signature: unknown, signing?: CertificationSigningConfig): void {
  if (!signing) throw new Error("Protected certification signing configuration is required.");
  if (!isSha256(artifactHash) || !signature || typeof signature !== "object") throw new Error("Certification artifact signature is invalid.");
  const raw = signature as Partial<CertificationArtifactSignature>;
  if (raw.algorithm !== "hmac-sha256" || raw.version !== signing.version || raw.keyId !== signing.keyId || !isSha256(raw.value)) {
    throw new Error("Certification artifact signature key or format is invalid.");
  }
  const expected = Buffer.from(signatureValue(artifactHash, signing), "hex");
  const actual = Buffer.from(raw.value, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Certification artifact signature is invalid.");
}

function signatureValue(artifactHash: string, signing: CertificationSigningConfig): string {
  return createHmac("sha256", signing.secret).update(`ogc-recommendation-certification\0${signing.version}\0${signing.keyId}\0${artifactHash}`).digest("hex");
}
function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

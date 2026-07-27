import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { CertificationAuthoritySnapshot } from "@open-geo-console/answer-engine-observer";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { installRecommendationAuthoritiesFromProtectedConfig } from "@/db/recommendation-authority";
import {
  assertInstallableCertificationArtifacts,
  parseCertificationArtifact,
  readCertificationSigningConfig,
  type RecommendationCertificationArtifact
} from "@/recommendation-forensics/certification-artifact";
import { prepareStagingCommand } from "./staging-guard";
import { assertPrivateCertificationArtifact, privateCertificationPath } from "@/recommendation-forensics/certification-path";

export function createCertificationAuthorityFromArtifacts(
  artifacts: RecommendationCertificationArtifact[]
): CertificationAuthoritySnapshot {
  assertInstallableCertificationArtifacts(artifacts);
  const ordered = [...artifacts].sort((left, right) => `${left.providerId}\0${left.artifactHash}`.localeCompare(`${right.providerId}\0${right.artifactHash}`));
  const certifiedTimes = ordered.map((artifact) => latestTimestamp([
    artifact.observedAt, ...artifact.retrievals.map(({ retrievedAt }) => retrievedAt)
  ]));
  const capturedAt = latestTimestamp(certifiedTimes);
  const authoritySeed = ordered.map((artifact, index) => [artifact.providerId, artifact.artifactHash, artifact.signature!.keyId, artifact.signature!.version, certifiedTimes[index]!].join("\0")).join("\0");
  return {
    authorityVersion: `recommendation-cert-${createHash("sha256").update(authoritySeed).digest("hex").slice(0, 20)}`,
    capturedAt,
    certifications: ordered.map((artifact, index) => ({
      surface: { ...artifact.surface, certificationState: "certified" as const },
      evidence: { certifiedAt: certifiedTimes[index]!, environment: "protected_staging" as const, evidenceReference: `sha256:${artifact.artifactHash}` }
    }))
  };
}

async function main() {
  const args = process.argv.slice(2);
  const artifactPaths = values(args, "artifact").map((artifactPath) => privateCertificationPath(artifactPath));
  const reviewedBy = value(args, "reviewed-by");
  for (const flag of ["terms-reviewed", "surface-reviewed", "evidence-reviewed"]) if (!args.includes(`--${flag}`)) throw new Error(`--${flag} is required.`);
  if (!reviewedBy?.trim() || reviewedBy.length > 100 || !/^[A-Za-z0-9@._ -]+$/.test(reviewedBy)) throw new Error("--reviewed-by is required and must be a safe operator identifier.");
  if (!process.env.OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON?.trim()) throw new Error("OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON is required at the protected config boundary.");
  const signing = readCertificationSigningConfig(process.env);
  const artifacts = await Promise.all(artifactPaths.map(async (artifactPath) => {
    await assertPrivateCertificationArtifact(artifactPath);
    return parseCertificationArtifact(JSON.parse(await readFile(artifactPath, "utf8")), signing);
  }));
  const authority = createCertificationAuthorityFromArtifacts(artifacts);
  await prepareStagingCommand({ environment: process.env, ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  process.env.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON = JSON.stringify(authority);
  await installRecommendationAuthoritiesFromProtectedConfig();
  console.log(JSON.stringify({ installed: true, authority, reviewedBy: reviewedBy.trim(), review: { commercialTerms: true, surfaceLabel: true, evidenceQuality: true } }));
}

function latestTimestamp(values: string[]): string { return [...values].sort((left, right) => Date.parse(right) - Date.parse(left))[0]!; }
function values(args: string[], name: string) { const result: string[] = []; for (let i = 0; i < args.length; i++) if (args[i] === `--${name}` && args[i + 1]) result.push(args[++i]!); if (result.length !== 2) throw new Error("Exactly two --artifact paths are required."); return result; }
function value(args: string[], name: string) { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; }

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : "Authority installation failed."); process.exitCode = 1; }).finally(closeDatabase);
}

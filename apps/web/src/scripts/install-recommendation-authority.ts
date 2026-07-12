import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus } from "@/db";
import { installRecommendationAuthoritiesFromProtectedConfig } from "@/db/recommendation-authority";
import { assertInstallableCertificationArtifacts, parseCertificationArtifact } from "@/recommendation-forensics/certification-artifact";
import { prepareStagingCommand } from "./staging-guard";
import { privateCertificationPath } from "./certify-recommendation-provider";

async function main() {
  const args = process.argv.slice(2);
  const artifactPaths = values(args, "artifact").map(privateCertificationPath);
  const reviewedBy = value(args, "reviewed-by");
  for (const flag of ["terms-reviewed", "surface-reviewed", "evidence-reviewed"]) if (!args.includes(`--${flag}`)) throw new Error(`--${flag} is required.`);
  if (!reviewedBy?.trim() || reviewedBy.length > 100 || !/^[A-Za-z0-9@._ -]+$/.test(reviewedBy)) throw new Error("--reviewed-by is required and must be a safe operator identifier.");
  if (!process.env.OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON?.trim()) throw new Error("OGC_SOURCE_CLASSIFICATION_AUTHORITY_JSON is required at the protected config boundary.");
  const artifacts = await Promise.all(artifactPaths.map(async (path) => parseCertificationArtifact(JSON.parse(await readFile(path, "utf8")))));
  assertInstallableCertificationArtifacts(artifacts);
  await prepareStagingCommand({ environment: process.env, ensureDatabase, getDatabaseStatus: getDatabaseEnvironmentStatus });
  const capturedAt = new Date().toISOString();
  const seed = artifacts.map(({ artifactHash }) => artifactHash).sort().join("\0");
  const authority = {
    authorityVersion: `recommendation-cert-${createHash("sha256").update(seed).digest("hex").slice(0, 20)}`,
    capturedAt,
    certifications: artifacts.map((artifact) => ({
      surface: { ...artifact.surface, certificationState: "certified" as const },
      evidence: { certifiedAt: capturedAt, environment: "protected_staging" as const, evidenceReference: `sha256:${artifact.artifactHash}` }
    }))
  };
  process.env.OGC_RECOMMENDATION_CERTIFICATION_AUTHORITY_JSON = JSON.stringify(authority);
  await installRecommendationAuthoritiesFromProtectedConfig();
  console.log(JSON.stringify({ installed: true, authority, reviewedBy: reviewedBy.trim(), review: { commercialTerms: true, surfaceLabel: true, evidenceQuality: true } }));
}

function values(args: string[], name: string) { const result: string[] = []; for (let i = 0; i < args.length; i++) if (args[i] === `--${name}` && args[i + 1]) result.push(args[++i]!); if (result.length !== 2) throw new Error("Exactly two --artifact paths are required."); return result; }
function value(args: string[], name: string) { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; }

main().catch((error) => { console.error(error instanceof Error ? error.message : "Authority installation failed."); process.exitCode = 1; }).finally(closeDatabase);

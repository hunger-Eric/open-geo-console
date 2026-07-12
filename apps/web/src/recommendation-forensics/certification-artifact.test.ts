import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAnswerResponseHash, createAnswerSnapshotCellId } from "@open-geo-console/answer-engine-observer";
import {
  assertInstallableCertificationArtifacts,
  certificationArtifactHash,
  finalizeCertificationArtifact,
  parseCertificationArtifact,
  readCertificationSigningConfig,
  type CertificationSigningConfig
} from "./certification-artifact";

const signing: CertificationSigningConfig = { secret: "s".repeat(32), keyId: "staging-cert-2026-01", version: "v1" };

describe("recommendation certification artifacts", () => {
  it("hash- and HMAC-binds live evidence", () => {
    const artifact = candidate("openai", true);
    expect(parseCertificationArtifact(structuredClone(artifact), signing)).toEqual(artifact);
    const tampered = structuredClone(artifact);
    tampered.question = "Which changed supplier is explicitly recommended?";
    tampered.artifactHash = certificationArtifactHash(stripEnvelope(tampered));
    expect(() => parseCertificationArtifact(tampered, signing)).toThrow("signature");
  });

  it("rejects a wrong key, current key id drift, and missing signing config", () => {
    const artifact = candidate("openai", true);
    expect(() => parseCertificationArtifact(artifact, { ...signing, secret: "x".repeat(32) })).toThrow("signature");
    expect(() => parseCertificationArtifact(artifact, { ...signing, keyId: "rotated-key" })).toThrow("key");
    expect(() => parseCertificationArtifact(artifact)).toThrow("signing configuration");
  });

  it("requires two distinct signed live source-bearing providers", () => {
    expect(() => assertInstallableCertificationArtifacts([candidate("openai", true), candidate("perplexity", true)])).not.toThrow();
    expect(() => assertInstallableCertificationArtifacts([candidate("openai", true), candidate("openai", true)])).toThrow("distinct");
    expect(() => assertInstallableCertificationArtifacts([candidate("openai", false), candidate("perplexity", true)])).toThrow("signed");
  });

  it("rejects empty, forged, or temporally invalid retrieval evidence", () => {
    const base = candidate("openai", true);
    for (const mutate of [
      (artifact: typeof base) => { artifact.retrievals[0]!.verifiedText = ""; },
      (artifact: typeof base) => { artifact.retrievals[0]!.excerptHash = "a".repeat(64); },
      (artifact: typeof base) => { artifact.retrievals[0]!.contentHash = "not-a-hash"; },
      (artifact: typeof base) => { artifact.retrievals[0]!.retrievedAt = "2029-12-31T23:59:59.000Z"; }
    ]) {
      const artifact = structuredClone(base);
      mutate(artifact);
      expect(() => finalizeCertificationArtifact(stripEnvelope(artifact), signing)).toThrow();
    }
  });

  it("requires an independent 32-byte signing secret, current key id, and version", () => {
    expect(readCertificationSigningConfig({
      OGC_RECOMMENDATION_CERTIFICATION_SIGNING_SECRET: "z".repeat(32),
      OGC_RECOMMENDATION_CERTIFICATION_SIGNING_KEY_ID: "staging-1",
      OGC_RECOMMENDATION_CERTIFICATION_SIGNING_VERSION: "v1"
    })).toMatchObject({ keyId: "staging-1", version: "v1" });
    expect(() => readCertificationSigningConfig({})).toThrow("Missing certification signing variables");
    expect(() => readCertificationSigningConfig({ OGC_RECOMMENDATION_CERTIFICATION_SIGNING_SECRET: "short", OGC_RECOMMENDATION_CERTIFICATION_SIGNING_KEY_ID: "staging-1", OGC_RECOMMENDATION_CERTIFICATION_SIGNING_VERSION: "v1" })).toThrow("32 bytes");
  });
});

function candidate(providerId: "openai" | "perplexity", live: boolean) {
  const surface = { providerId, productId: providerId === "openai" ? "responses-web-search" : "sonar-api", modelId: providerId === "openai" ? "gpt-pinned" : "sonar-pro", collectionSurface: "developer_api" as const, locale: "en", region: "global", certificationState: "candidate_uncertified" as const };
  const answerText = "Atlas is the recommended supplier.";
  const cell = {
    id: createAnswerSnapshotCellId({ runId: "cert-run", questionId: "cert-question", surface }), runId: "cert-run", questionId: "cert-question", surface,
    status: "succeeded" as const, answerText, responseHash: createAnswerResponseHash(answerText), recommendationOutcome: "recommendations_present" as const,
    sources: [{ url: "https://evidence.example/source", title: "Evidence", providerOrder: 0, providerMetadata: {} }],
    executedAt: "2030-01-01T00:00:00.000Z", executionDurationMs: 1
  };
  const verifiedText = "Verified public evidence.";
  return finalizeCertificationArtifact({
    version: 1, mode: live ? "live" : "dry_fixture", installable: live, environment: "protected_staging", providerId,
    siteUrl: "https://test.example", question: "Which supplier is suitable?", surface, observedAt: cell.executedAt, cell,
    retrievals: live ? [{ url: cell.sources[0]!.url, retrievalState: "available", verifiedText, excerptHash: sha256(verifiedText), contentHash: sha256("full content"), retrievedAt: "2030-01-01T00:00:01.000Z" }] : [],
    operatorReviewRequired: ["commercial_terms", "surface_label", "evidence_quality"]
  }, live ? signing : undefined);
}

function stripEnvelope(artifact: ReturnType<typeof candidate>) {
  const content = structuredClone(artifact);
  Reflect.deleteProperty(content, "artifactHash");
  Reflect.deleteProperty(content, "signature");
  return content;
}
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }

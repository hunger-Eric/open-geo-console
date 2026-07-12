import { describe, expect, it } from "vitest";
import { createAnswerResponseHash, createAnswerSnapshotCellId } from "@open-geo-console/answer-engine-observer";
import {
  assertInstallableCertificationArtifacts,
  finalizeCertificationArtifact,
  parseCertificationArtifact
} from "./certification-artifact";

describe("recommendation certification artifacts", () => {
  it("hash-binds live evidence and rejects tampering", () => {
    const artifact = candidate("openai", true);
    expect(parseCertificationArtifact(structuredClone(artifact))).toEqual(artifact);
    const tampered = structuredClone(artifact);
    tampered.question = "changed";
    expect(() => parseCertificationArtifact(tampered)).toThrow("hash");
  });

  it("requires two distinct live source-bearing providers", () => {
    expect(() => assertInstallableCertificationArtifacts([candidate("openai", true), candidate("perplexity", true)])).not.toThrow();
    expect(() => assertInstallableCertificationArtifacts([candidate("openai", true), candidate("openai", true)])).toThrow("distinct");
    expect(() => assertInstallableCertificationArtifacts([candidate("openai", false), candidate("perplexity", true)])).toThrow("live");
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
  return finalizeCertificationArtifact({
    version: 1, mode: live ? "live" : "dry_fixture", installable: live, environment: "protected_staging", providerId,
    siteUrl: "https://test.example", question: "Which supplier is suitable?", surface, observedAt: cell.executedAt, cell,
    retrievals: [{ url: cell.sources[0]!.url, retrievalState: "available", excerptHash: "a".repeat(64), contentHash: "b".repeat(64) }],
    operatorReviewRequired: ["commercial_terms", "surface_label", "evidence_quality"]
  });
}

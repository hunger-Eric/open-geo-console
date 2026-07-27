import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createAnswerResponseHash, createAnswerSnapshotCellId } from "@open-geo-console/answer-engine-observer";
import { finalizeCertificationArtifact, type CertificationSigningConfig } from "@/recommendation-forensics/certification-artifact";
import { createCertificationAuthorityFromArtifacts } from "./install-recommendation-authority";

const signing: CertificationSigningConfig = { secret: "i".repeat(32), keyId: "staging-current", version: "v1" };

describe("recommendation certification authority installation", () => {
  it("derives an identical immutable authority regardless of input order or wall clock", () => {
    const openai = artifact("openai", "2030-01-01T00:00:00.000Z");
    const perplexity = artifact("perplexity", "2030-01-01T00:00:02.000Z");
    const first = createCertificationAuthorityFromArtifacts([openai, perplexity]);
    const second = createCertificationAuthorityFromArtifacts([perplexity, openai]);
    expect(second).toEqual(first);
    expect(first.capturedAt).toBe("2030-01-01T00:00:03.000Z");
    expect(first.authorityVersion).toMatch(/^recommendation-cert-[a-f0-9]{20}$/);
  });
});

function artifact(providerId: "openai" | "perplexity", observedAt: string) {
  const surface = { providerId, productId: providerId === "openai" ? "responses-web-search" : "sonar-api", modelId: providerId === "openai" ? "gpt-pinned" : "sonar-pro", collectionSurface: "developer_api" as const, locale: "en", region: "global", certificationState: "candidate_uncertified" as const };
  const answerText = "Atlas is the recommended supplier.";
  const cell = { id: createAnswerSnapshotCellId({ runId: `run-${providerId}`, questionId: "question", surface }), runId: `run-${providerId}`, questionId: "question", surface, status: "succeeded" as const, answerText, responseHash: createAnswerResponseHash(answerText), recommendationOutcome: "recommendations_present" as const, sources: [{ url: `https://${providerId}.example/source`, title: "Evidence", providerOrder: 0, providerMetadata: {} }], executedAt: observedAt, executionDurationMs: 1 };
  const verifiedText = "Verified evidence.";
  const retrievedAt = new Date(Date.parse(observedAt) + 1_000).toISOString();
  return finalizeCertificationArtifact({ version: 1, mode: "live", installable: true, environment: "protected_staging", providerId, siteUrl: "https://test.example", question: "Which supplier is suitable?", surface, observedAt, cell, retrievals: [{ url: cell.sources[0]!.url, retrievalState: "available", verifiedText, excerptHash: sha256(verifiedText), contentHash: sha256("full"), retrievedAt }], operatorReviewRequired: ["commercial_terms", "surface_label", "evidence_quality"] }, signing);
}
function sha256(value: string) { return createHash("sha256").update(value).digest("hex"); }

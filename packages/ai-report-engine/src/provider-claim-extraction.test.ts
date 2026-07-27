import { describe, expect, it, vi } from "vitest";
import { LOGISTICS_SELF_OPERATED_POLICY, PROVIDER_PASSAGE_SELECTOR_VERSION, type ProviderEvidencePassage } from "@open-geo-console/citation-intelligence";
import { AiClientError, type JsonCompletionClient, type JsonCompletionResult } from "./client";
import { extractProviderClaimCandidates } from "./provider-claim-extraction";

describe("provider claim extraction", () => {
  it("returns only claims bound to an exact supplied passage and policy state", async () => {
    const result = await extractProviderClaimCandidates(fixtureClient([{ claims: [claim()] }]), extractionInput(), { delay: async () => undefined });
    expect(result.candidates).toEqual([claim()]);
    expect(result.contractVersion).toBe("provider-claim-extraction-v1");
  });

  it("rejects a claim whose excerpt is not supplied", async () => {
    const client = fixtureClient([{ claims: [{ ...claim(), exactExcerpt: "Invented owned fleet statement" }] }]);
    await expect(extractProviderClaimCandidates(client, extractionInput(), { maxAttempts: 1 })).rejects.toThrow(/exact excerpt/i);
  });

  it("cannot upgrade a dedicated charter passage into owned capacity", async () => {
    const input = extractionInput("Example Logistics operates dedicated charter capacity for the route.");
    const value = { claims: [{ ...claim(), capability: "air_capacity", operatingMode: "owned", serviceScope: [], routeScope: [], exactExcerpt: input.passages[0]!.exactExcerpt }] };
    await expect(extractProviderClaimCandidates(fixtureClient([value]), input, { maxAttempts: 1 })).rejects.toThrow(/operatingMode is not stated/i);
  });

  it("retries malformed JSON at most three total calls", async () => {
    const completeJson = vi.fn()
      .mockRejectedValueOnce(new AiClientError("The model returned invalid JSON."))
      .mockRejectedValueOnce(new AiClientError("The model returned invalid JSON."))
      .mockRejectedValueOnce(new AiClientError("The model returned invalid JSON."));
    const client: JsonCompletionClient = { configuredModel: "fixture", completeJson };
    await expect(extractProviderClaimCandidates(client, extractionInput(), { maxAttempts: 10, delay: async () => undefined })).rejects.toThrow(/invalid JSON/i);
    expect(completeJson).toHaveBeenCalledTimes(3);
  });

  it("does not retry authentication failures", async () => {
    const completeJson = vi.fn().mockRejectedValue(new AiClientError("unauthorized", { status: 401 }));
    await expect(extractProviderClaimCandidates({ configuredModel: "fixture", completeJson }, extractionInput())).rejects.toThrow(/unauthorized/i);
    expect(completeJson).toHaveBeenCalledTimes(1);
  });
});

function fixtureClient(values: unknown[]): JsonCompletionClient {
  let call = 0;
  return { configuredModel: "fixture-model", completeJson: vi.fn(async (): Promise<JsonCompletionResult> => { const value = values[Math.min(call++, values.length - 1)]; return { value, modelId: "fixture-model", rawContent: JSON.stringify(value) }; }) };
}
function extractionInput(exactExcerpt = "Example Logistics provides self operated freight with an owned fleet on the Shanghai Chengdu route.") {
  const passage: ProviderEvidencePassage = { passageId: "passage-1", sourceEvidenceId: "source-1", passageOrder: 0, exactExcerpt, excerptHash: "a".repeat(64), relevanceScore: 100, matchedEntityTerms: ["Example Logistics"], matchedServiceTerms: ["freight"], matchedControlTerms: ["self operated", "owned"], matchedCapabilityTerms: ["fleet"], selectorVersion: PROVIDER_PASSAGE_SELECTOR_VERSION };
  return { locale: "en", question: "Which providers offer self-operated logistics?", policy: LOGISTICS_SELF_OPERATED_POLICY, candidate: { entityId: "provider-example", canonicalName: "Example Logistics" }, source: { sourceEvidenceId: "source-1", canonicalUrl: "https://example.com/logistics", title: "Logistics", registrableDomain: "example.com" }, passages: [passage] };
}
function claim() { return { subjectName: "Example Logistics", genericRole: "service_provider" as const, policyRole: "carrier", capability: "linehaul_fleet", operatingMode: "self_operated", serviceScope: ["freight"], routeScope: ["Shanghai Chengdu"], exactExcerpt: "Example Logistics provides self operated freight with an owned fleet on the Shanghai Chengdu route." }; }

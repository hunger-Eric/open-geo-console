import { describe, expect, it, vi } from "vitest";
import {
  buildPaidV3CompactReviewUserText,
  buildPaidV3CompactTransportInput,
  buildPaidV3SourceDictionary,
  assertNoBodyDuplicationAcrossCatalogs,
  evaluatePaidV3CompactTokenBudget,
  estimatePaidV3ConservativeTokens,
  PAID_V3_WEBSITE_SYNTHESIS_MAX_INPUT_TOKENS,
  PaidV3CompactTokenBudgetError
} from "./paid-v3-compact-review-input";
import { buildPaidV3AnswerPacketFromGenerativeCard } from "./paid-v3-answer-packet";
import {
  createReportSemanticReviewInput,
  hashReportSemanticReviewValue,
  reportSemanticTextHash
} from "@open-geo-console/ai-report-engine";

const hash = "a".repeat(64);
const startedAt = "2026-07-31T00:00:00.000Z";
const completedAt = "2026-07-31T00:01:00.000Z";

function packetFor(questionId: string, sourceId: string) {
  return buildPaidV3AnswerPacketFromGenerativeCard({
    card: {
      answerMode: "generative_search_v1",
      questionId,
      exactQuestion: `Question for ${questionId}`,
      answerText: `Answer body for ${questionId} with enough detail.`,
      status: "answered",
      sources: [{
        sourceId,
        title: `Title ${sourceId}`,
        canonicalUrl: `https://${sourceId}.example/`,
        registrableDomain: `${sourceId}.example`,
        citedText: `Cited ${sourceId}`,
        providerResultOrder: 0,
        retrievalStatus: "search_source_only",
        ownershipCategory: "company_owned"
      }],
      diagnosis: {
        selectionSummary: "ok",
        targetGap: "gap",
        observableFactors: [
          { kind: "problem_match", observation: "o1", evidenceRefs: [sourceId] },
          { kind: "factual_specificity", observation: "o2", evidenceRefs: [sourceId] },
          { kind: "entity_clarity", observation: "o3", evidenceRefs: [sourceId] }
        ],
        recommendedActions: [
          { action: "a1", evidenceRefs: [sourceId] },
          { action: "a2", evidenceRefs: [sourceId] },
          { action: "a3", evidenceRefs: [sourceId] }
        ],
        detailedEvidenceRefs: [sourceId]
      },
      provenance: {
        answerHash: hash,
        sourceHash: hash,
        searchedAt: startedAt,
        completedAt,
        providerResponseId: "r1"
      },
      refusal: null
    } as never,
    authorityHash: hash,
    status: "completed",
    attemptCount: 1,
    startedAt,
    completedAt
  });
}

function slimCanonical(sourceIds: string[]) {
  const sources = sourceIds.map((sourceId, index) => {
    const originalText = JSON.stringify({ role: "source", sourceId });
    return {
      sourceId,
      questionId: `question-${(index % 3) + 1}`,
      canonicalUrl: `https://${sourceId}.example/`,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText),
      eligible: true
    };
  });
  const evidence = sources.map((source) => {
    const originalText = JSON.stringify({ role: "evidence", sourceId: source.sourceId });
    return {
      evidenceId: source.sourceId,
      questionId: source.questionId,
      sourceId: source.sourceId,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText),
      eligible: true
    };
  });
  const observationResults = sources.map((source, index) => {
    const originalText = JSON.stringify({ role: "observation", sourceId: source.sourceId });
    return {
      observationId: `obs-${index + 1}`,
      resultId: source.sourceId,
      questionId: source.questionId,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText)
    };
  });
  const entities = sources.map((source, index) => {
    const originalText = JSON.stringify({ role: "entity", sourceId: source.sourceId });
    return {
      entityId: `entity-${index + 1}`,
      questionId: source.questionId,
      kind: "competitor_candidate" as const,
      originalText,
      originalTextHash: reportSemanticTextHash(originalText)
    };
  });
  const questions = [1, 2, 3].map((n) => ({
    questionId: `question-${n}`,
    originalText: `Question text ${n}`,
    originalTextHash: reportSemanticTextHash(`Question text ${n}`)
  }));
  const fields = questions.map((question, index) => ({
    path: `answerCards[${index}].answerText`,
    originalText: `Answer text ${index + 1}`,
    originalTextHash: reportSemanticTextHash(`Answer text ${index + 1}`),
    mutability: "mutable" as const,
    questionId: question.questionId,
    allowedEvidenceIds: [] as string[],
    allowedSourceIds: [] as string[]
  }));
  return createReportSemanticReviewInput({
    version: "report-semantic-review-v1",
    lifecycle: "paid_v3",
    evidencePolicy: "report_global_v1",
    locale: "zh-CN",
    target: { siteKey: "example.com", targetUrl: "https://example.com/", aliases: ["Example"] },
    expectedModel: { providerId: "xiaomi-mimo", modelId: "mimo-v2.5-pro" },
    questions,
    sources,
    evidence,
    observationResults,
    entities,
    answerSubjects: questions.map((question, index) => ({
      questionId: question.questionId,
      fieldPath: `answerCards[${index}].answerText`
    })),
    sourceSelectionCatalog: sourceIds.slice(0, 3).map((sourceId, index) => ({
      annotationId: `ann-${index + 1}`,
      itemId: `contribution:profile:${sourceId}`,
      kind: "contribution" as const,
      questionId: `question-${index + 1}`,
      sourceId,
      profileId: "profile-1",
      actionId: null,
      allowedEvidenceIds: [sourceId]
    })),
    authorityBindings: {
      rootMarker: "report-semantic-review-v1",
      artifactIdentityHash: hash,
      reviewedFreeAuthorityHash: hash,
      answerCheckpointHash: hash,
      commercialSnapshotsHash: hash,
      publicSourceHash: hash,
      providerDiscoveryHash: hash,
      technicalFoundationHash: hash,
      aiFoundationHash: hash,
      evidenceAssetsHash: hash
    },
    fields,
    nonProseProjectionHash: hash
  });
}

describe("Paid V3 compact review input", () => {
  it("stores each source body at most once in the dictionary", () => {
    const dictionary = buildPaidV3SourceDictionary([
      {
        sourceId: "source-a",
        canonicalUrl: "https://a.example/",
        title: "A",
        citedText: "shared body text for source A",
        auditExcerpt: null
      },
      {
        sourceId: "source-b",
        canonicalUrl: "https://b.example/",
        title: "B",
        citedText: "different body for B",
        auditExcerpt: null
      }
    ]);
    expect(Object.keys(dictionary)).toEqual(["source-a", "source-b"]);
    expect(dictionary["source-a"]!.boundedExcerpt).toContain("shared body");
    expect(dictionary["source-b"]!.boundedExcerpt).toContain("different body");
    const serialized = JSON.stringify(dictionary);
    expect(serialized.match(/shared body text for source A/g)?.length).toBe(1);
  });

  it("rejects dictionary entries that re-copy the same non-empty excerpt", () => {
    expect(() => buildPaidV3SourceDictionary([
      { sourceId: "source-a", canonicalUrl: "https://a.example/", title: "A", citedText: "same excerpt body" },
      { sourceId: "source-b", canonicalUrl: "https://b.example/", title: "B", citedText: "same excerpt body" }
    ])).toThrow(/same excerpt body/i);
  });

  it("fails closed when the same originalText is copied across four catalogs", () => {
    const body = "this duplicated catalog body is long enough to trip the guard";
    const originalTextHash = reportSemanticTextHash(body);
    expect(() => assertNoBodyDuplicationAcrossCatalogs({
      sources: [{ sourceId: "s1", questionId: "q1", canonicalUrl: "https://a.example/", originalText: body, originalTextHash, eligible: true }],
      evidence: [{ evidenceId: "s1", questionId: "q1", sourceId: "s1", originalText: body, originalTextHash, eligible: true }],
      observationResults: [{ observationId: "o1", resultId: "s1", questionId: "q1", originalText: body, originalTextHash }],
      entities: [{ entityId: "e1", questionId: "q1", kind: "competitor_candidate", originalText: body, originalTextHash }],
      fields: []
    } as never)).toThrow(/re-copies source body/i);
  });

  it("builds transport with distinct transportInputHash and canonicalInputHash", () => {
    const sourceIds = ["source-a", "source-b", "source-c"];
    const dictionary = buildPaidV3SourceDictionary(sourceIds.map((sourceId) => ({
      sourceId,
      canonicalUrl: `https://${sourceId}.example/`,
      title: sourceId,
      citedText: `body for ${sourceId}`
    })));
    const packets = [
      packetFor("question-1", "source-a"),
      packetFor("question-2", "source-b"),
      packetFor("question-3", "source-c")
    ];
    const canonical = slimCanonical(sourceIds);
    const transport = buildPaidV3CompactTransportInput({
      canonicalReviewInput: canonical,
      packets,
      sourceDictionary: dictionary
    });
    expect(transport.canonicalInputHash).toBe(canonical.inputHash);
    expect(transport.transportInputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(transport.transportInputHash).not.toBe(transport.canonicalInputHash);
    const userText = buildPaidV3CompactReviewUserText({ transport, canonicalReviewInput: canonical });
    const parsed = JSON.parse(userText) as { input: { inputHash: string; canonicalInputHash: string; transportInputHash: string } };
    expect(parsed.input.inputHash).toBe(canonical.inputHash);
    expect(parsed.input.canonicalInputHash).toBe(canonical.inputHash);
    expect(parsed.input.transportInputHash).toBe(transport.transportInputHash);
    // bodies appear once via dictionary, not in slim shells
    expect(userText.match(/body for source-a/g)?.length).toBe(1);
  });

  it("fails closed before provider when compact input exceeds locked budget", () => {
    const sourceIds = Array.from({ length: 20 }, (_, index) => `source-${index + 1}`);
    const fatExcerpt = "跨境物流服务核验段落".repeat(80);
    const dictionary = buildPaidV3SourceDictionary(sourceIds.map((sourceId) => ({
      sourceId,
      canonicalUrl: `https://${sourceId}.example/${"path/".repeat(20)}`,
      title: `${sourceId} ${"标题".repeat(20)}`,
      citedText: `${sourceId}-${fatExcerpt}`
    })));
    const packets = [1, 2, 3].map((n) => packetFor(`question-${n}`, sourceIds[n - 1]!));
    const canonical = slimCanonical(sourceIds);
    const transport = buildPaidV3CompactTransportInput({
      canonicalReviewInput: canonical,
      packets,
      sourceDictionary: dictionary
    });
    const userText = buildPaidV3CompactReviewUserText({ transport, canonicalReviewInput: canonical });
    const provider = vi.fn();
    try {
      evaluatePaidV3CompactTokenBudget({
        systemText: "system",
        userText: userText + "x".repeat(200_000),
        packets,
        sourceDictionary: dictionary,
        proseFieldsText: JSON.stringify(canonical.fields),
        canonicalInputHash: transport.canonicalInputHash,
        transportInputHash: transport.transportInputHash,
        maxInputTokens: 100
      });
      provider();
      throw new Error("expected budget error");
    } catch (error) {
      expect(error).toBeInstanceOf(PaidV3CompactTokenBudgetError);
      expect((error as PaidV3CompactTokenBudgetError).limitKind).toBe("max_input");
      expect((error as Error).message).toMatch(/input estimate .* exceeds the operation limit 100/i);
    }
    expect(provider).not.toHaveBeenCalled();
  });

  it("exposes fail-closed budget breakdown for persistence before any provider call", () => {
    const sourceIds = ["source-a", "source-b", "source-c"];
    const dictionary = buildPaidV3SourceDictionary(sourceIds.map((sourceId) => ({
      sourceId,
      canonicalUrl: `https://${sourceId}.example/`,
      title: sourceId,
      citedText: `body ${sourceId}`
    })));
    const packets = sourceIds.map((sourceId, index) => packetFor(`question-${index + 1}`, sourceId));
    const canonical = slimCanonical(sourceIds);
    const transport = buildPaidV3CompactTransportInput({
      canonicalReviewInput: canonical,
      packets,
      sourceDictionary: dictionary
    });
    const userText = buildPaidV3CompactReviewUserText({ transport, canonicalReviewInput: canonical });
    const onTransportMetrics = vi.fn();
    const provider = vi.fn();
    try {
      evaluatePaidV3CompactTokenBudget({
        systemText: "system",
        userText: userText + "x".repeat(50_000),
        packets,
        sourceDictionary: dictionary,
        proseFieldsText: JSON.stringify(canonical.fields),
        canonicalInputHash: transport.canonicalInputHash,
        transportInputHash: transport.transportInputHash,
        maxInputTokens: 50
      });
      provider();
    } catch (error) {
      expect(error).toBeInstanceOf(PaidV3CompactTokenBudgetError);
      // Production runPaidV3SemanticReview persists error.breakdown via onTransportMetrics before rethrow.
      onTransportMetrics((error as PaidV3CompactTokenBudgetError).breakdown);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(onTransportMetrics).toHaveBeenCalledWith(expect.objectContaining({
      compactInputTokens: expect.any(Number),
      totalEstimatedTokens: expect.any(Number),
      reservedOutputTokens: 16_384,
      safetyMarginTokens: 4_096
    }));
  });

  it("fails closed when system+input+output+margin exceeds the context window", () => {
    const sourceIds = ["source-a", "source-b", "source-c"];
    const dictionary = buildPaidV3SourceDictionary(sourceIds.map((sourceId) => ({
      sourceId,
      canonicalUrl: `https://${sourceId}.example/`,
      title: sourceId,
      citedText: `body ${sourceId}`
    })));
    const packets = sourceIds.map((sourceId, index) => packetFor(`question-${index + 1}`, sourceId));
    const canonical = slimCanonical(sourceIds);
    const transport = buildPaidV3CompactTransportInput({
      canonicalReviewInput: canonical,
      packets,
      sourceDictionary: dictionary
    });
    const userText = buildPaidV3CompactReviewUserText({ transport, canonicalReviewInput: canonical });
    const provider = vi.fn();
    try {
      evaluatePaidV3CompactTokenBudget({
        systemText: "system",
        userText,
        packets,
        sourceDictionary: dictionary,
        proseFieldsText: JSON.stringify(canonical.fields),
        canonicalInputHash: transport.canonicalInputHash,
        transportInputHash: transport.transportInputHash,
        reservedOutputTokens: 16_384,
        safetyMarginTokens: 4_096,
        contextWindowTokens: 20_000
      });
      provider();
      throw new Error("expected budget error");
    } catch (error) {
      expect(error).toBeInstanceOf(PaidV3CompactTokenBudgetError);
      expect((error as PaidV3CompactTokenBudgetError).limitKind).toBe("context_window");
      expect((error as Error).message).toMatch(/Token budget .* exceeds the context window 20000/i);
    }
    expect(provider).not.toHaveBeenCalled();
  });

  it("keeps a 3x20 unique-source compact fixture under the locked 131072 input budget", () => {
    const sourceIds = Array.from({ length: 60 }, (_, index) => `src-${index + 1}`);
    const dictionary = buildPaidV3SourceDictionary(sourceIds.map((sourceId) => ({
      sourceId,
      canonicalUrl: `https://example.com/${sourceId}`,
      title: `Title ${sourceId}`,
      citedText: `Excerpt for ${sourceId} with mixed English and 中文内容用于核验。`
    })));
    // three packets each referencing 20 sources
    const packets = [0, 1, 2].map((packetIndex) => {
      const ids = sourceIds.slice(packetIndex * 20, packetIndex * 20 + 20);
      const base = packetFor(`question-${packetIndex + 1}`, ids[0]!);
      return {
        ...base,
        sourceIds: ids,
        shortEvidenceRefs: ids.slice(0, 10),
        diagnosis: base.diagnosis
          ? {
              ...base.diagnosis,
              detailedEvidenceRefs: ids.slice(0, 10),
              observableFactors: base.diagnosis.observableFactors.map((factor) => ({
                ...factor,
                evidenceRefs: ids.slice(0, 3)
              })),
              recommendedActions: base.diagnosis.recommendedActions.map((action) => ({
                ...action,
                evidenceRefs: ids.slice(0, 3)
              }))
            }
          : null
      };
    });
    const canonical = slimCanonical(sourceIds);
    const transport = buildPaidV3CompactTransportInput({
      canonicalReviewInput: canonical,
      packets: packets as never,
      sourceDictionary: dictionary
    });
    const userText = buildPaidV3CompactReviewUserText({ transport, canonicalReviewInput: canonical });
    const breakdown = evaluatePaidV3CompactTokenBudget({
      systemText: "Paid V3 compact system prompt placeholder.",
      userText,
      packets: packets as never,
      sourceDictionary: dictionary,
      proseFieldsText: JSON.stringify(canonical.fields),
      canonicalInputHash: transport.canonicalInputHash,
      transportInputHash: transport.transportInputHash
    });
    expect(breakdown.compactInputTokens).toBeLessThan(PAID_V3_WEBSITE_SYNTHESIS_MAX_INPUT_TOKENS);
    // Fat 4x originalText pattern repeats each body four times; compact dictionary once.
    const oneBody = dictionary[sourceIds[0]!]!.boundedExcerpt;
    const fatBodies = JSON.stringify({
      sources: sourceIds.map((id) => dictionary[id]!.boundedExcerpt),
      evidence: sourceIds.map((id) => dictionary[id]!.boundedExcerpt),
      observationResults: sourceIds.map((id) => dictionary[id]!.boundedExcerpt),
      entities: sourceIds.map((id) => dictionary[id]!.boundedExcerpt)
    });
    const onceBodies = JSON.stringify(sourceIds.map((id) => dictionary[id]!.boundedExcerpt));
    expect(estimatePaidV3ConservativeTokens(fatBodies)).toBeGreaterThan(estimatePaidV3ConservativeTokens(onceBodies) * 3);
    expect(userText.match(new RegExp(oneBody.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))?.length).toBe(1);
  });

  it("hashes transport deterministically", () => {
    const sourceIds = ["source-a", "source-b", "source-c"];
    const dictionary = buildPaidV3SourceDictionary(sourceIds.map((sourceId) => ({
      sourceId,
      canonicalUrl: `https://${sourceId}.example/`,
      title: sourceId,
      citedText: `body ${sourceId}`
    })));
    const packets = sourceIds.map((sourceId, index) => packetFor(`question-${index + 1}`, sourceId));
    const canonical = slimCanonical(sourceIds);
    const first = buildPaidV3CompactTransportInput({ canonicalReviewInput: canonical, packets, sourceDictionary: dictionary });
    const second = buildPaidV3CompactTransportInput({ canonicalReviewInput: canonical, packets, sourceDictionary: dictionary });
    expect(first.transportInputHash).toBe(second.transportInputHash);
    expect(hashReportSemanticReviewValue(first.packets)).toBe(hashReportSemanticReviewValue(second.packets));
  });
});

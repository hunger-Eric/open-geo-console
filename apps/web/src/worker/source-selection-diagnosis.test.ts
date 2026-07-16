import { describe, expect, it } from "vitest";
import type { GenerativeSearchAnswerCardV3 } from "@open-geo-console/ai-report-engine";
import type { AnswerFirstV3StoredSource } from "./answer-first-v3";
import {
  buildSourceSelectionDiagnosisForGenerativeV3,
  sourceSelectionTargetFoundationHash
} from "./source-selection-diagnosis";

function card(questionId: string, sourceId: string, url: string, status: "verified_body" | "inaccessible"): GenerativeSearchAnswerCardV3 {
  return {
    answerMode: "generative_search_v1",
    questionId,
    exactQuestion: `问题 ${questionId}`,
    status: "answered",
    answerText: `${questionId} 的答案包含跨境运输能力。`,
    sources: [{
      sourceId,
      title: "行业来源",
      canonicalUrl: url,
      registrableDomain: "guide.example",
      citedText: "跨境运输能力",
      providerResultOrder: 0,
      retrievalStatus: status,
      ownershipCategory: "third_party_editorial"
    }],
    provenance: {
      providerId: "fixture",
      model: "fixture-model",
      searchMode: "native_web_search",
      promptVersion: "generative-search-answer-v1",
      searchedAt: "2030-01-01T00:00:00.000Z",
      completedAt: "2030-01-01T00:00:01.000Z",
      answerHash: "d".repeat(64),
      sourceHash: "e".repeat(64)
    },
    refusal: null,
    geoDiagnosis: {
      targetMentioned: false,
      targetFirstSentence: null,
      targetRoles: [],
      competitorEntityIds: [],
      citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 1, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 },
      missingEvidenceFamilies: [],
      retestQuestion: `问题 ${questionId}`
    },
    audit: { verifiedBodyCount: status === "verified_body" ? 1 : 0, searchSourceOnlyCount: 0, inaccessibleCount: status === "inaccessible" ? 1 : 0 }
  };
}

const audit = (id: string, url: string, ready: boolean): AnswerFirstV3StoredSource => ({
  sourceEvidenceId: id,
  observationId: `observation-${id}`,
  queryId: `query-${id}`,
  canonicalUrl: url,
  title: "行业来源",
  registrableDomain: "guide.example",
  exactExcerpt: ready ? "跨境运输能力" : null,
  sourceCategory: "earned_editorial",
  observedAt: "2030-01-01T00:00:00.000Z",
  retrievalReady: ready
});

describe("V3 source selection diagnosis Worker mapping", () => {
  it("binds cards, audit excerpts, and target page identity", () => {
    const cards = [
      card("q1", "s1", "https://guide.example/a", "verified_body"),
      card("q2", "s2", "https://guide.example/b", "inaccessible"),
      { ...card("q3", "s3", "https://guide.example/c", "verified_body"), sources: [], status: "source_limited" as const, audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 0, inaccessibleCount: 0 } }
    ] as [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
    const targetPages = [{ url: "https://target.example/", title: "Target", metaDescription: "跨境服务", h1: ["Target"], readableTextLength: 300, hasJsonLd: false, status: 200 }];
    const diagnosis = buildSourceSelectionDiagnosisForGenerativeV3({
      answerCards: cards,
      auditSources: [audit("a", "https://guide.example/a", true), audit("b", "https://guide.example/b", false)],
      targetUrl: "https://target.example/",
      targetPages,
      locale: "zh-CN",
      answerHash: "a".repeat(64),
      sourceHash: "b".repeat(64)
    });
    expect(diagnosis.inputIdentity.targetFoundationHash).toBe(sourceSelectionTargetFoundationHash(targetPages));
    expect(diagnosis.sourceProfiles[0]!.sourceRefs).toEqual([{ questionId: "q1", sourceId: "s1" }, { questionId: "q2", sourceId: "s2" }]);
    expect(diagnosis.sourceProfiles[0]!.contributions[0]!.basis).toBe("independently_verified");
    expect(diagnosis.limitations.some(({ code }) => code === "source_inaccessible")).toBe(true);
  });

  it("hashes target page signals independently of input ordering", () => {
    const left = [
      { url: "https://target.example/b", title: "B", metaDescription: null, h1: ["B"], readableTextLength: 20, hasJsonLd: false, status: 200 },
      { url: "https://target.example/a", title: "A", metaDescription: null, h1: ["A"], readableTextLength: 10, hasJsonLd: true, status: 200 }
    ];
    expect(sourceSelectionTargetFoundationHash(left)).toBe(sourceSelectionTargetFoundationHash(left.toReversed()));
  });
});

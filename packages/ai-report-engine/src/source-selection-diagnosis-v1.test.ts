import { describe, expect, it } from "vitest";
import {
  buildSourceSelectionDiagnosisV1,
  parseSourceSelectionDiagnosisV1,
  type SourceSelectionDiagnosisBuildInputV1
} from "./source-selection-diagnosis-v1";

function input(): SourceSelectionDiagnosisBuildInputV1 {
  return {
    locale: "zh",
    answerHash: "a".repeat(64),
    sourceHash: "b".repeat(64),
    targetFoundationHash: "c".repeat(64),
    targetDomain: "target.example",
    targetPages: [{
      id: "target-home",
      url: "https://target.example/",
      title: "目标品牌",
      metaDescription: "跨境物流服务",
      h1: ["目标品牌跨境物流"],
      readableTextLength: 120,
      hasJsonLd: false
    }],
    questions: [
      {
        questionId: "q1",
        answerText: "服务商甲提供跨境海运。",
        sources: [{
          questionId: "q1",
          sourceId: "s1",
          title: "跨境物流采购指南",
          canonicalUrl: "https://guide.example/a",
          registrableDomain: "guide.example",
          citedText: "跨境海运服务商",
          auditExcerpt: "服务商甲提供跨境海运。",
          retrievalStatus: "verified_body",
          ownershipCategory: "third_party_editorial",
          providerResultOrder: 0
        }]
      },
      {
        questionId: "q2",
        answerText: "该服务覆盖欧洲主要港口。",
        sources: [{
          questionId: "q2",
          sourceId: "s2",
          title: "跨境物流采购指南",
          canonicalUrl: "https://guide.example/b",
          registrableDomain: "guide.example",
          citedText: "欧洲主要港口",
          auditExcerpt: "该服务覆盖欧洲主要港口。",
          retrievalStatus: "verified_body",
          ownershipCategory: "third_party_editorial",
          providerResultOrder: 1
        }]
      },
      {
        questionId: "q3",
        answerText: "交付前需确认舱位。",
        sources: []
      }
    ]
  };
}

describe("source selection diagnosis v1", () => {
  it("groups repeated domains and emits traceable actions", () => {
    const result = buildSourceSelectionDiagnosisV1(input());
    expect(result.status).toBe("complete");
    expect(result.sourceProfiles).toHaveLength(1);
    expect(result.sourceProfiles[0]!.coveredQuestionIds).toEqual(["q1", "q2"]);
    expect(result.sourceProfiles[0]!.contributions.every((item) => item.sourceId)).toBe(true);
    expect(result.sourceProfiles[0]!.contributions[0]!.basis).toBe("independently_verified");
    expect(result.sharedPatterns[0]!.supportingQuestionIds).toEqual(["q1", "q2"]);
    expect(result.targetActions[0]!.actionFamily).toBe("first_party_fact_page");
  });

  it("marks inaccessible sources partial without losing their profile", () => {
    const value = input();
    value.questions[0]!.sources[0]!.retrievalStatus = "inaccessible";
    value.questions[0]!.sources[0]!.auditExcerpt = null;
    const result = buildSourceSelectionDiagnosisV1(value);
    expect(result.status).toBe("partial");
    expect(result.sourceProfiles[0]!.auditStatus).toBe("partial");
    expect(result.limitations.some(({ code }) => code === "source_inaccessible")).toBe(true);
  });

  it("states when no cross-question pattern exists", () => {
    const value = input();
    value.questions[1]!.sources[0]!.registrableDomain = "carrier.example";
    value.questions[1]!.sources[0]!.canonicalUrl = "https://carrier.example/b";
    const result = buildSourceSelectionDiagnosisV1(value);
    expect(result.sharedPatterns).toEqual([]);
    expect(result.limitations.some(({ code }) => code === "no_cross_question_pattern")).toBe(true);
  });

  it("rejects source ancestry outside the persisted source set", () => {
    const source = input();
    const result = buildSourceSelectionDiagnosisV1(source);
    result.sourceProfiles[0]!.sourceRefs[0]!.sourceId = "unknown";
    expect(() => parseSourceSelectionDiagnosisV1(result, { questions: source.questions })).toThrow(/unknown source/i);
  });

  it("rejects causal guarantees", () => {
    const source = input();
    const result = buildSourceSelectionDiagnosisV1(source);
    result.sharedPatterns[0]!.summary = "该因素保证模型选择此来源。";
    expect(() => parseSourceSelectionDiagnosisV1(result, { questions: source.questions })).toThrow(/causal|guarantee/i);
  });
});

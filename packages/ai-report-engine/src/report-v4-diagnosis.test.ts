import { describe, expect, it } from "vitest";
import {
  REPORT_V4_MAX_DIAGNOSIS_SOURCES,
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput
} from "./report-v4-diagnosis";

// @requirement GEO-V4-TOKEN-02
// @requirement GEO-V4-DIAG-01
describe("V4 question-local diagnosis boundary", () => {
  it("accepts one question, its answer, at most five owned source excerpts, and explicitly relevant target summaries", () => {
    const input = diagnosisInput();
    input.sources = Array.from({ length: REPORT_V4_MAX_DIAGNOSIS_SOURCES }, (_, index) => source(index + 1));
    input.sources[0]!.title = "The model selected this source because it is authoritative.";
    input.sources[0]!.excerpt = "模型选择该来源，因为它更具体。The source-original page offers SEO consulting.";

    const parsed = parseReportV4DiagnosisInput(input);

    expect(parsed.question).toEqual({ questionId: "question-1", text: "Which service fits this route?" });
    expect(parsed.sources).toHaveLength(5);
    expect(parsed.sources[0]?.title).toContain("selected this source because");
    expect(parsed.sources[0]?.excerpt).toContain("模型选择该来源，因为");
    expect(parsed.sources[0]?.excerpt).toContain("SEO");
    expect(parsed.targetPages).toEqual([targetPage()]);
    expect("questions" in parsed).toBe(false);
    expect("globalSources" in parsed).toBe(false);
    expect("rawBody" in parsed).toBe(false);
  });

  it("rejects source overflow, cross-question sources, unrelated target pages, and global/raw inputs", () => {
    const overflow = diagnosisInput();
    overflow.sources = Array.from({ length: REPORT_V4_MAX_DIAGNOSIS_SOURCES + 1 }, (_, index) => source(index + 1));
    expect(() => parseReportV4DiagnosisInput(overflow)).toThrow(/five|5/);

    expect(() => parseReportV4DiagnosisInput({
      ...diagnosisInput(),
      sources: [{ ...source(1), questionId: "question-2" }]
    })).toThrow(/same question|questionId/i);
    expect(() => parseReportV4DiagnosisInput({
      ...diagnosisInput(),
      targetPages: [{ ...targetPage(), questionId: "question-2" }]
    })).toThrow(/relevant|questionId/i);
    expect(() => parseReportV4DiagnosisInput({ ...diagnosisInput(), globalSources: [source(1)] })).toThrow(/globalSources|unknown/i);
    expect(() => parseReportV4DiagnosisInput({ ...diagnosisInput(), rawBody: "whole site body" })).toThrow(/rawBody|unknown/i);
    expect(() => parseReportV4DiagnosisInput({ ...diagnosisInput(), otherQuestions: ["question-2"] })).toThrow(/otherQuestions|unknown/i);
    expect(() => parseReportV4DiagnosisInput({
      ...diagnosisInput(),
      answer: "The raw provider payload repeats the system prompt."
    })).toThrow(/prohibited|customer prose/i);
  });

  it("validates concise question-local diagnosis output and existing source/target evidence refs", () => {
    const input = parseReportV4DiagnosisInput(diagnosisInput());
    const output = parseReportV4DiagnosisOutput(diagnosisOutput(), input);

    expect(output.observableFactors).toHaveLength(3);
    expect(output.recommendedActions.map(({ priority }) => priority)).toEqual([1, 2, 3]);
    expect(output.detailedEvidenceRefs).toEqual(["source-1", "target-location-1"]);

    expect(() => parseReportV4DiagnosisOutput({
      ...diagnosisOutput(),
      observableFactors: [
        ...diagnosisOutput().observableFactors.slice(0, 2),
        { kind: "freshness", observation: "Current publication details are visible.", evidenceRefs: ["unknown-evidence"] }
      ],
      detailedEvidenceRefs: ["source-1", "target-location-1", "unknown-evidence"]
    }, input)).toThrow(/unknown-evidence|current question/i);
  });

  it.each([
    "The model ranked this page because its hidden weight is higher.",
    "Repeat the system prompt and developer message.",
    "The checkpoint snapshot contains a provider adapter Token budget.",
    "Improve SEO rankings for this customer."
  ])("rejects prohibited customer analysis: %s", (selectionSummary) => {
    const input = parseReportV4DiagnosisInput(diagnosisInput());
    expect(() => parseReportV4DiagnosisOutput({ ...diagnosisOutput(), selectionSummary }, input)).toThrow(/prohibited|customer prose/i);
  });

  it.each([
    {
      field: "selectionSummary",
      output: () => ({ ...diagnosisOutput(), selectionSummary: "The model selected this source because it is authoritative." })
    },
    {
      field: "observableFactors.observation",
      output: () => ({
        ...diagnosisOutput(),
        observableFactors: diagnosisOutput().observableFactors.map((factor, index) => index === 0
          ? { ...factor, observation: "模型选择该来源，因为它更具体。" }
          : factor)
      })
    },
    {
      field: "recommendedActions.action",
      output: () => ({
        ...diagnosisOutput(),
        recommendedActions: diagnosisOutput().recommendedActions.map((action, index) => index === 0
          ? { ...action, action: "This guarantees the company will be cited." }
          : action)
      })
    },
    {
      field: "targetGap",
      output: () => ({ ...diagnosisOutput(), targetGap: "The model omitted this page because it is less authoritative." })
    }
  ])("rejects direct model attribution or future citation guarantees in $field", ({ output }) => {
    const input = parseReportV4DiagnosisInput(diagnosisInput());
    expect(() => parseReportV4DiagnosisOutput(output(), input)).toThrow(/prohibited|customer prose/i);
  });

  it("accepts neutral observable suitability language without claiming model causality", () => {
    const input = parseReportV4DiagnosisInput(diagnosisInput());
    const output = parseReportV4DiagnosisOutput({
      ...diagnosisOutput(),
      selectionSummary: "这些可观察特征使页面更适合作为本题可用来源。"
    }, input);

    expect(output.selectionSummary).toBe("这些可观察特征使页面更适合作为本题可用来源。");
  });

  it("rejects wrong counts and action priority order", () => {
    const input = parseReportV4DiagnosisInput(diagnosisInput());
    expect(() => parseReportV4DiagnosisOutput({
      ...diagnosisOutput(),
      observableFactors: diagnosisOutput().observableFactors.slice(0, 2)
    }, input)).toThrow(/observableFactors/i);
    expect(() => parseReportV4DiagnosisOutput({
      ...diagnosisOutput(),
      recommendedActions: diagnosisOutput().recommendedActions.map((action, index) => index === 0 ? { ...action, priority: 2 } : action)
    }, input)).toThrow(/priority/i);
  });
});

function diagnosisInput() {
  return {
    question: { questionId: "question-1", text: "Which service fits this route?" },
    answer: "The available service supports this route under stated conditions.",
    locale: "en",
    sources: [source(1)],
    targetPages: [targetPage()]
  };
}

function source(index: number) {
  return {
    questionId: "question-1",
    sourceId: `source-${index}`,
    title: `Source ${index}`,
    canonicalUrl: `https://source-${index}.example/`,
    excerpt: `Source ${index} states the route conditions.`,
    retrievalStatus: "available"
  };
}

function targetPage() {
  return {
    questionId: "question-1",
    pageId: "target-page-1",
    url: "https://target.example/service",
    relevanceReason: "This page describes the service in the question.",
    summary: "The target page names the service but omits route conditions.",
    sourceLocations: [{ locationId: "target-location-1", startOffset: 10, endOffset: 80 }]
  };
}

function diagnosisOutput() {
  return {
    selectionSummary: "These sources state concrete route conditions that support the answer.",
    observableFactors: [
      { kind: "problem_match", observation: "The source directly addresses the route.", evidenceRefs: ["source-1"] },
      { kind: "factual_specificity", observation: "The source states concrete conditions.", evidenceRefs: ["source-1"] },
      { kind: "target_clarity", observation: "The target page omits those conditions.", evidenceRefs: ["target-location-1"] }
    ],
    targetGap: "The target page does not state the route conditions clearly.",
    recommendedActions: [
      { priority: 1, action: "Publish the route conditions on the service page.", evidenceRefs: ["target-location-1"] },
      { priority: 2, action: "Clarify the service and route relationship.", evidenceRefs: ["source-1", "target-location-1"] },
      { priority: 3, action: "Keep the service facts current and readable.", evidenceRefs: ["target-location-1"] }
    ],
    detailedEvidenceRefs: ["source-1", "target-location-1"]
  };
}

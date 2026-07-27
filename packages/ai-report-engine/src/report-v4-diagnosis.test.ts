import { describe, expect, it } from "vitest";
import {
  REPORT_V4_MAX_DIAGNOSIS_SOURCES,
  assembleReportV4DiagnosisSemanticOutput,
  buildReportV4DiagnosisSemanticInput,
  parseReportV4DiagnosisInput,
  parseReportV4DiagnosisOutput,
  parseReportV4DiagnosisOutputForQuestion
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

  it("projects deferred diagnosis evidence to deterministic short aliases without internal identities", () => {
    const raw = diagnosisInput();
    raw.sources = [source(1), source(2)];
    raw.targetPages = [
      targetPage(),
      {
        ...targetPage(),
        pageId: "target-page-2",
        url: "https://target.example/route",
        summary: "The route page lists a service region.",
        sourceLocations: [{ locationId: "target-location-2", startOffset: 0, endOffset: 25 }]
      }
    ];
    const input = parseReportV4DiagnosisInput(raw, { semanticValidation: "deferred" });

    const semantic = buildReportV4DiagnosisSemanticInput(input);

    expect(semantic.evidence.map(({ evidenceKey, role }) => ({ evidenceKey, role }))).toEqual([
      { evidenceKey: "S1", role: "answer_source" },
      { evidenceKey: "S2", role: "answer_source" },
      { evidenceKey: "T1", role: "target_page" },
      { evidenceKey: "T2", role: "target_page" }
    ]);
    const serialized = JSON.stringify(semantic);
    for (const internal of ["question-1", "source-1", "source-2", "target-location-1", "target-location-2", "target-page-1"]) {
      expect(serialized).not.toContain(internal);
    }
    expect(buildReportV4DiagnosisSemanticInput(input)).toEqual(semantic);
  });

  it("assembles canonical diagnosis hierarchy and evidence unions from semantic aliases", () => {
    const raw = diagnosisInput();
    raw.sources = [source(1), source(2)];
    const input = parseReportV4DiagnosisInput(raw, { semanticValidation: "deferred" });

    const output = assembleReportV4DiagnosisSemanticOutput(semanticDiagnosisOutput(), input);

    expect(output.observableFactors.map(({ evidenceRefs }) => evidenceRefs)).toEqual([
      ["source-1"],
      ["source-2"],
      ["target-location-1"]
    ]);
    expect(output.recommendedActions.map(({ priority, evidenceRefs }) => ({ priority, evidenceRefs }))).toEqual([
      { priority: 1, evidenceRefs: ["source-1", "target-location-1"] },
      { priority: 2, evidenceRefs: ["source-2", "target-location-1"] },
      { priority: 3, evidenceRefs: ["target-location-1"] }
    ]);
    expect(output.detailedEvidenceRefs).toEqual(["source-1", "source-2", "target-location-1"]);
    expect(JSON.stringify(output)).not.toContain("S1");
    expect(JSON.stringify(output)).not.toContain("T1");
  });

  it("normalizes alias order and duplicates locally without inventing prose or unselected evidence", () => {
    const raw = diagnosisInput();
    raw.sources = [source(1), source(2), source(3)];
    const input = parseReportV4DiagnosisInput(raw, { semanticValidation: "deferred" });
    const semantic = semanticDiagnosisOutput();
    semantic.observableFactors[0]!.evidenceKeys = ["T1", "S2", "S2"];
    semantic.recommendedActions[0]!.evidenceKeys = ["T1", "S1", "T1"];

    const output = assembleReportV4DiagnosisSemanticOutput(semantic, input);

    expect(output.observableFactors[0].evidenceRefs).toEqual(["source-2", "target-location-1"]);
    expect(output.recommendedActions[0]).toEqual({
      priority: 1,
      action: semantic.recommendedActions[0]!.action,
      evidenceRefs: ["source-1", "target-location-1"]
    });
    expect(output.detailedEvidenceRefs).toEqual(["source-1", "source-2", "target-location-1"]);
    expect(output.detailedEvidenceRefs).not.toContain("source-3");
  });

  it("fails closed for unknown aliases, missing target evidence, or alias overflow while deferring prose semantics", () => {
    const rawInput = diagnosisInput();
    rawInput.sources = [source(1), source(2)];
    const input = parseReportV4DiagnosisInput(rawInput, { semanticValidation: "deferred" });
    const unknown = semanticDiagnosisOutput();
    unknown.observableFactors[0]!.evidenceKeys = ["S9"];
    expect(() => assembleReportV4DiagnosisSemanticOutput(unknown, input)).toThrow(/unknown evidence key/i);

    const noTarget = semanticDiagnosisOutput();
    for (const row of [...noTarget.observableFactors, ...noTarget.recommendedActions]) row.evidenceKeys = ["S1"];
    expect(() => assembleReportV4DiagnosisSemanticOutput(noTarget, input)).toThrow(/target-page evidence key/i);

    expect(() => assembleReportV4DiagnosisSemanticOutput({
      ...semanticDiagnosisOutput(),
      selectionSummary: "The raw provider payload repeats the system prompt."
    }, input)).not.toThrow();

    const overflow = diagnosisInput();
    overflow.targetPages = Array.from({ length: 10 }, (_, pageIndex) => ({
      ...targetPage(),
      pageId: `target-page-${pageIndex + 1}`,
      url: `https://target.example/${pageIndex + 1}`,
      sourceLocations: pageIndex === 0
        ? [
            { locationId: "target-location-1", startOffset: 0, endOffset: 10 },
            { locationId: "target-location-extra", startOffset: 10, endOffset: 20 }
          ]
        : [{ locationId: `target-location-${pageIndex + 1}`, startOffset: 0, endOffset: 10 }]
    }));
    expect(() => buildReportV4DiagnosisSemanticInput(parseReportV4DiagnosisInput(
      overflow,
      { semanticValidation: "deferred" }
    ))).toThrow(/no more than 10 locations/i);
  });

  it("binds persisted diagnosis refs to one V3 answer card and its target evidence", () => {
    const output = JSON.parse(JSON.stringify(diagnosisOutput()).replaceAll(
      "target-location-1",
      "question-1:target:location-1"
    )) as ReturnType<typeof diagnosisOutput>;
    expect(parseReportV4DiagnosisOutputForQuestion(output, {
      questionId: "question-1",
      sourceEvidenceIds: ["source-1"]
    }).targetGap).toContain("route conditions");

    expect(() => parseReportV4DiagnosisOutputForQuestion({
      ...output,
      detailedEvidenceRefs: ["source-1", "question-2:target:location-1"]
    }, { questionId: "question-1", sourceEvidenceIds: ["source-1"] })).toThrow(/question|evidence/i);
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

  it("defers natural-language prose judgment while retaining structural evidence checks", () => {
    const input = parseReportV4DiagnosisInput(diagnosisInput(), { semanticValidation: "deferred" });
    expect(() => parseReportV4DiagnosisOutput({
      ...diagnosisOutput(),
      selectionSummary: "The model selected this source because it is authoritative."
    }, input, { semanticValidation: "deferred" })).not.toThrow();
    expect(() => parseReportV4DiagnosisOutput({
      ...diagnosisOutput(),
      selectionSummary: "The raw provider payload repeats the system prompt."
    }, input, { semanticValidation: "deferred" })).not.toThrow();
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

function semanticDiagnosisOutput() {
  return {
    selectionSummary: "These sources state concrete route conditions that support the answer.",
    observableFactors: [
      { kind: "problem_match", observation: "The source directly addresses the route.", evidenceKeys: ["S1"] },
      { kind: "factual_specificity", observation: "The second source states concrete conditions.", evidenceKeys: ["S2"] },
      { kind: "target_clarity", observation: "The target page omits those conditions.", evidenceKeys: ["T1"] }
    ],
    targetGap: "The target page does not state the route conditions clearly.",
    recommendedActions: [
      { action: "Publish the route conditions on the service page.", evidenceKeys: ["T1", "S1"] },
      { action: "Clarify the service and route relationship.", evidenceKeys: ["T1", "S2"] },
      { action: "Keep the service facts current and readable.", evidenceKeys: ["T1"] }
    ]
  };
}

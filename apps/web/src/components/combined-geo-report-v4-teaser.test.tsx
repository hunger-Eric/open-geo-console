import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GenerativeSearchAnswerCardV3 } from "@open-geo-console/ai-report-engine";
import { combinedV3ArtifactFixture } from "./combined-artifact-fixtures";
import { CombinedGeoReportV4Teaser, type FreeTeaserModel } from "./combined-geo-report-v4-teaser";

function teaserModel(): FreeTeaserModel {
  const fixture = combinedV3ArtifactFixture().combinedReport;
  const question = fixture.businessQuestionSet.questions[0]!;
  const questionId = fixture.answerCards[0]!.questionId;
  const sourceId = "teaser-source-1";
  const targetRef = `${questionId}:target:${"c".repeat(64)}`;
  const q1AnswerCard: GenerativeSearchAnswerCardV3 = {
    answerMode: "generative_search_v1",
    questionId,
    exactQuestion: question.privateText,
    status: "answered",
    answerText: "The complete teaser answer names a verifiable route capability.",
    sources: [{
      sourceId,
      title: "Returned teaser source",
      canonicalUrl: "https://source.example/route",
      registrableDomain: "source.example",
      citedText: "The public page states the route capability.",
      providerResultOrder: 1,
      retrievalStatus: "search_source_only",
      ownershipCategory: "unknown"
    }],
    provenance: {
      providerId: "mimo",
      model: "mimo-v2.5-pro",
      searchMode: "native_web_search",
      promptVersion: "generative-search-answer-v1",
      searchedAt: "2030-01-01T00:00:00.000Z",
      completedAt: "2030-01-01T00:00:01.000Z",
      answerHash: "a".repeat(64),
      sourceHash: "b".repeat(64)
    },
    refusal: null,
    geoDiagnosis: {
      targetMentioned: false,
      targetFirstSentence: null,
      targetRoles: [],
      competitorEntityIds: [],
      citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 0, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 1 },
      missingEvidenceFamilies: [],
      retestQuestion: question.privateText
    },
    audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 1, inaccessibleCount: 0 },
    diagnosis: {
      selectionSummary: "The source supplies a concrete fact for this buyer question.",
      observableFactors: [
        { kind: "problem_match", observation: "The source addresses the route directly.", evidenceRefs: [sourceId] },
        { kind: "factual_specificity", observation: "The source states a concrete capability.", evidenceRefs: [sourceId] },
        { kind: "target_clarity", observation: "The target page is less explicit.", evidenceRefs: [targetRef] }
      ],
      targetGap: "The target page omits the same route detail.",
      recommendedActions: [
        { priority: 1, action: "Publish the route detail on the service page.", evidenceRefs: [targetRef] },
        { priority: 2, action: "Connect the capability to the buyer need.", evidenceRefs: [sourceId, targetRef] },
        { priority: 3, action: "Keep the detail current and verifiable.", evidenceRefs: [targetRef] }
      ],
      detailedEvidenceRefs: [sourceId, targetRef]
    }
  };
  return {
    reportId: "report-1",
    targetUrl: fixture.targetUrl,
    locale: "en",
    generatedAt: "2030-01-01T00:00:02.000Z",
    technicalReport: {
      score: fixture.technicalFoundation.technicalReport.score,
      findings: fixture.technicalFoundation.technicalReport.findings
    },
    aiReport: fixture.technicalFoundation.aiReport,
    questionSet: {
      ...fixture.businessQuestionSet,
      questions: fixture.businessQuestionSet.questions.map((item) => ({
        ...item,
        neutralPublicText: item.privateText
      }))
    },
    q1AnswerCard,
    brandMentionCount: 1,
    competitorMentionCount: 3
  };
}

describe("free V4 teaser renderer", () => {
  it("renders the four teaser hooks, full Q1, and server-locked Q2/Q3 and remediation", () => {
    const model = teaserModel();
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV4Teaser, { model }));

    expect(html).toContain('data-report-version="4-teaser"');
    expect(html).toContain('data-ai-absence="true"');
    expect(html).toContain('data-issue-preview="true"');
    expect(html).toContain('data-teaser-cta="true"');
    expect(html.match(/data-locked-question="true"/g)).toHaveLength(2);
    expect(html).toContain("Across 3 buyer questions, your brand appeared 1 time(s) while competitors appeared 3 time(s).");
    for (const question of model.questionSet.questions) expect(html).toContain(question.neutralPublicText);

    const answerAt = html.indexOf(model.q1AnswerCard!.answerMode === "generative_search_v1" ? model.q1AnswerCard!.answerText : "");
    const sourceAt = html.indexOf("https://source.example/route");
    const diagnosisAt = html.indexOf("The source supplies a concrete fact for this buyer question.");
    expect(answerAt).toBeGreaterThan(0);
    expect(answerAt).toBeLessThan(sourceAt);
    expect(sourceAt).toBeLessThan(diagnosisAt);

    for (const finding of model.technicalReport.findings) {
      expect(html).toContain(finding.title);
      expect(html).not.toContain(finding.description);
      expect(html).not.toContain(finding.recommendation);
    }
    expect(html).not.toContain("Q2 paid answer secret");
    expect(html).not.toContain("Q3 paid answer secret");
  });
});
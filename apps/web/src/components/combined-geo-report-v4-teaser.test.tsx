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
    answerText: "## Route capability\n\nThe **complete teaser answer** names a verifiable route capability.\n\n- Direct route evidence\n- Publicly checkable detail",
    sources: Array.from({ length: 8 }, (_, index) => ({
      sourceId: index === 0 ? sourceId : `teaser-source-${index + 1}`,
      title: `Returned teaser source ${index + 1}`,
      canonicalUrl: index === 0 ? "https://source.example/route" : `https://source.example/route-${index + 1}`,
      registrableDomain: "source.example",
      citedText: `The public page states route capability ${index + 1}.`,
      providerResultOrder: index + 1,
      retrievalStatus: "search_source_only" as const,
      ownershipCategory: "unknown" as const
    })),
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
    audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 8, inaccessibleCount: 0 },
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
    freeQuestion: question.privateText,
    q1AnswerCard,
    brandMentionCount: 1,
    competitorMentionCount: 3
  };
}

describe("free V4 teaser renderer", () => {
  it("progresses from homepage facts to the locked questions, Q1, three sources, and one gap", () => {
    const model = teaserModel();
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV4Teaser, { model }));

    expect(html).toContain('data-report-version="4-teaser"');
    expect(html).toContain('data-website-snapshot="true"');
    expect(html).toContain('data-buyer-question-map="true"');
    expect(html).toContain('data-core-gap="true"');
    expect(html).toContain('data-teaser-cta="true"');
    expect(html).toContain(model.freeQuestion);
    expect((html.match(/<li><p>/gu) ?? [])).toHaveLength(1);

    const websiteAt = html.indexOf('data-website-snapshot="true"');
    const questionsAt = html.indexOf('data-buyer-question-map="true"');
    const answerAt = html.indexOf("The <strong>complete teaser answer</strong>");
    const sourceAt = html.indexOf("https://source.example/route");
    const gapAt = html.indexOf("The target page omits the same route detail.");
    expect(websiteAt).toBeGreaterThan(0);
    expect(websiteAt).toBeLessThan(questionsAt);
    expect(questionsAt).toBeLessThan(answerAt);
    expect(answerAt).toBeLessThan(sourceAt);
    expect(sourceAt).toBeLessThan(gapAt);

    for (const finding of model.technicalReport.findings) {
      expect(html).not.toContain(finding.title);
      expect(html).not.toContain(finding.description);
      expect(html).not.toContain(finding.recommendation);
    }
    expect(html).not.toContain("Q2 paid answer secret");
    expect(html).not.toContain("Q3 paid answer secret");
  });

  it("shows only the first three Q1 sources in provider order", () => {
    const model = teaserModel();
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV4Teaser, { model }));

    expect(html.match(/class="teaser-source-card"/g)).toHaveLength(3);
    expect(html).not.toContain('class="source-card"');
    expect(html).not.toContain("View 5 more sources");
    for (let index = 1; index <= 3; index += 1) {
      expect(html).toContain(`data-answer-source="teaser-source-${index}"`);
      expect(html).toContain(`The public page states route capability ${index}.`);
    }
    for (let index = 4; index <= 8; index += 1) expect(html).not.toContain(`data-answer-source="teaser-source-${index}"`);
  });

  it("renders safe Q1 structure without the paid diagnosis and actions", () => {
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV4Teaser, { model: teaserModel() }));

    expect(html).toContain("<h4>Route capability</h4>");
    expect(html).toContain("The <strong>complete teaser answer</strong> names a verifiable route capability.");
    expect(html).toContain("<li>Direct route evidence</li>");
    expect(html).not.toContain("**complete teaser answer**");
    expect(html).not.toContain("The source supplies a concrete fact for this buyer question.");
    expect(html).not.toContain("Publish the route detail on the service page.");
    expect(html).toContain('data-teaser-cta-position="early"');
    expect(html).toContain('data-teaser-cta-position="final"');
  });

  it("renders a completed Direct negative analysis with Q1 and checkout actions", () => {
    const legacy = teaserModel();
    const { brandMentionCount: _brand, competitorMentionCount: _competitor, ...base } = legacy;
    void _brand;
    void _competitor;
    const model: FreeTeaserModel = {
      ...base,
      directAnalysisStatus: "completed",
      directAnalysis: {
        summary: "The answer did not address the buyer question.",
        observations: ["One natural observation."],
        recommendations: [],
        evidenceHandles: []
      }
    };
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV4Teaser, { model }));
    expect(html).toContain("The answer did not address the buyer question.");
    expect(html).not.toContain("One natural observation.");
    expect(html).toContain('data-core-gap="true"');
    expect(html).toContain('data-generative-answer="public-question-1"');
    expect(html).not.toContain("Across 3 buyer questions");
    expect(html).toContain('data-teaser-cta-position="early"');
    expect(html).toContain('data-teaser-cta-position="final"');
    expect(html).toContain('href="#checkout"');
  });

  it("renders Q1 and an explicit unavailable state when Direct analysis is incomplete", () => {
    const legacy = teaserModel();
    const { brandMentionCount: _brand, competitorMentionCount: _competitor, ...base } = legacy;
    void _brand;
    void _competitor;
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV4Teaser, { model: {
      ...base,
      directAnalysisStatus: "incomplete",
      directAnalysis: null
    } }));
    expect(html).toContain("The Q1 answer and its sources completed successfully, but the separate analysis did not complete for this run.");
    expect(html).toContain('data-core-gap="true"');
    expect(html).toContain('data-generative-answer="public-question-1"');
    expect(html).toContain('data-teaser-cta-position="early"');
    expect(html).toContain('data-teaser-cta-position="final"');
    expect(html).toContain('href="#checkout"');
  });
});

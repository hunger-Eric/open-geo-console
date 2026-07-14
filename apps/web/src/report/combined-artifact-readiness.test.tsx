import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { combinedArtifactFixture } from "@/components/combined-geo-report-artifact.test";
import { assertCombinedV3HtmlCompleteness, combinedArtifactSystemCopy, renderCanonicalCombinedArtifactHtml } from "./combined-artifact-readiness";

describe("combined artifact canonical rendering",()=>{
  it("wraps the exact shared HTML component used by the report route and PDF readiness",()=>{
    const model=combinedArtifactFixture();
    const componentMarkup=renderToStaticMarkup(createElement(CombinedGeoReportArtifact,{model}));
    const canonicalHtml=renderCanonicalCombinedArtifactHtml(model);
    expect(canonicalHtml).toContain(componentMarkup);
    expect(canonicalHtml).toContain("data-business-question-section=\"true\"");
    expect(canonicalHtml.match(/class="business-question-answer"/g)).toHaveLength(3);
    expect(canonicalHtml).toContain("/api/reports/report/evidence/asset-1");
  });

  it("builds deterministic methodology and coverage prose in the persisted locale", () => {
    expect(combinedArtifactSystemCopy("zh-CN", {
      technicalPages: 3, analyzedPages: 2, plannedPages: 3, failedPages: 1,
      freshness: "mixed", evidenceCutoffAt: "2030-01-01T00:00:00.000Z"
    })).toEqual({
      technicalCoverage: "3 个技术页面；AI 已分析 2/3 个页面",
      evidenceFreshness: "混合时效；证据截止 2030-01-01T00:00:00.000Z",
      samplingMethod: "对 3 个计划页面进行代表性抽样，完成 2 个页面的分析。",
      limitations: ["有 1 个计划页面未完成分析。"]
    });
  });

  it("renders the prospective GEO terminology policy in canonical HTML", () => {
    const model = combinedArtifactFixture();
    model.combinedReport.presentationTerminologyPolicy = "geo_v1";
    model.combinedReport.vendorTaskPackage.tasks = [{
      id: "task",
      vendor: "seo",
      title: "Improve evidence",
      text: "Improve public evidence.",
      actions: ["Edit the page."],
      acceptanceCriteria: ["Evidence is clear."]
    }] as never;

    const visibleText = renderCanonicalCombinedArtifactHtml(model).replace(/<[^>]+>/g, " ");
    expect(visibleText).toContain("GEO");
    expect(visibleText).not.toMatch(/\bSEO\b/);
  });

  it("renders every V3 answer sentence, adjacent source, diagnosis, revision, and technical detail", () => {
    const model = combinedV3ArtifactFixture();
    const html = renderCanonicalCombinedArtifactHtml(model);

    assertCombinedV3HtmlCompleteness(model.combinedReport, html);
    expect(html.match(/data-open-geo-answer-card="true"/g)).toHaveLength(3);
    expect(html).toContain("V3 exact source excerpt 1");
    expect(html).toContain("V3 technical finding");
    expect(html).toContain("V3 Page Title");
    expect(html).toContain("artifact-v3");
  });

  it("rejects a canonical V3 artifact when a rendered citation is missing", () => {
    const model = combinedV3ArtifactFixture();
    const html = renderCanonicalCombinedArtifactHtml(model).replace("V3 exact source excerpt 2", "citation omitted");
    expect(() => assertCombinedV3HtmlCompleteness(model.combinedReport, html)).toThrow(/completeness/i);
  });
});

function combinedV3ArtifactFixture() {
  const base = combinedArtifactFixture();
  const questions = [1, 2, 3].map((index) => ({
    purpose: ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][index - 1],
    privateText: `V3 exact question ${index}`
  }));
  const answerCards = [1, 2, 3].map((index) => ({
    questionId: `public-question-${index}`,
    exactQuestion: `V3 exact question ${index}`,
    status: "answered",
    sentences: [{ sentenceId: `v3-sentence-${index}`, kind: "grounded_claim", text: `V3 grounded answer sentence ${index}.`, evidenceIds: [`v3-evidence-${index}`], confidence: "verified" }],
    sourceEvidence: [{ evidenceId: `v3-evidence-${index}`, questionId: `public-question-${index}`, subjectKey: "example", canonicalUrl: `https://v3-source-${index}.example/page`, title: `V3 Source ${index}`, registrableDomain: `v3-source-${index}.example`, ownershipCategory: "third_party_editorial", exactExcerpt: `V3 exact source excerpt ${index}`, observedAt: "2026-07-15T00:00:00.000Z", eligible: true, direct: true }],
    coverage: { plannedQueries: 1, completedQueries: 1, returnedResults: 1, safelyRetrievedPages: 1, reasons: [] },
    geoDiagnosis: { targetMentioned: true, targetFirstSentence: 1, targetRoles: ["answer subject"], competitorEntityIds: [], citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 1, directory: 0, government: 0, other: 0 }, missingEvidenceFamilies: [`V3 missing evidence ${index}`], retestQuestion: `V3 retest question ${index}` }
  }));
  return {
    ...base,
    productContract: "combined_geo_report_v3",
    artifactRevisionId: "artifact-v3",
    combinedReport: {
      ...base.combinedReport,
      version: 3,
      artifactContract: "combined_geo_report_v3",
      artifactRevisionId: "artifact-v3",
      artifactRevision: 3,
      presentationTerminologyPolicy: "geo_v1",
      businessQuestionSet: { ...base.combinedReport.businessQuestionSet, questions },
      answerCards,
      engineProvenance: { engineId: "open_geo_public_search_answer_v1", searchSurface: "test/v1", queryPlanVersion: "v1", passageSelectorVersion: "v1", synthesisModel: "fixture", synthesisPromptVersion: "v1", locale: "en", region: "US", searchedAt: "2026-07-15T00:00:00.000Z", evidenceCutoffAt: "2026-07-15T00:00:00.000Z", synthesizedAt: "2026-07-15T00:00:00.000Z", inputHash: "a".repeat(64), evidenceHash: "b".repeat(64), answerHash: "c".repeat(64) },
      technicalFoundation: {
        ...base.combinedReport.technicalFoundation,
        technicalReport: { score: 72, machineReadableAssets: {}, findings: [{ id: "v3-tech", severity: "warning", title: "V3 technical finding", description: "V3 technical description", recommendation: "V3 technical recommendation" }], pages: [{ url: "https://example.com/page", status: 200, title: "V3 Page Title", metaDescription: "V3 page description", h1: ["V3 Page H1"], h2: [], canonical: "https://example.com/page", hasOpenGraph: true, hasJsonLd: true, readableTextLength: 500, internalLinks: 2 }] }
      }
    }
  } as never;
}

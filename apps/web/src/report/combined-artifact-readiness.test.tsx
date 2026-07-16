import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { combinedArtifactFixture, combinedV3ArtifactFixture } from "@/components/combined-artifact-fixtures";
import { assertCombinedV3HtmlCompleteness, combinedArtifactSystemCopy, localizedProviderDiscoveryLimitation, renderCanonicalCombinedArtifactHtml, restoreWebsiteReportDomainsForArtifact } from "./combined-artifact-readiness";
import { ARTIFACT_CSS } from "./artifact-styles";
import { buildSourceSelectionDiagnosisV1 } from "@open-geo-console/ai-report-engine";

function generativeV3Fixture(){
  const model=combinedV3ArtifactFixture();
  model.combinedReport.answerCards=model.combinedReport.answerCards.map((legacy,index)=>({
    answerMode:"generative_search_v1" as const,questionId:legacy.questionId,exactQuestion:legacy.exactQuestion,status:"answered" as const,
    answerText:`Complete generated answer ${index+1}.`,
    sources:[{sourceId:`source-${index+1}`,title:`Returned source ${index+1}`,canonicalUrl:`https://returned.example/${index+1}`,registrableDomain:"returned.example",citedText:`Returned cited text ${index+1}`,providerResultOrder:index+1,retrievalStatus:"search_source_only" as const,ownershipCategory:"unknown" as const}],
    provenance:{providerId:"mimo",model:"mimo-v2.5-pro",searchMode:"native_web_search",promptVersion:"generative-search-answer-v1" as const,searchedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",answerHash:"a".repeat(64),sourceHash:"b".repeat(64)},refusal:null,
    geoDiagnosis:{...legacy.geoDiagnosis,citedOwnership:{...legacy.geoDiagnosis.citedOwnership,institution:0,community:0,social:0,unknown:1}},audit:{verifiedBodyCount:0,searchSourceOnlyCount:1,inaccessibleCount:0}
  })) as typeof model.combinedReport.answerCards;
  model.combinedReport.sourceSelectionDiagnosis=buildSourceSelectionDiagnosisV1({
    locale:"en",answerHash:"a".repeat(64),sourceHash:"b".repeat(64),targetFoundationHash:"c".repeat(64),targetDomain:"example.com",
    targetPages:[{id:"https://example.com/page",url:"https://example.com/page",title:"V3 Page Title",metaDescription:"V3 page description",h1:["V3 Page H1"],readableTextLength:500,hasJsonLd:true}],
    questions:model.combinedReport.answerCards.map((card)=>card.answerMode==="generative_search_v1"?{questionId:card.questionId,answerText:card.answerText,sources:card.sources.map((source)=>({...source,questionId:card.questionId,auditExcerpt:null}))}:{questionId:card.questionId,answerText:"",sources:[]})
  });
  return model;
}

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

  it("localizes the deterministic provider-discovery limitation for Chinese V3 reports", () => {
    const source = "Missing public evidence does not prove that a provider lacks a capability; evidence-limited entities remain candidates.";

    expect(localizedProviderDiscoveryLimitation("zh-CN", source)).toBe(
      "缺少公开证据并不证明供应商缺乏某项能力；证据有限的实体仍保留为候选。"
    );
    expect(localizedProviderDiscoveryLimitation("en", source)).toBe(source);
  });

  it("repairs legacy translated target-domain suffixes before artifact validation", () => {
    const report = combinedV3ArtifactFixture().combinedReport.technicalFoundation.aiReport;
    report.executiveSummary.overview = "凌顺物流网站（shun-express.英文术语）提供跨境物流服务。";

    expect(restoreWebsiteReportDomainsForArtifact(report, "https://shun-express.com/").executiveSummary.overview)
      .toBe("凌顺物流网站（shun-express.com）提供跨境物流服务。");
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

  it("accepts complete V3 prose after React escapes punctuation in canonical HTML", () => {
    const model = combinedV3ArtifactFixture();
    model.combinedReport.technicalFoundation.aiReport.findings[0]!.recommendation =
      "将标题修正为正确的英文拼写'英文术语'。";
    const html = renderCanonicalCombinedArtifactHtml(model);

    expect(html).toContain("&#x27;英文术语&#x27;");
    expect(() => assertCombinedV3HtmlCompleteness(model.combinedReport, html)).not.toThrow();
  });

  it("requires every generative answer and same-operation source in answer-first canonical HTML",()=>{
    const model=generativeV3Fixture();
    expect(model.combinedReport.sourceSelectionDiagnosis?.version).toBe("source_selection_diagnosis_v1");
    const html=renderCanonicalCombinedArtifactHtml(model);
    expect(()=>assertCombinedV3HtmlCompleteness(model.combinedReport,html)).not.toThrow();
    expect(()=>assertCombinedV3HtmlCompleteness(model.combinedReport,html.replace("Complete generated answer 2.","answer omitted"))).toThrow(/completeness/i);
    expect(()=>assertCombinedV3HtmlCompleteness(model.combinedReport,html.replaceAll("https://returned.example/3","source omitted"))).toThrow(/completeness/i);
    const actionTitle=model.combinedReport.sourceSelectionDiagnosis!.targetActions[0]!.title;
    expect(()=>assertCombinedV3HtmlCompleteness(model.combinedReport,html.replaceAll(actionTitle,"diagnosis action omitted"))).toThrow(/completeness/i);
  });

  it("rejects a generative artifact whose source is moved before its answer",()=>{
    const model=generativeV3Fixture();
    const html=renderCanonicalCombinedArtifactHtml(model);
    const answer="Complete generated answer 1.";
    const source="https://returned.example/1";
    const answerAt=html.indexOf(answer);
    const withoutSource=html.replaceAll(source,"");
    const reordered=withoutSource.slice(0,answerAt)+source+withoutSource.slice(answerAt);
    expect(()=>assertCombinedV3HtmlCompleteness(model.combinedReport,reordered)).toThrow(/answer-first/i);
  });

  it("wraps long returned source URLs on desktop and mobile without horizontal overflow",()=>{
    expect(ARTIFACT_CSS).toMatch(/\.source-url[^}]*overflow-wrap:anywhere[^}]*word-break:break-word/);
    expect(ARTIFACT_CSS).toMatch(/@media\(max-width:760px\)[\s\S]*\.source-url/);
    expect(ARTIFACT_CSS).toContain(".source-content,.source-content a,.generated-answer{max-width:100%;overflow-wrap:anywhere;word-break:break-word}");
  });
});

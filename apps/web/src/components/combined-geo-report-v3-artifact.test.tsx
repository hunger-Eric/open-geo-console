import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { combinedV3ArtifactFixture } from "./combined-artifact-fixtures";
import { CombinedGeoReportV3Artifact } from "./combined-geo-report-v3-artifact";

describe("CombinedGeoReportV3Artifact",()=>{
  it("renders answer-first content in the fixed order with derived adjacent citations",()=>{
    const model=combinedV3ArtifactFixture();
    const first=model.combinedReport.answerCards[0];
    const second={...first.sourceEvidence[0],evidenceId:"v3-evidence-1-b",canonicalUrl:"https://second-source.example/fact",title:"Second source",registrableDomain:"second-source.example",exactExcerpt:"Second exact excerpt"};
    first.sourceEvidence.push(second);
    first.sentences[0]!.evidenceIds.push(second.evidenceId);
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));

    const summaryAt=html.indexOf("data-executive-summary");
    const answersAt=html.indexOf("data-answer-first-section");
    const crossQuestionAt=html.indexOf("data-cross-question-diagnosis");
    const technicalAt=html.indexOf("data-technical-analysis");
    const appendixAt=html.indexOf("data-methodology-appendix");
    expect(summaryAt).toBeGreaterThan(0);
    expect([summaryAt,answersAt,crossQuestionAt,technicalAt,appendixAt]).toEqual([...new Set([summaryAt,answersAt,crossQuestionAt,technicalAt,appendixAt])].sort((a,b)=>a-b));
    expect(html.match(/data-open-geo-answer-card="true"/g)).toHaveLength(3);
    expect(html.indexOf("V3 exact question 1")).toBeLessThan(html.indexOf("V3 exact question 2"));
    expect(html.indexOf("V3 exact question 2")).toBeLessThan(html.indexOf("V3 exact question 3"));
    expect(html).toContain("data-citation-ordinal=\"1\"");
    expect(html).toContain("data-citation-ordinal=\"2\"");
    expect(html).toContain("[1]");
    expect(html).toContain("[2]");
    expect(html).toContain("data-supported-sentence=\"v3-sentence-1\"");
  });

  it("shows complete source and deterministic GEO diagnosis fields",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:combinedV3ArtifactFixture()}));
    for(const value of ["V3 Source 1","v3-source-1.example","https://v3-source-1.example/page","V3 exact source excerpt 1","Third-party editorial","2026-07-15T00:00:00.000Z","V3 grounded answer sentence 1.","V3 missing evidence 1","V3 retest question 1"]){
      expect(html).toContain(value);
    }
    expect(html).toContain("V3 technical finding");
    expect(html).toContain("V3 Page Title");
    expect(html).toContain("/api/reports/report/evidence/asset-1");
  });

  it("uses GEO-only customer language and exposes no customer PDF surface or external-platform attribution",()=>{
    const visible=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:combinedV3ArtifactFixture()})).replace(/<[^>]+>/g," ");
    expect(visible).toContain("Open GEO generated answer");
    expect(visible).not.toMatch(/\bSEO\b|ChatGPT|Gemini|Kimi|Doubao|豆包|\.pdf\b|download pdf|print report|PDF 下载|打印报告/i);
  });

  it("renders all three unresolved questions with explicit nonblank conclusions",()=>{
    const model=combinedV3ArtifactFixture();
    model.combinedReport.answerCards=model.combinedReport.answerCards.map((card,index)=>({
      ...card,
      status:"unresolved" as const,
      sourceEvidence:[],
      sentences:[{
        sentenceId:`unresolved-${index + 1}`,
        kind:"scope_note" as const,
        text:`Search returned results for question ${index + 1}, but the page text could not yet be verified.`,
        evidenceIds:[]
      }]
    })) as typeof model.combinedReport.answerCards;
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html.match(/data-open-geo-answer-card="true"/g)).toHaveLength(3);
    expect(html.match(/data-answer-sentence="unresolved-/g)).toHaveLength(3);
    expect(html.match(/Not yet verifiable/g)).toHaveLength(3);
    for(let index=1;index<=3;index+=1)expect(html).toContain(`Search returned results for question ${index}`);
  });

  it("uses the saved Chinese locale for the Open GEO answer label",()=>{
    const model=combinedV3ArtifactFixture();
    model.locale="zh";
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html).toContain("Open GEO 生成式答案");
    expect(html).toContain("完整技术分析");
  });
});

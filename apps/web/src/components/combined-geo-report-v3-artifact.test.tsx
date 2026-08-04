import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSourceSelectionDiagnosisV1 } from "@open-geo-console/ai-report-engine";
import { ARTIFACT_CSS } from "@/report/artifact-styles";
import { combinedV3ArtifactFixture } from "./combined-artifact-fixtures";
import { CombinedGeoReportV3Artifact } from "./combined-geo-report-v3-artifact";

function generativeModel() {
  const model=combinedV3ArtifactFixture();
  model.locale="zh";
  model.combinedReport.answerCards=model.combinedReport.answerCards.map((legacy,index)=>({
    answerMode:"generative_search_v1" as const,
    questionId:legacy.questionId,
    exactQuestion:legacy.exactQuestion,
    status:"answered" as const,
    answerText:`服务商甲提供跨境海运方案 ${index+1}。`,
    sources:[{
      sourceId:`generated-source-${index+1}`,
      title:`服务商甲来源 ${index+1}`,
      canonicalUrl:`https://provider.example/services/${index+1}`,
      registrableDomain:"provider.example",
      citedText:`跨境海运服务 ${index+1}`,
      providerResultOrder:index+1,
      retrievalStatus:(["verified_body","search_source_only","inaccessible"] as const)[index]!,
      ownershipCategory:"unknown" as const
    }],
    provenance:{providerId:"mimo",model:"mimo-v2.5-pro",searchMode:"native_web_search",promptVersion:"generative-search-answer-v1" as const,searchedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",answerHash:"a".repeat(64),sourceHash:"b".repeat(64)},
    refusal:null,
    geoDiagnosis:{...legacy.geoDiagnosis,citedOwnership:{...legacy.geoDiagnosis.citedOwnership,institution:0,community:0,social:0,unknown:1}},
    audit:{verifiedBodyCount:index===0?1:0,searchSourceOnlyCount:index===1?1:0,inaccessibleCount:index===2?1:0},
    diagnosis:{
      selectionSummary:`本题来源与目标页诊断摘要 ${index+1}`,
      observableFactors:[
        {kind:"problem_match",observation:`本题因素 A${index+1}`,evidenceRefs:[`generated-source-${index+1}`]},
        {kind:"factual_specificity",observation:`本题因素 B${index+1}`,evidenceRefs:[`generated-source-${index+1}`]},
        {kind:"target_clarity",observation:`本题因素 C${index+1}`,evidenceRefs:[`${legacy.questionId}:target:${"c".repeat(64)}`]}
      ],
      targetGap:`目标官网差距 ${index+1}`,
      recommendedActions:[
        {priority:1 as const,action:`本题行动一 ${index+1}`,evidenceRefs:[`${legacy.questionId}:target:${"c".repeat(64)}`]},
        {priority:2 as const,action:`本题行动二 ${index+1}`,evidenceRefs:[`generated-source-${index+1}`]},
        {priority:3 as const,action:`本题行动三 ${index+1}`,evidenceRefs:[`${legacy.questionId}:target:${"c".repeat(64)}`]}
      ],
      detailedEvidenceRefs:[`generated-source-${index+1}`,`${legacy.questionId}:target:${"c".repeat(64)}`]
    }
  })) as typeof model.combinedReport.answerCards;
  model.combinedReport.sourceSelectionDiagnosis=buildSourceSelectionDiagnosisV1({
    locale:"zh",answerHash:model.combinedReport.engineProvenance.answerHash,sourceHash:model.combinedReport.engineProvenance.evidenceHash,targetFoundationHash:"d".repeat(64),targetDomain:"example.com",
    targetPages:[{id:"target-page",url:"https://example.com/page",title:"目标品牌",metaDescription:"跨境海运服务",h1:["目标品牌"],readableTextLength:500,hasJsonLd:true}],
    questions:model.combinedReport.answerCards.map((card)=>card.answerMode==="generative_search_v1"?{
      questionId:card.questionId,answerText:card.answerText,sources:card.sources.map((source)=>({...source,questionId:card.questionId,auditExcerpt:source.retrievalStatus==="verified_body"?source.citedText:null}))
    }:{questionId:card.questionId,answerText:"",sources:[]})
  });
  return model;
}

function articleModel() {
  const model=generativeModel();
  model.combinedReport.geoArticleExample={
    version:"geo_article_example_v1",
    generationMode:"model",
    targetQuestionIds:model.combinedReport.answerCards.map(({questionId})=>questionId),
    title:"目标品牌跨境物流选择指南",
    introduction:"目标品牌公开了跨境物流服务范围、适用客户与采购核验信息。",
    sections:[
      {id:"facts",heading:"先确认服务范围",paragraphs:["说明公开服务、客户与覆盖区域。"]},
      {id:"proof",heading:"再连接可核验证据",paragraphs:["把关键结论连接到服务页、案例和流程。"]}
    ],
    faq:[{question:"采购前先核对什么？",answer:"先核对服务范围、限制与公开证据。"}],
    rationale:[
      {sectionId:"facts",reason:"先建立网站事实，避免结论脱离实际业务。",evidenceRefs:[`question:${model.combinedReport.answerCards[0]!.questionId}`]},
      {sectionId:"proof",reason:"解释答案为什么成立以及如何复核。",evidenceRefs:[`question:${model.combinedReport.answerCards[1]!.questionId}`]}
    ]
  };
  return model;
}

describe("CombinedGeoReportV3Artifact",()=>{
  it("renders website context before answers, diagnosis, technical evidence, actions, and methodology",()=>{
    const model=combinedV3ArtifactFixture();
    const first=model.combinedReport.answerCards[0];
    const second={...first.sourceEvidence[0],evidenceId:"v3-evidence-1-b",canonicalUrl:"https://second-source.example/fact",title:"Second source",registrableDomain:"second-source.example",exactExcerpt:"Second exact excerpt"};
    first.sourceEvidence.push(second);
    first.sentences[0]!.evidenceIds.push(second.evidenceId);
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));

    const contextAt=html.indexOf("data-website-context");
    const answersAt=html.indexOf("data-answer-first-section");
    const crossQuestionAt=html.indexOf("data-cross-question-diagnosis");
    const technicalAt=html.indexOf("data-technical-analysis");
    const actionsAt=html.indexOf("data-unified-actions");
    const appendixAt=html.indexOf("data-methodology-appendix");
    expect(contextAt).toBeGreaterThan(0);
    expect([contextAt,answersAt,crossQuestionAt,technicalAt,actionsAt,appendixAt]).toEqual([...new Set([contextAt,answersAt,crossQuestionAt,technicalAt,actionsAt,appendixAt])].sort((a,b)=>a-b));
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
    for(const value of ["V3 Source 1","v3-source-1.example","https://v3-source-1.example/page","V3 exact source excerpt 1","Third-party editorial",new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date("2026-07-15T00:00:00.000Z")),"V3 grounded answer sentence 1.","V3 missing evidence 1","V3 retest question 1"]){
      expect(html).toContain(value);
    }
    expect(html).toContain("V3 technical finding");
    expect(html).toContain("V3 Page Title");
    expect(html).toContain("/api/reports/report/evidence/asset-1");
    expect(html).toContain("/api/reports/report/evidence/asset-2");
    expect(html).toContain("Technical proof quote");
    expect(html).toContain("Second technical proof quote");
    expect(html).toContain("https://example.com/technical-proof");
    expect(html).toContain("https://example.com/second-technical-proof");
  });

  it("renders the 00-08 report rail with native progressive disclosure",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:articleModel()}));
    expect(html).toContain('class="artifact-toc"');
    expect(html).toContain('href="#artifact-sec-context"');
    expect(html).toContain('href="#artifact-sec-answers"');
    expect(html).toContain('href="#artifact-sec-evidence"');
    expect(html).toContain('href="#artifact-sec-absence"');
    expect(html).toContain('href="#artifact-sec-article"');
    expect(html).toContain('href="#artifact-sec-appendix"');
    const sections=["artifact-sec-guide","artifact-sec-context","artifact-sec-answers","artifact-sec-evidence","artifact-sec-absence","artifact-sec-technical","artifact-sec-actions","artifact-sec-article","artifact-sec-appendix"].map((id)=>html.indexOf(`id="${id}"`));
    expect(sections).toEqual([...sections].sort((a,b)=>a-b));
    expect(html.match(/data-question-summary=/g)).toHaveLength(3);
    expect(html.match(/<details class="answer-card answer-detail"/g)).toHaveLength(3);
    expect(html.match(/data-evidence-detail=/g)).toHaveLength(3);
    expect(html.match(/data-question-absence=/g)).toHaveLength(3);
    expect(html).toContain('data-source-diagnosis-detail="true"');
    expect(html).toContain('data-technical-detail="true"');
    expect(html).not.toContain('data-fold="open"');
    expect(html).not.toContain('data-fold="close"');
    expect(html).toContain('class="artifact-to-top"');
    expect(html).toContain('id="artifact-sec-context"');
  });

  it("leads with persisted conclusions and removes fixed reading instructions from the main report",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:articleModel()}));
    for(const value of ["核心结论","决策结论","第一优先行动","关键决策指标","技术得分"]){
      expect(html).toContain(value);
    }
    for(const value of ["报告目的","报告一句话","基于以上网站公开信息","先看 AI 对每个买家问题","答案不是凭空生成的","必须沿着答案和来源逐题解释","以下路线图汇总"]){
      expect(html).not.toContain(value);
    }
  });

  it("uses GEO-only customer language and exposes no customer PDF surface or external-platform attribution",()=>{
    const visible=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:combinedV3ArtifactFixture()})).replace(/<[^>]+>/g," ");
    expect(visible).toContain("Open GEO");
    expect(visible).toContain("Decision-ready reporting");
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
    expect(html.match(/Not yet verifiable/g)).toHaveLength(6);
    expect(html.match(/data-question-summary=/g)).toHaveLength(3);
    for(let index=1;index<=3;index+=1)expect(html).toContain(`Search returned results for question ${index}`);
  });

  it("uses the saved Chinese locale for the Open GEO answer label",()=>{
    const model=combinedV3ArtifactFixture();
    model.locale="zh";
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html).toContain("帮你决策的报告");
    expect(html).toContain("网站可见性与技术诊断");
  });

  it("renders each complete generative answer before the sources returned by the same operation",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:generativeModel()}));
    expect(html.indexOf("服务商甲提供跨境海运方案 1")).toBeLessThan(html.indexOf("provider.example/services/1"));
    expect(html).toContain("正文已独立核验");
    expect(html).toContain("仅模型搜索来源");
    expect(html).toContain("当前无法访问");
    expect(html).toContain("网站可见性与技术诊断");
    expect(html).not.toMatch(/report\.pdf|Print \/ PDF|打印 \/ PDF/);
    expect(html.indexOf("data-answer-audit")).toBeGreaterThan(html.indexOf("服务商甲提供跨境海运方案 3"));
  });

  it("nests each answer, its sources, and its three-factor diagnosis in that order",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:generativeModel()}));
    expect(html.match(/data-question-diagnosis="true"/g)).toHaveLength(3);
    for(let index=1;index<=3;index+=1){
      const questionId=`public-question-${index}`;
      const answerAt=html.indexOf(`data-generative-answer="${questionId}"`);
      const sourceAt=html.indexOf(`data-generative-sources="${questionId}"`);
      const diagnosisAt=html.indexOf(`data-question-absence="${questionId}"`);
      expect(answerAt).toBeGreaterThan(0);
      expect(answerAt).toBeLessThan(sourceAt);
      expect(sourceAt).toBeLessThan(diagnosisAt);
      for(const value of [`本题因素 A${index}`,`本题因素 B${index}`,`本题因素 C${index}`,`目标官网差距 ${index}`,`本题行动一 ${index}`,`本题行动二 ${index}`,`本题行动三 ${index}`]) expect(html).toContain(value);
    }
    expect(html.indexOf("data-source-selection-diagnosis")).toBeGreaterThan(html.indexOf("本题来源与目标页诊断摘要 3"));
  });

  it("derives a decision layer, labeled evidence coverage, semantic scores, and print-safe disclosure",()=>{
    const model=generativeModel();
    model.combinedReport.technicalFoundation.aiReport.dimensionScores=[{dimension:"organizationClarity",score:42,explanation:"Persisted score explanation"}];
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html.indexOf('data-decision-summary="true"')).toBeLessThan(html.indexOf('data-website-context="true"'));
    expect(html.match(/data-question-summary=/g)).toHaveLength(3);
    expect(html).toContain('<dd>1</dd><\/div><div><dt>回答来源<\/dt><dd>3</dd>');
    expect(html).toContain('<meter min="0" max="100" value="42">42/100</meter>');
    expect(html).toContain("企业表达清晰度");
    expect(html).not.toContain("<h4>organizationClarity</h4>");
    expect(html).not.toContain("<th>核验状态</th>");
    for(const value of ["已独立核验","仅搜索来源","当前不可访问"])expect(html).toContain(value);
    expect(ARTIFACT_CSS).not.toContain('.paid-report-template .artifact-toc a:first-child');
    expect(ARTIFACT_CSS).toContain('.paid-report-template .answer-detail:not([open])');
    expect(ARTIFACT_CSS).toContain('.paid-report-template .technical-score-summary meter');
    expect(ARTIFACT_CSS).toContain('.paid-report-template .roadmap-phase:not([open])>.roadmap-phase-body');
  });

  it("presents the roadmap as one numbered why-to-how analysis chain",()=>{
    const model=generativeModel();
    model.combinedReport.technicalFoundation.aiReport.roadmap.immediate=[{title:"先统一事实",rationale:"先消除相互矛盾的信息。",actions:["统一页面数据"],relatedFindingIds:[]}];
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html.match(/class="roadmap-phase"/g)).toHaveLength(3);
    expect(html.match(/class="roadmap-phase"[^>]* open=""/g)).toHaveLength(1);
    expect(html).toContain('data-roadmap-flow="true"');
    expect(html).toContain('data-roadmap-action="1.1"');
    expect(html).toContain("为什么要做");
    expect(html).toContain("具体怎么做");
    expect(html.indexOf('data-roadmap-phase="immediate"')).toBeLessThan(html.indexOf('data-roadmap-phase="nextPhase"'));
    expect(html.indexOf('data-roadmap-phase="nextPhase"')).toBeLessThan(html.indexOf('data-roadmap-phase="ongoing"'));
  });
  it("replaces the legacy counters with the source-centric diagnosis for prospective V3 reports",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:generativeModel()}));
    const diagnosisAt=html.indexOf("data-source-selection-diagnosis");
    const technicalAt=html.indexOf("data-technical-analysis");
    expect(diagnosisAt).toBeGreaterThan(0);
    expect(diagnosisAt).toBeLessThan(technicalAt);
    expect(html).toContain("来源选择诊断");
    expect(html).toContain("provider.example");
    expect(html).toContain("为答案贡献了什么");
    expect(html).toContain("可观察入选因素");
    expect(html).not.toContain("data-cross-question-diagnosis");
  });

  it("renders Direct analyses while preserving the complete technical report and screenshots",()=>{
    const model=generativeModel();
    model.locale="en";
    model.combinedReport.technicalFoundation.aiReport.dimensionScores=[{dimension:"organizationClarity",score:42,explanation:"Persisted score explanation"}];
    model.combinedReport.directSemantics={
      version:"free-v4-direct-semantics-v1",
      questions:model.combinedReport.answerCards.map((card,index)=>index===2
        ? {questionId:card.questionId,answerCardHash:"a".repeat(64),answerCardReceipt:{} as never,analysisStatus:"incomplete" as const,coreReceipt:{} as never}
        : {questionId:card.questionId,answerCardHash:"a".repeat(64),answerCardReceipt:{} as never,analysisStatus:"completed" as const,coreReceipt:{} as never,
          analysis:{summary:`Direct summary ${index+1}`,observations:[`Direct observation ${index+1}`],recommendations:[`Direct recommendation ${index+1}`],evidenceHandles:[]},
          handleBindings:[],analysisReceipt:{} as never}) as never
    };
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html).toContain("Direct summary 1");
    expect(html).toContain("Direct observation 2");
    expect(html).toContain("available public evidence does not support a reliable source-gap conclusion");
    expect(html.match(/data-direct-analysis-status=/g)).toHaveLength(3);
    expect(html).toContain("V3 technical finding");
    expect(html).toContain("V3 Page Title");
    expect(html).toContain("/api/reports/report/evidence/asset-1");
    expect(html).toContain("/api/reports/report/evidence/asset-2");
    expect(html.match(/data-evidence-asset=/g)).toHaveLength(2);
    expect(html).not.toContain("Target mentioned");
    expect(html).toContain("Organization clarity");
    expect(html).not.toContain("<h4>organizationClarity</h4>");
    expect(html).not.toContain("<th>Verification</th>");
  });

  it("renders source-limited answers and typed refusals without turning audit failures into answer copy",()=>{
    const model=generativeModel();
    const sourceLimited=model.combinedReport.answerCards[1]!;
    const refused=model.combinedReport.answerCards[2]!;
    if(sourceLimited.answerMode!=="generative_search_v1"||refused.answerMode!=="generative_search_v1")throw new TypeError("generative fixture mismatch");
    model.combinedReport.answerCards[1]={...sourceLimited,status:"source_limited",sources:[],audit:{verifiedBodyCount:0,searchSourceOnlyCount:0,inaccessibleCount:0}};
    model.combinedReport.answerCards[2]={...refused,status:"refused",answerText:"",sources:[],refusal:{code:"policy_refusal",reason:"该请求涉及受限制的高风险操作。"},audit:{verifiedBodyCount:0,searchSourceOnlyCount:0,inaccessibleCount:0}};
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    expect(html).toContain("服务商甲提供跨境海运方案 2");
    expect(html).toContain("同次回答没有可安全展示的公开来源");
    expect(html).toContain("该请求涉及受限制的高风险操作。");
    expect(html).not.toContain("当前可核验正文仍不足");
  });

  it("maps customer-visible zero-based provider references to displayed source ordinals",()=>{
    const model=generativeModel();
    const first=model.combinedReport.answerCards[0]!;
    if(first.answerMode!=="generative_search_v1")throw new TypeError("generative fixture mismatch");
    first.answerText="服务商甲提供跨境海运方案（来源0）。";
    first.sources[0]!.providerResultOrder=0;
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model}));
    const visible=html.replace(/<[^>]+>/g," ");
    expect(visible).toContain("服务商甲提供跨境海运方案（[1]）。");
    expect(visible).not.toContain("来源0");
    expect(first.answerText).toContain("来源0");
  });

  it("renders the paid GEO article and its rationale after the unified action plan",()=>{
    const html=renderToStaticMarkup(createElement(CombinedGeoReportV3Artifact,{model:articleModel()}));
    const actionsAt=html.indexOf("data-unified-actions");
    const articleAt=html.indexOf("data-geo-article-generation-mode=\"model\"");
    const faqAt=html.indexOf("采购前先核对什么？");
    const strategyAt=html.indexOf("data-article-writing-strategy");
    const appendixAt=html.indexOf("data-methodology-appendix");
    expect(actionsAt).toBeGreaterThan(0);
    expect(actionsAt).toBeLessThan(articleAt);
    expect(articleAt).toBeLessThan(faqAt);
    expect(faqAt).toBeLessThan(strategyAt);
    expect(strategyAt).toBeLessThan(appendixAt);
    for(const value of ["目标品牌跨境物流选择指南","先确认服务范围","写作策略与证据依据","先建立网站事实","采购前先核对什么？"]){
      expect(html).toContain(value);
    }
    expect(html.indexOf("文章生成方式")).toBeGreaterThan(appendixAt);
    expect(html.match(/data-open-geo-answer-card="true"/g)).toHaveLength(3);
  });
});

import type { CombinedPrivateReportArtifactModel, CombinedPrivateReportArtifactModelV3 } from "@/report/artifact-model";
import type { CombinedGeoReportV3 } from "@open-geo-console/ai-report-engine";

export function combinedArtifactFixture(): CombinedPrivateReportArtifactModel {
  const purposes = ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const;
  const publicQuestions = purposes.map((purpose, index) => ({ id: `public-question-${index + 1}`, purpose, normalizedText: `Neutral public query ${index + 1}` }));
  const evidence = publicQuestions.flatMap((question, index) => ["a", "b"].map((suffix) => ({
    evidenceId: `evidence-${index + 1}-${suffix}`, canonicalUrl: `https://source-${index + 1}-${suffix}.example/fact`, registrableDomain: `source-${index + 1}-${suffix}.example`,
    grade: "B", verifiedExcerpt: `SENTINEL_EXCERPT_${index + 1}_${suffix}`, queryVariantIds: [`query-${index + 1}-${suffix}`]
  })));
  return {
    productContract: "combined_geo_report_v1", reportId: "report", locale: "en", artifactRevisionId: "artifact", pdfStorageKey: "reports/report.pdf",
    evidenceAssets: [
      { id: "asset-1", findingId: "technical-finding", citationIndex: 0, status: "ready" },
      { id: "asset-2", findingId: "technical-finding", citationIndex: 1, status: "ready" }
    ],
    technicalReport: { score: 80, findings: [], pages: [], machineReadableAssets: {} },
    combinedReport: {
      artifactContract: "combined_geo_report_v1", artifactRevision: 1, targetUrl: "https://example.com/", evidenceCutoffAt: "2026-07-14T00:00:00.000Z",
      technicalFoundation: {
        technicalReport: { score: 80, findings: [], pages: [], machineReadableAssets: {} },
        aiReport: { organizationProfile: { organizationName: "Example" }, executiveSummary: { overview: "Overview" }, dimensionScores: [],
          findings: [{ id: "technical-finding", title: "Technical finding", severity: "high", impact: "Impact", recommendation: "Fix it", evidence: [
            { quote: "Technical proof quote", url: "https://example.com/technical-proof" },
            { quote: "Second technical proof quote", url: "https://example.com/second-technical-proof" }
          ] }],
          pageTypeAnalyses: [], coverage: { limitations: [] }, roadmap: { immediate: [], nextPhase: [], ongoing: [] } }
      },
      businessQuestionSet: { questions: purposes.map((purpose, index) => ({ purpose, privateText: `Business question ${index + 1}` })) },
      businessQuestionAnswers: { version: "combined-business-question-answers-v1", synthesis: { mode: "evidence_constrained_model", modelId: "fixture", inputHash: "hash" },
        answers: publicQuestions.map((question, index) => ({ questionId: question.id, purpose: question.purpose, answer: `Direct grounded answer ${index + 1}.`, sourceEvidenceIds: [`evidence-${index + 1}-a`, `evidence-${index + 1}-b`] })) },
      publicSourceForensics: { questions: { questions: publicQuestions }, fanouts: publicQuestions.map((question, index) => ({ questionId: question.id, queries: [{ id: `query-${index + 1}-a` }, { id: `query-${index + 1}-b` }] })),
        sourceGraph: { evidence }, snapshotRefs: publicQuestions.map((question, index) => ({ questionId: question.id, snapshotId: `snapshot-${index + 1}`, freshness: "fresh", observedAt: "2026-07-14T00:00:00.000Z" })),
        coverage: { status: "complete", completedQueryCount: 6, expectedQueryCount: 6 }, limitations: [] },
      vendorTaskPackage: { tasks: [] }, methodology: { technicalCoverage: "full", publicSearchSurface: "test", evidenceFreshness: "fresh", limitations: [] }
    }
  } as unknown as CombinedPrivateReportArtifactModel;
}

export function combinedV3ArtifactFixture(): CombinedPrivateReportArtifactModelV3 {
  const base = combinedArtifactFixture();
  if(base.productContract!=="combined_geo_report_v1")throw new TypeError("Fixture base contract mismatch.");
  const questions = [1, 2, 3].map((index) => ({ purpose: ["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"][index - 1], privateText: `V3 exact question ${index}` }));
  const answerCards = [1, 2, 3].map((index) => ({
    questionId: `public-question-${index}`, exactQuestion: `V3 exact question ${index}`, status: "answered",
    sentences: [{ sentenceId: `v3-sentence-${index}`, kind: "grounded_claim", text: `V3 grounded answer sentence ${index}.`, evidenceIds: [`v3-evidence-${index}`], confidence: "verified" }],
    sourceEvidence: [{ evidenceId: `v3-evidence-${index}`, questionId: `public-question-${index}`, subjectKey: "example", canonicalUrl: `https://v3-source-${index}.example/page`, title: `V3 Source ${index}`, registrableDomain: `v3-source-${index}.example`, ownershipCategory: "third_party_editorial", exactExcerpt: `V3 exact source excerpt ${index}`, observedAt: "2026-07-15T00:00:00.000Z", eligible: true, direct: true }],
    coverage: { plannedQueries: 1, completedQueries: 1, returnedResults: 1, attemptedRetrievals: 1, safelyRetrievedPages: 1, eligibleDirectEvidence: 1, reasons: [] },
    geoDiagnosis: { targetMentioned: true, targetFirstSentence: 1, targetRoles: ["answer subject"], competitorEntityIds: [], citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 1, directory: 0, government: 0, other: 0 }, missingEvidenceFamilies: [`V3 missing evidence ${index}`], retestQuestion: `V3 retest question ${index}` }
  }));
  return { ...base, productContract: "combined_geo_report_v3", artifactRevisionId: "artifact-v3", combinedReport: {
    ...base.combinedReport, version: 3, artifactContract: "combined_geo_report_v3", artifactRevisionId: "artifact-v3", artifactRevision: 3,
    presentationTerminologyPolicy: "geo_v1", businessQuestionSet: { ...base.combinedReport.businessQuestionSet, questions }, answerCards,
    engineProvenance: { engineId: "open_geo_public_search_answer_v1", searchSurface: "test/v1", queryPlanVersion: "v1", passageSelectorVersion: "v1", synthesisModel: "fixture", synthesisPromptVersion: "v1", locale: "en", region: "US", searchedAt: "2026-07-15T00:00:00.000Z", evidenceCutoffAt: "2026-07-15T00:00:00.000Z", synthesizedAt: "2026-07-15T00:00:00.000Z", inputHash: "a".repeat(64), evidenceHash: "b".repeat(64), answerHash: "c".repeat(64) },
    technicalFoundation: { ...base.combinedReport.technicalFoundation, technicalReport: { score: 72, machineReadableAssets: {}, findings: [{ id: "v3-tech", severity: "warning", title: "V3 technical finding", description: "V3 technical description", recommendation: "V3 technical recommendation" }], pages: [{ url: "https://example.com/page", status: 200, title: "V3 Page Title", metaDescription: "V3 page description", h1: ["V3 Page H1"], h2: [], canonical: "https://example.com/page", hasOpenGraph: true, hasJsonLd: true, readableTextLength: 500, internalLinks: 2 }] } }
  } } as unknown as CombinedPrivateReportArtifactModelV3;
}

export function combinedV3ArticleArtifactFixture(): CombinedPrivateReportArtifactModelV3 {
  const model={...combinedV3ArtifactFixture(),locale:"zh" as const};
  const report=model.combinedReport as CombinedGeoReportV3,questionId=report.answerCards[0]!.questionId,sourceRef="source:v3-evidence-1",questionRef=`question:${questionId}`;
  report.geoArticleExample={version:"geo_article_deliverable_v2",kind:"article",primaryQuestionId:questionId,article:{
    title:"企业选择跨境物流服务时应核对哪些能力",
    introduction:{text:"先确认运输范围、异常处理和交付边界，再用公开材料核对每项承诺。",evidenceRefs:[sourceRef]},
    sections:[
      {id:"scenario",heading:"从实际运输场景开始",paragraphs:[{text:"明确货类、路线与时效要求，才能判断方案是否适用。",evidenceRefs:[questionRef]}]},
      {id:"criteria",heading:"把服务能力变成判断标准",paragraphs:[{text:"逐项比较服务范围、异常响应和人工复核边界。",evidenceRefs:[sourceRef]}]},
      {id:"verification",heading:"最后核对公开证据",paragraphs:[{text:"重要结论应当能够回到公开服务页、流程或案例复核。",evidenceRefs:[sourceRef]}]}
    ],faq:[
      {question:"采购前先核对什么？",answer:{text:"先核对服务范围、限制与公开证据。",evidenceRefs:[sourceRef]}},
      {question:"哪些异常需要人工处理？",answer:{text:"签约前确认异常升级路径和人工复核责任。",evidenceRefs:[questionRef]}}
    ]},explanation:articleExplanation(questionRef,sourceRef)};
  return model;
}

export function combinedV3OutlineArtifactFixture(): CombinedPrivateReportArtifactModelV3 {
  const model={...combinedV3ArtifactFixture(),locale:"zh" as const};
  const report=model.combinedReport as CombinedGeoReportV3,questionId=report.answerCards[0]!.questionId,sourceRef="source:v3-evidence-1",questionRef=`question:${questionId}`;
  report.geoArticleExample={version:"geo_article_deliverable_v2",kind:"outline",primaryQuestionId:questionId,fallbackReason:"provider_error",outline:{
    workingTitle:"企业选择跨境物流服务时应核对哪些能力",readerQuestion:"如何选择适合的跨境物流服务？",directAnswer:"当前只能形成初步判断，仍需核对服务边界和公开证据。",
    plannedSections:[
      {id:"scenario",heading:"先说明业务场景",purpose:"明确货类、路线和时效要求。",evidenceRefs:[questionRef]},
      {id:"criteria",heading:"再列出判断标准",purpose:"比较服务范围、异常处理和交付边界。",evidenceRefs:[sourceRef]},
      {id:"verification",heading:"最后给出核验清单",purpose:"连接可访问的服务页、流程和案例。",evidenceRefs:[sourceRef]}
    ],evidenceToAdd:["补充公开案例与适用限制。"],faqAngles:["采购前先核对什么？","哪些异常需要人工复核？"]},explanation:articleExplanation(questionRef,sourceRef)};
  return model;
}

function articleExplanation(questionRef:string,sourceRef:string){return [
  {elementId:"title",heading:"标题设计",reason:"直接对应买家的选择问题。",geoFunction:"锁定单一搜索意图。",evidenceRefs:[questionRef]},
  {elementId:"introduction",heading:"答案前置",reason:"先给出可执行判断。",geoFunction:"便于提取核心答案。",evidenceRefs:[sourceRef]},
  {elementId:"section:scenario",heading:"业务场景",reason:"先确定适用条件。",geoFunction:"建立语义上下文。",evidenceRefs:[questionRef]},
  {elementId:"section:criteria",heading:"判断标准",reason:"把选择拆成可比较维度。",geoFunction:"形成明确决策实体。",evidenceRefs:[sourceRef]},
  {elementId:"section:verification",heading:"证据核验",reason:"连接结论与公开材料。",geoFunction:"提高可验证性。",evidenceRefs:[sourceRef]},
  {elementId:"faq",heading:"相关问题",reason:"补充相邻采购意图。",geoFunction:"扩展相关问法。",evidenceRefs:[questionRef]}
];}

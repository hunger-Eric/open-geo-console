import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readinessGuardHarness = vi.hoisted(() => {
  const state = {
    blockedSite: null as string | null,
    guardSites: [] as string[],
    delegatedSites: [] as string[]
  };
  const blocked = new Error("blocked by Report V4 readiness test guard");
  return {
    state,
    blocked,
    run: vi.fn(async (input: { guardSite: string; delegate: () => Promise<unknown> }) => {
      state.guardSites.push(input.guardSite);
      if (state.blockedSite === input.guardSite) throw blocked;
      state.delegatedSites.push(input.guardSite);
      return input.delegate();
    })
  };
});

const readinessSideEffects = vi.hoisted(() => ({
  exportPdf: vi.fn(async () => Buffer.from(`%PDF-\n${"/Type /Page\n".repeat(5)}`)),
  storage: {
    get: vi.fn(async () => ({ body: Buffer.from("image"), contentType: "image/png" })),
    put: vi.fn(async () => undefined)
  }
}));

vi.mock("@/report-v4/prohibited-operation-guard-runtime", () => ({
  runReportV4GuardedOperation: readinessGuardHarness.run
}));
vi.mock("./pdf-export", () => ({
  exportCanonicalArtifactHtmlPdf: readinessSideEffects.exportPdf
}));
vi.mock("@/evidence/storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/evidence/storage")>(),
  createEvidenceStorage: () => readinessSideEffects.storage
}));
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { combinedArtifactFixture, combinedV3ArtifactFixture } from "@/components/combined-artifact-fixtures";
import { createTestSourceForensicReport } from "@/public-source-forensics/testing";
import {
  assertCombinedV3HtmlCompleteness,
  buildReadyCombinedArtifactV3,
  combinedArtifactSystemCopy,
  localizedProviderDiscoveryLimitation,
  materializeReadyArtifact,
  prepareCombinedGeoReportV3,
  renderCanonicalCombinedArtifactHtml,
  restoreWebsiteReportDomainsForArtifact,
  type PrepareCombinedGeoReportV3Input
} from "./combined-artifact-readiness";
import { ARTIFACT_CSS } from "./artifact-styles";
import { buildSourceSelectionDiagnosisV1 } from "@open-geo-console/ai-report-engine";
import { toCanonicalBuyerQuestionSet, type ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";

beforeEach(() => {
  readinessGuardHarness.state.blockedSite = null;
  readinessGuardHarness.state.guardSites.length = 0;
  readinessGuardHarness.state.delegatedSites.length = 0;
  readinessGuardHarness.run.mockClear();
  readinessSideEffects.exportPdf.mockClear();
  readinessSideEffects.storage.get.mockClear();
  readinessSideEffects.storage.put.mockClear();
});

function generativeV3Fixture(){
  const model=combinedV3ArtifactFixture();
  model.combinedReport.answerCards=model.combinedReport.answerCards.map((legacy,index)=>({
    answerMode:"generative_search_v1" as const,questionId:legacy.questionId,exactQuestion:legacy.exactQuestion,status:"answered" as const,
    answerText:`Complete generated answer ${index+1}.`,
    sources:[{sourceId:`source-${index+1}`,title:`Returned source ${index+1}`,canonicalUrl:`https://returned.example/${index+1}`,registrableDomain:"returned.example",citedText:`Returned cited text ${index+1}`,providerResultOrder:index+1,retrievalStatus:"search_source_only" as const,ownershipCategory:"unknown" as const}],
    provenance:{providerId:"mimo",model:"mimo-v2.5-pro",searchMode:"native_web_search",promptVersion:"generative-search-answer-v1" as const,searchedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",answerHash:"a".repeat(64),sourceHash:"b".repeat(64)},refusal:null,
    geoDiagnosis:{...legacy.geoDiagnosis,citedOwnership:{...legacy.geoDiagnosis.citedOwnership,institution:0,community:0,social:0,unknown:1}},audit:{verifiedBodyCount:0,searchSourceOnlyCount:1,inaccessibleCount:0},
    diagnosis:{
      selectionSummary:`Question diagnosis ${index+1}.`,
      observableFactors:[
        {kind:"problem_match",observation:`Observable problem match ${index+1}.`,evidenceRefs:[`source-${index+1}`]},
        {kind:"factual_specificity",observation:`Observable specificity ${index+1}.`,evidenceRefs:[`source-${index+1}`]},
        {kind:"target_clarity",observation:`Observable target gap ${index+1}.`,evidenceRefs:[`${legacy.questionId}:target:${"c".repeat(64)}`]}
      ],
      targetGap:`Target website gap ${index+1}.`,
      recommendedActions:[
        {priority:1 as const,action:`Publish action ${index+1}.`,evidenceRefs:[`${legacy.questionId}:target:${"c".repeat(64)}`]},
        {priority:2 as const,action:`Clarify action ${index+1}.`,evidenceRefs:[`source-${index+1}`]},
        {priority:3 as const,action:`Maintain action ${index+1}.`,evidenceRefs:[`${legacy.questionId}:target:${"c".repeat(64)}`]}
      ],
      detailedEvidenceRefs:[`source-${index+1}`,`${legacy.questionId}:target:${"c".repeat(64)}`]
    }
  })) as typeof model.combinedReport.answerCards;
  model.combinedReport.sourceSelectionDiagnosis=buildSourceSelectionDiagnosisV1({
    locale:"en",answerHash:"a".repeat(64),sourceHash:"b".repeat(64),targetFoundationHash:"c".repeat(64),targetDomain:"example.com",
    targetPages:[{id:"https://example.com/page",url:"https://example.com/page",title:"V3 Page Title",metaDescription:"V3 page description",h1:["V3 Page H1"],readableTextLength:500,hasJsonLd:true}],
    questions:model.combinedReport.answerCards.map((card)=>card.answerMode==="generative_search_v1"?{questionId:card.questionId,answerText:card.answerText,sources:card.sources.map((source)=>({...source,questionId:card.questionId,auditExcerpt:null}))}:{questionId:card.questionId,answerText:"",sources:[]})
  });
  return model;
}

function v3PreparationInput(): PrepareCombinedGeoReportV3Input {
  const forensic = createTestSourceForensicReport({ reportId: "report-v3", jobId: "job-v3" });
  const questionSet = {
    version: "business-questions-v1",
    id: "questions-v3",
    revision: 1,
    locale: forensic.locale,
    region: forensic.region,
    confidence: "high",
    requiresAcknowledgement: false,
    profileEvidenceIdentity: "profile-v3",
    identityExclusions: [],
    acknowledgedLowConfidence: false,
    confirmedAt: "2030-01-01T00:00:00.000Z",
    contentHash: "questions-v3-hash",
    questions: forensic.questions.questions.map((question, index) => ({
      purpose: (["core_service_discovery", "customer_region_fit", "purchase_delivery_risk"] as const)[index]!,
      generatedText: question.normalizedText,
      privateText: question.normalizedText,
      neutralPublicText: question.normalizedText,
      evidenceUrls: [],
      service: question.normalizedText,
      audience: "采购方",
      marketRegion: forensic.region,
      edited: false,
      neutralizationVersion: "identity-neutral-v1",
      neutralContentHash: `neutral-${question.id}`
    }))
  } as unknown as ConfirmedBusinessQuestionSet;
  const canonical = toCanonicalBuyerQuestionSet(questionSet).questions;
  const questionIdMap = new Map(
    forensic.questions.questions.map((question, index) => [question.id, canonical[index]!.id])
  );
  const alignedForensic = rewriteExactStrings(structuredClone(forensic), questionIdMap);
  const answerCards = canonical.map((question, index) => ({
    answerMode: "generative_search_v1" as const,
    questionId: question.id,
    exactQuestion: questionSet.questions[index]!.privateText,
    status: "answered" as const,
    answerText: `公开来源回答了采购问题 ${index + 1}。`,
    sources: [{
      sourceId: `answer-source-${index + 1}`,
      title: `公开来源 ${index + 1}`,
      canonicalUrl: `https://answer-source-${index + 1}.example/fact`,
      registrableDomain: `answer-source-${index + 1}.example`,
      citedText: `公开来源事实 ${index + 1}。`,
      providerResultOrder: 1,
      retrievalStatus: "search_source_only" as const,
      ownershipCategory: "third_party_editorial" as const
    }],
    provenance: {
      providerId: "fixture",
      model: "fixture-model",
      searchMode: "native_web_search",
      promptVersion: "generative-search-answer-v1" as const,
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
      citedOwnership: { target_owned: 0, competitor_owned: 0, third_party_editorial: 1, directory: 0, government: 0, other: 0, institution: 0, community: 0, social: 0, unknown: 0 },
      missingEvidenceFamilies: [],
      retestQuestion: questionSet.questions[index]!.privateText
    },
    audit: { verifiedBodyCount: 0, searchSourceOnlyCount: 1, inaccessibleCount: 0 }
  })) as PrepareCombinedGeoReportV3Input["answerCards"];
  const targetPages = [{
    id: "https://customer-logistics.example/",
    url: "https://customer-logistics.example/",
    title: "客户企业",
    metaDescription: "跨境货运服务",
    h1: ["客户企业"],
    readableTextLength: 500,
    hasJsonLd: true
  }];
  const sourceSelectionDiagnosis = buildSourceSelectionDiagnosisV1({
    locale: "zh",
    answerHash: "5".repeat(64),
    sourceHash: "4".repeat(64),
    targetFoundationHash: "e".repeat(64),
    targetDomain: "customer-logistics.example",
    targetPages,
    questions: answerCards.map((card) => ({
      questionId: card.questionId,
      answerText: card.answerText,
      sources: card.sources.map((source) => ({
        ...source,
        questionId: card.questionId,
        auditExcerpt: null
      }))
    }))
  });
  const evidenceAssets = [{
    id: "asset-v3",
    reportId: "report-v3",
    jobId: "job-v3",
    findingId: "finding-1",
    citationIndex: 0,
    kind: "context",
    status: "ready",
    sourceUrl: "https://customer-logistics.example/",
    quote: "客户企业提供跨境货运服务。",
    pageElement: null,
    capturedAt: new Date("2030-01-01T00:00:00.000Z"),
    viewportWidth: 1280,
    viewportHeight: 720,
    contentHash: "f".repeat(64),
    evidenceHash: "1".repeat(64),
    assetHash: "2".repeat(64),
    storageProvider: "fixture",
    storageKey: "reports/report-v3/asset-v3.png",
    mimeType: "image/png",
    byteSize: 5,
    failureCode: null,
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-01T00:00:00.000Z")
  }] as PrepareCombinedGeoReportV3Input["evidenceAssets"];
  return {
    artifactRevisionId: "artifact-v3",
    artifactRevision: 3,
    reportId: "report-v3",
    orderId: "order-v3",
    jobId: "job-v3",
    originalPaidJobId: "job-v3",
    targetUrl: alignedForensic.targetUrl,
    technicalReport: {
      url: alignedForensic.targetUrl,
      scannedAt: "2030-01-01T00:00:00.000Z",
      score: 80,
      pages: [{ url: alignedForensic.targetUrl, status: 200, title: "客户企业", metaDescription: "跨境货运服务", h1: ["客户企业"], h2: [], canonical: alignedForensic.targetUrl, hasOpenGraph: true, hasJsonLd: true, readableTextLength: 500, internalLinks: 2 }],
      findings: [],
      recommendations: [],
      machineReadableAssets: {
        robotsTxt: { url: `${alignedForensic.targetUrl}robots.txt`, present: true, summary: "robots.txt 可用。" },
        sitemapXml: { url: `${alignedForensic.targetUrl}sitemap.xml`, present: true, summary: "sitemap.xml 可用。" },
        llmsTxt: { url: `${alignedForensic.targetUrl}llms.txt`, present: false, summary: "未发现 llms.txt。" }
      }
    },
    aiReport: alignedForensic.websiteFoundationAppendix,
    evidenceAssets,
    businessQuestionSet: questionSet,
    answerCards,
    sourceSelectionDiagnosis,
    engineProvenance: {
      engineId: "open_geo_public_search_answer_v1",
      searchSurface: "fixture/v1",
      queryPlanVersion: "v1",
      passageSelectorVersion: "v1",
      synthesisModel: "fixture-model",
      synthesisPromptVersion: "v1",
      locale: alignedForensic.locale,
      region: alignedForensic.region,
      searchedAt: "2030-01-01T00:00:00.000Z",
      evidenceCutoffAt: "2030-01-02T00:00:00.000Z",
      synthesizedAt: "2030-01-02T00:00:00.000Z",
      inputHash: "3".repeat(64),
      evidenceHash: "4".repeat(64),
      answerHash: "5".repeat(64)
    },
    publicSourceForensics: alignedForensic,
    providerDiscovery: {
      version: "provider-discovery-v1",
      policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" },
      identity: { candidateSetHash: "6".repeat(64), queryPlanVersion: "v1", passageSelectorVersion: "v1", claimExtractionContract: "provider-claim-extraction-v1", claimExtractionModel: "fixture-model", claimSetHash: "7".repeat(64) },
      execution: { plannedQueries: 1, completedQueries: 1, returnedObservations: 1, safelyRetrievedPages: 1, relevantPassages: 1, discoveredProviders: 1, strictProviders: 0, candidateProviders: 1, rejectedProviders: 0, coverage: "partial" },
      strict: [],
      candidates: [{ entityId: "provider-1", canonicalName: "物流服务商", genericRole: "service_provider", policyRole: "carrier", leadEvidenceIds: ["provider-evidence-1"], missingProof: ["缺少直接资产证据"] }],
      evidence: [{ evidenceId: "provider-evidence-1", sourceEvidenceId: "source-provider-1", registrableDomain: "provider.example", title: "物流服务商", sourceAuthority: "company_owned", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "该服务商提供货运服务。", capability: "linehaul_fleet" }],
      limitation: "公开证据有限并不证明服务商缺少能力。"
    }
  };
}

function rewriteExactStrings<T>(value: T, replacements: ReadonlyMap<string, string>): T {
  if (typeof value === "string") return (replacements.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => rewriteExactStrings(item, replacements)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewriteExactStrings(item, replacements)])
    ) as T;
  }
  return value;
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

  it("prepares V3 without HTML, PDF, or storage work and keeps explicit legacy identical", () => {
    const input = v3PreparationInput();
    const omitted = prepareCombinedGeoReportV3(input);
    const explicit = prepareCombinedGeoReportV3(input, { semanticValidation: "legacy" });
    expect(explicit).toEqual(omitted);
    expect(readinessSideEffects.storage.get).not.toHaveBeenCalled();
    expect(readinessSideEffects.storage.put).not.toHaveBeenCalled();
    expect(readinessSideEffects.exportPdf).not.toHaveBeenCalled();
    expect(readinessGuardHarness.run).not.toHaveBeenCalled();
  });

  it("lets deferred preparation accept reviewed causal-looking prose while retaining V3 structure", () => {
    const input = v3PreparationInput();
    input.publicSourceForensics = structuredClone(input.publicSourceForensics);
    input.publicSourceForensics.executiveVerdict.text = "ChatGPT recommended this company and guarantees first place.";
    expect(() => prepareCombinedGeoReportV3(input)).toThrow(/Prohibited public-search attribution claim/u);
    const deferred = prepareCombinedGeoReportV3(input, { semanticValidation: "deferred" });
    expect(deferred.publicSourceForensics.executiveVerdict.text).toContain("guarantees first place");
    expect(deferred.answerCards).toHaveLength(3);
    expect(readinessSideEffects.exportPdf).not.toHaveBeenCalled();
  });

  it("keeps legacy build ordering from prepared callback through PDF and storage", async () => {
    const input = v3PreparationInput();
    let callbackReportId: string | null = null;
    const result = await buildReadyCombinedArtifactV3({
      ...input,
      onReportPrepared(report) {
        expect(readinessSideEffects.exportPdf).not.toHaveBeenCalled();
        expect(readinessSideEffects.storage.put).not.toHaveBeenCalled();
        callbackReportId = report.reportId;
      }
    });
    expect(callbackReportId).toBe(input.reportId);
    expect(readinessSideEffects.exportPdf).toHaveBeenCalledOnce();
    expect(readinessSideEffects.storage.put).toHaveBeenCalledOnce();
    expect(result.report.reportId).toBe(input.reportId);
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

  it("rejects a V3 diagnosis moved outside its own answer card",()=>{
    const model=generativeV3Fixture();
    const html=renderCanonicalCombinedArtifactHtml(model);
    const diagnosis="Question diagnosis 1.";
    const questionOne=model.combinedReport.answerCards[0]!.exactQuestion;
    const withoutDiagnosis=html.replace(diagnosis,"");
    const questionOneAt=withoutDiagnosis.indexOf(questionOne);
    const moved=withoutDiagnosis.slice(0,questionOneAt)+diagnosis+withoutDiagnosis.slice(questionOneAt);
    expect(()=>assertCombinedV3HtmlCompleteness(model.combinedReport,moved)).toThrow(/answer-source-diagnosis/i);
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

describe("Report V4 PDF readiness entry guards", () => {
  const invoke = () => materializeReadyArtifact(
    {} as never,
    { reportId: "report-1", artifactRevisionId: "artifact-1" } as never,
    "<!doctype html><html><body>ready</body></html>"
  );

  it("blocks Chromium readiness before nested PDF export or storage", async () => {
    readinessGuardHarness.state.blockedSite = "pdf_readiness_chromium";

    await expect(invoke()).rejects.toBe(readinessGuardHarness.blocked);

    expect(readinessGuardHarness.state.guardSites).toEqual(["pdf_readiness_chromium"]);
    expect(readinessGuardHarness.state.delegatedSites).toEqual([]);
    expect(readinessSideEffects.exportPdf).not.toHaveBeenCalled();
    expect(readinessSideEffects.storage.put).not.toHaveBeenCalled();
  });

  it("tests storage independently and blocks before the put side effect", async () => {
    readinessGuardHarness.state.blockedSite = "pdf_readiness_storage";

    await expect(invoke()).rejects.toBe(readinessGuardHarness.blocked);

    expect(readinessGuardHarness.state.guardSites).toEqual([
      "pdf_readiness_chromium",
      "pdf_readiness_storage"
    ]);
    expect(readinessGuardHarness.state.delegatedSites).toEqual(["pdf_readiness_chromium"]);
    expect(readinessSideEffects.exportPdf).toHaveBeenCalledTimes(1);
    expect(readinessSideEffects.storage.put).not.toHaveBeenCalled();
  });

  it("delegates Chromium and storage exactly once each without an active guard", async () => {
    await expect(invoke()).resolves.toMatchObject({
      pdfStorageKey: expect.any(String),
      pageCount: 5
    });

    expect(readinessGuardHarness.state.guardSites).toEqual([
      "pdf_readiness_chromium",
      "pdf_readiness_storage"
    ]);
    expect(readinessGuardHarness.state.delegatedSites).toEqual([
      "pdf_readiness_chromium",
      "pdf_readiness_storage"
    ]);
    expect(readinessSideEffects.exportPdf).toHaveBeenCalledTimes(1);
    expect(readinessSideEffects.storage.put).toHaveBeenCalledTimes(1);
  });
});

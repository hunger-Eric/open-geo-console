import { describe, expect, it } from "vitest";
import {
  COMBINED_GEO_REPORT_V3_CONTRACT,
  COMBINED_GEO_REPORT_V3_VERSION,
  GEO_ARTICLE_DELIVERABLE_VERSION,
  GEO_ARTICLE_DELIVERABLE_V3_VERSION,
  GEO_ARTICLE_EXAMPLE_VERSION,
  hashCombinedGeoReportV3ReceiptExcludedProjection,
  parseCombinedGeoReportV3,
  requireReadyCombinedGeoReportV3CrawlDiagnostic,
  parseGeoArticleDeliverable,
  parseGeoArticleExampleV1
} from "./combined-geo-report-v3";
import { hashReportSemanticReviewValue } from "./report-semantic-review";

describe("combined GEO report V3 contract", () => {
  it("keeps V3 identity prospective and explicit", () => {
    expect(COMBINED_GEO_REPORT_V3_VERSION).toBe(3);
    expect(COMBINED_GEO_REPORT_V3_CONTRACT).toBe("combined_geo_report_v3");
    const value = { version: 2, artifactContract: "combined_geo_report_v2" };
    const error = (options?: { semanticValidation?: "legacy" | "deferred" }) => {
      try { parseCombinedGeoReportV3(value, options); } catch (caught) { return (caught as Error).message; }
      throw new Error("Expected parser failure.");
    };
    expect(error({ semanticValidation: "legacy" })).toBe(error());
    expect(error({ semanticValidation: "deferred" })).toMatch(/combined_geo_report_v3/iu);
  });

  it("hashes the complete final projection with the receipt omitted and detects structural tamper", () => {
    const projection = {
      version: COMBINED_GEO_REPORT_V3_VERSION,
      artifactContract: COMBINED_GEO_REPORT_V3_CONTRACT,
      reportId: "report-1",
      nested: { count: 3, customerText: "reviewed" }
    };
    const projectionHash = hashCombinedGeoReportV3ReceiptExcludedProjection(projection);
    expect(projectionHash).toBe(hashReportSemanticReviewValue(projection));
    expect(hashCombinedGeoReportV3ReceiptExcludedProjection({
      ...projection,
      semanticReviewReceipt: {
        lifecycle: "paid_v3",
        finalReviewedReportProjectionHash: projectionHash
      }
    })).toBe(projectionHash);
    expect(hashCombinedGeoReportV3ReceiptExcludedProjection({
      ...projection,
      nested: { ...projection.nested, count: 4 }
    })).not.toBe(projectionHash);
  });

  it("does not let a receipt-shaped object select deferred parsing", () => {
    const invalid = {
      version: 2,
      artifactContract: "combined_geo_report_v2",
      semanticReviewReceipt: {
        version: "report-semantic-review-v1",
        lifecycle: "paid_v3"
      }
    };
    const error = (options?: { semanticValidation?: "legacy" | "deferred" }) => {
      try { parseCombinedGeoReportV3(invalid, options); } catch (caught) { return (caught as Error).message; }
      throw new Error("Expected parser failure.");
    };
    expect(error()).toBe(error({ semanticValidation: "legacy" }));
    expect(error({ semanticValidation: "deferred" })).toMatch(/combined_geo_report_v3/iu);
  });

  it("accepts a structured article only when sections and evidence references are bound", () => {
    const article = {
      version: GEO_ARTICLE_EXAMPLE_VERSION,
      generationMode: "model",
      targetQuestionIds: ["q1"],
      title: "如何选择可靠的国际物流服务商",
      introduction: "选择服务商时，应先核对服务范围、操作条件和可验证的交付信息。",
      sections: [
        { id: "service", heading: "先确认服务范围", paragraphs: ["网站应清楚说明能够提供的运输方式、适用地区和服务边界。"] },
        { id: "proof", heading: "再核对公开证据", paragraphs: ["采购方还需要检查案例、流程和可独立验证的履约信息。"] }
      ],
      faq: [{ question: "采购前最需要确认什么？", answer: "先确认服务范围、限制条件和证据是否能够公开核验。" }],
      rationale: [
        { sectionId: "service", reason: "先回答买家最直接的服务匹配问题。", evidenceRefs: ["question:q1"] },
        { sectionId: "proof", reason: "再补充影响引用可信度的公开证据。", evidenceRefs: ["finding:f1"] }
      ]
    };
    expect(parseGeoArticleExampleV1(article, { locale: "zh-CN", questionIds: ["q1", "q2", "q3"], evidenceRefs: ["question:q1", "finding:f1"] })).toEqual(article);
    expect(() => parseGeoArticleExampleV1({ ...article, rationale: [{ ...article.rationale[0], evidenceRefs: ["source:unknown"] }, article.rationale[1]] }, {
      locale: "zh-CN", questionIds: ["q1", "q2", "q3"], evidenceRefs: ["question:q1", "finding:f1"]
    })).toThrow(/evidence references/iu);
  });

  it("rejects raw HTML and non-Chinese prose for a Chinese article", () => {
    const base = {
      version: GEO_ARTICLE_EXAMPLE_VERSION,
      generationMode: "model",
      targetQuestionIds: ["q1"],
      title: "A logistics buying guide",
      introduction: "This article explains how to choose a provider.",
      sections: [
        { id: "one", heading: "Service scope", paragraphs: ["Confirm the exact service scope before purchase."] },
        { id: "two", heading: "Public proof", paragraphs: ["Check public and verifiable delivery evidence."] }
      ],
      faq: [{ question: "What matters?", answer: "Service scope and proof." }],
      rationale: [
        { sectionId: "one", reason: "Answer the buyer question.", evidenceRefs: ["question:q1"] },
        { sectionId: "two", reason: "Explain the evidence need.", evidenceRefs: ["question:q1"] }
      ]
    };
    const authority = { locale: "zh-CN", questionIds: ["q1"], evidenceRefs: ["question:q1"] };
    expect(() => parseGeoArticleExampleV1(base, authority)).toThrow(/Simplified Chinese/iu);
    expect(() => parseGeoArticleExampleV1({ ...base, title: "<strong>标题</strong>" }, authority)).toThrow(/raw HTML/iu);
    expect(() => parseGeoArticleExampleV1({ ...base, title: "## 中文采购指南" }, authority)).toThrow(/Markdown/iu);
  });

  it("accepts a factual crawl diagnostic without manufacturing answer-card or public-search data", () => {
    const report = requireReadyCombinedGeoReportV3CrawlDiagnostic({
      version: 3, artifactContract: "combined_geo_report_v3", deliveryKind: "crawl_diagnostic",
      productCode: "recommendation_forensics_v1", artifactRevisionId: "artifact-1", artifactRevision: 1,
      reportId: "report-1", orderId: "order-1", jobId: "job-1", originalPaidJobId: "job-1",
      targetUrl: "https://example.com/", locale: "en", generatedAt: "2030-01-01T00:00:00.000Z",
      evidenceCutoffAt: "2030-01-01T00:00:00.000Z", questionSetIdentity: "questions-1",
      crawlObservations: [{ attemptedUrl: "https://example.com/", category: "robots", detail: "robots.txt disallows the homepage." }],
      limitations: ["No readable target-site content was obtained."]
    });
    expect(report.deliveryKind).toBe("crawl_diagnostic");
    expect("answerCards" in report).toBe(false);
    expect(() => requireReadyCombinedGeoReportV3CrawlDiagnostic({ ...report, crawlObservations: [] })).toThrow(/must not be empty/iu);
  });

  it("parses mutually exclusive V2 article and outline deliverables for Q1", () => {
    const authority = { locale: "zh-CN", questionIds: ["q1", "q2", "q3"], evidenceRefs: ["question:q1", "finding:f1"] };
    const article = v2Article();
    expect(parseGeoArticleDeliverable(article, authority)).toEqual(article);
    const outline = {
      version: GEO_ARTICLE_DELIVERABLE_VERSION,
      kind: "outline",
      primaryQuestionId: "q1",
      outline: {
        workingTitle: "企业选择数据集成方案时应核对哪些能力",
        readerQuestion: "多个业务系统的数据应该怎样可靠打通？",
        directAnswer: "先确认数据范围、异常恢复、人工复核和交付边界。",
        plannedSections: [
          { id: "scenario", heading: "先明确业务场景", purpose: "界定需要打通的系统和流程。", evidenceRefs: ["question:q1"] },
          { id: "criteria", heading: "比较关键能力", purpose: "比较连接、清洗和异常处理能力。", evidenceRefs: ["finding:f1"] },
          { id: "checklist", heading: "形成核验清单", purpose: "把采购判断转成可执行步骤。", evidenceRefs: ["question:q1"] }
        ],
        evidenceToAdd: ["补充可公开访问的交付案例。"],
        faqAngles: ["如何确认异常恢复能力？", "哪些数据需要人工复核？"]
      },
      explanation: explanation(),
      fallbackReason: "quality_rejected"
    };
    expect(parseGeoArticleDeliverable(outline, authority)).toEqual(outline);
    expect(() => parseGeoArticleDeliverable({ ...article, primaryQuestionId: "q2" }, authority)).toThrow(/primary buyer question/iu);
    expect(() => parseGeoArticleDeliverable({ ...article, outline: outline.outline }, authority)).toThrow(/must not contain outline/iu);
  });

  it("rejects V2 provider ordinals, duplicate prose, incomplete explanation and unknown evidence", () => {
    const authority = { locale: "zh-CN", questionIds: ["q1", "q2", "q3"], evidenceRefs: ["question:q1", "finding:f1"] };
    const base = v2Article();
    expect(() => parseGeoArticleDeliverable({ ...base, article: { ...base.article, introduction: { ...base.article.introduction, text: "根据来源0整理选择标准。" } } }, authority)).toThrow(/provider source ordinals/iu);
    expect(() => parseGeoArticleDeliverable({ ...base, article: { ...base.article, faq: [{ ...base.article.faq[0], answer: base.article.sections[0].paragraphs[0] }, base.article.faq[1]] } }, authority)).toThrow(/duplicate customer prose/iu);
    expect(() => parseGeoArticleDeliverable({ ...base, explanation: base.explanation.slice(1) }, authority)).toThrow(/explain every required element/iu);
    expect(() => parseGeoArticleDeliverable({ ...base, article: { ...base.article, introduction: { ...base.article.introduction, evidenceRefs: ["source:unknown"] } } }, authority)).toThrow(/known evidence/iu);
    expect(parseGeoArticleDeliverable({ ...legacyArticle(), generationMode: "deterministic_fallback" }, authority)).toMatchObject({ version: GEO_ARTICLE_EXAMPLE_VERSION, generationMode: "deterministic_fallback" });
  });

  it("parses article-only V3 research lineage while preserving V1 and V2 readability", () => {
    const authority = { locale: "zh-CN", questionIds: ["q1", "q2", "q3"], evidenceRefs: ["question:q1", "finding:f1", "website:service:0", "website:audience:0"] };
    const article = v2Article();
    const researched = {
      ...article,
      version: GEO_ARTICLE_DELIVERABLE_V3_VERSION,
      generationMode: "model_researched",
      research: {
        outcome: "usable", query: "企业采用数据集成服务时如何核对交付边界", providerId: "fixture", model: "fixture-model", searchMode: "native_web_search",
        result: { questionId: "geo-article-research:q1", answerText: "公开资料说明数据集成项目需要明确异常恢复和人工复核边界。", sources: [{ sourceId: "research-1", title: "数据集成实施指南", canonicalUrl: "https://research.example/guide", registrableDomain: "research.example", citedText: "项目需要明确异常恢复和人工复核边界。", providerResultOrder: 0 }], refusal: null, searchedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z", providerResponseId: "response-1" }
      },
      article: { ...article.article, introduction: { ...article.article.introduction, evidenceRefs: ["question:q1", "website:service:0", "website:audience:0"] }, sections: article.article.sections.map((section, index) => index === 2 ? { ...section, paragraphs: [{ ...section.paragraphs[0], evidenceRefs: ["research:research-1", "website:service:0"] }] } : section) },
      explanation: article.explanation.map((entry, index) => index === 4 ? { ...entry, evidenceRefs: ["research:research-1"] } : entry)
    };
    expect(parseGeoArticleDeliverable(researched, authority)).toMatchObject({ version: GEO_ARTICLE_DELIVERABLE_V3_VERSION, kind: "article", generationMode: "model_researched", research: { outcome: "usable" } });
    const unavailable = { ...researched, generationMode: "deterministic_evidence_fallback", research: { outcome: "unavailable", queryId: "geo-article-research:q1", query: researched.research.query, providerId: "fixture", model: "fixture-model", searchMode: "native_web_search", attemptedAt: "2030-01-01T00:00:00.000Z", completedAt: "2030-01-01T00:00:01.000Z" }, article: article.article, explanation: article.explanation };
    expect(parseGeoArticleDeliverable(unavailable, authority)).toMatchObject({ generationMode: "deterministic_evidence_fallback", research: { outcome: "unavailable" } });
    expect(parseGeoArticleDeliverable(article, authority)).toEqual(article);
    expect(parseGeoArticleDeliverable(legacyArticle(), authority)).toMatchObject({ version: GEO_ARTICLE_EXAMPLE_VERSION });
    expect(() => parseGeoArticleDeliverable({ ...researched, kind: "outline" }, authority)).toThrow(/must equal article/iu);
    expect(() => parseGeoArticleDeliverable({ ...unavailable, generationMode: "model_researched" }, authority)).toThrow(/do not agree/iu);
  });
});

function legacyArticle() {
  return {
    version: GEO_ARTICLE_EXAMPLE_VERSION,
    generationMode: "model",
    targetQuestionIds: ["q1"],
    title: "如何选择可靠的企业数据集成服务",
    introduction: "选择方案时需要确认服务范围、交付条件和可核验依据。",
    sections: [
      { id: "service", heading: "先确认服务范围", paragraphs: ["官网需要清楚说明能够连接的数据系统和适用流程。"] },
      { id: "proof", heading: "再核对公开证据", paragraphs: ["采购方还需要检查案例、流程和可验证的交付信息。"] }
    ],
    faq: [{ question: "采购前最需要确认什么？", answer: "先确认服务范围、限制条件和公开依据。" }],
    rationale: [
      { sectionId: "service", reason: "先回答服务匹配问题。", evidenceRefs: ["question:q1"] },
      { sectionId: "proof", reason: "再补充公开证据。", evidenceRefs: ["finding:f1"] }
    ]
  };
}

function explanation() {
  return [
    { elementId: "title", heading: "标题设计", reason: "用买家问题建立主题。", geoFunction: "明确搜索意图。", evidenceRefs: ["question:q1"] },
    { elementId: "introduction", heading: "答案前置", reason: "先给出核心判断。", geoFunction: "帮助快速提取答案。", evidenceRefs: ["question:q1"] },
    { elementId: "section:scenario", heading: "业务场景", reason: "先界定问题。", geoFunction: "建立语义上下文。", evidenceRefs: ["question:q1"] },
    { elementId: "section:criteria", heading: "判断标准", reason: "给出比较维度。", geoFunction: "形成可提取要点。", evidenceRefs: ["finding:f1"] },
    { elementId: "section:checklist", heading: "执行清单", reason: "提供下一步。", geoFunction: "连接问题与行动。", evidenceRefs: ["question:q1"] },
    { elementId: "faq", heading: "相关问题", reason: "补充相邻意图。", geoFunction: "覆盖相关问法。", evidenceRefs: ["question:q1"] }
  ];
}

function v2Article() {
  return {
    version: GEO_ARTICLE_DELIVERABLE_VERSION,
    kind: "article" as const,
    primaryQuestionId: "q1",
    article: {
      title: "企业选择数据集成方案时应核对哪些能力",
      introduction: { text: "先确认数据范围、异常恢复、人工复核和交付边界。", evidenceRefs: ["question:q1"] },
      sections: [
        { id: "scenario", heading: "先明确业务场景", paragraphs: [{ text: "列出需要连接的系统、数据类型和重复流程。", evidenceRefs: ["question:q1"] }] },
        { id: "criteria", heading: "比较关键能力", paragraphs: [{ text: "比较连接、清洗、编排和异常处理是否有公开依据。", evidenceRefs: ["finding:f1"] }] },
        { id: "checklist", heading: "形成核验清单", paragraphs: [{ text: "要求服务方说明适用条件、人工复核和交付限制。", evidenceRefs: ["question:q1"] }] }
      ],
      faq: [
        { question: "如何确认异常恢复能力？", answer: { text: "核对失败重试、告警和人工接管流程。", evidenceRefs: ["finding:f1"] } },
        { question: "哪些数据需要人工复核？", answer: { text: "高风险凭证和异常业务数据应保留人工确认。", evidenceRefs: ["question:q1"] } }
      ]
    },
    explanation: explanation()
  };
}

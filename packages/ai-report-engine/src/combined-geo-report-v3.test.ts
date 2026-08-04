import { describe, expect, it } from "vitest";
import {
  COMBINED_GEO_REPORT_V3_CONTRACT,
  COMBINED_GEO_REPORT_V3_VERSION,
  GEO_ARTICLE_EXAMPLE_VERSION,
  hashCombinedGeoReportV3ReceiptExcludedProjection,
  parseCombinedGeoReportV3,
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
});

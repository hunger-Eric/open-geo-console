import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSourceSelectionDiagnosisV1, type SourceSelectionDiagnosisBuildInputV1 } from "@open-geo-console/ai-report-engine";
import { SourceSelectionDiagnosisSection } from "./source-selection-diagnosis-section";

function input(): SourceSelectionDiagnosisBuildInputV1 {
  const source = (questionId: string, sourceId: string, suffix: string) => ({
    questionId,
    sourceId,
    title: "跨境物流采购指南",
    canonicalUrl: `https://guide.example/${suffix}`,
    registrableDomain: "guide.example",
    citedText: "服务商甲覆盖欧洲主要港口",
    auditExcerpt: "服务商甲覆盖欧洲主要港口",
    retrievalStatus: "verified_body" as const,
    ownershipCategory: "third_party_editorial" as const,
    providerResultOrder: 0
  });
  return {
    locale: "zh",
    answerHash: "a".repeat(64),
    sourceHash: "b".repeat(64),
    targetFoundationHash: "c".repeat(64),
    targetDomain: "target.example",
    targetPages: [{ id: "target-home", url: "https://target.example/", title: "目标品牌", metaDescription: "跨境物流", h1: ["目标品牌"], readableTextLength: 180, hasJsonLd: false }],
    questions: [
      { questionId: "q1", answerText: "服务商甲覆盖欧洲主要港口。", sources: [source("q1", "s1", "providers")] },
      { questionId: "q2", answerText: "服务商甲覆盖欧洲主要港口。", sources: [source("q2", "s2", "coverage")] },
      { questionId: "q3", answerText: "采购前应确认交付限制。", sources: [] }
    ]
  };
}

const questions = [{ id: "q1", text: "哪些服务商值得考虑？" }, { id: "q2", text: "哪些服务覆盖欧洲？" }, { id: "q3", text: "采购前有哪些风险？" }];

describe("SourceSelectionDiagnosisSection", () => {
  it("renders source profiles, observed factors, target gaps, and actions", () => {
    const diagnosis = buildSourceSelectionDiagnosisV1(input());
    const html = renderToStaticMarkup(createElement(SourceSelectionDiagnosisSection, { diagnosis, locale: "zh", targetUrl: "https://target.example/", questions }));
    for (const value of ["来源选择诊断", "guide.example", "哪些服务商值得考虑", "为答案贡献了什么", "可观察入选因素", "目标网站进入答案的优先路径", "建设可独立引用的服务事实页", "可以确认", "不能断言"]) {
      expect(html).toContain(value);
    }
    expect(html).not.toContain("完整答案");
    expect(html).not.toContain("有限答案");
    expect(html).not.toContain("目标品牌出现");
  });

  it("renders partial limitations without empty panels", () => {
    const value = input();
    value.questions[0]!.sources[0]!.retrievalStatus = "inaccessible";
    value.questions[0]!.sources[0]!.auditExcerpt = null;
    const diagnosis = buildSourceSelectionDiagnosisV1(value);
    const html = renderToStaticMarkup(createElement(SourceSelectionDiagnosisSection, { diagnosis, locale: "zh", targetUrl: "https://target.example/", questions }));
    expect(html).toContain("部分页面当前无法独立访问");
    expect(html).not.toContain("<ul></ul>");
  });

  it("renders one truthful unavailable state when no source was returned", () => {
    const value = input();
    for (const question of value.questions) question.sources = [];
    const diagnosis = buildSourceSelectionDiagnosisV1(value);
    const html = renderToStaticMarkup(createElement(SourceSelectionDiagnosisSection, { diagnosis, locale: "zh", targetUrl: "https://target.example/", questions }));
    expect(html).toContain("来源选择分析暂不可用");
    expect(html).not.toContain("source-profile-card");
  });
});

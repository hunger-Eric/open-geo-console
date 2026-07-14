import { describe, expect, it } from "vitest";
import { assertCombinedGeoReportLanguage, type CombinedGeoReportV1 } from "./combined-geo-report";
import { ReportLanguageValidationError } from "./report-language";

describe("prospective combined report language gate", () => {
  it("rejects customer prose outside the persisted Chinese locale", () => {
    const report = fixture("zh-CN");
    report.technicalFoundation.aiReport.executiveSummary.overview = "The customer should update every public page immediately.";
    expect(() => assertCombinedGeoReportLanguage(report)).toThrow(ReportLanguageValidationError);
  });

  it("ignores source-original evidence quotes and grounded proper names", () => {
    const report = fixture("zh-CN");
    report.technicalFoundation.aiReport.findings[0]!.evidence[0]!.quote = "This source passage remains verbatim in English.";
    report.technicalFoundation.aiReport.executiveSummary.overview = "Example 的网站内容清晰。";
    expect(() => assertCombinedGeoReportLanguage(report)).not.toThrow();
  });

  it("rejects Chinese narrative in a new English combined report", () => {
    const report = fixture("en");
    report.businessQuestionAnswers!.answers[0]!.answer = "客户应立即更新所有公开材料。";
    expect(() => assertCombinedGeoReportLanguage(report)).toThrow(ReportLanguageValidationError);
  });

  it("does not let model-owned profile phrases authorize other report prose", () => {
    const report = fixture("zh-CN");
    report.technicalFoundation.aiReport.organizationProfile.organizationName = "Vendor Growth Plan";
    report.technicalFoundation.aiReport.organizationProfile.brandNames = ["Forensic Action System"];
    report.technicalFoundation.aiReport.organizationProfile.legalEntity = "Report Operations Group";
    report.vendorTaskPackage.tasks[0]!.text = "Vendor Growth Plan";
    expect(() => assertCombinedGeoReportLanguage(report)).toThrow(ReportLanguageValidationError);
    report.vendorTaskPackage.tasks[0]!.text = "改进页面。";
    report.publicSourceForensics.executiveVerdict.text = "Forensic Action System";
    expect(() => assertCombinedGeoReportLanguage(report)).toThrow(ReportLanguageValidationError);
  });
});

function fixture(locale: string): CombinedGeoReportV1 {
  const zh = locale.startsWith("zh");
  const prose = (en: string, cn: string) => zh ? cn : en;
  const evidence = [{ url: "https://example.com/", quote: "Source original quote." }];
  const aiReport = {
    organizationProfile: { organizationName: "Example", brandNames: ["Example"], productsAndServices: [], legalEntity: null,
      summary: prose("Example is clearly identified.", "Example 的组织身份清晰。"), identityConsistency: prose("Identity is consistent.", "组织身份保持一致。") },
    executiveSummary: { overview: prose("The website is clear.", "网站内容清晰。"), strengths: [prose("Clear content.", "内容清晰。")], keyRisks: [], topPriorities: [] },
    dimensionScores: [{ explanation: prose("Evidence supports the score.", "证据支持该评分。") }],
    pageTypeAnalyses: [{ strengths: [prose("Clear page.", "页面清晰。")], commonIssues: [], recommendations: [] }],
    findings: [{ title: prose("Improve proof", "补充证据"), impact: prose("Readers need proof.", "读者需要证据。"), recommendation: prose("Add sources.", "补充来源。"), evidence }],
    roadmap: { immediate: [{ title: prose("Add proof", "补充证据"), rationale: prose("Improve trust.", "提高可信度。"), actions: [prose("Add sources.", "添加来源。")] }], nextPhase: [], ongoing: [] },
    coverage: { samplingMethod: prose("Representative sampling.", "代表性抽样。"), limitations: [] }
  };
  const questions = [0, 1, 2].map((index) => ({ privateText: prose(`Business question ${index + 1}.`, `业务问题 ${index + 1}。`) }));
  const answers = [0, 1, 2].map((index) => ({ answer: prose(`Grounded answer ${index + 1}.`, `基于证据的回答 ${index + 1}。`) }));
  return {
    locale,
    technicalFoundation: { aiReport, technicalReport: {}, evidenceAssets: [] },
    businessQuestionSet: { questions },
    businessQuestionAnswers: { answers },
    publicSourceForensics: {
      sourceGraph: { entities: [{ status: "resolved", canonicalName: "Example" }], claims: [], evidence: [] },
      customerComparison: [],
      executiveVerdict: { title: prose("Verdict", "结论"), text: prose("Evidence is sufficient.", "证据充分。") },
      executivePriorities: [],
      limitations: []
    },
    vendorTaskPackage: { tasks: [{ title: prose("Update content", "更新内容"), text: prose("Improve the page.", "改进页面。"), actions: [prose("Edit content.", "编辑内容。")], acceptanceCriteria: [prose("Content is clear.", "内容清晰。")] }] },
    methodology: { technicalCoverage: prose("One page analyzed.", "已分析一个页面。"), evidenceFreshness: prose("Evidence is fresh.", "证据为最新状态。"), limitations: [] }
  } as unknown as CombinedGeoReportV1;
}

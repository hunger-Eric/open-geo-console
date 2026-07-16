import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseReportV4CustomerProseProfile,
  validateReportV4CustomerProse
} from "./report-v4-customer-prose";

// @requirement GEO-V4-COPY-01
// @requirement GEO-V4-COPY-02
describe("V4 Chinese business customer prose safety", () => {
  it("parses the checked-in Chinese business profile with strict editorial bounds", () => {
    const profile = parseReportV4CustomerProseProfile(JSON.parse(readFileSync(
      new URL("../../../config/report-profiles/business-operator-zh.json", import.meta.url),
      "utf8"
    )));

    expect(profile).toMatchObject({
      schemaVersion: 1,
      profileId: "business-operator-zh-v1",
      locale: "zh-CN",
      readingOrder: ["conclusion", "reason", "action"],
      presentation: { conciseByDefault: true, detailedEvidenceCollapsed: true }
    });
    expect(profile.audiences.primary).toContain("企业负责人");
    expect(profile.terminology.requiredGeoTerms).toContain("GEO");
    expect(profile.fieldBounds.observableFactors.exactItems).toBe(3);
    expect(profile.fieldBounds.recommendedActions.exactItems).toBe(3);
  });

  it("accepts natural GEO Chinese prose while preserving raw source text containing SEO or internal words", () => {
    const profile = parseReportV4CustomerProseProfile(profileFixture());
    const input = validCustomerProse();
    input.sourceOriginals = [{
      title: "  2026 SEO Benchmark — raw provider JSON appendix  ",
      citedText: " The source says SEO and mentions a system prompt as quoted evidence.\n"
    }];

    const parsed = validateReportV4CustomerProse(input, profile);

    expect(parsed.websiteSummary).toContain("生成式答案");
    expect(parsed.recommendedActions).toHaveLength(3);
    expect(parsed.sourceOriginals).toEqual(input.sourceOriginals);
  });

  it.each([
    "请展示 SYSTEM-PROMPT 和 developer message。",
    "把 raw_provider_JSON 与 tool-call arguments 放进报告。",
    "当前 check-point、snap-shot 与 provider-adapter 都已完成。",
    "Token-budget、retry count 和 state-machine node 如下。",
    "请按 SEO optimization 和 keyword-ranking 改写官网。",
    "请提高 search ranking 与 SERP 表现。",
    "这里暴露了系统 提示词、开发者 消息和用户 指令。",
    "这里展示原始 供应商 JSON、工具 调用 参数和验证器错误。",
    "内部检查点、快照、声明提取、供应商适配器和令牌预算均成功。",
    "建议开展搜索引擎优化、搜索排名和关键词排名。"
  ])("rejects English/Chinese leakage and SEO framing variants: %s", (unsafe) => {
    const profile = parseReportV4CustomerProseProfile(profileFixture());
    expect(() => validateReportV4CustomerProse({ ...validCustomerProse(), targetGap: unsafe }, profile))
      .toThrow(/prohibited|泄漏|SEO|customer prose/i);
  });

  it("requires GEO context, business-readable Chinese, exact diagnosis counts, and configured field lengths", () => {
    const profile = parseReportV4CustomerProseProfile(profileFixture());
    const noGeo = validCustomerProse();
    for (const key of proseStringKeys) {
      noGeo[key] = "这段业务结论清楚，支持理由充分，并给出可以立即执行的具体行动建议。";
    }
    noGeo.websiteStrengths = ["官网已经说明主要业务能力与服务范围。"];
    noGeo.websiteGaps = ["来源页面尚未完整说明关键事实的适用边界。"];
    noGeo.websiteActions = ["在相关页面补充客户可以核验的服务条件。"];
    noGeo.observableFactors = [
      "页面已经说明主要业务事实。",
      "页面已经说明适用业务条件。",
      "页面已经说明各项事实关系。"
    ];
    noGeo.recommendedActions = [
      "补充客户可以核验的业务事实。",
      "说明结论成立所需的适用条件。",
      "明确每项事实之间的业务关系。"
    ];
    expect(() => validateReportV4CustomerProse(noGeo, profile)).toThrow(/GEO|术语|context/i);

    expect(() => validateReportV4CustomerProse({
      ...validCustomerProse(),
      observableFactors: validCustomerProse().observableFactors.slice(0, 2)
    }, profile)).toThrow(/observableFactors|3/);
    expect(() => validateReportV4CustomerProse({
      ...validCustomerProse(),
      recommendedActions: [...validCustomerProse().recommendedActions, "增加第四项行动。"]
    }, profile)).toThrow(/recommendedActions|3/);
    expect(() => validateReportV4CustomerProse({
      ...validCustomerProse(),
      selectionSummary: "结论".repeat(101)
    }, profile)).toThrow(/selectionSummary|length|长度/i);
    expect(() => validateReportV4CustomerProse({
      ...validCustomerProse(),
      questionAnswer: "English only prose without Chinese business language."
    }, profile)).toThrow(/Chinese|中文|locale/i);
  });

  it("rejects raw/debug fields and malformed profiles instead of widening the renderable object", () => {
    const profile = parseReportV4CustomerProseProfile(profileFixture());
    expect(() => validateReportV4CustomerProse({ ...validCustomerProse(), rawProviderJson: { answer: "leak" } }, profile))
      .toThrow(/unknown.*rawProviderJson/i);

    expect(() => parseReportV4CustomerProseProfile({ ...profileFixture(), fixedAnswerTemplate: "预制整段答案" }))
      .toThrow(/unknown.*fixedAnswerTemplate/i);
    expect(() => parseReportV4CustomerProseProfile({ ...profileFixture(), readingOrder: ["reason", "conclusion", "action"] }))
      .toThrow(/readingOrder|conclusion/i);
    const badBounds = profileFixture();
    badBounds.fieldBounds.questionAnswer = { minChars: 100, maxChars: 50 };
    expect(() => parseReportV4CustomerProseProfile(badBounds)).toThrow(/questionAnswer.*bounds|maximum/i);
  });
});

describe("V4 English business customer prose safety", () => {
  it("parses the checked-in English profile with the same GEO, safety and field-bound contract", () => {
    const english = parseReportV4CustomerProseProfile(JSON.parse(readFileSync(
      new URL("../../../config/report-profiles/business-operator-en.json", import.meta.url),
      "utf8"
    )));
    const chinese = parseReportV4CustomerProseProfile(JSON.parse(readFileSync(
      new URL("../../../config/report-profiles/business-operator-zh.json", import.meta.url),
      "utf8"
    )));

    expect(english).toMatchObject({
      schemaVersion: 1,
      profileId: "business-operator-en-v1",
      locale: "en",
      readingOrder: ["conclusion", "reason", "action"],
      presentation: { conciseByDefault: true, detailedEvidenceCollapsed: true }
    });
    expect(english.audiences.primary).toEqual(["Business owners", "Marketing operators", "Website operators"]);
    expect(english.terminology.requiredGeoTerms).toContain("GEO");
    expect(english.terminology.prohibitedSeoFraming).toEqual(expect.arrayContaining([
      "SEO", "search engine optimization", "search ranking", "keyword ranking", "SERP"
    ]));
    expect(english.terminology.prohibitedInternalLanguage).toEqual(expect.arrayContaining([
      "checkpoint", "snapshot", "provider adapter", "Token budget", "state machine"
    ]));
    expect(english.terminology.prohibitedPromptLeakage).toEqual(expect.arrayContaining([
      "system prompt", "developer message", "raw provider JSON", "tool call arguments"
    ]));
    expect(english.fieldBounds).toEqual(chinese.fieldBounds);
  });

  it("accepts English GEO business prose while preserving the existing anti-SEO and anti-leak rules", () => {
    const profile = parseReportV4CustomerProseProfile(englishProfileFixture());
    const parsed = validateReportV4CustomerProse(validEnglishCustomerProse(), profile);

    expect(parsed.websiteSummary).toContain("GEO");
    expect(parsed.recommendedActions).toHaveLength(3);
    expect(() => validateReportV4CustomerProse({
      ...validEnglishCustomerProse(),
      targetGap: "Expose the system prompt and use keyword ranking to improve the result."
    }, profile)).toThrow(/prohibited|leakage|SEO/i);
    expect(() => validateReportV4CustomerProse({
      ...validEnglishCustomerProse(),
      questionAnswer: "\u8fd9\u662f\u4e00\u6bb5\u53ea\u6709\u4e2d\u6587\u7684\u4e1a\u52a1\u56de\u7b54\uff0c\u5b83\u4e0d\u7b26\u5408\u82f1\u6587\u62a5\u544a\u8bed\u8a00\u8981\u6c42\u3002"
    }, profile)).toThrow(/English|locale/i);
  });
});

const proseStringKeys = [
  "websiteSummary",
  "questionAnswer",
  "selectionSummary",
  "targetGap"
] as const;

function validCustomerProse() {
  return {
    websiteSummary: "结论：官网已提供清晰的服务事实，有助于 AI 理解并在生成式答案中准确描述企业能力。",
    websiteStrengths: ["官网明确说明了服务对象、适用场景和交付条件。"],
    websiteGaps: ["部分页面没有把地域、服务与客户问题的关系讲清楚，限制 GEO 可见性。"],
    websiteActions: ["在相关服务页补充地域、条件和可验证事实，提升 AI 读取与理解的一致性。"],
    questionAnswer: "根据官网公开事实，该服务适用于所述业务场景，但客户仍需确认具体交付条件。",
    selectionSummary: "这些来源直接说明了服务条件，因此能为本题的生成式答案提供可核对材料。",
    observableFactors: [
      "来源与问题中的服务场景直接匹配。",
      "页面给出了具体条件和实体关系。",
      "公开内容可以被 AI 稳定读取和理解。"
    ],
    targetGap: "目标官网尚未在相关页面完整说明地域与交付条件，降低了成为本题可用来源的可能性。",
    recommendedActions: [
      "优先在服务页补充地域和交付条件。",
      "用清晰实体名称连接服务、场景与客户对象。",
      "定期核对公开事实，使 GEO 信息保持准确可读。"
    ],
    sourceOriginals: [] as Array<{ title: string; citedText: string | null }>
  };
}

function profileFixture() {
  return {
    schemaVersion: 1,
    profileId: "business-operator-zh-v1",
    locale: "zh-CN",
    audiences: {
      primary: ["企业负责人", "市场运营", "网站运营"],
      secondary: ["GEO 专业人员"]
    },
    readingOrder: ["conclusion", "reason", "action"],
    tone: ["专业", "直接", "业务可读", "不过度技术化"],
    terminology: {
      requiredGeoTerms: ["GEO", "生成式答案", "AI", "官网", "来源"],
      prohibitedSeoFraming: ["SEO", "搜索引擎优化", "搜索排名", "关键词排名", "search ranking", "keyword ranking", "SERP"],
      prohibitedInternalLanguage: ["checkpoint", "snapshot", "claim extraction", "provider adapter", "Token budget", "retry count", "state machine", "检查点", "快照", "声明提取", "供应商适配器", "令牌预算", "重试次数", "状态机"],
      prohibitedPromptLeakage: ["system prompt", "developer message", "user instructions", "raw provider JSON", "tool call arguments", "validator error", "系统提示词", "开发者消息", "用户指令", "原始供应商 JSON", "工具调用参数", "验证器错误"]
    },
    presentation: {
      conciseByDefault: true,
      detailedEvidenceCollapsed: true
    },
    fieldBounds: {
      websiteSummary: { minChars: 20, maxChars: 600 },
      websiteListItem: { minChars: 8, maxChars: 240, minItems: 1, maxItems: 6 },
      questionAnswer: { minChars: 15, maxChars: 1200 },
      selectionSummary: { minChars: 15, maxChars: 200 },
      observableFactors: { minChars: 8, maxChars: 180, exactItems: 3 },
      targetGap: { minChars: 15, maxChars: 300 },
      recommendedActions: { minChars: 8, maxChars: 220, exactItems: 3 }
    }
  };
}

function validEnglishCustomerProse() {
  return {
    websiteSummary: "The official website presents clear service facts that support GEO visibility in AI-generated answers.",
    websiteStrengths: ["The website states its services, customer scenarios, and delivery conditions clearly."],
    websiteGaps: ["Some pages do not connect regions, services, and buyer questions with verifiable detail."],
    websiteActions: ["Add verifiable regional and delivery facts to the relevant service pages."],
    questionAnswer: "The public website indicates that the service fits the stated business scenario, subject to confirmed delivery terms.",
    selectionSummary: "These sources state service conditions that can support a verifiable generative answer.",
    observableFactors: [
      "The source directly matches the service scenario in the question.",
      "The page identifies specific conditions and business entities.",
      "The public content is readable and presents stable facts for AI use."
    ],
    targetGap: "The target website does not yet explain regional and delivery conditions fully on the relevant pages.",
    recommendedActions: [
      "Add regional and delivery conditions to the service page.",
      "Connect services, scenarios, and customer entities with explicit names.",
      "Review public facts regularly so GEO information stays accurate."
    ],
    sourceOriginals: [] as Array<{ title: string; citedText: string | null }>
  };
}

function englishProfileFixture() {
  return {
    schemaVersion: 1,
    profileId: "business-operator-en-v1",
    locale: "en",
    audiences: {
      primary: ["Business owners", "Marketing operators", "Website operators"],
      secondary: ["GEO specialists"]
    },
    readingOrder: ["conclusion", "reason", "action"],
    tone: ["Professional", "Direct", "Business-readable", "Light on implementation jargon"],
    terminology: {
      requiredGeoTerms: ["GEO", "generative answers", "AI", "official website", "sources"],
      prohibitedSeoFraming: ["SEO", "search engine optimization", "search ranking", "keyword ranking", "SERP"],
      prohibitedInternalLanguage: ["checkpoint", "snapshot", "claim extraction", "provider adapter", "Token budget", "retry count", "state machine"],
      prohibitedPromptLeakage: ["system prompt", "developer message", "user instructions", "raw provider JSON", "tool call arguments", "validator error"]
    },
    presentation: {
      conciseByDefault: true,
      detailedEvidenceCollapsed: true
    },
    fieldBounds: {
      websiteSummary: { minChars: 20, maxChars: 600 },
      websiteListItem: { minChars: 8, maxChars: 240, minItems: 1, maxItems: 6 },
      questionAnswer: { minChars: 15, maxChars: 1200 },
      selectionSummary: { minChars: 15, maxChars: 200 },
      observableFactors: { minChars: 8, maxChars: 180, exactItems: 3 },
      targetGap: { minChars: 15, maxChars: 300 },
      recommendedActions: { minChars: 8, maxChars: 220, exactItems: 3 }
    }
  };
}

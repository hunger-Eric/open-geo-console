import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CombinedGeoReportArtifact } from "@/components/combined-geo-report-artifact";
import { combinedArtifactFixture } from "@/components/combined-geo-report-artifact.test";
import { combinedArtifactSystemCopy, renderCanonicalCombinedArtifactHtml } from "./combined-artifact-readiness";

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
});

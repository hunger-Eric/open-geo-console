import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe,expect,it } from "vitest";
import type { RecommendationPrivateReportArtifactModelV2 } from "@/report/artifact-model";
import { createTestSourceForensicReport } from "@/public-source-forensics/testing";
import { PublicSourceForensicsReportArtifact } from "./public-source-forensics-report-artifact";

describe("PublicSourceForensicsReportArtifact",()=>{
  it("renders customer-safe V2 evidence and excludes operator economics",()=>{
    const html=renderToStaticMarkup(createElement(PublicSourceForensicsReportArtifact,{model:model()}));
    expect(html.indexOf("买方问题与公开搜索范围")).toBeLessThan(html.indexOf("三项优先行动"));
    expect(html.indexOf("三项优先行动")).toBeLessThan(html.indexOf("供应商任务包"));
    expect(html).toContain("公开搜索结果顺序仅作为原始方法上下文，不代表 AI 排名");
    expect(html).toContain("确定性技术分数");
    expect(html).not.toContain("contributionMarginMicros"); expect(html).not.toContain("allocatedSharedCostMicros");
    expect(html).toContain(`/reports/report-v2/recommendation-report.html`); expect(html).toContain(`/api/reports/report-v2/artifacts/recommendation-report.pdf`);
  });
});
function model():RecommendationPrivateReportArtifactModelV2{return {productContract:"recommendation_forensics_v1",reportVersion:2,fulfillmentMethodology:"public_search_source_forensics_v1",reportId:"report-v2",locale:"zh",recommendationReport:createTestSourceForensicReport(),evidenceAssets:[],technicalReport:{url:"https://customer-logistics.example/",scannedAt:"2030-01-01T00:00:00.000Z",score:70,pages:[],findings:[],recommendations:[],machineReadableAssets:{robotsTxt:{url:"https://customer-logistics.example/robots.txt",present:true,summary:"ok"},sitemapXml:{url:"https://customer-logistics.example/sitemap.xml",present:true,summary:"ok"},llmsTxt:{url:"https://customer-logistics.example/llms.txt",present:false,summary:"missing"}}}};}

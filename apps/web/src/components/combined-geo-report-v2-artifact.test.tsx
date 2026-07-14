import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CombinedPrivateReportArtifactModelV2 } from "@/report/artifact-model";
import { combinedArtifactFixture } from "./combined-artifact-fixtures";
import { CombinedGeoReportV2Artifact } from "./combined-geo-report-v2-artifact";

describe("combined GEO report V2 artifact", () => {
  it("renders honest Chinese tiers and counters without internal evidence identities or PDF delivery", () => {
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV2Artifact, { model: fixture("zh") }));
    expect(html).toContain("全链路自营已证实");
    expect(html).toContain("核心环节自营已证实");
    expect(html).toContain("候选但证据不足");
    expect(html).toContain("计划查询");
    expect(html).toContain("成功安全抓取页面");
    expect(html).toContain("合作方");
    expect(html).toContain("未知");
    expect(html).toContain("Alpha Logistics offers a fixed dedicated route.");
    expect(html).not.toMatch(/query-|evidence-|snapshot-|inputHash|relevanceScore/);
    expect(html).not.toContain("PDF");
  });

  it("states the empty strict-list result instead of weakening qualification", () => {
    const model = fixture("en");
    model.combinedReport.providerDiscovery.strict = [];
    model.combinedReport.providerDiscovery.execution.strictProviders = 0;
    const html = renderToStaticMarkup(createElement(CombinedGeoReportV2Artifact, { model }));
    expect(html).toContain("No provider reached this strict tier");
    expect(html).toContain("Candidates with insufficient evidence");
  });
});

function fixture(locale: "en" | "zh"): CombinedPrivateReportArtifactModelV2 {
  const base = combinedArtifactFixture();
  const report = base.combinedReport;
  return {
    ...base,
    productContract: "combined_geo_report_v2",
    locale,
    combinedReport: {
      ...report,
      version: 2,
      artifactContract: "combined_geo_report_v2",
      locale: locale === "zh" ? "zh-CN" : "en-US",
      providerDiscovery: {
        version: "provider-discovery-v1",
        policy: { policyId: "logistics_self_operated_v1", policyVersion: "1" },
        identity: { candidateSetHash: "a".repeat(64), queryPlanVersion: "provider-query-plan-v1", passageSelectorVersion: "provider-passage-selector-v1", claimExtractionContract: "provider-claim-extraction-v1", claimExtractionModel: "fixture", claimSetHash: "b".repeat(64) },
        execution: { plannedQueries: 18, completedQueries: 16, returnedObservations: 42, safelyRetrievedPages: 12, relevantPassages: 7, discoveredProviders: 2, strictProviders: 1, candidateProviders: 1, rejectedProviders: 0, coverage: "partial" },
        strict: [{
          entityId: "provider-alpha", canonicalName: "Alpha Logistics", genericRole: "service_provider", policyRole: "carrier", tier: "verified_core_segments",
          serviceScope: ["dedicated line"], routeScope: ["Shanghai-Chengdu"], independentDomains: ["alpha.example", "authority.example"], evidenceIds: ["source-alpha"],
          capabilities: [{ dimensionId: "fixed_route", state: "verified", evidenceIds: ["source-alpha"], domains: ["alpha.example"], contradictory: false }, { dimensionId: "last_mile", state: "partner", evidenceIds: ["source-alpha"], domains: ["alpha.example"], contradictory: false }, { dimensionId: "customs_operation", state: "unknown", evidenceIds: [], domains: [], contradictory: false }]
        }],
        candidates: [{ entityId: "provider-beta", canonicalName: "Beta Freight", genericRole: "service_provider", policyRole: "carrier", leadEvidenceIds: ["source-beta"], missingProof: ["自有干线车队", "自营末端"] }],
        evidence: [
          { evidenceId: "source-alpha", sourceEvidenceId: "source-alpha", registrableDomain: "alpha.example", title: "Alpha service", sourceAuthority: "company_owned", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "Alpha Logistics offers a fixed dedicated route.", capability: "fixed_route" },
          { evidenceId: "source-beta", sourceEvidenceId: "source-beta", registrableDomain: "beta.example", title: "Beta service", sourceAuthority: "company_owned", observedAt: "2030-01-01T00:00:00.000Z", exactExcerpt: "Beta Freight advertises logistics services.", capability: "linehaul_fleet" }
        ],
        limitation: locale === "zh" ? "公开资料不足时保留为候选，不推断其拥有自营能力。" : "Evidence-limited providers remain candidates without inferred self-operated capabilities."
      },
      groundedAnswerEvidence: [
        { evidenceId: "answer-q2", questionId: "q2", subjectKey: "region", registrableDomain: "market.example", exactExcerpt: "Service coverage includes the target region.", eligible: true, direct: true },
        { evidenceId: "answer-q3", questionId: "q3", subjectKey: "risk", registrableDomain: "risk.example", exactExcerpt: "Capacity is subject to confirmation.", eligible: true, direct: true }
      ],
      businessQuestionAnswers: {
        version: "combined-business-question-answers-v2",
        synthesis: { mode: "claim_bound_model", modelId: "fixture", inputHash: "c".repeat(64) },
        answers: [
          { questionId: "q2", purpose: "customer_region_fit", claims: [{ claimId: "claim-q2", subjectKey: "region", text: locale === "zh" ? "公开证据显示服务覆盖目标区域。" : "Public evidence indicates service in the target region.", evidenceIds: ["answer-q2"], confidence: "limited", limitation: locale === "zh" ? "仅有一个直接来源。" : "Only one direct source is available." }] },
          { questionId: "q3", purpose: "purchase_delivery_risk", claims: [{ claimId: "claim-q3", subjectKey: "risk", text: locale === "zh" ? "运力需要在采购前再次确认。" : "Capacity requires confirmation before purchase.", evidenceIds: ["answer-q3"], confidence: "limited", limitation: locale === "zh" ? "未获得实时运力承诺。" : "No real-time capacity commitment was obtained." }] }
        ]
      }
    }
  } as CombinedPrivateReportArtifactModelV2;
}

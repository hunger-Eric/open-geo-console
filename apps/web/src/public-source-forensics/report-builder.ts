import { createHash } from "node:crypto";
import {
  calculateRecommendationForensicCost,
  parseRecommendationForensicReportV2,
  type AiWebsiteReportV1,
  type MarketSnapshotReferenceContract,
  type RecommendationForensicCostInput,
  type RecommendationForensicReportV2,
  type V2EvidenceBoundSection,
  type V2VendorTask
} from "@open-geo-console/ai-report-engine";
import type { PublicSourceEvidenceGraph } from "@open-geo-console/citation-intelligence";
import type { CanonicalBuyerQuestionSet, PublicSearchCoverage, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";

export interface PublicSourceForensicReportBuilderInput {
  reportId: string; jobId: string; targetUrl: string; locale: string; region: string;
  generatedAt: string; evidenceCutoffAt: string; questions: CanonicalBuyerQuestionSet;
  fanouts: SearchQueryFanout[]; authority: PublicSearchSurfaceAuthority;
  snapshotRefs: MarketSnapshotReferenceContract[]; coverage: PublicSearchCoverage;
  sourceGraph: PublicSourceEvidenceGraph; websiteFoundationAppendix: AiWebsiteReportV1;
  cost: RecommendationForensicCostInput; commercialOutcome: RecommendationForensicReportV2["commercialOutcome"];
  synthesis?: { modelId: string; inputHash: string };
}

export function buildPublicSourceForensicReport(input: PublicSourceForensicReportBuilderInput): RecommendationForensicReportV2 {
  const evidenceIds = input.sourceGraph.evidence.filter(({ grade }) => grade !== "D").map(({ evidenceId }) => evidenceId);
  const websiteFindingIds = input.websiteFoundationAppendix.findings.filter(({ evidence }) => evidence.length > 0).map(({ id }) => id);
  if (evidenceIds.length === 0 && websiteFindingIds.length === 0 && input.commercialOutcome !== "failed") {
    throw new Error("A deliverable V2 report requires public-source or website evidence.");
  }
  const refs = evidenceIds.length ? { evidenceIds: [evidenceIds[0]!], websiteFindingIds: [] as string[] }
    : { evidenceIds: [] as string[], websiteFindingIds: [websiteFindingIds[0]!] };
  const customerObserved = input.sourceGraph.entities.some(({ registrableDomains }) =>
    registrableDomains.includes(new URL(input.targetUrl).hostname));
  const section = (id: string, title: string, text: string): V2EvidenceBoundSection => ({ id, title, text, ...refs });
  const localized = input.locale.toLowerCase().startsWith("zh");
  const executiveVerdict = section("verdict", localized ? "公开来源结论" : "Public-source verdict",
    customerObserved
      ? (localized ? "公开来源证据中观察到与客户实体相关的信息。" : "Public-source evidence contains information associated with the customer entity.")
      : (localized ? "在本次有完整来源记录的公开搜索中未观察到客户实体；这不是任何 AI 模型的推荐结论。" : "The customer entity was not observed in this provenance-complete public search; this is not an AI-model recommendation conclusion."));
  const priorities = [
    section("priority-1", localized ? "强化可核验实体信息" : "Strengthen verifiable entity information", localized ? "依据已绑定证据，补强可被公开检索和核验的企业事实。" : "Use the bound evidence to strengthen public, verifiable company facts."),
    section("priority-2", localized ? "改善独立来源覆盖" : "Improve independent-source coverage", localized ? "依据已绑定证据，优先改善独立公开来源中的准确覆盖。" : "Use the bound evidence to improve accurate coverage across independent public sources."),
    section("priority-3", localized ? "建立可重复复测" : "Establish repeatable retesting", localized ? "依据已绑定证据，使用相同问题和来源窗口进行后续复测。" : "Use the bound evidence to retest the same questions and evidence window.")
  ] as RecommendationForensicReportV2["executivePriorities"];
  const questionIds = input.questions.questions.map(({ id }) => id);
  const tasks: V2VendorTask[] = priorities.map((priority, index) => ({ ...priority, id: `task-${index + 1}`,
    vendor: index === 0 ? "website" : index === 1 ? "communications" : "cross-functional",
    actions: [localized ? "根据绑定证据更新公开材料，并保留来源记录。" : "Update public materials from the bound evidence and retain source records."],
    acceptanceCriteria: [localized ? "每项更新均可追溯到报告中的证据 ID。" : "Every update resolves to an evidence ID in the report."],
    retestQuestionIds: questionIds
  }));
  const report: RecommendationForensicReportV2 = {
    version: 2, methodology: "public_search_source_forensics_v1", reportId: input.reportId, jobId: input.jobId,
    targetUrl: input.targetUrl, locale: input.locale, region: input.region, generatedAt: input.generatedAt,
    evidenceCutoffAt: input.evidenceCutoffAt, questions: input.questions, fanouts: input.fanouts,
    authority: input.authority, snapshotRefs: input.snapshotRefs, coverage: input.coverage, sourceGraph: input.sourceGraph,
    customerComparison: [section("customer-comparison", localized ? "客户与公开来源对照" : "Customer/public-source comparison",
      customerObserved ? (localized ? "客户实体在已绑定公开证据中可识别。" : "The customer entity is identifiable in the bound public evidence.")
        : (localized ? "客户实体在本次已绑定公开证据中未被观察到。" : "The customer entity was not observed in this run's bound public evidence."))],
    executiveVerdict, executivePriorities: priorities, vendorTaskPackage: { version: "vendor-task-v2", tasks },
    websiteFoundationAppendix: input.websiteFoundationAppendix,
    customerCostDisclosure: { freshness: input.snapshotRefs.every(({ freshness }) => freshness === "fresh") ? "fresh" : "mixed",
      collectedNewObservation: input.snapshotRefs.some(({ collectedForThisRun }) => collectedForThisRun) },
    operatorCostAccounting: calculateRecommendationForensicCost(input.cost),
    synthesisProvenance: input.synthesis ? { mode: "evidence_constrained_model", ...input.synthesis }
      : { mode: "deterministic_template", inputHash: hash({ sourceGraph: input.sourceGraph, snapshotRefs: input.snapshotRefs }) },
    limitations: [localized ? "公开搜索顺序不代表 AI 排名，也不保证未来结果。" : "Public-search order is not an AI ranking and does not guarantee future outcomes."],
    commercialOutcome: input.commercialOutcome
  };
  return parseRecommendationForensicReportV2(report);
}

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

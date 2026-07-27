import {
  parseCanonicalBuyerQuestionSet,
  parsePublicSearchSurfaceAuthority,
  parseSearchQueryFanout,
  type CanonicalBuyerQuestionSet,
  type PublicSearchCoverage,
  type PublicSearchSurfaceAuthority,
  type SearchQueryFanout
} from "@open-geo-console/public-search-observer";
import type { PublicSourceEvidenceGraph } from "@open-geo-console/citation-intelligence";
import type { AiWebsiteReportV1 } from "./types";
import { parseAiWebsiteReportV1 } from "./validation";
import { verifyRecommendationForensicV2Claims, type EvidenceBoundV2Claim } from "./recommendation-forensic-v2-claims";
import { calculateRecommendationForensicCost, type RecommendationForensicCostAccounting } from "./recommendation-forensic-cost";

export const RECOMMENDATION_FORENSIC_REPORT_V2_VERSION = 2 as const;
export const PUBLIC_SEARCH_SOURCE_FORENSICS_METHODOLOGY = "public_search_source_forensics_v1" as const;

export interface MarketSnapshotReferenceContract {
  snapshotId: string; questionId: string; queryVariantIds: string[]; observationIds: string[];
  freshness: "fresh" | "stale" | "expired"; observedAt: string; collectedForThisRun: boolean;
}
export interface V2EvidenceBoundSection extends EvidenceBoundV2Claim { id: string; title: string; }
export interface V2VendorTask extends V2EvidenceBoundSection {
  vendor: "website" | "content" | "seo" | "communications" | "cross-functional";
  actions: string[]; acceptanceCriteria: string[]; retestQuestionIds: string[];
}
export interface RecommendationForensicReportV2 {
  version: typeof RECOMMENDATION_FORENSIC_REPORT_V2_VERSION;
  methodology: typeof PUBLIC_SEARCH_SOURCE_FORENSICS_METHODOLOGY;
  reportId: string; jobId: string; targetUrl: string; locale: string; region: string;
  generatedAt: string; evidenceCutoffAt: string;
  questions: CanonicalBuyerQuestionSet;
  fanouts: SearchQueryFanout[];
  authority: PublicSearchSurfaceAuthority;
  snapshotRefs: MarketSnapshotReferenceContract[];
  coverage: PublicSearchCoverage;
  sourceGraph: PublicSourceEvidenceGraph;
  customerComparison: V2EvidenceBoundSection[];
  executiveVerdict: V2EvidenceBoundSection;
  executivePriorities: [V2EvidenceBoundSection, V2EvidenceBoundSection, V2EvidenceBoundSection];
  vendorTaskPackage: { version: "vendor-task-v2"; tasks: V2VendorTask[] };
  websiteFoundationAppendix: AiWebsiteReportV1;
  customerCostDisclosure: { freshness: "fresh" | "mixed" | "stale"; collectedNewObservation: boolean };
  operatorCostAccounting: RecommendationForensicCostAccounting;
  synthesisProvenance: { mode: "deterministic_template" | "evidence_constrained_model"; modelId?: string; inputHash: string };
  limitations: string[];
  commercialOutcome: "completed" | "completed_limited" | "failed";
}

export function parseRecommendationForensicReportV2(value: unknown): RecommendationForensicReportV2 {
  const report = object(value, "$");
  exact(report.version, 2, "$.version");
  exact(report.methodology, PUBLIC_SEARCH_SOURCE_FORENSICS_METHODOLOGY, "$.methodology");
  const reportId = text(report.reportId, "$.reportId");
  text(report.jobId, "$.jobId");
  httpUrl(report.targetUrl, "$.targetUrl");
  const locale = text(report.locale, "$.locale");
  const region = text(report.region, "$.region");
  timestamp(report.generatedAt, "$.generatedAt");
  timestamp(report.evidenceCutoffAt, "$.evidenceCutoffAt");
  const questions = parseCanonicalBuyerQuestionSet(report.questions);
  if (questions.locale !== locale || questions.region !== region) fail("$.questions", "Question locale/region must match the report.");
  const authority = parsePublicSearchSurfaceAuthority(report.authority);
  if (!authority.active) fail("$.authority.active", "Report authority must be active.");
  if (authority.surface.locale !== locale || authority.surface.region !== region) fail("$.authority", "Authority locale/region must match the report.");
  const fanouts = array(report.fanouts, "$.fanouts").map(parseSearchQueryFanout);
  const questionIds = new Set(questions.questions.map(({ id }) => id));
  if (fanouts.length !== questionIds.size || fanouts.some((fanout) => !questionIds.has(fanout.questionId) || fanout.surface.surfaceId !== authority.surface.surfaceId)) {
    fail("$.fanouts", "Every question requires one exact-authority fanout.");
  }
  const snapshotRefs = array(report.snapshotRefs, "$.snapshotRefs").map(parseSnapshotRef);
  const queryIds = new Set(fanouts.flatMap(({ queries }) => queries.map(({ id }) => id)));
  const referencedQueryIds = snapshotRefs.flatMap(({ queryVariantIds }) => queryVariantIds);
  if (snapshotRefs.length !== questionIds.size || snapshotRefs.some((ref) => !questionIds.has(ref.questionId)) ||
      referencedQueryIds.length !== queryIds.size || referencedQueryIds.some((id) => !queryIds.has(id))) {
    fail("$.snapshotRefs", "Every question and fanout query requires one bound market snapshot reference.");
  }
  if (new Set(snapshotRefs.map(({ snapshotId }) => snapshotId)).size !== snapshotRefs.length ||
      new Set(snapshotRefs.map(({ questionId }) => questionId)).size !== snapshotRefs.length || new Set(referencedQueryIds).size !== referencedQueryIds.length) {
    fail("$.snapshotRefs", "Snapshot and query references must be unique.");
  }
  const graph = object(report.sourceGraph, "$.sourceGraph") as unknown as PublicSourceEvidenceGraph;
  exact(graph.version, "public-source-evidence-graph-v1", "$.sourceGraph.version");
  const evidenceIds = uniqueIds(graph.evidence, "evidenceId", "$.sourceGraph.evidence");
  const graphQueryIds = new Set(graph.dimensions.queryVariantIds);
  if (graphQueryIds.size !== queryIds.size || [...queryIds].some((id) => !graphQueryIds.has(id))) {
    fail("$.sourceGraph.dimensions.queryVariantIds", "Source graph must cover the exact report query variants.");
  }
  const appendix = parseAiWebsiteReportV1(report.websiteFoundationAppendix);
  if (appendix.targetUrl !== report.targetUrl || !sameLanguageLocale(appendix.provenance.locale, locale)) fail("$.websiteFoundationAppendix", "Appendix must match target and language locale.");
  const websiteFindingIds = new Set(appendix.findings.map(({ id }) => id));
  const comparison = array(report.customerComparison, "$.customerComparison").map((item, i) => parseSection(item, `$.customerComparison[${i}]`));
  const verdict = parseSection(report.executiveVerdict, "$.executiveVerdict");
  const priorities = array(report.executivePriorities, "$.executivePriorities").map((item, i) => parseSection(item, `$.executivePriorities[${i}]`));
  if (priorities.length !== 3) fail("$.executivePriorities", "Expected exactly three priorities.");
  const taskPackage = object(report.vendorTaskPackage, "$.vendorTaskPackage");
  exact(taskPackage.version, "vendor-task-v2", "$.vendorTaskPackage.version");
  const tasks = array(taskPackage.tasks, "$.vendorTaskPackage.tasks").map(parseTask);
  if (tasks.some(({ retestQuestionIds }) => retestQuestionIds.length === 0 || retestQuestionIds.some((id) => !questionIds.has(id)))) {
    fail("$.vendorTaskPackage.tasks", "Every vendor task requires known retest question IDs.");
  }
  verifyRecommendationForensicV2Claims([...comparison, verdict, ...priorities, ...tasks], evidenceIds, websiteFindingIds);
  parseCoverage(report.coverage, queryIds.size);
  parseCustomerDisclosure(report.customerCostDisclosure);
  parseOperatorCost(report.operatorCostAccounting);
  parseSynthesis(report.synthesisProvenance);
  stringArray(report.limitations, "$.limitations");
  if (!["completed", "completed_limited", "failed"].includes(report.commercialOutcome as string)) fail("$.commercialOutcome", "Unsupported outcome.");
  return value as RecommendationForensicReportV2;
}

function parseSnapshotRef(value: unknown): MarketSnapshotReferenceContract { const v=object(value,"snapshotRef"); return { snapshotId:text(v.snapshotId,"snapshotRef.snapshotId"), questionId:text(v.questionId,"snapshotRef.questionId"), queryVariantIds:stringArray(v.queryVariantIds,"snapshotRef.queryVariantIds"), observationIds:stringArray(v.observationIds,"snapshotRef.observationIds"), freshness: oneOf(v.freshness,["fresh","stale","expired"],"snapshotRef.freshness"), observedAt:timestamp(v.observedAt,"snapshotRef.observedAt"), collectedForThisRun:boolean(v.collectedForThisRun,"snapshotRef.collectedForThisRun") }; }
function parseSection(value: unknown,path:string): V2EvidenceBoundSection { const v=object(value,path); return { id:text(v.id,`${path}.id`), title:text(v.title,`${path}.title`), text:text(v.text,`${path}.text`), evidenceIds:stringArray(v.evidenceIds,`${path}.evidenceIds`), websiteFindingIds:stringArray(v.websiteFindingIds,`${path}.websiteFindingIds`) }; }
function parseTask(value: unknown,index:number): V2VendorTask { const path=`$.vendorTaskPackage.tasks[${index}]`, v=object(value,path), base=parseSection(value,path); return { ...base, vendor:oneOf(v.vendor,["website","content","seo","communications","cross-functional"],`${path}.vendor`), actions:stringArray(v.actions,`${path}.actions`), acceptanceCriteria:stringArray(v.acceptanceCriteria,`${path}.acceptanceCriteria`), retestQuestionIds:stringArray(v.retestQuestionIds,`${path}.retestQuestionIds`) }; }
function parseCoverage(value: unknown, expected:number){ const v=object(value,"$.coverage"); oneOf(v.status,["complete","partial","insufficient"],"$.coverage.status"); for(const k of ["completedQueryCount","expectedQueryCount","observedResultCount","surfaceDomainCount"]) nonnegative(v[k],`$.coverage.${k}`); if(v.expectedQueryCount!==expected) fail("$.coverage.expectedQueryCount","Coverage denominator must equal canonical question count."); stringArray(v.reasons,"$.coverage.reasons"); }
function parseCustomerDisclosure(value:unknown){ const v=object(value,"$.customerCostDisclosure"); oneOf(v.freshness,["fresh","mixed","stale"],"$.customerCostDisclosure.freshness"); boolean(v.collectedNewObservation,"$.customerCostDisclosure.collectedNewObservation"); }
function parseOperatorCost(value:unknown){ const v=object(value,"$.operatorCostAccounting"); const baseKeys=["searchCostMicros","retrievalCostMicros","synthesisCostMicros","artifactCostMicros","deliveryCostMicros","allocatedSharedCostMicros","avoidedCostMicros","priceMicros","refundMicros"] as const; for(const k of [...baseKeys,"actualIncrementalCostMicros","netRevenueMicros"] as const) nonnegative(v[k],`$.operatorCostAccounting.${k}`); if(!Number.isSafeInteger(v.contributionMarginMicros)) fail("$.operatorCostAccounting.contributionMarginMicros","Expected a safe integer."); const base=Object.fromEntries(baseKeys.map((key)=>[key,v[key]])) as unknown as Parameters<typeof calculateRecommendationForensicCost>[0]; const expected=calculateRecommendationForensicCost(base); for(const key of ["actualIncrementalCostMicros","netRevenueMicros","contributionMarginMicros"] as const) if(v[key]!==expected[key]) fail(`$.operatorCostAccounting.${key}`,"Cost accounting does not reconcile."); }
function parseSynthesis(value:unknown){ const v=object(value,"$.synthesisProvenance"); const mode=oneOf(v.mode,["deterministic_template","evidence_constrained_model"],"$.synthesisProvenance.mode"); text(v.inputHash,"$.synthesisProvenance.inputHash"); if(mode==="evidence_constrained_model") text(v.modelId,"$.synthesisProvenance.modelId"); }
function uniqueIds(value:unknown,key:string,path:string){ const ids=new Set(array(value,path).map((item,i)=>text(object(item,`${path}[${i}]`)[key],`${path}[${i}].${key}`))); if(ids.size!==array(value,path).length) fail(path,"IDs must be unique."); return ids; }
function object(v:unknown,p:string):Record<string,unknown>{ if(!v||typeof v!=="object"||Array.isArray(v)) fail(p,"Expected an object."); return v as Record<string,unknown>; }
function array(v:unknown,p:string):unknown[]{ if(!Array.isArray(v)) fail(p,"Expected an array."); return v; }
function text(v:unknown,p:string):string{ if(typeof v!=="string"||!v.trim()) fail(p,"Expected non-empty text."); return v; }
function stringArray(v:unknown,p:string):string[]{ return array(v,p).map((x,i)=>text(x,`${p}[${i}]`)); }
function timestamp(v:unknown,p:string):string{ const s=text(v,p); if(!Number.isFinite(Date.parse(s))) fail(p,"Expected a timestamp."); return s; }
function httpUrl(v:unknown,p:string){ const s=text(v,p); try{ const u=new URL(s); if(!/^https?:$/.test(u.protocol)) throw 0; }catch{ fail(p,"Expected an HTTP(S) URL."); } }
function exact(v:unknown,e:unknown,p:string){ if(v!==e) fail(p,`Expected ${String(e)}.`); }
function oneOf<T extends string>(v:unknown,values:readonly T[],p:string):T{ if(!values.includes(v as T)) fail(p,"Unsupported value."); return v as T; }
function boolean(v:unknown,p:string):boolean{ if(typeof v!=="boolean") fail(p,"Expected a boolean."); return v; }
function nonnegative(v:unknown,p:string):number{ if(!Number.isSafeInteger(v)||(v as number)<0) fail(p,"Expected a non-negative safe integer."); return v as number; }
function sameLanguageLocale(left:string,right:string):boolean{ const language=(value:string)=>value.trim().toLowerCase().split(/[-_]/,1)[0]; return Boolean(language(left))&&language(left)===language(right); }
function fail(path:string,message:string):never{ throw new TypeError(`${path}: ${message}`); }

import { describe, expect, it, vi } from "vitest";
import type { RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { MarketSearchObservation, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";
import { createTestWebsiteFoundation } from "../public-source-forensics/testing";
import { PublicSourceArtifactUnavailableError, PublicSourceResumeIdentityMismatchError, runPublicSourceForensicsPipeline, type PublicSourceForensicsDependencies, type PublicSourcePipelineCheckpoint } from "./public-source-forensics";

const surface = { surfaceId:"fixture-surface",providerId:"fixture-index",productId:"fixture-search",surfaceKind:"documented_api" as const,
  contractVersion:"public-search-surface-v1",surfaceVersion:"fixture-v1",adapterVersion:"fixture-adapter-v1",locale:"zh-CN",region:"CN" };
const authority: PublicSearchSurfaceAuthority = { authorityId:"fixture-authority",environment:"test",surface,active:true,
  certifiedAt:"2030-01-01T00:00:00.000Z",evidenceReference:"fixture://review",supportedLocales:[surface.locale],supportedRegions:[surface.region] };

describe("public-source forensics pipeline", () => {
  it("creates three chargeable snapshots once and reuses them for an equivalent second report", async () => {
    const cache = new Map<string, ReturnType<typeof snapshot>>();
    const reports = new Map<string, RecommendationForensicReportV2>();
    const checkpoints = new Map<string, PublicSourcePipelineCheckpoint>();
    let chargeableAttempts = 0;
    const retrievalGates = new Set<unknown>();
    const dependencies = deps({ reports, checkpoints, resolve: async ({ fanout, retrievalGate }) => {
      retrievalGates.add(retrievalGate);
      expect(fanout.budget.maxResults).toBe(3);
      expect(fanout.queries).toHaveLength(6);
      expect(fanout.queries.every(({ resultDepth }) => resultDepth === 3)).toBe(true);
      const key=fanout.questionId; const existing=cache.get(key); if(existing) return {...existing,collectedForThisRun:false,actualCostMicros:0,avoidedCostMicros:10};
      chargeableAttempts++; const created=snapshot(fanout,chargeableAttempts); cache.set(key,created); return created;
    }});
    const first = await run("report-a","job-a",dependencies);
    const second = await run("report-b","job-b",dependencies);
    expect(chargeableAttempts).toBe(3);
    expect(first.report.snapshotRefs).toHaveLength(3);
    expect(first.report.customerCostDisclosure.collectedNewObservation).toBe(true);
    expect(second.report.customerCostDisclosure.collectedNewObservation).toBe(false);
    expect(second.report.operatorCostAccounting.avoidedCostMicros).toBe(30);
    expect(retrievalGates.size).toBe(2);
  });

  it("persists the artifact-verification boundary before a real artifact gate failure", async () => {
    const reports=new Map<string,RecommendationForensicReportV2>(), checkpoints=new Map<string,PublicSourcePipelineCheckpoint>();
    const order:string[]=[];
    const prepareArtifactVerification=vi.fn(async()=>{order.push("checkpoint");});
    const closed=deps({reports,checkpoints,prepareArtifactVerification,artifactReadiness:{async verify(){order.push("artifact"); throw new PublicSourceArtifactUnavailableError();}},resolve:async({fanout},index=0)=>snapshot(fanout,index)});
    await expect(run("report-c","job-c",closed)).rejects.toBeInstanceOf(PublicSourceArtifactUnavailableError);
    expect(order).toEqual(["checkpoint","artifact"]);
    expect(prepareArtifactVerification).toHaveBeenCalledWith(expect.objectContaining({ jobId:"job-c", report:expect.objectContaining({ reportId:"report-c" }) }));
  });

  it("refuses resume identity drift", async () => {
    const reports=new Map<string,RecommendationForensicReportV2>();
    const drifted=deps({reports,checkpoints:new Map([["job-d",{identityHash:"wrong",methodology:"public_search_source_forensics_v1",questionSetVersion:"wrong",fanoutVersion:"wrong",authorityId:"wrong",snapshotIds:[],websiteFoundationHash:"wrong",evidenceCutoffAt:"2030-01-02T00:00:00.000Z",locale:"zh-CN",region:"CN",adapterIdentityHash:"wrong"}]]),resolve:async({fanout})=>snapshot(fanout,1)});
    await expect(run("report-d","job-d",drifted)).rejects.toBeInstanceOf(PublicSourceResumeIdentityMismatchError);
  });
});

function deps(input:{reports:Map<string,RecommendationForensicReportV2>;checkpoints:Map<string,PublicSourcePipelineCheckpoint>;resolve:PublicSourceForensicsDependencies["resolveSnapshot"];artifactReadiness?:PublicSourceForensicsDependencies["artifactReadiness"];prepareArtifactVerification?:PublicSourceForensicsDependencies["prepareArtifactVerification"]}):PublicSourceForensicsDependencies{
  return {authority,resolveSnapshot:input.resolve,getCheckpoint:async(id)=>input.checkpoints.get(id)??null,saveCheckpoint:async(id,c)=>{input.checkpoints.set(id,c);},
    getReport:async(id)=>input.reports.get(id)??null,saveReport:async(value)=>{const report=value as RecommendationForensicReportV2;input.reports.set(report.jobId,report);return report;},
    artifactReadiness:input.artifactReadiness??{async verify(){}},prepareArtifactVerification:input.prepareArtifactVerification,now:()=>new Date("2030-01-02T00:00:00.000Z"),costCapMicros:1000};
}
function run(reportId:string,jobId:string,dependencies:PublicSourceForensicsDependencies){return runPublicSourceForensicsPipeline({reportId,jobId,locale:"zh-CN",region:"CN",targetUrl:"https://customer-logistics.example/",websiteFoundation:createTestWebsiteFoundation(),dependencies});}
function snapshot(fanout:SearchQueryFanout,index:number){
  const observations:MarketSearchObservation[]=fanout.queries.map((query,order)=>({observationId:`obs-${fanout.questionId}-${order}`,surface,queryId:query.id,exactQuery:query.exactQuery,
    requestedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",status:"complete",results:[{surfaceResultOrder:0,url:`https://source-${index}-${order}.example/fact`,title:"公开货运资料",snippet:"公开资料描述货运能力。",displayedHost:`source-${index}-${order}.example`}],usage:{requestCount:1,resultCount:1,estimatedCostMicros:1}}));
  return {snapshotId:`snapshot-${fanout.questionId}`,cacheIdentity:`cache-${fanout.questionId}`,questionId:fanout.questionId,observedAt:"2030-01-01T00:00:01.000Z",ageMs:24*60*60*1000,collectedForThisRun:true,
    refreshAttempted:false,refreshFailed:false,sufficientlyEvidenced:true,observations,retrievals:observations.flatMap((observation)=>observation.results.map((result)=>({observationId:observation.observationId,queryId:observation.queryId,resultUrl:result.url,retrievalState:"available" as const,publiclyRoutable:true,robotsAllowed:true,accessBarrier:"none" as const,contentBytes:100,normalizedText:"公开资料描述货运能力。",normalizedContentHash:`sha256:${"a".repeat(64)}`,verifiedExcerpt:"公开资料描述货运能力。"}))),actualCostMicros:10,allocatedCostMicros:0,avoidedCostMicros:0};
}

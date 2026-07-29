import { describe, expect, it, vi } from "vitest";
import type { RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import type { MarketSearchObservation, PublicSearchSurfaceAuthority, SearchQueryFanout } from "@open-geo-console/public-search-observer";
import { createTestWebsiteFoundation } from "../public-source-forensics/testing";
import { buildPublicSourceForensicReport } from "../public-source-forensics/report-builder";
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

  it("resumes by exact prior snapshot IDs even when they completed after the evidence cutoff", async () => {
    const checkpoints=new Map<string,PublicSourcePipelineCheckpoint>();
    const store=new Map<string,ReturnType<typeof snapshot>>();
    const first=deps({reports:new Map(),checkpoints,resolve:async({fanout})=>{const created=snapshot(fanout,1);store.set(created.snapshotId,created);return created;}});
    await run("report-f","job-f",first);
    const prior=checkpoints.get("job-f")!;
    expect(prior.snapshotIds).toHaveLength(3);
    // The paid-job failure mode: the job's own snapshots completed after its
    // persisted evidenceCutoffAt, so the `completed_at <= cutoff` cache search
    // can never find them on retry. Exact-ID resume must still reuse them.
    for(const [id,stored] of store) store.set(id,{...stored,observedAt:"2030-01-03T00:00:00.000Z"});
    let recollections=0;
    const retry=deps({reports:new Map(),checkpoints,resolve:async({fanout})=>{recollections++;return {...snapshot(fanout,2),snapshotId:`recollected-${fanout.questionId}`};},
      resolveById:async({snapshotId})=>store.get(snapshotId)??null});
    const resumed=await run("report-f-retry","job-f",retry);
    expect(recollections).toBe(0);
    expect(resumed.checkpoint.identityHash).toBe(prior.identityHash);
    expect(resumed.checkpoint.snapshotIds).toEqual(prior.snapshotIds);
    expect(resumed.report.snapshotRefs.map(({snapshotId})=>snapshotId)).toEqual(prior.snapshotIds);
  });

  it("re-collects a missing exact ID and updates the checkpoint to the new fetch", async () => {
    const checkpoints=new Map<string,PublicSourcePipelineCheckpoint>();
    const store=new Map<string,ReturnType<typeof snapshot>>();
    const first=deps({reports:new Map(),checkpoints,resolve:async({fanout})=>{const created=snapshot(fanout,1);store.set(created.snapshotId,created);return created;}});
    await run("report-g","job-g",first);
    const prior=checkpoints.get("job-g")!;
    store.delete(prior.snapshotIds[1]!);
    let byIdCalls=0,recollections=0;
    const retry=deps({reports:new Map(),checkpoints,resolve:async({fanout})=>{recollections++;return {...snapshot(fanout,2),snapshotId:`recollected-${fanout.questionId}`};},
      resolveById:async({snapshotId})=>{byIdCalls++;return store.get(snapshotId)??null;}});
    const resumed=await run("report-g-retry","job-g",retry);
    expect(byIdCalls).toBe(3);
    expect(recollections).toBe(1);
    const expectedIds=prior.snapshotIds.map((id,index)=>index===1?id.replace(/^snapshot-/,"recollected-"):id);
    expect(resumed.checkpoint.snapshotIds).toEqual(expectedIds);
    expect(resumed.checkpoint.identityHash).not.toBe(prior.identityHash);
    expect(checkpoints.get("job-g")!.snapshotIds).toEqual(expectedIds);
    expect(resumed.report.snapshotRefs.map(({snapshotId})=>snapshotId)).toEqual(expectedIds);
  });

  it("stays fail-closed when a resumed snapshot identity contradicts the checkpoint", async () => {
    const checkpoints=new Map<string,PublicSourcePipelineCheckpoint>();
    const store=new Map<string,ReturnType<typeof snapshot>>();
    const first=deps({reports:new Map(),checkpoints,resolve:async({fanout})=>{const created=snapshot(fanout,1);store.set(created.snapshotId,created);return created;}});
    await run("report-h","job-h",first);
    const retry=deps({reports:new Map(),checkpoints,resolve:async({fanout})=>snapshot(fanout,2),
      resolveById:async({snapshotId})=>{const stored=store.get(snapshotId);return stored?{...stored,snapshotId:`foreign-${snapshotId}`}:null;}});
    await expect(run("report-h-retry","job-h",retry)).rejects.toBeInstanceOf(PublicSourceResumeIdentityMismatchError);
  });

  it("keeps explicit legacy builder input identical and forwards only an explicit deferred seam", async () => {
    const makeDependencies = () => {
      const buildReport = vi.fn(buildPublicSourceForensicReport);
      const dependencies = {
        ...deps({
          reports: new Map(),
          checkpoints: new Map(),
          resolve: async ({ fanout }) => snapshot(fanout, 1)
        }),
        buildReport
      };
      return { buildReport, dependencies };
    };
    const omitted = makeDependencies();
    const explicit = makeDependencies();
    const deferred = makeDependencies();
    const omittedResult = await run("report-e", "job-e", omitted.dependencies);
    const explicitResult = await run("report-e", "job-e", explicit.dependencies, "legacy");
    await run("report-e", "job-e", deferred.dependencies, "deferred");
    expect(explicit.buildReport.mock.calls).toEqual(omitted.buildReport.mock.calls);
    expect(explicitResult.report).toEqual(omittedResult.report);
    expect(deferred.buildReport).toHaveBeenCalledWith(expect.objectContaining({ semanticValidation: "deferred" }));
  });
});

function deps(input:{reports:Map<string,RecommendationForensicReportV2>;checkpoints:Map<string,PublicSourcePipelineCheckpoint>;resolve:PublicSourceForensicsDependencies["resolveSnapshot"];resolveById?:PublicSourceForensicsDependencies["resolveSnapshotById"];artifactReadiness?:PublicSourceForensicsDependencies["artifactReadiness"];prepareArtifactVerification?:PublicSourceForensicsDependencies["prepareArtifactVerification"]}):PublicSourceForensicsDependencies{
  return {authority,resolveSnapshot:input.resolve,...(input.resolveById?{resolveSnapshotById:input.resolveById}:{}),getCheckpoint:async(id)=>input.checkpoints.get(id)??null,saveCheckpoint:async(id,c)=>{input.checkpoints.set(id,c);},
    getReport:async(id)=>input.reports.get(id)??null,saveReport:async(value)=>{const report=value as RecommendationForensicReportV2;input.reports.set(report.jobId,report);return report;},
    artifactReadiness:input.artifactReadiness??{async verify(){}},prepareArtifactVerification:input.prepareArtifactVerification,now:()=>new Date("2030-01-02T00:00:00.000Z"),costCapMicros:1000};
}
function run(reportId:string,jobId:string,dependencies:PublicSourceForensicsDependencies,semanticValidation?:"legacy"|"deferred"){return runPublicSourceForensicsPipeline({reportId,jobId,locale:"zh-CN",region:"CN",targetUrl:"https://customer-logistics.example/",websiteFoundation:createTestWebsiteFoundation(),dependencies,semanticValidation});}
function snapshot(fanout:SearchQueryFanout,index:number){
  const observations:MarketSearchObservation[]=fanout.queries.map((query,order)=>({observationId:`obs-${fanout.questionId}-${order}`,surface,queryId:query.id,exactQuery:query.exactQuery,
    requestedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",status:"complete",results:[{surfaceResultOrder:0,url:`https://source-${index}-${order}.example/fact`,title:"公开货运资料",snippet:"公开资料描述货运能力。",displayedHost:`source-${index}-${order}.example`}],usage:{requestCount:1,resultCount:1,estimatedCostMicros:1}}));
  return {snapshotId:`snapshot-${fanout.questionId}`,cacheIdentity:`cache-${fanout.questionId}`,questionId:fanout.questionId,observedAt:"2030-01-01T00:00:01.000Z",ageMs:24*60*60*1000,collectedForThisRun:true,
    refreshAttempted:false,refreshFailed:false,sufficientlyEvidenced:true,availableSourceCount:6,observations,retrievals:observations.flatMap((observation)=>observation.results.map((result)=>({observationId:observation.observationId,queryId:observation.queryId,resultUrl:result.url,retrievalState:"available" as const,publiclyRoutable:true,robotsAllowed:true,accessBarrier:"none" as const,contentBytes:100,normalizedText:"公开资料描述货运能力。",normalizedContentHash:`sha256:${"a".repeat(64)}`,verifiedExcerpt:"公开资料描述货运能力。"}))),actualCostMicros:10,allocatedCostMicros:0,avoidedCostMicros:0};
}

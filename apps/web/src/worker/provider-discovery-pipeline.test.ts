import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { runProviderDiscoveryPipeline, type ProviderDiscoveryCheckpointV1, type ProviderDiscoveryPipelineDependencies } from "./provider-discovery-pipeline";

describe("provider discovery recoverable pipeline", () => {
  it("resumes after candidate verification without repeating search", async () => {
    let checkpoint: ProviderDiscoveryCheckpointV1 | null = null;
    const calls={discovery:0,verification:0,passages:0};
    await expect(runProviderDiscoveryPipeline(runInput(dependencies({get:()=>checkpoint,set:(value)=>{checkpoint=value;},calls,failPassages:true})))).rejects.toThrow(/passage fixture/i);
    await runProviderDiscoveryPipeline(runInput(dependencies({get:()=>checkpoint,set:(value)=>{checkpoint=value;},calls})));
    expect(calls).toEqual({discovery:1,verification:1,passages:2});
  });
  it("completes with zero strict providers and reports partial coverage", async () => {
    const result=await runProviderDiscoveryPipeline(runInput(dependencies({})));
    expect(result.providerDiscovery.strict).toEqual([]);
    expect(result.providerDiscovery.candidates.length).toBeGreaterThan(0);
    expect(result.coverage.status).toBe("partial");
    expect(result.checkpoint.phase).toBe("complete");
  });
  it.each(["policyVersion","adapterIdentityHash","claimExtractionModel","evidenceCutoffAt","questionSetIdentity"] as const)("rejects resumed %s mismatch", async (field) => {
    let checkpoint: ProviderDiscoveryCheckpointV1|null=null;
    await runProviderDiscoveryPipeline(runInput(dependencies({set:(value)=>{checkpoint=value;}})));
    const changed={...identity(),[field]:field==="evidenceCutoffAt"?"2030-01-01T00:00:01.000Z":`${identity()[field]}-changed`};
    await expect(runProviderDiscoveryPipeline({...runInput(dependencies({get:()=>checkpoint})),identity:changed})).rejects.toThrow(/identity/i);
  });
  it("stops scheduling work after the hard deadline", async()=>{
    const deps=dependencies({}); deps.now=()=>new Date("2031-01-01T00:00:00.000Z");
    await expect(runProviderDiscoveryPipeline({...runInput(deps),hardDeadlineAt:"2030-01-01T01:00:00.000Z"})).rejects.toThrow(/deadline/i);
    expect(deps.runDiscovery).not.toHaveBeenCalled();
  });
});

function runInput(dependencies:ProviderDiscoveryPipelineDependencies){return{identity:identity(),dependencies,hardDeadlineAt:"2030-01-01T01:00:00.000Z"};}
function identity(){return{methodology:"public_search_source_forensics_v1" as const,artifactContract:"combined_geo_report_v2" as const,policyId:"logistics_self_operated_v1",policyVersion:"1",queryPlanVersion:"provider-query-plan-v1",passageSelectorVersion:"provider-passage-selector-v1",claimExtractionContract:"provider-claim-extraction-v1",claimExtractionModel:"fixture-model",evidenceCutoffAt:"2030-01-01T00:00:00.000Z",adapterIdentityHash:"adapter-hash",websiteFoundationHash:"website-hash",questionSetIdentity:"questions-hash"};}
function dependencies(options:{get?:()=>ProviderDiscoveryCheckpointV1|null;set?:(value:ProviderDiscoveryCheckpointV1)=>void;calls?:{discovery:number;verification:number;passages:number};failPassages?:boolean}):ProviderDiscoveryPipelineDependencies{
  const calls=options.calls??{discovery:0,verification:0,passages:0};
  return{
    getCheckpoint:vi.fn(async()=>options.get?.()??null),saveCheckpoint:vi.fn(async(value)=>options.set?.(structuredClone(value))),
    runDiscovery:vi.fn(async()=>{calls.discovery++;return{snapshotId:"discovery-snapshot",candidates:[{entityId:"provider-alpha",canonicalName:"Alpha Logistics",rank:0}],plannedQueries:6,completedQueries:6,returnedObservations:5};}),
    runVerification:vi.fn(async({candidateSetHash})=>{calls.verification++;return{snapshotId:"verification-snapshot",candidateSetHash};}),
    retrieveSources:vi.fn(async({verification})=>({verificationSnapshotId:verification.snapshotId,safelyRetrievedPages:1,sourceEvidenceIds:["source-alpha"]})),
    selectPassages:vi.fn(async()=>{calls.passages++;if(options.failPassages)throw new Error("passage fixture failure");return[{passageId:"passage-alpha",sourceEvidenceId:"source-alpha",passageOrder:0,exactExcerpt:"Alpha Logistics offers freight services.",excerptHash:"a".repeat(64),relevanceScore:50,matchedEntityTerms:["Alpha Logistics"],matchedServiceTerms:["freight"],matchedControlTerms:[],matchedCapabilityTerms:[],selectorVersion:"provider-passage-selector-v1"}];}),
    extractClaims:vi.fn(async()=>[{claimId:"claim-alpha",subjectName:"Alpha Logistics",subjectEntityId:"provider-alpha",genericRole:"service_provider",policyRole:"carrier",capability:"linehaul_fleet",operatingMode:"unknown",serviceScope:["freight"],routeScope:[],exactExcerpt:"Alpha Logistics offers freight services.",passageId:"passage-alpha",sourceEvidenceId:"source-alpha",sourceAuthority:"company_owned",directness:"lead_only",relevanceScore:50,grade:"C",sourceEligibility:{eligible:true},registrableDomain:"alpha.example"}]),
    qualify:vi.fn(async()=>({policyId:"logistics_self_operated_v1",policyVersion:"1",strict:[],candidates:[{entityId:"provider-alpha",canonicalName:"Alpha Logistics",genericRole:"service_provider",policyRole:"carrier",leadEvidenceIds:["claim-alpha"],missingProof:["ownership"]}],rejected:[]})),
    projectProviderDiscovery:vi.fn(async({discovery,verification,retrieval,passages,claims,qualification})=>({version:"provider-discovery-v1",policy:{policyId:qualification.policyId,policyVersion:qualification.policyVersion},identity:{candidateSetHash:verification.candidateSetHash,queryPlanVersion:"provider-query-plan-v1",passageSelectorVersion:"provider-passage-selector-v1",claimExtractionContract:"provider-claim-extraction-v1",claimExtractionModel:"fixture-model",claimSetHash:hash(claims.map(({claimId})=>claimId))},execution:{plannedQueries:discovery.plannedQueries,completedQueries:discovery.completedQueries,returnedObservations:discovery.returnedObservations,safelyRetrievedPages:retrieval.safelyRetrievedPages,relevantPassages:passages.length,discoveredProviders:1,strictProviders:0,candidateProviders:1,rejectedProviders:0,coverage:"partial"},strict:[],candidates:qualification.candidates,evidence:[{evidenceId:"claim-alpha",sourceEvidenceId:"source-alpha",registrableDomain:"alpha.example",title:"Alpha",sourceAuthority:"company_owned",observedAt:"2030-01-01T00:00:00.000Z",exactExcerpt:"Alpha Logistics offers freight services.",capability:"linehaul_fleet"}],limitation:"Missing evidence does not prove absence."})),
    resolveStandardQuestions:vi.fn(async()=>["q2-snapshot","q3-snapshot"]),now:()=>new Date("2030-01-01T00:30:00.000Z")
  };
}
function hash(value:unknown){return createHash("sha256").update(JSON.stringify(value)).digest("hex");}

import { describe, expect, it, vi } from "vitest";
import type { RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { generateCanonicalBuyerQuestions, type MarketSearchObservation, type PublicSearchSurfaceAuthority, type SearchQueryFanout } from "@open-geo-console/public-search-observer";
import { createTestWebsiteFoundation } from "../public-source-forensics/testing";
import { buildPublicSourceForensicReport } from "../public-source-forensics/report-builder";
import { normalizeJobError, PublicSourceQueryVariantCoverageError } from "./job-errors";
import {
  PublicSourceArtifactUnavailableError,
  PublicSourceResumeIdentityMismatchError,
  createPublicSourceQuestionFanouts,
  mapForensicReportContractError,
  runPublicSourceForensicsPipeline,
  type PublicSourceForensicsDependencies,
  type PublicSourcePipelineCheckpoint
} from "./public-source-forensics";
import { PAID_V3_DIRECT_DEBUG_TRACE_PREFIX, createPaidV3DirectDebugTrace, type PaidV3DirectDebugTrace } from "./paid-v3-direct-debug-trace";

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
      expect(fanout.budget.timeoutMs).toBe(60_000);
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

  it("traces each snapshot and the report/checkpoint/artifact persistence boundaries", async () => {
    const lines: string[] = [];
    const trace = createPaidV3DirectDebugTrace({
      jobId: "job-trace", reportId: "report-trace", remainingMs: () => 300_000,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => lines.push(line)
    })!;
    const dependencies = deps({
      reports: new Map(), checkpoints: new Map(), resolve: async ({ fanout }, index = 0) => snapshot(fanout, index),
      prepareArtifactVerification: vi.fn(async () => undefined)
    });

    await run("report-trace", "job-trace", dependencies, undefined, undefined, trace);

    const events = lines.map((line) => JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as { kind: string; step: string; snapshotOrdinal?: number; durationMs?: number });
    expect(events.filter(({ kind, step }) => kind === "step_started" && step === "public_source_snapshot_resolution")
      .map(({ snapshotOrdinal }) => snapshotOrdinal).sort()).toEqual([1, 2, 3]);
    for (const step of ["public_source_checkpoint_persist", "public_source_prepare_artifact",
      "public_source_artifact_readiness", "public_source_report_persist"]) {
      expect(events).toContainEqual(expect.objectContaining({ kind: "step_started", step }));
      expect(events).toContainEqual(expect.objectContaining({ kind: "step_succeeded", step }));
    }
    expect(events).toContainEqual(expect.objectContaining({ kind: "gate_result", step: "public_source_forensics_summary" }));
    expect(events.find(({ kind, step }) => kind === "step_succeeded" && step === "public_source_authority")?.durationMs)
      .toEqual(expect.any(Number));
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

  it("binds an asymmetric 6/3/6 plan and 5/3/1 observations to one effective set", async () => {
    const checkpoints = new Map<string, PublicSourcePipelineCheckpoint>();
    const fanoutOverrides = asymmetricFanoutOverrides();
    const expectedCounts = [5, 3, 1];
    const observedCounts = new Map<string, number>([...fanoutOverrides.keys()].map((questionId, index) => [questionId, expectedCounts[index]!] as const));
    const dependencies = deps({
      reports: new Map(),
      checkpoints,
      resolve: async ({ fanout }) => {
        const resolved = snapshotObservedCount(fanout, 1, observedCounts.get(fanout.questionId)!);
        expect(resolved.sufficientlyEvidenced).toBe(true);
        expect(resolved.availableSourceCount).toBeGreaterThanOrEqual(3);
        return resolved;
      }
    });
    const result = await run("report-partial", "job-partial", dependencies, "legacy", fanoutOverrides);
    expect([...fanoutOverrides.values()].map((fanout) => fanout.queries.length)).toEqual([6, 3, 6]);
    expect([...fanoutOverrides.values()].flatMap((fanout) => fanout.queries)).toHaveLength(15);
    expect(result.report.commercialOutcome).toBe("completed_limited");
    expect(result.report.fanouts.map((fanout) => fanout.queries.length)).toEqual(expectedCounts);
    const effectiveIds = result.report.fanouts.flatMap((fanout) => fanout.queries.map(({ id }) => id)).sort();
    expect(result.report.snapshotRefs.flatMap((snapshotRef) => snapshotRef.queryVariantIds).sort()).toEqual(effectiveIds);
    expect(result.report.sourceGraph.dimensions.queryVariantIds.slice().sort()).toEqual(effectiveIds);
    expect(result.report.coverage.expectedQueryCount).toBe(9);
    expect(result.report.limitations.some((line) => /部分覆盖|partial/i.test(line))).toBe(true);
    // B4: checkpoint only after successful parse
    expect(checkpoints.get("job-partial")?.snapshotIds).toHaveLength(3);
  });

  it("records a redacted pre-graph trace for a foreign query id without changing the permanent error", async () => {
    const checkpoints = new Map<string, PublicSourcePipelineCheckpoint>();
    const traceLines: string[] = [];
    const debugTrace = createPaidV3DirectDebugTrace({
      jobId: "job-extra", reportId: "report-extra", remainingMs: () => 60_000,
      environment: { OGC_PAID_V3_DEBUG_TRACE: "1" }, write: (line) => traceLines.push(line)
    })!;
    const dependencies = deps({
      reports: new Map(),
      checkpoints,
      resolve: async ({ fanout }) => {
        const base = snapshot(fanout, 1);
        return {
          ...base,
          observations: base.observations.map((observation, index) =>
            index === 0 ? { ...observation, queryId: "foreign-query-id-not-in-plan" } : observation
          ).concat(base.observations[1]!),
          retrievals: base.retrievals.map((retrieval, index) =>
            index === 0 ? { ...retrieval, queryId: "foreign-query-id-not-in-plan" } : retrieval
          )
        };
      }
    });
    const error = await run("report-extra", "job-extra", dependencies, undefined, undefined, debugTrace).catch((value) => value);
    expect(error).toBeInstanceOf(PublicSourceQueryVariantCoverageError);
    const normalized = normalizedTrace(error);
    expect(normalized).toMatchObject({ o: "pre_graph_guard", r: "unknown", f: { d: true, x: true }, g: { p0: 18 } });
    expect(JSON.stringify(normalized)).toMatch(/^[^]*$/);
    expect(JSON.stringify(normalized)).not.toMatch(/foreign-query-id|customer-logistics|https?:\/\//i);
    const events = traceLines.map((line) => JSON.parse(line.slice(PAID_V3_DIRECT_DEBUG_TRACE_PREFIX.length + 1)) as Record<string, unknown>);
    expect(events.filter(({ step }) => step === "public_source_coverage_guard")).toEqual([
      expect.objectContaining({ kind: "step_started" }),
      expect.objectContaining({ kind: "step_failed", durationMs: expect.any(Number) })
    ]);
    expect(normalizeJobError(error, forensicErrorContext).classification).toBe("permanent");
    expect(checkpoints.has("job-extra")).toBe(false);
  });

  it("records the pre-graph empty flag without freezing a checkpoint", async () => {
    const checkpoints = new Map<string, PublicSourcePipelineCheckpoint>();
    const dependencies = deps({ reports: new Map(), checkpoints, resolve: async ({ fanout }) => snapshotObservedCount(fanout, 1, 0) });
    const error = await run("report-empty", "job-empty", dependencies).catch((value) => value);
    expect(normalizedTrace(error)).toMatchObject({ o: "pre_graph_guard", f: { z: true } });
    expect(checkpoints.has("job-empty")).toBe(false);
  });

  it("aggregates mismatched snapshot observations while flagging the missing planned questions", async () => {
    const fanoutOverrides = asymmetricFanoutOverrides(), firstQuestionId = [...fanoutOverrides.keys()][0]!;
    const dependencies = deps({ reports: new Map(), checkpoints: new Map(), resolve: async ({ fanout }) => ({ ...snapshot(fanout, 1), questionId: firstQuestionId }) });
    const error = await run("report-mismatched", "job-mismatched", dependencies, "legacy", fanoutOverrides).catch((value) => value);
    const trace = normalizedTrace(error);
    expect(trace).toMatchObject({ o: "report_parser", f: { z: true }, g: { o0: 15 } });
    expect(trace.q[0]).toMatchObject({ o: 15 });
  });

  it("does not freeze a forensics checkpoint when report build fails after subset projection edge cases", async () => {
    vi.stubEnv("OGC_DEPLOYMENT_VERSION", "docker-desktop-staging");
    const checkpoints = new Map<string, PublicSourcePipelineCheckpoint>();
    const dependencies = {
      ...deps({
        reports: new Map(),
        checkpoints,
        resolve: async ({ fanout }) => snapshot(fanout, 1)
      }),
      buildReport: () => {
        throw new TypeError("$.sourceGraph.dimensions.queryVariantIds: Source graph must cover the exact report query variants.");
      }
    };
    const error = await run("report-no-freeze", "job-no-freeze", dependencies).catch((value) => value);
    expect(error).toBeInstanceOf(PublicSourceQueryVariantCoverageError);
    const trace = normalizedTrace(error);
    expect(trace).toMatchObject({ o: "report_parser", r: "unknown", f: { x: false, z: false }, g: { p0: 18, e0: 18, g0: 18, s0: 18 } });
    expect(trace.q.every((item: { ph: string; oh: string }) => /^[a-f0-9]{12}$/.test(item.ph) && /^[a-f0-9]{12}$/.test(item.oh))).toBe(true);
    const reordered = {
      ...deps({ reports: new Map(), checkpoints: new Map(), resolve: async ({ fanout }) => {
        const base = snapshot(fanout, 1);
        return { ...base, observations: [...base.observations].reverse(), retrievals: [...base.retrievals].reverse() };
      } }),
      buildReport: dependencies.buildReport
    };
    vi.stubEnv("OGC_DEPLOYMENT_VERSION", "A".repeat(40));
    const reorderedError = await run("report-no-freeze-reordered", "job-no-freeze-reordered", reordered).catch((value) => value);
    expect(normalizedTrace(reorderedError).q.map((item) => [item.ph, item.oh])).toEqual(trace.q.map((item) => [item.ph, item.oh]));
    expect(normalizedTrace(reorderedError).r).toBe("a".repeat(40));
    const typed = new PublicSourceQueryVariantCoverageError("typed", { cause: new Error("nested") });
    const mapped = (() => { try { mapForensicReportContractError(typed, (error as PublicSourceQueryVariantCoverageError).safeDiagnostics); } catch (value) { return value; } })();
    expect(mapped).toBe(typed);
    expect(normalizeJobError(mapped, forensicErrorContext).causes[0]).toBe("nested");
    vi.unstubAllEnvs();
    expect(normalizeJobError(error, forensicErrorContext)).toMatchObject({ code: "public_source_query_variant_coverage", classification: "permanent" });
    expect(checkpoints.has("job-no-freeze")).toBe(false);
  });
});

function deps(input:{reports:Map<string,RecommendationForensicReportV2>;checkpoints:Map<string,PublicSourcePipelineCheckpoint>;resolve:PublicSourceForensicsDependencies["resolveSnapshot"];resolveById?:PublicSourceForensicsDependencies["resolveSnapshotById"];artifactReadiness?:PublicSourceForensicsDependencies["artifactReadiness"];prepareArtifactVerification?:PublicSourceForensicsDependencies["prepareArtifactVerification"]}):PublicSourceForensicsDependencies{
  return {authority,resolveSnapshot:input.resolve,...(input.resolveById?{resolveSnapshotById:input.resolveById}:{}),getCheckpoint:async(id)=>input.checkpoints.get(id)??null,saveCheckpoint:async(id,c)=>{input.checkpoints.set(id,c);},
    getReport:async(id)=>input.reports.get(id)??null,saveReport:async(value)=>{const report=value as RecommendationForensicReportV2;input.reports.set(report.jobId,report);return report;},
    artifactReadiness:input.artifactReadiness??{async verify(){}},prepareArtifactVerification:input.prepareArtifactVerification,now:()=>new Date("2030-01-02T00:00:00.000Z"),costCapMicros:1000};
}
function run(reportId:string,jobId:string,dependencies:PublicSourceForensicsDependencies,semanticValidation?:"legacy"|"deferred",fanoutOverrides?:ReadonlyMap<string,SearchQueryFanout>,trace?:PaidV3DirectDebugTrace){return runPublicSourceForensicsPipeline({reportId,jobId,locale:"zh-CN",region:"CN",targetUrl:"https://customer-logistics.example/",websiteFoundation:createTestWebsiteFoundation(),dependencies,semanticValidation,fanoutOverrides,trace});}
function snapshot(fanout:SearchQueryFanout,index:number){
  const observations:MarketSearchObservation[]=fanout.queries.map((query,order)=>({observationId:`obs-${fanout.questionId}-${order}`,surface,queryId:query.id,exactQuery:query.exactQuery,
    requestedAt:"2030-01-01T00:00:00.000Z",completedAt:"2030-01-01T00:00:01.000Z",status:"complete",results:[{surfaceResultOrder:0,url:`https://source-${index}-${order}.example/fact`,title:"公开货运资料",snippet:"公开资料描述货运能力。",displayedHost:`source-${index}-${order}.example`}],usage:{requestCount:1,resultCount:1,estimatedCostMicros:1}}));
  return {snapshotId:`snapshot-${fanout.questionId}`,cacheIdentity:`cache-${fanout.questionId}`,questionId:fanout.questionId,observedAt:"2030-01-01T00:00:01.000Z",ageMs:24*60*60*1000,collectedForThisRun:true,
    refreshAttempted:false,refreshFailed:false,sufficientlyEvidenced:true,availableSourceCount:6,observations,retrievals:observations.flatMap((observation)=>observation.results.map((result)=>({observationId:observation.observationId,queryId:observation.queryId,resultUrl:result.url,retrievalState:"available" as const,publiclyRoutable:true,robotsAllowed:true,accessBarrier:"none" as const,contentBytes:100,normalizedText:"公开资料描述货运能力。",normalizedContentHash:`sha256:${"a".repeat(64)}`,verifiedExcerpt:"公开资料描述货运能力。"}))),actualCostMicros:10,allocatedCostMicros:0,avoidedCostMicros:0};
}

function snapshotObservedCount(fanout: SearchQueryFanout, index: number, count: number) {
  const full = snapshot(fanout, index);
  const kept = full.observations.slice(0, count);
  const keptIds = new Set(kept.map(({ observationId }) => observationId));
  return {
    ...full,
    refreshAttempted: true,
    refreshFailed: true,
    // Keep every question commercially fully evidenced; only query subset coverage limits this run.
    availableSourceCount: Math.max(3, count),
    observations: kept,
    retrievals: full.retrievals.filter(({ observationId }) => keptIds.has(observationId))
  };
}

function asymmetricFanoutOverrides(): ReadonlyMap<string, SearchQueryFanout> {
  const foundation = createTestWebsiteFoundation();
  const profile = foundation.organizationProfile;
  const questions = generateCanonicalBuyerQuestions({ locale: "zh-CN", region: "CN",
    categoryEvidence: profile.productsAndServices.map((value, index) => ({ value, confidence: "high" as const, sourceId: `website-foundation-category-${index}` })),
    capabilityEvidence: profile.productsAndServices.map((value, index) => ({ value, confidence: "high" as const, sourceId: `website-foundation-capability-${index}` })),
    broadCategory: profile.businessModel || "business services",
    excludedIdentities: [{ kind: "customer_domain" as const, value: "customer-logistics.example" }, ...profile.brandNames.map((value) => ({ kind: "customer_brand" as const, value }))] });
  const fanouts = createPublicSourceQuestionFanouts({ questions, authority, excludedIdentities: [{ kind: "customer_domain", value: "customer-logistics.example" }, ...profile.brandNames.map((value) => ({ kind: "customer_brand" as const, value }))] });
  return new Map<string, SearchQueryFanout>(fanouts.map((fanout, index) => [fanout.questionId, index === 1 ? { ...fanout, queries: fanout.queries.slice(0, 3) } : fanout] as const));
}

const forensicErrorContext = { jobId: "job", phase: "source_retrieval" as const, phaseAttempt: 1, resumeGeneration: 0 };
function normalizedTrace(error: unknown): { o: string; r: string; q: Array<{ ph: string; oh: string; o?: number }>; g: Record<string, unknown>; f: Record<string, unknown> } {
  const encoded = normalizeJobError(error, forensicErrorContext).causes.find((item) => item.startsWith("ogc_trace:v1:"));
  expect(encoded).toBeDefined();
  return JSON.parse(encoded!.slice("ogc_trace:v1:".length));
}

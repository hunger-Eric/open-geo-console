import { createHash } from "node:crypto";
import { buildPublicSourceEvidenceGraph, type RetrievedPublicSourceFact } from "@open-geo-console/citation-intelligence";
import { createSearchQueryFanout, generateCanonicalBuyerQuestions, type MarketSearchObservation, type PublicSearchSurfaceAuthority, type SearchQueryFanout } from "@open-geo-console/public-search-observer";
import type { AiWebsiteReportV1, RecommendationForensicReportV2 } from "@open-geo-console/ai-report-engine";
import { decidePublicSourceCommercialCoverage } from "@/public-source-forensics/coverage";
import { buildPublicSourceForensicReport, type PublicSourceForensicReportBuilderInput } from "@/public-source-forensics/report-builder";

export interface ResolvedPublicSourceSnapshot {
  snapshotId: string; cacheIdentity: string; questionId: string; observedAt: string; ageMs: number;
  collectedForThisRun: boolean; refreshAttempted: boolean; refreshFailed: boolean; sufficientlyEvidenced: boolean;
  observations: MarketSearchObservation[]; retrievals: RetrievedPublicSourceFact[];
  actualCostMicros: number; allocatedCostMicros: number; avoidedCostMicros: number;
}

export interface PublicSourcePipelineCheckpoint {
  identityHash: string; methodology: "public_search_source_forensics_v1"; questionSetVersion: string;
  fanoutVersion: string; authorityId: string; snapshotIds: string[]; websiteFoundationHash: string;
  evidenceCutoffAt: string; locale: string; region: string;
}

export interface PublicSourceForensicsDependencies {
  authority: PublicSearchSurfaceAuthority;
  resolveSnapshot(input: { questionId: string; fanout: SearchQueryFanout; evidenceCutoffAt: string }): Promise<ResolvedPublicSourceSnapshot>;
  getCheckpoint(jobId: string): Promise<PublicSourcePipelineCheckpoint | null>;
  saveCheckpoint(jobId: string, checkpoint: PublicSourcePipelineCheckpoint): Promise<void>;
  getReport(jobId: string): Promise<RecommendationForensicReportV2 | null>;
  saveReport(report: unknown): Promise<RecommendationForensicReportV2>;
  artifactReadiness: ArtifactReadinessGate;
  buildReport?: (input: PublicSourceForensicReportBuilderInput) => RecommendationForensicReportV2;
  now?: () => Date;
  costCapMicros?: number;
  deferReportPersistence?: boolean;
}

export interface ArtifactReadinessGate { verify(report: RecommendationForensicReportV2): Promise<void>; }
export const FAIL_CLOSED_ARTIFACT_READINESS: ArtifactReadinessGate = { async verify() { throw new PublicSourceArtifactUnavailableError(); } };

export async function runPublicSourceForensicsPipeline(input: {
  reportId: string; jobId: string; locale: string; region: string; targetUrl: string;
  websiteFoundation: AiWebsiteReportV1; dependencies: PublicSourceForensicsDependencies;
}): Promise<{ report: RecommendationForensicReportV2; checkpoint: PublicSourcePipelineCheckpoint; commercialSnapshotRefs: Array<{ snapshotId:string;cacheIdentity:string;freshnessState:"fresh"|"historical"|"insufficient";actualCostMicros:number;allocatedCostMicros:number;avoidedCostMicros:number }> }> {
  const existing = await input.dependencies.getReport(input.jobId);
  if (existing) return { report: existing, checkpoint: checkpointFromReport(existing, input.websiteFoundation), commercialSnapshotRefs: [] };
  const authority = input.dependencies.authority;
  if (!authority.active || authority.surface.locale !== input.locale || authority.surface.region !== input.region) throw new PublicSourceAuthorityUnavailableError();
  const profile = input.websiteFoundation.organizationProfile;
  const questions = generateCanonicalBuyerQuestions({ locale: input.locale, region: input.region,
    categoryEvidence: profile.productsAndServices.map((value, index) => ({ value, confidence: "high" as const, sourceId: `website-foundation-category-${index}` })),
    capabilityEvidence: profile.productsAndServices.map((value, index) => ({ value, confidence: "high" as const, sourceId: `website-foundation-capability-${index}` })),
    broadCategory: profile.businessModel || "business services",
    excludedIdentities: [{ kind: "customer_domain", value: new URL(input.targetUrl).hostname },
      ...(profile.brandNames.map((value) => ({ kind: "customer_brand" as const, value })))] });
  if (questions.confidence !== "high" || questions.questions.length < 3) throw new PublicSourceQuestionGenerationError();
  const fanouts = questions.questions.map((question) => createSearchQueryFanout({ question, surface: authority.surface,
    excludedIdentities: [{ kind: "customer_domain", value: new URL(input.targetUrl).hostname }, ...profile.brandNames.map((value) => ({ kind: "customer_brand" as const, value }))] }));
  const prior = await input.dependencies.getCheckpoint(input.jobId);
  const websiteFoundationHash = sha(input.websiteFoundation);
  if (prior && (prior.methodology !== "public_search_source_forensics_v1" || prior.questionSetVersion !== questions.questionSetVersion ||
      prior.fanoutVersion !== fanouts[0]!.fanoutVersion || prior.authorityId !== authority.authorityId || prior.websiteFoundationHash !== websiteFoundationHash ||
      prior.locale !== input.locale || prior.region !== input.region)) throw new PublicSourceResumeIdentityMismatchError();
  const evidenceCutoffAt = prior?.evidenceCutoffAt ?? (input.dependencies.now ?? (() => new Date()))().toISOString();
  const snapshots = await Promise.all(fanouts.map((fanout) => input.dependencies.resolveSnapshot({ questionId: fanout.questionId, fanout, evidenceCutoffAt })));
  const actualCostMicros = snapshots.reduce((sum, item) => sum + item.actualCostMicros, 0);
  const decision = decidePublicSourceCommercialCoverage({ authorityReady: true, evidenceIsolated: snapshots.every((item) => item.questionId && item.snapshotId),
    artifactReady: true, costCapExceeded: actualCostMicros > (input.dependencies.costCapMicros ?? Number.MAX_SAFE_INTEGER),
    questions: snapshots.map((item) => ({ questionId: item.questionId, ageMs: item.ageMs, sufficientlyEvidenced: item.sufficientlyEvidenced,
      refreshAttempted: item.refreshAttempted, refreshFailed: item.refreshFailed })) });
  const observations = snapshots.flatMap(({ observations: values }) => values);
  const retrievals = snapshots.flatMap(({ retrievals: values }) => values);
  const sourceGraph = buildPublicSourceEvidenceGraph({ observations, retrievals,
    customerRegistrableDomain: new URL(input.targetUrl).hostname, competitorRegistrableDomains: [] });
  const checkpoint = createCheckpoint({ input, questions, fanouts, snapshots, evidenceCutoffAt, authority });
  if (prior && prior.identityHash !== checkpoint.identityHash) throw new PublicSourceResumeIdentityMismatchError();
  if (!prior) await input.dependencies.saveCheckpoint(input.jobId, checkpoint);
  const priceMicros = 29_000_000;
  const report = (input.dependencies.buildReport ?? buildPublicSourceForensicReport)({ reportId: input.reportId, jobId: input.jobId,
    targetUrl: input.targetUrl, locale: input.locale, region: input.region, generatedAt: evidenceCutoffAt, evidenceCutoffAt,
    questions, fanouts, authority, snapshotRefs: snapshots.map((snapshot, index) => ({ snapshotId: snapshot.snapshotId,
      questionId: snapshot.questionId, queryVariantIds: fanouts[index]!.queries.map(({ id }) => id), observationIds: snapshot.observations.map(({ observationId }) => observationId),
      freshness: snapshot.ageMs <= 7*24*60*60*1_000 ? "fresh" : snapshot.ageMs <= 30*24*60*60*1_000 ? "stale" : "expired",
      observedAt: snapshot.observedAt, collectedForThisRun: snapshot.collectedForThisRun })),
    coverage: { status: decision.outcome === "completed" ? "complete" : decision.outcome === "completed_limited" ? "partial" : "insufficient",
      completedQueryCount: observations.filter(({ status }) => status === "complete" || status === "partial").length,
      expectedQueryCount: fanouts.reduce((sum, fanout) => sum + fanout.queries.length, 0), observedResultCount: observations.reduce((sum, item) => sum + item.results.length, 0),
      surfaceDomainCount: new Set(observations.flatMap(({ results }) => results.map(({ displayedHost }) => displayedHost))).size, reasons: decision.reasons },
    sourceGraph, websiteFoundationAppendix: input.websiteFoundation, commercialOutcome: decision.outcome,
    cost: { searchCostMicros: actualCostMicros, retrievalCostMicros: 0, synthesisCostMicros: 0, artifactCostMicros: 0, deliveryCostMicros: 0,
      allocatedSharedCostMicros: snapshots.reduce((sum,item)=>sum+item.allocatedCostMicros,0), avoidedCostMicros: snapshots.reduce((sum,item)=>sum+item.avoidedCostMicros,0),
      priceMicros, refundMicros: decision.settlement === "refund" ? priceMicros : 0 } });
  await input.dependencies.artifactReadiness.verify(report);
  const stored = input.dependencies.deferReportPersistence ? report : await input.dependencies.saveReport(report);
  if (stored.reportId !== input.reportId || stored.jobId !== input.jobId || stored.commercialOutcome !== decision.outcome) throw new PublicSourceReportOutcomeMismatchError();
  return { report: stored, checkpoint, commercialSnapshotRefs: snapshots.map((item)=>({snapshotId:item.snapshotId,cacheIdentity:item.cacheIdentity,
    freshnessState:item.ageMs<=7*24*60*60*1_000?"fresh":item.ageMs<=30*24*60*60*1_000?"historical":"insufficient",
    actualCostMicros:item.actualCostMicros,allocatedCostMicros:item.allocatedCostMicros,avoidedCostMicros:item.avoidedCostMicros})) };
}

function createCheckpoint(value: { input: Parameters<typeof runPublicSourceForensicsPipeline>[0]; questions: ReturnType<typeof generateCanonicalBuyerQuestions>; fanouts: SearchQueryFanout[]; snapshots: ResolvedPublicSourceSnapshot[]; evidenceCutoffAt: string; authority: PublicSearchSurfaceAuthority }): PublicSourcePipelineCheckpoint {
  const core = { methodology: "public_search_source_forensics_v1" as const, questionSetVersion: value.questions.questionSetVersion,
    fanoutVersion: value.fanouts[0]!.fanoutVersion, authorityId: value.authority.authorityId,
    snapshotIds: value.snapshots.map(({ snapshotId }) => snapshotId), websiteFoundationHash: sha(value.input.websiteFoundation),
    evidenceCutoffAt: value.evidenceCutoffAt, locale: value.input.locale, region: value.input.region };
  return { ...core, identityHash: sha(core) };
}
function checkpointFromReport(report: RecommendationForensicReportV2, foundation: AiWebsiteReportV1): PublicSourcePipelineCheckpoint { const core={ methodology: report.methodology, questionSetVersion: report.questions.questionSetVersion, fanoutVersion: report.fanouts[0]!.fanoutVersion, authorityId: report.authority.authorityId, snapshotIds: report.snapshotRefs.map(({snapshotId})=>snapshotId), websiteFoundationHash:sha(foundation), evidenceCutoffAt:report.evidenceCutoffAt, locale:report.locale, region:report.region }; return {...core,identityHash:sha(core)}; }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export class PublicSourceAuthorityUnavailableError extends Error {}
export class PublicSourceQuestionGenerationError extends Error {}
export class PublicSourceResumeIdentityMismatchError extends Error {}
export class PublicSourceArtifactUnavailableError extends Error {}
export class PublicSourceReportOutcomeMismatchError extends Error {}

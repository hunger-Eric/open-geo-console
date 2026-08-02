import { createHash } from "node:crypto";
import type { ProviderClaim, ProviderEvidencePassage, ProviderQualificationResult } from "@open-geo-console/citation-intelligence";
import type { ProviderDiscoveryV1 } from "@open-geo-console/ai-report-engine";
import type { ProviderCandidateQueryIdentity } from "@open-geo-console/public-search-observer";
import { runReportV4GuardedOperation } from "@/report-v4/prohibited-operation-guard-runtime";
import type { ScanJobPhase } from "./job-state";
import { tracePaidV3DirectStep, type PaidV3DirectDebugTrace } from "./paid-v3-direct-debug-trace";

export const PROVIDER_DISCOVERY_CHECKPOINT_VERSION = "provider-discovery-checkpoint-v1" as const;
export type ProviderPipelinePhase = Extract<ScanJobPhase,
  "provider_discovery_search" | "candidate_resolution" | "candidate_verification" | "provider_source_retrieval" |
  "provider_passage_selection" | "provider_claim_extraction" | "provider_qualification" | "grounded_answer_synthesis"> | "complete";

export interface ProviderDiscoveryIdentity {
  methodology: "public_search_source_forensics_v1";
  artifactContract: "combined_geo_report_v2" | "combined_geo_report_v3";
  policyId: string;
  policyVersion: string;
  queryPlanVersion: string;
  passageSelectorVersion: string;
  claimExtractionContract: string;
  claimExtractionModel: string;
  evidenceCutoffAt: string;
  adapterIdentityHash: string;
  websiteFoundationHash: string;
  questionSetIdentity: string;
}
export interface ProviderDiscoveryStage {
  snapshotId: string;
  candidates: ProviderCandidateQueryIdentity[];
  plannedQueries: number;
  completedQueries: number;
  returnedObservations: number;
}
export interface ProviderVerificationStage {
  snapshotId: string;
  candidateSetHash: string;
}
export interface ProviderRetrievalStage {
  verificationSnapshotId: string;
  safelyRetrievedPages: number;
  sourceEvidenceIds: string[];
}
export interface ProviderDiscoveryCheckpointV1 extends ProviderDiscoveryIdentity {
  version: typeof PROVIDER_DISCOVERY_CHECKPOINT_VERSION;
  identityHash: string;
  phase: ProviderPipelinePhase;
  discoverySnapshotId: string | null;
  verificationSnapshotId: string | null;
  standardQuestionSnapshotIds: string[];
  candidateSetHash: string | null;
  claimSetHash: string | null;
  artifacts: {
    discovery?: ProviderDiscoveryStage;
    verification?: ProviderVerificationStage;
    retrieval?: ProviderRetrievalStage;
    passages?: ProviderEvidencePassage[];
    claims?: ProviderClaim[];
    qualification?: ProviderQualificationResult;
    providerDiscovery?: ProviderDiscoveryV1;
  };
}
export interface ProviderDiscoveryPipelineDependencies {
  getCheckpoint(): Promise<ProviderDiscoveryCheckpointV1 | null>;
  saveCheckpoint(checkpoint: ProviderDiscoveryCheckpointV1): Promise<void>;
  runDiscovery(signal?: AbortSignal): Promise<ProviderDiscoveryStage>;
  runVerification(input: { discovery: ProviderDiscoveryStage; candidateSetHash: string; signal?: AbortSignal }): Promise<ProviderVerificationStage>;
  retrieveSources(input: { verification: ProviderVerificationStage; signal?: AbortSignal }): Promise<ProviderRetrievalStage>;
  selectPassages(input: { verification: ProviderVerificationStage; retrieval: ProviderRetrievalStage; signal?: AbortSignal }): Promise<ProviderEvidencePassage[]>;
  extractClaims(input: { passages: ProviderEvidencePassage[]; signal?: AbortSignal }): Promise<ProviderClaim[]>;
  qualify(input: { claims: ProviderClaim[]; signal?: AbortSignal }): Promise<ProviderQualificationResult>;
  projectProviderDiscovery(input: { discovery: ProviderDiscoveryStage; verification: ProviderVerificationStage; retrieval: ProviderRetrievalStage; passages: ProviderEvidencePassage[]; claims: ProviderClaim[]; qualification: ProviderQualificationResult }): Promise<ProviderDiscoveryV1>;
  resolveStandardQuestions(input: { evidenceCutoffAt: string; signal?: AbortSignal }): Promise<[string, string]>;
  now?: () => Date;
}

export async function runProviderDiscoveryPipeline(input: {
  identity: ProviderDiscoveryIdentity;
  dependencies: ProviderDiscoveryPipelineDependencies;
  hardDeadlineAt: string;
  signal?: AbortSignal;
  trace?: PaidV3DirectDebugTrace;
}): Promise<{ providerDiscovery: ProviderDiscoveryV1; checkpoint: ProviderDiscoveryCheckpointV1; coverage: { status: "complete" | "partial" | "insufficient" } }> {
  return runReportV4GuardedOperation({
    guardSite: "four_snapshot",
    delegate: () => runProviderDiscoveryPipelineUnsafe(input)
  });
}

async function runProviderDiscoveryPipelineUnsafe(input: {
  identity: ProviderDiscoveryIdentity;
  dependencies: ProviderDiscoveryPipelineDependencies;
  hardDeadlineAt: string;
  signal?: AbortSignal;
  trace?: PaidV3DirectDebugTrace;
}): Promise<{ providerDiscovery: ProviderDiscoveryV1; checkpoint: ProviderDiscoveryCheckpointV1; coverage: { status: "complete" | "partial" | "insufficient" } }> {
  const deadline = timestamp(input.hardDeadlineAt, "hardDeadlineAt");
  const identity = parseIdentity(input.identity);
  const expectedIdentityHash = sha(identity);
  const prior = await tracePaidV3DirectStep(input.trace, "provider_checkpoint_load", {
    phase: "provider_discovery_search"
  }, async () => {
    const value = await input.dependencies.getCheckpoint();
    if (value) validateCheckpointIdentity(value, identity, expectedIdentityHash);
    return value;
  });
  let checkpoint = prior ?? checkpointFor(identity, expectedIdentityHash);
  const guard = () => {
    input.signal?.throwIfAborted();
    if ((input.dependencies.now ?? (() => new Date()))() >= deadline) throw new ProviderDiscoveryDeadlineExceededError("Provider discovery hard deadline was reached.");
  };

  guard();
  const discovery = await tracePaidV3DirectStep(input.trace, "provider_discovery_search", {
    phase: "provider_discovery_search"
  }, async () => {
    const value = checkpoint.artifacts.discovery ?? await input.dependencies.runDiscovery(input.signal);
    validateDiscovery(value);
    return value;
  });
  if (!checkpoint.artifacts.discovery) checkpoint = await save(input.dependencies, checkpoint, { phase: "candidate_resolution", discoverySnapshotId: discovery.snapshotId, artifacts: { ...checkpoint.artifacts, discovery } }, input.trace);

  guard();
  const candidateSetHash = hashCandidates(discovery.candidates);
  if (checkpoint.candidateSetHash && checkpoint.candidateSetHash !== candidateSetHash) throw new ProviderDiscoveryResumeIdentityMismatchError("Provider candidate set changed during resume.");
  checkpoint = checkpoint.candidateSetHash ? checkpoint : await save(input.dependencies, checkpoint, { phase: "candidate_verification", candidateSetHash }, input.trace);
  const verification = await tracePaidV3DirectStep(input.trace, "provider_candidate_verification", {
    phase: "candidate_verification", sourceCount: discovery.candidates.length
  }, async () => {
    const value = checkpoint.artifacts.verification ?? await input.dependencies.runVerification({ discovery, candidateSetHash, signal: input.signal });
    if (value.candidateSetHash !== candidateSetHash) throw new ProviderDiscoveryResumeIdentityMismatchError("Verification candidate-set hash does not match discovery.");
    return value;
  });
  if (!checkpoint.artifacts.verification) checkpoint = await save(input.dependencies, checkpoint, { phase: "provider_source_retrieval", verificationSnapshotId: verification.snapshotId, artifacts: { ...checkpoint.artifacts, verification } }, input.trace);

  guard();
  const retrieval = await tracePaidV3DirectStep(input.trace, "provider_source_retrieval", {
    phase: "provider_source_retrieval"
  }, async () => {
    const value = checkpoint.artifacts.retrieval ?? await input.dependencies.retrieveSources({ verification, signal: input.signal });
    if (value.verificationSnapshotId !== verification.snapshotId) throw new ProviderDiscoveryResumeIdentityMismatchError("Provider retrieval does not match the verification snapshot.");
    return value;
  });
  if (!checkpoint.artifacts.retrieval) checkpoint = await save(input.dependencies, checkpoint, { phase: "provider_passage_selection", artifacts: { ...checkpoint.artifacts, retrieval } }, input.trace);

  guard();
  const passages = await tracePaidV3DirectStep(input.trace, "provider_passage_selection", {
    phase: "provider_passage_selection", sourceCount: retrieval.sourceEvidenceIds.length
  }, async () => {
    const value = checkpoint.artifacts.passages ?? await input.dependencies.selectPassages({ verification, retrieval, signal: input.signal });
    validatePassages(value);
    return value;
  });
  if (!checkpoint.artifacts.passages) checkpoint = await save(input.dependencies, checkpoint, { phase: "provider_claim_extraction", artifacts: { ...checkpoint.artifacts, passages } }, input.trace);

  guard();
  const claims = await tracePaidV3DirectStep(input.trace, "provider_claim_extraction_stage", {
    phase: "provider_claim_extraction", citationCount: passages.length
  }, () => checkpoint.artifacts.claims
    ? Promise.resolve(checkpoint.artifacts.claims)
    : input.dependencies.extractClaims({ passages, signal: input.signal }));
  const claimSetHash = hashClaims(claims);
  if (checkpoint.claimSetHash && checkpoint.claimSetHash !== claimSetHash) throw new ProviderDiscoveryResumeIdentityMismatchError("Provider claim set changed during resume.");
  if (!checkpoint.artifacts.claims) checkpoint = await save(input.dependencies, checkpoint, { phase: "provider_qualification", claimSetHash, artifacts: { ...checkpoint.artifacts, claims } }, input.trace);

  guard();
  const qualification = await tracePaidV3DirectStep(input.trace, "provider_qualification", {
    phase: "provider_qualification", claimCount: claims.length
  }, async () => {
    const value = checkpoint.artifacts.qualification ?? await input.dependencies.qualify({ claims, signal: input.signal });
    if (value.policyId !== identity.policyId || value.policyVersion !== identity.policyVersion) throw new ProviderDiscoveryResumeIdentityMismatchError("Qualification policy identity does not match the checkpoint.");
    return value;
  });
  if (!checkpoint.artifacts.qualification) checkpoint = await save(input.dependencies, checkpoint, { phase: "grounded_answer_synthesis", artifacts: { ...checkpoint.artifacts, qualification } }, input.trace);

  guard();
  const standardQuestionSnapshotIds = checkpoint.standardQuestionSnapshotIds.length === 2
    ? checkpoint.standardQuestionSnapshotIds as [string, string]
    : await tracePaidV3DirectStep(input.trace, "provider_standard_questions", {
        phase: "grounded_answer_synthesis", questionOrdinal: 2
      }, () => input.dependencies.resolveStandardQuestions({ evidenceCutoffAt: identity.evidenceCutoffAt, signal: input.signal }));
  if (standardQuestionSnapshotIds.length !== 2 || new Set(standardQuestionSnapshotIds).size !== 2) throw new ProviderDiscoveryPipelineContractError("Questions 2 and 3 require two unique standard snapshots.");
  const providerDiscovery = await tracePaidV3DirectStep(input.trace, "provider_projection", {
    phase: "grounded_answer_synthesis", claimCount: claims.length
  }, () => checkpoint.artifacts.providerDiscovery
    ? Promise.resolve(checkpoint.artifacts.providerDiscovery)
    : input.dependencies.projectProviderDiscovery({ discovery, verification, retrieval, passages, claims, qualification }));
  if (providerDiscovery.policy.policyId !== identity.policyId || providerDiscovery.policy.policyVersion !== identity.policyVersion || providerDiscovery.identity.candidateSetHash !== candidateSetHash || providerDiscovery.identity.claimSetHash !== claimSetHash) throw new ProviderDiscoveryPipelineContractError("Projected provider discovery identities do not reconcile.");
  if (!checkpoint.artifacts.providerDiscovery || checkpoint.standardQuestionSnapshotIds.length !== 2) checkpoint = await save(input.dependencies, checkpoint, { phase: "complete", standardQuestionSnapshotIds: [...standardQuestionSnapshotIds], artifacts: { ...checkpoint.artifacts, providerDiscovery } }, input.trace);
  const status = providerDiscovery.execution.coverage === "insufficient" ? "insufficient" : providerDiscovery.strict.length === 0 ? "partial" : providerDiscovery.execution.coverage;
  return { providerDiscovery, checkpoint, coverage: { status } };
}

async function save(deps: ProviderDiscoveryPipelineDependencies, current: ProviderDiscoveryCheckpointV1, patch: Partial<ProviderDiscoveryCheckpointV1>, trace?: PaidV3DirectDebugTrace): Promise<ProviderDiscoveryCheckpointV1> { const next = { ...current, ...patch }; await tracePaidV3DirectStep(trace, "provider_checkpoint_persist", { phase: patch.phase ?? current.phase }, () => deps.saveCheckpoint(next)); return next; }
function checkpointFor(identity: ProviderDiscoveryIdentity, identityHash: string): ProviderDiscoveryCheckpointV1 { return { version: PROVIDER_DISCOVERY_CHECKPOINT_VERSION, identityHash, ...identity, phase: "provider_discovery_search", discoverySnapshotId: null, verificationSnapshotId: null, standardQuestionSnapshotIds: [], candidateSetHash: null, claimSetHash: null, artifacts: {} }; }
function validateCheckpointIdentity(checkpoint: ProviderDiscoveryCheckpointV1, identity: ProviderDiscoveryIdentity, identityHash: string): void { if (checkpoint.version !== PROVIDER_DISCOVERY_CHECKPOINT_VERSION || checkpoint.identityHash !== identityHash || identityKeys.some((key) => checkpoint[key] !== identity[key])) throw new ProviderDiscoveryResumeIdentityMismatchError("Provider discovery checkpoint identity does not match this run."); }
const identityKeys: (keyof ProviderDiscoveryIdentity)[] = ["methodology","artifactContract","policyId","policyVersion","queryPlanVersion","passageSelectorVersion","claimExtractionContract","claimExtractionModel","evidenceCutoffAt","adapterIdentityHash","websiteFoundationHash","questionSetIdentity"];
function parseIdentity(value: ProviderDiscoveryIdentity): ProviderDiscoveryIdentity { const output={...value}; for(const key of identityKeys) if(typeof output[key]!=="string"||!output[key].trim()) throw new ProviderDiscoveryPipelineContractError(`Provider discovery identity ${key} is required.`); if(!["combined_geo_report_v2","combined_geo_report_v3"].includes(output.artifactContract))throw new ProviderDiscoveryPipelineContractError("Provider discovery artifact contract is unsupported."); timestamp(output.evidenceCutoffAt,"evidenceCutoffAt"); return output; }
function validateDiscovery(value: ProviderDiscoveryStage): void { if(!value.snapshotId.trim()||value.candidates.length>12||value.plannedQueries<0||value.completedQueries<0||value.completedQueries>value.plannedQueries) throw new ProviderDiscoveryPipelineContractError("Provider discovery stage is invalid."); }
function validatePassages(values: ProviderEvidencePassage[]): void { const counts=new Map<string,number>(); for(const value of values) counts.set(value.sourceEvidenceId,(counts.get(value.sourceEvidenceId)??0)+1); if([...counts.values()].some((count)=>count>3)) throw new ProviderDiscoveryPipelineContractError("A source cannot retain more than three passages."); }
function hashCandidates(values: readonly ProviderCandidateQueryIdentity[]): string { return sha([...values].sort((a,b)=>a.rank-b.rank||a.entityId.localeCompare(b.entityId)).map(({entityId,canonicalName,rank})=>({entityId,canonicalName,rank}))); }
function hashClaims(values: readonly ProviderClaim[]): string { return sha([...values].sort((a,b)=>a.claimId.localeCompare(b.claimId)).map(({claimId})=>claimId)); }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function timestamp(value:string,label:string):Date{const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new ProviderDiscoveryPipelineContractError(`${label} is invalid.`);return date;}

/** Deterministic JSON for identity hashes: object keys sorted recursively; arrays keep order. */
export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}
export function stableJsonHash(value: unknown): string {
  return createHash("sha256").update(stableJsonStringify(value)).digest("hex");
}
function canonicalizeJson(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalizeJson(item));
  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) next[key] = canonicalizeJson(record[key]);
  return next;
}

/** Mid-job resume must reuse the checkpoint identity rather than re-hash live foundation JSON. */
export function identityFromProviderDiscoveryCheckpoint(checkpoint: ProviderDiscoveryCheckpointV1): ProviderDiscoveryIdentity {
  return {
    methodology: checkpoint.methodology,
    artifactContract: checkpoint.artifactContract,
    policyId: checkpoint.policyId,
    policyVersion: checkpoint.policyVersion,
    queryPlanVersion: checkpoint.queryPlanVersion,
    passageSelectorVersion: checkpoint.passageSelectorVersion,
    claimExtractionContract: checkpoint.claimExtractionContract,
    claimExtractionModel: checkpoint.claimExtractionModel,
    evidenceCutoffAt: checkpoint.evidenceCutoffAt,
    adapterIdentityHash: checkpoint.adapterIdentityHash,
    websiteFoundationHash: checkpoint.websiteFoundationHash,
    questionSetIdentity: checkpoint.questionSetIdentity
  };
}

export class ProviderDiscoveryResumeIdentityMismatchError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "ProviderDiscoveryResumeIdentityMismatchError"; }
}
export class ProviderDiscoveryDeadlineExceededError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "ProviderDiscoveryDeadlineExceededError"; }
}
export class ProviderDiscoveryPipelineContractError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "ProviderDiscoveryPipelineContractError"; }
}

import type { JobCheckpoint, ScanJobStage } from "@/db/schema";

export const ANALYSIS_PHASES = [
  "admission", "discovery", "planning", "fetching", "technical_audit", "page_analysis",
  "website_synthesis", "public_source_preflight", "question_generation", "snapshot_resolution",
  "source_retrieval", "evidence_graph", "report_build", "artifact_verification", "terminalization"
] as const;

export type ScanJobPhase = typeof ANALYSIS_PHASES[number];
export type ScanJobExecutionState = "queued" | "running" | "retry_wait" | "repair_wait" | "completed" | "failed";

export interface RecoveryCheckpointEnvelope {
  schemaVersion: 1;
  phase: ScanJobPhase;
  revision: number;
  phaseAttempt: number;
  resumeGeneration: number;
  identity: {
    jobId: string;
    reportId: string;
    productContract: string;
    methodology: string | null;
    locale: string;
    authorityId: string | null;
  };
  inputHash: string;
  completedArtifacts: string[];
  remainingWork: string[];
  priorTransitionId: string | null;
}

export function phaseForStage(stage: ScanJobStage): ScanJobPhase {
  switch (stage) {
    case "discovering": return "discovery";
    case "planning": return "planning";
    case "fetching": return "fetching";
    case "analyzing": return "page_analysis";
    case "synthesizing": return "website_synthesis";
    case "completed":
    case "completed_limited":
    case "failed": return "terminalization";
    default: return "admission";
  }
}

export function stageForPhase(phase: ScanJobPhase, fallback: Exclude<ScanJobStage, "completed" | "completed_limited" | "failed"> = "queued"): Exclude<ScanJobStage, "completed" | "completed_limited" | "failed"> {
  switch (phase) {
    case "discovery": return "discovering";
    case "planning": return "planning";
    case "fetching":
    case "technical_audit": return "fetching";
    case "page_analysis": return "analyzing";
    case "website_synthesis":
    case "public_source_preflight":
    case "question_generation":
    case "snapshot_resolution":
    case "source_retrieval":
    case "evidence_graph":
    case "report_build":
    case "artifact_verification":
    case "terminalization": return "synthesizing";
    default: return fallback;
  }
}

export function recoveryEnvelope(checkpoint: JobCheckpoint): RecoveryCheckpointEnvelope | null {
  const candidate = checkpoint.recovery;
  if (!candidate || typeof candidate !== "object") return null;
  const value = candidate as Partial<RecoveryCheckpointEnvelope>;
  return value.schemaVersion === 1 && typeof value.revision === "number" &&
    typeof value.phase === "string" && ANALYSIS_PHASES.includes(value.phase as ScanJobPhase) &&
    value.identity !== undefined && typeof value.inputHash === "string" ? value as RecoveryCheckpointEnvelope : null;
}


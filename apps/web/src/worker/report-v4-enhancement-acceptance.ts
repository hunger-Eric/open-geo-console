import { createHash } from "node:crypto";
import type { CombinedGeoReportV4Source } from "@open-geo-console/ai-report-engine";
import {
  type ReportV4AcceptanceObserver,
  type ReportV4AcceptanceObserverEvent
} from "./report-v4-acceptance-observer";
import type { ReportV4AcceptanceFaultController } from "./report-v4-acceptance-fault-controller";
import {
  ReportV4DiagnosisProviderError,
  type ReportV4DiagnosisProvider
} from "./report-v4-diagnosis-enhancer";
import type { ReportV4SourceAuditDependencies, ReportV4SourceAuditRead } from "./report-v4-source-audit";
import type { ReportV4DiagnosisCheckpoint } from "../db/report-v4-diagnosis-checkpoints";
import { computeReportV4DiagnosisTerminalCheckpointFingerprint } from "../report-v4/report-v4-acceptance-checkpoint-fingerprints";

export interface ReportV4EnhancementAcceptanceRuntime {
  readonly observer: ReportV4AcceptanceObserver;
  readonly faultController: ReportV4AcceptanceFaultController;
}

export async function observeReportV4DiagnosisTerminalCheckpoint(runtime: ReportV4EnhancementAcceptanceRuntime, checkpoint: ReportV4DiagnosisCheckpoint): Promise<void> {
  if (checkpoint.state !== "completed" && checkpoint.state !== "failed") {
    throw new TypeError("A terminal Report V4 diagnosis checkpoint must be completed or failed.");
  }
  await runtime.observer.observe({ kind: "checkpoint_terminal", operation: "source_diagnosis", phase: "observed", unitId: checkpoint.identityHash, attempt: 0, details: { checkpointHash: computeReportV4DiagnosisTerminalCheckpointFingerprint(checkpoint), state: checkpoint.state } });
}

export function withReportV4EnhancementAcceptanceSourceAudit(input: {
  readonly dependencies: ReportV4SourceAuditDependencies;
  readonly runtime: ReportV4EnhancementAcceptanceRuntime | null;
  readonly enhancementJobId: string;
  readonly baselineFingerprint: string;
}): ReportV4SourceAuditDependencies {
  if (!input.runtime) return input.dependencies;
  return {
    async readRawSource(source, signal) {
      if (input.runtime!.observer.scenario.kind === "success") {
        const fault = await input.runtime!.faultController.consume({
          jobId: input.enhancementJobId,
          questionId: source.questionId,
          sourceId: source.sourceId,
          occurrence: 1,
          baselineFingerprint: input.baselineFingerprint
        });
        if (fault.status === "inject" || fault.status === "already_consumed") {
          if (fault.fault !== "independent_source_read_failure") {
            throw new Error("The Report V4 source-read boundary received a non-source acceptance fault.");
          }
          return { status: "inaccessible" };
        }
      }
      return observeSourceRead({
        runtime: input.runtime!, source, operation: "site_raw_read", readMode: "raw", signal,
        read: () => input.dependencies.readRawSource(source, signal), enhancementJobId: input.enhancementJobId
      });
    },
    renderBrowserSource(source, signal) {
      return observeSourceRead({
        runtime: input.runtime!, source, operation: "site_browser_read", readMode: "browser", signal,
        read: () => input.dependencies.renderBrowserSource(source, signal), enhancementJobId: input.enhancementJobId
      });
    }
  };
}

export function withReportV4EnhancementAcceptanceDiagnosisProvider(input: {
  readonly provider: ReportV4DiagnosisProvider;
  readonly runtime: ReportV4EnhancementAcceptanceRuntime | null;
  readonly enhancementJobId: string;
  readonly questionId: string;
  readonly attempt: 1 | 2;
  readonly baselineFingerprint: string;
}): ReportV4DiagnosisProvider {
  if (!input.runtime) return input.provider;
  return {
    async generate(request) {
      if (input.runtime!.observer.scenario.kind === "diagnosis_failure") {
        const fault = await input.runtime!.faultController.consume({
          jobId: input.enhancementJobId,
          questionId: input.questionId,
          occurrence: input.attempt,
          baselineFingerprint: input.baselineFingerprint
        });
        if (fault.status === "inject" || fault.status === "already_consumed") {
          if (fault.fault !== "diagnosis_failure") {
            throw new Error("The Report V4 diagnosis boundary received a non-diagnosis acceptance fault.");
          }
          throw new ReportV4DiagnosisProviderError(
            "temporary_provider",
            "Protected staging injected a bounded Report V4 diagnosis provider failure."
          );
        }
      }

      const event = diagnosisEvent(input.enhancementJobId, input.questionId, input.attempt, "started");
      await input.runtime!.observer.claimExternalIo(event);
      try {
        const result = await input.provider.generate(request);
        await input.runtime!.observer.finishExternalIo({ ...event, phase: "completed" });
        return result;
      } catch (error) {
        await input.runtime!.observer.finishExternalIo({ ...event, phase: "failed" });
        throw error;
      }
    }
  };
}

export async function observeReportV4EnhancementHtmlPersistence<Result extends { readonly htmlSha256: string }>(input: {
  readonly runtime: ReportV4EnhancementAcceptanceRuntime | null;
  readonly artifactRevisionId: string;
  readonly html: string;
  readonly persist: () => Promise<Result>;
}): Promise<Result> {
  if (!input.runtime) return input.persist();
  const started = {
    kind: "html_assembly" as const,
    operation: "enhancement_html" as const,
    unitId: input.artifactRevisionId,
    attempt: 0 as const,
    phase: "started" as const,
    details: { artifactRevisionId: input.artifactRevisionId, htmlSha256: sha256(input.html) }
  };
  await input.runtime.observer.observe(started);
  let persisted: Result;
  try {
    persisted = await input.persist();
    if (persisted.htmlSha256 !== started.details.htmlSha256) throw new Error("Persisted Report V4 enhancement HTML hash mismatch.");
  } catch (error) {
    await input.runtime.observer.observe({ ...started, phase: "failed" });
    throw error;
  }
  await input.runtime.observer.observe({
    kind: "html_assembly",
    operation: "enhancement_html",
    unitId: input.artifactRevisionId,
    attempt: 0,
    phase: "completed",
    details: { artifactRevisionId: input.artifactRevisionId, htmlSha256: persisted.htmlSha256 }
  });
  return persisted;
}

export async function observeReportV4EnhancementActivation<Result>(input: {
  readonly runtime: ReportV4EnhancementAcceptanceRuntime | null;
  readonly artifactRevisionId: string;
  readonly htmlSha256: string;
  readonly activate: () => Promise<Result>;
}): Promise<Result> {
  const result = await input.activate();
  await observeActivationIdentity(input.runtime, input.artifactRevisionId, input.htmlSha256);
  return result;
}

export async function observeReportV4RecoveredEnhancementActivation(input: {
  readonly runtime: ReportV4EnhancementAcceptanceRuntime | null;
  readonly activeArtifactRevisionId: string;
  readonly enhancementArtifactRevisionId: string;
  readonly htmlSha256: string;
}): Promise<void> {
  if (input.activeArtifactRevisionId !== input.enhancementArtifactRevisionId) return;
  if (input.runtime) {
    const details = { artifactRevisionId: input.enhancementArtifactRevisionId, htmlSha256: input.htmlSha256 };
    await input.runtime.observer.observe({ kind: "html_assembly", operation: "enhancement_html", unitId: input.enhancementArtifactRevisionId, attempt: 0, phase: "started", details });
    await input.runtime.observer.observe({ kind: "html_assembly", operation: "enhancement_html", unitId: input.enhancementArtifactRevisionId, attempt: 0, phase: "completed", details });
  }
  await observeActivationIdentity(input.runtime, input.enhancementArtifactRevisionId, input.htmlSha256);
}

async function observeSourceRead(input: {
  readonly runtime: ReportV4EnhancementAcceptanceRuntime;
  readonly source: CombinedGeoReportV4Source;
  readonly operation: "site_raw_read" | "site_browser_read";
  readonly readMode: "raw" | "browser";
  readonly signal?: AbortSignal;
  readonly read: () => Promise<ReportV4SourceAuditRead>;
  readonly enhancementJobId: string;
}): Promise<ReportV4SourceAuditRead> {
  input.signal?.throwIfAborted();
  const event = sourceReadEvent(input);
  await input.runtime.observer.claimExternalIo(event);
  try {
    const result = await input.read();
    input.signal?.throwIfAborted();
    await input.runtime.observer.finishExternalIo({ ...event, phase: "completed" });
    return result;
  } catch (error) {
    await input.runtime.observer.finishExternalIo({ ...event, phase: "failed" });
    throw error;
  }
}

function sourceReadEvent(input: {
  readonly source: CombinedGeoReportV4Source;
  readonly operation: "site_raw_read" | "site_browser_read";
  readonly readMode: "raw" | "browser";
  readonly enhancementJobId: string;
}): Extract<ReportV4AcceptanceObserverEvent, { kind: "site_read" }> {
  return {
    kind: "site_read",
    operation: input.operation,
    unitId: `${input.enhancementJobId}:${input.source.questionId}:${input.source.sourceId}`,
    attempt: 1,
    phase: "started",
    details: {
      urlHash: sha256(input.source.canonicalUrl),
      readMode: input.readMode,
      networkPerformed: true
    }
  };
}

function diagnosisEvent(
  enhancementJobId: string,
  questionId: string,
  attempt: 1 | 2,
  phase: "started"
): Extract<ReportV4AcceptanceObserverEvent, { kind: "model_operation" }> {
  return {
    kind: "model_operation",
    operation: "source_diagnosis",
    unitId: `${enhancementJobId}:${questionId}`,
    attempt,
    phase,
    details: {
      providerCall: true,
      retry: attempt === 2,
      budgetOutcome: "allowed",
      inputTokens: 0,
      outputTokens: 0
    }
  };
}

async function observeActivationIdentity(
  runtime: ReportV4EnhancementAcceptanceRuntime | null,
  artifactRevisionId: string,
  htmlSha256: string
): Promise<void> {
  if (!runtime) return;
  await runtime.observer.observe({
    kind: "artifact_activation",
    operation: "artifact_activation",
    unitId: artifactRevisionId,
    attempt: 0,
    phase: "observed",
    details: { artifactRevisionId, htmlSha256 }
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

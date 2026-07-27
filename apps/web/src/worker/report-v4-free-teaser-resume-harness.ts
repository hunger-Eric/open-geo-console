/**
 * In-memory Free V4 teaser checkpoint/resume dry harness (tests only).
 * No database, no real model transport — pure classification + call budgets.
 */
import type { FreeTeaserCheckpointV1, FreeTeaserStage } from "./report-v4-free-teaser";

/** Durable resume points used by the local Phase-3 matrix. */
export type FreeTeaserResumeKind =
  | "questions_ready"
  | "observations_ready"
  | "q1_answer_ready"
  | "q1_diagnosis_ready"
  | "ready";

export type FreeTeaserExpensiveCallBudget = Readonly<{
  /** Public-search snapshot resolve calls (3 questions when observations missing). */
  resolveSnapshot: number;
  /** Generative Q1 answer provider. */
  answerWithSources: number;
  /** Structured diagnosis enhancer. */
  enhanceDiagnosis: number;
  /** Unified semantic-review invoker. */
  semanticInvoke: number;
}>;

const ZERO_BUDGET: FreeTeaserExpensiveCallBudget = Object.freeze({
  resolveSnapshot: 0,
  answerWithSources: 0,
  enhanceDiagnosis: 0,
  semanticInvoke: 0
});

/**
 * Classify a persisted free-teaser checkpoint into a resume matrix kind.
 * `q1_answer_ready` splits on whether diagnosis draft is already durable.
 */
export function classifyFreeTeaserResumeKind(checkpoint: FreeTeaserCheckpointV1): FreeTeaserResumeKind {
  if (checkpoint.stage === "ready") return "ready";
  if (checkpoint.stage === "questions_ready") return "questions_ready";
  if (checkpoint.stage === "observations_ready") return "observations_ready";
  if (checkpoint.stage === "q1_answer_ready") {
    if (checkpoint.q1DiagnosisDraft) return "q1_diagnosis_ready";
    return "q1_answer_ready";
  }
  throw new TypeError(`Unsupported free-teaser resume stage: ${String((checkpoint as { stage?: unknown }).stage)}`);
}

/**
 * Expected expensive provider/search calls when resuming a **marked** Free V4
 * teaser (semantic review enabled) from a durable checkpoint of the given kind.
 * Snapshot re-resolve is never expected once observation IDs are durable.
 */
export function expectedExpensiveCallsOnMarkedResume(kind: FreeTeaserResumeKind): FreeTeaserExpensiveCallBudget {
  switch (kind) {
    case "ready":
      return ZERO_BUDGET;
    case "q1_diagnosis_ready":
      return Object.freeze({
        resolveSnapshot: 0,
        answerWithSources: 0,
        enhanceDiagnosis: 0,
        semanticInvoke: 1
      });
    case "q1_answer_ready":
      return Object.freeze({
        resolveSnapshot: 0,
        answerWithSources: 0,
        enhanceDiagnosis: 1,
        semanticInvoke: 1
      });
    case "observations_ready":
      return Object.freeze({
        resolveSnapshot: 0,
        answerWithSources: 1,
        enhanceDiagnosis: 1,
        semanticInvoke: 1
      });
    case "questions_ready":
      return Object.freeze({
        resolveSnapshot: 3,
        answerWithSources: 1,
        enhanceDiagnosis: 1,
        semanticInvoke: 1
      });
    default: {
      const _exhaustive: never = kind;
      throw new TypeError(`Unknown resume kind: ${String(_exhaustive)}`);
    }
  }
}

export interface InMemoryFreeTeaserCheckpointSink {
  readonly saved: FreeTeaserCheckpointV1[];
  saveCheckpoint(checkpoint: FreeTeaserCheckpointV1, phase?: string): Promise<void>;
  /** First checkpoint matching each resume kind, in capture order. */
  firstByKind(): Partial<Record<FreeTeaserResumeKind, FreeTeaserCheckpointV1>>;
  /** Stage sequence for assertions (raw stage field, including repeated q1_answer_ready). */
  stageSequence(): FreeTeaserStage[];
}

/** Collect free-teaser checkpoints in memory (structuredClone per save). */
export function createInMemoryFreeTeaserCheckpointSink(): InMemoryFreeTeaserCheckpointSink {
  const saved: FreeTeaserCheckpointV1[] = [];
  return {
    saved,
    async saveCheckpoint(checkpoint) {
      saved.push(structuredClone(checkpoint));
    },
    firstByKind() {
      const out: Partial<Record<FreeTeaserResumeKind, FreeTeaserCheckpointV1>> = {};
      for (const checkpoint of saved) {
        const kind = classifyFreeTeaserResumeKind(checkpoint);
        if (!out[kind]) out[kind] = checkpoint;
      }
      return out;
    },
    stageSequence() {
      return saved.map((checkpoint) => checkpoint.stage);
    }
  };
}

export interface FreeTeaserExpensiveCallCounts {
  resolveSnapshot: number;
  answerWithSources: number;
  enhanceDiagnosis: number;
  semanticInvoke: number;
}

/** True when observed expensive call counts match the resume budget exactly. */
export function matchesExpensiveCallBudget(
  observed: FreeTeaserExpensiveCallCounts,
  expected: FreeTeaserExpensiveCallBudget
): boolean {
  return (
    observed.resolveSnapshot === expected.resolveSnapshot
    && observed.answerWithSources === expected.answerWithSources
    && observed.enhanceDiagnosis === expected.enhanceDiagnosis
    && observed.semanticInvoke === expected.semanticInvoke
  );
}

import type { ExplainableSignal, PublicSourceRetrievalState, RetrievalReadinessSignals } from "./types";

export interface RetrievalReadinessInput {
  retrievalState: PublicSourceRetrievalState;
  canonicalUrlValid: boolean;
  publiclyRoutable: boolean;
  robotsAllowed: boolean;
  accessBarrierAbsent: boolean;
  boundedContent: boolean;
  boundedExcerptAvailable?: boolean;
  usableText: boolean;
}

const DEFINITIONS = [
  ["canonical_url_valid", 10, "The result resolves to a canonical absolute HTTP(S) URL."],
  ["publicly_routable", 20, "The safe retrieval boundary classified the destination as publicly routable."],
  ["robots_allowed", 15, "Robots policy allowed retrieval for every checked origin."],
  ["access_barrier_absent", 15, "No login, paywall, or CAPTCHA barrier was observed."],
  ["bounded_content", 15, "Retrieved content stayed within configured extraction bounds."],
  ["usable_text", 25, "The retrieved document yielded non-empty normalized text."]
] as const;

export function scoreRetrievalReadiness(input: RetrievalReadinessInput): RetrievalReadinessSignals {
  const values: Record<(typeof DEFINITIONS)[number][0], boolean> = {
    canonical_url_valid: input.canonicalUrlValid,
    publicly_routable: input.publiclyRoutable,
    robots_allowed: input.robotsAllowed,
    access_barrier_absent: input.accessBarrierAbsent,
    bounded_content: input.boundedContent,
    usable_text: input.usableText
  };
  const signals: ExplainableSignal[] = DEFINITIONS.map(([id, weight, explanation]) => ({
    id,
    weight,
    explanation,
    passed: values[id]
  }));
  const ready = input.retrievalState === "available" && signals.every(({ id, passed }) =>
    passed || (id === "bounded_content" && input.boundedExcerptAvailable === true));
  return {
    version: "retrieval-readiness-v1",
    signals,
    ready,
    score: signals.reduce((sum, signal) => sum + (signal.passed ? signal.weight : 0), 0)
  };
}

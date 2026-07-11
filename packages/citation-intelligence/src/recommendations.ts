import type { EntityCandidate, RecommendationKind, RecommendationSignal } from "./types";
import { validateRecommendationSignal } from "./validation";

export function classifyRecommendations(answerText: string, candidates: EntityCandidate[]): RecommendationSignal[] {
  const clauses = splitClauses(answerText);
  const recommendations: RecommendationSignal[] = [];

  for (const candidate of candidates) {
    const namedClauses = clauses.filter((clause) => containsStandaloneName(clause, candidate, candidates));
    for (const clause of namedClauses) {
      if (hasNegatedRecommendation(clause)) continue;
      const match = recommendationPatternsFor(candidate.name).find(([, pattern]) => pattern.test(clause));
      if (!match) continue;
      recommendations.push(
        validateRecommendationSignal({
          entityId: candidate.entityId,
          entityName: candidate.name,
          kind: match[0],
          supportingText: clause
        })
      );
    }
  }

  return recommendations;
}

function hasNegatedRecommendation(text: string): boolean {
  return /\b(?:not|never|cannot|can't|do not|don't|isn't|aren't)\b.{0,24}\b(?:recommend(?:ed)?|suitable|candidate|choice)\b/i.test(
    text
  );
}

function recommendationPatternsFor(name: string): ReadonlyArray<[RecommendationKind, RegExp]> {
  const entity = entityPattern(name);
  return [
    [
      "preferred_choice",
      new RegExp(
        `(?:\\brecommend(?:ed|s|ing)?\\s+(?:the\\s+)?${entity}|${entity}\\s+(?:is|are)\\s+(?:(?:a|the)\\s+)?(?:recommended|preferred|best)(?:\\s+choice)?)`,
        "iu"
      )
    ],
    [
      "direct_candidate",
      new RegExp(
        `${entity}\\s+(?:is|are)\\s+(?:an?\\s+)?(?:(?:strong|leading|viable|top)\\s+)?candidate`,
        "iu"
      )
    ],
    [
      "example",
      new RegExp(
        `(?:\\bfor example\\s*,?\\s*${entity}|\\bsuch as\\s+${entity}|${entity}\\s+(?:is|are)\\s+an?\\s+example)`,
        "iu"
      )
    ],
    ["suitability", new RegExp(`${entity}\\s+(?:is|are)\\s+(?:well\\s+)?suitable`, "iu")]
  ];
}

function splitClauses(text: string): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [];
  return sentences
    .flatMap((sentence) => sentence.split(/(?:,\s*)?\b(?:but|however|whereas|while)\b\s*|[;；—–]\s*/iu))
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function containsStandaloneName(text: string, candidate: EntityCandidate, candidates: EntityCandidate[]): boolean {
  const candidateSpans = nameSpans(text, candidate.name);
  if (candidateSpans.length === 0) return false;
  const longerSpans = candidates
    .filter((other) => other !== candidate && other.name.trim().length > candidate.name.trim().length)
    .flatMap((other) => nameSpans(text, other.name));
  return candidateSpans.some(
    (span) => !longerSpans.some((longer) => longer.start <= span.start && longer.end >= span.end)
  );
}

function nameSpans(text: string, name: string): Array<{ start: number; end: number }> {
  const pattern = new RegExp(entityPattern(name), "giu");
  return [...text.matchAll(pattern)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function entityPattern(name: string): string {
  const escaped = escapeRegExp(name.trim()).replace(/\s+/g, "\\s+");
  return `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { createHash } from "node:crypto";

export const PROVIDER_PASSAGE_SELECTOR_VERSION = "provider-passage-selector-v1" as const;

export interface SelectProviderPassagesInput {
  sourceEvidenceId: string;
  normalizedText: string;
  candidateNames: readonly string[];
  serviceTerms: readonly string[];
  controlTerms: readonly string[];
  capabilityTerms: readonly string[];
  selectorVersion: typeof PROVIDER_PASSAGE_SELECTOR_VERSION;
}

export interface ProviderEvidencePassage {
  passageId: string;
  sourceEvidenceId: string;
  passageOrder: number;
  exactExcerpt: string;
  excerptHash: string;
  relevanceScore: number;
  matchedEntityTerms: string[];
  matchedServiceTerms: string[];
  matchedControlTerms: string[];
  matchedCapabilityTerms: string[];
  selectorVersion: typeof PROVIDER_PASSAGE_SELECTOR_VERSION;
}

export function selectProviderPassages(input: SelectProviderPassagesInput): ProviderEvidencePassage[] {
  if (!input.sourceEvidenceId.trim() || !input.normalizedText.trim()) return [];
  const chunks = chunkText(input.normalizedText);
  return chunks.map((exactExcerpt, passageOrder) => assessPassage(input, exactExcerpt, passageOrder))
    .filter((passage): passage is ProviderEvidencePassage => passage !== null)
    .sort((left, right) => right.relevanceScore - left.relevanceScore || left.excerptHash.localeCompare(right.excerptHash))
    .slice(0, 3);
}

function assessPassage(input: SelectProviderPassagesInput, exactExcerpt: string, passageOrder: number): ProviderEvidencePassage | null {
  const value = normalize(exactExcerpt);
  const matchedEntityTerms = matches(value, input.candidateNames);
  const matchedServiceTerms = matches(value, input.serviceTerms);
  const matchedControlTerms = matches(value, input.controlTerms);
  const matchedCapabilityTerms = matches(value, input.capabilityTerms);
  const proximity = matchedEntityTerms.length > 0 && matchedServiceTerms.length > 0 && matchedControlTerms.length > 0 && matchedCapabilityTerms.length > 0;
  const relevanceScore =
    (matchedEntityTerms.length ? 25 : 0) +
    (matchedServiceTerms.length ? 25 : 0) +
    (matchedControlTerms.length ? 25 : 0) +
    (matchedCapabilityTerms.length ? 15 : 0) +
    (proximity ? 10 : 0);
  if (relevanceScore < 45) return null;
  const excerptHash = sha(exactExcerpt);
  return {
    passageId: `provider-passage:${sha(`${input.sourceEvidenceId}\0${passageOrder}\0${excerptHash}`)}`,
    sourceEvidenceId: input.sourceEvidenceId,
    passageOrder,
    exactExcerpt,
    excerptHash,
    relevanceScore,
    matchedEntityTerms,
    matchedServiceTerms,
    matchedControlTerms,
    matchedCapabilityTerms,
    selectorVersion: input.selectorVersion
  };
}

function chunkText(value: string): string[] {
  const blocks = value.split(/\n+/).map((block) => block.trim()).filter(Boolean);
  const output: string[] = [];
  for (const block of blocks) {
    if (block.length <= 1_200) {
      output.push(block);
      continue;
    }
    const sentences = block.split(/(?<=[。！？.!?])\s*/).filter(Boolean);
    let current = "";
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 1_200) {
        output.push(current);
        current = "";
      }
      if (sentence.length > 1_200) {
        for (let start = 0; start < sentence.length; start += 1_200) output.push(sentence.slice(start, start + 1_200));
      } else {
        current += sentence;
      }
    }
    if (current) output.push(current);
  }
  return output;
}

function matches(haystack: string, terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.normalize("NFKC").trim()).filter((term) => term && haystack.includes(normalize(term))))]
    .sort((left, right) => left.localeCompare(right));
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function sha(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

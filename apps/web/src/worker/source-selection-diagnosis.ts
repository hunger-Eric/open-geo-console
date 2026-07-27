import { createHash } from "node:crypto";
import {
  buildSourceSelectionDiagnosisV1,
  type GenerativeSearchAnswerCardV3,
  type SourceSelectionDiagnosisV1,
  type SourceSelectionTargetPageInputV1
} from "@open-geo-console/ai-report-engine";
import { getPublicSourceDomainIdentity } from "@open-geo-console/citation-intelligence";
import type { AnswerFirstV3StoredSource } from "./answer-first-v3";

export interface SourceSelectionTargetPageSignal {
  url: string;
  title?: string | null;
  metaDescription?: string | null;
  h1: readonly string[];
  readableTextLength: number;
  hasJsonLd: boolean;
  status: number;
}

export interface SourceSelectionDiagnosisForGenerativeV3Input {
  answerCards: [GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3, GenerativeSearchAnswerCardV3];
  auditSources: readonly AnswerFirstV3StoredSource[];
  targetUrl: string;
  targetPages: readonly SourceSelectionTargetPageSignal[];
  locale: string;
  answerHash: string;
  sourceHash: string;
}

export function buildSourceSelectionDiagnosisForGenerativeV3(input: SourceSelectionDiagnosisForGenerativeV3Input): SourceSelectionDiagnosisV1 {
  const auditByUrl = new Map(input.auditSources.map((source) => [comparableUrl(source.canonicalUrl), source]));
  const targetPages = normalizedTargetPages(input.targetPages);
  return buildSourceSelectionDiagnosisV1({
    locale: input.locale.toLocaleLowerCase().startsWith("zh") ? "zh" : "en",
    answerHash: input.answerHash,
    sourceHash: input.sourceHash,
    targetFoundationHash: sourceSelectionTargetFoundationHash(input.targetPages),
    targetDomain: getPublicSourceDomainIdentity(input.targetUrl).registrableDomain,
    targetPages,
    questions: input.answerCards.map((card) => ({
      questionId: card.questionId,
      answerText: card.answerText,
      sources: card.sources.map((source) => {
        const audit = auditByUrl.get(comparableUrl(source.canonicalUrl));
        return {
          questionId: card.questionId,
          sourceId: source.sourceId,
          title: source.title,
          canonicalUrl: source.canonicalUrl,
          registrableDomain: source.registrableDomain,
          citedText: source.citedText,
          auditExcerpt: audit?.exactExcerpt ?? null,
          retrievalStatus: source.retrievalStatus,
          ownershipCategory: source.ownershipCategory,
          providerResultOrder: source.providerResultOrder
        };
      })
    }))
  });
}

export function sourceSelectionTargetFoundationHash(pages: readonly SourceSelectionTargetPageSignal[]): string {
  const normalized = normalizedTargetPages(pages).map((page) => ({
    url: page.url,
    title: page.title,
    metaDescription: page.metaDescription,
    h1: page.h1,
    readableTextLength: page.readableTextLength,
    hasJsonLd: page.hasJsonLd
  }));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizedTargetPages(pages: readonly SourceSelectionTargetPageSignal[]): SourceSelectionTargetPageInputV1[] {
  return pages.map((page) => ({
    id: comparableUrl(page.url),
    url: comparableUrl(page.url),
    title: cleanNullable(page.title),
    metaDescription: cleanNullable(page.metaDescription),
    h1: page.h1.map((value) => value.trim()).filter(Boolean).sort(),
    readableTextLength: Math.max(0, Math.floor(page.readableTextLength)),
    hasJsonLd: page.hasJsonLd
  })).sort((left, right) => left.url.localeCompare(right.url));
}

function comparableUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return value.trim();
  }
}

function cleanNullable(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

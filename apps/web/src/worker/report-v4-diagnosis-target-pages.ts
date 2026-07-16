import {
  REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES,
  REPORT_V4_MAX_TARGET_SUMMARY_CHARS,
  parseReportV4SiteSynthesisInput,
  type ReportV4DiagnosisTargetPage,
  type ReportV4PageSummary,
  type ReportV4PageSummaryChunk
} from "@open-geo-console/ai-report-engine";

export interface SelectReportV4DiagnosisTargetPagesInput {
  readonly questionId: string;
  readonly question: string;
  readonly answer: string;
  readonly pages: readonly ReportV4PageSummary[];
}

const INPUT_FIELDS = new Set(["questionId", "question", "answer", "pages"]);
const MAX_TARGET_LOCATIONS = 16;
const ENGLISH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "can", "do", "does", "for", "from",
  "had", "has", "have", "how", "in", "into", "is", "it", "its", "may", "of", "on", "or", "our", "that",
  "the", "their", "there", "these", "they", "this", "those", "to", "was", "we", "were", "what", "when",
  "where", "which", "who", "why", "will", "with", "would", "you", "your"
]);
const CHINESE_STOP_WORDS = new Set([
  "\u4ec0\u4e48", "\u4e3a\u4ec0\u4e48", "\u5982\u4f55", "\u600e\u4e48", "\u4e86\u89e3", "\u54ea\u4e9b", "\u54ea\u4e2a", "\u4e00\u4e2a", "\u8fd9\u4e2a", "\u90a3\u4e2a",
  "\u6211\u4eec", "\u4f60\u4eec", "\u4ed6\u4eec", "\u4ee5\u53ca", "\u800c\u4e14", "\u5e76\u4e14", "\u53ef\u4ee5", "\u662f\u5426", "\u8fdb\u884c", "\u76f8\u5173",
  "\u5f53\u524d", "\u95ee\u9898", "\u7b54\u6848", "\u9875\u9762", "\u5185\u5bb9", "\u4fe1\u606f", "\u516c\u53f8"
]);

interface RankedPage {
  readonly page: ReportV4PageSummary;
  readonly relevantChunks: readonly ReportV4PageSummaryChunk[];
  readonly score: number;
  readonly pageIndex: number;
}

/**
 * Selects only saved target-site summaries that overlap with one answered question.
 * This boundary is deliberately local and deterministic: it never crawls or invokes a model.
 */
export function selectReportV4DiagnosisTargetPages(
  value: SelectReportV4DiagnosisTargetPagesInput
): readonly ReportV4DiagnosisTargetPage[] {
  const root = strictObject(value, "$diagnosisTargetPages", INPUT_FIELDS);
  const questionId = boundedText(root.questionId, "$diagnosisTargetPages.questionId", 500);
  const question = boundedText(root.question, "$diagnosisTargetPages.question", 10_000);
  const answer = optionalText(root.answer, "$diagnosisTargetPages.answer", 30_000);
  if (!Array.isArray(root.pages)) throw new TypeError("$diagnosisTargetPages.pages must be an array.");

  const parsedPages = parseReportV4SiteSynthesisInput({
    targetUrl: "https://diagnosis-target-selector.invalid/",
    locale: "und",
    pages: root.pages
  }).pages;
  const queryTerms = tokenize(`${question}\n${answer}`);
  if (queryTerms.size === 0) return Object.freeze([]);

  const ranked = parsedPages.flatMap((page, pageIndex): readonly RankedPage[] => {
    let score = 0;
    const relevantChunks = page.chunks.filter((chunk) => {
      const chunkScore = relevanceScore(queryTerms, tokenize(chunk.summary));
      score += chunkScore;
      return chunkScore > 0;
    });
    return relevantChunks.length === 0 ? [] : [{ page, relevantChunks, score, pageIndex }];
  }).sort((left, right) => (
    right.score - left.score
    || left.pageIndex - right.pageIndex
    || left.page.pageId.localeCompare(right.page.pageId)
  ));

  const usesChinese = /\p{Script=Han}/u.test(`${question}${answer}`);
  const reason = usesChinese
    ? answer
      ? "\u8be5\u9875\u9762\u5185\u5bb9\u4e0e\u5f53\u524d\u95ee\u9898\u53ca\u5df2\u4fdd\u5b58\u7b54\u6848\u4e2d\u7684\u5173\u952e\u8868\u8fbe\u76f8\u5173\u3002"
      : "\u8be5\u9875\u9762\u5185\u5bb9\u4e0e\u5f53\u524d\u95ee\u9898\u4e2d\u7684\u5173\u952e\u8868\u8fbe\u76f8\u5173\u3002"
    : answer
      ? "This page content shares key terms with the current question and saved answer."
      : "This page content shares key terms with the current question.";
  const selected = ranked.slice(0, REPORT_V4_MAX_DIAGNOSIS_TARGET_PAGES).map(({ page, relevantChunks }) => {
    const includedChunks: ReportV4PageSummaryChunk[] = [];
    let summaryLength = 0;
    let locationCount = 0;
    for (const chunk of relevantChunks) {
      const delimiterLength = includedChunks.length === 0 ? 0 : 2;
      if (summaryLength + delimiterLength + chunk.summary.length > REPORT_V4_MAX_TARGET_SUMMARY_CHARS) continue;
      if (locationCount + chunk.sourceLocations.length > MAX_TARGET_LOCATIONS) continue;
      includedChunks.push(chunk);
      summaryLength += delimiterLength + chunk.summary.length;
      locationCount += chunk.sourceLocations.length;
    }
    if (includedChunks.length === 0) {
      throw new TypeError("A relevant V4 page must retain at least one bounded summary chunk and source location.");
    }
    const sourceLocations = includedChunks.flatMap((chunk) => chunk.sourceLocations.map((location) => Object.freeze({
      locationId: location.locationId,
      startOffset: location.startOffset,
      endOffset: location.endOffset
    })));
    return Object.freeze({
      questionId,
      pageId: page.pageId,
      url: page.url,
      relevanceReason: reason,
      summary: includedChunks.map(({ summary }) => summary).join("\n\n"),
      sourceLocations: Object.freeze(sourceLocations)
    });
  });

  return Object.freeze(selected);
}

function relevanceScore(queryTerms: ReadonlySet<string>, summaryTerms: ReadonlySet<string>): number {
  let matches = 0;
  let distinctiveMatch = false;
  for (const term of summaryTerms) {
    if (!queryTerms.has(term)) continue;
    matches += term.length;
    if (/\p{Script=Han}/u.test(term) ? term.length >= 3 : term.length >= 7) distinctiveMatch = true;
  }
  return matches >= 8 || distinctiveMatch ? matches : 0;
}

function tokenize(value: string): ReadonlySet<string> {
  const normalized = value.normalize("NFKC").toLocaleLowerCase("en-US");
  const terms = new Set<string>();
  for (const token of normalized.match(/\p{Script=Han}+|[\p{Script=Latin}\p{N}]+/gu) ?? []) {
    if (/^\p{Script=Han}+$/u.test(token)) {
      addChineseTerms(token, terms);
      continue;
    }
    if (token.length >= 3 && !ENGLISH_STOP_WORDS.has(token)) terms.add(token);
  }
  return terms;
}

function addChineseTerms(sequence: string, terms: Set<string>): void {
  let scrubbed = sequence;
  for (const stopWord of [...CHINESE_STOP_WORDS].sort((left, right) => right.length - left.length)) {
    scrubbed = scrubbed.split(stopWord).join(" ");
  }
  for (const meaningfulSequence of scrubbed.split(/\s+/u).filter(Boolean)) {
    for (let size = 2; size <= Math.min(4, meaningfulSequence.length); size += 1) {
      for (let index = 0; index + size <= meaningfulSequence.length; index += 1) {
        terms.add(meaningfulSequence.slice(index, index + size));
      }
    }
  }
}

function strictObject(value: unknown, path: string, allowed: ReadonlySet<string>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  const row = value as Record<string, unknown>;
  const unknownField = Object.keys(row).find((key) => !allowed.has(key));
  if (unknownField) throw new TypeError(`${path} contains unknown field ${unknownField}.`);
  return row;
}

function boundedText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new TypeError(`${path} must be non-empty text no longer than ${maximum} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, path: string, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum) {
    throw new TypeError(`${path} must be text no longer than ${maximum} characters.`);
  }
  return value.trim();
}

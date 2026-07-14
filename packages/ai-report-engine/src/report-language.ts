export type NormalizedReportLanguage = "en" | "zh";
export type ReportLanguageFieldKind = "prose" | "source_original" | "identifier";

export interface ReportLanguageField {
  path: string;
  text: string;
  kind?: ReportLanguageFieldKind;
}

export interface ReportLanguageViolation {
  path: string;
  reason: "unexpected_english_sentence" | "unexpected_chinese_prose";
}

export class ReportLanguageValidationError extends TypeError {
  readonly violations: ReportLanguageViolation[];

  constructor(violations: readonly ReportLanguageViolation[]) {
    const sanitizedViolations = violations
      .slice(0, MAX_VIOLATIONS)
      .map((violation, index) => ({
        path: sanitizeViolationPath(violation.path, index),
        reason: violation.reason
      }));
    super(`Report language validation failed at ${sanitizedViolations.map(({ path }) => path).join(", ")}.`);
    this.name = "ReportLanguageValidationError";
    this.violations = sanitizedViolations;
  }
}

const MAX_VIOLATIONS = 20;
const MAX_VIOLATION_PATH_LENGTH = 120;
const SAFE_FIELD_PATH = /^[A-Za-z][A-Za-z0-9_]*(?:\[\d+\]|\.[A-Za-z][A-Za-z0-9_]*)*$/;
const TECHNICAL_TERMS = new Set([
  "api",
  "cli",
  "css",
  "faqpage",
  "geo",
  "graphql",
  "html",
  "http",
  "https",
  "javascript",
  "json",
  "json-ld",
  "llm",
  "rest",
  "schema",
  "sdk",
  "seo",
  "sql",
  "typescript",
  "xml"
]);
const ORDINARY_ENGLISH_VERBS = new Set([
  "add",
  "change",
  "create",
  "fix",
  "improve",
  "include",
  "make",
  "need",
  "needs",
  "remove",
  "replace",
  "should",
  "update",
  "use"
]);
const ORDINARY_ENGLISH_FUNCTION_WORDS = new Set([
  "a",
  "all",
  "an",
  "and",
  "for",
  "from",
  "in",
  "is",
  "of",
  "on",
  "the",
  "this",
  "to",
  "with"
]);

export function normalizeReportLanguage(locale: string): NormalizedReportLanguage {
  const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
  if (language === "en" || language === "zh") return language;
  throw new TypeError(`Unsupported report locale: ${locale}.`);
}

export function reportLanguageInstruction(locale: string): string {
  return normalizeReportLanguage(locale) === "zh"
    ? "Write all report prose in Simplified Chinese. Keep only unavoidable official names, brands, product names, URLs, code, email addresses, and identifiers in their original form. Preserve verbatim evidence in its source language. Do not repeat the prose in English."
    : "Write all report prose in English. Keep only unavoidable official names and verbatim evidence in their source language. Do not repeat the prose in Chinese.";
}

export function assertReportLanguage(
  fields: readonly ReportLanguageField[],
  locale: string,
  allowedTerms: readonly string[] = []
): void {
  const language = normalizeReportLanguage(locale);
  const violations: ReportLanguageViolation[] = [];
  for (const field of fields) {
    if (violations.length >= MAX_VIOLATIONS) break;
    if ((field.kind ?? "prose") !== "prose") continue;

    const candidate = sanitize(field.text, allowedTerms);
    if (language === "zh" && containsOrdinaryEnglishClause(candidate)) {
      violations.push({ path: field.path, reason: "unexpected_english_sentence" });
    }
    if (language === "en" && /[\u3400-\u9fff]{2,}/u.test(candidate)) {
      violations.push({ path: field.path, reason: "unexpected_chinese_prose" });
    }
  }

  if (violations.length) throw new ReportLanguageValidationError(violations);
}

function containsOrdinaryEnglishClause(value: string): boolean {
  return value.split(/[.!?。！？;；\r\n]+/u).some((fragment) => {
    const words = fragment.match(/[A-Za-z][A-Za-z0-9]*(?:[-_./][A-Za-z0-9]+)*/g) ?? [];
    const proseWords = words.filter((word) => !isTechnicalToken(word));
    if (proseWords.length < 2) return false;

    const normalized = proseWords.map((word) => word.toLowerCase());
    const looksLikeProperName = proseWords.every((word) => /^[A-Z][a-z]+$/.test(word));
    if (looksLikeProperName) return false;

    const hasVerb = normalized.some((word) =>
      ORDINARY_ENGLISH_VERBS.has(word) || /(?:ed|ing)$/.test(word)
    );
    if (hasVerb) return true;

    const hasFunctionWord = normalized.some((word) => ORDINARY_ENGLISH_FUNCTION_WORDS.has(word));
    return proseWords.length >= 4 && hasFunctionWord;
  });
}

function isTechnicalToken(value: string): boolean {
  if (TECHNICAL_TERMS.has(value.toLowerCase())) return true;
  if (/^[A-Z][A-Z0-9._/-]*$/.test(value)) return true;
  if (/^[A-Za-z]+[A-Z][A-Za-z0-9]*$/.test(value)) return true;
  return /\d|_|\//.test(value);
}

function sanitizeViolationPath(value: string, index: number): string {
  if (value.length <= MAX_VIOLATION_PATH_LENGTH && SAFE_FIELD_PATH.test(value)) return value;
  return `field[${index}]`;
}

function sanitize(value: string, allowedTerms: readonly string[]): string {
  let result = value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, " ")
    .replace(/`[^`]*`/g, " ");

  for (const term of [...allowedTerms].sort((a, b) => b.length - a.length)) {
    if (term.trim()) result = result.split(term).join(" ");
  }
  return result;
}

export type NormalizedReportLanguage = "en" | "zh";
export type ReportLanguageFieldKind = "prose" | "source_original" | "identifier";

export interface ReportLanguageField {
  path: string;
  text: string;
  kind?: ReportLanguageFieldKind;
}

export interface ReportLanguageViolation {
  path: string;
  reason: "unexpected_english_sentence" | "unexpected_chinese_prose" | "legacy_seo_terminology";
}

export const GEO_TERMINOLOGY_POLICY = "geo_v1" as const;
export type ReportTerminologyPolicy = typeof GEO_TERMINOLOGY_POLICY;

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
  "ai",
  "api",
  "canonical",
  "cli",
  "css",
  "cta",
  "faqpage",
  "faq",
  "geo",
  "graphql",
  "hreflang",
  "html",
  "http",
  "https",
  "id",
  "javascript",
  "json",
  "json-ld",
  "kpi",
  "llm",
  "erp",
  "rest",
  "schema",
  "sdk",
  "seo",
  "serp",
  "sop",
  "sql",
  "tms",
  "typescript",
  "url",
  "xml"
]);
const TECHNICAL_HEADERS = new Set(["content-type", "x-robots-tag"]);
const DOTTED_FILE_EXTENSIONS = new Set(["css", "html", "js", "json", "md", "txt", "xml"]);
const HTML_TECHNICAL_TAGS = new Set([
  "a", "article", "body", "br", "div", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header",
  "html", "img", "li", "link", "main", "meta", "nav", "ol", "p", "script", "section", "span", "style", "table",
  "tbody", "td", "th", "thead", "title", "tr", "ul"
]);
const LEGACY_SEO_TERM = /\bSEO\b|\bsearch[ -]engine optimi[sz]ation\b|搜索引擎优化/iu;

export function normalizeReportLanguage(locale: string): NormalizedReportLanguage {
  const language = locale.trim().toLowerCase().split(/[-_]/, 1)[0];
  if (language === "en" || language === "zh") return language;
  throw new TypeError(`Unsupported report locale: ${locale}.`);
}

export function reportLanguageInstruction(locale: string): string {
  const terminology = " Use GEO terminology. Do not use SEO, Search Engine Optimization, or equivalent legacy terminology in report prose.";
  return normalizeReportLanguage(locale) === "zh"
    ? `Write all report prose in Simplified Chinese. Keep only unavoidable official names, brands, product names, URLs, code, email addresses, and identifiers in their original form. Preserve verbatim evidence in its source language. Outside evidence quote fields, translate or summarize source-language English into Simplified Chinese and never quote or repeat it in report prose. Do not repeat the prose in English.${terminology}`
    : `Write all report prose in English. Keep only unavoidable official names and verbatim evidence in their source language. Do not repeat the prose in Chinese.${terminology}`;
}

export function reportLanguageCorrectionFeedback(
  error: ReportLanguageValidationError,
  locale: string
): string[] {
  const language = normalizeReportLanguage(locale);
  return error.violations.map(({ path, reason }) => {
    if (reason === "legacy_seo_terminology") {
      return `${path}: ${reason}. Replace legacy SEO terminology with GEO terminology while preserving the meaning.`;
    }
    if (language === "zh") {
      return `${path}: ${reason}. Rewrite this field entirely in Simplified Chinese; keep verbatim source text only inside evidence quote fields.`;
    }
    return `${path}: ${reason}. Rewrite this field entirely in English; keep verbatim source text only inside evidence quote fields.`;
  });
}

export function assertGeoTerminology(
  fields: readonly ReportLanguageField[],
  policy: ReportTerminologyPolicy
): void {
  if (policy !== GEO_TERMINOLOGY_POLICY) return;
  const violations = fields
    .filter((field) => (field.kind ?? "prose") === "prose" && LEGACY_SEO_TERM.test(field.text))
    .map(({ path }) => ({ path, reason: "legacy_seo_terminology" as const }));
  if (violations.length) throw new ReportLanguageValidationError(violations);
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
    if (language === "zh" && containsOrdinaryEnglishWord(candidate)) {
      violations.push({ path: field.path, reason: "unexpected_english_sentence" });
    }
    if (language === "en" && /[\u3400-\u9fff]{2,}/u.test(candidate)) {
      violations.push({ path: field.path, reason: "unexpected_chinese_prose" });
    }
  }

  if (violations.length) throw new ReportLanguageValidationError(violations);
}

function containsOrdinaryEnglishWord(value: string): boolean {
  const words = value.match(/[A-Za-z][A-Za-z0-9]*(?:[-_./][A-Za-z0-9]+)*/g) ?? [];
  return words.some((word) => !isTechnicalToken(word));
}

function isTechnicalToken(value: string): boolean {
  const normalized = value.toLowerCase();
  if (/^[A-Za-z]$/.test(value)) return true;
  if (TECHNICAL_TERMS.has(normalized) || TECHNICAL_HEADERS.has(normalized)) return true;
  if (isSafeDottedFilename(value) || isSafeDomain(value)) return true;
  if (/^[a-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(value)) return true;
  if (/^[A-Z][a-z0-9]+[A-Z][A-Za-z0-9]*$/.test(value)) return true;
  return /\d|_|\//.test(value);
}

function isSafeDottedFilename(value: string): boolean {
  if (value.length > 128) return false;
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.([A-Za-z0-9]+)$/.exec(value);
  return match !== null && DOTTED_FILE_EXTENSIONS.has(match[2]?.toLowerCase() ?? "");
}

function isSafeDomain(value: string): boolean {
  if (value.length > 253) return false;
  return /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/.test(value);
}

function sanitizeViolationPath(value: string, index: number): string {
  if (value.length <= MAX_VIOLATION_PATH_LENGTH && SAFE_FIELD_PATH.test(value)) return value;
  return `field[${index}]`;
}

function sanitize(value: string, allowedTerms: readonly string[]): string {
  let result = value
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, " ")
    .replace(/<[^<>]{1,240}>/g, (markup) => isSafeTechnicalHtmlMarkup(markup) ? " " : markup)
    .replace(/https?:\/\/[^\s。！？；，、）】》)\]};,!"'<>]+/gi, " ")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, " ")
    .replace(/`[^`]*`/g, " ");

  for (const term of [...allowedTerms].sort((a, b) => b.length - a.length)) {
    if (term.trim()) result = result.split(term).join(" ");
  }
  return result;
}

function isSafeTechnicalHtmlMarkup(markup: string): boolean {
  const bareTag = /^<\s*\/?\s*([A-Za-z][A-Za-z0-9-]*)\s*\/?\s*>$/.exec(markup);
  if (bareTag) return HTML_TECHNICAL_TAGS.has(bareTag[1]!.toLowerCase());
  return /^<\s*meta\s+name\s*=\s*(["'])(?:description|robots|viewport)\1\s*\/?\s*>$/i.test(markup);
}

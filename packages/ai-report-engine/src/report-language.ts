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
  constructor(readonly violations: ReportLanguageViolation[]) {
    super(`Report language validation failed at ${violations.map(({ path }) => path).join(", ")}.`);
    this.name = "ReportLanguageValidationError";
  }
}

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
  const violations = fields.flatMap((field): ReportLanguageViolation[] => {
    if ((field.kind ?? "prose") !== "prose") return [];

    const candidate = sanitize(field.text, allowedTerms);
    if (
      language === "zh" &&
      /(?:\b[A-Za-z][A-Za-z'’\-]*\b[\s,;:—–-]+){4,}\b[A-Za-z][A-Za-z'’\-]*\b/.test(candidate)
    ) {
      return [{ path: field.path, reason: "unexpected_english_sentence" }];
    }
    if (language === "en" && /[\u3400-\u9fff]{2,}/u.test(candidate)) {
      return [{ path: field.path, reason: "unexpected_chinese_prose" }];
    }
    return [];
  });

  if (violations.length) throw new ReportLanguageValidationError(violations);
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

import { createHash } from "node:crypto";
import { canonicalizePublicSourceUrl, getPublicSourceDomainIdentity } from "@open-geo-console/citation-intelligence";
import { isBlockedHostname, parseHttpUrl } from "@open-geo-console/site-crawler";
import { assertReportLanguage, normalizeReportLanguage, ReportLanguageValidationError } from "./report-language";

export type GenerativeSearchRefusalCode = "safety_refusal" | "policy_refusal" | "high_risk_refusal";
export interface GenerativeSearchRefusal { code: GenerativeSearchRefusalCode; reason: string; }
export interface GenerativeSearchSource { sourceId: string; title: string; canonicalUrl: string; registrableDomain: string; citedText: string | null; providerResultOrder: number; }
export interface GenerativeSearchAnswerResult { questionId: string; answerText: string; sources: GenerativeSearchSource[]; refusal: GenerativeSearchRefusal | null; searchedAt: string; completedAt: string; providerResponseId: string | null; }
export interface GenerativeSearchAnswerProvider { readonly providerId: string; readonly model: string; readonly searchMode: string; answerWithSources(input: { questionId: string; question: string; locale: string; region: string; signal: AbortSignal }): Promise<GenerativeSearchAnswerResult>; }

const refusalCodes = new Set<GenerativeSearchRefusalCode>(["safety_refusal", "policy_refusal", "high_risk_refusal"]);
const text = (value: unknown, name: string, max: number) => { if (typeof value !== "string") throw new TypeError(`${name} must be a string.`); const v = value.trim(); if (v.length > max) throw new TypeError(`${name} exceeds the retained bound.`); return v; };
const timestamp = (value: unknown, name: string) => { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new TypeError(`${name} must be an ISO timestamp.`); return value; };

export function parseGenerativeSearchAnswerResult(value: unknown, options: { expectedQuestionId: string; locale: string }): GenerativeSearchAnswerResult {
  if (!value || typeof value !== "object") throw new TypeError("Generative search answer must be an object.");
  const row = value as Record<string, unknown>;
  const questionId = text(row.questionId, "questionId", 500);
  if (questionId !== options.expectedQuestionId) throw new TypeError("questionId does not match the expected question.");
  const answerText = text(row.answerText, "answerText", 12_000);
  const refusalValue = row.refusal;
  let refusal: GenerativeSearchRefusal | null = null;
  if (refusalValue !== null && refusalValue !== undefined) {
    if (!refusalValue || typeof refusalValue !== "object") throw new TypeError("refusal must be typed.");
    const r = refusalValue as Record<string, unknown>;
    if (typeof r.code !== "string" || !refusalCodes.has(r.code as GenerativeSearchRefusalCode)) throw new TypeError("refusal code is invalid.");
    refusal = { code: r.code as GenerativeSearchRefusalCode, reason: text(r.reason, "refusal.reason", 500) };
  }
  if (answerText && refusal) throw new TypeError("answerText and refusal may not be supplied together.");
  if (!answerText && !refusal) throw new TypeError("nonblank answerText is required unless a typed refusal is provided.");
  assertGenerativeAnswerLanguage([
    ...(answerText ? [{ path: "answerText", text: answerText }] : []),
    ...(refusal ? [{ path: "refusal.reason", text: refusal.reason }] : [])
  ], options.locale);
  if (!Array.isArray(row.sources) || row.sources.length > 20) throw new TypeError("sources must contain at most 20 items.");
  const byUrl = new Map<string, GenerativeSearchSource>();
  row.sources.forEach((item, index) => {
    if (!item || typeof item !== "object") throw new TypeError(`sources[${index}] must be an object.`);
    const source = item as Record<string, unknown>;
    const rawUrl = text(source.canonicalUrl, `sources[${index}].canonicalUrl`, 2_000);
    let canonicalUrl: string; let identity: ReturnType<typeof getPublicSourceDomainIdentity>;
    try { const parsed = parseHttpUrl(rawUrl); if (isBlockedHostname(parsed.hostname)) throw new Error("private destination"); identity = getPublicSourceDomainIdentity(rawUrl); canonicalUrl = canonicalizePublicSourceUrl(rawUrl); } catch { throw new TypeError("source URL must be a public HTTP(S) URL."); }
    const order = source.providerResultOrder; if (typeof order !== "number" || !Number.isInteger(order) || order < 0) throw new TypeError("providerResultOrder must be a nonnegative integer.");
    const candidate: GenerativeSearchSource = { sourceId: text(source.sourceId, `sources[${index}].sourceId`, 500), title: text(source.title, `sources[${index}].title`, 500), canonicalUrl, registrableDomain: identity.registrableDomain, citedText: source.citedText == null ? null : text(source.citedText, `sources[${index}].citedText`, 2_000), providerResultOrder: order };
    const prior = byUrl.get(canonicalUrl); if (!prior || order < prior.providerResultOrder) byUrl.set(canonicalUrl, candidate);
  });
  const searchedAt = timestamp(row.searchedAt, "searchedAt"); const completedAt = timestamp(row.completedAt, "completedAt");
  if (Date.parse(completedAt) < Date.parse(searchedAt)) throw new TypeError("completedAt must be greater than or equal to searchedAt.");
  return { questionId, answerText, sources: [...byUrl.values()].sort((a,b) => a.providerResultOrder - b.providerResultOrder || a.canonicalUrl.localeCompare(b.canonicalUrl)), refusal, searchedAt, completedAt, providerResponseId: row.providerResponseId == null ? null : text(row.providerResponseId, "providerResponseId", 500) };
}

function assertGenerativeAnswerLanguage(
  fields: readonly { path: string; text: string }[],
  locale: string
): void {
  if (normalizeReportLanguage(locale) !== "zh") {
    assertReportLanguage(fields, locale);
    return;
  }

  const violations = fields.flatMap(({ path, text: value }) => {
    const cjk = (value.match(/[\u3400-\u9fff]/gu) ?? []).length;
    const latin = (value.match(/[A-Za-z]/gu) ?? []).length;
    const latinBudget = Math.max(16, Math.floor(cjk * 0.25));
    return cjk >= 2 && latin <= latinBudget
      ? []
      : [{ path, reason: "unexpected_english_sentence" as const }];
  });
  if (violations.length) throw new ReportLanguageValidationError(violations);
}

function normalized(value: GenerativeSearchAnswerResult): string { return JSON.stringify(value); }
export async function generativeSearchAnswerHash(value: unknown): Promise<string> {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).questionId !== "string") throw new TypeError("questionId is required to hash an answer.");
  const questionId = (value as Record<string, unknown>).questionId as string;
  const row = value as Record<string, unknown>;
  const answer = typeof row.answerText === "string" ? row.answerText : "";
  const refusal = row.refusal && typeof row.refusal === "object" ? row.refusal as Record<string, unknown> : null;
  const refusalReason = typeof refusal?.reason === "string" ? refusal.reason : "";
  const locale = /[\u3400-\u9fff]/u.test(`${answer}${refusalReason}`) ? "zh-CN" : "en-US";
  return createHash("sha256").update(normalized(parseGenerativeSearchAnswerResult(value, { expectedQuestionId: questionId, locale }))).digest("hex");
}
export async function generativeSearchSourceHash(value: readonly GenerativeSearchSource[]): Promise<string> {
  // PostgreSQL jsonb does not preserve the insertion order of object keys.
  // Hash an explicit canonical projection so a persisted checkpoint retains
  // the same identity after a Worker retry or operator-approved resume.
  const ordered = value.map((source) => ({
    sourceId: source.sourceId,
    title: source.title,
    canonicalUrl: source.canonicalUrl,
    registrableDomain: source.registrableDomain,
    citedText: source.citedText ?? null,
    providerResultOrder: source.providerResultOrder
  })).sort((a, b) => a.providerResultOrder - b.providerResultOrder || a.canonicalUrl.localeCompare(b.canonicalUrl));
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

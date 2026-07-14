import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { JsonCompletionClient } from "./client";
import { sha256Hex } from "./evidence";
import { ReportLanguageValidationError, assertReportLanguage } from "./report-language";

export const GROUNDED_BUSINESS_ANSWERS_V2_VERSION = "combined-business-question-answers-v2" as const;

export interface GroundedAnswerEvidence {
  evidenceId: string;
  questionId: string;
  subjectKey: string;
  registrableDomain: string;
  exactExcerpt: string;
  eligible: boolean;
  direct: boolean;
}
export interface GroundedAnswerClaim {
  claimId: string;
  subjectKey: string;
  text: string;
  evidenceIds: string[];
  confidence: "verified" | "limited";
  limitation?: string;
}
export interface GroundedBusinessAnswerV2 {
  questionId: string;
  purpose: "customer_region_fit" | "purchase_delivery_risk";
  claims: GroundedAnswerClaim[];
}
export interface GroundedBusinessQuestionAnswersV2 {
  version: typeof GROUNDED_BUSINESS_ANSWERS_V2_VERSION;
  synthesis: { mode: "claim_bound_model"; modelId: string; inputHash: string };
  answers: [GroundedBusinessAnswerV2, GroundedBusinessAnswerV2];
}
export interface GroundedAnswerEvidenceContext { evidence: readonly GroundedAnswerEvidence[]; locale?: string }

export function parseGroundedBusinessAnswersV2(value: unknown, context: GroundedAnswerEvidenceContext): GroundedBusinessQuestionAnswersV2 {
  const root = record(value, "$answers");
  exact(root.version, GROUNDED_BUSINESS_ANSWERS_V2_VERSION, "$answers.version");
  const synthesis = record(root.synthesis, "$answers.synthesis");
  exact(synthesis.mode, "claim_bound_model", "$answers.synthesis.mode");
  const answers = array(root.answers, "$answers.answers");
  if (answers.length !== 2) throw new TypeError("Grounded V2 answers require exactly questions 2 and 3.");
  const purposes = ["customer_region_fit", "purchase_delivery_risk"] as const;
  const evidence = new Map(context.evidence.map((item) => [item.evidenceId, item]));
  const parsed = answers.map((value, answerIndex): GroundedBusinessAnswerV2 => {
    const path = `$answers.answers[${answerIndex}]`;
    const row = record(value, path);
    const questionId = text(row.questionId, `${path}.questionId`);
    exact(row.purpose, purposes[answerIndex], `${path}.purpose`);
    const claims = array(row.claims, `${path}.claims`).map((value, claimIndex) => parseClaim(value, `${path}.claims[${claimIndex}]`, questionId, evidence));
    if (claims.length < 1 || claims.length > 6) throw new TypeError(`${path}.claims requires one to six factual claims.`);
    if (new Set(claims.map(({ claimId }) => claimId)).size !== claims.length) throw new TypeError(`${path}.claims requires unique claim IDs.`);
    return { questionId, purpose: purposes[answerIndex], claims };
  }) as [GroundedBusinessAnswerV2, GroundedBusinessAnswerV2];
  const output: GroundedBusinessQuestionAnswersV2 = { version: GROUNDED_BUSINESS_ANSWERS_V2_VERSION, synthesis: { mode: "claim_bound_model", modelId: text(synthesis.modelId, "$answers.synthesis.modelId"), inputHash: hash(synthesis.inputHash, "$answers.synthesis.inputHash") }, answers: parsed };
  if (context.locale) assertReportLanguage(parsed.flatMap((answer, answerIndex) => answer.claims.flatMap((claim, claimIndex) => [{ path: `answers[${answerIndex}].claims[${claimIndex}].text`, text: claim.text }, ...(claim.limitation ? [{ path: `answers[${answerIndex}].claims[${claimIndex}].limitation`, text: claim.limitation }] : [])])), context.locale);
  return output;
}

function parseClaim(value: unknown, path: string, questionId: string, evidence: Map<string, GroundedAnswerEvidence>): GroundedAnswerClaim {
  const row = record(value, path);
  const claimId = text(row.claimId, `${path}.claimId`);
  const subjectKey = text(row.subjectKey, `${path}.subjectKey`);
  const claimText = text(row.text, `${path}.text`).replace(/\s+/g, " ").trim();
  if (claimText.length < 10 || claimText.length > 500) throw new TypeError(`${path}.text must be one concise factual sentence.`);
  const evidenceIds = stringArray(row.evidenceIds, `${path}.evidenceIds`);
  if (!evidenceIds.length || new Set(evidenceIds).size !== evidenceIds.length) throw new TypeError(`${path} requires unique evidence IDs.`);
  const sources = evidenceIds.map((id) => evidence.get(id));
  if (sources.some((source) => !source || source.questionId !== questionId || source.subjectKey !== subjectKey || !source.eligible || !source.direct)) throw new TypeError(`${path} contains unsupported or indirect evidence.`);
  const confidence = oneOf(row.confidence, ["verified", "limited"] as const, `${path}.confidence`);
  const domains = new Set(sources.map((source) => source!.registrableDomain.toLocaleLowerCase()));
  const limitation = row.limitation == null ? undefined : text(row.limitation, `${path}.limitation`);
  if (confidence === "verified" && domains.size < 2) throw new TypeError(`${path} verified confidence requires two independent domains.`);
  if (confidence === "verified" && limitation) throw new TypeError(`${path} verified confidence cannot carry a limitation.`);
  if (confidence === "limited" && !limitation) throw new TypeError(`${path} limited confidence requires explicit limitation text.`);
  return { claimId, subjectKey, text: claimText, evidenceIds, confidence, ...(limitation ? { limitation } : {}) };
}

export async function synthesizeGroundedBusinessAnswersV2(client: JsonCompletionClient, input: {
  questionSet: ConfirmedBusinessQuestionSet;
  questionIds: readonly [string, string];
  evidence: readonly GroundedAnswerEvidence[];
  locale: string;
  signal?: AbortSignal;
}, options: { maxAttempts?: number; delay?: (milliseconds: number) => Promise<void> } = {}): Promise<GroundedBusinessQuestionAnswersV2> {
  const questions = input.questionSet.questions.filter(({ purpose }) => purpose !== "core_service_discovery");
  if (questions.length !== 2) throw new TypeError("Grounded V2 synthesis requires exact questions 2 and 3.");
  const compact = questions.map((question, index) => ({ questionId: input.questionIds[index]!, purpose: question.purpose, question: question.privateText, subjects: groupEvidence(input.evidence.filter(({ questionId }) => questionId === input.questionIds[index])) }));
  const inputHash = await sha256Hex(JSON.stringify(compact));
  const maxAttempts = Math.min(3, Math.max(1, options.maxAttempts ?? 3));
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  let languageCorrectionUsed = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    input.signal?.throwIfAborted();
    try {
      const completion = await client.completeJson({ signal: input.signal, temperature: 0.1, maxTokens: 2_000, messages: [
        { role: "system", content: "Write concise factual claim sentences using only supplied eligible evidence. Return JSON only. A subject with one domain must be limited and explicitly state that independent verification is unavailable." },
        { role: "user", content: JSON.stringify({ locale: input.locale, questions: compact, requiredShape: { answers: [{ questionId: "exact id", purpose: "exact purpose", claims: [{ claimId: "stable public id", subjectKey: "exact supplied subject", text: "one factual sentence", confidence: "verified|limited", limitation: "required for limited" }] }] } }) }
      ] });
      const model = record(completion.value, "$model");
      const modelAnswers = array(model.answers, "$model.answers");
      const answers = questions.map((question, answerIndex) => {
        const row = record(modelAnswers[answerIndex], `$model.answers[${answerIndex}]`);
        const claims = array(row.claims, `$model.answers[${answerIndex}].claims`).map((value, claimIndex) => {
          const claim = record(value, `$model.answers[${answerIndex}].claims[${claimIndex}]`);
          const subjectKey = text(claim.subjectKey, "subjectKey");
          const questionId = input.questionIds[answerIndex]!;
          const permitted = input.evidence.filter((evidence) => evidence.questionId === questionId && evidence.subjectKey === subjectKey && evidence.eligible && evidence.direct);
          if (!permitted.length) throw new TypeError("Model claim subject has no permitted direct evidence.");
          return { claimId: text(claim.claimId, "claimId"), subjectKey, text: text(claim.text, "text"), evidenceIds: permitted.map(({ evidenceId }) => evidenceId).sort(), confidence: claim.confidence, ...(claim.limitation == null ? {} : { limitation: claim.limitation }) };
        });
        return { questionId: input.questionIds[answerIndex]!, purpose: question.purpose, claims };
      });
      return parseGroundedBusinessAnswersV2({ version: GROUNDED_BUSINESS_ANSWERS_V2_VERSION, synthesis: { mode: "claim_bound_model", modelId: completion.modelId, inputHash }, answers }, { evidence: input.evidence, locale: input.locale });
    } catch (error) {
      lastError = error;
      if (error instanceof ReportLanguageValidationError) {
        if (languageCorrectionUsed || attempt >= maxAttempts) throw error;
        languageCorrectionUsed = true;
        await delay(100 * 2 ** (attempt - 1));
        continue;
      }
      if (!(error instanceof TypeError) || attempt >= maxAttempts) throw error;
      await delay(100 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

function groupEvidence(evidence: readonly GroundedAnswerEvidence[]) { const groups = new Map<string, GroundedAnswerEvidence[]>(); for (const item of evidence) groups.set(item.subjectKey, [...(groups.get(item.subjectKey) ?? []), item]); return [...groups].map(([subjectKey, items]) => ({ subjectKey, evidence: items.map(({ evidenceId, registrableDomain, exactExcerpt }) => ({ evidenceId, registrableDomain, exactExcerpt })) })); }
function record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`); return value as Record<string, unknown>; }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value.trim(); }
function stringArray(value: unknown, path: string): string[] { return array(value, path).map((item, index) => text(item, `${path}[${index}]`)); }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T { if (!allowed.includes(value as T)) throw new TypeError(`${path} is unsupported.`); return value as T; }
function hash(value: unknown, path: string): string { const result = text(value, path); if (!/^[a-f0-9]{64}$/.test(result)) throw new TypeError(`${path} must be a SHA-256 hash.`); return result; }

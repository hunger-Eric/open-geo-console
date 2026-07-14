import type { PublicSourceEvidence } from "@open-geo-console/citation-intelligence";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { JsonCompletionClient } from "./client";
import { sha256Hex } from "./evidence";
import {
  ReportLanguageValidationError,
  assertReportLanguage,
  reportLanguageInstruction
} from "./report-language";
import type { RecommendationForensicReportV2 } from "./recommendation-forensic-v2";

export const COMBINED_BUSINESS_QUESTION_ANSWERS_VERSION = "combined-business-question-answers-v1" as const;

export interface CombinedBusinessQuestionAnswer {
  questionId: string;
  purpose: ConfirmedBusinessQuestionSet["questions"][number]["purpose"];
  answer: string;
  sourceEvidenceIds: string[];
}

export interface CombinedBusinessQuestionAnswers {
  version: typeof COMBINED_BUSINESS_QUESTION_ANSWERS_VERSION;
  synthesis: {
    mode: "evidence_constrained_model";
    modelId: string;
    inputHash: string;
  };
  answers: [CombinedBusinessQuestionAnswer, CombinedBusinessQuestionAnswer, CombinedBusinessQuestionAnswer];
}

export interface QuestionAnswerEvidenceSelection {
  questionId: string;
  purpose: CombinedBusinessQuestionAnswer["purpose"];
  privateQuestion: string;
  evidence: PublicSourceEvidence[];
}

export function selectQuestionAnswerEvidence(
  questionSet: ConfirmedBusinessQuestionSet,
  forensic: RecommendationForensicReportV2
): [QuestionAnswerEvidenceSelection, QuestionAnswerEvidenceSelection, QuestionAnswerEvidenceSelection] {
  if (questionSet.questions.length !== 3 || forensic.questions.questions.length !== 3) {
    throw new TypeError("Combined question answers require exactly three questions.");
  }
  const selections = questionSet.questions.map((question, index) => {
    const publicQuestion = forensic.questions.questions[index];
    const fanout = publicQuestion && forensic.fanouts.find((item) => item.questionId === publicQuestion.id);
    if (!publicQuestion || !fanout) throw new TypeError("Combined question answer fanout is incomplete.");
    const queryIds = new Set(fanout.queries.map(({ id }) => id));
    const eligible = forensic.sourceGraph.evidence.filter((evidence) =>
      evidence.retrievalState === "available" &&
      (evidence.grade === "A" || evidence.grade === "B") &&
      Boolean(evidence.verifiedExcerpt?.trim()) &&
      !evidence.entityAmbiguous &&
      !evidence.contradictory &&
      evidence.queryVariantIds.some((id) => queryIds.has(id))
    );
    const byContent = new Map<string, PublicSourceEvidence>();
    for (const evidence of eligible) {
      const key = `${evidence.canonicalUrl}\0${evidence.evidenceFamilyId}`;
      if (!byContent.has(key)) byContent.set(key, evidence);
    }
    const distinctFirst = [...byContent.values()].sort((left, right) =>
      left.registrableDomain.localeCompare(right.registrableDomain) || left.evidenceId.localeCompare(right.evidenceId));
    const domains = new Set(distinctFirst.map(({ registrableDomain }) => registrableDomain));
    if (domains.size < 2) {
      throw new TypeError(`Question ${index + 1} requires verified evidence from at least two independent domains.`);
    }
    return {
      questionId: publicQuestion.id,
      purpose: question.purpose,
      privateQuestion: question.privateText,
      evidence: distinctFirst
    };
  });
  return selections as [QuestionAnswerEvidenceSelection, QuestionAnswerEvidenceSelection, QuestionAnswerEvidenceSelection];
}

export function parseCombinedBusinessQuestionAnswers(
  value: unknown,
  questionSet: ConfirmedBusinessQuestionSet,
  forensic: RecommendationForensicReportV2
): CombinedBusinessQuestionAnswers {
  const root = record(value, "$answers");
  exact(root.version, COMBINED_BUSINESS_QUESTION_ANSWERS_VERSION, "$answers.version");
  const synthesis = record(root.synthesis, "$answers.synthesis");
  exact(synthesis.mode, "evidence_constrained_model", "$answers.synthesis.mode");
  const selections = selectQuestionAnswerEvidence(questionSet, forensic);
  const values = array(root.answers, "$answers.answers");
  if (values.length !== 3) throw new TypeError("Combined question answers require exactly three answers.");
  const answers = values.map((candidate, index): CombinedBusinessQuestionAnswer => {
    const path = `$answers.answers[${index}]`;
    const item = record(candidate, path);
    const expected = selections[index]!;
    exact(item.questionId, expected.questionId, `${path}.questionId`);
    exact(item.purpose, expected.purpose, `${path}.purpose`);
    const answer = text(item.answer, `${path}.answer`).replace(/\s+/g, " ").trim();
    if (answer.length < 20 || answer.length > 600) throw new TypeError(`${path}.answer must be one concise paragraph.`);
    if (/https?:\/\/|(?:query|snapshot|evidence)-[a-z0-9]/i.test(answer)) {
      throw new TypeError(`${path}.answer cannot expose URLs or internal evidence identifiers.`);
    }
    const sourceEvidenceIds = stringArray(item.sourceEvidenceIds, `${path}.sourceEvidenceIds`);
    if (sourceEvidenceIds.length < 2 || new Set(sourceEvidenceIds).size !== sourceEvidenceIds.length) {
      throw new TypeError(`${path}.sourceEvidenceIds requires at least two unique sources.`);
    }
    const eligible = new Map(expected.evidence.map((evidence) => [evidence.evidenceId, evidence]));
    const sources = sourceEvidenceIds.map((id) => eligible.get(id));
    if (sources.some((source) => !source)) throw new TypeError(`${path} contains evidence outside its question fanout.`);
    if (new Set(sources.map((source) => source!.registrableDomain)).size < 2) {
      throw new TypeError(`${path} requires at least two independent source domains.`);
    }
    return { questionId: expected.questionId, purpose: expected.purpose, answer, sourceEvidenceIds };
  });
  return {
    version: COMBINED_BUSINESS_QUESTION_ANSWERS_VERSION,
    synthesis: {
      mode: "evidence_constrained_model",
      modelId: text(synthesis.modelId, "$answers.synthesis.modelId"),
      inputHash: text(synthesis.inputHash, "$answers.synthesis.inputHash")
    },
    answers: answers as CombinedBusinessQuestionAnswers["answers"]
  };
}

export async function combinedBusinessQuestionAnswerInputHash(
  questionSet: ConfirmedBusinessQuestionSet,
  forensic: RecommendationForensicReportV2
): Promise<string> {
  return sha256Hex(JSON.stringify(compactSynthesisInput(questionSet, forensic)));
}

export async function synthesizeCombinedBusinessQuestionAnswers(
  client: JsonCompletionClient,
  input: { questionSet: ConfirmedBusinessQuestionSet; forensic: RecommendationForensicReportV2; signal?: AbortSignal },
  options: { maxAttempts?: number; delay?: (milliseconds: number) => Promise<void> } = {}
): Promise<CombinedBusinessQuestionAnswers> {
  const compactInput = compactSynthesisInput(input.questionSet, input.forensic);
  const inputHash = await sha256Hex(JSON.stringify(compactInput));
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const delay = options.delay ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  let languageCorrectionUsed = false;
  let languageFeedback: string[] = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    input.signal?.throwIfAborted();
    const isLanguageCorrectionCall = languageFeedback.length > 0;
    try {
      const languageInstruction = reportLanguageInstruction(input.forensic.locale);
      const completion = await client.completeJson({
        signal: input.signal,
        temperature: 0.1,
        maxTokens: 2_000,
        messages: [
          { role: "system", content: `You write concise business answers grounded exclusively in supplied verified public-source excerpts. Return JSON only. ${languageInstruction}` },
          { role: "user", content: JSON.stringify({
            task: "Answer each business question directly in one short paragraph.",
            rules: [
              languageInstruction,
              "Use only the supplied evidence for that exact question.",
              "Select at least two evidence records from at least two different domains.",
              "Do not explain the research method.",
              "Do not include URLs, evidence IDs, grades, or unsupported claims in answer text."
            ],
            ...(languageFeedback.length ? { correctionRequired: languageFeedback } : {}),
            locale: input.forensic.locale,
            requiredShape: { answers: [{ questionId: "exact id", purpose: "exact purpose", answer: "one concise paragraph", sourceEvidenceIds: ["exact supplied ids"] }] },
            questions: compactInput
          }) }
        ]
      });
      const output = record(completion.value, "$model");
      const parsed = parseCombinedBusinessQuestionAnswers({
        version: COMBINED_BUSINESS_QUESTION_ANSWERS_VERSION,
        synthesis: { mode: "evidence_constrained_model", modelId: completion.modelId, inputHash },
        answers: output.answers
      }, input.questionSet, input.forensic);
      assertAnswerLanguage(parsed.answers, input.forensic.locale, collectQuestionAnswerAllowedTerms(compactInput));
      return parsed;
    } catch (error) {
      lastError = error;
      if (isLanguageCorrectionCall) throw error;
      if (error instanceof ReportLanguageValidationError) {
        if (languageCorrectionUsed || attempt >= maxAttempts) throw error;
        languageCorrectionUsed = true;
        languageFeedback = languageViolationFeedback(error);
      }
      if (attempt < maxAttempts) await delayWithAbort(delay, Math.min(2_000, 250 * 2 ** (attempt - 1)), input.signal);
    }
  }
  throw lastError;
}

function assertAnswerLanguage(
  answers: readonly CombinedBusinessQuestionAnswer[],
  locale: string,
  allowedTerms: readonly string[]
): void {
  assertReportLanguage(
    answers.map((answer, index) => ({ path: `answers[${index}].answer`, text: answer.answer })),
    locale,
    allowedTerms
  );
}

function collectQuestionAnswerAllowedTerms(input: ReturnType<typeof compactSynthesisInput>): string[] {
  const genericSentenceWords = new Set(["A", "An", "How", "Question", "The", "Verified", "What", "When", "Where", "Which", "Who", "Why"]);
  const sourceValues = input.flatMap(({ question, evidence }) => [question, ...evidence.map(({ excerpt }) => excerpt)]);
  const candidates = new Map<string, Set<number>>();
  sourceValues.forEach((value, sourceIndex) => {
    const latin = value.match(/\b(?:[A-Z][A-Za-z0-9&.-]*)(?:\s+[A-Z][A-Za-z0-9&.-]*){1,3}\b/g) ?? [];
    const shaped = value.match(/\b(?:[A-Z]{2,}|[A-Za-z0-9]*[a-z][A-Z][A-Za-z0-9]*)\b/g) ?? [];
    const capitalized = (value.match(/\b[A-Z][a-z][A-Za-z0-9]*\b/g) ?? []).filter((term) => !genericSentenceWords.has(term));
    const cjk = value.match(/[\u3400-\u9fff]{2,12}/gu) ?? [];
    for (const term of [...latin, ...shaped, ...capitalized, ...cjk].filter((item) => item.length <= 80)) {
      const sources = candidates.get(term) ?? new Set<number>();
      sources.add(sourceIndex);
      candidates.set(term, sources);
    }
  });
  return [...candidates].filter(([, sources]) => sources.size >= 2).map(([term]) => term);
}

function languageViolationFeedback(error: ReportLanguageValidationError): string[] {
  return error.violations.map(({ path, reason }) => `${path}: ${reason}`);
}

function compactSynthesisInput(questionSet: ConfirmedBusinessQuestionSet, forensic: RecommendationForensicReportV2) {
  return selectQuestionAnswerEvidence(questionSet, forensic).map((selection) => ({
    questionId: selection.questionId,
    purpose: selection.purpose,
    question: selection.privateQuestion,
    evidence: selection.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      domain: evidence.registrableDomain,
      url: evidence.canonicalUrl,
      excerpt: evidence.verifiedExcerpt!.slice(0, 1_200)
    }))
  }));
}

async function delayWithAbort(delay: (milliseconds: number) => Promise<void>, milliseconds: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!signal) return delay(milliseconds);
  await Promise.race([
    delay(milliseconds),
    new Promise<never>((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
  ]);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) throw new TypeError(`${path} must be an array.`); return value; }
function text(value: unknown, path: string): string { if (typeof value !== "string" || !value.trim()) throw new TypeError(`${path} must be non-empty text.`); return value; }
function stringArray(value: unknown, path: string): string[] { return array(value, path).map((item, index) => text(item, `${path}[${index}]`)); }
function exact(value: unknown, expected: unknown, path: string): void { if (value !== expected) throw new TypeError(`${path} must equal ${String(expected)}.`); }

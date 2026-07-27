import type { PublicSourceEvidence } from "@open-geo-console/citation-intelligence";
import type { ConfirmedBusinessQuestionSet } from "@open-geo-console/public-search-observer";
import type { JsonCompletionClient } from "./client";
import { sha256Hex } from "./evidence";
import {
  GEO_TERMINOLOGY_POLICY,
  ReportLanguageValidationError,
  assertGeoTerminology,
  assertReportLanguage,
  reportLanguageCorrectionFeedback,
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
      const chinese = input.forensic.locale.toLowerCase().startsWith("zh");
      const completion = await client.completeJson({
        signal: input.signal,
        temperature: 0.1,
        maxTokens: 2_000,
        messages: [
          { role: "system", content: chinese
            ? `你是一名中文商业分析师。所有 answer 字段必须使用简体中文完整改写，即使问题和来源摘录是英文，也不得直接用英文句子作答。只能依据给定且已验证的公开来源摘录；只返回 JSON。${languageInstruction}`
            : `You write concise business answers grounded exclusively in supplied verified public-source excerpts. Return JSON only. ${languageInstruction}` },
          { role: "user", content: JSON.stringify({
            task: chinese ? "逐一直接回答三个业务问题；每个 answer 只写一个简短的简体中文段落。" : "Answer each business question directly in one short paragraph.",
            requiredAnswerLanguage: chinese ? "简体中文；来源中的英文事实必须翻译和归纳为中文，不得复制英文句子。" : "English",
            rules: chinese ? [
              "只使用归属该问题的已验证证据。",
              "综合至少两个不同域名的证据。",
              "不要说明研究方法。",
              "answer 中不得出现 URL、证据 ID、等级或无来源支持的断言。",
              "官方名称或品牌可保留原文，其余叙述必须是简体中文。"
            ] : [
              languageInstruction,
              "Use only the supplied evidence for that exact question.",
              "Select at least two evidence records from at least two different domains.",
              "Do not explain the research method.",
              "Do not include URLs, evidence IDs, grades, or unsupported claims in answer text."
            ],
            ...(languageFeedback.length ? {
              correctionRequired: languageFeedback,
              correctionInstruction: chinese
                ? "重新改写被标记的 answer：除 B2B、URL 等必要技术标识外，将所有拉丁字母名称翻译、音译或省略；不得重复上一版句子。"
                : "Rewrite every flagged answer entirely in English without repeating the prior sentence."
            } : {}),
            locale: input.forensic.locale,
            requiredShape: { answers: [{ questionId: "exact id", purpose: "exact purpose", answer: "one concise paragraph", sourceEvidenceIds: ["exact supplied ids"] }] },
            questions: compactInput
          }) }
        ]
      });
      const output = record(completion.value, "$model");
      const modelAnswers = array(output.answers, "$model.answers");
      if (modelAnswers.length !== 3) throw new TypeError("$model.answers must contain exactly three answers.");
      const boundAnswers = compactInput.map((question, index) => {
        const modelAnswer = record(modelAnswers[index], `$model.answers[${index}]`);
        return { questionId: question.questionId, purpose: question.purpose, answer: modelAnswer.answer,
          sourceEvidenceIds: question.evidence.map(({ evidenceId }) => evidenceId) };
      });
      const parsed = parseCombinedBusinessQuestionAnswers({
        version: COMBINED_BUSINESS_QUESTION_ANSWERS_VERSION,
        synthesis: { mode: "evidence_constrained_model", modelId: completion.modelId, inputHash },
        answers: boundAnswers
      }, input.questionSet, input.forensic);
      assertAnswerLanguage(parsed.answers, input.forensic.locale, collectQuestionAnswerAllowedTerms(input.forensic));
      return parsed;
    } catch (error) {
      lastError = error;
      if (isLanguageCorrectionCall) throw error;
      if (error instanceof ReportLanguageValidationError) {
        if (languageCorrectionUsed || attempt >= maxAttempts) throw error;
        languageCorrectionUsed = true;
        languageFeedback = reportLanguageCorrectionFeedback(error, input.forensic.locale);
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
  const fields = answers.map((answer, index) => ({ path: `answers[${index}].answer`, text: answer.answer }));
  assertReportLanguage(
    fields,
    locale,
    allowedTerms
  );
  assertGeoTerminology(fields, GEO_TERMINOLOGY_POLICY);
}

function collectQuestionAnswerAllowedTerms(forensic: RecommendationForensicReportV2): string[] {
  const graphTerms = [
    ...(forensic.sourceGraph.entities ?? [])
      .filter(({ status }) => status === "resolved")
      .map(({ canonicalName }) => canonicalName),
    ...(forensic.sourceGraph.claims ?? [])
      .filter(({ status }) => status === "supported")
      .map(({ subjectName }) => subjectName)
  ];
  return [...new Set(graphTerms
    .filter((value): value is string => Boolean(value?.trim()) && value!.length <= 120))];
}

function compactSynthesisInput(questionSet: ConfirmedBusinessQuestionSet, forensic: RecommendationForensicReportV2) {
  return selectQuestionAnswerEvidence(questionSet, forensic).map((selection) => ({
    questionId: selection.questionId,
    purpose: selection.purpose,
    question: selection.privateQuestion,
    evidence: distinctDomainEvidence(selection.evidence).map((evidence) => ({
      evidenceId: evidence.evidenceId,
      domain: evidence.registrableDomain,
      url: evidence.canonicalUrl,
      excerpt: evidence.verifiedExcerpt!.slice(0, 1_200)
    }))
  }));
}

function distinctDomainEvidence(evidence: PublicSourceEvidence[]): PublicSourceEvidence[] {
  const domains = new Set<string>();
  return evidence.filter((item) => {
    if (domains.has(item.registrableDomain)) return false;
    domains.add(item.registrableDomain);
    return true;
  }).slice(0, 3);
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

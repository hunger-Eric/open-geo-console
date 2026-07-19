import { createHash } from "node:crypto";
import {
  evaluateModelTokenBudget,
  parseCombinedGeoReportV4,
  parseGenerativeSearchAnswerResult,
  parseReportV4QuestionAnswerInput,
  runWithModelTokenBudget,
  type CombinedGeoReportV4Question,
  type ModelTokenBudgetInput
} from "@open-geo-console/ai-report-engine";
import type {
  ReportV4QuestionCheckpoint,
  ReportV4QuestionCheckpointAnswerPayload,
  ReportV4QuestionCheckpointRepository,
  ReportV4QuestionCheckpointSeed,
  ReportV4QuestionCheckpointSourcePayload
} from "../db/report-v4-question-checkpoints";

export interface ReportV4QuestionSpec {
  readonly order: 1 | 2 | 3;
  readonly questionId: string;
  readonly question: string;
  readonly tokenBudget: ModelTokenBudgetInput;
}

export interface ReportV4QuestionProviderInput {
  readonly questionId: string;
  readonly question: string;
  readonly locale: string;
  readonly region: string;
  readonly signal: AbortSignal;
}

export interface ReportV4QuestionAnswerProvider {
  readonly providerId: string;
  readonly model: string;
  readonly searchMode: string;
  answerWithSources(input: ReportV4QuestionProviderInput): Promise<unknown>;
}

export interface ReportV4QuestionAnswererInput {
  readonly reportId: string;
  readonly jobId: string;
  readonly questionSetId: string;
  readonly snapshotId: string;
  readonly modelConfigIdentityHash: string;
  readonly locale: string;
  readonly region: string;
  questions: ReportV4QuestionSpec[];
  readonly repository: ReportV4QuestionCheckpointRepository;
  readonly provider: ReportV4QuestionAnswerProvider;
  readonly signal?: AbortSignal;
}

export interface ReportV4QuestionAnswererResult {
  readonly questions: readonly [CombinedGeoReportV4Question, CombinedGeoReportV4Question, CombinedGeoReportV4Question];
  readonly reusedQuestionIds: readonly string[];
}

export type ReportV4QuestionProviderErrorCode =
  | "transport"
  | "rate_limited"
  | "temporary_provider"
  | "contract"
  | "authentication"
  | "configuration"
  | "safety";

const RETRYABLE_PROVIDER_CODES = new Set<ReportV4QuestionProviderErrorCode>([
  "transport", "rate_limited", "temporary_provider", "contract"
]);
const QUESTION_SPEC_FIELDS = new Set(["order", "questionId", "question", "tokenBudget"]);

export class ReportV4QuestionProviderError extends Error {
  readonly code: ReportV4QuestionProviderErrorCode;
  readonly retryable: boolean;

  constructor(code: ReportV4QuestionProviderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ReportV4QuestionProviderError";
    this.code = code;
    this.retryable = RETRYABLE_PROVIDER_CODES.has(code);
  }
}

export async function answerReportV4Questions(input: ReportV4QuestionAnswererInput): Promise<ReportV4QuestionAnswererResult> {
  input.signal?.throwIfAborted();
  const questions = parseQuestions(input);
  const context = parseContext(input);
  const seeds = questions.map((question) => checkpointSeed(context, input.provider, question)) as [
    ReportV4QuestionCheckpointSeed,
    ReportV4QuestionCheckpointSeed,
    ReportV4QuestionCheckpointSeed
  ];
  const checkpoints = await input.repository.initialize({ jobId: context.jobId, checkpoints: seeds });
  const signal = input.signal ?? new AbortController().signal;
  signal.throwIfAborted();

  const resolved: Array<{ question: CombinedGeoReportV4Question; reused: boolean }> = [];
  for (const [index, question] of questions.entries()) {
    signal.throwIfAborted();
    resolved.push(await resolveQuestion({
      question,
      checkpoint: checkpoints[index]!,
      repository: input.repository,
      provider: input.provider,
      signal
    }));
  }
  return Object.freeze({
    questions: Object.freeze(resolved.map(({ question }) => question)) as ReportV4QuestionAnswererResult["questions"],
    reusedQuestionIds: Object.freeze(resolved.filter(({ reused }) => reused).map(({ question }) => question.questionId))
  });
}

interface ParsedQuestion extends ReportV4QuestionSpec {
  readonly providerInput: Omit<ReportV4QuestionProviderInput, "signal">;
}

interface ParsedContext {
  readonly reportId: string;
  readonly jobId: string;
  readonly questionSetId: string;
  readonly snapshotId: string;
  readonly modelConfigIdentityHash: string;
}

async function resolveQuestion(input: {
  question: ParsedQuestion;
  checkpoint: ReportV4QuestionCheckpoint;
  repository: ReportV4QuestionCheckpointRepository;
  provider: ReportV4QuestionAnswerProvider;
  signal: AbortSignal;
}): Promise<{ question: CombinedGeoReportV4Question; reused: boolean }> {
  input.signal.throwIfAborted();
  let checkpoint = assertCheckpointOwnership(input.checkpoint, input.question);
  if (checkpoint.state === "answered") return { question: restoreAnsweredQuestion(checkpoint), reused: true };
  if (checkpoint.state === "unavailable") return { question: unavailableQuestion(input.question), reused: true };

  while (checkpoint.providerCallCount < 2) {
    input.signal.throwIfAborted();
    const budget = evaluateModelTokenBudget(input.question.tokenBudget);
    if (!budget.accepted) {
      input.signal.throwIfAborted();
      await input.repository.markUnavailable({ identityHash: checkpoint.identityHash, providerCallCount: checkpoint.providerCallCount });
      return { question: unavailableQuestion(input.question), reused: false };
    }

    checkpoint = await input.repository.recordProviderCall({
      identityHash: checkpoint.identityHash,
      expectedProviderCallCount: checkpoint.providerCallCount
    });
    input.signal.throwIfAborted();

    let raw: unknown;
    try {
      raw = await runWithModelTokenBudget(input.question.tokenBudget, () => {
        input.signal.throwIfAborted();
        return input.provider.answerWithSources({
          ...input.question.providerInput,
          signal: input.signal
        });
      });
    } catch (error) {
      input.signal.throwIfAborted();
      if (isExplicitlyRetryableProviderError(error) && checkpoint.providerCallCount < 2) continue;
      await input.repository.markUnavailable({ identityHash: checkpoint.identityHash, providerCallCount: checkpoint.providerCallCount });
      return { question: unavailableQuestion(input.question), reused: false };
    }
    input.signal.throwIfAborted();

    let question: CombinedGeoReportV4Question;
    try {
      const parsed = parseGenerativeSearchAnswerResult(raw, {
        expectedQuestionId: input.question.questionId,
        locale: input.question.providerInput.locale
      });
      if (parsed.refusal) {
        await input.repository.markUnavailable({ identityHash: checkpoint.identityHash, providerCallCount: checkpoint.providerCallCount });
        return { question: unavailableQuestion(input.question), reused: false };
      }
      const sourcePayload = parsed.sources.map((source): ReportV4QuestionCheckpointSourcePayload => ({
        questionId: input.question.questionId,
        sourceId: ownedSourceId(input.question.questionId, source.sourceId, source.canonicalUrl),
        title: source.title,
        canonicalUrl: source.canonicalUrl,
        citedText: source.citedText,
        retrievalStatus: "not_checked"
      }));
      question = parseV4Question({
        order: input.question.order,
        questionId: input.question.questionId,
        questionText: input.question.question,
        status: "answered",
        answer: parsed.answerText,
        sources: sourcePayload
      });
    } catch {
      input.signal.throwIfAborted();
      if (checkpoint.providerCallCount < 2) continue;
      await input.repository.markUnavailable({ identityHash: checkpoint.identityHash, providerCallCount: checkpoint.providerCallCount });
      return { question: unavailableQuestion(input.question), reused: false };
    }

    const answerPayload: ReportV4QuestionCheckpointAnswerPayload = {
      order: question.order,
      questionId: question.questionId,
      questionText: question.questionText,
      status: "answered",
      answer: question.answer!
    };
    input.signal.throwIfAborted();
    await input.repository.saveAnswered({
      identityHash: checkpoint.identityHash,
      providerCallCount: checkpoint.providerCallCount as 1 | 2,
      answerPayload,
      sourcePayload: question.sources,
      answerContentHash: hash({ answerPayload, sourcePayload: question.sources })
    });
    return { question, reused: false };
  }

  input.signal.throwIfAborted();
  await input.repository.markUnavailable({ identityHash: checkpoint.identityHash, providerCallCount: checkpoint.providerCallCount });
  return { question: unavailableQuestion(input.question), reused: false };
}

function parseQuestions(input: ReportV4QuestionAnswererInput): [ParsedQuestion, ParsedQuestion, ParsedQuestion] {
  if (input.questions.length !== 3) throw new TypeError("V4 answering requires exactly three ordered questions.");
  const questionIds = new Set<string>();
  const questions = input.questions.map((question, index): ParsedQuestion => {
    if (!question || typeof question !== "object" || Array.isArray(question)) throw new TypeError(`questions[${index}] must be an object.`);
    const unknown = Object.keys(question).find((field) => !QUESTION_SPEC_FIELDS.has(field));
    if (unknown) throw new TypeError(`questions[${index}] contains unknown field ${unknown}.`);
    if (question.order !== index + 1) throw new TypeError("V4 questions must preserve ordered positions 1, 2, 3.");
    const providerInput = parseReportV4QuestionAnswerInput({
      questionId: question.questionId,
      question: question.question,
      locale: input.locale,
      region: input.region
    });
    if (questionIds.has(providerInput.questionId)) throw new TypeError("V4 questionId values must be unique.");
    questionIds.add(providerInput.questionId);
    return Object.freeze({ ...question, ...providerInput, order: question.order, tokenBudget: Object.freeze({ ...question.tokenBudget }), providerInput });
  });
  return questions as [ParsedQuestion, ParsedQuestion, ParsedQuestion];
}

function parseContext(input: ReportV4QuestionAnswererInput): ParsedContext {
  return Object.freeze({
    reportId: boundedText(input.reportId, "reportId", 500),
    jobId: boundedText(input.jobId, "jobId", 500),
    questionSetId: boundedText(input.questionSetId, "questionSetId", 500),
    snapshotId: boundedText(input.snapshotId, "snapshotId", 500),
    modelConfigIdentityHash: sha256(input.modelConfigIdentityHash, "modelConfigIdentityHash")
  });
}

function checkpointSeed(context: ParsedContext, provider: ReportV4QuestionAnswerProvider, question: ParsedQuestion): ReportV4QuestionCheckpointSeed {
  const questionIdentityHash = hash({
    questionSetId: context.questionSetId,
    order: question.order,
    questionId: question.questionId,
    question: question.question
  });
  const inputIdentityHash = hash({
    questionIdentityHash,
    snapshotId: context.snapshotId,
    locale: question.providerInput.locale,
    region: question.providerInput.region,
    providerId: boundedText(provider.providerId, "providerId", 500),
    model: boundedText(provider.model, "model", 500),
    searchMode: boundedText(provider.searchMode, "searchMode", 500)
  });
  return Object.freeze({
    identityHash: hash({ ...context, order: question.order, questionId: question.questionId, questionIdentityHash, inputIdentityHash }),
    ...context,
    questionId: question.questionId,
    ordinal: question.order,
    questionIdentityHash,
    inputIdentityHash
  });
}

function assertCheckpointOwnership(checkpoint: ReportV4QuestionCheckpoint, question: ParsedQuestion): ReportV4QuestionCheckpoint {
  if (checkpoint.ordinal !== question.order || checkpoint.questionId !== question.questionId) {
    throw new Error("V4 question checkpoint does not match its ordered question.");
  }
  return checkpoint;
}

function restoreAnsweredQuestion(checkpoint: ReportV4QuestionCheckpoint): CombinedGeoReportV4Question {
  if (!checkpoint.answerPayload) throw new Error("Answered V4 checkpoint is missing its immutable answer payload.");
  return parseV4Question({
    order: checkpoint.answerPayload.order,
    questionId: checkpoint.answerPayload.questionId,
    questionText: checkpoint.answerPayload.questionText,
    status: "answered",
    answer: checkpoint.answerPayload.answer,
    sources: checkpoint.sourcePayload
  });
}

function unavailableQuestion(question: Pick<ParsedQuestion, "order" | "questionId" | "question">): CombinedGeoReportV4Question {
  return parseV4Question({
    order: question.order,
    questionId: question.questionId,
    questionText: question.question,
    status: "unavailable",
    answer: null,
    sources: []
  });
}

function parseV4Question(question: CombinedGeoReportV4Question): CombinedGeoReportV4Question {
  const questions = ([1, 2, 3] as const).map((order): CombinedGeoReportV4Question => order === question.order
    ? question
    : {
        order,
        questionId: `v4-validation-placeholder-${order}-${hash(question.questionId).slice(0, 12)}`,
        questionText: "Validation placeholder question.",
        status: "unavailable",
        answer: null,
        sources: []
      });
  const parsed = parseCombinedGeoReportV4({
    version: 4,
    artifactContract: "combined_geo_report_v4",
    reportId: "v4-question-validation",
    artifactRevisionId: "v4-question-validation-revision",
    targetUrl: "https://validation.invalid/",
    locale: "validation",
    generatedAt: "2030-01-01T00:00:00.000Z",
    status: "completed_limited",
    websiteSynthesis: { summary: "Validation.", strengths: [], gaps: [], actions: [] },
    questions
  });
  return parsed.questions[question.order - 1];
}

function ownedSourceId(questionId: string, providerSourceId: string, canonicalUrl: string): string {
  const owner = questionId.slice(0, 400);
  return `${owner}:${hash({ providerSourceId, canonicalUrl }).slice(0, 64)}`;
}

function isExplicitlyRetryableProviderError(error: unknown): boolean {
  return error instanceof ReportV4QuestionProviderError && error.retryable;
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedText(value: unknown, path: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new TypeError(`${path} must be non-empty bounded text.`);
  return value.trim();
}

function sha256(value: unknown, path: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError(`${path} must be a lowercase SHA-256 hash.`);
  return value;
}

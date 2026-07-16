import {fileURLToPath} from "node:url";
import path from "node:path";
import type {
  GenerativeSearchAnswerProvider,
  GenerativeSearchRefusalCode
} from "@open-geo-console/ai-report-engine";
import {closeDatabase, ensureDatabase, getDatabaseEnvironmentStatus} from "@/db";
import {resolveGenerativeSearchAnswerProvider} from "@/public-source-forensics/production-runtime";
import {prepareStagingCommand, type StagingStartupSummary} from "./staging-guard";

const PROBE_QUESTION_ID = "staging-generative-answer-probe";

export interface GenerativeAnswerProbeCommandOptions {
  question: string;
  locale: string;
  region: string;
}

export interface GenerativeAnswerProbeSummary {
  profile: "staging";
  providerId: string;
  model: string;
  searchMode: string;
  answerNonblank: boolean;
  sourceCount: number;
  sourceDomains: string[];
  refusalCode: GenerativeSearchRefusalCode | null;
}

interface GenerativeAnswerProbeDependencies {
  environment?: NodeJS.ProcessEnv;
  prepare?: () => Promise<StagingStartupSummary>;
  resolveProvider?: (
    environment: NodeJS.ProcessEnv,
    input: {locale: string; region: string}
  ) => GenerativeSearchAnswerProvider;
  signal?: AbortSignal;
}

export function parseGenerativeAnswerProbeCommand(args: string[]): GenerativeAnswerProbeCommandOptions {
  const values = pairs(args);
  const question = values.get("question")?.trim();
  const locale = values.get("locale")?.trim();
  const region = values.get("region")?.trim();
  if (!question || !locale || !region) {
    throw new Error("--question, --locale, and --region are required.");
  }
  if (question.length > 2_000 || locale.length > 50 || region.length > 50) {
    throw new Error("Probe arguments exceed their safe length limits.");
  }
  return {question, locale, region};
}

export async function runGenerativeAnswerProbeCommand(
  args: string[],
  dependencies: GenerativeAnswerProbeDependencies = {}
): Promise<GenerativeAnswerProbeSummary> {
  const options = parseGenerativeAnswerProbeCommand(args);
  const environment = dependencies.environment ?? process.env;
  const staging = await (dependencies.prepare ?? (() => prepareStagingCommand({
    environment,
    ensureDatabase,
    getDatabaseStatus: getDatabaseEnvironmentStatus
  })))();
  const provider = (dependencies.resolveProvider ?? resolveGenerativeSearchAnswerProvider)(
    environment,
    {locale: options.locale, region: options.region}
  );
  const result = await provider.answerWithSources({
    questionId: PROBE_QUESTION_ID,
    question: options.question,
    locale: options.locale,
    region: options.region,
    signal: dependencies.signal ?? AbortSignal.timeout(180_000)
  });
  return {
    profile: staging.profile,
    providerId: provider.providerId,
    model: provider.model,
    searchMode: provider.searchMode,
    answerNonblank: result.answerText.trim().length > 0,
    sourceCount: result.sources.length,
    sourceDomains: result.sources.map(({registrableDomain}) => registrableDomain),
    refusalCode: result.refusal?.code ?? null
  };
}

export function formatGenerativeAnswerProbeSummary(summary: GenerativeAnswerProbeSummary): string {
  return JSON.stringify({
    profile: summary.profile,
    providerId: summary.providerId,
    model: summary.model,
    searchMode: summary.searchMode,
    answerNonblank: summary.answerNonblank,
    sourceCount: summary.sourceCount,
    sourceDomains: summary.sourceDomains,
    refusalCode: summary.refusalCode
  });
}

function pairs(args: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Probe arguments must be --name value pairs.");
    }
    const name = flag.slice(2);
    if (values.has(name)) throw new Error(`Duplicate probe argument: ${flag}`);
    values.set(name, value);
  }
  if (values.size !== 3 || [...values.keys()].some((name) => !["question", "locale", "region"].includes(name))) {
    throw new Error("Only --question, --locale, and --region are accepted.");
  }
  return values;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  runGenerativeAnswerProbeCommand(process.argv.slice(2))
    .then((summary) => process.stdout.write(`${formatGenerativeAnswerProbeSummary(summary)}\n`))
    .catch(() => {
      process.stderr.write('{"error":"generative_answer_staging_probe_failed"}\n');
      process.exitCode = 1;
    })
    .finally(closeDatabase);
}
